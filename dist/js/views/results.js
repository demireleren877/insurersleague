import { getState, seasonDone, playhead, raceStarted, results } from '../store.js';
import { icon, emblem, byId, stamped } from '../ui.js';
import { money, fmt, pct, short, esc } from '../format.js';
import { cascoMoney } from '../../engine.js';
import { hostPage as shell } from './host.js';
import { t } from '../i18n.js';

const hostPage = content => shell('results', content, `<button class="btn ghost sm" data-action="audit-workbook">${icon('sliders', 15)} ${t('Calculation workbook (.xlsx)', 'Hesap dosyası (.xlsx)')}</button><button class="btn ghost sm" data-action="policy-file">${icon('file', 15)} ${t('Policy data (.xlsx)', 'Poliçe verisi (.xlsx)')}</button><button class="btn ghost sm" data-action="segment-prices">${icon('chart', 15)} ${t('Segment prices', 'Segment fiyatları')}</button><button class="btn gold sm" data-action="new-game">${icon('reset', 15)} ${t('New game, same teams', 'Aynı takımlarla yeni oyun')}</button>`);

const pageHead = (kicker, title, lead, extra = '') => `<div class="page-head"><div><p class="kicker blue">${kicker}</p><h1 class="display">${title}</h1><p class="lead">${lead}</p></div>${extra ? `<div class="page-head-extra">${extra}</div>` : ''}</div>`;

// The trophies: each criterion crowns its own podium.
export const AWARDS = [
  // One trophy: total points (profit points + share points), then profit. Bankrupt teams can't win it.
  { id: 'score', icon: 'cup', get label() { return t('SVM Cup', 'SVM Kupası'); }, get basis() { return t('Total points: profit + market share, 0–200', 'Toplam puan: kâr + pazar payı, 0–200'); }, value: r => `${fmt(r.score, 1)} ${t('pts', 'puan')}`, sort: (a, b) => b.score - a.score || b.profit - a.profit }
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
  // The trophy table: ranked by total points, then profit; bankrupt teams last and stamped.
  const rows = results()[11].rows, cup = AWARDS[0];
  const content = `
  ${pageHead(t(`Season finale · ${s.config.year}`, `Sezon finali · ${s.config.year}`), cup.label, t('The ranking is the trophy: total points (profit points + share points), ties broken by profit.', 'Sıralama kupanın kendisi: toplam puan (kâr puanı + pay puanı), eşitlikte kâr.'), '')}
  <section class="panel standings">
    <header><span class="faint small">${t(`Profit points: below €0 none, €0 → 50, ${money(cascoMoney(s.config).profitTarget)} → 100. Share points: below ${pct(cascoMoney(s.config).shareFloor, 0)} none, from it 50, ${pct(cascoMoney(s.config).shareTarget, 0)} → 100. A combined ratio above ${pct(cascoMoney(s.config).bankruptRatio, 0)} is bankruptcy.`, `Kâr puanı: €0 altı yok, €0 → 50, ${money(cascoMoney(s.config).profitTarget)} → 100. Pay puanı: ${pct(cascoMoney(s.config).shareFloor, 0)} altı yok, ondan itibaren 50, ${pct(cascoMoney(s.config).shareTarget, 0)} → 100. Bileşik oran ${pct(cascoMoney(s.config).bankruptRatio, 0)}’i aşarsa takım batar.`)}</span><span class="results-analysis-hint">${icon('eye', 16)} ${t('Select a team name for its detailed analysis.', 'Detaylı analiz için takım adına tıkla.')}</span></header>
    <div class="table-wrap"><table class="results-table">
      <thead>
        <tr><th colspan="2"></th><th colspan="3" class="group">${t('Points', 'Puan')}</th><th colspan="5"></th><th colspan="5" class="group group-start">${t('As a share of gross premium', 'Brüt primin yüzdesi olarak')}</th></tr>
        <tr><th>${t('Rank', 'Sıra')}</th><th>${t('Team', 'Takım')}</th><th>${t('Profit', 'Kâr')}</th><th>${t('Share', 'Pay')}</th><th class="sorted">${t('Total', 'Toplam')}</th>
          <th>${t('Profit', 'Kâr')}</th><th>${t('Gross premium', 'Brüt prim')}</th><th>${t('Market share', 'Pazar payı')}</th><th>${t('Policies', 'Poliçe adedi')}</th><th>${t('Customers from marketing', 'Pazarlamadan gelen müşteri')}</th>
          <th class="group-start">${t('Loss ratio', 'Hasar oranı')}</th><th>${t('Commission', 'Komisyon')}</th><th>${t('Running costs', 'İşletme gideri')}</th><th>${t('Marketing', 'Pazarlama')}</th><th>${t('Combined ratio', 'Bileşik oran')}</th></tr>
      </thead>
      <tbody>${rows.map((r, i) => {
        const t2 = byId(s.teams, r.id), g = r.gwp || 1;
        const claims = r.claims / g, commission = (r.commission ?? 0) / g, marketing = (r.marketing ?? 0) / g;
        const running = (r.expenses - (r.commission ?? 0) - (r.marketing ?? 0)) / g, combined = claims + commission + running + marketing;
        const winner = i === 0 && !r.bankrupt;
        return `<tr style="--team:${t2.color}" class="${winner ? 'winner' : ''} ${r.bankrupt ? 'bankrupt' : ''}">
        <td class="num rank">${winner ? icon('cup', 20) : String(i + 1).padStart(2, '0')}</td>
        <td><div class="team-cell"><button type="button" class="team-link result-team-link" data-action="team-analysis" data-team="${t2.id}" aria-haspopup="dialog" aria-label="${esc(t(`Open analysis for ${t2.name}`, `${t2.name} takımının analizini aç`))}">${emblem(t2, 'sm')}<b>${stamped(short(t2.name), r.bankrupt)}</b>${icon('chevron', 14)}</button></div></td>
        <td class="num">${fmt(r.components[0], 1)}</td><td class="num">${fmt(r.components[1], 1)}</td><td class="num strong sorted">${fmt(r.score, 1)}</td>
        <td class="num ${r.profit < 0 ? 'down' : ''}">${money(r.profit)}</td><td class="num">${money(r.gwp)}</td><td class="num">${pct(r.share)}</td><td class="num">${fmt(r.policies)}</td>
        <td class="num">${fmt(r.campaign?.total ?? 0)}</td>
        <td class="num group-start ${claims > 1 ? 'down' : ''}">${pct(claims)}</td><td class="num">${pct(commission)}</td><td class="num">${pct(running)}</td><td class="num">${pct(marketing)}</td>
        <td class="num strong ${combined > 1 ? 'down' : ''}">${pct(combined)}</td>
        </tr>`; }).join('')}</tbody>
    </table></div>
  </section>
  `;
  return hostPage(content);
}
