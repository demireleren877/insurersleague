import test from 'node:test';
import assert from 'node:assert/strict';
import { CASCO_MARKET } from '../dist/data/casco-market.js';
import { simulateCasco, defaultCascoStrategy, defaultCascoRules, validateCasco, actuarialCoefficients, actuarialBase, cascoMoney, cascoAssumptions, cellRisk, DIMENSIONS } from '../dist/casco.js';

const rules = defaultCascoRules();
const config = (seed = 1) => ({ lang: 'en', seed, weights: [60, 40], events: [], rules, assumptions: cascoAssumptions('en', rules) });
const act = actuarialCoefficients(rules);
const flat = Object.fromEntries(DIMENSIONS.map(d => [d, act[d].map(() => 1)]));
const team = (id, coef, lossRatio, extra = {}) => ({ id, name: `T${id}`, strategy: { ...defaultCascoStrategy(config()), coef, basePremium: actuarialBase(coef, lossRatio, rules), ...extra } });
const field = (subject, seed) => simulateCasco([subject, ...[1, 2, 3, 4, 5].map(i => team(i, act, [0.58, 0.62, 0.66, 0.6, 0.64][i - 1]))], config(seed))[11].rows;
const mean = (seeds, f) => seeds.reduce((a, s) => a + f(s), 0) / seeds.length;
const seeds = Array.from({ length: 12 }, (_, i) => i + 1);

test('the market profile keeps every customer of the case-study data', () => {
  assert.equal(CASCO_MARKET.cells.reduce((a, c) => a + c[5], 0), CASCO_MARKET.customers);
  assert.deepEqual(Object.keys(CASCO_MARKET.dimensions), DIMENSIONS);
  assert.deepEqual(DIMENSIONS.map(d => CASCO_MARKET.dimensions[d].length), [6, 4, 3, 4, 2]);
});

test('claims follow the model config: base frequency × severity × level coefficients, normalized as in the data', () => {
  const cell = CASCO_MARKET.cells[0];
  const d = rules.dimensions;
  const freq = DIMENSIONS.reduce((p, dim, k) => p * d[dim][cell[k]].freq, rules.model.frequency * rules.model.freqNorm);
  const sev = DIMENSIONS.reduce((p, dim, k) => p * d[dim][cell[k]].sev, rules.model.severity * rules.model.sevNorm);
  const r = cellRisk(cell, rules);
  assert.ok(Math.abs(r.freq - freq) < 1e-12 && Math.abs(r.sev - sev) < 1e-9);
});

test('the same decisions and seed reproduce the season exactly', () => {
  const a = field(team(0, act, 0.6), 3), b = field(team(0, act, 0.6), 3);
  assert.deepEqual(a, b);
});

test('validation catches out-of-range coefficients, gift weights off 100 and an overspent budget', () => {
  const money = cascoMoney(config());
  const ok = team(0, act, 0.6);
  assert.deepEqual(validateCasco(ok, config()), []);
  const bad = structuredClone(ok);
  bad.strategy.coef.city[0] = 3;
  bad.strategy.offers = [50, 50, 50, 0];
  bad.strategy.marketing = money.budget * 2;
  assert.equal(validateCasco(bad, config()).length, 3);
});

test('pricing from the data beats ignoring it: flat coefficients attract the risky cells', () => {
  const smart = mean(seeds, s => field(team(0, act, 0.6), s).find(r => r.id === 0).rank);
  const naive = mean(seeds, s => field(team(0, flat, 0.6), s).find(r => r.id === 0).rank);
  const naiveLoss = mean(seeds, s => field(team(0, flat, 0.6), s).find(r => r.id === 0).expectedLossRatio);
  assert.ok(smart < naive, `smart ${smart} vs naive ${naive}`);
  assert.ok(naiveLoss > 0.75, `flat book should run hot, got ${naiveLoss}`);
});

