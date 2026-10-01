// Excel mode: teams fill their decisions in a workbook and the moderator uploads it; nobody else needs
// a device. This module writes the .xlsx template and reads filled files back, with no library: an .xlsx
// file is a zip of XML parts. Reading works on files saved by Excel, Google Sheets, Numbers and LibreOffice.
//
// Layout: one decision per row, one team per column. Column A holds a hidden machine key for every row,
// so imports never depend on the visible (translated) labels; the labels are a fallback.
import { rulesOf, validate, presetName, DIMENSIONS, QUARTER_KEYS, cascoMoney, defaultStrategy, dimensionName, levelName, policiesOf } from '../engine.js';

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
  rows.push({ key: 'claimsOps', kind: 'money', min: 0, max: money.budget, label: L(lang, 'Claims operations (EUR)', 'Hasar operasyonu (EUR)'), note: L(lang, 'Claims-handling capacity. Too little hurts satisfaction and leaks claims cost.', 'Hasar yönetim kapasitesi. Az olursa memnuniyet düşer, hasar maliyeti kaçar.') });
  rows.push({ key: 'reinsurance', kind: 'bool', label: L(lang, 'Quota-share reinsurance', 'Kota paylı reasürans'),
    note: L(lang, `Cedes ${Math.round(R.reinsurance.share * 100)}% of premium and claims for a ${Math.round(R.reinsurance.commission * 100)}% commission; costs ${fmtMoney(money.reinsuranceFee)} EUR from the budget.`,
      `Prim ve hasarın %${Math.round(R.reinsurance.share * 100)}’ini %${Math.round(R.reinsurance.commission * 100)} komisyonla devreder; bütçeden ${fmtMoney(money.reinsuranceFee)} EUR tutar.`) });
  rows.push({ section: L(lang, 'Checks (turn red when a rule is broken)', 'Kontroller (kural bozulunca kırmızı olur)') });
  rows.push({ check: 'spend', label: L(lang, 'Budget used (EUR)', 'Kullanılan bütçe (EUR)') });
  rows.push({ check: 'left', label: L(lang, 'Budget left (EUR)', 'Kalan bütçe (EUR)') });
  rows.push({ check: 'focus', label: L(lang, 'Marketing focus total %', 'Pazarlama odağı toplamı %') });
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

