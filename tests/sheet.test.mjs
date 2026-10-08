import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { freshSession, defaultStrategy } from '../dist/js/game.js';
import { buildTemplate, readSheets } from '../dist/js/sheet.js';

function fileOf(name, bytes) {
  return {
    name,
    async arrayBuffer() { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); }
  };
}

function deflateWorkbook(stored) {
  const source = new Uint8Array(stored), view = new DataView(source.buffer, source.byteOffset, source.byteLength);
  let eocd = source.length - 22;
  while (eocd >= Math.max(0, source.length - 65_557) && view.getUint32(eocd, true) !== 0x06054b50) eocd--;
  assert.ok(eocd >= 0, 'test fixture must be a valid ZIP');
  const count = view.getUint16(eocd + 10, true);
  let at = view.getUint32(eocd + 16, true), offset = 0;
  const localParts = [], centralParts = [];
  for (let i = 0; i < count; i++) {
    assert.equal(view.getUint32(at, true), 0x02014b50);
    const nameLen = view.getUint16(at + 28, true), extraLen = view.getUint16(at + 30, true), commentLen = view.getUint16(at + 32, true);
    const recordLen = 46 + nameLen + extraLen + commentLen;
    const name = source.slice(at + 46, at + 46 + nameLen);
    const nameText = new TextDecoder().decode(name);
    const oldLocal = view.getUint32(at + 42, true);
    const rawStart = oldLocal + 30 + view.getUint16(oldLocal + 26, true) + view.getUint16(oldLocal + 28, true);
    const raw = source.subarray(rawStart, rawStart + view.getUint32(at + 20, true));
    const compressed = deflateRawSync(raw);
    const crc = view.getUint32(at + 16, true), localHeader = new DataView(new ArrayBuffer(30));
    localHeader.setUint32(0, 0x04034b50, true); localHeader.setUint16(4, 20, true); localHeader.setUint16(6, 0x0800, true); localHeader.setUint16(8, 8, true);
    localHeader.setUint32(14, crc, true); localHeader.setUint32(18, compressed.length, true); localHeader.setUint32(22, raw.length, true); localHeader.setUint16(26, name.length, true);
    localParts.push(new Uint8Array(localHeader.buffer), name, compressed);
    const central = source.slice(at, at + recordLen), centralView = new DataView(central.buffer, central.byteOffset, central.byteLength);
    centralView.setUint16(10, 8, true); centralView.setUint32(20, compressed.length, true); centralView.setUint32(24, raw.length, true); centralView.setUint32(42, offset, true);
    centralParts.push(central);
    offset += 30 + name.length + compressed.length;
    at += recordLen;
    assert.ok(nameText);
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, count, true); end.setUint16(10, count, true); end.setUint32(12, centralSize, true); end.setUint32(16, offset, true);
  const parts = [...localParts, ...centralParts, new Uint8Array(end.buffer)], result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let cursor = 0;
  for (const part of parts) { result.set(part, cursor); cursor += part.length; }
  return result;
}

