// INSURERS LEAGUE · casco market engine.
// Teams sell motor own-damage (casco) cover to one shared market. The case-study data is a sample of that
// market: every city × channel × vehicle age × persona × customer type cell keeps exactly its share of the
// sample, its last-term premium and the competition's price index. The moderator sets how many policies
// the whole market buys in a year; each cell gets its sample share of them.
//
// Claims come from the model config only: frequency and severity are the base values times each level's
// coefficients, claim counts are Poisson and claim amounts Gamma. The sample's claim columns are never read.
//
// A team decides a base premium and one price coefficient per level (19 in all), and splits its budget
// between marketing (focused on channels), claims operations and an optional quota-share treaty. Each
// month a twelfth of the market buys a one-year policy from whichever insurer suits it best, or from the
// rest of the market. Accounts run on an underwriting-year basis: a month's policies book their full
// premium and ultimate claims when sold. Pricing a cell below its true risk wins its customers — and
// their claims.
import { CASCO_MARKET } from './data/casco-market.js';

export const DIMENSIONS = ['city', 'channel', 'vehicle', 'persona', 'type'];
export const QUARTER_KEYS = ['basePremium', 'coef', 'marketing', 'channelFocus', 'claimsOps', 'campaign', 'mediaShare', 'offer'];
export const NOMINAL_TEAMS = 6;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const L = (lang, en, tr) => (lang === 'tr' ? tr : en);

// ——— Rules: every coefficient the moderator can change in the rule studio ———
export function defaultCascoRules() {
  return structuredClone({
    model: { ...CASCO_MARKET.model },
    dimensions: CASCO_MARKET.dimensions,
    // How each persona buys. Hidden from teams: they infer it from the data and the race.
    //   price: sensitivity of choice to price vs the market · service: weight on claims-service
    //   reputation · channel: how strongly the customer sticks to its channel (presence exponent)
    behavior: [
      { price: 2.2, service: 0.5, channel: 1.4 },  // Bank customer
      { price: 2.6, service: 1.6, channel: 1 },    // Post-claim
      { price: 4.2, service: 0.3, channel: 1 },    // Price-driven
      { price: 1.6, service: 1.3, channel: 1 }     // Value-driven
    ],
    commercialPrice: 0.8,
    market: { outside: 1.2, seasonality: 0.06 },
    coef: { min: 0.5, max: 2.5, step: 0.05 },
    marketing: { presence: 0.3, strength: 0.7, scale: 0.004, minFocus: 10 },
    service: { handling: 0.1, threshold: 0.8, slope: 60, floor: 30, max: 98, leakage: 0.15, reputation: 1 },
    reinsurance: { share: 0.3, commission: 0.25 },
    // The digital acquisition campaign (Marketing_Input.xlsx): media buys impressions in the target group,
    // reached people go through interest → click → hit, every acquired customer gets one gift.
    // The case's audience-per-euro is kept: the target group grows with the decision budget and the teams.
    campaign: {
      channel: 2,                 // campaign customers buy through this channel (Digital)
      cpm: 10,                    // EUR per 1,000 impressions
      digitalUsers: 43000000,     // 18–55 digital users in the case
      targetShare: 0.21,          // the target group's share of them
      referenceBudget: 5000000,   // the case's campaign budget for that audience
      frequency: 5,               // seen more than this many times on average →
      frequencyBonus: 0.1,        // … the hit ratio rises by this much
      priceCap: 2,                // a cheap price can at most double the hit ratio
      offers: [
        { id: 'concert', interest: 0.5, cost: 50, click: 0.35, hit: 0.1 },
        { id: 'restaurant', interest: 0.7, cost: 30, click: 0.15, hit: 0.07 },
        { id: 'coffee', interest: 0.6, cost: 15, click: 0.06, hit: 0.09 },
        { id: 'gym', interest: 0.81, cost: 85, click: 0.5, hit: 0.15 }
      ]
    },
    capitalRule: false // on: a team whose equity ever goes below zero can't win
  });
}
const DEFAULT_RULES = defaultCascoRules();
export const cascoRulesOf = config => (config?.rules?.model ? config.rules : DEFAULT_RULES);
// Rooms created before the campaign existed carry no campaign rules; they get the defaults.
export const campaignRules = R => R?.campaign ?? DEFAULT_RULES.campaign;
// A plan's campaign decisions; plans written before the campaign existed run none.
export const campaignOf = s => ({ share: Number.isFinite(s?.campaign) ? s.campaign : 0, media: Number.isFinite(s?.mediaShare) ? s.mediaShare : 50, offer: s?.offer ?? 'concert' });
// The target group in this market for one team-year: the case's people per euro × the decision budget.
export const campaignAudience = (R, money) => { const K = campaignRules(R); return K.digitalUsers * K.targetShare * money.budget / K.referenceBudget; };

