// Why did I finish here? — decision and event attribution by counterfactual re-simulation.
//
// The engine is pure and seeded: the same teams + scenario always produce the same 12 months. So we
// can answer "what would have happened if…" exactly, instead of guessing. For one decision we re-run
// the whole season with only that field reset to the value every team started from, and read the
// focal team's final score. The difference IS that decision's contribution. Events work the same way:
// re-run the season with the event neutralised and see what the team loses or keeps.
//
// Deltas are model score only (the quiz bonus is unaffected by either), so they are directly
// comparable with the score on screen.
import { simulate, rank, DIMENSIONS, campaignOf } from '../engine.js';
import { defaultStrategy } from './game.js';

const NEUTRAL_EVENT = { cost: 1, demand: 1 };

const clone = teams => teams.map(t => ({ ...t, strategy: structuredClone(t.strategy), strategyHistory: t.strategyHistory ? structuredClone(t.strategyHistory) : undefined }));
const finalRow = (teams, config, teamId) => rank(simulate(teams, config)[11].rows).find(r => r.id === teamId);

// A decision is one lever of the plan: how to read it and how to put the default back.
const lever = (key, get, set) => ({ key, get, set });
const DECISIONS = [
  lever('basePremium', s => s.basePremium, (s, v) => { s.basePremium = v; }),
  ...DIMENSIONS.map(dim => lever(`coef.${dim}`, s => s.coef[dim], (s, v) => { s.coef = { ...s.coef, [dim]: structuredClone(v) }; })),
  lever('marketing', s => s.marketing, (s, v) => { s.marketing = v; }),
  lever('mediaShare', s => campaignOf(s).media, (s, v) => { s.mediaShare = v; }),
  lever('offers', s => campaignOf(s).weights, (s, v) => { s.offers = [...v]; delete s.offer; })
];

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Which score component moved most, and by how much. Lets the UI say what a decision actually
// changed — profit or market share — not just that it changed something.
function componentDelta(actual, counter, weights) {
  const parts = actual.components.map((v, i) => (v - counter.components[i]) * weights[i] / 100);
  let top = 0;
  parts.forEach((v, i) => { if (Math.abs(v) > Math.abs(parts[top])) top = i; });
  return { parts, top, topDelta: parts[top] };
}

// One call is ~17 full seasons. The answer only changes when the strategies, the rules or the
// calendar change — which, on the final screen, is never. Remember the last one per team so the
// panel costs nothing to re-render while ticks keep arriving.
const memo = new Map();
const memoKey = (teams, config, teamId) => JSON.stringify([teamId, teams.map(t => [t.id, t.strategy, t.strategyHistory]), config.rules, config.assumptions, config.weights, config.events, config.seed]);

export function attribution(teams, config, teamId) {
  const key = memoKey(teams, config, teamId);
  if (memo.has(key)) return memo.get(key);
  const value = compute(teams, config, teamId);
  if (memo.size > 24) memo.clear();
  memo.set(key, value);
  return value;
}

function compute(teams, config, teamId) {
  const team = teams.find(t => t.id === teamId);
  if (!team || teams.length < 2) return null;
  let actual;
  try { actual = finalRow(clone(teams), config, teamId); } catch { return null; }
  if (!actual) return null;
  const neutral = defaultStrategy(team.name, config);
  const weights = config.weights;

  const decisions = [];
  for (const d of DECISIONS) {
    const timeline = team.strategyHistory?.length ? team.strategyHistory.map(entry => entry.strategy) : [team.strategy];
    if (timeline.every(strategy => same(d.get(strategy), d.get(neutral)))) continue; // untouched: nothing to explain
    const what = clone(teams);
    const mine = what.find(t => t.id === teamId);
    const snapshots = [...(mine.strategyHistory?.length ? mine.strategyHistory.map(entry => entry.strategy) : []), mine.strategy];
    for (const strategy of snapshots) d.set(strategy, structuredClone(d.get(neutral)));
    let counter;
    try { counter = finalRow(what, config, teamId); } catch { continue; } // can't be asked cleanly: don't guess
    decisions.push({ key: d.key, delta: actual.score - counter.score, ...componentDelta(actual, counter, weights), counterScore: counter.score });
  }

  const events = [];
  (config.events || []).forEach((e, index) => {
    const without = { ...config, events: config.events.map((x, i) => (i === index ? { ...x, ...NEUTRAL_EVENT } : x)) };
    let counter;
    try { counter = finalRow(clone(teams), without, teamId); } catch { return; }
    events.push({
      index,
      month: e.month,
      title: e.title,
      scope: e.scope,
      delta: actual.score - counter.score,
      ...componentDelta(actual, counter, weights)
    });
  });

  const bySize = (a, b) => Math.abs(b.delta) - Math.abs(a.delta);
  return { score: actual.score, decisions: decisions.sort(bySize), events: events.sort(bySize) };
}
