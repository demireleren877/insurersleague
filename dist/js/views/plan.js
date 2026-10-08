// A team's casco plan, in words and in a table: tiles, results and past sessions all read it the same way.
import { esc, fmt, money, pct } from '../format.js';
import { DIMENSIONS, dimensionName, levelName, bookProfile, campaignOf, campaignRules, rulesOf, offerName } from '../../engine.js';
import { ARCHETYPES, archetypeKey } from '../narrative.js';
import { t, getLang } from '../i18n.js';

// The gift weights in words, heaviest first: "Gym 60% · Coffee 40%".
export function giftMix(s, config, lang = getLang()) {
  const offers = campaignRules(rulesOf(config)).offers, w = campaignOf(s).weights;
  return offers.map((o, i) => [offerName(o.id, lang), w[i] || 0]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([n, v]) => `${n} ${v}%`).join(' · ');
}

// One line for a team tile: base premium, approach, marketing and its gifts.
export function planSummary(s, config) {
  const c = campaignOf(s);
  return `€${fmt(s.basePremium, 2)} ${t('base', 'baz')} · ${ARCHETYPES[archetypeKey(s, config)].name} · ${t('Marketing', 'Pazarlama')} ${money(s.marketing)} (${t('media', 'medya')} ${c.media}%) · ${giftMix(s, config)}`;
}

// The whole plan: price, the 19 coefficients, the budget.
export function planTable(s, config) {
  const lang = getLang(), p = bookProfile(s, config);
  return `<div class="plan">
    <dl class="plan-head">
      <div><dt>${t('Base premium', 'Baz prim')}</dt><dd class="num">€${fmt(s.basePremium, 2)}</dd></div>
      <div><dt>${t('Loss ratio its prices imply', 'Fiyatların ima ettiği hasar oranı')}</dt><dd class="num">${pct(p.impliedLossRatio, 0)}</dd></div>
      <div><dt>${t('Approach', 'Yaklaşım')}</dt><dd>${ARCHETYPES[archetypeKey(s, config)].name}</dd></div>
    </dl>
    <div class="plan-coef">${DIMENSIONS.map(dim => `<div><h5>${dimensionName(dim, lang)}</h5><ul>${s.coef[dim].map((v, i) => `<li><span>${esc(levelName(dim, i, lang))}</span><b class="num ${v > 1.02 ? 'up' : v < 0.98 ? 'down' : ''}">${fmt(v, 2)}</b></li>`).join('')}</ul></div>`).join('')}</div>
    <dl class="plan-budget">
      <div><dt>${t('Marketing', 'Pazarlama')}</dt><dd class="num">${money(s.marketing)}</dd></div>
      <div><dt>${t('Media / gifts', 'Medya / hediye')}</dt><dd class="num">${campaignOf(s).media}% / ${100 - campaignOf(s).media}%</dd></div>
      <div><dt>${t('Gift weights', 'Hediye ağırlıkları')}</dt><dd>${esc(giftMix(s, config, lang))}</dd></div>
    </dl>
  </div>`;
}
