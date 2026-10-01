// Rule studio: the moderator manages every coefficient of the casco market, the scoring, the money and
// the event calendar from here. Every field is fed by the rules.js schema; a change is validated on the
// server and broadcast to every device.
import { getState, getSession, raceStarted } from '../store.js';
import { icon } from '../ui.js';
import { esc, fmt, money, pct } from '../format.js';
import {
  assumptionsFor, eventScopesFor, defaultRules, rulesOf, localizedAssumption, localizedEventText, scenario, simulate, rank,
  scaledMarket, monthsOf, DIMENSIONS, dimensionName, levelName, marketCells, cellRisk, referenceMarket, policiesOf, cascoMoney,
  sampleStrategies, TEAM_META
} from '../../engine.js';
import { questionsOf } from '../game.js';
import { ARCHETYPES } from '../narrative.js';
import { fieldSpec, getPath, changedCount } from '../rules.js';
import { hostPage } from './host.js';
import { balanceSection } from './balance.js';
import { t, getLang } from '../i18n.js';

export const rulesState = { open: new Set() };

const weightLabels = () => [t('Profitability', 'Kârlılık'), t('Market share', 'Pazar payı'), t('Customer satisfaction', 'Müşteri memnuniyeti')];
const SCORING_KEYS = ['profitFloor', 'profitTarget', 'shareTarget', 'serviceTarget'];
const MONEY_KEYS = ['policies', 'capital', 'budget', 'fixedCost', 'reinsuranceFee'];

const within = prefixes => path => prefixes.some(p => path === p || path.startsWith(`${p}.`));
const assumptionChanges = (s, keys) => { const d = assumptionsFor(s.config.lang); return keys.filter(k => s.config.assumptions[k].value !== d[k].value).length; };
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const count = keys => (s, R) => changedCount(R, within(keys));

// Sections: menu order, reset-to-default scope, and the change counter.
export const SECTIONS = [
  { id: 'puanlama', get name() { return t('Scoring', 'Puanlama'); }, icon: 'cup', reset: { keys: ['capitalRule'], scoring: true },
    changes: (s, R) => count(['capitalRule'])(s, R) + assumptionChanges(s, SCORING_KEYS) + (sameJson(s.config.weights, [50, 30, 20]) ? 0 : 1) },
  { id: 'pazar', get name() { return t('Market & money', 'Pazar ve para'); }, icon: 'coins', reset: { keys: ['market', 'coef'], market: true },
    changes: (s, R) => count(['market', 'coef'])(s, R) + assumptionChanges(s, MONEY_KEYS) },
  { id: 'hasar', get name() { return t('Claims model', 'Hasar modeli'); }, icon: 'shield', reset: { keys: ['model'] }, changes: count(['model']) },
  { id: 'segmentler', get name() { return t('Segment coefficients', 'Segment katsayıları'); }, icon: 'users', reset: { keys: ['dimensions'] }, changes: count(['dimensions']) },
  { id: 'davranis', get name() { return t('Customer behaviour', 'Müşteri davranışı'); }, icon: 'eye', reset: { keys: ['behavior', 'commercialPrice'] }, changes: count(['behavior', 'commercialPrice']) },
  { id: 'operasyon', get name() { return t('Marketing & service', 'Pazarlama ve hizmet'); }, icon: 'megaphone', reset: { keys: ['marketing', 'service'] }, changes: count(['marketing', 'service']) },
  { id: 'reasurans', get name() { return t('Reinsurance', 'Reasürans'); }, icon: 'tower', reset: { keys: ['reinsurance'] }, changes: count(['reinsurance']) },
  { id: 'olaylar', get name() { return t('Event calendar', 'Olay takvimi'); }, icon: 'bolt', reset: { keys: [], events: true }, changes: s => (sameJson(s.config.events, scenario(s.config.lang).events) ? 0 : 1) },
  { id: 'denge', get name() { return t('Balance test', 'Denge testi'); }, icon: 'scale', reset: null, changes: () => 0 }
];
// Wide tables get the full width; the live preview steps aside.
const WIDE = ['segmentler', 'davranis', 'denge'];
export const sectionOf = id => SECTIONS.find(x => x.id === id) || SECTIONS[0];

// ——— Field components ———

const UNIT = () => ({ pct: '%', x: '×', eur: '€', num: '' });
const toView = (spec, v) => (spec.format === 'pct' ? Number((v * 100).toFixed(4)) : v);
const shown = (spec, v) => (spec.format === 'pct' ? `${fmt(v * 100, v * 100 % 1 ? 2 : 0)}%` : spec.format === 'eur' ? `€${fmt(v, v % 1 ? 2 : 0)}` : spec.format === 'x' ? `×${fmt(v, 2)}` : fmt(v, v % 1 ? 2 : 0));
const inputId = path => `rule-${path.replaceAll('.', '-')}`;

function numberAttrs(spec, path, value, locked) {
  const k = spec.format === 'pct' ? 100 : 1;
  return `type="number" inputmode="decimal" data-rule="${path}" id="${inputId(path)}" min="${Number((spec.min * k).toFixed(6))}" max="${Number((spec.max * k).toFixed(6))}" step="any" value="${toView(spec, value)}" ${locked ? 'disabled' : ''}`;
}

