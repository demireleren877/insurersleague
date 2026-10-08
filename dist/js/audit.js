// The audit workbook: the whole season as spreadsheet formulas, so every number the app shows can be
// traced and recomputed. Inputs are the rules, the events, the teams' plans and the luck table (uniform
// numbers drawn from the seed before any decision matters). Everything else is a formula. With the same
// inputs the workbook lands on the same scores as the app, and changing a plan in the workbook gives the
// score the app would give that plan.
import {
  rulesOf, cascoMoney, policiesOf, marketCells, drawsFor, planAt, simulate, rank, DIMENSIONS,
  dimensionName, levelName, eventScopesFor, monthsOf, campaignRules, campaignOf, offerName
} from '../engine.js';

const L = (lang, en, tr) => (lang === 'tr' ? tr : en);
const col = i => { let s = ''; for (i++; i; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; };
const xml = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const QUARTERS = 4;

// ——— A tiny sheet writer ———
// Cells: numbers, text, or formulas (strings starting with '='). Style ids match STYLES below.
function sheet() {
  const rows = new Map();
  const put = (r, c, v, style = 0) => { if (!rows.has(r)) rows.set(r, []); rows.get(r).push([c, v, style]); };
  const toXml = ({ widths = [], freeze = null } = {}) => {
    const body = [...rows.keys()].sort((a, b) => a - b).map(r => `<row r="${r}">${rows.get(r).sort((a, b) => a[0] - b[0]).map(([c, v, st]) => {
      const ref = `${col(c)}${r}`;
      if (v === null || v === undefined || v === '') return `<c r="${ref}" s="${st}"/>`;
      if (typeof v === 'number') return `<c r="${ref}" s="${st}"><v>${Number.isFinite(v) ? v : 0}</v></c>`;
      if (typeof v === 'boolean') return `<c r="${ref}" s="${st}" t="b"><v>${v ? 1 : 0}</v></c>`;
      if (v.startsWith('=')) return `<c r="${ref}" s="${st}"><f>${xml(v.slice(1))}</f></c>`;
      return `<c r="${ref}" s="${st}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
    }).join('')}</row>`).join('');
    const pane = freeze ? `<sheetViews><sheetView workbookViewId="0"><pane xSplit="${freeze[0]}" ySplit="${freeze[1]}" topLeftCell="${col(freeze[0])}${freeze[1] + 1}" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>` : '';
    const cols = widths.length ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${pane}${cols}<sheetData>${body}</sheetData></worksheet>`;
  };
  return { put, toXml };
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3"><numFmt numFmtId="164" formatCode="#,##0"/><numFmt numFmtId="165" formatCode="0.0000"/><numFmt numFmtId="166" formatCode="0.00"/></numFmts>
<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="16"/><name val="Calibri"/></font><font><i/><sz val="10"/><color rgb="FF45474A"/><name val="Calibri"/></font></fonts>
<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFD43B"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF1F3F5"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF3BF"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFADB5BD"/></left><right style="thin"><color rgb="FFADB5BD"/></right><top style="thin"><color rgb="FFADB5BD"/></top><bottom style="thin"><color rgb="FFADB5BD"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="10">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="166" fontId="1" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
<xf numFmtId="165" fontId="0" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/>
</cellXfs></styleSheet>`;
// 0 plain · 1 header · 2 input (yellow) · 3 integer · 4 four decimals · 5 title · 6 wrapped text · 7 section · 8 score · 9 input, 4 decimals
const S = { plain: 0, head: 1, input: 2, int: 3, dec: 4, title: 5, text: 6, section: 7, score: 8, inputDec: 9 };

// ——— Zip with deflate (the workbook is large; compression keeps it small) ———
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = bytes => { let c = 0xFFFFFFFF; for (const b of bytes) c = CRC[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
async function deflate(bytes) {
  const out = await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer();
  return new Uint8Array(out);
}
async function zip(files) {
  const enc = new TextEncoder(), local = [], central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = enc.encode(text), packed = await deflate(data), nameBytes = enc.encode(name), crc = crc32(data);
    const head = new DataView(new ArrayBuffer(30));
    head.setUint32(0, 0x04034b50, true); head.setUint16(4, 20, true); head.setUint16(6, 0x0800, true); head.setUint16(8, 8, true);
    head.setUint32(14, crc, true); head.setUint32(18, packed.length, true); head.setUint32(22, data.length, true); head.setUint16(26, nameBytes.length, true);
    local.push(new Uint8Array(head.buffer), nameBytes, packed);
    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true); dir.setUint16(4, 20, true); dir.setUint16(6, 20, true); dir.setUint16(8, 0x0800, true); dir.setUint16(10, 8, true);
    dir.setUint32(16, crc, true); dir.setUint32(20, packed.length, true); dir.setUint32(24, data.length, true); dir.setUint16(28, nameBytes.length, true); dir.setUint32(42, offset, true);
    central.push(new Uint8Array(dir.buffer), nameBytes);
    offset += 30 + nameBytes.length + packed.length;
  }
  const size = central.reduce((n, b) => n + b.length, 0), count = Object.keys(files).length;
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, count, true); end.setUint16(10, count, true); end.setUint32(12, size, true); end.setUint32(16, offset, true);
  const parts = [...local, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((n, b) => n + b.length, 0));
  let at = 0; for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

// ——— The workbook ———
export async function buildAuditWorkbook(state, { lang = 'en' } = {}) {
  const config = state.config, R = rulesOf(config), money = cascoMoney(config), cells = marketCells();
  const teams = state.teams, n = teams.length, C = cells.length, ROWS = 12 * C;
  const draws = drawsFor(config, teams);
  const names = {};   // defined names → absolute references
  const q = name => `'${name}'`;

  // Sheet names
  const SH = {
    guide: L(lang, 'Read me', 'Oku beni'), rules: L(lang, 'Rules', 'Kurallar'), events: L(lang, 'Events', 'Olaylar'),
    plans: L(lang, 'Decisions', 'Kararlar'), market: L(lang, 'Market', 'Pazar'), luck: L(lang, 'Luck', 'Sans'),
    teamLuck: L(lang, 'Team luck', 'Sans takim'), calc: L(lang, 'Calc', 'Hesap'), ledger: L(lang, 'Ledger', 'Defter'), score: L(lang, 'Score', 'Puan'),
    campaign: L(lang, 'Campaign', 'Kampanya')
  };

  // ——— Rules ———
  const rules = sheet();
  rules.put(1, 0, L(lang, 'Rules and money (inputs)', 'Kurallar ve para (girdiler)'), S.title);
  rules.put(2, 0, L(lang, 'Yellow cells are inputs. Every formula in the workbook reads them by name.', 'Sarı hücreler girdidir. Dosyadaki her formül bunları adıyla okur.'), S.text);
  let r = 4;
  const param = (name, label, value, note = '') => {
    rules.put(r, 0, label); rules.put(r, 1, name); rules.put(r, 2, value, S.inputDec); if (note) rules.put(r, 3, note, S.text);
    names[name] = `${q(SH.rules)}!$C$${r}`; r++;
  };
  const section = title => { r++; rules.put(r, 0, title, S.section); r++; };
  section(L(lang, 'Claims model', 'Hasar modeli'));
  param('BaseFreq', L(lang, 'Base claim frequency', 'Temel hasar frekansı'), R.model.frequency);
  param('BaseSev', L(lang, 'Base severity (EUR)', 'Temel şiddet (EUR)'), R.model.severity);
  param('FreqNorm', L(lang, 'Frequency normalization', 'Frekans normalizasyonu'), R.model.freqNorm ?? 1, L(lang, 'Scales the frequency coefficient product to the portfolio average, as in the data.', 'Frekans katsayı çarpımını veride olduğu gibi portföy ortalamasına ölçekler.'));
  param('SevNorm', L(lang, 'Severity normalization', 'Şiddet normalizasyonu'), R.model.sevNorm ?? 1, L(lang, 'Scales the severity coefficient product to the portfolio average, as in the data.', 'Şiddet katsayı çarpımını veride olduğu gibi portföy ortalamasına ölçekler.'));
  param('MarketLR', L(lang, 'Market loss ratio', 'Piyasa hasar oranı'), R.model.lossRatio, L(lang, 'Sets the rest of the market’s reference premium.', 'Piyasanın referans primini belirler.'));
  param('GammaShape', L(lang, 'Gamma shape', 'Gamma şekli'), R.model.gammaShape);
  section(L(lang, 'Market and customers', 'Pazar ve müşteri'));
  param('YearPolicies', L(lang, 'Policies a year (whole market)', 'Yıllık poliçe (tüm pazar)'), policiesOf(config));
  param('SampleCustomers', L(lang, 'Customers in the sample', 'Örneklemdeki müşteri'), cells.reduce((a, c) => a + c[5], 0));
  param('Outside', L(lang, 'Rest of the market’s pull', 'Piyasanın geri kalanının çekimi'), R.market.outside);
  param('Seasonality', L(lang, 'Seasonality', 'Mevsimsellik'), R.market.seasonality);
  param('CommercialPrice', L(lang, 'Commercial price sensitivity ×', 'Ticari fiyat hassasiyeti ×'), R.commercialPrice);
  const K = campaignRules(R);
  section(L(lang, 'Digital campaign', 'Dijital kampanya'));
  param('CampCPM', L(lang, 'Media cost per 1,000 impressions (EUR)', '1.000 gösterim maliyeti (EUR)'), K.cpm);
  param('CampUsers', L(lang, 'Digital users (case)', 'Dijital kullanıcı (vaka)'), K.digitalUsers);
  param('CampTarget', L(lang, 'Target group share', 'Hedef kitle payı'), K.targetShare);
  param('CampRefBudget', L(lang, 'Case campaign budget (EUR)', 'Vakadaki kampanya bütçesi (EUR)'), K.referenceBudget, L(lang, 'People per euro of the case are kept: audience per team-year = users × target share × marketing budget ÷ this.', 'Vakadaki euro başına kişi korunur: takım-yılı başına kitle = kullanıcı × hedef payı × pazarlama bütçesi ÷ bu.'));
  param('CampFreq', L(lang, 'Frequency threshold', 'Frekans eşiği'), K.frequency);
  param('CampBonus', L(lang, 'Hit ratio bonus above it', 'Eşik üstü dönüşüm artışı'), K.frequencyBonus);
  param('CampPriceCap', L(lang, 'Price effect cap', 'Fiyat etkisi tavanı'), K.priceCap);
  param('CampChannel', L(lang, 'Campaign channel (row in the channel table)', 'Kampanya kanalı (kanal tablosunda satır)'), K.channel + 1);
  section(L(lang, 'Money', 'Para'));
  param('Budget', L(lang, 'Marketing budget (EUR)', 'Pazarlama bütçesi (EUR)'), money.budget);
  param('FixedCost', L(lang, 'Fixed cost a year (EUR)', 'Yıllık sabit gider (EUR)'), config.assumptions.fixedCost.value);
  section(L(lang, 'Scoring', 'Puanlama'));
  param('WProfit', L(lang, 'Weight: profitability %', 'Ağırlık: kârlılık %'), config.weights[0]);
  param('WShare', L(lang, 'Weight: market share %', 'Ağırlık: pazar payı %'), config.weights[1]);
  param('ProfitFloor', L(lang, 'Profitability floor (profit / fair slice)', 'Kârlılık tabanı (kâr / adil dilim)'), money.profitFloor);
  param('ProfitTarget', L(lang, 'Profitability target (profit / fair slice)', 'Kârlılık hedefi (kâr / adil dilim)'), money.profitTarget);
  param('ShareTarget', L(lang, 'Share target (× fair share)', 'Pay hedefi (× adil pay)'), money.shareTarget);
  rules.put(r + 1, 0, L(lang, 'Derived', 'Türetilen'), S.section);
  rules.put(r + 2, 0, L(lang, 'Number of teams', 'Takım sayısı')); rules.put(r + 2, 1, 'Teams'); rules.put(r + 2, 2, `=COUNTA(${q(SH.plans)}!$C$3:$${col(2 + n * QUARTERS)}$3)`, S.int);
  names.Teams = `${q(SH.rules)}!$C$${r + 2}`;
  rules.put(r + 3, 0, L(lang, 'Share that earns full points', 'Tam puan getiren pay')); rules.put(r + 3, 1, 'ShareFull'); rules.put(r + 3, 2, '=MIN(1,ShareTarget/Teams)', S.dec);
  names.ShareFull = `${q(SH.rules)}!$C$${r + 3}`;
  rules.put(r + 4, 0, L(lang, 'Fair slice of the market (premium at market prices ÷ 6)', 'Adil pazar dilimi (piyasa fiyatlarıyla prim ÷ 6)')); rules.put(r + 4, 1, 'FairSlice');
  rules.put(r + 4, 2, `=SUMPRODUCT(${q(SH.market)}!$P$2:$P$${C + 1},${q(SH.market)}!$N$2:$N$${C + 1})/6`, S.int);
  names.FairSlice = `${q(SH.rules)}!$C$${r + 4}`;

  // Level tables: frequency, severity, market premium (+ expense for channels) and persona behaviour.
  let tr = r + 8;
  const tableAt = {};
  rules.put(tr, 0, L(lang, 'Segment coefficients', 'Segment katsayıları'), S.section); tr++;
  for (const dim of DIMENSIONS) {
    rules.put(tr, 0, dimensionName(dim, lang), S.head); rules.put(tr, 1, 'id', S.head); rules.put(tr, 2, L(lang, 'Frequency', 'Frekans'), S.head); rules.put(tr, 3, L(lang, 'Severity', 'Şiddet'), S.head); rules.put(tr, 4, L(lang, 'Market premium', 'Piyasa primi'), S.head);
    if (dim === 'channel') rules.put(tr, 5, L(lang, 'Expense ratio', 'Gider oranı'), S.head);
    tr++;
    const first = tr;
    R.dimensions[dim].forEach((lv, i) => {
      rules.put(tr, 0, levelName(dim, i, lang)); rules.put(tr, 1, lv.id);
      rules.put(tr, 2, lv.freq, S.inputDec); rules.put(tr, 3, lv.sev, S.inputDec); rules.put(tr, 4, lv.prem, S.inputDec);
      if (dim === 'channel') rules.put(tr, 5, lv.expense, S.inputDec);
      tr++;
    });
    tableAt[dim] = `${q(SH.rules)}!$C$${first}:$F$${tr - 1}`;
    names[`T_${dim}`] = tableAt[dim];
    tr++;
  }
  rules.put(tr, 0, L(lang, 'Persona behaviour (hidden from teams)', 'Persona davranışı (takımlardan gizli)'), S.head); rules.put(tr, 2, L(lang, 'Price sensitivity', 'Fiyat hassasiyeti'), S.head);
  tr++;
  const bFirst = tr;
  R.behavior.forEach((b, i) => { rules.put(tr, 0, levelName('persona', i, lang)); rules.put(tr, 2, b.price, S.inputDec); tr++; });
  names.T_behavior = `${q(SH.rules)}!$C$${bFirst}:$C$${tr - 1}`;
  tr++;
  rules.put(tr, 0, L(lang, 'Campaign gifts', 'Kampanya hediyeleri'), S.head); rules.put(tr, 1, '#', S.head); rules.put(tr, 2, L(lang, 'Interest', 'İlgi'), S.head); rules.put(tr, 3, L(lang, 'Click', 'Tıklama'), S.head); rules.put(tr, 4, 'Hit', S.head); rules.put(tr, 5, L(lang, 'Cost (EUR)', 'Maliyet (EUR)'), S.head);
  tr++;
  const oFirst = tr;
  K.offers.forEach((o, i) => { rules.put(tr, 0, offerName(o.id, lang)); rules.put(tr, 1, i + 1); rules.put(tr, 2, o.interest, S.inputDec); rules.put(tr, 3, o.click, S.inputDec); rules.put(tr, 4, o.hit, S.inputDec); rules.put(tr, 5, o.cost, S.inputDec); tr++; });
  names.T_offer = `${q(SH.rules)}!$C$${oFirst}:$F$${tr - 1}`;

  // ——— Events ———
  const ev = sheet();
  ev.put(1, 0, L(lang, 'Event calendar (inputs)', 'Olay takvimi (girdiler)'), S.title);
  ev.put(2, 0, L(lang, 'Month 1–12. Scope: all, or a dimension (city, channel, vehicle, persona, type) and its level number (1 = first row of that table).', 'Ay 1–12. Kapsam: all ya da bir boyut (city, channel, vehicle, persona, type) ve seviye numarası (1 = o tablonun ilk satırı).'), S.text);
  ['#', L(lang, 'Title', 'Başlık'), L(lang, 'Month', 'Ay'), L(lang, 'Lasts (months)', 'Süre (ay)'), L(lang, 'Scope', 'Kapsam'), L(lang, 'Level', 'Seviye'), L(lang, 'Claims ×', 'Hasar ×'), L(lang, 'Demand ×', 'Talep ×')].forEach((h, c) => ev.put(4, c, h, S.head));
  for (let i = 0; i < 12; i++) {
    const e = config.events[i], row = 5 + i;
    ev.put(row, 0, i + 1);
    if (e) {
      const [dim, lv] = e.scope && e.scope !== 'all' ? e.scope.split(':') : ['all', ''];
      ev.put(row, 1, e.title); ev.put(row, 2, e.month + 1, S.input); ev.put(row, 3, e.duration || 1, S.input);
      ev.put(row, 4, dim, S.input); ev.put(row, 5, lv === '' ? '' : Number(lv) + 1, S.input); ev.put(row, 6, e.cost ?? 1, S.inputDec); ev.put(row, 7, e.demand ?? 1, S.inputDec);
    } else for (let c = 1; c <= 7; c++) ev.put(row, c, '', c >= 2 ? S.input : 0);
  }
  const evRange = c => `${q(SH.events)}!$${col(c)}$5:$${col(c)}$16`;
  Object.assign(names, { EvMonth: evRange(2), EvLast: evRange(3), EvScope: evRange(4), EvLevel: evRange(5), EvCost: evRange(6), EvDemand: evRange(7) });

  // ——— Decisions: one block of four quarter columns per team ———
  const plans = sheet();
  const decisionRows = [
    ['basePremium', L(lang, 'Base premium (EUR)', 'Baz prim (EUR)')],
    ...DIMENSIONS.flatMap(dim => R.dimensions[dim].map((_, i) => [`coef.${dim}.${i}`, `${dimensionName(dim, lang)} · ${levelName(dim, i, lang)}`])),
    ['marketing', L(lang, 'Marketing to spend from the start month to December (EUR)', 'Başlangıç ayından Aralık’a harcanacak pazarlama (EUR)')],
    ['marketingFrom', L(lang, 'Start month of that marketing (1–12)', 'O pazarlamanın başladığı ay (1–12)')],
    ['mediaShare', L(lang, 'Media share % (of marketing)', 'Medya payı % (pazarlamanın)')],
    ...K.offers.map((o, i) => [`offers.${i}`, `${L(lang, 'Gift weight %', 'Hediye ağırlığı %')} · ${offerName(o.id, lang)}`])
  ];
  const D0 = 5; // first decision row
  const rowOf = key => D0 + decisionRows.findIndex(([k]) => k === key);
  const valueOf = (plan, key) => {
    const st = plan.strategy;
    if (key === 'marketingFrom') return plan.from + 1;
    if (key === 'mediaShare') return campaignOf(st).media;
    if (key.startsWith('offers.')) return campaignOf(st).weights[Number(key.slice(7))] ?? 0;
    return key.split('.').reduce((o, k) => o[k], st);
  };
  plans.put(1, 0, L(lang, 'Team decisions (inputs)', 'Takım kararları (girdiler)'), S.title);
  plans.put(2, 0, L(lang, 'Q1 = months 1–3. A later quarter that repeats the previous one is a formula, so editing Q1 flows through.', 'Ç1 = 1–3. aylar. Önceki çeyreği tekrar eden çeyrekler formüldür; Ç1’i değiştirince devam eder.'), S.text);
  plans.put(3, 0, L(lang, 'Team', 'Takım'), S.head); plans.put(4, 0, L(lang, 'Quarter', 'Çeyrek'), S.head);
  decisionRows.forEach(([, label], k) => plans.put(D0 + k, 0, label));
  teams.forEach((team, ti) => {
    const periods = [0, 3, 6, 9].map(m => planAt(team, m));
    for (let qi = 0; qi < QUARTERS; qi++) {
      const c = 2 + ti * QUARTERS + qi;
      plans.put(3, c, qi === 0 ? team.name : '', S.head);
      plans.put(4, c, L(lang, `Q${qi + 1}`, `Ç${qi + 1}`), S.head);
      decisionRows.forEach(([key], k) => {
        const same = qi > 0 && JSON.stringify(valueOf(periods[qi], key)) === JSON.stringify(valueOf(periods[qi - 1], key));
        plans.put(D0 + k, c, same ? `=${col(c - 1)}${D0 + k}` : valueOf(periods[qi], key), same ? S.dec : S.inputDec);
      });
    }
  });
  const lastPlanCol = col(1 + n * QUARTERS);
  names.Plans = `${q(SH.plans)}!$C$${D0}:$${lastPlanCol}$${D0 + decisionRows.length - 1}`;
  const P = key => rowOf(key) - D0 + 1; // row inside Plans
  // Checks per team (the app refuses plans that overspend or whose gift weights don't total 100)
  const checkRow = D0 + decisionRows.length + 1;
  plans.put(checkRow, 0, L(lang, 'Marketing spent in the quarter (the year’s total must be ≤ Budget)', 'Çeyrekte harcanan pazarlama (yıl toplamı ≤ Bütçe olmalı)'), S.section);
  plans.put(checkRow + 1, 0, L(lang, 'Gift weights total % (must be 100)', 'Hediye ağırlıkları toplamı % (100 olmalı)'), S.section);
  teams.forEach((_, ti) => { for (let qi = 0; qi < QUARTERS; qi++) { const c = 2 + ti * QUARTERS + qi, cl = col(c); plans.put(checkRow, c, `=3*${cl}${rowOf('marketing')}/(13-${cl}${rowOf('marketingFrom')})`, S.int); plans.put(checkRow + 1, c, `=SUM(${cl}${rowOf('offers.0')}:${cl}${rowOf(`offers.${K.offers.length - 1}`)})`, S.int); } });

  // ——— Market: the 247 cells of the sample ———
  const market = sheet();
  ['#', L(lang, 'City', 'İl'), L(lang, 'Channel', 'Kanal'), L(lang, 'Vehicle', 'Araç'), L(lang, 'Persona', 'Persona'), L(lang, 'Type', 'Tip'),
    L(lang, 'Sample count', 'Örneklem adedi'), L(lang, 'Last-term premium', 'Önceki dönem primi'), L(lang, 'Competitor index', 'Rakip endeksi'),
    L(lang, 'Frequency', 'Frekans'), L(lang, 'Severity', 'Şiddet'), L(lang, 'Market premium factor', 'Piyasa prim faktörü'), L(lang, 'Expected cost / policy', 'Poliçe başı beklenen maliyet'),
    L(lang, 'Reference premium', 'Referans prim'), L(lang, 'Price sensitivity β', 'Fiyat hassasiyeti β'), L(lang, 'Policies a year', 'Yıllık poliçe'),
    L(lang, 'Channel expense', 'Kanal gideri'),
    L(lang, 'Label', 'Etiket'), L(lang, 'Campaign target share', 'Kampanya hedef payı')].forEach((h, c) => market.put(1, c, h, S.head));
  const T = (dim, idxCol, row, k) => `INDEX(T_${dim},${idxCol}${row},${k})`;
  cells.forEach((cell, i) => {
    const row = i + 2;
    market.put(row, 0, i + 1);
    for (let k = 0; k < 5; k++) market.put(row, 1 + k, cell[k] + 1);
    market.put(row, 6, cell[5]); market.put(row, 7, cell[6]); market.put(row, 8, cell[7]);
    market.put(row, 9, `=BaseFreq*FreqNorm*${T('city', 'B', row, 1)}*${T('channel', 'C', row, 1)}*${T('vehicle', 'D', row, 1)}*${T('persona', 'E', row, 1)}*${T('type', 'F', row, 1)}`, S.dec);
    market.put(row, 10, `=BaseSev*SevNorm*${T('city', 'B', row, 2)}*${T('channel', 'C', row, 2)}*${T('vehicle', 'D', row, 2)}*${T('persona', 'E', row, 2)}*${T('type', 'F', row, 2)}`, S.dec);
    market.put(row, 11, `=${T('city', 'B', row, 3)}*${T('channel', 'C', row, 3)}*${T('vehicle', 'D', row, 3)}*${T('persona', 'E', row, 3)}*${T('type', 'F', row, 3)}`, S.dec);
    market.put(row, 12, `=J${row}*K${row}`, S.dec);
    market.put(row, 13, `=BaseFreq*BaseSev/MarketLR*L${row}*I${row}`, S.dec);
    market.put(row, 14, `=INDEX(T_behavior,E${row},1)*IF(F${row}=2,CommercialPrice,1)`, S.dec);
    market.put(row, 15, `=G${row}/SampleCustomers*YearPolicies`, S.dec);
    market.put(row, 16, `=INDEX(T_channel,C${row},4)`, S.dec);
    market.put(row, 17, DIMENSIONS.map((dim, k) => levelName(dim, cell[k], lang)).join(' · '));
    market.put(row, 18, `=IF(C${row}=CampChannel,G${row}/SUMIF($C$2:$C$${C + 1},CampChannel,$G$2:$G$${C + 1}),0)`, S.dec);
  });
  const M = c => `${q(SH.market)}!$${c}$2:$${c}$${C + 1}`;

  // ——— Luck ———
  const luck = sheet();
  luck.put(1, 0, L(lang, 'Cell', 'Hücre'), S.head);
  for (let m = 0; m < 12; m++) luck.put(1, 1 + m, L(lang, `Month ${m + 1}`, `Ay ${m + 1}`), S.head);
  cells.forEach((_, c) => { luck.put(c + 2, 0, c + 1); for (let m = 0; m < 12; m++) luck.put(c + 2, 1 + m, draws.market[m][c], S.dec); });
  names.MarketLuck = `${q(SH.luck)}!$B$2:$M$${C + 1}`;
  const teamLuck = sheet();
  teamLuck.put(1, 0, L(lang, 'Team', 'Takım'), S.head); teamLuck.put(1, 1, 'id', S.head);
  for (let m = 0; m < 12; m++) { teamLuck.put(1, 2 + m * 2, L(lang, `M${m + 1} u₁ (count)`, `A${m + 1} u₁ (adet)`), S.head); teamLuck.put(1, 3 + m * 2, L(lang, `M${m + 1} u₂ (amount)`, `A${m + 1} u₂ (tutar)`), S.head); }
  teams.forEach((team, ti) => {
    teamLuck.put(ti + 2, 0, team.name); teamLuck.put(ti + 2, 1, team.id);
    draws.teams[team.id].forEach(([u1, u2], m) => { teamLuck.put(ti + 2, 2 + m * 2, u1, S.dec); teamLuck.put(ti + 2, 3 + m * 2, u2, S.dec); });
  });
  names.TeamLuck = `${q(SH.teamLuck)}!$C$2:$Z$${n + 1}`;

  // ——— Calc: one row per month × cell ———
  const calc = sheet();
  const base = ['m', L(lang, 'Cell', 'Hücre'), L(lang, 'Quarter', 'Çeyrek'), 'city', 'channel', 'vehicle', 'persona', 'type',
    L(lang, 'Demand ×', 'Talep ×'), L(lang, 'Claims ×', 'Hasar ×'), L(lang, 'Customers', 'Müşteri'), 'Σ w', L(lang, 'Channel expense', 'Kanal gideri')];
  const B = base.length; // first team column
  const TC = 9;          // columns per team: offer, w, market policies, campaign pull, campaign policies, policies, premium, expected count, expected cost
  base.forEach((h, c) => calc.put(1, c, h, S.head));
  teams.forEach((team, ti) => ['offer', 'w', L(lang, 'market policies', 'pazar poliçesi'), L(lang, 'campaign pull', 'kampanya çekimi'), L(lang, 'campaign policies', 'kampanya poliçesi'), 'policies', 'premium', 'E[count]', 'E[cost]'].forEach((h, k) => calc.put(1, B + ti * TC + k, `${team.name} · ${h}`, S.head)));
  const inScope = row => `((EvScope="all")+(EvScope="city")*(EvLevel=D${row})+(EvScope="channel")*(EvLevel=E${row})+(EvScope="vehicle")*(EvLevel=F${row})+(EvScope="persona")*(EvLevel=G${row})+(EvScope="type")*(EvLevel=H${row}))`;
  const active = row => `(EvMonth<=A${row})*(A${row}<EvMonth+EvLast)`;
  const planCol = (ti, row) => `${ti * QUARTERS}+C${row}`;
  const ledgerFirst = 2;
  const GIFT0 = 13, GIFT_COLS = 5, CAMP_RATE = GIFT0 + K.offers.length * GIFT_COLS + 3; // Campaign sheet layout (see below)
  for (let m = 1; m <= 12; m++) for (let c = 1; c <= C; c++) {
    const row = 1 + (m - 1) * C + c;
    calc.put(row, 0, m); calc.put(row, 1, c);
    calc.put(row, 2, `=IF(A${row}<=3,1,IF(A${row}<=6,2,IF(A${row}<=9,3,4)))`);
    ['B', 'C', 'D', 'E', 'F'].forEach((mc, k) => calc.put(row, 3 + k, `=INDEX(${q(SH.market)}!$${mc}$2:$${mc}$${C + 1},B${row})`));
    calc.put(row, 8, `=EXP(SUMPRODUCT(${active(row)}*${inScope(row)}*LN(EvDemand+(EvDemand=""))))`, S.dec);
    calc.put(row, 9, `=EXP(SUMPRODUCT(${active(row)}*${inScope(row)}*LN(EvCost+(EvCost=""))))`, S.dec);
    calc.put(row, 10, `=INDEX(${M('P')},B${row})/12*(1+Seasonality*SIN(A${row}/1.9))*I${row}*(0.985+INDEX(MarketLuck,B${row},A${row})*0.03)`, S.dec);
    const ws = teams.map((_, ti) => `${col(B + ti * TC + 1)}${row}`);
    calc.put(row, 11, `=${ws.join('+')}`, S.dec);
    calc.put(row, 12, `=INDEX(${M('Q')},B${row})`, S.dec);
    teams.forEach((team, ti) => {
      const pc = planCol(ti, row), oc = col(B + ti * TC), wc = col(B + ti * TC + 1), mk = col(B + ti * TC + 2), pu = col(B + ti * TC + 3), cp = col(B + ti * TC + 4), kc = col(B + ti * TC + 5);
      const plan = rr => `INDEX(Plans,${rr},${pc})`;
      const offer = `${plan(P('basePremium'))}*${plan(`${P('coef.city.0') - 1}+D${row}`)}*${plan(`${P('coef.channel.0') - 1}+E${row}`)}*${plan(`${P('coef.vehicle.0') - 1}+F${row}`)}*${plan(`${P('coef.persona.0') - 1}+G${row}`)}*${plan(`${P('coef.type.0') - 1}+H${row}`)}`;
      calc.put(row, B + ti * TC, `=${offer}`, S.dec);
      calc.put(row, B + ti * TC + 1, `=EXP(-INDEX(${M('O')},B${row})*LN(${oc}${row}/INDEX(${M('N')},B${row})))`, S.dec);
      calc.put(row, B + ti * TC + 2, `=K${row}*${wc}${row}/(Outside+L${row})`, S.dec);
      calc.put(row, B + ti * TC + 3, `=IF(INDEX(${M('S')},B${row})>0,INDEX(${M('S')},B${row})*(1+Seasonality*SIN(A${row}/1.9))*I${row}*MIN(CampPriceCap,EXP(-INDEX(${M('O')},B${row})*LN(${oc}${row}/INDEX(${M('N')},B${row})))),0)`, S.dec);
      calc.put(row, B + ti * TC + 4, `=${pu}${row}*INDEX(${q(SH.campaign)}!$${col(CAMP_RATE)}$2:$${col(CAMP_RATE)}$${1 + n * 12},${ti * 12}+A${row})`, S.dec);
      calc.put(row, B + ti * TC + 5, `=${mk}${row}+${cp}${row}`, S.dec);
      calc.put(row, B + ti * TC + 6, `=${kc}${row}*${oc}${row}`, S.dec);
      calc.put(row, B + ti * TC + 7, `=${kc}${row}*INDEX(${M('J')},B${row})*J${row}`, S.dec);
      calc.put(row, B + ti * TC + 8, `=${kc}${row}*INDEX(${M('M')},B${row})*J${row}`, S.dec);
    });
  }
  const CR = c => `${q(SH.calc)}!$${c}$2:$${c}$${ROWS + 1}`;

  // ——— Campaign: one row per team × month ———
  const camp = sheet();
  const CH = [L(lang, 'Team', 'Takım'), 'm', L(lang, 'Quarter', 'Çeyrek'), L(lang, 'Marketing / month', 'Aylık pazarlama'), L(lang, 'Media', 'Medya'), L(lang, 'Gift budget', 'Hediye bütçesi'),
    L(lang, 'Impressions', 'Gösterim'), L(lang, 'All teams’ impressions', 'Tüm takımların gösterimi'), L(lang, 'Audience / month', 'Aylık kitle'), L(lang, 'Frequency', 'Frekans'), L(lang, 'Reach', 'Erişim'),
    L(lang, 'Hit ratio factor', 'Hit oranı çarpanı'), L(lang, 'Σ price-weighted pull', 'Σ fiyat ağırlıklı çekim'),
    ...K.offers.flatMap(o => [L(lang, 'weight', 'ağırlık'), L(lang, 'leads', 'aday'), L(lang, 'wanted', 'istenen'), L(lang, 'gift cap', 'hediye sınırı'), L(lang, 'won', 'kazanılan')].map(h => `${offerName(o.id, lang)} · ${h}`)),
    L(lang, 'Leads', 'Aday'), L(lang, 'Customers wanted', 'İstenen müşteri'), L(lang, 'Customers won', 'Kazanılan müşteri'), L(lang, 'Customers per unit of pull', 'Çekim başına müşteri')];
  CH.forEach((h, c) => camp.put(1, c, h, S.head));
  const CA = c => `$${c}$2:$${c}$${1 + n * 12}`;
  teams.forEach((team, ti) => {
    const pullCol = col(B + ti * TC + 3);
    for (let m = 1; m <= 12; m++) {
      const row = 2 + ti * 12 + m - 1, pc = `${ti * QUARTERS}+C${row}`, plan = rr => `INDEX(Plans,${rr},${pc})`;
      camp.put(row, 0, team.name); camp.put(row, 1, m); camp.put(row, 2, `=IF(B${row}<=3,1,IF(B${row}<=6,2,IF(B${row}<=9,3,4)))`);
      camp.put(row, 3, `=${plan(P('marketing'))}/(13-${plan(P('marketingFrom'))})`, S.dec);
      camp.put(row, 4, `=D${row}*${plan(P('mediaShare'))}/100`, S.dec);
      camp.put(row, 5, `=D${row}*(1-${plan(P('mediaShare'))}/100)`, S.dec);
      camp.put(row, 6, `=E${row}/CampCPM*1000`, S.dec);
      camp.put(row, 7, `=SUMIFS(${CA('G')},${CA('B')},B${row})`, S.dec);
      camp.put(row, 8, `=CampUsers*CampTarget*Budget/CampRefBudget*Teams/12`, S.dec);
      camp.put(row, 9, `=MAX(1,H${row}/I${row})`, S.dec);
      camp.put(row, 10, `=G${row}*MIN(1,I${row}/MAX(H${row},1E-9))`, S.dec);
      camp.put(row, 11, `=IF(J${row}>CampFreq,1+CampBonus,1)`, S.dec);
      camp.put(row, 12, `=SUMIFS(${CR(pullCol)},${CR('A')},B${row})`, S.dec);
      // Each gift: the ads show it by its weight; its own slice of the gift budget caps what it can win.
      K.offers.forEach((_, k) => {
        const c0 = GIFT0 + k * GIFT_COLS, w = col(c0), ld = col(c0 + 1), wt = col(c0 + 2), cp = col(c0 + 3), g = k + 1;
        camp.put(row, c0, `=${plan(P(`offers.${k}`))}/100`, S.dec);
        camp.put(row, c0 + 1, `=K${row}*${w}${row}*INDEX(T_offer,${g},1)*INDEX(T_offer,${g},2)`, S.dec);
        camp.put(row, c0 + 2, `=${ld}${row}*INDEX(T_offer,${g},3)*L${row}*M${row}`, S.dec);
        camp.put(row, c0 + 3, `=IF(INDEX(T_offer,${g},4)>0,F${row}*${w}${row}/INDEX(T_offer,${g},4),1E+300)`, S.dec);
        camp.put(row, c0 + 4, `=MIN(${wt}${row},${cp}${row})`, S.dec);
      });
      const sumOf = off => K.offers.map((_, k) => `${col(GIFT0 + k * GIFT_COLS + off)}${row}`).join('+');
      const tot = GIFT0 + K.offers.length * GIFT_COLS;
      camp.put(row, tot, `=${sumOf(1)}`, S.dec);
      camp.put(row, tot + 1, `=${sumOf(2)}`, S.dec);
      camp.put(row, tot + 2, `=${sumOf(4)}`, S.dec);
      camp.put(row, CAMP_RATE, `=IF(M${row}>0,${col(tot + 2)}${row}/M${row},0)`, S.dec);
    }
  });

  // ——— Ledger: one row per team × month ———
  const ledger = sheet();
  const LH = [L(lang, 'Team', 'Takım'), 'm', L(lang, 'Quarter', 'Çeyrek'), L(lang, 'New policies', 'Yeni poliçe'), L(lang, 'Premium', 'Prim'), L(lang, 'Acquisition', 'Edinim gideri'),
    'λ = E[count]', 'E[cost]', 'u₁', 'u₂', L(lang, 'Claim count N', 'Hasar adedi N'), L(lang, 'Mean severity', 'Ortalama şiddet'), L(lang, 'Claims', 'Hasar'), L(lang, 'Expenses', 'Giderler'),
    L(lang, 'Σ premium', 'Σ prim'), L(lang, 'Σ claims', 'Σ hasar'), L(lang, 'Σ expenses', 'Σ gider'),
    L(lang, 'Profit', 'Kâr'), L(lang, 'Premium share', 'Prim payı'),
    L(lang, 'Profit pts', 'Kâr puanı'), L(lang, 'Share pts', 'Pay puanı'), L(lang, 'Score', 'Puan'), L(lang, 'Loss ratio', 'Hasar oranı')];
  LH.forEach((h, c) => ledger.put(1, c, h, S.head));
  teams.forEach((team, ti) => {
    const kc = col(B + ti * TC + 5), prc = col(B + ti * TC + 6), ecc = col(B + ti * TC + 7), eco = col(B + ti * TC + 8);
    const first = ledgerFirst + ti * 12;
    for (let m = 1; m <= 12; m++) {
      const row = first + m - 1, pc = `${ti * QUARTERS}+C${row}`, plan = rr => `INDEX(Plans,${rr},${pc})`;
      ledger.put(row, 0, team.name); ledger.put(row, 1, m); ledger.put(row, 2, `=IF(B${row}<=3,1,IF(B${row}<=6,2,IF(B${row}<=9,3,4)))`);
      ledger.put(row, 3, `=SUMIFS(${CR(kc)},${CR('A')},B${row})`, S.dec);
      ledger.put(row, 4, `=SUMIFS(${CR(prc)},${CR('A')},B${row})`, S.dec);
      ledger.put(row, 5, `=SUMPRODUCT((${CR('A')}=B${row})*${CR(prc)}*${CR('M')})`, S.dec);
      ledger.put(row, 6, `=SUMIFS(${CR(ecc)},${CR('A')},B${row})`, S.dec);
      ledger.put(row, 7, `=SUMIFS(${CR(eco)},${CR('A')},B${row})`, S.dec);
      ledger.put(row, 8, `=INDEX(TeamLuck,${ti + 1},2*B${row}-1)`, S.dec);
      ledger.put(row, 9, `=INDEX(TeamLuck,${ti + 1},2*B${row})`, S.dec);
      ledger.put(row, 10, `=IF(G${row}>0,MAX(0,ROUND(G${row}+SQRT(G${row})*NORMSINV(I${row}),0)),0)`, S.int);
      ledger.put(row, 11, `=IF(G${row}>0,H${row}/G${row},BaseSev)`, S.dec);
      ledger.put(row, 12, `=IF(K${row}>0,MAX(0,K${row}*L${row}+L${row}*SQRT(K${row}/GammaShape)*NORMSINV(J${row})),0)`, S.dec);
      ledger.put(row, 13, `=F${row}+FixedCost/12+${q(SH.campaign)}!D${row}`, S.dec);
      ledger.put(row, 14, `=SUM(E$${first}:E${row})`, S.dec);
      ledger.put(row, 15, `=SUM(M$${first}:M${row})`, S.dec);
      ledger.put(row, 16, `=SUM(N$${first}:N${row})`, S.dec);
      ledger.put(row, 17, `=O${row}-P${row}-Q${row}`, S.int);
      ledger.put(row, 18, `=O${row}/SUMIFS($O$${ledgerFirst}:$O$${ledgerFirst + n * 12 - 1},$B$${ledgerFirst}:$B$${ledgerFirst + n * 12 - 1},B${row})`, S.dec);
      ledger.put(row, 19, `=MAX(0,MIN(100,(R${row}/FairSlice-ProfitFloor*B${row}/12)/((ProfitTarget-ProfitFloor)*B${row}/12)*100))`, S.dec);
      ledger.put(row, 20, `=MAX(0,MIN(100,S${row}/ShareFull*100))`, S.dec);
      ledger.put(row, 21, `=(T${row}*WProfit+U${row}*WShare)/100`, S.score);
      ledger.put(row, 22, `=IF(O${row}>0,P${row}/O${row},0)`, S.dec);
    }
  });

  // ——— Score: the final table, next to the app's own result ———
  let app = null;
  try { app = rank(simulate(teams, config)[11].rows); } catch { app = null; }
  const score = sheet();
  score.put(1, 0, L(lang, 'Final standings (month 12)', 'Final sıralaması (12. ay)'), S.title);
  score.put(2, 0, L(lang, 'The app column is what the app computed from the same inputs when this file was made. Difference should be 0.00.', 'Uygulama sütunu, bu dosya üretildiğinde uygulamanın aynı girdilerle hesapladığı puandır. Fark 0,00 olmalı.'), S.text);
  [L(lang, 'Team', 'Takım'), L(lang, 'Score', 'Puan'), L(lang, 'Rank', 'Sıra'), L(lang, 'Profit', 'Kâr'), L(lang, 'Premium share', 'Prim payı'),
    L(lang, 'Loss ratio', 'Hasar oranı'), L(lang, 'App score', 'Uygulama puanı'), L(lang, 'Difference', 'Fark')].forEach((h, c) => score.put(4, c, h, S.head));
  teams.forEach((team, ti) => {
    const row = 5 + ti, lr = ledgerFirst + ti * 12 + 11, ref = c => `${q(SH.ledger)}!${c}${lr}`;
    score.put(row, 0, team.name);
    score.put(row, 1, `=${ref('V')}`, S.score);
    score.put(row, 2, `=RANK(B${row},$B$5:$B$${4 + n})`);
    score.put(row, 3, `=${ref('R')}`, S.int);
    score.put(row, 4, `=${ref('S')}`, S.dec);
    score.put(row, 5, `=${ref('W')}`, S.dec);
    const appRow = app?.find(x => x.id === team.id);
    score.put(row, 6, appRow ? appRow.score : '', S.score);
    score.put(row, 7, appRow ? `=B${row}-G${row}` : '', S.score);
  });
  const monthRow = 7 + n;
  score.put(monthRow, 0, L(lang, 'Score by month', 'Aylara göre puan'), S.section);
  monthsOf(lang).forEach((mn, m) => score.put(monthRow + 1, 1 + m, mn, S.head));
  teams.forEach((team, ti) => {
    score.put(monthRow + 2 + ti, 0, team.name);
    for (let m = 0; m < 12; m++) score.put(monthRow + 2 + ti, 1 + m, `=${q(SH.ledger)}!V${ledgerFirst + ti * 12 + m}`, S.score);
  });

  // ——— Read me ———
  const g = sheet();
  const scopes = eventScopesFor(lang);
  const lines = [
    [L(lang, 'Insurers League · the engine, formula by formula', 'Insurers League · motor, formül formül'), S.title],
    [L(lang, 'This workbook recomputes the season the app plays. The inputs are yellow: rules, events, decisions and the luck table. Everything else is a formula. The Score sheet puts your result next to the app’s; the difference should be 0.00.', 'Bu dosya uygulamanın oynattığı sezonu yeniden hesaplar. Girdiler sarıdır: kurallar, olaylar, kararlar ve şans tablosu. Geri kalan her şey formüldür. Puan sayfası sonucu uygulamanınkiyle yan yana koyar; fark 0,00 olmalı.')],
    [L(lang, 'Change a decision on the Decisions sheet and the workbook shows the score the app would give that plan in this same game.', 'Kararlar sayfasında bir kararı değiştirirsen dosya, uygulamanın aynı oyunda o plana vereceği puanı gösterir.')],
    ['', 0],
    [L(lang, '1 · The market (Market sheet)', '1 · Pazar (Pazar sayfası)'), S.section],
    [L(lang, 'The case-study data is a sample: the cells of city × channel × vehicle age × persona × customer type. A cell gets its sample share of the yearly policies: policies = sample count ÷ sample size × policies a year.', 'Vaka verisi bir örneklemdir: il × kanal × araç yaşı × persona × müşteri tipi hücreleri. Her hücre yıllık poliçenin örneklemdeki payı kadarını alır: poliçe = örneklem adedi ÷ örneklem büyüklüğü × yıllık poliçe.')],
    [L(lang, 'Expected claims per policy = base frequency × the five frequency coefficients × base severity × the five severity coefficients.', 'Poliçe başı beklenen hasar = temel frekans × beş frekans katsayısı × temel şiddet × beş şiddet katsayısı.')],
    [L(lang, 'The rest of the market charges: reference premium = base frequency × base severity ÷ market loss ratio × the five market premium coefficients × the cell’s competitor index.', 'Piyasanın geri kalanı şunu ister: referans prim = temel frekans × temel şiddet ÷ piyasa hasar oranı × beş piyasa prim katsayısı × hücrenin rakip endeksi.')],
    [L(lang, '2 · Who buys from whom (Calc sheet, one row per month × cell)', '2 · Kim kimden alır (Hesap sayfası, her ay × hücre bir satır)'), S.section],
    [L(lang, 'Customers this month = policies a year ÷ 12 × (1 + seasonality × sin(month ÷ 1.9)) × event demand × (0.985 + 0.03 × luck).', 'Bu ayın müşterisi = yıllık poliçe ÷ 12 × (1 + mevsimsellik × sin(ay ÷ 1,9)) × olay talebi × (0,985 + 0,03 × şans).')],
    [L(lang, 'A team’s offer = base premium × its city, channel, vehicle, persona and type coefficients.', 'Takımın teklifi = baz prim × il, kanal, araç, persona ve tip katsayıları.')],
    [L(lang, 'Attraction w = (offer ÷ reference premium)^(−β): price alone decides who buys from whom.', 'Çekim w = (teklif ÷ referans prim)^(−β): kimin kimden alacağını yalnızca fiyat belirler.')],
    [L(lang, 'Policies won = customers × w ÷ (rest of the market’s pull + Σ w of all teams).', 'Kazanılan poliçe = müşteri × w ÷ (piyasanın çekimi + tüm takımların Σ w’si).')],
    [L(lang, 'Campaign (Campaign sheet): all of marketing runs it; media = marketing × media %, gift budget = the rest. Impressions = media ÷ cost per 1,000 × 1,000. All teams share one monthly audience; reach = impressions × min(1, audience ÷ all impressions), frequency = max(1, all impressions ÷ audience). For each gift: leads = reach × weight × interest × click; wanted = leads × hit ratio × (1 + bonus if frequency > threshold) × Σ pull; won = min(wanted, gift budget × weight ÷ gift cost). Customers go to the campaign channel’s cells by sample share × seasonality × event demand × min(cap, (offer ÷ reference)^(−β)).', 'Kampanya (Kampanya sayfası): bütün pazarlama onu yürütür; medya = pazarlama × medya %, hediye bütçesi = kalanı. Gösterim = medya ÷ 1.000 gösterim maliyeti × 1.000. Tüm takımlar aylık tek bir kitleyi paylaşır; erişim = gösterim × min(1, kitle ÷ tüm gösterimler), frekans = max(1, tüm gösterimler ÷ kitle). Her hediye için: aday = erişim × ağırlık × ilgi × tıklama; istenen = aday × hit oranı × (frekans eşiği aşarsa 1 + bonus) × Σ çekim; kazanılan = min(istenen, hediye bütçesi × ağırlık ÷ hediye maliyeti). Müşteriler kampanya kanalının hücrelerine örneklem payı × mevsimsellik × olay talebi × min(tavan, (teklif ÷ referans)^(−β)) ile dağılır.')],
    [L(lang, '3 · A team’s month (Ledger sheet)', '3 · Takımın ayı (Defter sayfası)'), S.section],
    [L(lang, 'Accounts run on an underwriting-year basis: a month’s policies book their full premium, channel expense and ultimate claims in that month.', 'Hesaplar poliçe yılı esasındadır: bir ayın poliçeleri tam primini, kanal giderini ve nihai hasarını o ay yazar.')],
    [L(lang, 'λ = Σ policies × frequency (× event claims multiplier). Claim count N = max(0, round(λ + √λ × NORMSINV(u₁))) — Poisson in its normal form.', 'λ = Σ poliçe × frekans (× olay hasar çarpanı). Hasar adedi N = max(0, round(λ + √λ × NORMSINV(u₁))) — Poisson’un normal hali.')],
    [L(lang, 'Claims = max(0, N × s + s × √(N ÷ gamma shape) × NORMSINV(u₂)), s = the book’s mean severity — the sum of N Gamma claims in its normal form.', 'Hasar = max(0, N × s + s × √(N ÷ gamma şekli) × NORMSINV(u₂)), s = portföyün ortalama şiddeti — N adet Gamma hasarın toplamının normal hali.')],
    [L(lang, 'Expenses a month = channel acquisition + fixed cost ÷ 12 + this month’s marketing. The marketing budget is one wallet for the year: a plan’s marketing is spent evenly from its start month to December (marketing ÷ (13 − start month)), and a quarter revision can spend only what is left.', 'Aylık gider = kanal edinim gideri + sabit gider ÷ 12 + bu ayın pazarlaması. Pazarlama bütçesi yıllık tek cüzdandır: bir planın pazarlaması başladığı aydan Aralık’a eşit harcanır (pazarlama ÷ (13 − başlangıç ayı)); çeyrek revizyonu yalnızca kalanı harcayabilir.')],
    [L(lang, 'Profit = Σ premium − Σ claims − Σ expenses.', 'Kâr = Σ prim − Σ hasar − Σ gider.')],
    [L(lang, '4 · The score', '4 · Puan'), S.section],
    [L(lang, 'Profit points = clamp((profit ÷ fair slice − floor × m/12) ÷ ((target − floor) × m/12) × 100, 0, 100). Share points = clamp(premium share ÷ min(1, share target ÷ teams) × 100).', 'Kâr puanı = sınırla((kâr ÷ adil dilim − taban × a/12) ÷ ((hedef − taban) × a/12) × 100, 0, 100). Pay puanı = sınırla(prim payı ÷ min(1, pay hedefi ÷ takım sayısı) × 100).')],
    [L(lang, 'Score = (profit points × weight + share points × weight) ÷ 100. Ranking by score. The trophies themselves go by profit and by premium share.', 'Puan = (kâr puanı × ağırlık + pay puanı × ağırlık) ÷ 100. Sıralama puana göredir. Kupalar ise kâra ve prim payına göre verilir.')],
    [L(lang, '5 · Luck', '5 · Şans'), S.section],
    [L(lang, 'Luck is a table of numbers between 0 and 1 drawn from the game’s seed before any decision: one per cell per month (demand wobble) and two per team per month (claim count and amount). It never depends on decisions, which is why the same plan always gets the same result.', 'Şans, oyunun tohumundan kararlardan önce çekilen 0–1 arası sayılardan oluşan bir tablodur: her hücre için her ay bir tane (talep dalgası), her takım için her ay iki tane (hasar adedi ve tutarı). Kararlara bağlı değildir; aynı plan hep aynı sonucu bu yüzden alır.')],
    [L(lang, `Event scopes: ${scopes.slice(0, 1).map(x => x.name).join('')} = all; otherwise the dimension name and the level number in its table on the Rules sheet.`, `Olay kapsamı: ${scopes.slice(0, 1).map(x => x.name).join('')} = all; aksi halde boyut adı ve Kurallar sayfasındaki tablosunda seviye numarası.`)],
    [L(lang, 'The workbook covers the teams in this game. The app also refuses plans outside the rules (coefficients outside their bounds, gift weights not totalling 100, budget overspent); the Decisions sheet shows both checks.', 'Dosya bu oyundaki takımları kapsar. Uygulama kural dışı planları kabul etmez (sınır dışı katsayı, toplamı 100 olmayan hediye ağırlıkları, aşılan bütçe); Kararlar sayfası iki kontrolü de gösterir.')]
  ];
  lines.forEach(([text, st = S.text], i) => g.put(i + 1, 0, text, st));

  // ——— Assemble ———
  const order = [
    ['guide', g.toXml({ widths: [150] })],
    ['score', score.toXml({ widths: [22, 12, 8, 14, 14, 12, 14, 12] })],
    ['plans', plans.toXml({ widths: [44, 4, ...Array(n * QUARTERS).fill(11)], freeze: [2, 4] })],
    ['rules', rules.toXml({ widths: [46, 16, 14, 14, 14, 14] })],
    ['events', ev.toXml({ widths: [4, 40, 8, 12, 12, 8, 10, 10] })],
    ['campaign', camp.toXml({ widths: [16, 5, 8, ...Array(CH.length - 3).fill(13)], freeze: [2, 1] })],
    ['ledger', ledger.toXml({ widths: [16, 5, 8, ...Array(LH.length - 3).fill(13)], freeze: [2, 1] })],
    ['calc', calc.toXml({ freeze: [2, 1] })],
    ['market', market.toXml({ widths: [5, 6, 7, 7, 8, 6, 10, 12, 11, 11, 11, 11, 12, 12, 11, 12, 10, 60, 12], freeze: [1, 1] })],
    ['luck', luck.toXml({ freeze: [1, 1] })],
    ['teamLuck', teamLuck.toXml({ freeze: [2, 1] })]
  ];
  const definedNames = Object.entries(names).map(([k, v]) => `<definedName name="${k}">${xml(v)}</definedName>`).join('');
  const files = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${order.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${order.map(([key], i) => `<sheet name="${xml(SH[key])}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets><definedNames>${definedNames}</definedNames><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${order.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${order.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': STYLES
  };
  order.forEach(([, text], i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = text; });
  return zip(files);
}