// `single`: one column for one team — the file a team fills in and hands back on its own card.
export function buildTemplate(state, { lang = 'en', teams = null, quarter = false, single = false } = {}) {
  const config = state.config, spec = rowSpec(config, lang), money = cascoMoney(config), R = rulesOf(config);
  const roster = (teams ?? state.teams.filter(t => !t.ai)).map(t => ({ name: t.name, strategy: t.strategy }));
  const columns = single ? 1 : quarter ? Math.max(1, roster.length) : Math.max(SHEET_TEAMS, roster.length);
  const blank = defaultStrategy(config);
  const yes = L(lang, 'Yes', 'Evet'), no = L(lang, 'No', 'Hayır');
  const rowOf = key => spec.findIndex(r => r.key === key) + 2; // +1 header row, +1 one-based
  const lastCol = colName(FIRST_TEAM_COL + columns - 1);
  const focusRows = spec.map((r, i) => [r, i + 2]).filter(([r]) => r.key?.startsWith('channelFocus.')).map(([, n]) => n);

  const cell = (ref, style, body = '', type = '') => `<c r="${ref}" s="${style}"${type ? ` t="${type}"` : ''}>${body}</c>`;
  const text = (ref, style, v) => (v === '' || v === null || v === undefined ? `<c r="${ref}" s="${style}"/>` : cell(ref, style, `<is><t xml:space="preserve">${xml(v)}</t></is>`, 'inlineStr'));
  const header = [
    text('A1', 1, 'key'), text('B1', 1, L(lang, 'Decision', 'Karar')), text('C1', 1, L(lang, 'How it works', 'Açıklama')),
    ...Array.from({ length: columns }, (_, c) => text(`${colName(FIRST_TEAM_COL + c)}1`, 1, L(lang, `Team ${c + 1}`, `Takım ${c + 1}`)))
  ].join('');
  let sheetRows = `<row r="1" ht="30" customHeight="1">${header}</row>`;
  spec.forEach((r, i) => {
    const n = i + 2, cells = [];
    if (r.section) {
      cells.push(text(`A${n}`, 8, ''), text(`B${n}`, 8, r.section), text(`C${n}`, 8, ''));
      for (let c = 0; c < columns; c++) cells.push(text(`${colName(FIRST_TEAM_COL + c)}${n}`, 8, ''));
      sheetRows += `<row r="${n}">${cells.join('')}</row>`;
      return;
    }
    cells.push(text(`A${n}`, 0, r.key || `check.${r.check}`), text(`B${n}`, r.check ? 7 : 2, r.label), text(`C${n}`, 10, r.note || ''));
    for (let c = 0; c < columns; c++) {
      const col = colName(FIRST_TEAM_COL + c), ref = `${col}${n}`, team = roster[c], st = team?.strategy ?? blank;
      if (r.check) {
        const fee = `IF(${col}${rowOf('reinsurance')}="${yes}",${money.reinsuranceFee},0)`;
        const f = r.check === 'spend' ? `${col}${rowOf('marketing')}+${col}${rowOf('claimsOps')}+${fee}`
          : r.check === 'left' ? `${money.budget}-(${col}${rowOf('marketing')}+${col}${rowOf('claimsOps')}+${fee})`
            : focusRows.map(fr => `${col}${fr}`).join('+');
        cells.push(cell(ref, r.check === 'focus' ? 6 : 3, `<f>${f}</f>`));
        continue;
      }
      if (r.kind === 'text') { const v = !team ? '' : r.key === 'name' ? team.name : st[r.key] ?? ''; cells.push(text(ref, 2, v)); continue; }
      if (r.kind === 'bool') { cells.push(text(ref, 2, st.reinsurance ? yes : no)); continue; }
      const v = valueAt(st, r.key);
      cells.push(cell(ref, r.kind === 'money' ? 4 : r.kind === 'coef' || r.key === 'basePremium' ? 9 : 2, `<v>${Number(v)}</v>`));
    }
    sheetRows += `<row r="${n}">${cells.join('')}</row>`;
  });

  const range = n => `${colName(FIRST_TEAM_COL)}${n}:${lastCol}${n}`;
  const between = (n, r, whole = false) => `<dataValidation type="${whole ? 'whole' : 'decimal'}" operator="between" allowBlank="1" showErrorMessage="1" errorTitle="${xml(L(lang, 'Out of range', 'Aralık dışı'))}" error="${xml(L(lang, `Enter a value from ${r.min} to ${r.max}.`, `${r.min} ile ${r.max} arasında bir değer gir.`))}" sqref="${range(n)}"><formula1>${r.min}</formula1><formula2>${r.max}</formula2></dataValidation>`;
  const validations = spec.map((r, i) => {
    const n = i + 2;
    if (r.kind === 'coef' || r.kind === 'number' || r.kind === 'money') return between(n, r);
    if (r.kind === 'pct') return between(n, r, true);
    if (r.kind === 'bool') return `<dataValidation type="list" allowBlank="1" showErrorMessage="1" errorTitle="${xml(L(lang, 'Pick from the list', 'Listeden seç'))}" error="${xml(L(lang, 'Choose Yes or No.', 'Evet ya da Hayır seç.'))}" sqref="${range(n)}"><formula1>options_reinsurance</formula1></dataValidation>`;
    if (r.key === 'name') return `<dataValidation type="textLength" operator="lessThanOrEqual" allowBlank="1" showErrorMessage="1" error="${xml(L(lang, 'Up to 16 characters.', 'En fazla 16 karakter.'))}" sqref="${range(n)}"><formula1>16</formula1></dataValidation>`;
    return '';
  }).filter(Boolean);
  const checkRow = key => spec.findIndex(r => r.check === key) + 2;
  const conditional = `<conditionalFormatting sqref="${range(checkRow('left'))}"><cfRule type="cellIs" dxfId="0" priority="1" operator="lessThan"><formula>0</formula></cfRule></conditionalFormatting>`
    + `<conditionalFormatting sqref="${range(checkRow('focus'))}"><cfRule type="cellIs" dxfId="0" priority="2" operator="notEqual"><formula>100</formula></cfRule></conditionalFormatting>`;
  const decisions = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0" tabSelected="1"><pane xSplit="3" ySplit="2" topLeftCell="D3" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>
<cols><col min="1" max="1" width="4" hidden="1" customWidth="1"/><col min="2" max="2" width="36" customWidth="1"/><col min="3" max="3" width="52" customWidth="1"/><col min="4" max="${FIRST_TEAM_COL + columns}" width="17" customWidth="1"/></cols>
<sheetData>${sheetRows}</sheetData>
${conditional}
<dataValidations count="${validations.length}">${validations.join('')}</dataValidations>
</worksheet>`;

  // How-to sheet
  const money0 = v => Math.round(v).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US');
  const w = config.weights;
  const lines = [
    [L(lang, `Insurers League · ${presetName(config.preset, lang)} · decisions`, `Insurers League · ${presetName(config.preset, lang)} · kararlar`), 5],
    [quarter
      ? L(lang, 'Quarter review: change the base premium, coefficients, marketing, marketing focus and claims operations. Reinsurance stays as chosen for the year.', 'Çeyrek molası: baz prim, katsayılar, pazarlama, pazarlama odağı ve hasar operasyonu değişebilir. Reasürans yıl boyunca seçildiği gibi kalır.')
      : L(lang, 'One column per team. Fill in every white cell; the grey rows at the bottom check your budget.', 'Her takım bir sütun. Tüm beyaz hücreleri doldur; alttaki gri satırlar bütçeni kontrol eder.'), 6],
    [L(lang, 'Teams can share one file or each fill their own copy: the moderator can upload several files at once.', 'Takımlar tek dosyayı paylaşabilir ya da her biri kendi kopyasını doldurabilir: moderatör birden fazla dosyayı aynı anda yükleyebilir.'), 6],
    ['', 0],
    [L(lang, 'The market', 'Pazar'), 1],
    [L(lang, `${money0(policiesOf(config))} casco policies are sold in a year, about ${money0(policiesOf(config) / 12)} a month. The case-study data is a sample of this market with exactly the same profile.`, `Yılda ${money0(policiesOf(config))} kasko poliçesi satılır, ayda yaklaşık ${money0(policiesOf(config) / 12)}. Vaka verisi bu pazarın örneklemidir ve profili birebir aynıdır.`), 6],
    [L(lang, 'Every customer compares your offer with the rest of the market and with the other teams. Each segment reacts to price, visibility in its channel and claims service in its own way.', 'Her müşteri teklifini pazarın geri kalanıyla ve diğer takımlarla karşılaştırır. Her segment fiyata, kanalındaki görünürlüğe ve hasar hizmetine kendi ölçüsünde tepki verir.'), 6],
    ['', 0],
    [L(lang, 'Your price', 'Fiyatın'), 1],
    [L(lang, 'Offer to a customer = base premium × city × channel × vehicle age × persona × customer type coefficient.', 'Bir müşteriye teklif = baz prim × il × kanal × araç yaşı × persona × müşteri tipi katsayısı.'), 6],
    [L(lang, `Coefficients run from ${R.coef.min} to ${R.coef.max} in steps of ${R.coef.step ?? 0.01}. Price a segment below its risk and you win its customers — and their claims.`, `Katsayılar ${R.coef.min} ile ${R.coef.max} arasında, ${String(R.coef.step ?? 0.01).replace('.', ',')} adımlarla girilir. Bir segmenti riskinin altında fiyatlarsan müşterilerini kazanırsın, hasarlarını da.`), 6],
    ['', 0],
    [L(lang, 'Your budget', 'Bütçen'), 1],
    [L(lang, `Decision budget: ${money0(money.budget)} EUR for marketing, claims operations and the reinsurance fee. Starting capital: ${money0(money.capital)} EUR. Fixed cost: ${money0(money.fixedMonthly * 12)} EUR a year.`, `Karar bütçesi: pazarlama, hasar operasyonu ve reasürans bedeli için ${money0(money.budget)} EUR. Başlangıç sermayesi: ${money0(money.capital)} EUR. Sabit gider: yılda ${money0(money.fixedMonthly * 12)} EUR.`), 6],
    [L(lang, 'Channel costs: every policy also pays its channel’s expense ratio (commission) out of its premium.', 'Kanal giderleri: her poliçe priminden kendi kanalının gider oranını (komisyon) da öder.'), 6],
    ...R.dimensions.channel.map((c, i) => [`· ${levelName('channel', i, lang)}: %${Math.round(c.expense * 100)}`, 6]),
    ['', 0],
    [L(lang, 'Scoring', 'Puanlama'), 1],
    [L(lang, `Profitability ${w[0]}% · Market share ${w[1]}% · Customer satisfaction ${w[2]}%.${rulesOf(config).capitalRule ? ' A company whose equity falls below zero can’t be champion.' : ''}`, `Kârlılık %${w[0]} · Pazar payı %${w[1]} · Müşteri memnuniyeti %${w[2]}.${rulesOf(config).capitalRule ? ' Özkaynağı sıfırın altına düşen şirket şampiyon olamaz.' : ''}`), 6]
  ];
  const howto = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="120" customWidth="1"/></cols><sheetData>${lines.map(([t, st], i) => `<row r="${i + 1}">${t ? `<c r="A${i + 1}" t="inlineStr" s="${st}"><is><t xml:space="preserve">${xml(t)}</t></is></c>` : ''}</row>`).join('')}</sheetData></worksheet>`;
  const listsName = L(lang, 'Lists', 'Listeler');
  const listsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>${xml(L(lang, 'Reinsurance', 'Reasürans'))}</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>${xml(yes)}</t></is></c></row><row r="3"><c r="A3" t="inlineStr"><is><t>${xml(no)}</t></is></c></row></sheetData></worksheet>`;
  const definedNames = `<definedName name="options_reinsurance">'${xml(listsName)}'!$A$2:$A$3</definedName>`;

  const sheetNames = [L(lang, 'Decisions', 'Kararlar'), L(lang, 'How to fill in', 'Nasıl doldurulur'), listsName];
  const files = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${[1, 2, 3].map(i => `<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetNames.map((n, i) => `<sheet name="${xml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"${i === 2 ? ' state="hidden"' : ''}/>`).join('')}</sheets><definedNames>${definedNames}</definedNames><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${[1, 2, 3].map(i => `<Relationship Id="rId${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i}.xml"/>`).join('')}<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0"/></numFmts>
