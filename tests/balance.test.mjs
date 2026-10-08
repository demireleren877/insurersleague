import test from 'node:test';
import assert from 'node:assert/strict';
import { scenario, validate, simulate, actuarialCoefficients, actuarialBase, rulesOf, DIMENSIONS } from '../dist/engine.js';
import { APPROACHES, botStrategy, playSeason, runBalance, summarize, emptyTally, FAIR_SHARE } from '../dist/js/balance.js';
import { freshSession, defaultStrategy } from '../dist/js/game.js';
import { buildSummary, sessionId } from '../dist/js/history.js';
import { archetypeKey } from '../dist/js/narrative.js';

test('balance bots always submit legal decisions', () => {
  for (const lang of ['en', 'tr']) {
    const config = scenario(lang);
    let seed = 1;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 40; i++) for (const approach of APPROACHES) {
      const strategy = botStrategy(approach, config, rnd);
      assert.deepEqual(validate({ name: approach, strategy }, config), [], approach);
    }
  }
});

test('the balance test is deterministic and counts at most one winner per season', () => {
  const config = scenario('tr');
  const a = runBalance(config, { seasons: 20 }), b = runBalance(config, { seasons: 20 });
  assert.deepEqual(a, b);
  const wins = a.rows.reduce((sum, r) => sum + r.winRate * 20, 0);
  assert.ok(Math.round(wins) <= 20);
  assert.equal(a.rows.length, APPROACHES.length);
  assert.equal(playSeason(config, 5).length, APPROACHES.length);
});

test('reading the data beats ignoring it over many seasons', () => {
  const r = runBalance(scenario('en'), { seasons: 30 });
  const rate = id => r.rows.find(x => x.profile === id);
  assert.ok(rate('actuary').avgRank < rate('flat').avgRank);
});

test('the verdict flags an approach that wins most seasons', () => {
  const tally = emptyTally();
  tally.margin.wins = 70; tally.actuary.wins = 20; tally.gifts.wins = 10;
  for (const x of Object.values(tally)) x.rankSum = 350;
  assert.equal(summarize(tally, 100).verdict, 'dominant');
  const even = emptyTally();
  APPROACHES.forEach((p, i) => { even[p].wins = [20, 18, 17, 16, 15, 14][i]; even[p].rankSum = 350; });
  const fair = summarize(even, 100);
  assert.equal(fair.verdict, 'fair');
  assert.ok(fair.rows[0].winRate < FAIR_SHARE * 2);
});

test('a plan’s approach is read from its decisions', () => {
  const config = scenario('en'), R = rulesOf(config), act = actuarialCoefficients(R);
  const flat = Object.fromEntries(DIMENSIONS.map(d => [d, act[d].map(() => 1)]));
  const base = defaultStrategy('X', config);
  assert.equal(archetypeKey({ ...base, coef: flat, basePremium: actuarialBase(flat, 0.62) }, config), 'flat');
  assert.equal(archetypeKey({ ...base, coef: act, basePremium: actuarialBase(act, 0.62) }, config), 'actuary');
  assert.equal(archetypeKey({ ...base, coef: act, basePremium: actuarialBase(act, 0.8) }, config), 'volume');
  assert.equal(archetypeKey({ ...base, coef: act, basePremium: actuarialBase(act, 0.5) }, config), 'margin');
});

test('a finished season becomes a compact history record with stable approach keys', () => {
  const s = freshSession(1_000, { code: '654321', lang: 'en' });
  for (const [i, name] of ['Eagle', 'Falcon', 'Heron'].entries()) {
    const strategy = { ...defaultStrategy(name, s.config), sentence: 'A plan.' };
    s.teams.push({ id: i, name, code: name.slice(0, 3).toUpperCase(), color: '#43C6FF', emblem: i, locked: true, strategy,
      strategyHistory: [{ effectiveMonth: 0, strategy: structuredClone(strategy), decidedAt: 5_000 + i }] });
  }
  s.teams[1].strategy.basePremium *= 1.4;
  s.teams[1].strategyHistory[0].strategy = structuredClone(s.teams[1].strategy);
  const months = simulate(s.teams, s.config);
  const record = buildSummary(s, months, 'Sales team');
  assert.equal(record.id, '654321-5000');
  assert.equal(sessionId(s), record.id);
  assert.equal(record.at, 5_000);
  assert.equal(record.preset, 'casco');
  assert.equal(record.label, 'Sales team');
  assert.equal(record.teams.length, 3);
  assert.deepEqual(record.teams.map(r => r.rank), [...record.teams.map(r => r.rank)].sort((a, b) => a - b));
  assert.equal(record.teams.find(r => r.name === 'Falcon').style, archetypeKey(s.teams[1].strategy, s.config));
  assert.ok(JSON.stringify(record).length < 64 * 1024);
});
