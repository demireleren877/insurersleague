import { getState, seasonDone, playhead, raceStarted, results } from '../store.js';
import { icon, emblem, byId } from '../ui.js';
import { esc, money, fmt, pct } from '../format.js';
import { rank, localizedTeamProduct, levelName, bookProfile, strategyAt, rulesOf, campaignOf } from '../../engine.js';
import { debrief, rankHistory, ARCHETYPES, archetypeKey } from '../narrative.js';
import { bump } from './charts.js';
import { impactPanel } from './impact.js';
import { planTable, giftMix } from './plan.js';
import { hostPage as shell } from './host.js';
import { t, getLang } from '../i18n.js';

const hostPage = content => shell('results', content, `<button class="btn ghost sm" data-action="audit-workbook">${icon('sliders', 15)} ${t('Calculation workbook (.xlsx)', 'Hesap dosyası (.xlsx)')}</button><button class="btn ghost sm" data-action="export">${icon('file', 15)} ${t('Download results', 'Sonuçları indir')}</button><button class="btn gold sm" data-action="new-game">${icon('reset', 15)} ${t('New game, same teams', 'Aynı takımlarla yeni oyun')}</button>`);

const pageHead = (kicker, title, lead, extra = '') => `<div class="page-head"><div><p class="kicker blue">${kicker}</p><h1 class="display">${title}</h1><p class="lead">${lead}</p></div>${extra ? `<div class="page-head-extra">${extra}</div>` : ''}</div>`;

// The trophies: each criterion crowns its own podium.
export const AWARDS = [
  { id: 'profit', icon: 'coins', get label() { return t('Profitability', 'Kârlılık'); }, get basis() { return t('Year-end technical profit', 'Yıl sonu teknik kâr'); }, value: r => money(r.profit), sort: (a, b) => b.profit - a.profit },
  { id: 'share', icon: 'chart', get label() { return t('Market share', 'Pazar payı'); }, get basis() { return t('Gross premium share', 'Brüt prim payı'); }, value: r => pct(r.share), sort: (a, b) => b.share - a.share || b.gwp - a.gwp }
];

export function podium(rows, teams, cls = '', award = AWARDS[0]) {
  const eligible = rows.filter(r => r.eligible).sort(award.sort).slice(0, 3);
  if (!eligible.length) return `<p class="muted">${t('No results yet.', 'Henüz sonuç yok.')}</p>`;
  const labels = [t('WINNER', 'BİRİNCİ'), t('RUNNER-UP', 'İKİNCİ'), t('THIRD', 'ÜÇÜNCÜ')];
  return `<div class="podium ${cls}">${[1, 0, 2].map(i => {
    const r = eligible[i]; if (!r) return '<div></div>';
    const t2 = byId(teams, r.id);
    return `<div class="podium-slot p${i + 1}" style="--team:${t2.color}">
      <div class="podium-who">${emblem(t2, i === 0 ? 'xl' : 'lg')}<strong class="display">${esc(t2.name)}</strong><span class="num">${award.value(r)}</span></div>
      <div class="podium-step"><b class="display">${i === 0 ? icon('cup', 44) : i + 1}</b><span>${labels[i]}</span></div>
    </div>`;
  }).join('')}</div>`;
}

// One podium per trophy, side by side.
export function awardPodiums(rows, teams, cls = '') {
  return `<div class="award-podiums ${cls}">${AWARDS.map((award, k) => `<section class="award" style="--k:${k}"><header><span class="award-icon">${icon(award.icon, 20)}</span><div><h2 class="display">${award.label}</h2><small>${award.basis}</small></div></header>${podium(rows, teams, 'award-podium', award)}</section>`).join('')}</div>`;
}

// The results page shows one category at a time; the tabs switch the podium and the table's order.
let category = 0;
export const setResultsCategory = k => { category = Math.max(0, Math.min(AWARDS.length - 1, Number(k) || 0)); };

function categoryTabs() {
  return `<nav class="results-tabs" aria-label="${t('Categories', 'Kategoriler')}">${AWARDS.map((a, k) => `<button data-action="results-category" data-category="${k}" aria-pressed="${k === category}">${icon(a.icon, 16)} ${a.label}</button>`).join('')}</nav>`;
}

