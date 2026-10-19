// Segment prices: every team's average offer and its share of what the teams sold, level by level
// (city, channel, vehicle age, persona, customer type), next to the rest of the market's price.
// Prices are averaged over the market's own cells (the same weights for every team) and over the
// twelve months, so a half-year revision counts for the months it ran. Shares come from the traced
// season: the policies each team sold in the level ÷ all the teams sold there.
import { rulesOf, marketCells, simulateTraced, strategyAt, offerFor, cellRisk, DIMENSIONS } from '../engine.js';

export function segmentPrices(state) {
  const config = state.config, R = rulesOf(config), cells = marketCells(), teams = state.teams;
  const season = simulateTraced(teams, config);
  const table = DIMENSIONS.map(dim => ({
    dim,
    levels: R.dimensions[dim].map((_, i) => ({ level: i, weight: 0, market: 0, prices: teams.map(() => 0), sold: teams.map(() => 0) }))
  }));
  const plans = Array.from({ length: 12 }, (_, m) => teams.map(team => strategyAt(team, m)));
  cells.forEach((cell, c) => {
    const w = cell[5], reference = cellRisk(cell, R).reference;
    const offers = teams.map((_, i) => plans.reduce((sum, month) => sum + offerFor(month[i], cell), 0) / 12);
    const sold = teams.map((_, i) => season.reduce((sum, month) => sum + Math.max(0, month.trace[i].market[c] + month.trace[i].campaign[c]), 0));
    DIMENSIONS.forEach((_, k) => {
      const row = table[k].levels[cell[k]];
      row.weight += w; row.market += w * reference;
      offers.forEach((o, i) => { row.prices[i] += w * o; row.sold[i] += sold[i]; });
    });
  });
  for (const group of table) for (const row of group.levels) {
    row.market /= row.weight;
    row.prices = row.prices.map(p => p / row.weight);
    const total = row.sold.reduce((a, b) => a + b, 0);
    row.shares = row.sold.map(v => (total ? v / total : 0));
  }
  return { teams: teams.map(t => t.id), table };
}
