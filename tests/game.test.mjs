import test from 'node:test';
import assert from 'node:assert/strict';
import { freshSession, reduce, playhead, viewFor, currentStrategyReview, FINAL_DELAY_MS, defaultStrategy } from '../dist/js/game.js';
import { simulate, cascoMoney, actuarialCoefficients, actuarialBase, rulesOf } from '../dist/engine.js';

const host = now => ({ role: 'host', now });
const player = (playerId, now) => ({ role: 'player', playerId, now });
const tick = (s, now) => reduce(s, { type: 'tick' }, { role: 'system', now });

// A room with teams handed in through Excel, each with a slightly different price level.
function roomWith(names, now = 1_000, lang = 'en') {
  const s = freshSession(now, { code: '123456', lang });
  const act = actuarialCoefficients(rulesOf(s.config));
  const teams = names.map((name, i) => ({ name, strategy: { ...defaultStrategy(name, s.config), sentence: `${name} plan.`, coef: act, basePremium: actuarialBase(act, 0.58 + i * 0.04) } }));
  assert.ok(reduce(s, { type: 'excel-import-teams', teams }, host(now)).changed);
  return s;
}
function toRace(s, now) {
  reduce(s, { type: 'phase', to: 'briefing' }, host(now));
  reduce(s, { type: 'phase', to: 'decisions' }, host(now));
  return reduce(s, { type: 'start-race' }, host(now));
}

test('the game runs from the moderator screen: teams arrive by Excel, devices cannot join', () => {
  const s = freshSession(1_000, { code: '123456' });
  assert.equal(s.inputMode, 'excel');
  assert.equal(s.config.preset, 'casco');
  assert.equal(s.quiz.mode, 'off', 'teams without devices get no quiz');
  const teams = ['Atlas', 'Nova'].map(name => ({ name, strategy: { ...defaultStrategy(name, s.config), sentence: `${name} plan.` } }));

  assert.match(reduce(s, { type: 'excel-import-teams', teams }, player('device', 1_001)).error, /moderator/);
  assert.ok(reduce(s, { type: 'excel-import-teams', teams }, host(1_002)).changed);
  assert.equal(s.teams.length, 2);
  assert.ok(s.teams.every(team => team.excel && team.locked && team.owner === null));
  assert.match(reduce(s, { type: 'create-team', name: 'Late team', emblem: 0 }, player('device', 1_003)).error, /moderator/);

  assert.ok(reduce(s, { type: 'phase', to: 'briefing' }, host(1_004)).changed);
  assert.ok(reduce(s, { type: 'phase', to: 'decisions' }, host(1_005)).changed);
  assert.equal(s.deadline, null, 'no device timer in a moderator-only game');
  assert.ok(reduce(s, { type: 'start-race' }, host(1_006)).changed);
  assert.equal(s.results.length, 12);
});

test('a roster upload is all or nothing: one bad team leaves no partial roster', () => {
  const s = freshSession(1_000);
  const good = { ...defaultStrategy('Atlas', s.config), sentence: 'Atlas plan.' };
  const bad = structuredClone(good);
  bad.coef.city[0] = 3;
  const result = reduce(s, { type: 'excel-import-teams', teams: [{ name: 'Atlas', strategy: good }, { name: 'Nova', strategy: bad }] }, host(1_001));
  assert.match(result.error, /coefficient/i);
  assert.equal(s.teams.length, 0);
  assert.match(reduce(s, { type: 'excel-import-teams', teams: [{ name: 'Atlas', strategy: { ...good, basePremium: 'abc' } }] }, host(1_002)).error, /missing or not a number/);
});

test('re-importing a team name updates that team instead of adding a copy', () => {
  const s = roomWith(['Atlas', 'Nova']);
  const again = { ...structuredClone(s.teams[0].strategy), basePremium: 30 };
  assert.ok(reduce(s, { type: 'excel-import-teams', teams: [{ name: 'atlas', strategy: again }] }, host(2_000)).changed);
  assert.equal(s.teams.length, 2);
  assert.equal(s.teams[0].strategy.basePremium, 30);
});