test('cheaper prices buy market share at the cost of profit', () => {
  const cheap = seeds.map(s => field(team(0, act, 0.8), s).find(r => r.id === 0));
  const dear = seeds.map(s => field(team(0, act, 0.55), s).find(r => r.id === 0));
  const avg = (rows, k) => rows.reduce((a, r) => a + r[k], 0) / rows.length;
  assert.ok(avg(cheap, 'share') > avg(dear, 'share'));
  assert.ok(avg(cheap, 'profit') < avg(dear, 'profit'));
});

test('profit is premium minus claims minus expenses, and marketing is a cost', () => {
  const B = cascoMoney(config()).budget;
  const rows = field(team(0, act, 0.6), 3);
  for (const r of rows) assert.ok(Math.abs(r.profit - (r.gwp - r.claims - r.expenses)) < 1e-6);
  // The same plan with no marketing at all: fewer customers but no campaign bill.
  const spend = field(team(0, act, 0.6, { marketing: B }), 3).find(r => r.id === 0);
  const none = field(team(0, act, 0.6, { marketing: 0 }), 3).find(r => r.id === 0);
  assert.ok(spend.policies > none.policies, 'the campaign brings customers');
  assert.ok(spend.expenses - none.expenses > B * 0.99, 'and costs its budget');
});

test('the moderator sets the market size; every cell keeps its sample share of it', () => {
  const small = { ...config(), assumptions: cascoAssumptions('en', rules, 100000) };
  const large = { ...config(), assumptions: cascoAssumptions('en', rules, 400000) };
  const rows = c => simulateCasco([0, 1].map(id => ({ id, name: `T${id}`, strategy: { ...defaultCascoStrategy(c), coef: act, basePremium: actuarialBase(act, 0.6 + id * 0.05, rules) } })), c)[11];
  const a = rows(small), b = rows(large);
  assert.ok(Math.abs(b.available / a.available - 4) < 0.05, `pool ratio ${b.available / a.available}`);
  assert.ok(Math.abs(cascoMoney(large).budget / cascoMoney(small).budget - 4) < 0.05);
});

test('luck is a table drawn from the seed alone: decisions never change it', async () => {
  const { drawsFor, claimDraw, normInv } = await import('../dist/casco.js');
  const a = drawsFor(config(4), [team(0, act, 0.6), team(1, act, 0.7)]);
  const b = drawsFor(config(4), [team(0, flat, 0.9), team(1, act, 0.5)]);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, drawsFor(config(5), [team(0, act, 0.6), team(1, act, 0.7)]));
  for (const u of [...a.market.flat(), ...Object.values(a.teams).flat(2)]) assert.ok(u > 0 && u < 1 && Math.abs(u * 1e10 - Math.round(u * 1e10)) < 1e-3, 'ten decimals, strictly inside (0, 1)');
  // The claim draw is exactly the published formula.
  const lambda = 312.4, s = 140, k = 2.2, u1 = 0.7310000005, u2 = 0.2000000005;
  const n = Math.max(0, Math.round(lambda + Math.sqrt(lambda) * normInv(u1)));
  assert.deepEqual(claimDraw(lambda, s, k, u1, u2), { count: n, amount: Math.max(0, n * s + s * Math.sqrt(n / k) * normInv(u2)) });
  assert.ok(Math.abs(normInv(0.975) - 1.959963984540054) < 1e-14);
});

test('rows carry the gross loss ratio the stage shows', () => {
  const c = config(7);
  const season = simulateCasco([0, 1, 2].map(id => team(id, act, 0.58 + id * 0.04)), c);
  for (const m of season) for (const r of m.rows) {
    assert.equal(r.nps, undefined, 'no satisfaction score any more');
    assert.ok(Math.abs(r.grossLossRatio - (r.gwp ? season.slice(0, season.indexOf(m) + 1).reduce((s, x) => s + x.rows.find(y => y.id === r.id).monthClaims, 0) / r.gwp : 0)) < 1e-9, 'gross loss ratio is cumulative claims / cumulative GWP');
  }
});