// A single rule field: label, unit-tagged input, hint, and a reset link if it differs from default.
function ruleField(path, label, hint = '') {
  const R = rulesOf(getState().config), spec = fieldSpec(path), value = getPath(R, path), def = getPath(defaultRules(), path);
  const changed = value !== def, locked = raceStarted(), unit = UNIT()[spec.format];
  return `<div class="rf ${changed ? 'changed' : ''}">
    <label class="rf-label" for="${inputId(path)}">${label}</label>
    <span class="rf-input"><input class="input" ${numberAttrs(spec, path, value, locked)}>${unit ? `<em>${unit}</em>` : ''}</span>
    ${hint ? `<small class="rf-hint">${hint}</small>` : ''}
    ${changed ? `<button class="rf-reset" data-action="rule-default" data-path="${path}" ${locked ? 'disabled' : ''}>${icon('reset', 12)} ${t('Default', 'Varsayılan')} ${shown(spec, def)}</button>` : ''}
  </div>`;
}

function numCell(path, label) {
  const R = rulesOf(getState().config), spec = fieldSpec(path), value = getPath(R, path), def = getPath(defaultRules(), path);
  const changed = value !== def, unit = UNIT()[spec.format];
  return `<span class="rt-cell ${changed ? 'changed' : ''}" ${changed ? `title="${t('Default', 'Varsayılan')}: ${shown(spec, def)}"` : ''}><input class="input" ${numberAttrs(spec, path, value, raceStarted())} aria-label="${esc(label)}${changed ? ` (${t('default', 'varsayılan')} ${shown(spec, def)})` : ''}">${unit ? `<em>${unit}</em>` : ''}</span>`;
}

function block(title, lead, body, { aside = '' } = {}) {
  return `<section class="rb">
    <header class="rb-head"><div><h2>${title}</h2>${lead ? `<p>${lead}</p>` : ''}</div>${aside}</header>
    ${body}
  </section>`;
}

const formula = parts => `<p class="rb-formula" aria-label="${t('Formula', 'Formül')}">${parts.map(p => (p.op ? `<i>${p.op}</i>` : `<span>${p}</span>`)).join('')}</p>`;
const insight = items => `<ul class="rb-insight">${items.map(x => `<li>${x}</li>`).join('')}</ul>`;

const RATIO_KEYS = ['profitFloor', 'profitTarget'];
function assumptionField(key, { hint = '' } = {}) {
  const s = getState(), a = localizedAssumption(s.config, key, getLang()), def = assumptionsFor(s.config.lang)[key].value, changed = a.value !== def, locked = raceStarted();
  const isPct = RATIO_KEYS.includes(key), k = isPct ? 100 : 1;
  const unit = isPct ? '%' : { EUR: '€', policies: t('policies', 'poliçe'), points: t('points', 'puan'), x: '×' }[a.unit] ?? '';
  const view = v => (isPct ? `${fmt(v * 100)}%` : a.unit === 'EUR' ? money(v, { exact: true }) : fmt(v, v % 1 ? 2 : 0));
  return `<div class="rf ${changed ? 'changed' : ''}">
    <label class="rf-label" for="as-${key}">${a.label}</label>
    <span class="rf-input"><input class="input" type="number" inputmode="decimal" id="as-${key}" data-assumption="${key}" data-scale="${k}" min="${Number((a.min * k).toFixed(4))}" max="${Number((a.max * k).toFixed(4))}" step="any" value="${Number((a.value * k).toFixed(4))}" ${locked ? 'disabled' : ''}>${unit ? `<em>${unit}</em>` : ''}</span>
    <small class="rf-hint">${hint || a.description}</small>
    ${changed ? `<button class="rf-reset" data-action="assumption-default" data-key="${key}" ${locked ? 'disabled' : ''}>${icon('reset', 12)} ${t('Default', 'Varsayılan')} ${view(def)}</button>` : ''}
  </div>`;
}

// Sample share of each level of a dimension.
function levelShares(dim) {
  const k = DIMENSIONS.indexOf(dim), out = [];
  let total = 0;
  for (const c of marketCells()) { out[c[k]] = (out[c[k]] || 0) + c[5]; total += c[5]; }
  return out.map(n => n / total);
}

// ——— Sections ———

