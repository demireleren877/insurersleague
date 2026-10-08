// Balance test: six casco approaches play many seasons against each other under one rule set.
// Each approach is a bot with a playbook and random variation; every season also changes the
// market's luck. If one approach wins far more than its fair share, the rules reward it.
import { simulate, rank, rulesOf, TEAM_META, cascoMoney, actuarialCoefficients, actuarialBase, DIMENSIONS, snapCoef } from '../engine.js';

export const APPROACHES = ['actuary', 'flat', 'volume', 'margin', 'digital', 'gifts'];
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

// How each approach plays: target loss ratio, marketing as a share of the marketing budget, the media
// share of it, gift weights (concert, restaurant, coffee, gym) and how it reads the data.
const PLAYBOOK = {
  actuary: { lr: [0.55, 0.66], marketing: [0.45, 0.55], media: [40, 60], offers: [40, 30, 20, 10], coef: 'actuarial' },
  flat:    { lr: [0.55, 0.68], marketing: [0.45, 0.55], media: [40, 60], offers: [100, 0, 0, 0], coef: 'flat' },
  volume:  { lr: [0.72, 0.85], marketing: [0.8, 0.95], media: [30, 50], offers: [25, 25, 25, 25], coef: 'actuarial' },
  margin:  { lr: [0.45, 0.55], marketing: [0.15, 0.3], media: [40, 60], offers: [0, 0, 0, 100], coef: 'actuarial' },
  digital: { lr: [0.58, 0.68], marketing: [0.7, 0.85], media: [15, 30], offers: [0, 20, 60, 20], coef: 'digital' },
  gifts:   { lr: [0.56, 0.64], marketing: [0.6, 0.75], media: [25, 40], offers: [10, 10, 0, 80], coef: 'actuarial' }
};

export function botStrategy(approach, config, rnd) {
  const p = PLAYBOOK[approach], R = rulesOf(config), money = cascoMoney(config);
  const act = actuarialCoefficients(R);
  const jitter = v => snapCoef(v * between(rnd, 0.95, 1.05), R);
  const coef = Object.fromEntries(DIMENSIONS.map(dim => [dim, act[dim].map(v => (p.coef === 'flat' ? jitter(1) : jitter(v)))]));
  if (p.coef === 'digital') coef.channel = coef.channel.map((v, i) => (i === 2 ? snapCoef(v * 0.9, R) : v));
  const marketing = Math.min(money.budget, Math.floor(money.budget * between(rnd, ...p.marketing) / 100) * 100);
  return {
    product: approach, sentence: approach, basePremium: actuarialBase(coef, between(rnd, ...p.lr), R),
    coef, marketing, mediaShare: Math.round(between(rnd, ...p.media) / 5) * 5, offers: [...p.offers]
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
