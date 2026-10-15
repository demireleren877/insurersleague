// The policy file: the season as individual policies and claims, so teams can test the simulation with
// their own analysis. The engine works with expected counts per market cell (fractional policies) and one
// claim draw per team-month; this module turns that into rows without changing any figure the app shows:
//   · each team-month's fractional policies become whole policies by largest remainder (cell × source),
//   · the team-month's claim count is the engine's exactly; each claim lands on a policy in proportion to
//     its expected frequency, and its size is Gamma(shape) around its cell's mean severity,
//   · claim sizes are then scaled so the team-month's total equals the engine's claim amount to the cent.
// Same session, same file: all randomness comes from the session seed.
import { rulesOf, marketCells, simulateTraced, strategyAt, offerFor, cellRisk, inScope, normInv, stream, DIMENSIONS, levelName, monthsOf } from '../engine.js';
import { xml, zip, STYLES, S } from './audit.js';

const L = (lang, en, tr) => (lang === 'tr' ? tr : en);

// Gamma(shape, 1) by Marsaglia–Tsang, driven by the seeded stream.
function gamma(shape, rnd) {
  if (shape < 1) return gamma(shape + 1, rnd) * rnd() ** (1 / shape);
  const d = shape - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    const x = normInv(rnd()), v = (1 + c * x) ** 3;
    if (v > 0 && Math.log(rnd()) < x * x / 2 + d - d * v + d * Math.log(v)) return d * v;
  }
}

// Whole numbers that add up to round(Σ values): floors, then the largest remainders get one more.
function wholeCounts(values) {
  const floors = values.map(v => Math.floor(v + 1e-9));
  let left = Math.round(values.reduce((a, b) => a + b, 0)) - floors.reduce((a, b) => a + b, 0);
  const order = values.map((v, k) => [v - floors[k], k]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let j = 0; left > 0 && j < order.length; j++, left--) floors[order[j][1]]++;
  return floors;
}

const cents = v => Math.round(v * 100) / 100;

// policies: [no, team index, month, source (0 market, 1 campaign), cell, premium, frequency, expected cost, claims, claim amount]
// claims:   [no, policy no (0 when the team-month sold no whole policy), team index, month, amount]
// checks:   one row per team-month with the engine's figures next to the file's.
export function buildPortfolio(state) {
  const config = state.config, R = rulesOf(config), teams = state.teams, cells = marketCells();
  const season = simulateTraced(teams, config), risk = cells.map(c => cellRisk(c, R));
  const policies = [], claims = [], checks = [];
  let policyNo = 0, claimNo = 0;
  teams.forEach((team, i) => {
    let countBefore = 0;
    for (let m = 0; m < 12; m++) {
      const month = season[m], trace = month.trace[i], row = month.rows.find(r => r.id === team.id), s = strategyAt(team, m);
      const shock = cells.map(cell => month.events.reduce((x, e) => x * (inScope(e.scope, cell) ? e.cost ?? 1 : 1), 1));
      const fractional = [...trace.market, ...trace.campaign].map(v => Math.max(0, v)), whole = wholeCounts(fractional);
      const first = policies.length;
      whole.forEach((k, j) => {
        const source = j < cells.length ? 0 : 1, c = j % cells.length, premium = offerFor(s, cells[c]);
        for (let x = 0; x < k; x++) policies.push([++policyNo, i, m, source, c, premium, risk[c].freq * shock[c], risk[c].cost * shock[c], 0, 0]);
      });
      const sold = policies.slice(first);

      // The engine's claims for this team-month, spread over its policies.
      const count = Math.round(row.claimCount - countBefore), amount = row.monthClaims;
      countBefore = row.claimCount;
      const rnd = stream((config.seed ?? 1) * 15485863 + (Number(team.id) + 1) * 92821 + m * 6151);
      const cumulative = []; let total = 0;
      for (const p of sold) { total += p[6]; cumulative.push(total); }
      const drawn = Array.from({ length: count }, () => {
        let policy = null;
        if (sold.length) {
          const u = rnd() * total; let lo = 0, hi = cumulative.length - 1;
          while (lo < hi) { const mid = (lo + hi) >> 1; if (cumulative[mid] < u) lo = mid + 1; else hi = mid; }
          policy = sold[lo];
        }
        const meanSev = policy ? risk[policy[4]].sev : row.monthClaims / Math.max(1, count);
        return { policy, size: meanSev * gamma(R.model.gammaShape, rnd) / R.model.gammaShape };
      });
      const raw = drawn.reduce((a, d) => a + d.size, 0), scale = raw ? amount / raw : 0;
      const amounts = drawn.map(d => cents(d.size * scale));
      if (amounts.length) { const top = amounts.indexOf(Math.max(...amounts)); amounts[top] = cents(amounts[top] + cents(amount) - cents(amounts.reduce((a, b) => a + b, 0))); }
      drawn.forEach((d, k) => {
        claims.push([++claimNo, d.policy ? d.policy[0] : 0, i, m, amounts[k]]);
        if (d.policy) { d.policy[8]++; d.policy[9] = cents(d.policy[9] + amounts[k]); }
      });

      checks.push({
        team: i, month: m,
        engine: { policies: fractional.reduce((a, b) => a + b, 0), gwp: row.monthGwp, claims: count, amount },
        file: { policies: sold.length, gwp: sold.reduce((a, p) => a + p[5], 0), claims: drawn.length, amount: amounts.reduce((a, b) => a + b, 0) }
      });
    }
  });
  return { policies, claims, checks };
}