test('the live commentary follows the gross-premium race', async () => {
  const { monthDigest } = await import('../dist/js/narrative.js');
  const c = config(7), teams = [0, 1, 2].map(id => ({ id, name: `T${id}` }));
  const season = simulateCasco([0, 1, 2].map(id => team(id, act, 0.58 + id * 0.04)), c);
  const first = monthDigest(season, 0, teams, c);
  const leader = [...season[0].rows].sort((a, b) => b.gwp - a.gwp)[0];
  assert.deepEqual(first.ranked.map(r => r.id), [...season[0].rows].sort((a, b) => b.gwp - a.gwp).map(r => r.id));
  assert.ok(first.items.some(i => i.type === 'leader' && i.teams[0] === leader.id), 'January names the gross-premium leader');
  for (let m = 0; m < 12; m++) for (const item of monthDigest(season, m, teams, c).items) assert.ok(['good', 'bad', 'event', 'neutral'].includes(item.tone));
});

test('the model is calibrated to the data: portfolio frequency 10% and the data’s premium level', () => {
  let n = 0, claims = 0, freq = 0, gwp = 0;
  for (const cell of CASCO_MARKET.cells) { const r = cellRisk(cell, rules); n += cell[5]; freq += cell[5] * r.freq; claims += cell[5] * r.cost; gwp += cell[5] * r.reference; }
  assert.ok(Math.abs(freq / n - 0.1) < 0.002, `portfolio frequency ${freq / n}`);
  assert.ok(Math.abs(gwp / n - CASCO_MARKET.calibration.dataPremium) < 1, `reference premium ${gwp / n} vs data ${CASCO_MARKET.calibration.dataPremium}`);
  const lr = claims / gwp;
  assert.ok(lr > 0.55 && lr < 0.65, `market loss ratio ${lr}`);
});

test('coefficients go on a 0.05 grid and gift weights on steps of 5', () => {
  const c = config(), money = cascoMoney(c);
  const ok = team(0, act, 0.6);
  assert.deepEqual(validateCasco(ok, c), []);
  const off = structuredClone(ok); off.strategy.coef.city[0] = 1.03;
  assert.match(validateCasco(off, c).join(' '), /steps of 0.05/);
  const odd = structuredClone(ok); odd.strategy.offers = [52, 48, 0, 0];
  assert.match(validateCasco(odd, c).join(' '), /steps of 5/);
  const huge = structuredClone(ok); huge.strategy.basePremium = 5e7;
  assert.match(validateCasco(huge, c).join(' '), /at most 10,000,000/);
  assert.ok(money.budget > 0);
});

const withCampaign = (id, lr, camp) => { const t = team(id, act, lr); Object.assign(t.strategy, camp); return t; };
const at = (season, id, m = 0) => season[m].rows.find(r => r.id === id).campaign;

test('each gift wins at most what its slice of the gift budget pays for', () => {
  const c = config(4), money = cascoMoney(c);
  const season = simulateCasco([withCampaign(0, 0.6, { marketing: money.budget, mediaShare: 90, offers: [0, 0, 0, 100] }), withCampaign(1, 0.6, { marketing: 0 })], c);
  for (const month of season) {
    const k = month.rows.find(r => r.id === 0).campaign;
    assert.ok(k.customers * 85 <= k.giftBudget + 1e-6, `gifts ${k.customers * 85} ≤ budget ${k.giftBudget}`);
    assert.ok(k.wanted > k.customers, 'with 90% on media the gift budget binds');
    assert.deepEqual(k.gifts.slice(0, 3).map(g => g.customers), [0, 0, 0], 'a gift with no weight wins nobody');
    assert.equal(month.rows.find(r => r.id === 1).campaign.customers, 0, 'no marketing, no campaign customers');
  }
});

test('the gift weights split the reach and the gift budget', () => {
  const c = config(4), B = cascoMoney(c).budget;
  const mixed = simulateCasco([withCampaign(0, 0.6, { marketing: B, mediaShare: 40, offers: [0, 0, 50, 50] }), withCampaign(1, 0.6, {})], c);
  const k = at(mixed, 0);
  const [coffee, gym] = [k.gifts[2], k.gifts[3]];
  assert.ok(Math.abs(coffee.leads / gym.leads - (0.6 * 0.06) / (0.81 * 0.5)) < 1e-9, 'leads follow interest × click at equal weights');
  assert.ok(gym.customers <= k.giftBudget * 0.5 / 85 + 1e-6 && coffee.customers <= k.giftBudget * 0.5 / 15 + 1e-6);
  assert.ok(Math.abs(k.customers - coffee.customers - gym.customers) < 1e-9);
});

