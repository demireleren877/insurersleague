// Balance test: six casco approaches play many seasons against each other under one rule set.
// Each approach is a bot with a playbook and random variation; every season also changes the
// market's luck. If one approach wins far more than its fair share, the rules reward it.
import { simulate, rank, rulesOf, TEAM_META, cascoMoney, actuarialCoefficients, actuarialBase, DIMENSIONS, snapCoef } from '../engine.js';

export const APPROACHES = ['actuary', 'flat', 'volume', 'margin', 'digital', 'service'];
export const FAIR_SHARE = 1 / APPROACHES.length;
export const DOMINANT = 0.5; // wins at least half of all seasons
export const STRONG = 0.34;  // roughly twice its fair share

function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const between = (rnd, lo, hi) => lo + (hi - lo) * rnd();

// How each approach plays: target loss ratio, budget split (shares of the decision budget),
// marketing focus by channel (agency, bank, digital, broker) and how it reads the data.
const PLAYBOOK = {
  actuary: { lr: [0.55, 0.66], marketing: [0.45, 0.55], ops: [0.35, 0.45], focus: [45, 25, 15, 15], coef: 'actuarial' },
  flat:    { lr: [0.55, 0.68], marketing: [0.45, 0.55], ops: [0.35, 0.45], focus: [45, 25, 15, 15], coef: 'flat' },
  volume:  { lr: [0.72, 0.85], marketing: [0.6, 0.7], ops: [0.25, 0.32], focus: [50, 25, 15, 10], coef: 'actuarial' },
  margin:  { lr: [0.45, 0.55], marketing: [0.35, 0.45], ops: [0.35, 0.45], focus: [40, 30, 15, 15], coef: 'actuarial', reinsurance: true },
  digital: { lr: [0.58, 0.68], marketing: [0.5, 0.6], ops: [0.3, 0.4], focus: [10, 10, 70, 10], coef: 'digital' },
  service: { lr: [0.56, 0.64], marketing: [0.25, 0.35], ops: [0.55, 0.65], focus: [45, 25, 15, 15], coef: 'actuarial' }
};

export function botStrategy(approach, config, rnd) {
  const p = PLAYBOOK[approach], R = rulesOf(config), money = cascoMoney(config);
  const act = actuarialCoefficients(R);
  const jitter = v => snapCoef(v * between(rnd, 0.95, 1.05), R);
  const coef = Object.fromEntries(DIMENSIONS.map(dim => [dim, act[dim].map(v => (p.coef === 'flat' ? jitter(1) : jitter(v)))]));
  if (p.coef === 'digital') coef.channel = coef.channel.map((v, i) => (i === 2 ? snapCoef(v * 0.9, R) : v));
  const fee = p.reinsurance ? money.reinsuranceFee : 0;
  let marketing = Math.floor(money.budget * between(rnd, ...p.marketing) / 100) * 100;
  let claimsOps = Math.floor(money.budget * between(rnd, ...p.ops) / 100) * 100;
  const over = marketing + claimsOps + fee - money.budget;
  if (over > 0) marketing = Math.max(0, marketing - Math.ceil(over / 100) * 100);
  const raw = p.focus.map(v => Math.max(0, v + between(rnd, -5, 5)));
  const sum = raw.reduce((a, b) => a + b, 0);
  const focus = raw.map(v => Math.floor(v / sum * 100));
  const minFocus = R.marketing.minFocus ?? 0;
  for (let i = 0; i < focus.length; i++) focus[i] = Math.max(minFocus, focus[i]);
  focus[focus.indexOf(Math.max(...focus))] += 100 - focus.reduce((a, b) => a + b, 0);
  return {
    product: approach, sentence: approach, basePremium: actuarialBase(coef, between(rnd, ...p.lr), R),
    coef, marketing, channelFocus: focus, claimsOps, reinsurance: !!p.reinsurance
  };
}

// One season: all six approaches in the same market. Returns final rows ranked, with the approach id.
export function playSeason(config, seed) {
  const rnd = random(seed);
  const list = APPROACHES.map((approach, i) => ({
    id: i, name: approach, code: approach.slice(0, 3).toUpperCase(), color: TEAM_META[i].color, emblem: i,
    strategy: botStrategy(approach, config, rnd)
  }));
  const months = simulate(list, { ...config, seed });
  return rank(months[11].rows).map(r => ({ ...r, profile: APPROACHES[r.id] }));
}

export const emptyTally = () => Object.fromEntries(APPROACHES.map(p => [p, { wins: 0, podiums: 0, rankSum: 0, scoreSum: 0, breaches: 0 }]));

export function tallySeason(tally, rows) {
  const winner = rows.find(r => r.eligible && r.rank === 1);
  for (const r of rows) {
    const x = tally[r.profile];
    if (winner && r.id === winner.id) x.wins++;
    if (r.eligible && r.rank <= 3) x.podiums++;
    x.rankSum += r.rank; x.scoreSum += r.score;
    if (!r.eligible) x.breaches++;
  }
}

// Win rates, average rank and a verdict from a finished tally.
export function summarize(tally, seasons) {
  const rows = APPROACHES.map(p => {
    const x = tally[p];
    return { profile: p, winRate: x.wins / seasons, podiumRate: x.podiums / seasons, avgRank: x.rankSum / seasons, avgScore: x.scoreSum / seasons, breachRate: x.breaches / seasons };
  }).sort((a, b) => b.winRate - a.winRate || a.avgRank - b.avgRank);
  const top = rows[0], winners = rows.filter(r => r.winRate > 0).length;
  const verdict = top.winRate >= DOMINANT ? 'dominant' : top.winRate >= STRONG || winners < 3 ? 'watch' : 'fair';
  return { seasons, rows, verdict, top: top.profile, winners };
}

export function runBalance(config, { seasons = 200, seed = 1 } = {}) {
  const tally = emptyTally();
  for (let i = 0; i < seasons; i++) tallySeason(tally, playSeason(config, seed * 7919 + i));
  return summarize(tally, seasons);
}
