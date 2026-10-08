// INSURERS LEAGUE — game content and engine façade.
// The market model lives in casco.js. This module gives the rest of the app one stable surface: the
// scenario (rules, assumptions, events), bilingual names for every segment level, and simulate/validate.
// Room content is fixed once in config.lang; names below are looked up per viewer for display.
import {
  DIMENSIONS, QUARTER_KEYS, NOMINAL_TEAMS, defaultCascoRules, cascoRulesOf, cascoAssumptions, cascoMoney, cascoSpend,
  defaultCascoStrategy, validateCasco, simulateCasco, strategyAt, planAt, monthlyMarketing, marketingSpent, inScope, referenceMarket, policiesOf, cellRisk, offerFor,
  marketCells, actuarialCoefficients, actuarialBase, bookProfile, drawsFor, normInv, snapCoef, campaignRules, campaignOf, campaignAudience
} from './casco.js';

export {
  DIMENSIONS, QUARTER_KEYS, cascoMoney, cascoSpend, strategyAt, planAt, monthlyMarketing, marketingSpent, inScope, referenceMarket, policiesOf, cellRisk, offerFor,
  marketCells, actuarialCoefficients, actuarialBase, bookProfile, drawsFor, normInv, snapCoef, campaignRules, campaignOf, campaignAudience
};

// Campaign gifts (Marketing_Input.xlsx), named per viewer.
const OFFER_NAMES = {
  concert: ['Discount on concert/event', 'Konser / etkinlik indirimi'], restaurant: ['Restaurant gift card', 'Restoran hediye kartı'],
  coffee: ['Coffee gift card', 'Kahve hediye kartı'], gym: ['Discount on gym membership', 'Spor salonu üyelik indirimi']
};
export const offerName = (id, lang = 'en') => (OFFER_NAMES[id] ? (lang === 'tr' ? OFFER_NAMES[id][1] : OFFER_NAMES[id][0]) : String(id));

export const BASE_TEAMS = NOMINAL_TEAMS;
export const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MONTHS_TR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
export const monthsOf = lang => (lang === 'tr' ? MONTHS_TR : MONTHS_EN);
export const MONTHS = MONTHS_EN;

const L = (lang, en, tr) => (lang === 'tr' ? tr : en);

// ——— The one line of business ———
export const PRESET_IDS = ['casco'];
export const DEFAULT_PRESET = 'casco';
export const presetOf = () => DEFAULT_PRESET;
export const presetName = (_preset, lang = 'en') => L(lang, 'Casco', 'Kasko');
export const presetBlurb = (_preset, lang = 'en') => L(lang, 'Motor own-damage cover priced by city, channel, vehicle age, persona and customer type.', 'İl, kanal, araç yaşı, persona ve müşteri tipine göre fiyatlanan kasko.');

// ——— Segment names ———
// Level ids are the data's own labels ("Istanbul", "New/0-1y"); these are the display names.
const DIMENSION_NAMES = {
  city: ['City', 'İl'], channel: ['Channel', 'Kanal'], vehicle: ['Vehicle age', 'Araç yaşı'], persona: ['Persona', 'Persona'], type: ['Customer type', 'Müşteri tipi']
};
const LEVEL_NAMES = {
  city: [['Istanbul', 'İstanbul'], ['Ankara', 'Ankara'], ['Izmir', 'İzmir'], ['Bursa', 'Bursa'], ['Antalya', 'Antalya'], ['Other cities', 'Diğer iller']],
  channel: [['Agency', 'Acente'], ['Bank', 'Banka'], ['Digital', 'Dijital'], ['Broker', 'Broker']],
  vehicle: [['New (0–1 yrs)', 'Yeni (0–1 yaş)'], ['Mid (2–6 yrs)', 'Orta (2–6 yaş)'], ['Old (7+ yrs)', 'Eski (7+ yaş)']],
  persona: [['Bank customer', 'Banka müşterisi'], ['Post-claim', 'Hasar sonrası'], ['Price-driven', 'Fiyat odaklı'], ['Value-driven', 'Değer odaklı']],
  type: [['Individual', 'Bireysel'], ['Commercial', 'Ticari']]
};
export const dimensionName = (dim, lang = 'en') => L(lang, ...DIMENSION_NAMES[dim]);
export const levelName = (dim, i, lang = 'en') => (LEVEL_NAMES[dim]?.[i] ? L(lang, ...LEVEL_NAMES[dim][i]) : String(i));
export const levelNames = (dim, lang = 'en') => LEVEL_NAMES[dim].map(pair => L(lang, ...pair));
// Every way a level can be written: display names in both languages and the data's own id.
export const levelAliases = (dim, i, R = defaultCascoRules()) => [...LEVEL_NAMES[dim][i], R.dimensions[dim][i].id];

