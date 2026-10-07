// Jev strategy adapter. The model only chooses among legal, finite options;
// the insurance engine remains the sole authority for financial outcomes.
import { rulesOf, cascoMoney, policiesOf, actuarialCoefficients, actuarialBase, marketCells, DIMENSIONS, snapCoef, campaignRules, campaignAudience } from '../engine.js';

export const JEV_MODEL = 'typesafe/jev-1.13';

export const AI_PROFILES = [
  {
    id: 'challenger', name: { en: 'Market challenger', tr: 'Pazar meydan okuyucusu' },
    brief: 'Win market share assertively with low prices and heavy marketing, while keeping the company solvent.',
    signature: { lossRatio: 3, allocation: 1, focus: 0, reinsurance: false }
  },
  {
    id: 'underwriter', name: { en: 'Disciplined underwriter', tr: 'Disiplinli teknikçi' },
    brief: 'Price every segment by its true risk, protect margin and capital first, and accept slower growth.',
    signature: { view: 0, lossRatio: 0, reinsurance: true }
  },
  {
    id: 'customer', name: { en: 'Service leader', tr: 'Hizmet lideri' },
    brief: 'Win through claims service and customer satisfaction while keeping a credible technical result.',
    signature: { allocation: 2, reinsurance: false }
  },
  {
    id: 'digital', name: { en: 'Digital grower', tr: 'Dijital büyümeci' },
    brief: 'Grow through the direct digital channel, where acquisition costs are lowest.',
    signature: { focus: 2, reinsurance: false }
  },
  {
    id: 'premium', name: { en: 'Low-risk specialist', tr: 'Düşük risk uzmanı' },
    brief: 'Attract the lowest-risk customers — new vehicles, value-driven buyers — with sharp risk-based prices, and avoid the costly ones.',
    signature: { view: 0, lossRatio: 1, focus: 1, reinsurance: true }
  },
  {
    id: 'allocator', name: { en: 'Balanced allocator', tr: 'Dengeli sermaye yöneticisi' },
    brief: 'Balance profit, market share and service according to the scoring weights; avoid one-dimensional bets.',
    signature: { view: 3, lossRatio: 2, allocation: 0, focus: 4, reinsurance: true }
  }
];

export const aiProfileName = (id, lang = 'en') => AI_PROFILES.find(profile => profile.id === id)?.name[lang === 'tr' ? 'tr' : 'en'] || id;
export const aiProfile = id => AI_PROFILES.find(profile => profile.id === id) || AI_PROFILES[0];

const AI_NAMES = ['Jev Atlas', 'Jev Nova', 'Jev Vektor', 'Jev Pulse', 'Jev Orbit', 'Jev Apex'];
const choice = (instructions, criteria) => ({ type: 'choice', instructions, criteria });
const keyOf = (prefix, index) => `${prefix}${index}`;
const round1k = value => Math.round(value / 1000) * 1000;

export function nextAiIdentity(session) {
  const index = session.teams.filter(team => team.ai).length;
  const profile = AI_PROFILES[index % AI_PROFILES.length];
  const used = new Set(session.teams.map(team => team.name.toLocaleLowerCase(session.config?.lang === 'tr' ? 'tr-TR' : 'en-US')));
  let name = AI_NAMES[index % AI_NAMES.length];
  let suffix = 2;
  while (used.has(name.toLocaleLowerCase(session.config?.lang === 'tr' ? 'tr-TR' : 'en-US'))) name = `Jev AI ${suffix++}`;
  return { name, profile, emblem: (session.nextTeamId + 6) % 12 };
}

