import { locale, t } from './i18n.js';

export const fmt = (n, digits = 0) =>
  Number(n).toLocaleString(locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits });

const sign = (n, signed) => (n < 0 ? '−' : signed && n > 0 ? '+' : '');

// $12.4M · $1.24B · $850K · $17,100  /  ₺12,4 mn · ₺1,24 mr · ₺850 bin · ₺17.100
export function money(n, { signed = false, exact = false } = {}) {
  const a = Math.abs(n), symbol = '€';
  if (exact || a < 1e5) return `${sign(n, signed)}${symbol}${fmt(a)}`;
  if (a >= 1e9) return `${sign(n, signed)}${symbol}${fmt(a / 1e9, 2)}${t('B', ' mr')}`;
  if (a >= 1e6) return `${sign(n, signed)}${symbol}${fmt(a / 1e6, 1)}${t('M', ' mn')}`;
  return `${sign(n, signed)}${symbol}${fmt(a / 1e3, 1)}${t('K', ' bin')}`;
}

export const pct = (n, digits = 1, signed = false) => `${sign(n, signed)}${fmt(Math.abs(n) * 100, digits)}%`;
export const points = (n, digits = 1, signed = false) => `${sign(n, signed)}${fmt(Math.abs(n), digits)}`;
export const pad = n => String(n).padStart(2, '0');
// Only ever call these on text that is already fully in the current language — never on a
// string that might still contain the other language, or Turkish's dotted/dotless i rules
// will corrupt it.
export const upper = s => String(s).toLocaleUpperCase(locale());
export const lower = s => String(s).toLocaleLowerCase(locale());

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export function clock(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}