// ——— Market arithmetic ———
const cells = () => CASCO_MARKET.cells;
export const marketCells = cells;
const DEFAULT_POLICIES = 260000;
export const policiesOf = config => config?.assumptions?.policies?.value ?? DEFAULT_POLICIES;
// A cell's yearly policies: its exact share of the sample × the market's annual policy count.
const yearly = (cell, policies) => cell[5] / CASCO_MARKET.customers * policies;

// Expected claim frequency, severity and the market's own reference premium for one cell.
export function cellRisk(cell, R = DEFAULT_RULES) {
  const d = R.dimensions;
  // The coefficient products are normalized to the portfolio, as in the data (freqNorm / sevNorm).
  let freq = R.model.frequency * (R.model.freqNorm ?? 1), sev = R.model.severity * (R.model.sevNorm ?? 1), prem = R.model.frequency * R.model.severity / R.model.lossRatio;
  DIMENSIONS.forEach((dim, k) => { const lv = d[dim][cell[k]]; freq *= lv.freq; sev *= lv.sev; prem *= lv.prem; });
  return { freq, sev, cost: freq * sev, reference: prem * cell[7] };
}

// The whole market at reference prices.
export function referenceMarket(R = DEFAULT_RULES, policies = DEFAULT_POLICIES) {
  let gwp = 0, claims = 0;
  for (const c of cells()) { const n = yearly(c, policies), r = cellRisk(c, R); gwp += n * r.reference; claims += n * r.cost; }
  return { gwp, claims, policies };
}

// Moderator-facing numbers. Money defaults to shares of one team's fair slice of the reference market
// (with NOMINAL_TEAMS teams); changing the policy count rescales the money in proportion (see game.js).
export function cascoAssumptions(lang = 'en', R = DEFAULT_RULES, policies = DEFAULT_POLICIES) {
  const slice = referenceMarket(R, policies).gwp / NOMINAL_TEAMS, k = v => Math.round(slice * v / 1000) * 1000;
  const A = (value, min, max, unit, en, tr, den, dtr) => ({ value, min, max, unit, label: L(lang, en, tr), description: L(lang, den, dtr) });
  return {
    policies: A(policies, 1000, 5000000, 'policies', 'Annual market size', 'Yıllık pazar büyüklüğü',
      'Policies the whole market buys in a year. Its profile matches the sample exactly.', 'Tüm pazarın bir yılda aldığı poliçe. Profili örneklemle birebir aynı.'),
    capital: A(k(0.3), 1000, 1e9, 'EUR', 'Starting capital', 'Başlangıç sermayesi',
      'The same equity for every company; profit and loss move it. With the capital rule on, going below zero rules a team out.', 'Her şirkete aynı özkaynak; kâr ve zarar onu değiştirir. Özkaynak kuralı açıksa sıfırın altına düşen takım kupa alamaz.'),
    budget: A(k(0.08), 1000, 1e9, 'EUR', 'Decision budget', 'Karar bütçesi',
      'Marketing + claims operations + the reinsurance fee, spread over the year.', 'Pazarlama + hasar operasyonu + reasürans bedeli; yıla yayılır.'),
    fixedCost: A(k(0.02), 0, 1e9, 'EUR', 'Fixed operating cost', 'Sabit işletme gideri',
      'Yearly overhead every company carries.', 'Her şirketin taşıdığı yıllık genel gider.'),
    reinsuranceFee: A(k(0.01), 0, 1e9, 'EUR', 'Quota-share fee', 'Kota paylı anlaşma bedeli',
      'The fixed price of the reinsurance treaty, paid from the decision budget.', 'Reasürans anlaşmasının sabit bedeli; karar bütçesinden ödenir.'),
    profitFloor: A(-0.1, -1, 0.5, 'ratio', 'Profitability floor', 'Kârlılık tabanı',
      'Profit / capital that scores 0 profitability points.', 'Kârlılıktan 0 puan alınan kâr / sermaye oranı.'),
    profitTarget: A(0.25, 0, 2, 'ratio', 'Profitability target', 'Kârlılık hedefi',
      'Profit / capital that scores full profitability points.', 'Kârlılıktan tam puan alınan kâr / sermaye oranı.'),
    shareTarget: A(1.5, 0.5, 6, 'x', 'Market share target', 'Pazar payı hedefi',
      'Full share points at this multiple of a fair share (1 / teams).', 'Adil payın (1 / takım) bu katında tam pay puanı.'),
    serviceTarget: A(92, 10, 100, 'points', 'Satisfaction target', 'Memnuniyet hedefi',
      'Average service score that earns full satisfaction points.', 'Tam memnuniyet puanı getiren ortalama hizmet skoru.')
  };
}