const VIEWS = [
  { id: 'risk', label: 'Price each segment by its true risk: coefficient = the level’s frequency × severity relativity from the model.' },
  { id: 'market', label: 'Follow the market: coefficient = the premium relativity the rest of the market already charges.' },
  { id: 'flat', label: 'One tariff for everyone: every coefficient stays at 1.' },
  { id: 'blend', label: 'Blend risk and market relativities half and half.' }
];
const LOSS_RATIOS = [0.5, 0.56, 0.62, 0.7, 0.78];
const ALLOCATIONS = [
  { marketing: 0.5, ops: 0.4, label: 'Balanced: half the budget on marketing, 40% on claims operations.' },
  { marketing: 0.68, ops: 0.3, label: 'Growth-heavy: most of the budget on marketing.' },
  { marketing: 0.3, ops: 0.65, label: 'Service-heavy: most of the budget on claims operations.' },
  { marketing: 0.42, ops: 0.42, label: 'Cautious: keep a reserve and split the rest evenly.' }
];
const CAMPAIGNS = [
  { campaign: 0, mediaShare: 50, offer: 'concert', label: 'No campaign: all marketing buys channel visibility.' },
  { campaign: 40, mediaShare: 20, offer: 'coffee', label: 'Cheap coffee cards, broad reach: 40% of marketing, a fifth of it on media.' },
  { campaign: 40, mediaShare: 25, offer: 'restaurant', label: 'Restaurant cards: 40% of marketing, a quarter of it on media.' },
  { campaign: 30, mediaShare: 60, offer: 'gym', label: 'Rich gym gift for the most engaged: 30% of marketing, mostly media.' },
  { campaign: 60, mediaShare: 40, offer: 'concert', label: 'Loud: 60% of marketing into the campaign with concert discounts.' }
];
const FOCUS = [
  { value: [55, 20, 10, 15], label: 'Agency-led: follow the largest channel.' },
  { value: [20, 55, 10, 15], label: 'Bank-led: bancassurance customers are loyal and less price sensitive.' },
  { value: [15, 10, 65, 10], label: 'Digital-led: the cheapest channel to sell through.' },
  { value: [20, 15, 10, 55], label: 'Broker-led: large commercial accounts, costly claims.' },
  { value: [25, 25, 25, 25], label: 'Even across all four channels.' }
];

function coefficientsFor(view, rules) {
  const risk = actuarialCoefficients(rules);
  if (view === 'risk') return risk;
  const round = v => snapCoef(v, rules);
  const market = Object.fromEntries(DIMENSIONS.map(dim => {
    const k = DIMENSIONS.indexOf(dim);
    let n = 0, sum = 0;
    for (const c of marketCells()) { n += c[5]; sum += c[5] * rules.dimensions[dim][c[k]].prem; }
    return [dim, rules.dimensions[dim].map(lv => round(lv.prem / (sum / n)))];
  }));
  if (view === 'market') return market;
  if (view === 'flat') return Object.fromEntries(DIMENSIONS.map(dim => [dim, risk[dim].map(() => 1)]));
  return Object.fromEntries(DIMENSIONS.map(dim => [dim, risk[dim].map((v, i) => round(Math.sqrt(v * market[dim][i])))]));
}

