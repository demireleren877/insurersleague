// Excel mode: teams fill their decisions in a workbook and the moderator uploads it; nobody else needs
// a device. This module writes the .xlsx template and reads filled files back, with no library: an .xlsx
// file is a zip of XML parts. Reading works on files saved by Excel, Google Sheets, Numbers and LibreOffice.
//
// Layout: one decision per row, one team per column. Column A holds a hidden machine key for every row,
// so imports never depend on the visible (translated) labels; the labels are a fallback.
import { rulesOf, validate, presetName, DIMENSIONS, QUARTER_KEYS, cascoMoney, defaultStrategy, dimensionName, levelName, policiesOf, campaignRules, campaignAudience, campaignOf, offerName } from '../engine.js';

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
  rows.push({ section: L(lang, `Budget (at most ${fmtMoney(money.budget)} EUR in total)`, `Bütçe (toplam en fazla ${fmtMoney(money.budget)} EUR)`) });
  rows.push({ key: 'marketing', kind: 'money', min: 0, max: money.budget, label: L(lang, 'Marketing budget (EUR)', 'Pazarlama bütçesi (EUR)'), note: L(lang, 'Makes you visible in the channels you focus on.', 'Odaklandığın kanallarda görünürlük sağlar.') });
  R.dimensions.channel.forEach((_, i) => rows.push({ key: `channelFocus.${i}`, kind: 'pct', min: R.marketing.minFocus ?? 0, max: 100, label: L(lang, `Marketing focus %: ${levelName('channel', i, lang)}`, `Pazarlama odağı %: ${levelName('channel', i, lang)}`), note: L(lang, `The four shares must total 100; each at least ${R.marketing.minFocus ?? 0}.`, `Dört payın toplamı 100 olmalı; her biri en az ${R.marketing.minFocus ?? 0}.`) }));
  const K = campaignRules(R);
  rows.push({ section: L(lang, 'Digital campaign (part of the marketing budget)', 'Dijital kampanya (pazarlama bütçesinin bir kısmı)') });
  rows.push({ key: 'campaign', kind: 'pct', min: 0, max: 100, label: L(lang, 'Campaign share % (of marketing)', 'Kampanya payı % (pazarlamanın)'), note: L(lang, 'Steps of 5. The rest of marketing buys channel visibility.', '5’er adım. Pazarlamanın kalanı kanal görünürlüğüne gider.') });
  rows.push({ key: 'mediaShare', kind: 'pct', min: 0, max: 100, label: L(lang, 'Media share % (of the campaign)', 'Medya payı % (kampanyanın)'), note: L(lang, `Steps of 5. Media buys impressions at ${K.cpm} EUR per 1,000; the rest of the campaign buys gifts.`, `5’er adım. Medya 1.000 gösterimi ${K.cpm} EUR’ya alır; kampanyanın kalanı hediyeye gider.`) });
  rows.push({ key: 'offer', kind: 'offer', label: L(lang, 'Campaign gift', 'Kampanya hediyesi'), note: L(lang, 'Every customer the campaign wins gets this gift. See the How to fill in sheet.', 'Kampanyanın kazandığı her müşteri bu hediyeyi alır. Nasıl doldurulur sayfasına bak.') });
  rows.push({ key: 'claimsOps', kind: 'money', min: 0, max: money.budget, label: L(lang, 'Claims operations (EUR)', 'Hasar operasyonu (EUR)'), note: L(lang, 'Claims-handling capacity. Too little hurts satisfaction and leaks claims cost.', 'Hasar yönetim kapasitesi. Az olursa memnuniyet düşer, hasar maliyeti kaçar.') });
  rows.push({ key: 'reinsurance', kind: 'bool', label: L(lang, 'Quota-share reinsurance', 'Kota paylı reasürans'),
    note: L(lang, `Cedes ${Math.round(R.reinsurance.share * 100)}% of premium and claims for a ${Math.round(R.reinsurance.commission * 100)}% commission; costs ${fmtMoney(money.reinsuranceFee)} EUR from the budget.`,
      `Prim ve hasarın %${Math.round(R.reinsurance.share * 100)}’ini %${Math.round(R.reinsurance.commission * 100)} komisyonla devreder; bütçeden ${fmtMoney(money.reinsuranceFee)} EUR tutar.`) });
  rows.push({ section: L(lang, 'Checks (turn red when a rule is broken)', 'Kontroller (kural bozulunca kırmızı olur)') });
  rows.push({ check: 'spend', label: L(lang, 'Budget used (EUR)', 'Kullanılan bütçe (EUR)') });
  rows.push({ check: 'left', label: L(lang, 'Budget left (EUR)', 'Kalan bütçe (EUR)') });
  rows.push({ check: 'focus', label: L(lang, 'Marketing focus total %', 'Pazarlama odağı toplamı %') });
  rows.push({ check: 'media', label: L(lang, 'Campaign media a year (EUR)', 'Yıllık kampanya medyası (EUR)') });
  rows.push({ check: 'gifts', label: L(lang, 'Gift budget a year (EUR)', 'Yıllık hediye bütçesi (EUR)') });
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