<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="16"/><name val="Calibri"/></font><font><i/><sz val="10"/><color rgb="FF45474A"/><name val="Calibri"/></font></fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFD43B"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF1F3F5"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFADB5BD"/></left><right style="thin"><color rgb="FFADB5BD"/></right><top style="thin"><color rgb="FFADB5BD"/></top><bottom style="thin"><color rgb="FFADB5BD"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="11">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
<xf numFmtId="164" fontId="3" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="2" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf>
</cellXfs>
<dxfs count="1"><dxf><font><b/><color rgb="FFC92A2A"/></font><fill><patternFill patternType="solid"><bgColor rgb="FFFFE3E3"/></patternFill></fill></dxf></dxfs>
</styleSheet>`,
    'xl/worksheets/sheet1.xml': decisions,
    'xl/worksheets/sheet2.xml': howto,
    'xl/worksheets/sheet3.xml': listsXml
  };
  return zip(files);
}

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
const toBool = v => (typeof v === 'boolean' ? v : ['evet', 'yes', 'true', '1', 'x', 'var', 'e', 'y'].includes(norm(v)));

// Reads filled workbooks. Returns { teams: [{ name, strategy, file }], errors: [text] }.
// `lang` picks the language of error messages.
export function teamsFromSheets(workbooks, config, lang = 'en', { quarter = false, currentTeams = [] } = {}) {
  const errors = [], teams = [], seen = new Map(), labels = labelIndex(config), R = rulesOf(config);
  const spec = rowSpec(config, lang), specByKey = new Map(spec.filter(r => r.key).map(r => [r.key, r]));
  const current = new Map(currentTeams.map(team => [norm(team.name), team.strategy]));
  const quarterSignature = strategy => JSON.stringify(QUARTER_KEYS.map(key => strategy?.[key]));
  const branch = presetName(config.preset, config.lang);
  let found = false;
  for (const { file, fileIndex, sheets } of workbooks) {
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
      const missing = [...specByKey.keys()].filter(k => !rowKey.has(k) && k !== 'product' && k !== 'sentence');
      if (missing.length) { errors.push(L(lang, `${file}: some decision rows are missing. Start from the template downloaded from this game.`, `${file}: bazı karar satırları eksik. Bu oyundan indirilen şablonla başla.`)); continue; }
      const width = Math.max(...[...rowKey.values()].map(i => sheet.rows[i]?.length ?? 0));
      for (let c = FIRST_TEAM_COL; c < width; c++) {
        const get = key => sheet.rows[rowKey.get(key)]?.[c];
        const name = String(get('name') ?? '').trim().replace(/\s+/g, ' ');
        if (!name) continue;
        const where = L(lang, `${file}, column ${colName(c)} (${name})`, `${file}, ${colName(c)} sütunu (${name})`);
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
          reinsurance: toBool(get('reinsurance'))
        };
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
  const { teams, errors } = await readSheets([file], config, lang);
  if (errors.length) return { errors };
  const norm2 = v => norm(v);
  const match = teams.find(entry => norm2(entry.name) === norm2(team.name)) ?? (teams.length === 1 ? teams[0] : null);
  if (!match) return { errors: [L(lang, `${file.name} holds ${teams.length} teams and none is named “${team.name}”. Upload a file with this team’s column only.`, `${file.name} dosyasında ${teams.length} takım var ve hiçbiri “${team.name}” değil. Yalnızca bu takımın sütununu içeren dosyayı yükle.`)] };
  return { strategy: match.strategy, fileName: match.name, errors: [] };
}