test('quarter uploads move only the quarter levers and never rewrite finished months', () => {
  let now = 10_000;
  const s = roomWith(['Atlas', 'Nova'], now);
  toRace(s, ++now);
  now = s.playback.t0 + s.config.speed * 1000 * 4 + 50;
  assert.ok(tick(s, now).changed);
  const review = currentStrategyReview(s);
  assert.equal(review.month, 2);
  const past = structuredClone(s.results.slice(0, 3));
  const team = s.teams[0], before = structuredClone(team.strategy);
  assert.deepEqual(review.initialStrategies[team.id], before, 'the review keeps its opening strategy as the import baseline');

  const broken = { ...structuredClone(before), coef: { ...before.coef, vehicle: [0.1, 1, 1] } };
  assert.match(reduce(s, { type: 'excel-quarter-submit', teams: [{ name: team.name, strategy: broken }] }, host(now + 50)).error, /coefficient/i);
  assert.equal(team.strategy.basePremium, before.basePremium, 'a rejected upload leaves the strategy untouched');

  const uploaded = { ...structuredClone(before), product: 'Not a quarter lever', basePremium: before.basePremium + 2, reinsurance: !before.reinsurance, channelFocus: [70, 10, 10, 10] };
  assert.ok(reduce(s, { type: 'excel-quarter-submit', teams: [{ name: team.name, strategy: uploaded }] }, host(now + 100)).changed);
  assert.equal(team.strategy.basePremium, before.basePremium + 2);
  assert.deepEqual(team.strategy.channelFocus, [70, 10, 10, 10]);
  assert.equal(team.strategy.product, before.product);
  assert.equal(team.strategy.reinsurance, before.reinsurance, 'the treaty is bought for the whole year');
  assert.equal(team.strategyHistory.at(-1).effectiveMonth, 3);
  assert.equal('initialStrategies' in currentStrategyReview(viewFor(s, { role: 'stage' }, now)), false, 'the stage never sees the private baseline');
  assert.deepEqual(s.results.slice(0, 3), past);

  assert.ok(reduce(s, { type: 'quarter-close' }, host(now + 200)).changed);
  assert.equal(currentStrategyReview(s), null);
});

test('start-race repairs a broken plan so the session never blocks', () => {
  const s = roomWith(['Atlas', 'Nova']);
  s.teams[0].strategy.channelFocus = [50, 50, 50, 50];
  s.teams[1].strategy.marketing = cascoMoney(s.config).budget * 3;
  assert.ok(toRace(s, 2_000).changed);
  assert.deepEqual(s.teams[0].strategy.channelFocus, [25, 25, 25, 25]);
  assert.ok(s.teams[1].strategy.marketing + s.teams[1].strategy.claimsOps <= cascoMoney(s.config).budget);
  assert.equal(s.notice.kind, 'auto-locked');
  assert.equal(s.results.length, 12);
});

test('the final opens automatically after the last month', () => {
  let now = 1_000;
  const s = roomWith(['Team A', 'Team B']);
  toRace(s, now);
  s.strategyReviews.rounds = [2, 5, 8].map(month => ({ month, submitted: {}, closedAt: now }));
  const step = s.config.speed * 1000;
  now = s.playback.t0 + step * 13 + FINAL_DELAY_MS + 50;
  assert.equal(playhead(s, now).month, 11);
  assert.ok(tick(s, now).changed);
  assert.equal(s.stageLayer, 'final');
});

test('the projected stage never receives decisions or future months', () => {
  let now = 5_000;
  const s = roomWith(['Nora', 'Kai', 'Sam']);
  toRace(s, now);
  now = s.playback.t0 + s.config.speed * 1000 * 2 + 10;
  const v = viewFor(s, { role: 'stage' }, now);
  assert.equal(v.results.length, 2);
  assert.equal(v.teams[1].strategy.basePremium, undefined);
  assert.equal(v.teams[1].strategy.coef, undefined);
  assert.equal(viewFor(s, { role: 'host' }, now).results.length, 12);
});

test('a new game keeps the Excel teams and their plans, and clears the results', () => {
  const s = roomWith(['Atlas', 'Compass']);
  const plan = structuredClone(s.teams[0].strategy);
  toRace(s, 1);
  reduce(s, { type: 'new-game' }, host(2));
  assert.equal(s.teams.length, 2);
  assert.equal(s.phase, 'lobby');
  assert.equal(s.results.length, 0);
  assert.equal(s.config.preset, 'casco');
  assert.deepEqual(s.teams[0].strategy, plan);
  assert.ok(s.teams.every(t => t.locked));
});