export function buildJevRequest(session, profile, model = JEV_MODEL, reviewMonth = null) {
  const config = session.config;
  const rules = rulesOf(config), money = cascoMoney(config);
  const state = {
    description: 'A professional casco (motor own-damage) insurance strategy simulation. Select one coherent strategy for the AI-controlled insurer. Financial results are calculated later by a deterministic engine.',
    ai_profile: { id: profile.id, objective: profile.brief },
    market: {
      line: config.branch, year: config.year, annual_policies: policiesOf(config),
      starting_capital: money.capital, decision_budget: money.budget,
      claim_model: { base_frequency: rules.model.frequency, base_severity_eur: rules.model.severity, base_loss_ratio: rules.model.lossRatio },
      reinsurance: { quota_share: rules.reinsurance.share, ceding_commission: rules.reinsurance.commission, fee: money.reinsuranceFee },
      digital_campaign: { cost_per_1000_impressions: campaignRules(rules).cpm, target_group_per_team_per_month: Math.round(campaignAudience(rules, money) / 12), frequency_bonus: { above_views: campaignRules(rules).frequency, hit_ratio_up: campaignRules(rules).frequencyBonus }, gifts: campaignRules(rules).offers, note: 'Customers = reach × interest × click × hit, at most gift budget ÷ gift cost. Marketing spent on the campaign no longer buys channel visibility.' },
      scoring_weights: { profit: config.weights[0], market_share: config.weights[1], satisfaction: config.weights[2] }
    },
    segments: Object.fromEntries(DIMENSIONS.map(dim => [dim, rules.dimensions[dim].map(lv => ({ level: lv.id, frequency_coef: lv.freq, severity_coef: lv.sev, market_premium_coef: lv.prem, ...(lv.expense !== undefined ? { channel_expense_ratio: lv.expense } : {}) }))])),
    events: config.events.map(event => ({ month: event.month + 1, title: event.title, description: event.description, scope: event.scope })),
    competitors: session.teams.map(team => ({ name: team.name, ai: !!team.ai })),
    quarterly_review: Number.isInteger(reviewMonth) ? {
      completed_month: reviewMonth + 1,
      latest_results: (session.results?.[reviewMonth]?.rows || []).map(row => ({
        team: session.teams.find(team => team.id === row.id)?.name || String(row.id),
        score: row.score, rank: row.rank, market_share: row.share, technical_profit: row.profit, loss_ratio: row.lossRatio, service: row.monthService
      })),
      instruction: 'Revise the plan for the next quarter. Completed months are fixed; respond to the observed loss ratios, shares and events.'
    } : null
  };
  const questions = {
    pricing_view: choice('How should the price coefficients follow the segments?', Object.fromEntries(VIEWS.map((row, i) => [keyOf('v', i), row.label]))),
    loss_ratio: choice('Choose the loss ratio your prices aim for. Lower means dearer prices and fewer, more profitable policies.', Object.fromEntries(LOSS_RATIOS.map((value, i) => [keyOf('l', i), `Target loss ratio ${Math.round(value * 100)}%.`]))),
    allocation: choice('Split the decision budget between marketing and claims operations.', Object.fromEntries(ALLOCATIONS.map((row, i) => [keyOf('a', i), row.label]))),
    campaign: choice('How much of marketing should run the digital acquisition campaign, and with which gift?', Object.fromEntries(CAMPAIGNS.map((row, i) => [keyOf('c', i), row.label]))),
    channel_focus: choice('Where should marketing concentrate?', Object.fromEntries(FOCUS.map((row, i) => [keyOf('f', i), row.label]))),
    reinsurance: choice('Buy the quota-share treaty? It cedes premium and claims for a commission and costs a fixed fee from the budget.', {
      yes: 'Buy it when capital protection and a softer downside justify giving up part of the upside.',
      no: 'Keep all the risk when margin and capital are strong enough.'
    })
  };
  return {
    body: { model, state, questions, provider: { zdr: true, data_collection: 'deny' } },
    context: { rules, money }
  };
}

export function buildJevQuizRequest(session, round, question, model = JEV_MODEL) {
  const options = Object.fromEntries(question.options.map((option, index) => [`o${index}`, option]));
  const teams = session.teams.filter(team => team.ai);
  const questions = Object.fromEntries(teams.map(team => {
    const profile = aiProfile(team.ai.profile);
    return [`team_${team.id}`, choice(
      `Answer the insurance knowledge question as ${team.name}, a ${profile.name.en}. Use insurance knowledge and the wording of the options. Do not coordinate with other teams. Question: ${question.text}`,
      options
    )];
  }));
  return {
    body: {
      model,
      state: {
        description: 'A live professional insurance workshop quiz. Each AI-controlled team must independently choose one answer. The correct answer is intentionally not provided.',
        line: session.config.branch,
        month: round.month + 1,
        teams: teams.map(team => ({ id: team.id, name: team.name, strategy_profile: aiProfile(team.ai.profile).brief }))
      },
      questions,
      provider: { zdr: true, data_collection: 'deny' }
    },
    teamIds: teams.map(team => team.id)
  };
}

