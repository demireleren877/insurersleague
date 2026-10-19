// The segment price table on the results page: why a team won or lost share in a segment. Two views:
// segment levels (averages per city, channel…) and customer profiles (one row per exact customer type,
// filterable by each dimension), where a team's price is its own offer for that very customer.
import { getState, seasonDone } from '../store.js';
import { segmentPrices } from '../segment-prices.js';
import { emblem, byId } from '../ui.js';
import { fmt, pct, short, esc } from '../format.js';
import { t, getLang } from '../i18n.js';
import { DIMENSIONS, dimensionName, levelName, rulesOf } from '../../engine.js';

const euro = v => `€${fmt(v, 0)}`;
const PROFILE_ROWS = 150;
let mode = 'levels';
const filter = Object.fromEntries(DIMENSIONS.map(dim => [dim, -1]));
export const setSegmentPricesMode = m => { mode = m === 'profiles' ? 'profiles' : 'levels'; };
export const setSegmentPricesFilter = (dim, value) => { if (dim in filter) filter[dim] = Number(value); };

// The season is replayed once per set of plans, not on every redraw of the dialog.
let memo = { key: '', data: null };
function data(s) {
  const key = JSON.stringify([s.code, s.config.seed, s.config.rules, s.config.assumptions, s.config.events, s.teams.map(t2 => [t2.id, t2.strategy, t2.strategyHistory])]);
  if (memo.key !== key) memo = { key, data: segmentPrices(s) };
  return memo.data;
}

const priceCells = (prices, shares) => {
  const cheapest = Math.min(...prices), most = Math.max(...shares);
  return prices.map((p, i) => `<td class="num ${p === cheapest ? 'sp-best' : ''}"><b>${euro(p)}</b><small class="${shares[i] === most && most > 0 ? 'sp-top' : ''}">${pct(shares[i], 0)}</small></td>`).join('');
};

function levelsView(teams, table, lang) {
  return table.map(group => `<tbody>
      <tr class="sp-group"><th colspan="${teams.length + 2}">${dimensionName(group.dim, lang)}</th></tr>
      ${group.levels.map(row => `<tr><th class="sp-level">${levelName(group.dim, row.level, lang)}</th><td class="num sp-market">${euro(row.market)}</td>${priceCells(row.prices, row.shares)}</tr>`).join('')}
    </tbody>`).join('');
}

function profilesView(teams, profiles, lang) {
  const rows = profiles.filter(p => DIMENSIONS.every((dim, k) => filter[dim] < 0 || p.cell[k] === filter[dim]));
  const shown = rows.slice(0, PROFILE_ROWS);
  const body = shown.length ? shown.map(p => `<tr><th class="sp-level sp-profile">${DIMENSIONS.map((dim, k) => `<span>${esc(levelName(dim, p.cell[k], lang))}</span>`).join('')}<small>${t(`${fmt(p.customers)} customers a year`, `yılda ${fmt(p.customers)} müşteri`)}</small></th><td class="num sp-market">${euro(p.market)}</td>${priceCells(p.prices, p.shares)}</tr>`).join('')
    : `<tr><td colspan="${teams.length + 2}" class="sp-empty">${t('No customer profile matches these filters.', 'Bu filtrelere uyan müşteri profili yok.')}</td></tr>`;
  const note = rows.length > PROFILE_ROWS ? `<tr><td colspan="${teams.length + 2}" class="sp-empty">${t(`Showing the ${PROFILE_ROWS} largest of ${rows.length} profiles. Narrow the filters to see the rest.`, `${rows.length} profilin en büyük ${PROFILE_ROWS} tanesi gösteriliyor. Gerisini görmek için filtreleri daralt.`)}</td></tr>` : '';
  return `<tbody>${body}${note}</tbody>`;
}

export function segmentPricesModal() {
  const s = getState(), lang = getLang();
  if (!seasonDone()) return { title: t('Segment prices', 'Segment fiyatları'), body: `<p class="muted">${t('Available once the season is over.', 'Sezon bitince açılır.')}</p>`, kind: 'modal' };
  const { teams, table, profiles } = data(s), R = rulesOf(s.config);
  const head = teams.map(id => { const team = byId(s.teams, id); return `<th class="sp-team" style="--team:${team.color}">${emblem(team, 'xs')}<span>${short(team.name, 16)}</span></th>`; }).join('');
  const tabs = `<div class="sp-tabs" role="tablist">${[['levels', t('Segment levels', 'Segment seviyeleri')], ['profiles', t('Customer profiles', 'Müşteri profilleri')]].map(([id, label]) => `<button type="button" role="tab" data-action="sp-mode" data-mode="${id}" aria-selected="${mode === id}">${label}</button>`).join('')}</div>`;
  const filters = mode === 'profiles' ? `<div class="sp-filters">${DIMENSIONS.map(dim => `<label><span>${dimensionName(dim, lang)}</span><select class="input" data-sp-filter="${dim}"><option value="-1">${t('All', 'Tümü')}</option>${R.dimensions[dim].map((_, i) => `<option value="${i}" ${filter[dim] === i ? 'selected' : ''}>${esc(levelName(dim, i, lang))}</option>`).join('')}</select></label>`).join('')}</div>` : '';
  const lead = mode === 'profiles'
    ? t('One row per customer profile: every team’s own price for exactly that customer over the year, and below it the share of those customers it won among the teams. Green is the cheapest, the underlined share the biggest; the market column is what the rest of the market charges. Largest profiles first.', 'Her satır bir müşteri profili: her takımın tam o müşteriye yıl boyunca verdiği fiyat ve altında o müşterilerden takımlar arasında aldığı pay. Yeşil en ucuz fiyat, altı çizili pay en büyük pay; piyasa sütunu pazarın geri kalanının istediği fiyat. En büyük profiller önce.')
    : t('Each team’s average price in every segment over the year, and below it the share of the segment it won among the teams. Green is the cheapest price in the row, the underlined share the biggest. The market column is what the rest of the market charges.', 'Her takımın yıl boyunca her segmentteki ortalama fiyatı; altında o segmentte takımlar arasında aldığı pay. Yeşil satırdaki en ucuz fiyat, altı çizili pay en büyük pay. Piyasa sütunu, pazarın geri kalanının istediği fiyat.');
  return {
    title: t('Segment prices', 'Segment fiyatları'),
    kind: 'modal segment-prices',
    body: `${tabs}<p class="sp-lead">${lead}</p>${filters}
      <div class="table-wrap"><table class="sp-table ${mode === 'profiles' ? 'profiles' : ''}"><colgroup><col class="sp-c-level"><col class="sp-c-market">${teams.map(() => '<col>').join('')}</colgroup><thead><tr><th>${mode === 'profiles' ? t('Customer profile', 'Müşteri profili') : t('Segment', 'Segment')}</th><th class="sp-market">${t('Market', 'Piyasa')}</th>${head}</tr></thead>${mode === 'profiles' ? profilesView(teams, profiles, lang) : levelsView(teams, table, lang)}</table></div>`
  };
}