// What the book actually turned out to be: shares by persona and by channel.
function realized(r) {
  const lang = getLang();
  const split = (list, dim) => list.map((n, i) => `${levelName(dim, i, lang)} ${fmt(n / Math.max(1, r.policies) * 100)}%`).join(' · ');
  return `<dl class="plan-budget"><div><dt>${t('Customers won, by persona', 'Kazanılan müşteri, personaya göre')}</dt><dd>${split(r.segments, 'persona')}</dd></div>
    <div><dt>${t('…and by channel', '…ve kanala göre')}</dt><dd>${split(r.channels, 'channel')}</dd></div>
    <div><dt>${t('Won by the digital campaign', 'Dijital kampanyayla gelen')}</dt><dd>${fmt(r.campaign?.total ?? 0)} ${t('customers', 'müşteri')} (${fmt((r.campaign?.total ?? 0) / Math.max(1, r.policies) * 100)}%)</dd></div></dl>`;
}

export function resultsPage() {
  const s = getState();
  if (!raceStarted() || !seasonDone()) {
    const m = playhead().month;
    return hostPage(`${pageHead(t('Results', 'Sonuçlar'), t('The championship isn’t decided yet.', 'Şampiyonluk henüz belli değil.'), t('Detailed results open once all twelve months are complete.', 'Ayrıntılı sonuçlar on iki ay tamamlandığında açılır.'))}
      <section class="empty panel cut">${icon('cup', 56)}<h2 class="display">${Math.max(0, m + 1)} / 12 ${t('months', 'ay')}</h2><p class="muted">${t('Follow the race’s progress on the stage screen.', 'Yarışın gidişatını sahne ekranından takip et.')}</p><a class="btn go" href="#/stage">${t('Back to stage', 'Sahneye dön')} ${icon('arrow', 16)}</a></section>`);
  }
  const rows = rank(results()[11].rows);
  const focus = byId(s.teams, s.focusTeam) || byId(s.teams, rows[0].id);
  const fr = rows.find(r => r.id === focus.id);
  const d = debrief(focus, results(), s.config);
  const history = rankHistory(results(), 'gwp');
  const components = [t('Profitability', 'Kârlılık'), t('Market share', 'Pazar payı')];
  const award = AWARDS[category];
  const ordered = [...rows].sort(award.sort);
  const col = id => id === award.id ? 'sorted' : '';
  const content = `
  ${pageHead(t(`Season finale · ${s.config.year}`, `Sezon finali · ${s.config.year}`), t('The strategies raced. The results speak.', 'Stratejiler yarıştı. Sonuçlar konuşuyor.'), t('The shared casco market’s results after twelve months.', 'Ortak kasko pazarının on iki ay sonundaki sonuçları.'), '')}
  <section class="final-hero panel cut">${categoryTabs()}
    <div class="award results-award"><header><span class="award-icon">${icon(award.icon, 22)}</span><div><h2 class="display">${award.label}</h2><small>${award.basis}</small></div></header>${podium(rows, s.teams, 'award-podium', award)}</div>
  </section>

  <section class="panel standings">
    <header><h2 class="display">${t(`Standings · ${award.label}`, `Sıralama · ${award.label}`)}</h2><span class="faint small">${t('Pick a team: its decisions and results open below', 'Bir takım seç: kararları ve sonuçları aşağıda açılır')}</span></header>
    <div class="table-wrap"><table>
      <thead><tr><th>${t('Rank', 'Sıra')}</th><th>${t('Team', 'Takım')}</th><th>${t('Gross premium', 'Brüt prim')}</th><th class="${col('share')}">${t('Market share', 'Pazar payı')}</th><th class="${col('profit')}">${t('Technical profit', 'Teknik kâr')}</th><th>${t('Loss ratio', 'Hasar/prim')}</th><th>${t('Campaign customers', 'Kampanya müşterisi')}</th><th>${t('Combined ratio', 'Bileşik oran')}</th></tr></thead>
      <tbody>${ordered.map((r, i) => { const t2 = byId(s.teams, r.id); return `<tr class="${r.id === focus.id ? 'on' : ''}" style="--team:${t2.color}">
        <td class="num rank">${String(i + 1).padStart(2, '0')}</td>
        <td><button class="team-link" data-focus="${t2.id}" aria-pressed="${r.id === focus.id}">${emblem(t2, 'sm')}<b>${esc(t2.name)}</b></button></td>
        <td class="num strong">${money(r.gwp)}</td><td class="num ${col('share')}">${pct(r.share)}</td><td class="num ${r.profit < 0 ? 'down' : ''} ${col('profit')}">${money(r.profit)}</td><td class="num ${r.grossLossRatio > 1 ? 'down' : ''}">${pct(r.grossLossRatio)}</td><td class="num">${fmt(r.campaign?.total ?? 0)}</td><td class="num ${r.combinedRatio > 1 ? 'down' : ''}">${pct(r.combinedRatio)}</td>
        </tr>`; }).join('')}</tbody>
    </table></div>
  </section>

  <section class="panel season-story">
    <header><h2 class="display">${t('The season’s story', 'Sezonun hikayesi')}</h2><span class="faint small">${t('Gross-premium rank by month', 'Aylara göre brüt prim sırası')}</span></header>
    <div class="table-wrap">${bump(history, s.teams, { width: 1100, height: 320, highlight: focus.id })}</div>
  </section>

  <section class="panel focus" style="--team:${focus.color}">
    <header class="focus-head livery">${emblem(focus, 'lg')}<div><p class="kicker">${t(`What the decisions earned · ${money(fr.gwp)} gross premium · ${pct(fr.share)} share`, `Kararların karşılığı · ${money(fr.gwp)} brüt prim · ${pct(fr.share)} pay`)}</p><h2 class="display">${esc(focus.name)} · ${esc(localizedTeamProduct(focus, s.config, getLang()))}</h2></div></header>
    <div class="components">${fr.components.map((v, i) => `<div class="component">
      <span>${components[i]} <b>${s.config.weights[i]}%</b></span>
      <strong class="num">${fmt(v, 1)}<small>/100</small></strong>
      <div class="bar"><i style="width:${v}%"></i></div>
      <p>${t('Raw value', 'Ham değer')}: ${[t(`${money(fr.profit)} technical profit`, `${money(fr.profit)} teknik kâr`), t(`${pct(fr.share)} premium share`, `${pct(fr.share)} prim payı`)][i]}</p>
      <small>${t('Contribution to total', 'Toplama katkı')}: <b class="num">${fmt(v * s.config.weights[i] / 100, 1)}</b> ${t('points', 'puan')}</small>
    </div>`).join('')}</div>
    <div class="debrief">
      <article><p class="kicker blue">${t('What did you choose?', 'Ne seçtin?')}</p><h3>“${esc(focus.strategy.sentence)}”</h3><p>${d.chose}</p></article>
      <article><p class="kicker blue">${t('What happened?', 'Ne oldu?')}</p><h3>${pct(fr.share)} ${t('share', 'pay')} · ${money(fr.profit)} ${t('profit', 'kâr')}</h3><p>${d.happened}</p></article>
      <article class="tradeoff"><p class="kicker amber">${t('The defining trade-off', 'Belirleyici ödünleşim')}</p><h3>${d.tradeoff.title}</h3><p>${d.tradeoff.text}</p></article>
    </div>
    ${impactPanel(focus)}
    <details class="rules"><summary>${icon('file', 16)} ${t('The whole plan and the book it won', 'Planın tamamı ve kazandığı portföy')}</summary>
      <div class="focus-detail">${planTable(strategyAt(focus, 11), s.config)}${realized(fr)}</div>
    </details>
  </section>

  <section class="panel compare">
    <header><h2 class="display">${t('Strategy comparison', 'Strateji karşılaştırması')}</h2><span class="faint small">${t('The same market, different plans', 'Aynı pazar, farklı planlar')}</span></header>
    <div class="table-wrap"><table>
      <thead><tr><th>${t('Team', 'Takım')}</th><th>${t('Approach', 'Yaklaşım')}</th><th>${t('Base premium', 'Baz prim')}</th><th>${t('Priced for LR', 'Hedef HO')}</th><th>${t('LR it got', 'Gerçekleşen HO')}</th><th>${t('Marketing', 'Pazarlama')}</th><th>${t('Media', 'Medya')}</th><th>${t('Gifts', 'Hediyeler')}</th><th>${t('Policies', 'Poliçe')}</th><th>${t('Rank', 'Sıra')}</th></tr></thead>
      <tbody>${rows.map(r => { const t2 = byId(s.teams, r.id), st = strategyAt(t2, 11), p = bookProfile(st, s.config); return `<tr style="--team:${t2.color}" class="${r.id === focus.id ? 'on' : ''}">
        <td><button class="team-link" data-focus="${t2.id}">${emblem(t2, 'xs')}<b>${esc(t2.name)}</b></button></td>
        <td>${ARCHETYPES[archetypeKey(st, s.config)].name}</td><td class="num">€${fmt(st.basePremium, 2)}</td><td class="num">${pct(p.impliedLossRatio, 0)}</td><td class="num ${r.lossRatio > p.impliedLossRatio + 0.05 ? 'down' : ''}">${pct(r.lossRatio, 0)}</td>
        <td class="num">${money(st.marketing)}</td><td class="num">${campaignOf(st).media}%</td><td>${esc(giftMix(st, s.config))}</td>
        <td class="num">${fmt(r.policies)}</td><td class="num strong">${r.rank}.</td></tr>`; }).join('')}</tbody>
    </table></div>
  </section>
  `;
  return hostPage(content);
}