function scoringSection(s, R) {
  const w = s.config.weights, total = w.reduce((a, b) => a + b, 0), locked = raceStarted();
  const n = Math.max(s.teams.length, 2), market = scaledMarket(s.config, n), a = s.config.assumptions, capital = a.capital.value;
  const WEIGHT_LABELS = weightLabels();
  return block(t('Score weights', 'Puan ağırlıkları'), t('The monthly score is a weighted average of three components. They must total 100%.', 'Aylık puan üç bileşenin ağırlıklı ortalamasıdır. Toplamları %100 olmalı.'), `
      <div class="weights">
        ${w.map((v, i) => `<label class="weight" style="--w:${Math.min(100, v)}%" for="weight-${i}"><span>${WEIGHT_LABELS[i]}</span><span class="weight-in"><input class="input" type="number" id="weight-${i}" data-weight="${i}" min="0" max="100" step="1" value="${v}" ${locked ? 'disabled' : ''}><em>%</em></span><i><b></b></i></label>`).join('')}
      </div>
      <div class="weights-foot ${total === 100 ? 'ok' : 'bad'}">
        <span>${total === 100 ? icon('check', 15) : icon('info', 15)} ${t('Total', 'Toplam')} <b class="num">${fmt(total)}%</b>${total === 100 ? '' : ` · ${t('the race can’t start like this', 'yarış bu şekilde başlayamaz')}`}</span>
        ${total === 100 ? '' : `<button class="btn sm" data-action="weights-normalize" ${locked ? 'disabled' : ''}>${t('Scale to 100%', '%100’e ölçekle')}</button>`}
      </div>`, { aside: `<span class="chip ${total === 100 ? 'ok' : 'bad'}">${fmt(total)}%</span>` })
    + block(t('Score thresholds', 'Puan eşikleri'), t('Each component is scored 0–100. The thresholds decide how many points a result earns.', 'Her bileşen 0–100 arası puanlanır. Eşikler bir sonucun kaç puan getireceğini belirler.'), `
      <div class="rf-grid">
        ${assumptionField('profitFloor', { hint: t(`At or below this at year end, 0 points (${money(a.profitFloor.value * capital, { signed: true })}).`, `Yıl sonunda bu orana eşit ya da altındaysa 0 puan (${money(a.profitFloor.value * capital, { signed: true })}).`) })}
        ${assumptionField('profitTarget', { hint: t(`Reaching this earns full points (${money(a.profitTarget.value * capital)} profit). During the year thresholds are pro-rated.`, `Buna ulaşmak tam puan getirir (${money(a.profitTarget.value * capital)} kâr). Yıl içinde eşikler geçen aylara oranlanır.`) })}
        ${assumptionField('shareTarget', { hint: t(`× a fair share. With ${n} teams now, ${pct(market.shareTarget)} premium share earns full points.`, `× adil pay. Şu an ${n} takımla ${pct(market.shareTarget)} prim payı tam puan getirir.`) })}
        ${assumptionField('serviceTarget')}
      </div>
      <label class="toggle-row rb-toggle"><input type="checkbox" data-rule-bool="capitalRule" ${R.capitalRule ? 'checked' : ''} ${locked ? 'disabled' : ''}><span><b>${t('Capital rule', 'Sermaye kuralı')}</b><small>${t('A company whose equity goes negative even once during the year drops to the bottom of the championship ranking.', 'Yıl içinde özkaynağı bir kez bile negatife düşen şirket, şampiyonluk sıralamasının en altına düşer.')}</small></span></label>
      ${insight([
        t(`${WEIGHT_LABELS[0]}: profit / capital ${pct(a.profitFloor.value, 0)} → 0 points, ${pct(a.profitTarget.value, 0)} → 100 points. At most <b>${fmt(w[0])} points</b>.`, `${WEIGHT_LABELS[0]}: kâr / sermaye ${pct(a.profitFloor.value, 0)} → 0 puan, ${pct(a.profitTarget.value, 0)} → 100 puan. En fazla <b>${fmt(w[0])} puan</b>.`),
        t(`${WEIGHT_LABELS[1]}: ${pct(market.shareTarget)} premium share among the teams earns full points. At most <b>${fmt(w[1])} points</b>.`, `${WEIGHT_LABELS[1]}: takımlar arasında ${pct(market.shareTarget)} prim payı tam puan getirir. En fazla <b>${fmt(w[1])} puan</b>.`),
        t(`${WEIGHT_LABELS[2]}: an average service score of ${fmt(a.serviceTarget.value)} earns full points. At most <b>${fmt(w[2])} points</b>.`, `${WEIGHT_LABELS[2]}: ${fmt(a.serviceTarget.value)} ortalama hizmet skoru tam puan getirir. En fazla <b>${fmt(w[2])} puan</b>.`)
      ])}`);
}

