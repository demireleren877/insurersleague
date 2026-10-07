// Rule schema: the unit and bounds of every casco-market coefficient the moderator can change.
// Server-side validation and the rule studio UI both draw from this same definition.
import { defaultRules } from '../engine.js';

// format: x (multiplier) · pct (ratio, %) · eur (currency) · num · bool
const F = (format, min, max, step, extra = {}) => ({ format, min, max, step, ...extra });

const LEVEL_FIELDS = Object.fromEntries(['city', 'channel', 'vehicle', 'persona', 'type'].flatMap(dim => [
  [`dimensions.${dim}.#.freq`, F('x', 0.1, 5, 0.01)],
  [`dimensions.${dim}.#.sev`, F('x', 0.1, 5, 0.0001)],
  [`dimensions.${dim}.#.prem`, F('x', 0.1, 5, 0.0001)]
]));

export const RULE_FIELDS = {
  'model.frequency': F('pct', 0.001, 1, 0.001), 'model.severity': F('eur', 1, 1000000, 0.001),
  'model.lossRatio': F('pct', 0.1, 2, 0.01), 'model.gammaShape': F('num', 0.2, 20, 0.1),
  ...LEVEL_FIELDS,
  'dimensions.channel.#.expense': F('pct', 0, 0.6, 0.005),
  'behavior.#.price': F('num', 0, 10, 0.1), 'behavior.#.service': F('num', 0, 5, 0.1), 'behavior.#.channel': F('num', 0.2, 3, 0.1),
  'commercialPrice': F('x', 0.2, 2, 0.05),
  'market.outside': F('num', 0, 10, 0.1), 'market.seasonality': F('pct', 0, 0.5, 0.01),
  'coef.min': F('num', 0.1, 1, 0.05), 'coef.max': F('num', 1, 5, 0.05),
  'marketing.presence': F('num', 0, 2, 0.05), 'marketing.strength': F('num', 0, 3, 0.05), 'marketing.scale': F('pct', 0.0001, 0.05, 0.0001),
  'service.handling': F('pct', 0.01, 1, 0.01), 'service.threshold': F('pct', 0.1, 1.5, 0.01),
  'service.slope': F('num', 0, 300, 1), 'service.floor': F('num', 0, 100, 1), 'service.max': F('num', 1, 100, 1),
  'service.leakage': F('pct', 0, 1, 0.01), 'service.reputation': F('num', 0, 3, 0.1),
  'reinsurance.share': F('pct', 0, 0.9, 0.01), 'reinsurance.commission': F('pct', 0, 1, 0.01),
  'campaign.cpm': F('eur', 0.5, 200, 0.5), 'campaign.digitalUsers': F('num', 100000, 100000000, 100000), 'campaign.targetShare': F('pct', 0.01, 1, 0.01),
  'campaign.referenceBudget': F('eur', 100000, 100000000, 100000), 'campaign.frequency': F('num', 1, 50, 1), 'campaign.frequencyBonus': F('pct', 0, 1, 0.01),
  'campaign.priceCap': F('x', 1, 5, 0.1),
  'campaign.offers.#.interest': F('pct', 0, 1, 0.01), 'campaign.offers.#.click': F('pct', 0, 1, 0.01), 'campaign.offers.#.hit': F('pct', 0, 1, 0.01), 'campaign.offers.#.cost': F('eur', 0, 1000, 1),
  'capitalRule': { format: 'bool' }
};

export const fieldSpec = path => RULE_FIELDS[String(path).replace(/\.\d+(?=\.|$)/g, '.#')] || null;
export const getPath = (obj, path) => String(path).split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
export function setPath(obj, path, value) {
  const keys = String(path).split('.'), last = keys.pop();
  const target = keys.reduce((o, k) => (o == null ? undefined : o[k]), obj);
  if (target == null || !(last in target)) return false;
  target[last] = value;
  return true;
}

const em = (en, tr, lang) => (lang === 'tr' ? tr : en);

// Validates one field's value; returns { value } or { error }.
export function checkRule(rules, path, raw, lang = 'en') {
  const spec = fieldSpec(path);
  if (!spec || getPath(rules, path) === undefined) return { error: em('This rule can’t be edited.', 'Bu kural düzenlenemez.', lang) };
  if (spec.format === 'bool') return { value: !!raw };
  const v = Number(raw);
  if (!Number.isFinite(v)) return { error: em('Enter a number.', 'Bir sayı girin.', lang) };
  if (v < spec.min || v > spec.max) {
    const loc = lang === 'tr' ? 'tr-TR' : 'en-US';
    const show = n => (spec.format === 'pct' ? `${Number((n * 100).toFixed(2)).toLocaleString(loc)}%` : Number(n).toLocaleString(loc));
    return { error: em(`Value must be between ${show(spec.min)} and ${show(spec.max)}.`, `Değer ${show(spec.min)} ile ${show(spec.max)} arasında olmalı.`, lang) };
  }
  if (path === 'coef.min' && v >= rules.coef.max) return { error: em('The lowest coefficient must be below the highest.', 'En düşük katsayı en yükseğin altında olmalı.', lang) };
  if (path === 'coef.max' && v <= rules.coef.min) return { error: em('The highest coefficient must be above the lowest.', 'En yüksek katsayı en düşüğün üstünde olmalı.', lang) };
  if (path === 'service.floor' && v > rules.service.max) return { error: em('The floor score can’t exceed the max score.', 'Taban skor en yüksek skoru aşamaz.', lang) };
  if (path === 'service.max' && v < rules.service.floor) return { error: em('The max score can’t be below the floor score.', 'En yüksek skor taban skorun altında olamaz.', lang) };
  return { value: Math.round(v / spec.step) * spec.step === v ? v : Number(v.toFixed(6)) };
}

// The full rule set (for import): applies only the schema's valid fields on top of the defaults.
export function sanitizeRules(input, lang = 'en') {
  const rules = defaultRules();
  if (!input || typeof input !== 'object') return rules;
  const walk = (node, prefix) => {
    if (Array.isArray(node)) node.forEach((v, i) => walk(v, `${prefix}.${i}`));
    else if (node && typeof node === 'object') Object.entries(node).forEach(([k, v]) => walk(v, prefix ? `${prefix}.${k}` : k));
    else if (fieldSpec(prefix)) { const r = checkRule(rules, prefix, node, lang); if (!r.error) setPath(rules, prefix, r.value); }
  };
  walk(input, '');
  return rules;
}

// Number of fields that differ from the default. test: path → included?
export function changedCount(rules, test) {
  const defaults = defaultRules();
  let n = 0;
  const walk = (node, path) => {
    if (Array.isArray(node)) node.forEach((v, i) => walk(v, `${path}.${i}`));
    else if (node && typeof node === 'object') Object.entries(node).forEach(([k, v]) => walk(v, path ? `${path}.${k}` : k));
    else if (fieldSpec(path) && test(path) && getPath(defaults, path) !== node) n++;
  };
  walk(rules, '');
  return n;
}