// Money and scoring thresholds for one team, read from the moderator's assumptions.
export function cascoMoney(config) {
  const R = cascoRulesOf(config), policies = policiesOf(config);
  const a = config?.assumptions?.budget ? config.assumptions : cascoAssumptions(config?.lang, R, policies);
  const slice = referenceMarket(R, policies).gwp / NOMINAL_TEAMS;
  return {
    slice, budget: a.budget.value, capital: a.capital.value, fixedMonthly: a.fixedCost.value / 12, reinsuranceFee: a.reinsuranceFee.value,
    marketingScale: slice * R.marketing.scale,
    profitFloor: a.profitFloor.value, profitTarget: a.profitTarget.value, shareTarget: a.shareTarget.value, serviceTarget: a.serviceTarget.value
  };
}

export const offerFor = (s, cell) => s.basePremium * DIMENSIONS.reduce((p, dim, k) => p * s.coef[dim][cell[k]], 1);

// ——— Strategy ———
const evenSplit = n => Array.from({ length: n }, (_, i) => Math.floor(100 / n) + (i < 100 % n ? 1 : 0));
export function defaultCascoStrategy(config) {
  const R = cascoRulesOf(config), money = cascoMoney(config);
  return {
    product: '', sentence: '',
    basePremium: Math.round(R.model.frequency * R.model.severity / R.model.lossRatio * 100) / 100,
    coef: Object.fromEntries(DIMENSIONS.map(dim => [dim, R.dimensions[dim].map(() => 1)])),
    marketing: Math.round(money.budget * 0.5 / 1000) * 1000,
    channelFocus: evenSplit(R.dimensions.channel.length),
    claimsOps: Math.round(money.budget * 0.4 / 1000) * 1000,
    reinsurance: false,
    campaign: 20, mediaShare: 50, offer: 'concert'
  };
}

export const cascoSpend = (s, money) => Number(s.marketing) + Number(s.claimsOps) + (s.reinsurance ? money.reinsuranceFee : 0);

