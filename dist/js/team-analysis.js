// Read the published season, not a newly simulated book: these amounts must reconcile with the table.
import { DIMENSIONS, rulesOf, strategyAt, monthlyMarketing, bookProfile, campaignRules } from '../engine.js';

const number = value => Number.isFinite(value) ? value : 0;
const ratio = (value, total) => total > 0 ? value / total : null;
const sum = (rows, key) => rows.reduce((total, row) => total + number(row[key]), 0);
const FIELDS = ['gwp', 'claims', 'expenses', 'profit', 'policies', 'commission', 'marketing', 'claimCount'];

function financial(row) {
  const values = Object.fromEntries(FIELDS.map(key => [key, number(row[key])]));
  return {
    ...values,
    running: values.expenses - values.commission - values.marketing,
    lossRatio: ratio(values.claims, values.gwp), combinedRatio: ratio(values.claims + values.expenses, values.gwp),
    margin: ratio(values.profit, values.gwp), averagePremium: ratio(values.gwp, values.policies),
    frequency: ratio(values.claimCount, values.policies), severity: ratio(values.claims, values.claimCount)
  };
}

function visiblePlan(strategy, config) {
  return strategy && !strategy._hidden && strategy.basePremium > 0 && Number.isFinite(strategy.basePremium) &&
    DIMENSIONS.every(dim => Array.isArray(strategy.coef?.[dim]) && strategy.coef[dim].length === rulesOf(config).dimensions[dim].length && strategy.coef[dim].every(v => Number.isFinite(v) && v > 0));
}

function campaignSummary(months, allocated, config) {
  const campaigns = months.map(month => month.campaign).filter(Boolean);
  const spend = sum(months, 'marketing'), customers = sum(campaigns, 'customers');
  const gifts = campaignRules(rulesOf(config)).offers.map(offer => {
    const entries = campaigns.map(campaign => ({ campaign, gift: campaign.gifts?.find(gift => gift.id === offer.id) })).filter(entry => entry.gift);
    const customers = entries.reduce((total, { gift }) => total + number(gift.customers), 0);
    const budget = entries.reduce((total, { campaign, gift }) => total + number(campaign.giftBudget) * number(gift.weight) / 100, 0);
    const wanted = entries.reduce((total, { gift }) => total + number(gift.wanted), 0);
    return { id: offer.id, customers, wanted, budget, spent: customers * offer.cost, missed: Math.max(0, wanted - customers) };
  });
  return {
    available: campaigns.length === months.length, allocated, spend,
    unspent: allocated === null ? null : Math.max(0, allocated - spend),
    media: sum(campaigns, 'media'), giftsUsed: sum(campaigns, 'giftsUsed'),
    contacts: sum(campaigns, 'bought'), reach: sum(campaigns, 'reach'), leads: sum(campaigns, 'leads'),
    wanted: sum(campaigns, 'wanted'), customers, costPerCustomer: ratio(spend, customers),
    contactEfficiency: ratio(sum(campaigns, 'reach'), sum(campaigns, 'bought')),
    conversion: ratio(customers, sum(campaigns, 'leads')), policyShare: ratio(customers, sum(months, 'policies')), gifts
  };
}

export function buildTeamAnalysis(state, season, teamId) {
  const team = state.teams.find(team => team.id === teamId);
  if (!team || season.length !== 12) return null;
  const series = season.map(month => month.rows.find(row => row.id === teamId));
  if (series.some(row => !row || ['gwp', 'claims', 'expenses', 'profit', 'policies'].some(key => !Number.isFinite(row[key])))) return null;

  const plans = [strategyAt(team, 0), strategyAt(team, 6)];
  const planVisible = !team.strategy?._hidden && plans.every(plan => visiblePlan(plan, state.config));
  const allocations = planVisible ? series.map((_, month) => monthlyMarketing(team, month)) : null;
  const monthly = series.map((row, month) => {
    const previous = series[month - 1];
    const values = Object.fromEntries(FIELDS.map(key => [key, number(row[key]) - number(previous?.[key])]));
    return { ...financial(values), month, share: number(row.share), cumulativeProfit: row.profit, campaign: row.campaign ?? null };
  });
  const final = series[11], totals = financial(final), field = season[11].rows;
  const marketPremium = season.map((month, i) => sum(month.rows, 'gwp') - sum(season[i - 1]?.rows || [], 'gwp'));
  const market = financial(Object.fromEntries(FIELDS.map(key => [key, sum(field, key)])));
  const ranks = Object.fromEntries(['profit', 'share'].map(key => [key, 1 + field.filter(row => row[key] > final[key]).length]));
  const leaders = { profit: Math.max(...field.map(row => row.profit)), share: Math.max(...field.map(row => row.share)) };
  const expectedClaims = Number.isFinite(final.expectedLossRatio) ? final.expectedLossRatio * final.gwp : null;
  const halves = [0, 6].map((start, half) => {
    const months = monthly.slice(start, start + 6);
    const allocated = allocations ? allocations.slice(start, start + 6).reduce((a, b) => a + b, 0) : null;
    return { ...financial(Object.fromEntries(FIELDS.map(key => [key, sum(months, key)]))),
      share: ratio(sum(months, 'gwp'), marketPremium.slice(start, start + 6).reduce((a, b) => a + b, 0)),
      campaign: campaignSummary(months, allocated, state.config),
      plan: planVisible ? plans[half] : null,
      profile: planVisible ? bookProfile(plans[half], state.config) : null };
  });
  const portfolio = [['channel', 'channels'], ['persona', 'segments']].map(([dimension, key]) => ({
    dimension,
    levels: (final[key] || []).map((count, level) => ({
      level, count, share: ratio(count, final.policies),
      marketShare: ratio(field.reduce((total, row) => total + number(row[key]?.[level]), 0), market.policies)
    }))
  }));
  const campaign = campaignSummary(monthly, allocations ? allocations.reduce((a, b) => a + b, 0) : null, state.config);
  return {
    team, totals, market, ranks, teamCount: field.length, share: number(final.share), policyShare: ratio(final.policies, market.policies),
    profitGap: leaders.profit - final.profit, shareGap: leaders.share - number(final.share),
    expectedLossRatio: Number.isFinite(final.expectedLossRatio) ? final.expectedLossRatio : null,
    expectedClaims, claimsDeviation: expectedClaims === null ? null : final.claims - expectedClaims,
    monthly, halves, portfolio, campaign, planVisible
  };
}