function marketSection(s) {
  const locked = raceStarted(), R = rulesOf(s.config), ref = referenceMarket(R, policiesOf(s.config)), m = cascoMoney(s.config);
  return block(t('Market size & money', 'Pazar büyüklüğü ve para'), t('The case-study data is a sample; set how many policies the whole market buys in a year. Its profile always matches the sample. Changing the size rescales capital, budget and costs in proportion.', 'Vaka verisi bir örneklemdir; tüm pazarın yılda kaç poliçe aldığını belirle. Profili her zaman örneklemle aynıdır. Büyüklüğü değiştirmek sermaye, bütçe ve giderleri orantılı ölçekler.'), `
      <div class="rf-grid">${MONEY_KEYS.map(k => assumptionField(k)).join('')}</div>
      ${insight([
        t(`At the market’s own prices the year is worth <b>${money(ref.gwp)}</b> of premium and <b>${money(ref.claims)}</b> of expected claims.`, `Piyasanın kendi fiyatlarıyla yıl <b>${money(ref.gwp)}</b> prim ve <b>${money(ref.claims)}</b> beklenen hasar eder.`),
        t(`A fair slice for one of ${6} teams is about ${money(m.slice)} of premium; the decision budget is ${pct(m.budget / m.slice)} of it.`, `${6} takımdan birinin adil payı yaklaşık ${money(m.slice)} primdir; karar bütçesi bunun ${pct(m.budget / m.slice)} kadarıdır.`)
      ])}`)
    + block(t('Competition', 'Rekabet'), t('Every customer can also buy from the rest of the market at its usual price.', 'Her müşteri piyasanın geri kalanından da alışıldık fiyatla alabilir.'), `
      <div class="rf-grid">
        ${ruleField('market.outside', t('Rest of the market’s pull', 'Piyasanın geri kalanının çekimi'), t('Higher: more customers stay with other insurers even when teams are cheap.', 'Yüksek: takımlar ucuz olsa bile daha çok müşteri diğer sigortacılarda kalır.'))}
        ${ruleField('market.seasonality', t('Seasonality', 'Mevsimsellik'), t('How much monthly demand swings through the year.', 'Aylık talebin yıl içinde ne kadar dalgalandığı.'))}
        ${ruleField('coef.min', t('Lowest coefficient', 'En düşük katsayı'))}
        ${ruleField('coef.max', t('Highest coefficient', 'En yüksek katsayı'))}
      </div>`)
    + block(t('Scenario & timing', 'Senaryo ve zamanlama'), t('As long as the seed stays the same, the same decisions produce the same result.', 'Tohum değeri aynı kaldıkça, aynı kararlar aynı sonucu üretir.'), `
      <div class="rf-grid">
        <div class="rf"><label class="rf-label" for="cfg-year">${t('Scenario year', 'Senaryo yılı')}</label><span class="rf-input"><input class="input" type="number" id="cfg-year" data-config="year" min="2000" max="2100" value="${s.config.year}" ${locked ? 'disabled' : ''}></span></div>
        <div class="rf"><label class="rf-label" for="cfg-seed">${t('Randomness seed', 'Rastgelelik tohumu')}</label><span class="rf-input"><input class="input" type="number" id="cfg-seed" data-config="seed" min="1" max="999999" value="${s.config.seed}" ${locked ? 'disabled' : ''}></span><small class="rf-hint">${t('Sets the claim draws and the demand wobble.', 'Hasar çekilişlerini ve talep dalgalanmasını belirler.')}</small></div>
        <div class="rf"><label class="rf-label" for="cfg-speed">${t('Time per month', 'Ay başına süre')}</label><span class="rf-input"><select class="select" id="cfg-speed" data-config="speed">${[3, 4, 6, 8, 12].map(n => `<option value="${n}" ${s.config.speed === n ? 'selected' : ''}>${t(`${n} seconds`, `${n} saniye`)}</option>`).join('')}</select></span><small class="rf-hint">${t('Can also change during the race.', 'Yarış sırasında da değiştirilebilir.')}</small></div>
      </div>`);
}

function claimsSection(s, R) {
  return block(t('Claims model', 'Hasar modeli'), t('From the case study’s model config. Every claim is drawn from these values; the sample’s own claim columns are not used.', 'Vaka çalışmasının model config’inden. Her hasar bu değerlerden çekilir; örneklemin kendi hasar sütunları kullanılmaz.'), `
      <div class="rf-grid">
        ${ruleField('model.frequency', t('Base frequency', 'Temel frekans'), t('Expected claims per policy per year.', 'Poliçe başına yıllık beklenen hasar adedi.'))}
        ${ruleField('model.severity', t('Base severity', 'Temel şiddet'), t('Mean cost of one claim.', 'Bir hasarın ortalama maliyeti.'))}
        ${ruleField('model.lossRatio', t('Market loss ratio', 'Piyasa hasar oranı'), t('The loss ratio the rest of the market prices at; sets its reference premiums.', 'Piyasanın geri kalanının fiyatladığı hasar oranı; referans primlerini belirler.'))}
        ${ruleField('model.gammaShape', t('Gamma shape', 'Gamma şekli'), t('Lower: more skewed claim amounts, bigger surprises.', 'Düşük: daha çarpık hasar tutarları, daha büyük sürprizler.'))}
      </div>
      ${formula([t('claims', 'hasar adedi'), { op: '~' }, 'Poisson(', t('frequency × coefficients', 'frekans × katsayılar'), ')', { op: '·' }, t('amount', 'tutar'), { op: '~' }, 'Gamma(', t('shape, severity × coefficients', 'şekil, şiddet × katsayılar'), ')'])}`);
}

