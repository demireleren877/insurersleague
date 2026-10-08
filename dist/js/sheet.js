// Excel mode: teams fill their decisions in a workbook and the moderator uploads it; nobody else needs
// a device. This module writes the .xlsx template and reads filled files back, with no library: an .xlsx
// file is a zip of XML parts. Reading works on files saved by Excel, Google Sheets, Numbers and LibreOffice.
//
// Layout: one decision per row, one team per column. Column A holds a hidden machine key for every row,
// so imports never depend on the visible (translated) labels; the labels are a fallback.
import { rulesOf, validate, presetName, DIMENSIONS, QUARTER_KEYS, cascoMoney, defaultStrategy, dimensionName, levelName, policiesOf, campaignRules, campaignAudience, campaignOf, offerName, monthlyMarketing, marketingSpent, monthsOf } from '../engine.js';

export { QUARTER_KEYS };
const L = (lang, en, tr) => (lang === 'tr' ? tr : en);
export const SHEET_TEAMS = 6;
const FIRST_TEAM_COL = 3; // D

// ——— Rows ———
function rowSpec(config, lang) {
  const R = rulesOf(config), money = cascoMoney(config);
  const fmtMoney = v => Math.round(v).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US');
  const rows = [
    { key: 'name', kind: 'text', label: L(lang, 'Team name', 'Takım adı'), note: L(lang, 'Up to 16 characters. Columns without a team name are skipped.', 'En fazla 16 karakter. Takım adı boş sütunlar alınmaz.') },
    { key: 'product', kind: 'text', label: L(lang, 'Product name', 'Ürün adı'), note: L(lang, 'Optional, up to 32 characters.', 'İsteğe bağlı, en fazla 32 karakter.') },
    { key: 'sentence', kind: 'text', label: L(lang, 'Strategy in one sentence', 'Tek cümlede strateji'), note: L(lang, 'Optional, up to 90 characters. Shown on stage.', 'İsteğe bağlı, en fazla 90 karakter. Sahnede görünür.') },
    { section: L(lang, 'Price', 'Fiyat') },
    { key: 'basePremium', kind: 'number', min: 0.01, max: 1e7, label: L(lang, 'Base premium (EUR)', 'Baz prim (EUR)'),
      note: L(lang, 'Offer = base premium × the five coefficients of the customer’s segments.', 'Teklif = baz prim × müşterinin beş segment katsayısı.') }
  ];
  for (const dim of DIMENSIONS) {
    rows.push({ section: L(lang, `${dimensionName(dim, lang)} coefficients (${R.coef.min}–${R.coef.max}, steps of ${R.coef.step ?? 0.01})`, `${dimensionName(dim, lang)} katsayıları (${R.coef.min}–${R.coef.max}, ${String(R.coef.step ?? 0.01).replace('.', ',')} adım)`) });
    R.dimensions[dim].forEach((lv, i) => rows.push({ key: `coef.${dim}.${i}`, kind: 'coef', min: R.coef.min, max: R.coef.max, label: levelName(dim, i, lang), note: L(lang, `In the data: ${lv.id}`, `Veride: ${lv.id}`) }));
  }
  const K = campaignRules(R);
  rows.push({ section: L(lang, `Marketing: the digital campaign (at most ${fmtMoney(money.budget)} EUR)`, `Pazarlama: dijital kampanya (en fazla ${fmtMoney(money.budget)} EUR)`) });
  rows.push({ key: 'marketing', kind: 'money', min: 0, max: money.budget, label: L(lang, 'Marketing budget (EUR)', 'Pazarlama bütçesi (EUR)'), note: L(lang, 'All of it runs the digital campaign.', 'Tamamı dijital kampanyaya gider.') });
  rows.push({ key: 'mediaShare', kind: 'pct', min: 0, max: 100, label: L(lang, 'Media share % (of marketing)', 'Medya payı % (pazarlamanın)'), note: L(lang, `Steps of 5. Media buys impressions at ${K.cpm} EUR per 1,000; the rest buys gifts.`, `5’er adım. Medya 1.000 gösterimi ${K.cpm} EUR’ya alır; kalanı hediyeye gider.`) });
  K.offers.forEach((o, i) => rows.push({ key: `offers.${i}`, kind: 'pct', min: 0, max: 100, label: L(lang, `Gift weight %: ${offerName(o.id, lang)}`, `Hediye ağırlığı %: ${offerName(o.id, lang)}`), note: L(lang, 'Steps of 5; the four weights total 100.', '5’er adım; dört ağırlığın toplamı 100.') }));
  return rows;
}

// Every label a row can be written with, in both languages, for workbooks that lost column A.
function labelIndex(config) {
  const index = new Map();
  for (const lang of ['en', 'tr']) for (const r of rowSpec(config, lang)) if (r.key) { index.set(norm(r.label), r.key); index.set(norm(r.label.replace(/\(.*\)/, '')), r.key); }
  return index;
}

const norm = v => String(v ?? '').toLocaleLowerCase('tr-TR').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i').replace(/[^a-z0-9%]+/g, ' ').trim();
const valueAt = (st, key) => key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), st);

