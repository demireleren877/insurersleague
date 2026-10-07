// A team's casco plan, in words and in a table: tiles, results and past sessions all read it the same way.
import { esc, fmt, money, pct } from '../format.js';
import { DIMENSIONS, dimensionName, levelName, bookProfile, campaignOf, offerName } from '../../engine.js';
import { ARCHETYPES, archetypeKey } from '../narrative.js';
import { t, getLang } from '../i18n.js';

// One line for a team tile: base premium, approach, main marketing channel.
export function planSummary(s, config) {
  const lang = getLang(), top = s.channelFocus.indexOf(Math.max(...s.channelFocus));
  const c = campaignOf(s);
  return `€${fmt(s.basePremium, 2)} ${t('base', 'baz')} · ${ARCHETYPES[archetypeKey(s, config)].name} · ${levelName('channel', top, lang)} ${s.channelFocus[top]}%${c.share ? ` · ${t('Campaign', 'Kampanya')} ${c.share}% (${offerName(c.offer, lang)})` : ''}${s.reinsurance ? ` · ${t('QS', 'Kota')}` : ''}`;
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
      <div><dt>${t('Focus', 'Odak')}</dt><dd>${s.channelFocus.map((v, i) => `${esc(levelName('channel', i, lang))} ${v}%`).join(' · ')}</dd></div>
      <div><dt>${t('Digital campaign', 'Dijital kampanya')}</dt><dd>${campaignOf(s).share ? t(`${campaignOf(s).share}% of marketing · media ${campaignOf(s).media}% · gift: ${offerName(campaignOf(s).offer, lang)}`, `Pazarlamanın %${campaignOf(s).share}’i · medya %${campaignOf(s).media} · hediye: ${offerName(campaignOf(s).offer, lang)}`) : t('None', 'Yok')}</dd></div>
      <div><dt>${t('Claims operations', 'Hasar operasyonu')}</dt><dd class="num">${money(s.claimsOps)}</dd></div>
      <div><dt>${t('Reinsurance', 'Reasürans')}</dt><dd>${s.reinsurance ? t('Quota-share', 'Kota paylı') : t('None', 'Yok')}</dd></div>
    </dl>
  </div>`;
}