// A coefficient as a team can hand it in: inside the bounds, on the step grid.
export const snapCoef = (v, R = DEFAULT_RULES) => {
  const c = Math.min(R.coef.max, Math.max(R.coef.min, v)), step = R.coef.step || 0.01;
  return Math.round(Math.round(c / step) * step * 100) / 100;
};
const onStep = (v, step) => Math.abs(v / step - Math.round(v / step)) < 1e-6;
const DIM_TR = { city: 'il', channel: 'kanal', vehicle: 'araç yaşı', persona: 'persona', type: 'müşteri tipi' };
const DIM_EN = { city: 'city', channel: 'channel', vehicle: 'vehicle age', persona: 'persona', type: 'customer type' };
export function validateCasco(team, config, lang = config?.lang) {
  const s = team.strategy, R = cascoRulesOf(config), money = cascoMoney(config), errors = [];
  const m = (en, tr) => L(lang, en, tr);
  if (!String(team.name || '').trim()) errors.push(m('Enter a company name.', 'Şirket adını girin.'));
  if (!(Number.isFinite(s.basePremium) && s.basePremium > 0)) errors.push(m('Enter a base premium above zero.', 'Sıfırdan büyük bir baz prim girin.'));
  for (const dim of DIMENSIONS) {
    const list = s.coef?.[dim];
    if (!Array.isArray(list) || list.length !== R.dimensions[dim].length || list.some(v => !Number.isFinite(v) || v < R.coef.min - 1e-9 || v > R.coef.max + 1e-9))
      errors.push(m(`Every ${DIM_EN[dim]} coefficient must be between ${R.coef.min} and ${R.coef.max}.`, `Her ${DIM_TR[dim]} katsayısı ${R.coef.min} ile ${R.coef.max} arasında olmalı.`));
    else if (R.coef.step && list.some(v => !onStep(v, R.coef.step)))
      errors.push(m(`${DIM_EN[dim][0].toUpperCase()}${DIM_EN[dim].slice(1)} coefficients go in steps of ${R.coef.step} (e.g. 0.95, 1.00, 1.05).`, `${DIM_TR[dim][0].toLocaleUpperCase('tr-TR')}${DIM_TR[dim].slice(1)} katsayıları ${String(R.coef.step).replace('.', ',')} adımlarla girilir (örn. 0,95 · 1,00 · 1,05).`));
  }
  const focus = s.channelFocus, minFocus = R.marketing.minFocus ?? 0;
  if (!Array.isArray(focus) || focus.length !== R.dimensions.channel.length || focus.some(v => !Number.isFinite(v) || v < 0 || v > 100) || Math.abs(focus.reduce((a, b) => a + b, 0) - 100) > 0.01) {
    const total = Array.isArray(focus) ? focus.reduce((a, b) => a + (Number(b) || 0), 0) : 0;
    errors.push(m(`The channel focus must total 100% (currently ${total}%).`, `Kanal odağı toplamı %100 olmalı (şu an %${total}).`));
  } else if (focus.some(v => v < minFocus - 1e-9))
    errors.push(m(`Every sales channel gets at least ${minFocus}% of the marketing focus.`, `Her satış kanalına pazarlama odağının en az %${minFocus}'u verilmeli.`));
  const K = campaignRules(R);
  if (s.campaign !== undefined || s.mediaShare !== undefined || s.offer !== undefined) {
    const pct5 = v => Number.isFinite(v) && v >= 0 && v <= 100 && onStep(v, 5);
    if (!pct5(s.campaign)) errors.push(m('The campaign share of marketing goes from 0 to 100% in steps of 5.', 'Kampanya payı (pazarlamanın) %0–100 arasında, 5’er adımla girilir.'));
    if (!pct5(s.mediaShare)) errors.push(m('The media share of the campaign goes from 0 to 100% in steps of 5.', 'Medya payı (kampanyanın) %0–100 arasında, 5’er adımla girilir.'));
    if (!K.offers.some(o => o.id === s.offer)) errors.push(m('Pick one of the campaign gifts.', 'Kampanya hediyelerinden birini seç.'));
  }
  if (!(s.marketing >= 0) || !(s.claimsOps >= 0)) errors.push(m('Budgets must be zero or positive.', 'Bütçeler sıfır veya pozitif olmalı.'));
  else if (cascoSpend(s, money) > money.budget + 0.5) errors.push(m('Marketing, claims operations and the reinsurance fee exceed the decision budget.', 'Pazarlama, hasar operasyonu ve reasürans bedeli karar bütçesini aşıyor.'));
  return errors;
}

// A team may revise its plan at quarter reviews. Each snapshot applies from the following month.
export function strategyAt(team, month) {
  const history = Array.isArray(team?.strategyHistory) ? team.strategyHistory : [];
  let active = null;
  for (const entry of history) if (Number.isInteger(entry?.effectiveMonth) && entry.effectiveMonth <= month && entry.strategy && (!active || entry.effectiveMonth >= active.effectiveMonth)) active = entry;
  return active?.strategy || team.strategy;
}

// ——— Randomness ———
// All luck comes from one table of uniform numbers drawn from the seed before anything else happens:
// one per market cell per month (demand wobble) and two per team per month (claim count, claim amount).
// The table never depends on decisions, so the audit workbook can carry it and reproduce every figure.
function stream(seed) {
  let a = seed >>> 0;
  // Nine decimals, strictly inside (0, 1): exact in a spreadsheet, safe for an inverse normal.
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return (Math.floor(((t ^ t >>> 14) >>> 0) / 4294967296 * 1e9) + 0.5) / 1e9; };
}

export function drawsFor(config, teamList) {
  const seed = config.seed ?? 1, market = stream(seed * 7919 + 17);
  const marketDraws = Array.from({ length: 12 }, () => cells().map(() => market()));
  const teams = Object.fromEntries(teamList.map(t => {
    const rnd = stream(seed * 104729 + (Number(t.id) + 1) * 7331);
    return [t.id, Array.from({ length: 12 }, () => [rnd(), rnd()])];
  }));
  return { market: marketDraws, teams };
}