test('rule studio: host edits validated rules that change the simulation; race locks them', () => {
  const s = roomWith(['Atlas', 'Compass']);
  const gwp = () => simulate(s.teams, s.config)[11].rows.find(r => r.id === 0).gwp;
  const before = gwp();
  assert.match(reduce(s, { type: 'rule', path: 'behavior.2.price', value: 7 }, player('p0', 2)).error, /moderator/);
  assert.match(reduce(s, { type: 'rule', path: 'behavior.2.price', value: 99 }, host(2)).error, /between/);
  assert.match(reduce(s, { type: 'rule', path: 'coef.min', value: 2.5 }, host(2)).error, /between|below/);
  assert.match(reduce(s, { type: 'rule', path: 'dimensions.city.0.id', value: 'x' }, host(2)).error, /can’t be edited/);
  assert.ok(reduce(s, { type: 'rule', path: 'behavior.2.price', value: 7 }, host(3)).changed);
  assert.notEqual(gwp(), before);

  reduce(s, { type: 'rule', path: 'service.slope', value: 120 }, host(4));
  reduce(s, { type: 'assumption', key: 'budget', value: 99_000 }, host(4));
  assert.ok(reduce(s, { type: 'rules-reset', keys: ['behavior'] }, host(5)).changed);
  assert.equal(s.config.rules.behavior[2].price, 4.2);
  assert.equal(s.config.rules.service.slope, 120);
  assert.ok(reduce(s, { type: 'rules-reset', keys: [], market: true }, host(5)).changed);
  assert.equal(s.config.assumptions.budget.value, freshSession(0).config.assumptions.budget.value);

  reduce(s, { type: 'weight', index: 0, value: 70 }, host(6));
  assert.match(toRace(s, 7).error, /Scoring/);
  assert.ok(reduce(s, { type: 'weights-normalize' }, host(8)).changed);
  assert.ok(reduce(s, { type: 'start-race' }, host(9)).changed);
  assert.match(reduce(s, { type: 'rule', path: 'service.slope', value: 60 }, host(10)).error, /race/);
});

test('a bigger market scales every money figure and the teams’ budgets with it', () => {
  const s = roomWith(['Atlas', 'Nova']);
  const budget = s.config.assumptions.budget.value, marketing = s.teams[0].strategy.marketing;
  assert.ok(reduce(s, { type: 'assumption', key: 'policies', value: s.config.assumptions.policies.value * 2 }, host(2)).changed);
  assert.ok(Math.abs(s.config.assumptions.budget.value / budget - 2) < 0.02);
  assert.ok(Math.abs(s.teams[0].strategy.marketing / marketing - 2) < 0.02);
  assert.ok(toRace(s, 3).changed, 'scaled plans stay within the scaled budget');
});

test('messages answer in the acting device’s language, room content keeps the room’s', () => {
  const s = freshSession(0, { code: '123456', lang: 'tr' });
  assert.match(reduce(structuredClone(s), { type: 'start-race' }, { role: 'player', now: 0, lang: 'en' }).error, /moderator/);
  assert.match(reduce(structuredClone(s), { type: 'start-race' }, { role: 'player', now: 0, lang: 'tr' }).error, /moderatör/);
  assert.match(reduce(structuredClone(s), { type: 'start-race' }, { role: 'player', now: 0 }).error, /moderatör/, 'without a device language the room language is used');
  const h = structuredClone(s);
  reduce(h, { type: 'event-add' }, { role: 'host', now: 0, lang: 'en' });
  assert.equal(h.config.events.at(-1).title, 'Yeni piyasa olayı', 'a new event is room content, written in the room language');
});

test('switching the room language translates untouched content and keeps edited text', () => {
  const s = freshSession(0, { lang: 'en' });
  s.config.events[1].description = 'Our own note';
  assert.ok(reduce(s, { type: 'config', key: 'lang', value: 'tr' }, host(1)).changed);
  assert.equal(s.config.lang, 'tr');
  assert.equal(s.config.events[0].title, 'Yedek parça fiyatları sıçradı');
  assert.equal(s.config.events[1].description, 'Our own note');
  assert.equal(s.config.branch, 'Kasko');
});