function segmentsSection(s, R) {
  const tables = DIMENSIONS.map(dim => {
    const shares = levelShares(dim), isChannel = dim === 'channel';
    return `<h3 class="rs-sub">${dimensionName(dim, getLang())}</h3>
      <div class="rt-wrap"><table class="rt probe">
        <thead><tr><th scope="col">${t('Level', 'Seviye')}</th><th scope="col"><span>${t('In the sample', 'Örneklemde')}</span></th><th scope="col"><span>${t('Frequency', 'Frekans')}</span><small>${t('× base', '× temel')}</small></th><th scope="col"><span>${t('Severity', 'Şiddet')}</span><small>${t('× base', '× temel')}</small></th><th scope="col"><span>${t('Market premium', 'Piyasa primi')}</span><small>${t('× base', '× temel')}</small></th>${isChannel ? `<th scope="col"><span>${t('Expense ratio', 'Gider oranı')}</span></th>` : ''}<th scope="col"><span>${t('Market loss ratio', 'Piyasa hasar oranı')}</span><small>${t('LR × F × S ÷ P', 'HO × F × Ş ÷ P')}</small></th></tr></thead>
        <tbody>${R.dimensions[dim].map((lv, i) => {
          const lr = R.model.lossRatio * lv.freq * lv.sev / lv.prem;
          return `<tr><th scope="row"><b>${levelName(dim, i, getLang())}</b><small class="faint"> ${esc(lv.id)}</small></th>
            <td class="num">${pct(shares[i] || 0)}</td>
            <td>${numCell(`dimensions.${dim}.${i}.freq`, `${levelName(dim, i, getLang())} · ${t('frequency', 'frekans')}`)}</td>
            <td>${numCell(`dimensions.${dim}.${i}.sev`, `${levelName(dim, i, getLang())} · ${t('severity', 'şiddet')}`)}</td>
            <td>${numCell(`dimensions.${dim}.${i}.prem`, `${levelName(dim, i, getLang())} · ${t('premium', 'prim')}`)}</td>
            ${isChannel ? `<td>${numCell(`dimensions.channel.${i}.expense`, `${levelName(dim, i, getLang())} · ${t('expense', 'gider')}`)}</td>` : ''}
            <td class="num ${lr > R.model.lossRatio * 1.15 ? 'down' : lr < R.model.lossRatio * 0.85 ? 'up' : ''}">${pct(lr, 0)}</td></tr>`;
        }).join('')}</tbody>
      </table></div>`;
  }).join('');
  return block(t('Segment coefficients', 'Segment katsayıları'), t('The model config’s tables. A cell’s expected cost is the base frequency × severity times the coefficients of its five levels. Where the market’s premium coefficient lags the risk, the market loses money — a gap a sharp team can exploit.', 'Model config tabloları. Bir hücrenin beklenen maliyeti, temel frekans × şiddet çarpı beş seviyesinin katsayılarıdır. Piyasanın prim katsayısının riskin gerisinde kaldığı yerde piyasa zarar eder; keskin bir takım bu açığı kullanabilir.'), tables);
}

function behaviorSection(s, R) {
  return block(t('How customers buy', 'Müşteriler nasıl satın alır'), t('Hidden from the teams: they infer it from the data and the race. Price sensitivity is how sharply a persona reacts to a price above or below the market; service weight is how much it values claims service; channel loyalty is how much it needs visibility in its own channel.', 'Takımlardan gizlidir: veriden ve yarıştan çıkarırlar. Fiyat hassasiyeti, personanın piyasanın üstü ya da altındaki fiyata tepkisidir; hizmet ağırlığı hasar hizmetine verdiği önem; kanal sadakati ise kendi kanalındaki görünürlüğe ihtiyacıdır.'), `
      <div class="rt-wrap"><table class="rt probe">
        <thead><tr><th scope="col">${t('Persona', 'Persona')}</th><th scope="col"><span>${t('Price sensitivity', 'Fiyat hassasiyeti')}</span></th><th scope="col"><span>${t('Service weight', 'Hizmet ağırlığı')}</span></th><th scope="col"><span>${t('Channel loyalty', 'Kanal sadakati')}</span></th></tr></thead>
        <tbody>${R.behavior.map((_, i) => `<tr><th scope="row"><b>${levelName('persona', i, getLang())}</b></th>
          <td>${numCell(`behavior.${i}.price`, `${levelName('persona', i, getLang())} · ${t('price sensitivity', 'fiyat hassasiyeti')}`)}</td>
          <td>${numCell(`behavior.${i}.service`, `${levelName('persona', i, getLang())} · ${t('service weight', 'hizmet ağırlığı')}`)}</td>
          <td>${numCell(`behavior.${i}.channel`, `${levelName('persona', i, getLang())} · ${t('channel loyalty', 'kanal sadakati')}`)}</td></tr>`).join('')}</tbody>
      </table></div>
      <div class="rf-grid">${ruleField('commercialPrice', t('Commercial price sensitivity', 'Ticari fiyat hassasiyeti'), t('× the persona’s sensitivity for commercial customers.', 'Ticari müşteriler için personanın hassasiyetiyle çarpılır.'))}</div>
      ${formula([t('choice', 'tercih'), { op: '∝' }, `(${t('offer ÷ market price', 'teklif ÷ piyasa fiyatı')})`, '<sup>−' + t('sensitivity', 'hassasiyet') + '</sup>', { op: '×' }, t('channel visibility', 'kanal görünürlüğü'), '<sup>' + t('loyalty', 'sadakat') + '</sup>', { op: '×' }, t('service reputation', 'hizmet itibarı')])}`);
}