// Standard normal quantile (Wichura, AS 241; ~1e-16), the same function as a spreadsheet's NORM.S.INV.
export function normInv(p) {
  const q = p - 0.5;
  if (Math.abs(q) <= 0.425) {
    const r = 0.180625 - q * q;
    return q * (((((((2509.0809287301226727 * r + 33430.575583588128105) * r + 67265.770927008700853) * r + 45921.953931549871457) * r + 13731.693765509461125) * r + 1971.5909503065514427) * r + 133.14166789178437745) * r + 3.387132872796366608)
      / (((((((5226.495278852545925 * r + 28729.085735721942674) * r + 39307.89580009271061) * r + 21213.794301586595867) * r + 5394.1960214247511077) * r + 687.1870074920579083) * r + 42.313330701600911252) * r + 1);
  }
  let r = q < 0 ? p : 1 - p;
  r = Math.sqrt(-Math.log(r));
  let x;
  if (r <= 5) {
    r -= 1.6;
    x = (((((((7.7454501427834140764e-4 * r + 0.0227238449892691845833) * r + 0.24178072517745061177) * r + 1.27045825245236838258) * r + 3.64784832476320460504) * r + 5.7694972214606914055) * r + 4.6303378461565452959) * r + 1.42343711074968357734)
      / (((((((1.05075007164441684324e-9 * r + 5.475938084995344946e-4) * r + 0.0151986665636164571966) * r + 0.14810397642748007459) * r + 0.68976733498510000455) * r + 1.6763848301838038494) * r + 2.05319162663775882187) * r + 1);
  } else {
    r -= 5;
    x = (((((((2.01033439929228813265e-7 * r + 2.71155556874348757815e-5) * r + 0.0012426609473880784386) * r + 0.026532189526576123093) * r + 0.29656057182850489123) * r + 1.7848265399172913358) * r + 5.4637849111641143699) * r + 6.6579046435011037772)
      / (((((((2.04426310338993978564e-15 * r + 1.4215117583164458887e-7) * r + 1.8463183175100546818e-5) * r + 7.868691311456132591e-4) * r + 0.0148753612908506148525) * r + 0.13692988092273580531) * r + 0.59983220655588793769) * r + 1);
  }
  return q < 0 ? -x : x;
}

// Claims for one team-month. Count ~ Poisson(λ), total ~ the sum of that many Gamma(shape) claims; both drawn
// with their normal approximation so a spreadsheet can reproduce them exactly:
//   N = max(0, round(λ + √λ·Φ⁻¹(u₁)))      total = max(0, N·s + s·√(N / shape)·Φ⁻¹(u₂))
export function claimDraw(lambda, meanSeverity, shape, u1, u2) {
  const count = lambda > 0 ? Math.max(0, Math.round(lambda + Math.sqrt(lambda) * normInv(u1))) : 0;
  const amount = count ? Math.max(0, count * meanSeverity + meanSeverity * Math.sqrt(count / shape) * normInv(u2)) : 0;
  return { count, amount };
}

// Event scope: 'all' or '<dimension>:<level index>', e.g. 'city:0' (Istanbul).
export const inScope = (scope, cell) => { if (!scope || scope === 'all') return true; const [dim, lv] = scope.split(':'); return cell[DIMENSIONS.indexOf(dim)] === Number(lv); };
const activeEvents = (events, m) => events.filter(e => e.month <= m && m < e.month + (e.duration || 1));