// ——— The workbook ———
// The data sheets are written row by row as string chunks with shared strings, so ~250,000 policies stay
// within the browser's memory and the file stays a few megabytes.
export async function buildPortfolioWorkbook(state, { lang = 'en' } = {}) {
  const { policies, claims, checks } = buildPortfolio(state);
  const teams = state.teams, cells = marketCells(), months = monthsOf(lang);
  const strings = [], index = new Map();
  const str = v => { if (!index.has(v)) { index.set(v, strings.length); strings.push(v); } return index.get(v); };
  const T = v => `<c t="s"><v>${str(String(v))}</v></c>`, N = (v, st = 0) => `<c${st ? ` s="${st}"` : ''}><v>${Number.isFinite(v) ? v : 0}</v></c>`;
  const F = (f, st = 0) => `<c${st ? ` s="${st}"` : ''}><f>${xml(f)}</f></c>`, H = v => `<c s="${S.head}" t="s"><v>${str(String(v))}</v></c>`;
  const page = (rows, widths, freeze = true) => [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`,
    freeze ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' : '',
    `<cols>${widths.map((w, k) => `<col min="${k + 1}" max="${k + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>`,
    ...rows.map(r => `<row>${r}</row>`), '</sheetData></worksheet>'
  ];

  const teamName = teams.map(t => t.name), source = [L(lang, 'Market', 'Pazar'), L(lang, 'Campaign', 'Kampanya')];
  const levels = cells.map(cell => DIMENSIONS.map((dim, k) => levelName(dim, cell[k], lang)));
  const SH = { guide: L(lang, 'Read me', 'Oku beni'), policies: L(lang, 'Policies', 'Poliçeler'), claims: L(lang, 'Claims', 'Hasarlar'), check: L(lang, 'Reconciliation', 'Mutabakat') };

  const P = [[L(lang, 'Policy no', 'Poliçe no'), L(lang, 'Team', 'Takım'), L(lang, 'Month', 'Ay'), L(lang, 'Month name', 'Ay adı'), L(lang, 'Source', 'Kaynak'),
    L(lang, 'City', 'İl'), L(lang, 'Channel', 'Kanal'), L(lang, 'Vehicle age', 'Araç yaşı'), L(lang, 'Persona', 'Persona'), L(lang, 'Customer type', 'Müşteri tipi'),
    L(lang, 'Premium (EUR)', 'Prim (EUR)'), L(lang, 'Expected frequency', 'Beklenen frekans'), L(lang, 'Expected claim cost (EUR)', 'Beklenen hasar maliyeti (EUR)'),
    L(lang, 'Claims', 'Hasar adedi'), L(lang, 'Claim amount (EUR)', 'Hasar tutarı (EUR)')].map(H).join('')];
  for (const [no, ti, m, src, c, premium, freq, cost, n, amount] of policies)
    P.push(N(no) + T(teamName[ti]) + N(m + 1) + T(months[m]) + T(source[src]) + levels[c].map(T).join('') + N(premium, S.money) + N(freq, S.dec) + N(cost, S.money) + N(n) + N(amount, S.money));

  const C = [[L(lang, 'Claim no', 'Hasar no'), L(lang, 'Policy no', 'Poliçe no'), L(lang, 'Team', 'Takım'), L(lang, 'Month', 'Ay'), L(lang, 'Amount (EUR)', 'Tutar (EUR)')].map(H).join('')];
  for (const [no, pno, ti, m, amount] of claims) C.push(N(no) + (pno ? N(pno) : '<c/>') + T(teamName[ti]) + N(m + 1) + N(amount, S.money));

  // The file's side of the reconciliation is a formula over the data sheets, so it recalculates from the rows.
  const p = `'${SH.policies}'`, cl = `'${SH.claims}'`;
  const R = [[L(lang, 'Team', 'Takım'), L(lang, 'Month', 'Ay'),
    L(lang, 'Policies · engine', 'Poliçe · motor'), L(lang, 'Policies · file', 'Poliçe · dosya'),
    L(lang, 'Premium · engine', 'Prim · motor'), L(lang, 'Premium · file', 'Prim · dosya'), L(lang, 'Premium difference', 'Prim farkı'),
    L(lang, 'Claims · engine', 'Hasar adedi · motor'), L(lang, 'Claims · file', 'Hasar adedi · dosya'),
    L(lang, 'Claim amount · engine', 'Hasar tutarı · motor'), L(lang, 'Claim amount · file', 'Hasar tutarı · dosya'), L(lang, 'Claim amount difference', 'Hasar tutarı farkı')].map(H).join('')];
  checks.forEach(({ team, month, engine }, k) => {
    const r = k + 2, who = `$A${r}`, when = `$B${r}`;
    R.push(T(teamName[team]) + N(month + 1) + N(engine.policies, S.dec) + F(`COUNTIFS(${p}!$B:$B,${who},${p}!$C:$C,${when})`, S.int)
      + N(engine.gwp, S.money) + F(`SUMIFS(${p}!$K:$K,${p}!$B:$B,${who},${p}!$C:$C,${when})`, S.money) + F(`F${r}-E${r}`, S.money)
      + N(engine.claims, S.int) + F(`COUNTIFS(${cl}!$C:$C,${who},${cl}!$D:$D,${when})`, S.int)
      + N(engine.amount, S.money) + F(`SUMIFS(${cl}!$E:$E,${cl}!$C:$C,${who},${cl}!$D:$D,${when})`, S.money) + F(`K${r}-J${r}`, S.money));
  });
  const last = checks.length + 1;
  R.push(T(L(lang, 'Total', 'Toplam')) + '<c/>' + ['C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'].map(x => F(`SUM(${x}2:${x}${last})`, x === 'C' ? S.dec : x === 'D' || x === 'H' || x === 'I' ? S.int : S.money)).join(''));

  const unplaced = claims.filter(c => !c[1]).length;
  const G = [
    [L(lang, 'The season as policies and claims', 'Sezon, poliçe ve hasar olarak'), S.title],
    [L(lang, `${policies.length.toLocaleString('tr-TR')} policies and ${claims.length.toLocaleString('tr-TR')} claims from the teams of game ${state.code ?? ''}. The rest of the market (customers who bought from no team) is not in the file.`, `${state.code ?? ''} oyunundaki takımların ${policies.length.toLocaleString('tr')} poliçesi ve ${claims.length.toLocaleString('tr')} hasarı. Pazarın geri kalanı (hiçbir takımdan almayan müşteriler) dosyada yok.`)],
    [L(lang, 'How the rows were made', 'Satırlar nasıl üretildi'), S.section],
    [L(lang, '1. The engine sells each market cell (city × channel × vehicle age × persona × customer type) to each team as an expected, fractional number of policies a month, from the market and from the campaign.', '1. Motor her pazar hücresini (il × kanal × araç yaşı × persona × müşteri tipi) her takıma ay ay beklenen, ondalıklı bir poliçe sayısı olarak satar; pazardan ve kampanyadan ayrı ayrı.')],
    [L(lang, '2. Each team-month becomes whole policies: the fractional counts are rounded so their total is the nearest whole number (largest remainder). That is the only difference to the app: under one policy per team-month.', '2. Her takım-ay tam poliçelere çevrilir: ondalıklı sayılar toplamı en yakın tam sayı olacak şekilde yuvarlanır (en büyük kalan). Uygulamayla tek fark budur: takım-ay başına bir poliçeden az.')],
    [L(lang, '3. Premium is the team’s price for that cell in that month: base premium × the five coefficients.', '3. Prim, takımın o ay o hücre için fiyatıdır: baz prim × beş katsayı.')],
    [L(lang, '4. Expected frequency and expected claim cost are the cell’s true risk from the model (with that month’s event effects). Expected cost ÷ premium is the policy’s expected loss ratio.', '4. Beklenen frekans ve beklenen hasar maliyeti hücrenin modeldeki gerçek riskidir (o ayın olay etkileriyle). Beklenen maliyet ÷ prim poliçenin beklenen hasar oranıdır.')],
    [L(lang, '5. Claims: the engine draws one claim count and one claim amount per team-month (Poisson count, Gamma sizes). The file keeps that count exactly, places each claim on a policy in proportion to its expected frequency, sizes it with a Gamma draw around its cell’s mean severity, then scales the sizes so the team-month total equals the engine’s amount.', '5. Hasarlar: motor her takım-ay için bir hasar adedi ve bir hasar tutarı çeker (Poisson adet, Gamma büyüklük). Dosya bu adedi aynen korur, her hasarı poliçelere beklenen frekanslarıyla orantılı dağıtır, hücrenin ortalama şiddeti etrafında Gamma ile büyüklük verir, sonra toplamı motorun tutarına eşitleyecek şekilde ölçekler.')],
    [L(lang, '6. Claims are booked on an underwriting-year basis, as in the app: a policy’s claims belong to the month it was sold.', '6. Hasarlar uygulamadaki gibi poliçe yılı esasına göre yazılır: bir poliçenin hasarı satıldığı aya aittir.')],
    [L(lang, 'Reconciliation', 'Mutabakat'), S.section],
    [L(lang, 'The Reconciliation sheet puts the engine’s figures next to formulas over this file’s rows for every team and month. Claim counts and claim amounts match exactly; policies and premium differ only by the rounding in step 2.', 'Mutabakat sayfası her takım ve ay için motorun rakamlarını bu dosyanın satırları üzerinden hesaplanan formüllerin yanına koyar. Hasar adedi ve tutarı birebir tutar; poliçe ve prim yalnızca 2. adımdaki yuvarlama kadar farklıdır.')],
    ...(unplaced ? [[L(lang, `${unplaced} claim(s) fell in a team-month that rounded to no whole policy; they are on the Claims sheet without a policy number.`, `${unplaced} hasar, tam poliçeye yuvarlanmayan bir takım-aya düştü; Hasarlar sayfasında poliçe numarası olmadan duruyor.`)]] : []),
    [L(lang, 'Same session, same file: every random number comes from the session seed.', 'Aynı oturum, aynı dosya: her rastgele sayı oturumun seed’inden gelir.')]
  ].map(([text, st = S.text]) => `<c s="${st}" t="s"><v>${str(text)}</v></c>`);

  const order = [
    ['guide', page(G, [150], false)],
    ['policies', page(P, [11, 18, 6, 11, 11, 12, 11, 12, 16, 14, 13, 12, 16, 9, 14])],
    ['claims', page(C, [10, 11, 18, 6, 13])],
    ['check', page(R, [18, 6, 15, 14, 15, 15, 14, 14, 14, 17, 17, 16])]
  ];
  const sst = [`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">`,
    ...strings.map(v => `<si><t xml:space="preserve">${xml(v)}</t></si>`), '</sst>'];
  const files = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${order.map((_, k) => `<Override PartName="/xl/worksheets/sheet${k + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${order.map(([key], k) => `<sheet name="${xml(SH[key])}" sheetId="${k + 1}" r:id="rId${k + 1}"/>`).join('')}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${order.map((_, k) => `<Relationship Id="rId${k + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${k + 1}.xml"/>`).join('')}<Relationship Id="rId${order.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId${order.length + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`,
    'xl/styles.xml': STYLES,
    'xl/sharedStrings.xml': sst
  };
  order.forEach(([, chunks], k) => { files[`xl/worksheets/sheet${k + 1}.xml`] = chunks; });
  return zip(files);
}
