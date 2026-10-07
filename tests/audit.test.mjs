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
  for (const name of ['BaseFreq', 'BaseSev', 'MarketLR', 'Plans', 'TeamLuck', 'MarketLuck', 'FairSlice', 'ShareFull']) assert.match(workbook, new RegExp(`definedName name="${name}"`));
  const sheets = Object.entries(files).filter(([k]) => k.startsWith('xl/worksheets/')).map(([, v]) => v).join('');
  assert.match(sheets, /NORMSINV\(L\d+\)/, 'claim counts use the spreadsheet’s inverse normal');
  assert.match(sheets, /SUMIFS\(/);
  const calcRows = (files['xl/worksheets/sheet8.xml'].match(/<row /g) || []).length;
  assert.equal(calcRows, 1 + 12 * CASCO_MARKET.cells.length, 'one calculation row per month and market cell');
});