// ——— Simulation ———
// `trace` (optional) keeps every team's policies per cell and month, split market / campaign, for audits and exports.
export function simulateCasco(teamList, config, { trace = false } = {}) {
  const R = cascoRulesOf(config), n = teamList.length, money = cascoMoney(config), policies = policiesOf(config);
  const errors = teamList.flatMap(t => {
    const snapshots = Array.isArray(t.strategyHistory) && t.strategyHistory.length ? t.strategyHistory : [{ strategy: t.strategy }];
    return snapshots.flatMap(entry => validateCasco({ ...t, strategy: entry.strategy }, config));
  });
  if (errors.length) throw Error([...new Set(errors)].join(' '));
  if (config.weights.reduce((a, b) => a + b, 0) !== 100) throw Error(L(config.lang, 'Score weights must total 100%.', 'Puan ağırlıkları toplamı %100 olmalı.'));

  const svc = R.service, events = config.events || [], K = campaignRules(R);
  // Campaign target cells: the campaign channel's cells, weighted by their share of the sample.
  const targetCount = cells().reduce((a, c) => a + (c[1] === K.channel ? c[5] : 0), 0);
  const targetShare = cells().map(c => (c[1] === K.channel ? c[5] / targetCount : 0));
  const audience = campaignAudience(R, money) * n / 12; // target-group people shopping a month, all teams
  const draws = drawsFor(config, teamList);
  const risk = cells().map(c => cellRisk(c, R));
  const channels = R.dimensions.channel.length, personas = R.dimensions.persona.length;
  const ledgers = teamList.map(t => ({
    id: t.id, policies: 0, gwp: 0, claims: 0, claimCount: 0, ceded: 0, recovery: 0, expenses: 0, acquisition: 0, expectedCost: 0, profit: 0,
    cohorts: [], persona: Array(personas).fill(0), channel: Array(channels).fill(0), service: svc.max, serviceSum: 0, eligible: true, minEquity: money.capital
  }));
  const months = [];

  for (let m = 0; m < 12; m++) {
    const live = activeEvents(events, m);
    const season = 1 + R.market.seasonality * Math.sin((m + 1) / 1.9);
    const strategies = teamList.map(t => strategyAt(t, m));
    const counts = teamList.map(() => new Float64Array(cells().length));
    const demandOf = new Float64Array(cells().length);
    let available = 0, outsideSold = 0;

    cells().forEach((cell, c) => {
      const demand = live.reduce((x, e) => x * (inScope(e.scope, cell) ? e.demand ?? 1 : 1), 1);
      demandOf[c] = demand;
      const pool = yearly(cell, policies) / 12 * season * demand * (0.985 + draws.market[m][c] * 0.03);
      available += pool;
      const who = R.behavior[cell[3]];
      const beta = who.price * (cell[4] === 1 ? R.commercialPrice : 1);
      const weights = strategies.map((s, i) => {
        const spend = s.marketing * (1 - campaignOf(s).share / 100) * s.channelFocus[cell[1]] / 100;
        const presence = R.marketing.presence + R.marketing.strength * Math.log1p(spend / money.marketingScale);
        const service = Math.exp(who.service * svc.reputation * (ledgers[i].service - svc.max) / 40);
        return Math.exp(-beta * Math.log(offerFor(s, cell) / risk[c].reference)) * presence ** who.channel * service;
      });
      const total = R.market.outside + weights.reduce((a, b) => a + b, 0);
      weights.forEach((w, i) => { counts[i][c] = pool * w / total; });
      outsideSold += pool * R.market.outside / total;
    });

    const marketCounts = trace ? counts.map(a => Array.from(a)) : null;
    // The campaign: impressions share one target group; reach, frequency, the funnel, then the gift cap.
    const plans = strategies.map(s => { const c = campaignOf(s), spend = s.marketing * c.share / 100 / 12; return { ...c, media: spend * c.media / 100, gifts: spend * (1 - c.media / 100), gift: K.offers.find(o => o.id === c.offer) ?? K.offers[0] }; });
    const impressions = plans.map(p => p.media / K.cpm * 1000), allImpressions = impressions.reduce((a, b) => a + b, 0);
    const frequency = Math.max(1, allImpressions / audience);
    const campaign = plans.map((p, i) => {
      const reach = impressions[i] * Math.min(1, audience / Math.max(allImpressions, 1e-9));
      const hit = p.gift.hit * (frequency > K.frequency ? 1 + K.frequencyBonus : 1);
      const leads = reach * p.gift.interest * p.gift.click;
      // A cheaper price than the market converts more (the cell's own price sensitivity), at most priceCap ×.
      // The same seasonality and event demand that move the market move the target group.
      const pull = cells().map((cell, c) => (targetShare[c] ? targetShare[c] * season * demandOf[c] * Math.min(K.priceCap, Math.exp(-R.behavior[cell[3]].price * (cell[4] === 1 ? R.commercialPrice : 1) * Math.log(offerFor(strategies[i], cell) / risk[c].reference))) : 0));
      const wanted = leads * hit * pull.reduce((a, b) => a + b, 0);
      const cap = p.gifts / p.gift.cost, scale = wanted > cap ? cap / wanted : 1;
      pull.forEach((v, c) => { if (v) counts[i][c] += leads * hit * v * scale; });
      return { offer: p.gift.id, share: p.share, reach, leads, customers: wanted * scale, wanted, giftsUsed: wanted * scale * p.gift.cost, giftBudget: p.gifts, media: p.media, impressions: impressions[i] };
    });

    const rows = teamList.map((t, i) => {
      const s = strategies[i], l = ledgers[i], [u1, u2] = draws.teams[t.id][m];
      const camp = campaign[i];
      l.campaignCustomers = (l.campaignCustomers || 0) + camp.customers;
      let policiesSold = 0, gwp = 0, expectedCount = 0, expectedCost = 0, acquisition = 0;
      const byChannel = Array(channels).fill(0), byPersona = Array(personas).fill(0);
      counts[i].forEach((k, c) => {
        if (!k) return;
        const cell = cells()[c], premium = k * offerFor(s, cell);
        const shock = live.reduce((x, e) => x * (inScope(e.scope, cell) ? e.cost ?? 1 : 1), 1);
        policiesSold += k; gwp += premium; acquisition += premium * R.dimensions.channel[cell[1]].expense;
        expectedCount += k * risk[c].freq * shock; expectedCost += k * risk[c].cost * shock;
        byChannel[cell[1]] += k; byPersona[cell[3]] += k;
      });
      l.cohorts.push({ count: expectedCount });
      l.policies += policiesSold; l.gwp += gwp; l.acquisition += acquisition; l.expectedCost += expectedCost;
      byChannel.forEach((v, k) => { l.channel[k] += v; }); byPersona.forEach((v, k) => { l.persona[k] += v; });

      // Claims operations: the in-force book reports claims every month; capacity is claims per month.
      // Overload lowers the service score and leaks cost into this month's claims.
      const reported = l.cohorts.reduce((a, x) => a + x.count / 12, 0);
      const capacity = s.claimsOps / 12 / (svc.handling * R.model.severity);
      const utilization = capacity > 0 ? reported / capacity : reported ? Infinity : 0;
      const serviceScore = clamp(svc.max - svc.slope * Math.max(0, utilization - svc.threshold), svc.floor, svc.max);
      const leakage = 1 + svc.leakage * Math.min(3, Math.max(0, utilization - 1));

      // Underwriting-year basis: this month's policies book their full-year premium and ultimate claims.
      const meanSev = expectedCount ? expectedCost / expectedCount : R.model.severity;
      const draw = claimDraw(expectedCount, meanSev, R.model.gammaShape, u1, u2);
      const count = draw.count, claims = draw.amount * leakage;

      const re = s.reinsurance ? R.reinsurance.share : 0;
      const commission = gwp * re * R.reinsurance.commission;
      const monthExpenses = acquisition + money.fixedMonthly + cascoSpend(s, money) / 12 - commission;
      const profitBefore = l.profit;
      l.claims += claims; l.claimCount += count; l.ceded += gwp * re; l.recovery += claims * re; l.expenses += monthExpenses;
      l.serviceSum += serviceScore; l.service = serviceScore;

      const netEarned = l.gwp - l.ceded, netClaims = l.claims - l.recovery;
      const profit = netEarned - netClaims - l.expenses;
      l.profit = profit;
      const equity = money.capital + profit;
      l.minEquity = Math.min(l.minEquity, equity);
      l.eligible = l.eligible && (!R.capitalRule || equity >= 0);
      return {
        id: t.id, policies: l.policies, newPolicies: policiesSold, gwp: l.gwp, earned: l.gwp, netEarned, netClaims, ceded: l.ceded, recovery: l.recovery,
        expenses: l.expenses, acquisition: l.acquisition, profit, monthProfit: profit - profitBefore, equity,
        service: l.serviceSum / (m + 1), monthService: serviceScore, capacity, load: reported, utilization, claimCount: l.claimCount,
        // NPS: the year's average service score on a −100…+100 scale (98 → +96, 50 → 0, 30 → −40).
        nps: Math.round(2 * l.serviceSum / (m + 1) - 100), monthNps: Math.round(2 * serviceScore - 100),
        grossLossRatio: l.gwp ? l.claims / l.gwp : 0,
        lossRatio: netEarned ? netClaims / netEarned : 0, combinedRatio: netEarned ? (netClaims + l.expenses) / netEarned : 0,
        monthLossRatio: gwp ? claims / gwp : 0, eligible: l.eligible, minEquity: l.minEquity,
        segments: [...l.persona], channels: [...l.channel], monthSegments: byPersona, monthGwp: gwp, monthClaims: claims,
        expectedLossRatio: l.gwp ? l.expectedCost / l.gwp : 0,
        campaign: { ...camp, frequency, audience, total: l.campaignCustomers },
        exposed: live.filter(e => e.scope !== 'all').map(e => e.title),
        score: 0, share: 0, unitShare: 0, monthShare: 0, components: []
      };
    });

    const totalGwp = rows.reduce((v, x) => v + x.gwp, 0), totalPolicies = rows.reduce((v, x) => v + x.policies, 0);
    const monthGwp = rows.reduce((v, x) => v + x.monthGwp, 0);
    const pace = (m + 1) / 12, shareTarget = Math.min(1, money.shareTarget / n);
    for (const r of rows) {
      r.share = totalGwp ? r.gwp / totalGwp : 0;
      r.unitShare = totalPolicies ? r.policies / totalPolicies : 0;
      r.monthShare = monthGwp ? r.monthGwp / monthGwp : 0;
      const ratio = r.profit / money.capital;
      r.components = [
        clamp((ratio - money.profitFloor * pace) / ((money.profitTarget - money.profitFloor) * pace) * 100, 0, 100),
        clamp(r.share / shareTarget * 100, 0, 100),
        clamp(r.service / money.serviceTarget * 100, 0, 100)
      ];
      r.score = r.components.reduce((sum, v, k) => sum + v * config.weights[k] / 100, 0);
    }
    // Market-wide indices for the stage: effects of events that hit the whole market this month.
    const wide = live.filter(e => !e.scope || e.scope === 'all');
    const costIndex = wide.reduce((x, e) => x * (e.cost ?? 1), 1), demandIndex = wide.reduce((x, e) => x * (e.demand ?? 1), 1);
    months.push({ month: m, rows: rankRows(rows), events: live, totalGwp, monthGwp, totalPolicies, available, nonBuyers: outsideSold, pace, costIndex, demandIndex,
      ...(trace ? { trace: teamList.map((t, i) => ({ id: t.id, market: marketCounts[i], campaign: Array.from(counts[i], (v, c) => v - marketCounts[i][c]) })) } : {}) });
  }
  return months;
}