function operationsSection(s, R) {
  return block(t('Marketing', 'Pazarlama'), t('Marketing buys visibility in the channels a team focuses on, with diminishing returns.', 'Pazarlama, takımın odaklandığı kanallarda azalan getiriyle görünürlük sağlar.'), `
      <div class="rf-grid">
        ${ruleField('marketing.presence', t('Visibility without marketing', 'Pazarlamasız görünürlük'))}
        ${ruleField('marketing.strength', t('Marketing strength', 'Pazarlama gücü'))}
        ${ruleField('marketing.scale', t('Spend for a strong effect', 'Güçlü etki için harcama'), t('Share of a fair market slice; higher means marketing needs more money.', 'Adil pazar payının oranı; yüksekse pazarlama daha çok para ister.'))}
      </div>`)
    + block(t('Claims operations', 'Hasar operasyonu'), t('Claims operations buy handling capacity. Above the threshold, service slips; beyond full capacity, claims cost leaks.', 'Hasar operasyonu dosya kapasitesi sağlar. Eşiğin üstünde hizmet düşer; tam kapasitenin ötesinde hasar maliyeti kaçar.'), `
      <div class="rf-grid">
        ${ruleField('service.handling', t('Cost to handle one claim', 'Bir dosyanın yönetim maliyeti'), t('Share of the base severity.', 'Temel şiddetin oranı.'))}
        ${ruleField('service.threshold', t('Utilisation threshold', 'Kullanım eşiği'))}
        ${ruleField('service.slope', t('Service drop per overload', 'Aşırı yükte hizmet düşüşü'))}
        ${ruleField('service.floor', t('Lowest service score', 'En düşük hizmet skoru'))}
        ${ruleField('service.max', t('Highest service score', 'En yüksek hizmet skoru'))}
        ${ruleField('service.leakage', t('Cost leakage when overloaded', 'Aşırı yükte maliyet kaçağı'))}
        ${ruleField('service.reputation', t('Reputation effect on demand', 'İtibarın talebe etkisi'))}
      </div>`);
}

function reinsuranceSection(s, R) {
  const m = cascoMoney(s.config);
  return block(t('Quota-share treaty', 'Kota paylı anlaşma'), t('One treaty, the same fixed terms for every team. The fee is set in Market & money.', 'Tek anlaşma, her takıma aynı sabit şartlar. Bedeli Pazar ve para bölümünde ayarlanır.'), `
      <div class="rf-grid">
        ${ruleField('reinsurance.share', t('Share ceded', 'Devredilen pay'), t('Of every premium and every claim.', 'Her primin ve her hasarın.'))}
        ${ruleField('reinsurance.commission', t('Ceding commission', 'Reasürans komisyonu'), t('Paid back on the ceded premium.', 'Devredilen prim üzerinden geri ödenir.'))}
      </div>
      ${insight([t(`Buying it costs ${money(m.reinsuranceFee)} from the budget. It pays off when the book’s loss ratio runs above ${pct(1 - R.reinsurance.commission, 0)}.`, `Almanın bedeli bütçeden ${money(m.reinsuranceFee)}. Portföyün hasar oranı ${pct(1 - R.reinsurance.commission, 0)} üzerine çıkarsa kâra geçer.`)])}`);
}