// ——— Template ———
const colName = i => { let s = ''; for (i++; i; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; };
const xml = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

// The decision workbook, in the case's own design (Marketing_Input.xlsx): three sheets — Input, Premium,
// Marketing — with the same banners, colours, column widths, merged cells and dropdowns. Cells the case
// file doesn't have but the game needs (team name, the gift weights) sit in the same style next to the
// case's own tables.
// One workbook carries one team. `teams`/`quarter`/`single` are kept for callers; only the first team is written.
const BLUE = 'FF004FA3', NAVY = 'FF004894', SKY = 'FFC2D7E0', MIST = 'FFF5F8FA', YELLOW = 'FFFFFF00', GREY = 'FF666666', WHITE = 'FFFFFFFF';
const EURO_ACC = '_-[$€-2]\\ * #,##0_-;\\-[$€-2]\\ * #,##0_-;_-[$€-2]\\ * "-"??_-;_-@_-';
const EURO_BASE = '#,##0\\ [$€-1];[Red]\\-#,##0\\ [$€-1]';
const FONTS = [
  ['11'], ['18', 'b', WHITE], ['12', 'i', NAVY], ['14', 'b', WHITE], ['14'], ['11', 'b', BLUE], ['16', 'b', WHITE], ['11', 'i', NAVY],
  ['11', 'b', WHITE], ['20'], ['11', 'b'], ['10', 'i', NAVY], ['11', '', GREY], ['12', 'b', WHITE], ['13', 'b', WHITE]
];
const FILLS = [BLUE, SKY, NAVY, MIST, YELLOW, 'FFF2F2F2']; // fill ids 2…7
const FILL = { blue: 2, sky: 3, navy: 4, mist: 5, yellow: 6, paper: 7 };
// [font, fill, border, numFmt, horizontal, vertical, wrap]
// borders: 0 none · 1 thin all navy · 2 left thin navy · 3 thin all grey
const XF = {
  plain: [0, 0, 0, 0], inputTitle: [1, FILL.blue, 0, 0, 'center', 'center'], subtitle: [2, FILL.sky, 0, 0, 'center', 'center'],
  section14: [3, FILL.navy, 0, 0, 'center', 'center'], emoji: [4, 0, 0, 0, 'center', 'center'], guideLabel: [5, 0, 0, 0, '', 'center'],
  text: [0, 0, 0, 0, '', 'center'], notesBanner: [3, FILL.blue, 0, 0, 'center', 'center'], sheetTitle: [6, FILL.blue, 0, 0, 'center', 'center'],
  sheetSub: [7, FILL.sky, 0, 0, 'center', 'center'], head: [8, FILL.navy, 1, 0, 'center', 'center', 1], basePremium: [9, 0, 1, 164, 'center', 'center'],
  level: [10, FILL.mist, 2, 0, '', 'center'], coef: [0, FILL.sky, 0, 2, 'center', 'center'], mktSub: [11, FILL.sky, 0, 0, 'center', 'center', 1],
  population: [10, FILL.paper, 0, 0, 'center', 'center', 1], mktLabel: [10, FILL.mist, 3, 0, '', 'center'], mktDesc: [12, 0, 3, 0, '', 'center', 1],
  yellowPct: [12, FILL.yellow, 3, 9, '', 'center'], euro666: [12, 0, 3, 165, '', 'center'], totalLabel: [13, FILL.navy, 3, 0, 'right', 'center', 1],
  totalPct: [8, FILL.navy, 3, 9, 'center', 'center'], totalEuro: [8, FILL.navy, 3, 165, 'center', 'center'], mktHead: [8, FILL.navy, 3, 0, 'center', 'center', 1],
  offer: [0, 0, 3, 0, '', 'center'], offerPct: [0, 0, 3, 9, '', 'center'], offerEuro: [0, 0, 3, 165, '', 'center'],
  claimSection: [14, FILL.navy, 0, 0, 'center', 'center'], claimHead: [8, FILL.blue, 1, 0, 'center', 'center'], claimLabel: [10, FILL.mist, 2, 0, '', 'center'],
  claimDesc: [12, 0, 0, 0, '', 'center', 1], claimTotalLabel: [8, FILL.blue, 2, 0, 'right', 'center'], claimTotalEuro: [8, FILL.blue, 0, 165, 'center', 'center'],
  note: [11, 0, 0, 0, '', 'center'], inputEuro: [0, FILL.sky, 0, 165, 'center', 'center'], inputText: [0, FILL.sky, 0, 0, 'center', 'center'],
  yellowText: [12, FILL.yellow, 3, 0, 'center', 'center'], yellowEuro: [12, FILL.yellow, 3, 165, 'center', 'center'], claimEuro: [12, 0, 0, 165, 'center', 'center'],
  listCell: [0, 0, 0, 0]
};
// Styles are registered as they are used: a base style from XF, optionally with its own navy edges
// ('l', 'r', 't', 'b' in any combination) — the case file outlines every table that way.
function styleRegistry() {
  const ids = new Map([['plain|', 0]]), list = [['plain', '']];
  const id = (style, edges = '') => { const key = `${style}|${edges}`; if (!ids.has(key)) { ids.set(key, list.length); list.push([style, edges]); } return ids.get(key); };
  const toXml = () => {
    const fonts = FONTS.map(([sz, flags = '', color]) => `<font>${flags.includes('b') ? '<b/>' : ''}${flags.includes('i') ? '<i/>' : ''}<sz val="${sz}"/>${color ? `<color rgb="${color}"/>` : ''}<name val="Calibri"/></font>`).join('');
    const fills = `<fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>${FILLS.map(c => `<fill><patternFill patternType="solid"><fgColor rgb="${c}"/><bgColor indexed="64"/></patternFill></fill>`).join('')}`;
    const side = (s2, on, c = NAVY) => (on ? `<${s2} style="thin"><color rgb="${c}"/></${s2}>` : `<${s2}/>`);
    const borderOf = edges => `<border>${side('left', edges.includes('l'))}${side('right', edges.includes('r'))}${side('top', edges.includes('t'))}${side('bottom', edges.includes('b'))}<diagonal/></border>`;
    const borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>', borderOf('lrtb'), borderOf('l'),
      `<border>${['left', 'right', 'top', 'bottom'].map(s2 => side(s2, true, 'FFBFBFBF')).join('')}<diagonal/></border>`];
    const edgeIds = new Map();
    const xfs = list.map(([style, edges]) => {
      let [font, fill, border, fmt, h = '', v = '', wrap = 0] = XF[style];
      if (edges) { if (!edgeIds.has(edges)) { edgeIds.set(edges, borders.length); borders.push(borderOf(edges)); } border = edgeIds.get(edges); }
      const align = h || v || wrap ? `<alignment${h ? ` horizontal="${h}"` : ''}${v ? ` vertical="${v}"` : ''}${wrap ? ' wrapText="1"' : ''}/>` : '';
      return `<xf numFmtId="${fmt}" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0"${fmt ? ' applyNumberFormat="1"' : ''} applyFont="1"${fill ? ' applyFill="1"' : ''}${border ? ' applyBorder="1"' : ''}${align ? ' applyAlignment="1"' : ''}>${align}</xf>`;
    }).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="${xml(EURO_BASE)}"/><numFmt numFmtId="165" formatCode="${xml(EURO_ACC)}"/></numFmts>
<fonts count="${FONTS.length}">${fonts}</fonts><fills count="${FILLS.length + 2}">${fills}</fills><borders count="${borders.length}">${borders.join('')}</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${list.length}">${xfs}</cellXfs>
<dxfs count="1"><dxf><font><b/><color rgb="FFC92A2A"/></font><fill><patternFill patternType="solid"><bgColor rgb="FFFFE3E3"/></patternFill></fill></dxf></dxfs>
</styleSheet>`;
  };
  return { id, toXml };
}

// A sheet: cells by address, merges, widths, heights, validations, conditional formats.
function caseSheet({ widths = {}, heights = {}, tab, grid = true, styles }) {
  const cells = new Map(), merges = [], dvs = [], cfs = [];
  const set = (ref, value, style = 'plain') => cells.set(ref, [value, style, '']);
  const addr = (c, r) => `${String.fromCharCode(64 + c)}${r}`;
  // A thin navy box around a table, and a line under its header row.
  const outline = (range, { header = true } = {}) => {
    const [[c1, r1], [c2, r2]] = range.split(':').map(x => [x.charCodeAt(0) - 64, Number(x.slice(1))]);
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) {
      const ref = addr(c, r), cell = cells.get(ref) ?? ['', 'plain', ''];
      const edges = new Set(cell[2]);
      if (c === c1) edges.add('l'); if (c === c2) edges.add('r'); if (r === r1) edges.add('t'); if (r === r2 || (header && r === r1)) edges.add('b');
      if (header && r === r1 + 1) edges.add('t');
      cells.set(ref, [cell[0], cell[1], [...edges].sort().join('')]);
    }
  };
  const edge = (ref, more) => { const cell = cells.get(ref) ?? ['', 'plain', '']; cells.set(ref, [cell[0], cell[1], [...new Set(cell[2] + more)].sort().join('')]); };
  const toXml = () => {
    const byRow = new Map();
    for (const [ref, [v, style, edges]] of cells) { const r = Number(ref.match(/\d+/)[0]); if (!byRow.has(r)) byRow.set(r, []); byRow.get(r).push([ref, v, styles.id(style, edges)]); }
    for (const r of Object.keys(heights).map(Number)) if (!byRow.has(r)) byRow.set(r, []);
    const colNum = ref => { let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n; };
    const rows = [...byRow.keys()].sort((a, b) => a - b).map(r => {
      const body = byRow.get(r).sort((a, b) => colNum(a[0]) - colNum(b[0])).map(([ref, v, st]) => {
        if (v === null || v === undefined || v === '') return `<c r="${ref}" s="${st}"/>`;
        if (typeof v === 'number') return `<c r="${ref}" s="${st}"><v>${v}</v></c>`;
        if (v.startsWith('=')) return `<c r="${ref}" s="${st}"><f>${xml(v.slice(1))}</f></c>`;
        return `<c r="${ref}" s="${st}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
      }).join('');
      return `<row r="${r}"${heights[r] ? ` ht="${heights[r]}" customHeight="1"` : ''}>${body}</row>`;
    }).join('');
    const cols = Object.entries(widths).map(([c, w]) => { const n = colNum(c); return `<col min="${n}" max="${n}" width="${w}" customWidth="1"/>`; }).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr>${tab ? `<tabColor rgb="${tab}"/>` : ''}</sheetPr><sheetViews><sheetView workbookViewId="0"${grid ? '' : ' showGridLines="0"'}/></sheetViews><sheetFormatPr defaultRowHeight="15"/>${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${rows}</sheetData>${merges.length ? `<mergeCells count="${merges.length}">${merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : ''}${cfs.join('')}${dvs.length ? `<dataValidations count="${dvs.length}">${dvs.join('')}</dataValidations>` : ''}</worksheet>`;
  };
  return {
    set, toXml, outline, edge,
    merge: range => merges.push(range),
    list: (sqref, name, error) => dvs.push(`<dataValidation type="list" allowBlank="1" showErrorMessage="1" error="${xml(error)}" sqref="${sqref}"><formula1>${name}</formula1></dataValidation>`),
    decimal: (sqref, min, max, error) => dvs.push(`<dataValidation type="decimal" operator="between" allowBlank="1" showErrorMessage="1" error="${xml(error)}" sqref="${sqref}"><formula1>${min}</formula1><formula2>${max}</formula2></dataValidation>`),
    textLength: (sqref, max, error) => dvs.push(`<dataValidation type="textLength" operator="lessThanOrEqual" allowBlank="1" showErrorMessage="1" error="${xml(error)}" sqref="${sqref}"><formula1>${max}</formula1></dataValidation>`),
    redWhen: (sqref, operator, formula, priority) => cfs.push(`<conditionalFormatting sqref="${sqref}"><cfRule type="cellIs" dxfId="0" priority="${priority}" operator="${operator}"><formula>${formula}</formula></cfRule></conditionalFormatting>`)
  };
}