// Eligible teams first, then score, profit and share; equal results share a place.
function rankRows(rows) {
  const sorted = [...rows].sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.score - a.score || b.profit - a.profit || b.share - a.share);
  let place = 1;
  return sorted.map((r, i) => {
    const p = sorted[i - 1];
    if (i && !(r.score === p.score && r.profit === p.profit && r.share === p.share && r.eligible === p.eligible)) place = i + 1;
    return { ...r, rank: place };
  });
}

// ——— Reference strategies (tests, balance test, rule-studio preview) ———
// Actuarial: each coefficient is that level's true relative risk (frequency × severity coefficient),
// normalised to the sample's average for the dimension.
export function actuarialCoefficients(R = DEFAULT_RULES) {
  const coef = {};
  for (const dim of DIMENSIONS) {
    const k = DIMENSIONS.indexOf(dim), levelsOf = R.dimensions[dim];
    let n = 0, sum = 0;
    for (const c of cells()) { const lv = levelsOf[c[k]]; n += c[5]; sum += c[5] * lv.freq * lv.sev; }
    const mean = sum / n;
    coef[dim] = levelsOf.map(lv => snapCoef(lv.freq * lv.sev / mean, R));
  }
  return coef;
}

// The base premium that makes a book priced with `coef` run at `lossRatio` across the whole sample.
export function actuarialBase(coef, lossRatio = 0.7, R = DEFAULT_RULES) {
  let cost = 0, rel = 0;
  for (const c of cells()) { cost += c[5] * cellRisk(c, R).cost; rel += c[5] * DIMENSIONS.reduce((p, dim, k) => p * coef[dim][c[k]], 1); }
  return Math.round(cost / rel / lossRatio * 100) / 100;
}

// How a plan reads the market: the loss ratio its prices imply on the sample, and how far its
// coefficients sit from the true risk relativities (0 = priced exactly by risk) and from a flat tariff.
export function bookProfile(s, config) {
  const R = cascoRulesOf(config), act = actuarialCoefficients(R);
  let cost = 0, premium = 0;
  for (const c of cells()) { cost += c[5] * cellRisk(c, R).cost; premium += c[5] * offerFor(s, c); }
  let dataGap = 0, flatGap = 0, spread = 0, n = 0;
  for (const dim of DIMENSIONS) s.coef[dim].forEach((v, i) => { dataGap += Math.abs(Math.log(v / act[dim][i])); flatGap += Math.abs(Math.log(v)); spread += Math.abs(Math.log(act[dim][i])); n++; });
  // spread: how far the risk-based coefficients sit from a flat tariff — the yardstick for both gaps.
  return { impliedLossRatio: premium ? cost / premium : 0, dataGap: dataGap / n, flatGap: flatGap / n, spread: spread / n };
}