function eventsSection(s) {
  const locked = raceStarted(), events = s.config.events.map((e, i) => ({ e: localizedEventText(e, s.config, getLang()), i })).sort((a, b) => a.e.month - b.e.month || a.i - b.i);
  const months = monthsOf(getLang()), scopes = eventScopesFor(getLang());
  const mult = (i, e, prop, label, hint) => `<div class="rf"><label class="rf-label" for="ev-${i}-${prop}">${label}</label><span class="rf-input"><input class="input" type="number" id="ev-${i}-${prop}" data-event="${i}" data-prop="${prop}" min="0.5" max="2" step="0.01" value="${e[prop] ?? 1}" ${locked ? 'disabled' : ''}><em>×</em></span><small class="rf-hint">${hint}</small></div>`;
  return block(t('Event calendar', 'Olay takvimi'), t('Events hit the segment in scope for as many months as they last. 1.00 is no effect.', 'Olaylar kapsamdaki segmenti sürdükleri ay boyunca etkiler. 1,00 etkisizdir.'), `
      <div class="ev-list">${events.length ? events.map(({ e, i }) => `<article class="ev-card">
        <header>
          <label class="ev-month"><span class="sr-only">${t('Month', 'Ay')}</span><select class="select" data-event="${i}" data-prop="month" id="ev-${i}-month" ${locked ? 'disabled' : ''}>${months.map((m, j) => `<option value="${j}" ${j === e.month ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
          <textarea class="input ev-title" data-event="${i}" data-prop="title" id="ev-${i}-title" maxlength="70" rows="1" aria-label="${t('Event title', 'Olay başlığı')}" ${locked ? 'disabled' : ''}>${esc(e.title)}</textarea>
          <button class="icon-btn" data-action="event-remove" data-index="${i}" aria-label="${t(`Delete event: ${esc(e.title)}`, `Olayı sil: ${esc(e.title)}`)}" title="${t('Delete event', 'Olayı sil')}" ${locked ? 'disabled' : ''}>${icon('x', 16)}</button>
        </header>
        <textarea class="input rt-area" data-event="${i}" data-prop="description" id="ev-${i}-description" maxlength="220" rows="2" aria-label="${t('The description shown on stage', 'Sahnede gösterilen açıklama')}" ${locked ? 'disabled' : ''}>${esc(e.description || '')}</textarea>
        <div class="rf-grid tight">
          <div class="rf"><label class="rf-label" for="ev-${i}-scope">${t('Hits', 'Etkilenen')}</label><span class="rf-input"><select class="select" data-event="${i}" data-prop="scope" id="ev-${i}-scope" ${locked ? 'disabled' : ''}>${scopes.map(x => `<option value="${x.id}" ${x.id === e.scope ? 'selected' : ''}>${x.name}</option>`).join('')}</select></span></div>
          <div class="rf"><label class="rf-label" for="ev-${i}-duration">${t('Lasts', 'Süre')}</label><span class="rf-input"><input class="input" type="number" id="ev-${i}-duration" data-event="${i}" data-prop="duration" min="1" max="12" step="1" value="${e.duration || 1}" ${locked ? 'disabled' : ''}><em>${t('mo', 'ay')}</em></span></div>
          ${mult(i, e, 'cost', t('Claims', 'Hasar'), t('Claims frequency in scope.', 'Kapsamdaki hasar sıklığı.'))}
          ${mult(i, e, 'demand', t('Demand', 'Talep'), t('Customers coming to market in scope.', 'Kapsamda pazara gelen müşteri.'))}
        </div>
      </article>`).join('') : `<p class="rb-empty">${t('No events on the calendar. The year goes by without surprises.', 'Takvimde olay yok. Yıl sürprizsiz geçer.')}</p>`}</div>
      <button class="btn ghost" data-action="event-add" ${locked || s.config.events.length >= 12 ? 'disabled' : ''}>${icon('plus', 16)} ${t('Add event', 'Olay ekle')}</button>`, { aside: `<span class="chip">${s.config.events.length} / 12</span>` });
}

// ——— Live preview: six sample approaches race with the current rules ———
let previewCache = { key: '', value: null };
function runPreview(config) {
  const list = sampleStrategies(config).map((st, i) => ({ id: i, name: st.id, color: TEAM_META[i].color, emblem: i, strategy: { ...st, product: st.id, sentence: st.id } }));
  const months = simulate(list, config);
  return { rows: rank(months[11].rows), list };
}
function preview(s) {
  const key = JSON.stringify([s.config.rules, s.config.assumptions, s.config.weights, s.config.events, s.config.seed, getLang()]);
  if (previewCache.key !== key) {
    let value;
    try { value = { now: runPreview(s.config), base: runPreview({ ...scenario(s.config.lang), assumptions: s.config.assumptions }) }; }
    catch (err) { value = { error: err.message }; }
    previewCache = { key, value };
  }
  return previewCache.value;
}
function previewPanel(s) {
  const p = preview(s);
  const body = p.error
    ? `<p class="rb-warn">${icon('info', 16)} ${t(`Couldn’t compute the preview: ${esc(p.error)}`, `Önizleme hesaplanamadı: ${esc(p.error)}`)}</p>`
    : (() => {
      const baseRank = Object.fromEntries(p.base.rows.map(r => [r.id, r.rank]));
      const top = p.now.rows[0].score, bottom = p.now.rows[p.now.rows.length - 1].score;
      const out = p.now.rows.filter(r => !r.eligible).length;
      return `<ol class="pv-list">${p.now.rows.map(r => {
          const t2 = p.now.list.find(x => x.id === r.id), moved = baseRank[r.id] - r.rank;
          return `<li class="${r.eligible ? '' : 'out'}" style="--team:${t2.color}">
            <span class="pv-rank num">${r.rank}</span>
            <span class="pv-name"><b>${ARCHETYPES[t2.name]?.name ?? esc(t2.name)}</b><small>${pct(r.share, 0)} ${t('share', 'pay')} · ${money(r.profit, { signed: true })} · ${t('LR', 'HO')} ${pct(r.lossRatio, 0)}</small></span>
            <span class="pv-score num">${fmt(r.score, 1)}${moved ? `<em class="${moved > 0 ? 'up' : 'down'}">${moved > 0 ? '▲' : '▼'}${Math.abs(moved)}</em>` : ''}</span>
            <i class="pv-bar"><b style="width:${Math.max(2, r.score)}%"></b></i>
          </li>`;
        }).join('')}</ol>
        <dl class="pv-stats">
          <div><dt>${t('1st–6th gap', '1.–6. fark')}</dt><dd class="num">${fmt(top - bottom, 1)} ${t('points', 'puan')}</dd></div>
          <div><dt>${t('Caught by the capital rule', 'Sermaye kuralına takılan')}</dt><dd class="num ${out ? 'down' : ''}">${out}</dd></div>
        </dl>`;
    })();
  return `<aside class="pv" aria-labelledby="pv-title">
    <header><p class="kicker amber">${t('Live', 'Canlı')}</p><h2 id="pv-title">${t('Balance preview', 'Denge önizlemesi')}</h2><p>${t('Six sample approaches play a year with the current rules. Arrows show the rank change versus the default rules.', 'Altı örnek yaklaşım mevcut kurallarla bir yıl oynar. Oklar varsayılan kurallara göre sıra değişimini gösterir.')}</p></header>
    ${body}
    <p class="pv-note">${t('The sample approaches aren’t teams’ real decisions; they show which approach the rules reward.', 'Örnek yaklaşımlar takımların gerçek kararları değildir; kuralların hangi yaklaşımı ödüllendirdiğini gösterir.')}</p>
    <a class="pv-link" href="#/rules?b=denge">${icon('scale', 15)} ${t('One season is luck. Run hundreds in the balance test', 'Tek sezon şans olabilir. Denge testinde yüzlercesini oynat')} ${icon('arrow', 14)}</a>
  </aside>`;
}

// ——— Page ———

export function rulesPage(sectionId) {
  const s = getState();
  if (getSession().role !== 'host') {
    return hostPage('rules', `<div class="rb-denied">${icon('lock', 28)}<h1 class="display">${t('The rule studio opens on the moderator’s device.', 'Kural stüdyosu yalnızca moderatörün cihazında açılır.')}</h1><p class="muted">${t('Open this page from the device that created the game.', 'Bu sayfayı oyunu oluşturan cihazdan aç.')}</p><a class="btn" href="#/stage">${icon('back', 16)} ${t('Back to stage', 'Sahneye dön')}</a></div>`);
  }
  const R = rulesOf(s.config), section = sectionOf(sectionId);
  const counts = SECTIONS.map(x => x.changes(s, R));
  const total = counts.reduce((a, b) => a + b, 0), locked = raceStarted();
  const bodies = { puanlama: scoringSection, pazar: marketSection, hasar: claimsSection, segmentler: segmentsSection, davranis: behaviorSection, operasyon: operationsSection, reasurans: reinsuranceSection, olaylar: eventsSection, denge: balanceSection };
  const actions = `
    <button class="btn ghost sm" data-action="rules-export">${icon('file', 15)} ${t('Download rules file', 'Kural dosyasını indir')}</button>
    <label class="btn ghost sm ${locked ? 'disabled' : ''}" title="${t('Upload a rules file', 'Kural dosyası yükle')}">${icon('arrow', 15)} ${t('Upload from file', 'Dosyadan yükle')}<input type="file" id="import-file" accept="application/json" hidden ${locked ? 'disabled' : ''}></label>
    <a class="btn go sm" href="#/stage">${t('Back to stage', 'Sahneye dön')} ${icon('arrow', 15)}</a>`;
  const content = `
    <div class="rs-head">
      <div><p class="kicker blue">${t('The game’s rules', 'Oyunun kuralları')}</p><h1 class="display">${t('Rule studio', 'Kural stüdyosu')}</h1>
        <p class="lead">${t('You decide how the casco market behaves and how results turn into points. Every change goes out to all devices instantly; it locks once the race starts.', 'Kasko pazarının nasıl davrandığına ve sonuçların nasıl puana dönüştüğüne sen karar verirsin. Her değişiklik anında tüm cihazlara yayılır; yarış başlayınca kilitlenir.')}</p></div>
      <div class="rs-status">
        <span class="chip ${total ? 'warn' : 'ok'}">${total ? t(`${total} setting${total === 1 ? '' : 's'} differ from default`, `${total} ayar varsayılandan farklı`) : t('Default rules', 'Varsayılan kurallar')}</span>
        ${total ? `<button class="btn ghost sm" data-action="rules-reset-all" ${locked ? 'disabled' : ''}>${icon('reset', 14)} ${t('Reset everything to default', 'Her şeyi varsayılana sıfırla')}</button>` : ''}
      </div>
    </div>
    <div class="rs ${WIDE.includes(section.id) ? 'solo' : ''}">
      <nav class="rs-nav" aria-label="${t('Rule sections', 'Kural bölümleri')}">
        ${SECTIONS.map((x, i) => `<a href="#/rules?b=${x.id}" class="${x.id === section.id ? 'on' : ''}" ${x.id === section.id ? 'aria-current="page"' : ''}>${icon(x.icon, 16)}<span>${x.name}</span>${counts[i] ? `<em class="num" title="${t(`${counts[i]} change${counts[i] === 1 ? '' : 's'}`, `${counts[i]} değişiklik`)}">${counts[i]}</em>` : ''}</a>`).join('')}
      </nav>
      <div class="rs-main">
        <div class="rs-section-head">
          <h2 class="display">${section.name}</h2>
          ${section.reset && counts[SECTIONS.indexOf(section)] ? `<button class="btn ghost sm" data-action="rules-reset-section" data-section="${section.id}" ${locked ? 'disabled' : ''}>${icon('reset', 14)} ${t('Reset this section to default', 'Bu bölümü varsayılana sıfırla')}</button>` : ''}
        </div>
        ${bodies[section.id](s, R)}
      </div>
      ${WIDE.includes(section.id) ? '' : previewPanel(s)}
    </div>`;
  return hostPage('rules', content, actions);
}

// The rules package: the whole scenario in a single file.
export function rulesPackage() {
  const s = getState();
  return { kind: 'insurers-league-rules', exportedAt: new Date().toISOString(), config: s.config, quiz: { questions: questionsOf(s) } };
}