test('strategy workbook template round-trips localized Excel decisions', async () => {
  const state = freshSession(1_000, { lang: 'tr', preset: 'casco' });
  const strategy = { ...defaultStrategy('Atlas', state.config), product: 'Atlas Güvence', sentence: 'Dengeli fiyatla aileleri büyüt.' };
  strategy.basePremium = 21.5;
  strategy.coef.persona = [0.9, 1.15, 1, 0.8];
  strategy.coef.channel = [0.95, 1.05, 0.8, 1.2];
  strategy.mediaShare = 20; strategy.offers = [10, 20, 30, 40];
  strategy.marketing = 30_000;
  const bytes = buildTemplate(state, { lang: 'tr', teams: [{ name: 'Atlas', strategy }] });
  const archiveText = new TextDecoder().decode(bytes);
  const workbookXml = archiveText.slice(archiveText.indexOf('<workbook '), archiveText.indexOf('</workbook>') + 11);
  // The case file's design: its sheets and its named dropdown lists. No Claim sheet any more.
  for (const sheet of ['Input', 'Premium', 'Marketing']) assert.match(workbookXml, new RegExp(`<sheet name="${sheet}"`));
  assert.doesNotMatch(workbookXml, /<sheet name="Claim"/);
  for (const list of ['CoefficientList', 'PercentageList']) assert.match(workbookXml, new RegExp(`<definedName name="${list}">`));
  assert.match(archiveText, /<formula1>CoefficientList<\/formula1>/);
  assert.match(archiveText, /<tabColor rgb="FF004FA3"\/>/);
  const result = await readSheets([fileOf('atlas.xlsx', bytes)], state.config, 'tr');

  assert.deepEqual(result.errors, []);
  assert.equal(result.teams.length, 1);
  assert.equal(result.teams[0].name, 'Atlas');
  assert.equal(result.teams[0].strategy.product, 'Atlas Güvence');
  assert.equal(result.teams[0].strategy.sentence, 'Dengeli fiyatla aileleri büyüt.');
  assert.equal(result.teams[0].strategy.basePremium, 21.5);
  assert.deepEqual(result.teams[0].strategy.coef, strategy.coef);
  assert.equal(result.teams[0].strategy.marketing, 30_000);
  assert.equal(result.teams[0].strategy.mediaShare, 20);
  assert.deepEqual(result.teams[0].strategy.offers, [10, 20, 30, 40]);
  for (const gone of ['channelFocus', 'claimsOps', 'reinsurance', 'campaign', 'offer']) assert.equal(gone in result.teams[0].strategy, false, gone);
});

test('compressed Excel workbooks import correctly', async () => {
  const state = freshSession(1_000, { lang: 'en', preset: 'casco' });
  const strategy = defaultStrategy('Atlas', state.config);
  const bytes = deflateWorkbook(buildTemplate(state, { lang: 'en', teams: [{ name: 'Atlas', strategy }] }));
  const result = await readSheets([fileOf('atlas-compressed.xlsx', bytes)], state.config, 'en');

  assert.deepEqual(result.errors, []);
  assert.equal(result.teams.length, 1);
  assert.equal(result.teams[0].name, 'Atlas');
});

test('initial workbook import reports overlength text instead of silently truncating it', async () => {
  const state = freshSession(1_000, { lang: 'tr', preset: 'casco' });
  const strategy = defaultStrategy('Atlas', state.config);
  strategy.product = 'A'.repeat(33);
  strategy.sentence = 'B'.repeat(91);
  const result = await readSheets([
    fileOf('atlas.xlsx', buildTemplate(state, { lang: 'tr', teams: [{ name: 'Atlas', strategy }] }))
  ], state.config, 'tr');

  assert.equal(result.teams.length, 0);
  assert.match(result.errors.join(' '), /ürün adı en fazla 32 karakter olmalı/);
  assert.match(result.errors.join(' '), /strateji cümlesi en fazla 90 karakter olmalı/);
});

test('quarter workbooks merge changes from separate team copies and ignore unchanged roster rows', async () => {
  const state = freshSession(1_000, { lang: 'tr', preset: 'casco' });
  const roster = ['Atlas', 'Nova'].map(name => ({ name, strategy: defaultStrategy(name, state.config) }));
  const atlasCopy = structuredClone(roster);
  atlasCopy[0].strategy.basePremium = 24;
  const novaCopy = structuredClone(roster);
  novaCopy[1].strategy.marketing = 28_000;
  const unchangedCopy = structuredClone(roster);
  // One workbook carries one team.
  const workbooks = [
    fileOf('atlas.xlsx', buildTemplate(state, { lang: 'tr', teams: [atlasCopy[0]], quarter: true })),
    fileOf('nova.xlsx', buildTemplate(state, { lang: 'tr', teams: [novaCopy[1]], quarter: true })),
    fileOf('unchanged.xlsx', buildTemplate(state, { lang: 'tr', teams: [unchangedCopy[0]], quarter: true }))
  ];

  const result = await readSheets(workbooks, state.config, 'tr', { quarter: true, currentTeams: roster });
  assert.deepEqual(result.errors, []);
  assert.equal(result.teams.length, 2);
  assert.equal(result.teams.find(team => team.name === 'Atlas').strategy.basePremium, 24);
  assert.equal(result.teams.find(team => team.name === 'Nova').strategy.marketing, 28_000);
});

