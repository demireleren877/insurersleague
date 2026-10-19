import test from 'node:test';
import { CASCO_MARKET } from '../dist/data/casco-market.js';
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import { freshSession, reduce, defaultStrategy } from '../dist/js/game.js';
import { buildAuditWorkbook } from '../dist/js/audit.js';

// Unzips the workbook into { path: xml }.
function parts(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), out = {};
  let eocd = bytes.length - 22;
  while (view.getUint32(eocd, true) !== 0x06054b50) eocd--;
  let p = view.getUint32(eocd + 16, true);
  for (let i = 0; i < view.getUint16(eocd + 10, true); i++) {
    const size = view.getUint32(p + 20, true), nlen = view.getUint16(p + 28, true), xlen = view.getUint16(p + 30, true), clen = view.getUint16(p + 32, true), lho = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nlen));
    const start = lho + 30 + view.getUint16(lho + 26, true) + view.getUint16(lho + 28, true);
    out[name] = inflateRawSync(bytes.subarray(start, start + size)).toString('utf8');
    p += 46 + nlen + xlen + clen;
  }
  return out;
}

test('the calculation workbook carries every input and computes the rest with formulas', async () => {
  const s = freshSession(1_000, { code: '123456', lang: 'tr' });
  for (const name of ['Kartal', 'Nova']) {
    reduce(s, { type: 'excel-add-team', name }, { role: 'host', now: 1_001 });
    reduce(s, { type: 'excel-team-plan', teamId: s.teams.at(-1).id, strategy: { ...defaultStrategy(name, s.config), sentence: 'Plan.' } }, { role: 'host', now: 1_002 });
  }
  const files = parts(await buildAuditWorkbook(s, { lang: 'tr' }));
  const workbook = files['xl/workbook.xml'];
  for (const sheet of ['Oku beni', 'Puan', 'Kararlar', 'Kurallar', 'Olaylar', 'Kampanya', 'Defter', 'Hesap', 'Pazar', 'Sans', 'Sans takim']) assert.match(workbook, new RegExp(`name="${sheet}"`));
  for (const name of ['BaseFreq', 'BaseSev', 'MarketLR', 'Plans', 'TeamLuck', 'MarketLuck', 'ShareTarget', 'BankruptRatio', 'T_offer']) assert.match(workbook, new RegExp(`definedName name="${name}"`));
  const sheets = Object.entries(files).filter(([k]) => k.startsWith('xl/worksheets/')).map(([, v]) => v).join('');
  assert.match(sheets, /NORMSINV\(I\d+\)/, 'claim counts use the spreadsheet’s inverse normal');
  assert.match(sheets, /SUMIFS\(/);
  const calcRows = (files['xl/worksheets/sheet8.xml'].match(/<row /g) || []).length;
  assert.equal(calcRows, 1 + 12 * CASCO_MARKET.cells.length, 'one calculation row per month and market cell');
});

test('the policy file keeps the engine’s claims exactly and its policies to the rounding', async () => {
  const { buildPortfolio, buildPortfolioWorkbook } = await import('../dist/js/portfolio.js');
  const s = freshSession(1_000, { code: '123456', lang: 'en' });
  ['Kartal', 'Nova', 'Atlas'].forEach((name, k) => {
    reduce(s, { type: 'excel-add-team', name }, { role: 'host', now: 1_001 });
    const strategy = defaultStrategy(name, s.config);
    reduce(s, { type: 'excel-team-plan', teamId: s.teams.at(-1).id, strategy: { ...strategy, basePremium: strategy.basePremium * (0.9 + k * 0.1), sentence: 'Plan.' } }, { role: 'host', now: 1_002 });
  });
  const pf = buildPortfolio(s);
  assert.equal(pf.checks.length, 3 * 12);
  for (const { engine, file } of pf.checks) {
    assert.equal(file.claims, engine.claims);
    assert.ok(Math.abs(file.amount - engine.amount) < 0.01);
    assert.ok(Math.abs(file.policies - engine.policies) <= 0.5 + 1e-9);
    assert.ok(Math.abs(file.gwp - engine.gwp) <= engine.gwp * 0.001);
  }
  const claimsOnPolicies = pf.policies.reduce((a, p) => a + p[8], 0);
  assert.equal(claimsOnPolicies, pf.claims.filter(c => c[1]).length);
  assert.deepEqual(buildPortfolio(s).claims.slice(0, 50), pf.claims.slice(0, 50), 'same session, same file');
  const files = parts(await buildPortfolioWorkbook(s, { lang: 'en' }));
  assert.ok(files['xl/sharedStrings.xml'].includes('Reconciliation') || files['xl/workbook.xml'].includes('Reconciliation'));
  assert.equal((files['xl/worksheets/sheet2.xml'].match(/<row>/g) || []).length, pf.policies.length + 1);
});

test('segment prices: each level has every team’s average price and shares that add up to 100%', async () => {
  const { segmentPrices } = await import('../dist/js/segment-prices.js');
  const s = freshSession(1_000, { code: '123456', lang: 'en' });
  ['Kartal', 'Nova', 'Atlas'].forEach((name, k) => {
    reduce(s, { type: 'excel-add-team', name }, { role: 'host', now: 1_001 });
    s.teams.at(-1).strategy = { ...defaultStrategy(name, s.config), basePremium: defaultStrategy(name, s.config).basePremium * (0.9 + k * 0.1) };
  });
  const { teams, table } = segmentPrices(s);
  assert.equal(teams.length, 3);
  assert.equal(table.length, 5);
  for (const group of table) for (const row of group.levels) {
    assert.ok(row.market > 0 && row.prices.every(p => p > 0));
    assert.ok(Math.abs(row.shares.reduce((a, b) => a + b, 0) - 1) < 1e-9);
    assert.ok(row.prices[0] < row.prices[1] && row.prices[1] < row.prices[2], 'a lower base premium is a lower price in every segment');
  }
});