test('lobby teams are added by name and each takes its own plan', () => {
  const s = freshSession(1_000, { code: '123456', lang: 'tr' });
  assert.ok(reduce(s, { type: 'excel-add-team', name: 'Kartal' }, host(1_001)).changed);
  assert.ok(reduce(s, { type: 'excel-add-team', name: 'Mavi Dalga' }, host(1_002)).changed);
  assert.match(reduce(s, { type: 'excel-add-team', name: 'kartal' }, host(1_003)).error, /alınmış/);
  assert.match(reduce(s, { type: 'excel-add-team', name: 'X' }, host(1_003)).error, /2 karakter/);
  assert.match(reduce(s, { type: 'excel-add-team', name: 'Zirve' }, player('device', 1_003)).error, /moderatör/);
  assert.ok(s.teams.every(team => team.excel && !team.locked), 'a new team waits for its workbook');
  assert.notEqual(s.teams[0].emblem, s.teams[1].emblem);

  const plan = { ...structuredClone(s.teams[0].strategy), basePremium: 27, sentence: 'Plan.' };
  assert.ok(reduce(s, { type: 'excel-team-plan', teamId: s.teams[0].id, strategy: plan }, host(1_004)).changed);
  assert.equal(s.teams[0].strategy.basePremium, 27);
  assert.equal(s.teams[0].locked, true);
  assert.equal(s.teams[1].locked, false, 'only the uploaded team changes');
  const bad = { ...plan, coef: { ...plan.coef, city: [9, 1, 1, 1, 1, 1] } };
  assert.match(reduce(s, { type: 'excel-team-plan', teamId: s.teams[0].id, strategy: bad }, host(1_005)).error, /katsayısı/);
  assert.equal(s.teams[0].strategy.basePremium, 27);

  toRace(s, 2_000);
  assert.equal(s.results.length, 12, 'a team without a file races with the default plan');
  assert.match(reduce(s, { type: 'excel-team-plan', teamId: s.teams[0].id, strategy: plan }, host(2_001)).error, /çeyrek molasında/);
});

test('at a quarter review a team’s own file moves only its quarter levers', () => {
  let now = 10_000;
  const s = roomWith(['Atlas', 'Nova'], now);
  toRace(s, ++now);
  now = s.playback.t0 + s.config.speed * 1000 * 4 + 50;
  tick(s, now);
  const review = currentStrategyReview(s), team = s.teams[1], before = structuredClone(team.strategy);
  const file = { ...structuredClone(before), basePremium: before.basePremium * 1.1, reinsurance: !before.reinsurance };
  assert.ok(reduce(s, { type: 'excel-team-plan', teamId: team.id, strategy: file }, host(now + 10)).changed);
  assert.equal(team.strategy.basePremium, before.basePremium * 1.1);
  assert.equal(team.strategy.reinsurance, before.reinsurance);
  assert.equal(review.submitted[team.id], true);
  assert.equal(review.submitted[s.teams[0].id], undefined);
});

test('a team joins from its own device and hands in only its own workbook', () => {
  const s = freshSession(1_000, { code: '123456', lang: 'en' });
  assert.ok(reduce(s, { type: 'excel-add-team', name: 'Falcon' }, host(1_001)).changed);
  // Claims the card the moderator made under the same name.
  assert.ok(reduce(s, { type: 'excel-join', name: 'falcon' }, player('aaa', 1_002)).changed);
  assert.equal(s.teams.length, 1);
  assert.equal(s.teams[0].owner, 'aaa');
  // A second device can't take a claimed name, but can open its own team.
  assert.match(reduce(s, { type: 'excel-join', name: 'Falcon' }, player('bbb', 1_003)).error, /taken/);
  assert.ok(reduce(s, { type: 'excel-join', name: 'Nova' }, player('bbb', 1_004)).changed);
  const [falcon, nova] = s.teams;
  assert.ok(nova.excel && nova.owner === 'bbb' && !nova.locked);

  const plan = { ...defaultStrategy('Nova', s.config), sentence: 'Nova plan.' };
  assert.match(reduce(s, { type: 'excel-team-plan', teamId: falcon.id, strategy: plan }, player('bbb', 1_005)).error, /own workbook/);
  assert.ok(reduce(s, { type: 'excel-team-plan', teamId: nova.id, strategy: plan }, player('bbb', 1_006)).changed);
  assert.ok(nova.locked, 'the plan is received');
  // Others never see a rival's plan before the season ends.
  assert.equal(viewFor(s, { role: 'player', playerId: 'bbb' }, 1_007).teams.find(t => t.id === falcon.id).strategy._hidden, true);
  // Leaving releases the card to the moderator rather than deleting it.
  assert.ok(reduce(s, { type: 'leave-team' }, player('aaa', 1_008)).changed);
  assert.equal(s.teams.length, 2);
  assert.equal(falcon.owner, null);

  toRace(s, 2_000);
  assert.match(reduce(s, { type: 'excel-join', name: 'Late' }, player('ccc', 2_001)).error, /started/);
});