test('quarter workbook merge reports conflicting edits to the same team', async () => {
  const state = freshSession(1_000, { lang: 'tr', preset: 'casco' });
  const roster = ['Atlas', 'Nova'].map(name => ({ name, strategy: defaultStrategy(name, state.config) }));
  const firstCopy = structuredClone(roster);
  firstCopy[0].strategy.basePremium = 24;
  const secondCopy = structuredClone(roster);
  secondCopy[0].strategy.basePremium = 26;
  const result = await readSheets([
    fileOf('atlas.xlsx', buildTemplate(state, { lang: 'tr', teams: firstCopy, quarter: true })),
    fileOf('nova.xlsx', buildTemplate(state, { lang: 'tr', teams: secondCopy, quarter: true }))
  ], state.config, 'tr', { quarter: true, currentTeams: roster });

  assert.match(result.errors.join(' '), /çakışan çeyrek planları/i);
});

test('unchanged rows from a quarter copy do not count as submitted plans', async () => {
  const state = freshSession(1_000, { lang: 'tr', preset: 'casco' });
  const roster = ['Atlas', 'Nova'].map(name => ({ name, strategy: defaultStrategy(name, state.config) }));
  const result = await readSheets([
    fileOf('roster.xlsx', buildTemplate(state, { lang: 'tr', teams: roster, quarter: true }))
  ], state.config, 'tr', { quarter: true, currentTeams: roster });

  assert.match(result.errors.join(' '), /Güncellenmiş çeyrek stratejisi bulunamadı/i);
});

test('workbook imports report out-of-range coefficients by segment name', async () => {
  const state = freshSession(1_000, { lang: 'tr', preset: 'casco' });
  const strategy = defaultStrategy('Atlas', state.config);
  strategy.coef.city[0] = 3;
  const result = await readSheets([fileOf('atlas.xlsx', buildTemplate(state, { lang: 'tr', teams: [{ name: 'Atlas', strategy }] }))], state.config, 'tr');
  assert.equal(result.teams.length, 0);
  assert.match(result.errors.join(' '), /İl · İstanbul katsayısı 0.5–2.5 olmalı/);
});

test('an English template imports into a Turkish room: rows are keyed, not matched by label', async () => {
  const state = freshSession(1_000, { lang: 'tr', preset: 'casco' });
  const strategy = defaultStrategy('Nova', state.config);
  strategy.coef.vehicle = [0.85, 1, 1.15];
  const result = await readSheets([fileOf('nova.xlsx', buildTemplate(state, { lang: 'en', teams: [{ name: 'Nova', strategy }] }))], state.config, 'tr');
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.teams[0].strategy.coef.vehicle, [0.85, 1, 1.15]);
});

test('a team’s own workbook is read into that team, whatever the name cell says', async () => {
  const { readTeamSheet } = await import('../dist/js/sheet.js');
  const state = freshSession(1_000, { lang: 'tr' });
  const strategy = { ...defaultStrategy('Kartal', state.config), basePremium: 23.4 };
  const one = buildTemplate(state, { lang: 'tr', teams: [{ name: 'Kartal Sig.', strategy }], single: true });
  const read = await readTeamSheet(fileOf('kartal.xlsx', one), { name: 'Kartal' }, state.config, 'tr');
  assert.deepEqual(read.errors, []);
  assert.equal(read.strategy.basePremium, 23.4);
  assert.equal(read.fileName, 'Kartal Sig.');

  // A file with the team name left empty is still the team's own.
  const blank = buildTemplate(state, { lang: 'tr', teams: [{ name: '', strategy }] });
  const unnamed = await readTeamSheet(fileOf('bos.xlsx', blank), { name: 'Kartal' }, state.config, 'tr');
  assert.deepEqual(unnamed.errors, []);
  assert.equal(unnamed.strategy.basePremium, 23.4);
});