// ——— Rules, assumptions and events ———
export const defaultRules = () => defaultCascoRules();
export const rulesOf = config => cascoRulesOf(config);
export const assumptionsFor = (lang = 'en') => cascoAssumptions(lang);
export const ASSUMPTIONS = cascoAssumptions('en');

// Scope ids: 'all' or '<dimension>:<level>'.
export const eventScopesFor = lang => [
  { id: 'all', name: L(lang, 'Whole market', 'Tüm pazar') },
  ...DIMENSIONS.flatMap(dim => LEVEL_NAMES[dim].map((_, i) => ({ id: `${dim}:${i}`, name: `${dimensionName(dim, lang)}: ${levelName(dim, i, lang)}` })))
];
export const EVENT_SCOPES = eventScopesFor('en');

// cost: claims multiplier in scope · demand: customers coming to market in scope · duration in months.
const EVENT_TEXT = [
  { month: 2, duration: 10, cost: 1.08, demand: 1, scope: 'all',
    en: ['Spare-parts prices jump', 'The currency slide lifts imported parts prices; every claim costs about 8% more for the rest of the year.'],
    tr: ['Yedek parça fiyatları sıçradı', 'Kur artışı ithal parça fiyatlarını yükseltti; yıl sonuna kadar her hasar yaklaşık %8 daha pahalı.'] },
  { month: 5, duration: 1, cost: 1.6, demand: 1, scope: 'city:0',
    en: ['Hailstorm over Istanbul', 'A severe hailstorm hits Istanbul: claims from Istanbul policies written this month run 60% higher.'],
    tr: ['İstanbul’da dolu fırtınası', 'İstanbul’u sert bir dolu vurdu: bu ay yazılan İstanbul poliçelerinde hasar %60 yüksek.'] },
  { month: 6, duration: 2, cost: 1, demand: 1.3, scope: 'vehicle:0',
    en: ['New-car loan campaign', 'Cheap auto loans bring 30% more new-vehicle buyers to market for two months.'],
    tr: ['Sıfır araç kredi kampanyası', 'Ucuz taşıt kredisi iki ay boyunca pazara %30 daha fazla sıfır araç sahibi getiriyor.'] },
  { month: 8, duration: 1, cost: 1.12, demand: 1, scope: 'all',
    en: ['Holiday traffic', 'Long-weekend traffic lifts claim frequency across the market this month.'],
    tr: ['Bayram trafiği', 'Uzun bayram tatili trafiği bu ay tüm pazarda hasar sıklığını artırıyor.'] },
  { month: 9, duration: 2, cost: 1, demand: 0.8, scope: 'channel:2',
    en: ['Aggressive online rival', 'A digital-only insurer undercuts the market: 20% fewer digital customers are left for you.'],
    tr: ['Agresif dijital rakip', 'Yalnızca dijital çalışan bir sigortacı fiyat kırıyor: dijital müşterinin %20’si pazardan çekiliyor.'] }
];
const eventsFor = lang => EVENT_TEXT.map(e => ({ month: e.month, duration: e.duration, cost: e.cost, demand: e.demand, scope: e.scope, title: e[lang === 'tr' ? 'tr' : 'en'][0], description: e[lang === 'tr' ? 'tr' : 'en'][1] }));
export const EVENTS = eventsFor('en');

export function scenario(lang = 'en') {
  return {
    version: 'casco-1.0', seed: 2026, year: 2026, branch: presetName(DEFAULT_PRESET, lang), preset: DEFAULT_PRESET, minutes: 25, speed: 6,
    weights: [50, 50], lang, assumptions: cascoAssumptions(lang), events: eventsFor(lang), rules: defaultCascoRules()
  };
}

// Market figures for briefings: customers per month and the share that earns full points.
export function scaledMarket(config, n) {
  const money = cascoMoney(config);
  return { pool: policiesOf(config) / 12, shareTarget: Math.min(1, money.shareTarget / Math.max(1, n)) };
}

