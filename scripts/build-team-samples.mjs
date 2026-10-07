// Two contrasting team workbooks for trying out the per-team upload (ornek-takimlar/).
// node scripts/build-team-samples.mjs
import { writeFileSync } from 'node:fs';
import { buildTemplate } from '../dist/js/sheet.js';
import { freshSession, defaultStrategy } from '../dist/js/game.js';
import { actuarialCoefficients, actuarialBase, rulesOf, cascoMoney, DIMENSIONS, snapCoef } from '../dist/engine.js';

const s = freshSession(0, { lang: 'tr' });
const R = rulesOf(s.config), money = cascoMoney(s.config), k = v => Math.round(v / 1000) * 1000;
const risk = actuarialCoefficients(R);
const round = v => snapCoef(v, R);

// Kartal Sigorta: reads the data, prices each segment by its risk and keeps a margin.
const kartalCoef = Object.fromEntries(DIMENSIONS.map(dim => [dim, risk[dim].map(round)]));
const kartal = {
  ...defaultStrategy('Kartal Sigorta', s.config),
  product: 'Kartal Kasko', sentence: 'Her segmenti riskine göre fiyatla, kârı koru.',
  coef: kartalCoef, basePremium: actuarialBase(kartalCoef, 0.58, R),
  marketing: k(money.budget * 0.4), channelFocus: [50, 25, 15, 10], claimsOps: k(money.budget * 0.45), reinsurance: true,
  campaign: 20, mediaShare: 30, offer: 'gym'
};
kartal.marketing = Math.min(kartal.marketing, money.budget - money.reinsuranceFee - kartal.claimsOps);

// Mavi Dalga: chases volume with cheap prices, loud digital and bank marketing, and a lighter touch on risk.
const flatter = Object.fromEntries(DIMENSIONS.map(dim => [dim, risk[dim].map(v => round(1 + (v - 1) * 0.4))]));
flatter.channel = flatter.channel.map((v, i) => (i === 2 ? round(v * 0.9) : v));
const mavi = {
  ...defaultStrategy('Mavi Dalga', s.config),
  product: 'Mavi Dalga Kasko', sentence: 'Uygun fiyatla hızlı büyü, dijitalde öne çık.',
  coef: flatter, basePremium: actuarialBase(flatter, 0.72, R),
  marketing: k(money.budget * 0.65), channelFocus: [20, 25, 45, 10], claimsOps: k(money.budget * 0.3), reinsurance: false,
  campaign: 50, mediaShare: 20, offer: 'coffee'
};

for (const [name, strategy, file] of [['Kartal Sigorta', kartal, 'kartal-sigorta.xlsx'], ['Mavi Dalga', mavi, 'mavi-dalga.xlsx']]) {
  writeFileSync(`ornek-takimlar/${file}`, buildTemplate(s, { lang: 'tr', teams: [{ name, strategy }], single: true }));
  console.log(file, '· baz', strategy.basePremium, '· pazarlama', strategy.marketing, '· hasar op.', strategy.claimsOps, '· reasürans', strategy.reinsurance, '· kampanya', strategy.campaign, strategy.mediaShare, strategy.offer);
}
