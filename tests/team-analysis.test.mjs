import test from 'node:test';
import assert from 'node:assert/strict';
import { freshSession, defaultStrategy, viewFor } from '../dist/js/game.js';
import { actuarialCoefficients, actuarialBase, rulesOf, simulate } from '../dist/engine.js';
import { buildTeamAnalysis } from '../dist/js/team-analysis.js';
import { attribution } from '../dist/js/attribution.js';
import { renderTeamAnalysis, TEAM_ANALYSIS_TABS } from '../dist/js/views/team-analysis.js';
import { setLang } from '../dist/js/i18n.js';

function fixture() {
  const state = freshSession(1_000, { code: '123456', lang: 'en' });
  const coef = actuarialCoefficients(rulesOf(state.config));
  state.teams = ['Atlas', 'Nova', 'Mavi'].map((name, id) => {
    const strategy = { ...defaultStrategy(name, state.config), sentence: `${name} plan.`, coef: structuredClone(coef),
      basePremium: actuarialBase(coef, 0.60 + id * 0.05), marketing: 40_000, marketing2: 50_000, mediaShare: 40, offers: [0, 100, 0, 0] };
    const revised = { ...structuredClone(strategy), basePremium: strategy.basePremium + 8, marketing: 90_000, marketing2: 180_000, offers: [0, 30, 70, 0] };
    return { id, name, owner: `player-${id}`, code: name.toUpperCase(), color: '#43C6FF', emblem: id, strategy: revised,
      strategyHistory: [{ effectiveMonth: 0, strategy: structuredClone(strategy) }, { effectiveMonth: 6, strategy: structuredClone(revised) }] };
  });
  state.phase = 'race'; state.playback = { base: 11, t0: 1_000, running: false };
  state.results = simulate(state.teams, state.config);
  return state;
}

