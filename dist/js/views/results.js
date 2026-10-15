import { getState, seasonDone, playhead, raceStarted, results } from '../store.js';
import { icon, emblem, byId } from '../ui.js';
import { money, fmt, pct, short, esc } from '../format.js';
import { yearPlan } from '../../engine.js';
import { hostPage as shell } from './host.js';
import { t } from '../i18n.js';

const hostPage = content => shell('results', content, `<button class="btn ghost sm" data-action="audit-workbook">${icon('sliders', 15)} ${t('Calculation workbook (.xlsx)', 'Hesap dosyası (.xlsx)')}</button><button class="btn ghost sm" data-action="policy-file">${icon('file', 15)} ${t('Policy data (.xlsx)', 'Poliçe verisi (.xlsx)')}</button><button class="btn ghost sm" data-action="export">${icon('file', 15)} ${t('Download results', 'Sonuçları indir')}</button><button class="btn gold sm" data-action="new-game">${icon('reset', 15)} ${t('New game, same teams', 'Aynı takımlarla yeni oyun')}</button>`);

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
      <div class="podium-who">${emblem(t2, i === 0 ? 'xl' : 'lg')}<strong class="display">${short(t2.name)}</strong><span class="num">${award.value(r)}</span></div>
      <div class="podium-step"><b class="display">${i === 0 ? icon('cup', 44) : i + 1}</b><span>${labels[i]}</span></div>
    </div>`;
  }).join('')}</div>`;
}

// One podium per trophy, side by side.
export function awardPodiums(rows, teams, cls = '') {
  return `<div class="award-podiums ${cls}">${AWARDS.map((award, k) => `<section class="award" style="--k:${k}"><header><span class="award-icon">${icon(award.icon, 20)}</span><div><h2 class="display">${award.label}</h2><small>${award.basis}</small></div></header>${podium(rows, teams, 'award-podium', award)}</section>`).join('')}</div>`;
}

export function resultsPage() {
  const s = getState();
  if (!raceStarted() || !seasonDone()) {
    const m = playhead().month;
    return hostPage(`${pageHead(t('Results', 'Sonuçlar'), t('The championship isn’t decided yet.', 'Şampiyonluk henüz belli değil.'), t('Detailed results open once all twelve months are complete.', 'Ayrıntılı sonuçlar on iki ay tamamlandığında açılır.'))}
      <section class="empty panel cut">${icon('cup', 56)}<h2 class="display">${Math.max(0, m + 1)} / 12 ${t('months', 'ay')}</h2><p class="muted">${t('Follow the race’s progress on the stage screen.', 'Yarışın gidişatını sahne ekranından takip et.')}</p><a class="btn go" href="#/stage">${t('Back to stage', 'Sahneye dön')} ${icon('arrow', 16)}</a></section>`);
  }
  // One table: the year's result per team, ordered by market share.
  const rows = [...results()[11].rows].sort((x, y) => y.share - x.share || y.gwp - x.gwp);
  const content = `
  ${pageHead(t(`Season finale · ${s.config.year}`, `Sezon finali · ${s.config.year}`), t('Detailed results', 'Ayrıntılı sonuçlar'), t('The shared casco market’s results after twelve months.', 'Ortak kasko pazarının on iki ay sonundaki sonuçları.'), '')}
  <section class="panel standings">
    <header><span class="faint small">${t('Each team’s premium is spent on claims, commission, running costs and marketing; what is left is the profit margin. A combined ratio above 100% is a loss.', 'Her takımın primi hasara, komisyona, işletme giderine ve pazarlamaya gider; kalanı kâr marjıdır. Bileşik oran %100’ü geçerse zarar edilir.')}</span><span class="results-analysis-hint">${icon('eye', 16)} ${t('Select a team name for its detailed analysis.', 'Detaylı analiz için takım adına tıkla.')}</span></header>
    <div class="table-wrap"><table class="results-table">
      <thead>
        <tr><th colspan="8"></th><th colspan="6" class="group">${t('As a share of gross premium', 'Brüt primin yüzdesi olarak')}</th></tr>
        <tr><th>${t('Rank', 'Sıra')}</th><th>${t('Team', 'Takım')}</th><th class="sorted">${t('Market share', 'Pazar payı')}</th><th>${t('Gross premium', 'Brüt prim')}</th><th>${t('Policies', 'Poliçe adedi')}</th><th>${t('Profit', 'Kâr')}</th><th>${t('Marketing budget', 'Pazarlama bütçesi')}</th><th>${t('Customers from marketing', 'Pazarlamadan gelen müşteri')}</th>
          <th class="group-start">${t('Loss ratio', 'Hasar oranı')}</th><th>${t('Commission', 'Komisyon')}</th><th>${t('Running costs', 'İşletme gideri')}</th><th>${t('Marketing', 'Pazarlama')}</th><th>${t('Combined ratio', 'Bileşik oran')}</th><th>${t('Profit margin', 'Kâr marjı')}</th></tr>
      </thead>
      <tbody>${rows.map((r, i) => {
        const t2 = byId(s.teams, r.id), g = r.gwp || 1;
        const claims = r.claims / g, commission = (r.commission ?? 0) / g, marketing = (r.marketing ?? 0) / g;
        const running = (r.expenses - (r.commission ?? 0) - (r.marketing ?? 0)) / g, combined = claims + commission + running + marketing;
        return `<tr style="--team:${t2.color}">
        <td class="num rank">${String(i + 1).padStart(2, '0')}</td>
        <td><button type="button" class="team-link result-team-link" data-action="team-analysis" data-team="${t2.id}" aria-haspopup="dialog" aria-label="${esc(t(`Open analysis for ${t2.name}`, `${t2.name} takımının analizini aç`))}">${emblem(t2, 'sm')}<b>${short(t2.name)}</b>${icon('chevron', 14)}</button></td>
        <td class="num strong sorted">${pct(r.share)}</td><td class="num">${money(r.gwp)}</td><td class="num">${fmt(r.policies)}</td>
        <td class="num ${r.profit < 0 ? 'down' : ''}">${money(r.profit)}</td>
        <td class="num">${money(yearPlan(t2).marketing)}</td><td class="num">${fmt(r.campaign?.total ?? 0)}</td>
        <td class="num group-start ${claims > 1 ? 'down' : ''}">${pct(claims)}</td><td class="num">${pct(commission)}</td><td class="num">${pct(running)}</td><td class="num">${pct(marketing)}</td>
        <td class="num strong ${combined > 1 ? 'down' : ''}">${pct(combined)}</td><td class="num strong ${1 - combined < 0 ? 'down' : 'up'}">${pct(1 - combined)}</td>
        </tr>`; }).join('')}</tbody>
    </table></div>
  </section>
  `;
  return hostPage(content);
}
