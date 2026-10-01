import test from 'node:test';
import assert from 'node:assert/strict';
import { buildJevRequest, buildJevQuizRequest, quizChoicesFromJev, nextAiIdentity, strategyFromJev, JEV_MODEL } from '../dist/js/jev.js';
import { freshSession, reduce, defaultStrategy } from '../dist/js/game.js';
import { cascoMoney, validate } from '../dist/engine.js';
import { questionById } from '../dist/js/quiz.js';

const host = now => ({ role: 'host', now });
const answer = (choice, confidence = .91) => ({ type: 'choice', choice, confidence });

test('Jev request exposes only typed, finite strategy decisions and requests private routing', () => {
  const session = freshSession(1_000, { code: '123456', lang: 'tr' });
  const identity = nextAiIdentity(session);
  const { body } = buildJevRequest(session, identity.profile);

  assert.equal(body.model, JEV_MODEL);
  assert.deepEqual(body.provider, { zdr: true, data_collection: 'deny' });
  assert.equal(body.state.market.line, 'Kasko');
  assert.equal(body.questions.loss_ratio.type, 'choice');
  assert.ok(Object.keys(body.questions.loss_ratio.criteria).length >= 3);
  assert.equal(body.state.segments.city.length, 6, 'Jev sees the same segment tables the teams get');
  assert.ok(Object.values(body.questions).every(question => question.type === 'choice'));
});

const ANSWERS = { pricing_view: answer('v0'), loss_ratio: answer('l2'), allocation: answer('a0'), channel_focus: answer('f4'), reinsurance: answer('no') };

test('Jev choices become a legal strategy and an AI team can complete a season', () => {
  const session = freshSession(1_000, { code: '123456', lang: 'en' });
  reduce(session, { type: 'excel-import-teams', teams: [{ name: 'Human', strategy: { ...defaultStrategy('Human', session.config), sentence: 'Plan.' } }] }, host(1_000));
  const identity = nextAiIdentity(session);
  const { context } = buildJevRequest(session, identity.profile);
  const decision = strategyFromJev(session, identity.profile, { ...ANSWERS, reinsurance: answer('yes') }, context);

  assert.deepEqual(validate({ name: 'Jev', strategy: decision.strategy }, session.config), []);
  assert.equal(decision.strategy.channelFocus.reduce((sum, value) => sum + value, 0), 100);
  assert.ok(decision.strategy.marketing + decision.strategy.claimsOps <= cascoMoney(session.config).budget);
  assert.ok(decision.confidence > .9);
  assert.deepEqual(decision.strategy.channelFocus, [55, 20, 10, 15], 'the challenger keeps its agency-led identity');

  const created = reduce(session, {
    type: 'ai-team-create', name: identity.name, emblem: identity.emblem, strategy: decision.strategy,
    model: JEV_MODEL, profile: identity.profile.id, confidence: decision.confidence
  }, { role: 'system', now: 1_001 });
  assert.ok(created.changed, created.error);
  const ai = session.teams.find(team => team.ai);
  assert.equal(ai.locked, true);
  assert.equal(ai.ai.model, JEV_MODEL);

  reduce(session, { type: 'phase', to: 'briefing' }, host(1_002));
  reduce(session, { type: 'phase', to: 'decisions' }, host(1_003));
  const raced = reduce(session, { type: 'start-race' }, host(1_004));
  assert.ok(raced.changed, raced.error);
  assert.equal(session.results.length, 12);
});

test('AI profiles keep distinct strategic signatures even when Jev returns identical choices', () => {
  const session = freshSession(1_000, { code: '123456', lang: 'tr' });
  const strategies = [];
  for (let i = 0; i < 6; i++) {
    const identity = nextAiIdentity(session);
    const { context } = buildJevRequest(session, identity.profile);
    const decision = strategyFromJev(session, identity.profile, ANSWERS, context);
    strategies.push(decision.strategy);
    reduce(session, { type: 'ai-team-create', name: identity.name, emblem: identity.emblem, strategy: decision.strategy, profile: identity.profile.id }, { role: 'system', now: 1_001 + i });
  }
  const signatures = strategies.map(strategy => JSON.stringify([strategy.basePremium, strategy.coef, strategy.marketing, strategy.claimsOps, strategy.channelFocus, strategy.reinsurance]));
  assert.equal(new Set(signatures).size, 6, 'all six bot archetypes remain strategically distinct');
});

test('clients cannot forge a Jev-created team', () => {
  const session = freshSession(1_000, { code: '123456' });
  assert.match(reduce(session, { type: 'ai-team-create', name: 'Forged', strategy: {} }, host(1_001)).error, /game server/i);
  assert.equal(session.teams.length, 0);
  assert.deepEqual(reduce(session, { type: 'add-ai-team' }, host(1_002)), { changed: false });
});

test('Jev quiz request lets each AI answer independently without revealing the correct option', () => {
  const session = freshSession(1_000, { code: '123456', lang: 'tr' });
  for (let i = 0; i < 2; i++) {
    const identity = nextAiIdentity(session);
    const { context } = buildJevRequest(session, identity.profile);
    const decision = strategyFromJev(session, identity.profile, ANSWERS, context);
    reduce(session, { type: 'ai-team-create', name: identity.name, emblem: identity.emblem, strategy: decision.strategy, profile: identity.profile.id }, { role: 'system', now: 1_001 + i });
  }
  const question = questionById(session.quiz.questions[0].id, 'tr');
  const round = { month: 2, qid: question.id };
  const { body, teamIds } = buildJevQuizRequest(session, round, question);
  assert.equal(Object.keys(body.questions).length, 2);
  assert.equal(JSON.stringify(body).includes(`"correct":${question.correct}`), false);
  const parsed = quizChoicesFromJev({ [`team_${teamIds[0]}`]: answer('o2'), [`team_${teamIds[1]}`]: answer('o0') }, teamIds);
  assert.equal(parsed[teamIds[0]], 2);
  assert.equal(parsed[teamIds[1]], 0);
});
