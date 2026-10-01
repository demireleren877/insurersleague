// Interface language: personal to this device. Every visible string in the views is authored
// with both languages at the source via t(english, turkish) — never pattern-matched after
// rendering, so there is no way for a sentence to come out half-translated.
// Room content (segment names, quiz questions, server error text) is a separate, one-time
// choice made when the room is created (see game.js/engine.js `lang`); it never changes after.
const KEY = 'insurers-league:lang';
const listeners = new Set();

function detect() {
  try { const saved = localStorage.getItem(KEY); if (saved === 'en' || saved === 'tr') return saved; } catch { /* ignore */ }
  try { if ((navigator.language || '').toLowerCase().startsWith('tr')) return 'tr'; } catch { /* ignore */ }
  return 'en';
}

let lang = detect();

export const getLang = () => lang;
export const locale = () => (lang === 'tr' ? 'tr-TR' : 'en-US');
export function setLang(next) {
  if ((next !== 'en' && next !== 'tr') || next === lang) return;
  lang = next;
  try { localStorage.setItem(KEY, lang); } catch { /* ignore */ }
  listeners.forEach(fn => fn(lang));
}
export const onLangChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };

// One shared control, placed by each surface in its own header utility area.
// The language remains personal to this browser; only its placement changes with the shell.
export const languageControl = (compact = false) => `<div class="language-switch${compact ? ' compact' : ''}" role="group" aria-label="${t('Interface language', 'Arayüz dili')}">
  <button type="button" data-language="tr" aria-label="Türkçe">TR</button><button type="button" data-language="en" aria-label="English">EN</button>
</div>`;

// t(english, turkish): the one and only way visible text picks a language. Always call it with
// both strings written out in full — never with a partial phrase — so nothing can render half-translated.
export const t = (en, tr) => (lang === 'tr' ? tr : en);