// The decision workbook, in the case's own design (Marketing_Input.xlsx): four sheets — Input, Premium,
// Marketing, Claim — with the same banners, colours, column widths, merged cells and dropdowns. Cells the
// case file doesn't have but the game needs (team name, marketing budget, channel focus, the chosen gift,
// claims operations, the reinsurance switch) sit in the same style next to the case's own tables.
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
  mediaShare: ['Marketing', 'D11'], offerShare: ['Marketing', 'D12'], marketing: ['Marketing', 'D23'], campaign: ['Marketing', 'D24'],
  channelFocus: ['Marketing', 'D', 27], offer: ['Marketing', 'G22'],
  claimsOps: ['Claim', 'D8'], reinsurance: ['Claim', 'D17']
};

export function buildTemplate(state, { lang = 'en', teams = null } = {}) {
  const config = state.config, R = rulesOf(config), money = cascoMoney(config), K = campaignRules(R);
  const team = (teams ?? state.teams.filter(t => !t.ai))[0];
  const st = team?.strategy ?? defaultStrategy(config), c0 = campaignOf(st);
  const yes = L(lang, 'Yes', 'Evet'), no = L(lang, 'No', 'Hayır'), styles = styleRegistry();
  const eur = v => `€${Math.round(v).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US')}`;
  const pctTxt = v => `${Math.round(v * 100)}%`, fmtDec = fmtDecOf(lang);

  // ——— Input ———
  const input = caseSheet({ styles, widths: { A: 3.9, B: 5, C: 68.1, D: 74.7 }, heights: { 2: 39.8, 3: 24.8, 5: 30, 7: 24.8, 8: 24.8, 9: 24.8, 11: 30, 13: 21.8, 14: 21.8, 15: 21.8, 17: 30, 19: 24.8, 20: 24.8, 21: 24.8 }, tab: BLUE });
  input.set('B2', 'FINANCE DAY', 'inputTitle'); input.merge('B2:H2');
  input.set('B3', L(lang, 'Corporate Strategy and Simulation Parameters', 'Kurumsal Strateji ve Simülasyon Parametreleri'), 'subtitle'); input.merge('B3:H3');
  input.set('B5', L(lang, '📋 USER GUIDE', '📋 KULLANIM KILAVUZU'), 'section14'); input.merge('B5:H5');
  [['1️⃣', L(lang, 'PREMIUM', 'PRİM'), L(lang, `Select segment-based coefficients (${fmtDec(R.coef.min)} - ${fmtDec(R.coef.max)} range, ${fmtDec(R.coef.step)} increments)`, `Segment katsayılarını seç (${fmtDec(R.coef.min)} - ${fmtDec(R.coef.max)} aralığı, ${fmtDec(R.coef.step)} adım)`)],
    ['2️⃣', L(lang, 'MARKETING', 'PAZARLAMA'), L(lang, `Set the marketing budget and its channel distribution (each channel min ${R.marketing.minFocus ?? 0}%, total must = 100%), and the digital campaign`, `Pazarlama bütçesini ve kanal dağılımını belirle (her kanal en az %${R.marketing.minFocus ?? 0}, toplam = %100) ve dijital kampanyayı kur`)],
    ['3️⃣', L(lang, 'CLAIM', 'HASAR'), L(lang, 'Set the claims operations budget and choose the quota-share reinsurance', 'Hasar operasyonu bütçesini belirle ve kota paylı reasüransı seç')]
  ].forEach(([n, label, text], i) => { input.set(`B${7 + i}`, n, 'emoji'); input.set(`C${7 + i}`, label, 'guideLabel'); input.set(`D${7 + i}`, text, 'text'); });
  input.set('B11', L(lang, '⚠️ IMPORTANT NOTES', '⚠️ ÖNEMLİ NOTLAR'), 'notesBanner'); input.merge('B11:H11');
  [L(lang, 'Coefficients, shares and choices are selected from dropdown lists.', 'Katsayılar, paylar ve seçimler açılır listelerden seçilir.'),
    L(lang, 'Marketing channels total must equal 100%; media + offer must equal 100%.', 'Pazarlama kanallarının toplamı %100 olmalı; medya + hediye %100 olmalı.'),
    L(lang, `Marketing + claims operations + reinsurance fee must stay within the decision budget (${eur(money.budget)}).`, `Pazarlama + hasar operasyonu + reasürans bedeli karar bütçesini (${eur(money.budget)}) aşmamalı.`)
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
  const mkt = caseSheet({ styles, widths: { A: 3.9, B: 17.7, C: 55.1, D: 14.6, E: 17.6, F: 28.1, G: 31.9, I: 10.3, J: 8.1, K: 16.1, L: 11.3 }, heights: { 2: 35.2, 3: 37.2, 5: 42.6, 10: 27.8, 11: 27.8, 12: 27.8, 13: 29.2, 14: 30, 19: 14.4, 20: 27.6, 22: 27.8, 23: 24.8, 24: 24.8, 26: 27.8, 27: 21.8, 28: 21.8, 29: 21.8, 30: 21.8, 31: 27.8 }, tab: BLUE, grid: false });
  mkt.set('B2', L(lang, 'MARKETING - CHANNEL DISTRIBUTION', 'PAZARLAMA - KANAL DAĞILIMI'), 'sheetTitle'); mkt.merge('B2:H2');
  mkt.set('B3', L(lang, 'Your marketing budget buys visibility in the sales channels and can run a digital campaign.\nSplit the campaign among media & offer. Sum should equal to 100%.', 'Pazarlama bütçen satış kanallarında görünürlük alır ve dijital kampanya yürütebilir.\nKampanyayı medya ve hediye arasında böl. Toplam %100 olmalı.'), 'mktSub'); mkt.merge('B3:H3');
  mkt.set('B5', L(lang, 'Population : 84 million\n18-55 years old digital users: 43 million\nTarget Group: Joyful Disregarders (21% of 18-55 digital users)', 'Nüfus: 84 milyon\n18-55 yaş dijital kullanıcı: 43 milyon\nHedef kitle: Joyful Disregarders (18-55 yaş dijital kullanıcıların %21’i)'), 'population'); mkt.merge('B5:H5');
  [['B10', L(lang, 'Budget Split', 'Bütçe dağılımı')], ['C10', L(lang, 'Description', 'Açıklama')], ['D10', L(lang, 'Share', 'Pay')], ['F10', L(lang, 'Media', 'Medya')], ['G10', L(lang, 'Description', 'Açıklama')], ['H10', L(lang, 'Cost', 'Maliyet')]].forEach(([ref, v]) => mkt.set(ref, v, 'head'));
  mkt.set('B11', L(lang, 'Media', 'Medya'), 'mktLabel'); mkt.set('C11', L(lang, 'Social media ads to increase the awareness of the campaign', 'Kampanyanın bilinirliğini artıran sosyal medya reklamları'), 'mktDesc'); mkt.set('D11', c0.media / 100, 'yellowPct');
  mkt.set('B12', L(lang, 'Offer', 'Hediye'), 'mktLabel'); mkt.set('C12', L(lang, 'The offer & gifts you will give to casco new acquisition customers', 'Yeni kazanılan kasko müşterilerine vereceğin teklif ve hediyeler'), 'mktDesc'); mkt.set('D12', (100 - c0.media) / 100, 'yellowPct');
  mkt.set('B13', 'TOTAL', 'totalLabel'); mkt.set('C13', '', 'totalLabel'); mkt.merge('B13:C13'); mkt.set('D13', '=D11+D12', 'totalPct');
  mkt.set('B14', L(lang, 'CAMPAIGN BUDGET', 'KAMPANYA BÜTÇESİ'), 'totalLabel'); mkt.set('C14', '', 'totalLabel'); mkt.merge('B14:C14'); mkt.set('D14', '=D23*D24', 'totalEuro');
  mkt.set('F11', L(lang, 'Cost per reach', 'Erişim maliyeti'), 'mktLabel'); mkt.set('G11', L(lang, 'The cost of 1,000 ad impressions', '1.000 reklam gösteriminin maliyeti'), 'mktDesc'); mkt.set('H11', K.cpm, 'euro666');
  mkt.set('F12', L(lang, `If a customer sees an ad more than ${K.frequency} times, the hit ratio tends to increase by ${Math.round(K.frequencyBonus * 100)}%`, `Müşteri reklamı ${K.frequency} kereden fazla görürse hit oranı %${Math.round(K.frequencyBonus * 100)} artar`), 'mktSub'); mkt.set('G12', '', 'mktSub'); mkt.set('H12', '', 'mktSub'); mkt.merge('F12:H12');
  mkt.set('F14', L(lang, 'The Customers who see the ad only once', 'Reklamı yalnızca bir kez gören müşteriler'), 'mktHead'); ['G', 'H', 'I', 'J'].forEach(cl => mkt.set(`${cl}14`, '', 'mktHead')); mkt.merge('F14:J14');
  [['F15', L(lang, 'Possible Offers', 'Olası hediyeler')], ['G15', L(lang, 'Interest Rate', 'İlgi oranı')], ['H15', L(lang, 'Cost', 'Maliyet')], ['I15', L(lang, 'Click Rate', 'Tıklama oranı')], ['J15', L(lang, 'Hit Ratio', 'Hit oranı')]].forEach(([ref, v]) => mkt.set(ref, v, 'mktHead'));
  K.offers.forEach((o, i) => { const r = 16 + i; mkt.set(`F${r}`, offerName(o.id, lang), 'offer'); mkt.set(`G${r}`, o.interest, 'offerPct'); mkt.set(`H${r}`, o.cost, 'offerEuro'); mkt.set(`I${r}`, o.click, 'offerPct'); mkt.set(`J${r}`, o.hit, 'offerPct'); });
  mkt.set('F20', L(lang, '*You need to give at least one gift to all acquired customers', '*Kazandığın her müşteriye en az bir hediye vermelisin'), 'mktSub'); ['G', 'H', 'I', 'J'].forEach(cl => mkt.set(`${cl}20`, '', 'mktSub')); mkt.merge('F20:J20');
  mkt.set('F22', L(lang, 'SELECTED OFFER', 'SEÇİLEN HEDİYE'), 'mktHead'); mkt.set('G22', offerName(c0.offer, lang), 'yellowText');
  [['B22', L(lang, 'Marketing', 'Pazarlama')], ['C22', L(lang, 'Description', 'Açıklama')], ['D22', L(lang, 'Value', 'Değer')]].forEach(([ref, v]) => mkt.set(ref, v, 'head'));
  mkt.set('B23', L(lang, 'Budget', 'Bütçe'), 'mktLabel'); mkt.set('C23', L(lang, 'Total marketing for the year, from the decision budget', 'Yıllık toplam pazarlama; karar bütçesinden'), 'mktDesc'); mkt.set('D23', st.marketing, 'yellowEuro');
  mkt.set('B24', L(lang, 'Campaign share', 'Kampanya payı'), 'mktLabel'); mkt.set('C24', L(lang, 'Runs the digital campaign; the rest buys channel visibility', 'Dijital kampanyaya gider; kalanı kanal görünürlüğü alır'), 'mktDesc'); mkt.set('D24', c0.share / 100, 'yellowPct');
  [['B26', L(lang, 'Channel', 'Kanal')], ['C26', L(lang, 'Description', 'Açıklama')], ['D26', L(lang, 'Share', 'Pay')]].forEach(([ref, v]) => mkt.set(ref, v, 'head'));
  const channelNotes = [L(lang, 'Agent marketing support', 'Acente pazarlama desteği'), L(lang, 'Bancassurance visibility', 'Bankasürans görünürlüğü'), L(lang, 'Online visibility (outside the campaign)', 'Çevrimiçi görünürlük (kampanya dışında)'), L(lang, 'Broker support', 'Broker desteği')];
  R.dimensions.channel.forEach((lv, i) => { const r = 27 + i; mkt.set(`B${r}`, lv.id, 'mktLabel'); mkt.set(`C${r}`, channelNotes[i] ?? '', 'mktDesc'); mkt.set(`D${r}`, st.channelFocus[i] / 100, 'yellowPct'); });
  mkt.set('B31', 'TOTAL', 'totalLabel'); mkt.set('C31', '', 'totalLabel'); mkt.merge('B31:C31'); mkt.set('D31', '=SUM(D27:D30)', 'totalPct');
  const pctList = Array.from({ length: 21 }, (_, i) => i * 5 / 100), focusList = pctList.filter(v => v >= (R.marketing.minFocus ?? 0) / 100 - 1e-9);
  pctList.forEach((v, i) => mkt.set(`XFB${i + 1}`, v, 'listCell'));
  focusList.forEach((v, i) => mkt.set(`XFC${i + 1}`, v, 'listCell'));
  K.offers.forEach((o, i) => mkt.set(`XFD${i + 1}`, offerName(o.id, lang), 'listCell'));
  const pickPct = L(lang, 'Pick a share from the list (steps of 5%).', 'Listeden bir pay seç (%5 adım).');
  mkt.list('D11:D12 D24', 'PercentageList', pickPct);
  mkt.list(`D27:D${26 + R.dimensions.channel.length}`, 'FocusList', L(lang, `Pick a share from the list (at least ${R.marketing.minFocus ?? 0}%).`, `Listeden bir pay seç (en az %${R.marketing.minFocus ?? 0}).`));
  mkt.list('G22', 'OfferList', L(lang, 'Pick one of the offers.', 'Hediyelerden birini seç.'));
  mkt.decimal('D23', 0, money.budget, L(lang, `Enter 0 to ${money.budget}.`, `0 ile ${money.budget} arasında gir.`));
  mkt.redWhen('D13', 'notEqual', '1', 1); mkt.redWhen('D31', 'notEqual', '1', 2);

  // ——— Claim ———
  const claim = caseSheet({ styles, widths: { A: 3.9, B: 25, C: 45.4, D: 16, K: 4.9 }, heights: { 2: 35.2, 3: 24.8, 5: 27.8, 7: 26.2, 8: 26.2, 9: 26.2, 10: 26.2, 11: 26.2, 12: 27.8, 14: 27.8, 16: 26.2, 17: 27.8 }, tab: NAVY });
  claim.set('B2', L(lang, 'CLAIM - BUDGET ALLOCATION', 'HASAR - BÜTÇE DAĞILIMI'), 'sheetTitle'); claim.merge('B2:I2');
  claim.set('B3', L(lang, 'Define the claims operations budget and the reinsurance treaty', 'Hasar operasyonu bütçesini ve reasürans anlaşmasını belirle'), 'sheetSub'); claim.merge('B3:I3');
  claim.set('B5', L(lang, '📊 CLAIMS OPERATIONS', '📊 HASAR OPERASYONU'), 'claimSection'); claim.merge('B5:I5');
  [['B7', L(lang, 'PARAMETER', 'PARAMETRE')], ['C7', L(lang, 'DESCRIPTION', 'AÇIKLAMA')], ['D7', L(lang, 'VALUE', 'DEĞER')]].forEach(([ref, v]) => claim.set(ref, v, 'claimHead'));
  claim.set('B8', L(lang, 'Claims Operations', 'Hasar operasyonu'), 'claimLabel'); claim.set('C8', L(lang, 'Claims-handling capacity. Too little hurts satisfaction (NPS) and leaks claims cost.', 'Hasar yönetim kapasitesi. Az olursa memnuniyet (NPS) düşer, hasar maliyeti kaçar.'), 'claimDesc'); claim.set('D8', st.claimsOps, 'inputEuro');
  claim.set('B9', L(lang, 'Marketing Budget', 'Pazarlama bütçesi'), 'claimLabel'); claim.set('C9', L(lang, 'From the Marketing sheet', 'Pazarlama sayfasından'), 'claimDesc'); claim.set('D9', '=Marketing!D23', 'claimEuro');
  claim.set('B10', L(lang, 'Reinsurance Fee', 'Reasürans bedeli'), 'claimLabel'); claim.set('C10', L(lang, 'Paid from the budget if the treaty is chosen', 'Anlaşma seçilirse bütçeden ödenir'), 'claimDesc'); claim.set('D10', `=IF(D17="${yes}",${money.reinsuranceFee},0)`, 'claimEuro');
  claim.set('B11', L(lang, 'Decision Budget', 'Karar bütçesi'), 'claimLabel'); claim.set('C11', L(lang, 'The most you can spend in the year', 'Yıl içinde harcayabileceğin en fazla tutar'), 'claimDesc'); claim.set('D11', money.budget, 'claimEuro');
  claim.set('B12', L(lang, 'TOTAL USED', 'TOPLAM KULLANILAN'), 'claimTotalLabel'); claim.set('C12', '', 'claimTotalLabel'); claim.merge('B12:C12'); claim.set('D12', '=D8+D9+D10', 'claimTotalEuro');
  claim.outline('B7:D12');
  claim.decimal('D8', 0, money.budget, L(lang, `Enter 0 to ${money.budget}.`, `0 ile ${money.budget} arasında gir.`));
  claim.redWhen('D12', 'greaterThan', 'D11', 1);
  claim.set('B14', L(lang, '🔄 REINSURANCE', '🔄 REASÜRANS'), 'claimSection'); claim.merge('B14:I14');
  [['B16', L(lang, 'PARAMETER', 'PARAMETRE')], ['C16', L(lang, 'DESCRIPTION', 'AÇIKLAMA')], ['D16', L(lang, 'VALUE', 'DEĞER')]].forEach(([ref, v]) => claim.set(ref, v, 'claimHead'));
  claim.set('B17', L(lang, 'Quota-share Reinsurance', 'Kota paylı reasürans'), 'claimLabel');
  claim.set('C17', L(lang, `Cedes ${pctTxt(R.reinsurance.share)} of premium and claims for a ${pctTxt(R.reinsurance.commission)} commission; costs ${eur(money.reinsuranceFee)}`, `Prim ve hasarın %${Math.round(R.reinsurance.share * 100)}’ini %${Math.round(R.reinsurance.commission * 100)} komisyonla devreder; bedeli ${eur(money.reinsuranceFee)}`), 'claimDesc');
  claim.set('D17', st.reinsurance ? yes : no, 'inputText');
  claim.outline('B16:D17');
  claim.set('XFD1', yes, 'listCell'); claim.set('XFD2', no, 'listCell');
  claim.list('D17', 'YesNoList', L(lang, 'Choose Yes or No.', 'Evet ya da Hayır seç.'));
  claim.set('B19', L(lang, '💡 Note: All choices are selected from dropdowns. The total used must not exceed the decision budget; the reinsurance holds for the whole year.', '💡 Not: Tüm seçimler açılır listelerden yapılır. Toplam kullanılan karar bütçesini aşmamalı; reasürans yıl boyunca geçerlidir.'), 'note'); claim.merge('B19:I19');

  const sheets = [['Input', input], ['Premium', prem], ['Marketing', mkt], ['Claim', claim]];
  const definedNames = [
    `<definedName name="CoefficientList">Premium!$XFD$1:$XFD$${coefList.length}</definedName>`,
    `<definedName name="FocusList">Marketing!$XFC$1:$XFC$${focusList.length}</definedName>`,
    `<definedName name="OfferList">Marketing!$XFD$1:$XFD$${K.offers.length}</definedName>`,
    `<definedName name="PercentageList">Marketing!$XFB$1:$XFB$${pctList.length}</definedName>`,
    `<definedName name="YesNoList">Claim!$XFD$1:$XFD$2</definedName>`
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
const offerId = v => {
  const key = norm(v);
  if (!key) return null;
  for (const id of ['concert', 'restaurant', 'coffee', 'gym']) if ([id, offerName(id, 'en'), offerName(id, 'tr')].some(x => norm(x) === key)) return id;
  return null;
};
const toBool = v => (typeof v === 'boolean' ? v : ['evet', 'yes', 'true', '1', 'x', 'var', 'e', 'y'].includes(norm(v)));

// The case layout (Input / Premium / Marketing / Claim) read back as the row layout the checks below expect:
// one synthetic sheet with the machine key in column A and the team's value in column D.
const isCaseLayout = sheets => ['premium', 'marketing', 'claim'].every(n => sheets.some(sh => norm(sh.name) === n));
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
  const [fs, fc, ff] = C.channelFocus;
  R.dimensions.channel.forEach((_, i) => put(`channelFocus.${i}`, pct(at(fs, `${fc}${ff + i}`))));
  put('campaign', pct(at(...C.campaign)));
  const media = pct(at(...C.mediaShare)), offerShare = pct(at(...C.offerShare));
  put('mediaShare', Number.isFinite(media) && Number.isFinite(offerShare) && Math.abs(media + offerShare - 100) > 0.01 ? NaN : media);
  put('offer', at(...C.offer)); put('claimsOps', at(...C.claimsOps)); put('reinsurance', at(...C.reinsurance));
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
      const missing = [...specByKey.keys()].filter(k => !rowKey.has(k) && !['product', 'sentence', 'campaign', 'mediaShare', 'offer'].includes(k));
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
          channelFocus: R.dimensions.channel.map((_, i) => toNumber(get(`channelFocus.${i}`))),
          claimsOps: toNumber(get('claimsOps')),
          reinsurance: toBool(get('reinsurance')),
          ...(rowKey.has('campaign') ? { campaign: toNumber(get('campaign')), mediaShare: toNumber(get('mediaShare')), offer: offerId(get('offer')) } : { campaign: 0, mediaShare: 50, offer: 'concert' })
        };
        for (const k of ['campaign', 'mediaShare']) if (strategy[k] <= 1 && strategy[k] > 0 && !Number.isInteger(strategy[k])) strategy[k] = Math.round(strategy[k] * 100); // percent-formatted cells
        if (!Number.isFinite(strategy.campaign) || !Number.isFinite(strategy.mediaShare)) rowErrors.push(L(lang, 'a campaign % is empty', 'bir kampanya yüzdesi boş'));
        if (!strategy.offer) rowErrors.push(L(lang, 'pick a campaign gift from the list', 'listeden bir kampanya hediyesi seç'));
        if (!Number.isFinite(strategy.basePremium)) rowErrors.push(L(lang, 'the base premium is empty', 'baz prim boş'));
        for (const dim of DIMENSIONS) strategy.coef[dim].forEach((v, i) => {
          const label = `${dimensionName(dim, lang)} · ${levelName(dim, i, lang)}`;
          if (!Number.isFinite(v)) rowErrors.push(L(lang, `the ${label} coefficient is empty`, `${label} katsayısı boş`));
          else if (v < R.coef.min || v > R.coef.max) rowErrors.push(L(lang, `the ${label} coefficient must be ${R.coef.min}–${R.coef.max} (it is ${v})`, `${label} katsayısı ${R.coef.min}–${R.coef.max} olmalı (şu an ${v})`));
        });
        for (const k of ['marketing', 'claimsOps']) if (!Number.isFinite(strategy[k])) rowErrors.push(L(lang, `${specByKey.get(k).label} is empty`, `${specByKey.get(k).label} boş`));
        let focus = strategy.channelFocus;
        if (focus.some(v => !Number.isFinite(v))) rowErrors.push(L(lang, 'a marketing focus % is empty', 'bir pazarlama odağı % boş'));
        else {
          if (focus.every(v => v <= 1) && Math.abs(focus.reduce((a, b) => a + b, 0) - 1) < 0.02) focus = focus.map(v => v * 100); // cells formatted as percent
          focus = focus.map(v => Math.round(v));
          const sum = focus.reduce((a, b) => a + b, 0);
          if (Math.abs(sum - 100) <= 1) focus[focus.indexOf(Math.max(...focus))] += 100 - sum;
          strategy.channelFocus = focus;
        }
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
