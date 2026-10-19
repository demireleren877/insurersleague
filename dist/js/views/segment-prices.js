// The segment price table on the results page: why a team won or lost share in a segment.
import { getState, seasonDone } from '../store.js';
import { segmentPrices } from '../segment-prices.js';
import { emblem, byId } from '../ui.js';
import { fmt, pct, short } from '../format.js';
import { t, getLang } from '../i18n.js';
import { dimensionName, levelName } from '../../engine.js';

const euro = v => `€${fmt(v, 0)}`;

export function segmentPricesModal() {
  const s = getState(), lang = getLang();
  if (!seasonDone()) return { title: t('Segment prices', 'Segment fiyatları'), body: `<p class="muted">${t('Available once the season is over.', 'Sezon bitince açılır.')}</p>`, kind: 'modal' };
  const { teams, table } = segmentPrices(s);
  const head = teams.map(id => { const team = byId(s.teams, id); return `<th class="sp-team" style="--team:${team.color}">${emblem(team, 'xs')}<span>${short(team.name, 16)}</span></th>`; }).join('');
  const body = table.map(group => `<tbody>
      <tr class="sp-group"><th colspan="${teams.length + 2}">${dimensionName(group.dim, lang)}</th></tr>
      ${group.levels.map(row => {
        const cheapest = Math.min(...row.prices), most = Math.max(...row.shares);
        return `<tr><th class="sp-level">${levelName(group.dim, row.level, lang)}</th><td class="num sp-market">${euro(row.market)}</td>
          ${row.prices.map((p, i) => `<td class="num ${p === cheapest ? 'sp-best' : ''}"><b>${euro(p)}</b><small class="${row.shares[i] === most && most > 0 ? 'sp-top' : ''}">${pct(row.shares[i], 0)}</small></td>`).join('')}</tr>`;
      }).join('')}
    </tbody>`).join('');
  return {
    title: t('Segment prices', 'Segment fiyatları'),
    kind: 'modal segment-prices',
    body: `<p class="sp-lead">${t('Each team’s average price in every segment over the year, and below it the share of the segment it won among the teams. Green is the cheapest price in the row, the underlined share the biggest. The market column is what the rest of the market charges.', 'Her takımın yıl boyunca her segmentteki ortalama fiyatı; altında o segmentte takımlar arasında aldığı pay. Yeşil satırdaki en ucuz fiyat, altı çizili pay en büyük pay. Piyasa sütunu, pazarın geri kalanının istediği fiyat.')}</p>
      <div class="table-wrap"><table class="sp-table"><colgroup><col class="sp-c-level"><col class="sp-c-market">${teams.map(() => '<col>').join('')}</colgroup><thead><tr><th>${t('Segment', 'Segment')}</th><th class="sp-market">${t('Market', 'Piyasa')}</th>${head}</tr></thead>${body}</table></div>`
  };
}