const close = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} should equal ${expected}`);

test('team analysis reconciles the profit bridge, monthly amounts and actual policy mix', () => {
  const state = fixture(), before = JSON.stringify(state), a = buildTeamAnalysis(state, state.results, 0);
  const final = state.results[11].rows.find(row => row.id === 0);
  close(a.totals.gwp - a.totals.claims - a.totals.commission - a.totals.running - a.totals.marketing, final.profit);
  close(a.totals.margin + a.totals.combinedRatio, 1);
  for (const key of ['gwp', 'claims', 'expenses', 'commission', 'marketing', 'policies', 'profit', 'claimCount']) close(a.monthly.reduce((total, month) => total + month[key], 0), final[key]);
  close(a.totals.averagePremium, final.gwp / final.policies);
  close(a.expectedClaims + a.claimsDeviation, final.claims);
  for (const group of a.portfolio) {
    close(group.levels.reduce((total, level) => total + level.count, 0), final.policies);
    close(group.levels.reduce((total, level) => total + level.share, 0), 1);
    close(group.levels.reduce((total, level) => total + level.marketShare, 0), 1);
  }
  assert.equal(JSON.stringify(state), before, 'analysis must not edit the room or the season');
});

test('half-year and campaign analysis follows the plan that was active each month', () => {
  const state = fixture(), a = buildTeamAnalysis(state, state.results, 0), c = a.campaign;
  close(a.halves[0].campaign.allocated, 40_000);
  close(a.halves[1].campaign.allocated, 180_000);
  close(c.allocated, 220_000);
  close(c.media + c.giftsUsed, a.totals.marketing);
  close(c.spend + c.unspent, c.allocated);
  close(c.gifts.reduce((total, gift) => total + gift.spent, 0), c.giftsUsed);
  close(c.gifts.reduce((total, gift) => total + gift.customers, 0), c.customers);
  close(c.customers, state.results[11].rows.find(row => row.id === 0).campaign.total);
  close(c.costPerCustomer, c.spend / c.customers);
  assert.equal(a.halves[0].plan.basePremium + 8, a.halves[1].plan.basePremium);
  for (let half = 0; half < 2; half++) {
    const start = half * 6, end = start + 5;
    const marketGwp = state.results[end].rows.reduce((total, row) => total + row.gwp, 0) - (start ? state.results[start - 1].rows.reduce((total, row) => total + row.gwp, 0) : 0);
    close(a.halves[half].share, a.halves[half].gwp / marketGwp);
  }
});

test('decision contributions report exact euro and premium-share differences across both plans', () => {
  const state = fixture(), before = JSON.stringify(state), data = attribution(state.teams, state.config, 0);
  const alternative = structuredClone(state.teams), team = alternative[0], neutral = defaultStrategy(team.name, state.config);
  for (const strategy of [team.strategy, ...team.strategyHistory.map(entry => entry.strategy)]) strategy.basePremium = neutral.basePremium;
  const counter = simulate(alternative, state.config)[11].rows.find(row => row.id === 0), actual = state.results[11].rows.find(row => row.id === 0);
  const decision = data.decisions.find(entry => entry.key === 'basePremium');
  close(data.profit, actual.profit); close(data.share, actual.share);
  close(decision.profitDelta, actual.profit - counter.profit);
  close(decision.shareDelta, actual.share - counter.share);
  close(decision.counterProfit, counter.profit); close(decision.counterShare, counter.share);
  assert.equal(JSON.stringify(state), before);
});

test('hidden rival plans never enter counterfactual simulation and incomplete seasons do not open analysis', () => {
  const state = fixture();
  state.playback.base = 3;
  const player = viewFor(state, { role: 'player', playerId: 'player-0' }, 1_000);
  assert.equal(player.teams[1].strategy._hidden, true);
  assert.equal(attribution(player.teams, player.config, 0), null);
  assert.equal(buildTeamAnalysis(player, player.results, 0), null);
  assert.equal(buildTeamAnalysis(state, state.results, 999), null);
  const masked = structuredClone(state);
  masked.teams[0].strategy = { _hidden: true };
  masked.teams[0].strategyHistory = undefined;
  const a = buildTeamAnalysis(masked, masked.results, 0);
  assert.equal(a.planVisible, false); assert.equal(a.campaign.allocated, null);
  assert.equal(a.totals.profit, state.results[11].rows.find(row => row.id === 0).profit);
});

test('zero sales produce unavailable ratios, tied trophy places and valid markup', () => {
  const state = fixture();
  for (const month of state.results) for (const row of month.rows) {
    for (const key of ['gwp', 'claims', 'expenses', 'profit', 'policies', 'commission', 'marketing', 'claimCount', 'share', 'expectedLossRatio']) row[key] = 0;
    row.campaign = null; row.channels.fill(0); row.segments.fill(0);
  }
  const a = buildTeamAnalysis(state, state.results, 0);
  assert.equal(a.totals.averagePremium, null); assert.equal(a.totals.lossRatio, null); assert.equal(a.totals.margin, null);
  assert.deepEqual(a.ranks, { profit: 1, share: 1 });
  for (const tab of TEAM_ANALYSIS_TABS.filter(tab => tab !== 'effects')) assert.doesNotMatch(renderTeamAnalysis(state, state.results, 0, tab).body, /NaN|Infinity/);
});

test('all analysis sections render in both languages and escape team content', () => {
  const state = fixture(); state.teams[0].name = '<img src=x onerror=alert(1)>';
  state.teams[0].strategy.product = '<script>bad()</script>';
  for (const lang of ['en', 'tr']) {
    setLang(lang);
    for (const tab of TEAM_ANALYSIS_TABS) {
      const result = renderTeamAnalysis(state, state.results, 0, tab);
      assert.doesNotMatch(result.title + result.body, /<script>|<img|NaN|Infinity/);
      assert.match(result.title, /&lt;img/);
      assert.match(result.body, new RegExp(`aria-labelledby="ta-tab-${tab}"`));
    }
    assert.match(renderTeamAnalysis(state, state.results, 0, 'plan').body, lang === 'tr' ? /19 fiyatlama katsayısının tamamı/ : /All 19 pricing coefficients/);
  }
  setLang('en');
});