// Where every decision lives in the case layout (sheet, cell). The reader uses the same map.
export const CASE_CELLS = {
  name: ['Input', 'D19'], product: ['Input', 'D20'], sentence: ['Input', 'D21'],
  basePremium: ['Premium', 'C5'],
  coef: { city: ['Premium', 'C', 9], channel: ['Premium', 'F', 10], vehicle: ['Premium', 'C', 17], persona: ['Premium', 'F', 16], type: ['Premium', 'F', 6] },
  mediaShare: ['Marketing', 'D11'], offerShare: ['Marketing', 'D12'], marketing: ['Marketing', 'D14'],
  offers: ['Marketing', 'K', 16]
};

export function buildTemplate(state, { lang = 'en', teams = null } = {}) {
  const config = state.config, R = rulesOf(config), money = cascoMoney(config), K = campaignRules(R);
  const team = (teams ?? state.teams.filter(t => !t.ai))[0];
  const st = team?.strategy ?? defaultStrategy(config), c0 = campaignOf(st);
  // At a quarter review the budget cell is what is left of the year's wallet, pre-filled with the current pace.
  const review = state.strategyReviews?.current != null ? state.strategyReviews.rounds?.[state.strategyReviews.current] : null;
  const from = review && team?.strategy ? review.month + 1 : 0;
  const spent = from ? marketingSpent(team, from) : 0, left = Math.max(0, money.budget - spent);
  const marketingCell = from ? Math.min(left, Math.round(monthlyMarketing(team, from) * (12 - from))) : st.marketing;
  const months = monthsOf(lang);
  const styles = styleRegistry();
  const eur = v => `€${Math.round(v).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US')}`;
  const fmtDec = fmtDecOf(lang);

  // ——— Input ———
  const input = caseSheet({ styles, widths: { A: 3.9, B: 5, C: 68.1, D: 74.7 }, heights: { 2: 39.8, 3: 24.8, 5: 30, 7: 24.8, 8: 24.8, 9: 24.8, 11: 30, 13: 21.8, 14: 21.8, 15: 21.8, 17: 30, 19: 24.8, 20: 24.8, 21: 24.8 }, tab: BLUE });
  input.set('B2', 'FINANCE DAY', 'inputTitle'); input.merge('B2:H2');
  input.set('B3', L(lang, 'Corporate Strategy and Simulation Parameters', 'Kurumsal Strateji ve Simülasyon Parametreleri'), 'subtitle'); input.merge('B3:H3');
  input.set('B5', L(lang, '📋 USER GUIDE', '📋 KULLANIM KILAVUZU'), 'section14'); input.merge('B5:H5');
  [['1️⃣', L(lang, 'PREMIUM', 'PRİM'), L(lang, `Select segment-based coefficients (${fmtDec(R.coef.min)} - ${fmtDec(R.coef.max)} range, ${fmtDec(R.coef.step)} increments)`, `Segment katsayılarını seç (${fmtDec(R.coef.min)} - ${fmtDec(R.coef.max)} aralığı, ${fmtDec(R.coef.step)} adım)`)],
    ['2️⃣', L(lang, 'MARKETING', 'PAZARLAMA'), L(lang, 'Set the marketing budget, split it among media & offer (total must = 100%) and weight the gifts (total must = 100%)', 'Pazarlama bütçesini belirle, medya ve hediye arasında böl (toplam = %100) ve hediyeleri ağırlıklandır (toplam = %100)')]
  ].forEach(([n, label, text], i) => { input.set(`B${7 + i}`, n, 'emoji'); input.set(`C${7 + i}`, label, 'guideLabel'); input.set(`D${7 + i}`, text, 'text'); });
  input.set('B11', L(lang, '⚠️ IMPORTANT NOTES', '⚠️ ÖNEMLİ NOTLAR'), 'notesBanner'); input.merge('B11:H11');
  [L(lang, 'Coefficients, shares and choices are selected from dropdown lists.', 'Katsayılar, paylar ve seçimler açılır listelerden seçilir.'),
    L(lang, 'Media + offer must equal 100%; the gift weights must equal 100%.', 'Medya + hediye %100 olmalı; hediye ağırlıkları %100 olmalı.'),
    from ? L(lang, `The marketing budget is one wallet for the year: ${eur(spent)} is spent, at most ${eur(left)} is left for ${months[from]}–${months[11]}.`, `Pazarlama bütçesi yıllık tek cüzdandır: ${eur(spent)} harcandı, ${months[from]}–${months[11]} için en fazla ${eur(left)} kaldı.`)
      : L(lang, `The marketing budget must stay within ${eur(money.budget)} for the year.`, `Pazarlama bütçesi yıl boyunca ${eur(money.budget)} tutarını aşmamalı.`)
  ].forEach((text, i) => { input.set(`B${13 + i}`, '•', 'text'); input.set(`C${13 + i}`, text, 'text'); });
  input.set('B17', L(lang, '🏷️ TEAM', '🏷️ TAKIM'), 'section14'); input.merge('B17:H17');
  [[L(lang, 'Team name', 'Takım adı'), team?.name ?? ''], [L(lang, 'Product name (optional)', 'Ürün adı (isteğe bağlı)'), st.product ?? ''], [L(lang, 'Strategy in one sentence (optional)', 'Tek cümlede strateji (isteğe bağlı)'), st.sentence ?? '']]
    .forEach(([label, value], i) => { input.set(`C${19 + i}`, label, 'guideLabel'); input.set(`D${19 + i}`, value, 'inputText'); });
  input.textLength('D19', 16, L(lang, 'Up to 16 characters.', 'En fazla 16 karakter.'));
  input.textLength('D20', 32, L(lang, 'Up to 32 characters.', 'En fazla 32 karakter.'));
  input.textLength('D21', 90, L(lang, 'Up to 90 characters.', 'En fazla 90 karakter.'));

  // ——— Premium ———
  const prem = caseSheet({ styles, widths: { A: 3.9, B: 17.6, C: 12.3, E: 15.9, F: 12.3, G: 36.7, H: 12.3, I: 15, K: 17.9, L: 36.7, M: 12.3, O: 17.6, P: 36.7, Q: 12.3 }, heights: { 2: 35.2, 3: 24.8, 5: 27.8, 6: 24.8, 7: 24.8, 8: 24.8, 9: 24.8, 10: 24.8, 11: 24.8, 12: 24.8, 13: 24.8, 14: 28.5, 16: 26.2, 17: 27.8, 18: 30.8, 19: 29.2 }, tab: NAVY });
  prem.set('B2', L(lang, 'PREMIUM - SEGMENT COEFFICIENTS', 'PRİM - SEGMENT KATSAYILARI'), 'sheetTitle'); prem.merge('B2:H2');
  prem.set('B3', L(lang, `Select coefficient between ${fmtDec(R.coef.min)} - ${fmtDec(R.coef.max)} for each segment`, `Her segment için ${fmtDec(R.coef.min)} - ${fmtDec(R.coef.max)} arasında katsayı seç`), 'sheetSub'); prem.merge('B3:H3');
  prem.set('B5', L(lang, 'BASE \nPREMIUM', 'BAZ \nPRİM'), 'head'); prem.set('B6', '', 'head'); prem.merge('B5:B6');
  prem.set('C5', st.basePremium, 'basePremium'); prem.set('C6', '', 'basePremium'); prem.merge('C5:C6');
  prem.decimal('C5', 0.01, 10000000, L(lang, 'Enter a base premium above zero.', 'Sıfırdan büyük bir baz prim gir.'));
  const block = (dim, title) => {
    const [, col, first] = CASE_CELLS.coef[dim], label = String.fromCharCode(col.charCodeAt(0) - 1);
    prem.set(`${label}${first - 1}`, title, 'head'); prem.set(`${col}${first - 1}`, L(lang, 'COEFFICIENT', 'KATSAYI'), 'head');
    R.dimensions[dim].forEach((lv, i) => { prem.set(`${label}${first + i}`, lv.id, 'level'); prem.set(`${col}${first + i}`, st.coef[dim][i], 'coef'); });
    prem.list(`${col}${first}:${col}${first + R.dimensions[dim].length - 1}`, 'CoefficientList', L(lang, 'Pick a coefficient from the list.', 'Listeden bir katsayı seç.'));
  };
  block('type', L(lang, 'CUSTOMER TYPE', 'MÜŞTERİ TİPİ')); block('city', L(lang, 'CITY', 'İL')); block('channel', L(lang, 'CHANNEL', 'KANAL'));
  block('persona', 'PERSONA'); block('vehicle', L(lang, 'VEHICLE SEGMENT', 'ARAÇ SEGMENTİ'));
  for (const dim of DIMENSIONS) { const [, col, first] = CASE_CELLS.coef[dim], label = String.fromCharCode(col.charCodeAt(0) - 1); prem.outline(`${label}${first - 1}:${col}${first + R.dimensions[dim].length - 1}`); }
  prem.outline('B5:C6', { header: false }); prem.edge('C5', 'lrtb'); prem.edge('C6', 'lrb');
  const coefList = []; for (let v = R.coef.min; v <= R.coef.max + 1e-9; v += R.coef.step) coefList.push(Math.round(v * 100) / 100);
  coefList.forEach((v, i) => prem.set(`XFD${i + 1}`, v, 'listCell'));

  // ——— Marketing ———
  const mkt = caseSheet({ styles, widths: { A: 3.9, B: 17.7, C: 55.1, D: 14.6, E: 17.6, F: 28.1, G: 31.9, I: 10.3, J: 8.1, K: 12.6, L: 11.3 }, heights: { 2: 35.2, 3: 37.2, 5: 42.6, 10: 27.8, 11: 27.8, 12: 27.8, 13: 29.2, 14: 30, 16: 24, 17: 24, 18: 24, 19: 14.4, 20: 27.6 }, tab: BLUE, grid: false });
  mkt.set('B2', L(lang, 'MARKETING - MEDIA & OFFER', 'PAZARLAMA - MEDYA VE HEDİYE'), 'sheetTitle'); mkt.merge('B2:H2');
  mkt.set('B3', from
    ? L(lang, `You have ${eur(left)} left of the year's ${eur(money.budget)} (${eur(spent)} spent). Whatever you enter is spent evenly over ${months[from]}–${months[11]}.\nSplit it among media & offer (sum = 100%) and weight the gifts (sum = 100%).`, `Yılın ${eur(money.budget)} bütçesinden ${eur(left)} kaldı (${eur(spent)} harcandı). Gireceğin tutar ${months[from]}–${months[11]} arasına eşit dağıtılır.\nMedya ve hediye arasında böl (toplam %100) ve hediyeleri ağırlıklandır (toplam %100).`)
    : L(lang, `You have a budget of up to ${eur(money.budget)} for the year. You will split this among media & offer.\nSum should equal to 100%. Then weight the gifts: their sum should also equal to 100%.`, `Yıl için en fazla ${eur(money.budget)} bütçen var. Bunu medya ve hediye arasında böleceksin.\nToplam %100 olmalı. Sonra hediyeleri ağırlıklandır: onların toplamı da %100 olmalı.`), 'mktSub'); mkt.merge('B3:H3');
  mkt.set('B5', L(lang, 'Population : 84 million\n18-55 years old digital users: 43 million\nTarget Group: Joyful Disregarders (21% of 18-55 digital users)', 'Nüfus: 84 milyon\n18-55 yaş dijital kullanıcı: 43 milyon\nHedef kitle: Joyful Disregarders (18-55 yaş dijital kullanıcıların %21’i)'), 'population'); mkt.merge('B5:H5');
  [['B10', L(lang, 'Budget Split', 'Bütçe dağılımı')], ['C10', L(lang, 'Description', 'Açıklama')], ['D10', L(lang, 'Share', 'Pay')], ['F10', L(lang, 'Media', 'Medya')], ['G10', L(lang, 'Description', 'Açıklama')], ['H10', L(lang, 'Cost', 'Maliyet')]].forEach(([ref, v]) => mkt.set(ref, v, 'head'));
  mkt.set('B11', L(lang, 'Media', 'Medya'), 'mktLabel'); mkt.set('C11', L(lang, 'Social media ads to increase the awareness of the campaign', 'Kampanyanın bilinirliğini artıran sosyal medya reklamları'), 'mktDesc'); mkt.set('D11', c0.media / 100, 'yellowPct');
  mkt.set('B12', L(lang, 'Offer', 'Hediye'), 'mktLabel'); mkt.set('C12', L(lang, 'The offer & gifts you will give to casco new acquisition customers', 'Yeni kazanılan kasko müşterilerine vereceğin teklif ve hediyeler'), 'mktDesc'); mkt.set('D12', (100 - c0.media) / 100, 'yellowPct');
  mkt.set('B13', 'TOTAL', 'totalLabel'); mkt.set('C13', '', 'totalLabel'); mkt.merge('B13:C13'); mkt.set('D13', '=D11+D12', 'totalPct');
  mkt.set('B14', L(lang, 'BUDGET', 'BÜTÇE'), 'totalLabel');
  mkt.set('C14', from ? L(lang, `Marketing for ${months[from]}–${months[11]} (at most ${eur(left)})`, `${months[from]}–${months[11]} pazarlaman (en fazla ${eur(left)})`) : L(lang, `Your marketing for the year (at most ${eur(money.budget)})`, `Yıllık pazarlaman (en fazla ${eur(money.budget)})`), 'totalLabel');
  mkt.set('D14', marketingCell, 'yellowEuro');
  mkt.set('B16', L(lang, 'Customers per gift = reach × weight × interest × click × hit ratio.\nEach gift can serve at most (offer budget × its weight) ÷ its cost customers.', 'Hediye başına müşteri = erişim × ağırlık × ilgi × tıklama × hit oranı.\nHer hediye en fazla (hediye bütçesi × ağırlığı) ÷ maliyeti kadar müşteriye yeter.'), 'mktSub'); ['C', 'D'].forEach(cl => { mkt.set(`${cl}16`, '', 'mktSub'); mkt.set(`${cl}17`, '', 'mktSub'); }); mkt.set('B17', '', 'mktSub'); mkt.merge('B16:D17');
  mkt.set('F11', L(lang, 'Cost per reach', 'Erişim maliyeti'), 'mktLabel'); mkt.set('G11', L(lang, 'The cost of 1,000 ad impressions', '1.000 reklam gösteriminin maliyeti'), 'mktDesc'); mkt.set('H11', K.cpm, 'euro666');
  mkt.set('F12', L(lang, `If a customer sees an ad more than ${K.frequency} times, the hit ratio tends to increase by ${Math.round(K.frequencyBonus * 100)}%`, `Müşteri reklamı ${K.frequency} kereden fazla görürse hit oranı %${Math.round(K.frequencyBonus * 100)} artar`), 'mktSub'); mkt.set('G12', '', 'mktSub'); mkt.set('H12', '', 'mktSub'); mkt.merge('F12:H12');
  mkt.set('F14', L(lang, 'The Customers who see the ad only once', 'Reklamı yalnızca bir kez gören müşteriler'), 'mktHead'); ['G', 'H', 'I', 'J', 'K'].forEach(cl => mkt.set(`${cl}14`, '', 'mktHead')); mkt.merge('F14:K14');
  [['F15', L(lang, 'Possible Offers', 'Olası hediyeler')], ['G15', L(lang, 'Interest Rate', 'İlgi oranı')], ['H15', L(lang, 'Cost', 'Maliyet')], ['I15', L(lang, 'Click Rate', 'Tıklama oranı')], ['J15', L(lang, 'Hit Ratio', 'Hit oranı')], ['K15', L(lang, 'Weight', 'Ağırlık')]].forEach(([ref, v]) => mkt.set(ref, v, 'mktHead'));
  K.offers.forEach((o, i) => { const r = 16 + i; mkt.set(`F${r}`, offerName(o.id, lang), 'offer'); mkt.set(`G${r}`, o.interest, 'offerPct'); mkt.set(`H${r}`, o.cost, 'offerEuro'); mkt.set(`I${r}`, o.click, 'offerPct'); mkt.set(`J${r}`, o.hit, 'offerPct'); mkt.set(`K${r}`, (c0.weights[i] || 0) / 100, 'yellowPct'); });
  const lastOffer = 15 + K.offers.length;
  mkt.set('F20', L(lang, '*You need to give at least one gift to all acquired customers', '*Kazandığın her müşteriye en az bir hediye vermelisin'), 'mktSub'); ['G', 'H', 'I', 'J'].forEach(cl => mkt.set(`${cl}20`, '', 'mktSub')); mkt.merge('F20:J20');
  mkt.set('K20', `=SUM(K16:K${lastOffer})`, 'totalPct');
  const pctList = Array.from({ length: 21 }, (_, i) => i * 5 / 100);
  pctList.forEach((v, i) => mkt.set(`XFB${i + 1}`, v, 'listCell'));
  const pickPct = L(lang, 'Pick a share from the list (steps of 5%).', 'Listeden bir pay seç (%5 adım).');
  mkt.list(`D11:D12 K16:K${lastOffer}`, 'PercentageList', pickPct);
  mkt.decimal('D14', 0, Math.floor(from ? left : money.budget), L(lang, `Enter 0 to ${Math.floor(from ? left : money.budget)}.`, `0 ile ${Math.floor(from ? left : money.budget)} arasında gir.`));
  mkt.redWhen('D13', 'notEqual', '1', 1); mkt.redWhen('K20', 'notEqual', '1', 2); mkt.redWhen('D14', 'greaterThan', String(Math.floor(from ? left : money.budget)), 3);

  const sheets = [['Input', input], ['Premium', prem], ['Marketing', mkt]];
  const definedNames = [
    `<definedName name="CoefficientList">Premium!$XFD$1:$XFD$${coefList.length}</definedName>`,
    `<definedName name="PercentageList">Marketing!$XFB$1:$XFB$${pctList.length}</definedName>`
  ].join('');
  const n = sheets.length;
  const files = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${sheets.map(([name], i) => `<sheet name="${name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets><definedNames>${definedNames}</definedNames><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  };
  sheets.forEach(([, sh], i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = sh.toXml(); });
  files['xl/styles.xml'] = styles.toXml(); // after the sheets: it holds every style they used
  return zip(files);
}
const fmtDecOf = lang => v => (lang === 'tr' ? Number(v).toFixed(2).replace('.', ',') : Number(v).toFixed(2));


// ——— Zip (stored, no compression) ———
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = bytes => { let c = 0xFFFFFFFF; for (const b of bytes) c = CRC[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };

function zip(files) {
  const enc = new TextEncoder(), local = [], central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = enc.encode(text), nameBytes = enc.encode(name), crc = crc32(data);
    const head = new DataView(new ArrayBuffer(30));
    head.setUint32(0, 0x04034b50, true); head.setUint16(4, 20, true); head.setUint16(6, 0x0800, true); head.setUint16(8, 0, true);
    head.setUint32(14, crc, true); head.setUint32(18, data.length, true); head.setUint32(22, data.length, true); head.setUint16(26, nameBytes.length, true);
    local.push(new Uint8Array(head.buffer), nameBytes, data);
    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true); dir.setUint16(4, 20, true); dir.setUint16(6, 20, true); dir.setUint16(8, 0x0800, true);
    dir.setUint32(16, crc, true); dir.setUint32(20, data.length, true); dir.setUint32(24, data.length, true); dir.setUint16(28, nameBytes.length, true); dir.setUint32(42, offset, true);
    central.push(new Uint8Array(dir.buffer), nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const size = central.reduce((n, b) => n + b.length, 0), count = Object.keys(files).length;
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, count, true); end.setUint16(10, count, true); end.setUint32(12, size, true); end.setUint32(16, offset, true);
  const parts = [...local, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((n, b) => n + b.length, 0));
  let at = 0; for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

async function unzip(buffer) {
  const bytes = new Uint8Array(buffer), view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), dec = new TextDecoder();
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw Error('not-xlsx');
  const count = view.getUint16(eocd + 10, true);
  if (count > 500) throw Error('too-many-files');
  let p = view.getUint32(eocd + 16, true);
  let expanded = 0, actualExpanded = 0;
  const out = {};
  for (let k = 0; k < count; k++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw Error('not-xlsx');
    const method = view.getUint16(p + 10, true), crc = view.getUint32(p + 16, true), csize = view.getUint32(p + 20, true);
    const usize = view.getUint32(p + 24, true);
    const nlen = view.getUint16(p + 28, true), xlen = view.getUint16(p + 30, true), clen = view.getUint16(p + 32, true), lho = view.getUint32(p + 42, true);
    expanded += usize;
    if (expanded > 20_000_000 || p + 46 + nlen + xlen + clen > bytes.length) throw Error('workbook-too-large');
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + xlen + clen;
    if (!/\.(xml|rels)$/.test(name)) continue;
    if (lho + 30 > bytes.length || view.getUint32(lho, true) !== 0x04034b50) throw Error('not-xlsx');
    const start = lho + 30 + view.getUint16(lho + 26, true) + view.getUint16(lho + 28, true);
    if (start + csize > bytes.length) throw Error('not-xlsx');
    const raw = bytes.subarray(start, start + csize);
    if (method !== 0 && method !== 8) throw Error('unsupported-compression');
    let data;
    if (method === 0) data = raw;
    else {
      const reader = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
      const chunks = [];
      let size = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        actualExpanded += value.byteLength;
        if (actualExpanded > 20_000_000) { await reader.cancel(); throw Error('workbook-too-large'); }
        chunks.push(value);
      }
      data = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
    }
    if (data.byteLength !== usize || crc32(data) !== crc) throw Error('corrupt-xlsx');
    if (method === 0) actualExpanded += data.byteLength;
    if (actualExpanded > 20_000_000) throw Error('workbook-too-large');
    out[name] = dec.decode(data);
  }
  return out;
}

// ——— Reading ———
const unxml = s => s.replace(/&(lt|gt|amp|quot|apos|#x?[0-9a-f]+);/gi, (m, e) => ({ lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }[e.toLowerCase()] ?? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))));
const texts = s => [...s.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m => unxml(m[1])).join('');
const colIndex = ref => { let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };

// Returns every sheet of a workbook as rows of cell values (strings or numbers).
export async function readWorkbook(buffer) {
  const parts = await unzip(buffer);
  const wb = parts['xl/workbook.xml'];
  if (!wb) throw Error('not-xlsx');
  const shared = parts['xl/sharedStrings.xml'] ? [...parts['xl/sharedStrings.xml'].matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => texts(m[1])) : [];
  const rels = Object.fromEntries([...(parts['xl/_rels/workbook.xml.rels'] || '').matchAll(/<Relationship\b[^>]*>/g)].map(m => [m[0].match(/Id="([^"]+)"/)?.[1], m[0].match(/Target="([^"]+)"/)?.[1]]));
  return [...wb.matchAll(/<sheet\b[^>]*>/g)].map(m => {
    const id = m[0].match(/r:id="([^"]+)"/)?.[1], name = unxml(m[0].match(/name="([^"]*)"/)?.[1] ?? '');
    const target = (rels[id] || '').replace(/^\/?(xl\/)?/, 'xl/');
    const src = parts[target] || '';
    const rows = [];
    for (const r of src.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
      const rn = Number(r[1].match(/\br="(\d+)"/)?.[1] ?? rows.length + 1);
      const row = [];
      for (const c of r[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1], body = c[2] || '', ref = attrs.match(/\br="([A-Z]+\d*)"/)?.[1];
        const type = attrs.match(/\bt="([^"]+)"/)?.[1];
        const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        let value = null;
        if (type === 's') value = shared[Number(v)] ?? '';
        else if (type === 'inlineStr') value = texts(body);
        else if (type === 'str' || type === 'e') value = v !== undefined ? unxml(v) : '';
        else if (type === 'b') value = v === '1';
        else if (v !== undefined) value = Number(v);
        row[ref ? colIndex(ref) : row.length] = value;
      }
      rows[rn - 1] = row;
    }
    return { name, rows };
  });
}

// ——— Cells → teams ———
const toNumber = v => {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').replace(/[^\d,.\-]/g, '');
  if (!s) return NaN;
  if (/^-?\d{1,3}([.,]\d{3})+$/.test(s)) return Number(s.replace(/[.,]/g, ''));
  return Number(s.replace(',', '.'));
};

// The case layout (Input / Premium / Marketing) read back as the row layout the checks below expect:
// one synthetic sheet with the machine key in column A and the team's value in column D.
const isCaseLayout = sheets => ['premium', 'marketing'].every(n => sheets.some(sh => norm(sh.name) === n));
// Workbooks from before the marketing redesign still carry a Claim sheet; their cells sit elsewhere.
const isOldCaseLayout = sheets => isCaseLayout(sheets) && sheets.some(sh => norm(sh.name) === 'claim');
function fromCaseLayout(sheets, config, fallbackName = '') {
  const R = rulesOf(config), byName = n => sheets.find(sh => norm(sh.name) === norm(n));
  const at = (sheet, ref) => { const sh = byName(sheet); if (!sh) return undefined; const r = Number(ref.match(/\d+/)[0]) - 1, c = colIndex(ref); return sh.rows[r]?.[c]; };
  const pct = v => { const n = toNumber(v); return Number.isFinite(n) ? Math.round((n <= 1 ? n * 100 : n) * 1e6) / 1e6 : n; };
  const C = CASE_CELLS, rows = [];
  const put = (key, value) => rows.push([key, key, '', value]);
  const name = String(at(...C.name) ?? '').trim();
  put('name', name || fallbackName); put('product', at(...C.product) ?? ''); put('sentence', at(...C.sentence) ?? '');
  put('basePremium', at(...C.basePremium));
  for (const dim of DIMENSIONS) { const [sheet, col, first] = C.coef[dim]; R.dimensions[dim].forEach((_, i) => put(`coef.${dim}.${i}`, at(sheet, `${col}${first + i}`))); }
  put('marketing', at(...C.marketing));
  const [os, oc, of] = C.offers;
  campaignRules(R).offers.forEach((_, i) => put(`offers.${i}`, pct(at(os, `${oc}${of + i}`))));
  const media = pct(at(...C.mediaShare)), offerShare = pct(at(...C.offerShare));
  put('mediaShare', Number.isFinite(media) && Number.isFinite(offerShare) && Math.abs(media + offerShare - 100) > 0.01 ? NaN : media);
  return { name: 'Input', caseLayout: true, rows, splitError: Number.isFinite(media) && Number.isFinite(offerShare) && Math.abs(media + offerShare - 100) > 0.01 };
}

// Reads filled workbooks. Returns { teams: [{ name, strategy, file }], errors: [text] }.
// `lang` picks the language of error messages.
export function teamsFromSheets(workbooks, config, lang = 'en', { quarter = false, currentTeams = [], fallbackName = '' } = {}) {
  const errors = [], teams = [], seen = new Map(), labels = labelIndex(config), R = rulesOf(config);
  const spec = rowSpec(config, lang), specByKey = new Map(spec.filter(r => r.key).map(r => [r.key, r]));
  const current = new Map(currentTeams.map(team => [norm(team.name), team.strategy]));
  const quarterSignature = strategy => JSON.stringify(QUARTER_KEYS.map(key => strategy?.[key]));
  const branch = presetName(config.preset, config.lang);
  let found = false;
  for (const { file, fileIndex, sheets: raw } of workbooks) {
    if (isOldCaseLayout(raw)) { errors.push(L(lang, `${file} is from an earlier version of the game. Download the new template and fill it in.`, `${file} oyunun eski bir sürümünden. Yeni şablonu indirip doldur.`)); continue; }
    const sheets = isCaseLayout(raw) ? [fromCaseLayout(raw, config, fallbackName)] : raw;
    if (sheets[0]?.splitError) { errors.push(L(lang, `${file}: on the Marketing sheet, media + offer must total 100%.`, `${file}: Marketing sayfasında medya + hediye toplamı %100 olmalı.`)); continue; }
    for (const sheet of sheets) {
      // Row keys: the hidden column A, or the visible label in column B for copies that lost it.
      const rowKey = new Map();
      sheet.rows.forEach((row, i) => {
        const key = String(row?.[0] ?? '').trim();
        if (specByKey.has(key)) rowKey.set(key, i);
        else { const byLabel = labels.get(norm(row?.[1])); if (byLabel && !rowKey.has(byLabel)) rowKey.set(byLabel, i); }
      });
      if (!rowKey.has('name')) continue;
      found = true;
      const missing = [...specByKey.keys()].filter(k => !rowKey.has(k) && !['product', 'sentence'].includes(k));
      if (missing.length) { errors.push(L(lang, `${file}: some decision rows are missing. Start from the template downloaded from this game.`, `${file}: bazı karar satırları eksik. Bu oyundan indirilen şablonla başla.`)); continue; }
      const width = Math.max(...[...rowKey.values()].map(i => sheet.rows[i]?.length ?? 0));
      for (let c = FIRST_TEAM_COL; c < width; c++) {
        const get = key => sheet.rows[rowKey.get(key)]?.[c];
        const name = String(get('name') ?? '').trim().replace(/\s+/g, ' ');
        if (!name) continue;
        const where = sheet.caseLayout ? `${file} (${name})` : L(lang, `${file}, column ${colName(c)} (${name})`, `${file}, ${colName(c)} sütunu (${name})`);
        const rowErrors = [];
        if (name.length < 2 || name.length > 16) rowErrors.push(L(lang, 'the team name must be 2–16 characters', 'takım adı 2–16 karakter olmalı'));
        const key = norm(name);
        const product = String(get('product') ?? '').trim(), sentence = String(get('sentence') ?? '').trim();
        if (!quarter && product.length > 32) rowErrors.push(L(lang, 'the product name must be at most 32 characters', 'ürün adı en fazla 32 karakter olmalı'));
        if (!quarter && sentence.length > 90) rowErrors.push(L(lang, 'the strategy sentence must be at most 90 characters', 'strateji cümlesi en fazla 90 karakter olmalı'));
        const strategy = {
          product: product.slice(0, 32) || `${name} ${branch}`,
          sentence: sentence.slice(0, 90) || L(config.lang, 'Our strategy speaks in the race.', 'Stratejimiz yarışta konuşacak.'),
          basePremium: toNumber(get('basePremium')),
          coef: Object.fromEntries(DIMENSIONS.map(dim => [dim, R.dimensions[dim].map((_, i) => toNumber(get(`coef.${dim}.${i}`)))])),
          marketing: toNumber(get('marketing')),
          mediaShare: toNumber(get('mediaShare')),
          offers: campaignRules(R).offers.map((_, i) => toNumber(get(`offers.${i}`)))
        };
        // Percent-formatted cells come in as fractions.
        if (strategy.mediaShare <= 1 && strategy.mediaShare > 0 && !Number.isInteger(strategy.mediaShare)) strategy.mediaShare = Math.round(strategy.mediaShare * 100);
        if (strategy.offers.every(v => Number.isFinite(v) && v <= 1) && Math.abs(strategy.offers.reduce((a, b) => a + b, 0) - 1) < 0.02) strategy.offers = strategy.offers.map(v => Math.round(v * 100));
        if (!Number.isFinite(strategy.mediaShare)) rowErrors.push(L(lang, 'the media share is empty', 'medya payı boş'));
        if (strategy.offers.some(v => !Number.isFinite(v))) rowErrors.push(L(lang, 'a gift weight is empty', 'bir hediye ağırlığı boş'));
        if (!Number.isFinite(strategy.basePremium)) rowErrors.push(L(lang, 'the base premium is empty', 'baz prim boş'));
        for (const dim of DIMENSIONS) strategy.coef[dim].forEach((v, i) => {
          const label = `${dimensionName(dim, lang)} · ${levelName(dim, i, lang)}`;
          if (!Number.isFinite(v)) rowErrors.push(L(lang, `the ${label} coefficient is empty`, `${label} katsayısı boş`));
          else if (v < R.coef.min || v > R.coef.max) rowErrors.push(L(lang, `the ${label} coefficient must be ${R.coef.min}–${R.coef.max} (it is ${v})`, `${label} katsayısı ${R.coef.min}–${R.coef.max} olmalı (şu an ${v})`));
        });
        if (!Number.isFinite(strategy.marketing)) rowErrors.push(L(lang, `${specByKey.get('marketing').label} is empty`, `${specByKey.get('marketing').label} boş`));
        if (!rowErrors.length) rowErrors.push(...validate({ name, strategy }, config, lang).map(e => e.replace(/\.$/, '')));
        if (quarter && !current.has(key)) rowErrors.push(L(lang, 'this team is not in the current Excel roster', 'bu takım mevcut Excel listesinde yok'));
        if (rowErrors.length) { errors.push(`${where}: ${rowErrors.join('; ')}.`); continue; }

        const entry = { name, strategy, file };
        const previous = seen.get(key);
        if (!previous) {
          entry.fileIndex = fileIndex;
          entry.where = where;
          teams.push(entry);
          seen.set(key, entry);
          continue;
        }

        const sameWorkbook = previous.fileIndex !== undefined && fileIndex !== undefined
          ? previous.fileIndex === fileIndex
          : previous.file === file;
        if (!quarter || sameWorkbook) {
          errors.push(L(lang, `${where}: “${name}” appears twice (also ${previous.where}).`, `${where}: “${name}” iki kez var (ayrıca ${previous.where}).`));
          continue;
        }

        const previousSignature = quarterSignature(previous.strategy);
        const incomingSignature = quarterSignature(strategy);
        if (previousSignature === incomingSignature) continue;
        const baselineSignature = quarterSignature(current.get(key));
        const previousChanged = previousSignature !== baselineSignature;
        const incomingChanged = incomingSignature !== baselineSignature;
        if (previousChanged && incomingChanged) {
          errors.push(L(lang, `${where}: conflicting quarter plans for “${name}” were uploaded in more than one workbook.`, `${where}: “${name}” için birden fazla çalışma kitabında çakışan çeyrek planları var.`));
          continue;
        }
        if (incomingChanged) {
          entry.fileIndex = fileIndex;
          entry.where = where;
          teams[teams.indexOf(previous)] = entry;
          seen.set(key, entry);
        }
      }
    }
  }
  if (!found) errors.push(L(lang, 'No decision sheet was found. Upload the template downloaded from this game, filled in.', 'Karar sayfası bulunamadı. Bu oyundan indirilen şablonu doldurup yükle.'));
  else if (quarter) {
    for (let i = teams.length - 1; i >= 0; i--) {
      if (quarterSignature(teams[i].strategy) === quarterSignature(current.get(norm(teams[i].name)))) teams.splice(i, 1);
    }
    if (!teams.length && !errors.length) errors.push(L(lang, 'No revised quarter strategies were found. Unchanged teams keep their current plan.', 'Güncellenmiş çeyrek stratejisi bulunamadı. Değişiklik yapmayan takımlar mevcut planıyla devam eder.'));
  }
  else if (!teams.length && !errors.length) errors.push(L(lang, 'The file has no filled columns. Enter at least one team name.', 'Dosyada dolu sütun yok. En az bir takım adı gir.'));
  return { teams, errors };
}

export async function readSheets(files, config, lang, options = {}) {
  if (!files.length) return { teams: [], errors: [L(lang, 'Select at least one .xlsx workbook.', 'En az bir .xlsx çalışma kitabı seçin.')] };
  const workbooks = [];
  const errors = [];
  for (const [fileIndex, file] of files.entries()) {
    try { workbooks.push({ file: file.name, fileIndex, sheets: await readWorkbook(await file.arrayBuffer()) }); }
    catch { errors.push(L(lang, `${file.name} couldn’t be read. Save it as an Excel workbook (.xlsx) and try again.`, `${file.name} okunamadı. Excel çalışma kitabı (.xlsx) olarak kaydedip tekrar dene.`)); }
  }
  const out = teamsFromSheets(workbooks, config, lang, options);
  return { teams: out.teams, errors: [...errors, ...(workbooks.length ? out.errors : [])] };
}

// One team's own workbook: take the column carrying the team's name, or the only filled column.
export async function readTeamSheet(file, team, config, lang) {
  const { teams, errors } = await readSheets([file], config, lang, { fallbackName: team.name });
  if (errors.length) return { errors };
  const norm2 = v => norm(v);
  const match = teams.find(entry => norm2(entry.name) === norm2(team.name)) ?? (teams.length === 1 ? teams[0] : null);
  if (!match) return { errors: [L(lang, `${file.name} holds ${teams.length} teams and none is named “${team.name}”. Upload a file with this team’s column only.`, `${file.name} dosyasında ${teams.length} takım var ve hiçbiri “${team.name}” değil. Yalnızca bu takımın sütununu içeren dosyayı yükle.`)] };
  return { strategy: match.strategy, fileName: match.name, errors: [] };
}