function picked(answer) {
  if (!answer) return null;
  if (typeof answer.choice === 'string') return answer.choice;
  if (answer.choice && typeof answer.choice.value === 'string') return answer.choice.value;
  if (answer.choice && typeof answer.choice === 'object') {
    const ranked = Object.entries(answer.choice).filter(([, value]) => Number.isFinite(Number(value))).sort((a, b) => Number(b[1]) - Number(a[1]));
    if (ranked.length) return ranked[0][0];
  }
  return typeof answer.value === 'string' ? answer.value : null;
}

export function quizChoicesFromJev(answers, teamIds) {
  return Object.fromEntries(teamIds.map(teamId => {
    const key = picked(answers?.[`team_${teamId}`]);
    const choiceIndex = key?.startsWith('o') ? Number(key.slice(1)) : NaN;
    return [teamId, [0, 1, 2, 3].includes(choiceIndex) ? choiceIndex : null];
  }));
}

function confidenceOf(answer) {
  if (!answer) return null;
  if (Number.isFinite(Number(answer.confidence))) return Number(answer.confidence);
  if (answer.choice && typeof answer.choice === 'object') {
    const values = Object.values(answer.choice).map(Number).filter(Number.isFinite);
    if (values.length) return Math.max(...values);
  }
  return null;
}

function rowFor(answer, rows, prefix) {
  const key = picked(answer);
  const index = key?.startsWith(prefix) ? Number(key.slice(prefix.length)) : NaN;
  return Number.isInteger(index) && rows[index] !== undefined ? rows[index] : rows[0];
}

export function strategyFromJev(session, profile, answers, context) {
  const { rules, money } = context;
  const signature = profile.signature || {};
  const pick = (answer, rows, prefix, fixed) => (Number.isInteger(fixed) && rows[fixed] !== undefined ? rows[fixed] : rowFor(answer, rows, prefix));
  // Each bot keeps a few non-negotiable principles; Jev decides the rest, so personalities
  // stay adaptive without collapsing into the same strategy.
  const view = pick(answers.pricing_view, VIEWS, 'v', signature.view);
  const lossRatio = pick(answers.loss_ratio, LOSS_RATIOS, 'l', signature.lossRatio);
  const allocation = pick(answers.allocation, ALLOCATIONS, 'a', signature.allocation);
  const focus = pick(answers.channel_focus, FOCUS, 'f', signature.focus);
  const campaign = pick(answers.campaign, CAMPAIGNS, 'c', signature.campaign);
  const reinsurance = typeof signature.reinsurance === 'boolean' ? signature.reinsurance : picked(answers.reinsurance) === 'yes';
  const coef = coefficientsFor(view.id, rules);
  const fee = reinsurance ? money.reinsuranceFee : 0;
  const claimsOps = round1k(money.budget * allocation.ops);
  const marketing = Math.max(0, Math.min(round1k(money.budget * allocation.marketing), Math.floor((money.budget - fee - claimsOps) / 1000) * 1000));
  const confidenceValues = Object.values(answers).map(confidenceOf).filter(Number.isFinite);
  const confidence = confidenceValues.length ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length : null;
  const profileName = profile.name[session.config.lang === 'tr' ? 'tr' : 'en'];
  const sentence = session.config.lang === 'tr'
    ? `${profileName}: riski doğru fiyatla, sermayeyi koru.`
    : `${profileName}: price the risk right, protect the capital.`;
  return {
    strategy: { sentence, basePremium: actuarialBase(coef, lossRatio, rules), coef, marketing, channelFocus: [...focus.value], claimsOps, reinsurance, campaign: campaign.campaign, mediaShare: campaign.mediaShare, offer: campaign.offer },
    confidence
  };
}