test('the media and offer shares of the campaign must total 100%', async () => {
  const { readWorkbook, teamsFromSheets } = await import('../dist/js/sheet.js');
  const state = freshSession(1_000, { lang: 'en' });
  const bytes = buildTemplate(state, { lang: 'en', teams: [{ name: 'Atlas', strategy: defaultStrategy('Atlas', state.config) }] });
  const sheets = await readWorkbook(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const ok = teamsFromSheets([{ file: 'atlas.xlsx', sheets }], state.config, 'en');
  assert.deepEqual(ok.errors, []);
  sheets.find(sh => sh.name === 'Marketing').rows[11][3] = 0.3; // Marketing!D12: offer 30% with media 50%
  const bad = teamsFromSheets([{ file: 'atlas.xlsx', sheets }], state.config, 'en');
  assert.equal(bad.teams.length, 0);
  assert.match(bad.errors.join(' '), /media \+ offer must total 100%/);
});

test('the gift weights must total 100%, and an old four-sheet workbook is refused', async () => {
  const { readWorkbook, teamsFromSheets } = await import('../dist/js/sheet.js');
  const state = freshSession(1_000, { lang: 'en' });
  const bytes = buildTemplate(state, { lang: 'en', teams: [{ name: 'Atlas', strategy: defaultStrategy('Atlas', state.config) }] });
  const sheets = await readWorkbook(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  sheets.find(sh => sh.name === 'Marketing').rows[16][10] = 0.25; // Marketing!K17: restaurant 25% on top of concert 100%
  const bad = teamsFromSheets([{ file: 'atlas.xlsx', sheets }], state.config, 'en');
  assert.equal(bad.teams.length, 0);
  assert.match(bad.errors.join(' '), /gift weights must total 100%/);
  const old = teamsFromSheets([{ file: 'old.xlsx', sheets: [...sheets, { name: 'Claim', rows: [] }] }], state.config, 'en');
  assert.match(old.errors.join(' '), /earlier version/);
});

test('the quarter workbook shows what is spent and pre-fills the rest of the year at the current pace', async () => {
  const { readWorkbook } = await import('../dist/js/sheet.js');
  const { reduce } = await import('../dist/js/game.js');
  const s = freshSession(1_000, { lang: 'en' });
  reduce(s, { type: 'excel-import-teams', teams: ['Atlas', 'Nova'].map(name => ({ name, strategy: { ...defaultStrategy(name, s.config), sentence: 'p', marketing: 240000 } })) }, { role: 'host', now: 1_000 });
  reduce(s, { type: 'phase', to: 'briefing' }, { role: 'host', now: 1_000 }); reduce(s, { type: 'phase', to: 'decisions' }, { role: 'host', now: 1_000 }); reduce(s, { type: 'start-race' }, { role: 'host', now: 1_000 });
  for (let i = 0; i < 6 && !s.strategyReviews.current && s.strategyReviews.current !== 0; i++) reduce(s, { type: 'next-month' }, { role: 'host', now: 1_000 });
  const review = s.strategyReviews.rounds[s.strategyReviews.current];
  assert.equal(review.month, 2);
  const bytes = buildTemplate(s, { lang: 'en', teams: [s.teams[0]] });
  const sheets = await readWorkbook(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const mkt = sheets.find(sh => sh.name === 'Marketing');
  assert.equal(mkt.rows[13][3], 180000, 'nine months left at €20k a month');
  assert.match(String(mkt.rows[2][1]), /€60,000 spent/);
});