// ——— Display in the viewer's language ———
export const localizeRules = config => rulesOf(config);
export function localizedBranch(config, viewerLang) {
  const own = presetName(DEFAULT_PRESET, config?.lang);
  return !config?.branch || config.branch === own ? presetName(DEFAULT_PRESET, viewerLang) : config.branch;
}
export function localizedEventText(event, config, viewerLang) {
  if (!event || !config?.lang || config.lang === viewerLang) return event;
  const i = eventsFor(config.lang).findIndex(d => d.title === event.title && d.description === event.description);
  return i === -1 ? event : { ...event, title: eventsFor(viewerLang)[i].title, description: eventsFor(viewerLang)[i].description };
}
export function localizedEventTitle(title, config, viewerLang) {
  if (!config?.lang || config.lang === viewerLang) return title;
  const i = eventsFor(config.lang).findIndex(d => d.title === title);
  return i === -1 ? title : eventsFor(viewerLang)[i].title;
}
export function localizedTeamProduct(team, config, viewerLang) {
  const own = `${team.name} ${presetName(DEFAULT_PRESET, config?.lang)}`;
  return team.strategy.product === own ? `${team.name} ${presetName(DEFAULT_PRESET, viewerLang)}` : team.strategy.product;
}
export function localizedAssumption(config, key, viewerLang) {
  const a = config.assumptions[key];
  if (!config?.lang || config.lang === viewerLang) return a;
  const own = cascoAssumptions(config.lang)[key], target = cascoAssumptions(viewerLang)[key];
  return !own || a.label !== own.label ? a : { ...a, label: target.label, description: target.description };
}

// ——— Teams ———
export const TEAM_META = [
  { name: 'Atlas', code: 'ATL', color: '#43C6FF' },
  { name: 'Compass', code: 'CMP', color: '#AB98F8' },
  { name: 'Nova', code: 'NOV', color: '#FFBE55' },
  { name: 'Shield', code: 'SHD', color: '#57D8B3' },
  { name: 'Blue Wave', code: 'BLU', color: '#6D9CFF' },
  { name: 'Summit', code: 'SUM', color: '#FF887C' }
];

// Six sample approaches for previews and the balance test.
export function sampleStrategies(config) {
  const R = rulesOf(config), money = cascoMoney(config), B = money.budget;
  const act = actuarialCoefficients(R), flat = Object.fromEntries(DIMENSIONS.map(d => [d, act[d].map(() => 1)]));
  const tilt = (coef, dim, factors) => ({ ...coef, [dim]: coef[dim].map((v, i) => snapCoef(v * factors[i], R)) });
  const k = v => Math.round(v / 1000) * 1000;
  const base = { product: '', sentence: '', marketing: k(B * 0.5), mediaShare: 50, offers: [40, 30, 20, 10] };
  return [
    { id: 'actuary', ...base, coef: act, basePremium: actuarialBase(act, 0.62, R) },
    { id: 'flat', ...base, coef: flat, basePremium: actuarialBase(flat, 0.62, R) },
    { id: 'volume', ...base, coef: act, basePremium: actuarialBase(act, 0.75, R), marketing: k(B * 0.9), offers: [25, 25, 25, 25] },
    { id: 'margin', ...base, coef: act, basePremium: actuarialBase(act, 0.52, R), marketing: k(B * 0.25) },
    { id: 'digital', ...base, coef: tilt(act, 'channel', [1.05, 1.05, 0.9, 1.1]), basePremium: actuarialBase(act, 0.62, R), marketing: k(B * 0.8), mediaShare: 25, offers: [0, 20, 60, 20] },
    { id: 'gifts', ...base, coef: act, basePremium: actuarialBase(act, 0.6, R), marketing: k(B * 0.7), mediaShare: 30, offers: [10, 10, 0, 80] }
  ];
}
export function teams(lang = 'en', config = scenario(lang)) {
  return sampleStrategies(config).map((st, i) => ({
    id: i, ...TEAM_META[i], emblem: i, connected: true, locked: false, revision: false,
    strategy: { ...st, product: `${TEAM_META[i].name} ${presetName(DEFAULT_PRESET, lang)}`, sentence: '' }
  }));
}

// ——— Helpers and the engine ———
export const find = (list, id) => list.find(x => String(x.id) === String(id));
export const spend = s => cascoSpend(s);
export const defaultStrategy = config => defaultCascoStrategy(config);
// The plan as the year saw it: the final prices and campaign, with marketing as the year's total spend.
export const yearPlan = team => ({ ...strategyAt(team, 11), marketing: Math.round(marketingSpent(team, 12)) });
export const validate = (team, config, lang) => validateCasco(team, config, lang);
export const simulate = (teamList, config) => simulateCasco(teamList, config);

export function rank(rows, metric = 'score') {
  const sorted = [...rows].sort((a, b) =>
    (metric === 'score' ? Number(b.eligible) - Number(a.eligible) : 0) || b[metric] - a[metric] || b.profit - a.profit || b.share - a.share);
  let place = 1;
  return sorted.map((r, i) => {
    const p = sorted[i - 1];
    if (i && !(r[metric] === p[metric] && r.profit === p.profit && r.share === p.share && r.eligible === p.eligible)) place = i + 1;
    return { ...r, rank: place };
  });
}
