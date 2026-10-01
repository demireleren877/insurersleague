// Builds the example decision workbooks served from the home page (dist/samples/).
// Run again when the rules or the template change:  node scripts/build-samples.mjs
import { writeFileSync } from 'node:fs';
import { buildTemplate } from '../dist/js/sheet.js';
import { freshSession, defaultStrategy } from '../dist/js/game.js';
import { actuarialBase, rulesOf, cascoMoney, marketCells, DIMENSIONS } from '../dist/engine.js';

for (const lang of ['tr', 'en']) {
  const s = freshSession(0, { lang });
  const R = rulesOf(s.config), money = cascoMoney(s.config);
  // An example, not an answer: it simply follows the premium relativities the rest of the market
  // already charges (public in the model config), rounded. Beating it is the teams' job.
  const coef = Object.fromEntries(DIMENSIONS.map((dim, k) => {
    let n = 0, sum = 0;
    for (const c of marketCells()) { n += c[5]; sum += c[5] * R.dimensions[dim][c[k]].prem; }
    return [dim, R.dimensions[dim].map(lv => Math.round(lv.prem / (sum / n) * 20) / 20)];
  }));
  const name = lang === 'tr' ? 'Örnek Takım' : 'Sample Team';
  const strategy = {
    ...defaultStrategy(name, s.config),
    product: lang === 'tr' ? 'Örnek Kasko' : 'Sample Casco',
    sentence: lang === 'tr' ? 'Piyasanın fiyat yapısını izle, acentede büyü.' : 'Follow the market’s price structure, grow through agents.',
    basePremium: actuarialBase(coef, 0.62, R), coef,
    marketing: Math.round(money.budget * 0.45 / 1000) * 1000,
    channelFocus: [45, 25, 15, 15],
    claimsOps: Math.round(money.budget * 0.42 / 1000) * 1000,
    reinsurance: false
  };
  const file = `dist/samples/${lang === 'tr' ? 'kasko-karar-ornegi' : 'casco-decision-sample'}.xlsx`;
  writeFileSync(file, buildTemplate(s, { lang, teams: [{ name, strategy }] }));
  console.log(file);
}