test('a cheaper price converts more campaign customers, and heavy media triggers the frequency bonus', () => {
  const c = config(4), B = cascoMoney(c).budget;
  const camp = { marketing: B * 0.4, mediaShare: 20, offers: [0, 100, 0, 0] };
  const cheap = simulateCasco([withCampaign(0, 0.75, camp), withCampaign(1, 0.6, {})], c);
  const dear = simulateCasco([withCampaign(0, 0.5, camp), withCampaign(1, 0.6, {})], c);
  assert.ok(at(cheap, 0).wanted > at(dear, 0).wanted, 'lower prices pull more of the reached people');
  const light = simulateCasco([withCampaign(0, 0.6, { marketing: B * 0.2, mediaShare: 5, offers: [0, 0, 100, 0] }), withCampaign(1, 0.6, { marketing: B * 0.2, mediaShare: 5, offers: [0, 0, 100, 0] })], c);
  const heavy = simulateCasco([withCampaign(0, 0.6, { marketing: B, mediaShare: 100, offers: [0, 0, 100, 0] }), withCampaign(1, 0.6, { marketing: B, mediaShare: 100, offers: [0, 0, 100, 0] })], c);
  assert.ok(at(light, 0).frequency <= 5 && at(heavy, 0).frequency > 5, `light ${at(light, 0).frequency} heavy ${at(heavy, 0).frequency}`);
});

test('a campaign change at a quarter review applies from the next month', () => {
  const c = config(4);
  const t0 = withCampaign(0, 0.6, { marketing: 0 });
  t0.strategyHistory = [{ effectiveMonth: 0, strategy: structuredClone(t0.strategy) }, { effectiveMonth: 3, strategy: { ...structuredClone(t0.strategy), marketing: cascoMoney(c).budget * 0.5, mediaShare: 25, offers: [0, 0, 100, 0] } }];
  const season = simulateCasco([t0, withCampaign(1, 0.6, {})], c);
  assert.equal(at(season, 0, 2).customers, 0);
  assert.ok(at(season, 0, 3).customers > 0);
  assert.ok(at(season, 0, 3).gifts[2].customers > 0 && at(season, 0, 3).gifts[0].customers === 0, 'the new gift does the work');
});

test('the marketing budget is one wallet: a quarter plan spends its amount over the months left', async () => {
  const { monthlyMarketing, marketingSpent } = await import('../dist/casco.js');
  const c = config(4), B = cascoMoney(c).budget;
  const t0 = withCampaign(0, 0.6, { marketing: 120000 });
  t0.strategyHistory = [{ effectiveMonth: 0, strategy: structuredClone(t0.strategy) }, { effectiveMonth: 6, strategy: { ...structuredClone(t0.strategy), marketing: 300000 } }];
  assert.equal(monthlyMarketing(t0, 2), 10000);
  assert.equal(monthlyMarketing(t0, 6), 50000);
  assert.equal(marketingSpent(t0, 6), 60000);
  assert.equal(marketingSpent(t0, 12), 360000);
  const season = simulateCasco([t0, withCampaign(1, 0.6, {})], c);
  const own = m => { const r = season[m].rows.find(x => x.id === 0); return r.expenses - r.acquisition; }; // fixed cost + marketing, cumulative
  assert.ok(Math.abs((own(6) - own(5)) - (own(5) - own(4)) - 40000) < 1, 'the monthly bill jumps by the new pace');
  const over = structuredClone(t0); over.strategyHistory[1].strategy.marketing = B - 50000;
  assert.throws(() => simulateCasco([over, withCampaign(1, 0.6, {})], c), /exceeds the marketing budget/);
});
