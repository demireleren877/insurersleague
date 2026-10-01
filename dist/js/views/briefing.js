import { getState } from '../store.js';
import { icon } from '../ui.js';
import { money, pct, fmt, esc, lower } from '../format.js';
import { scaledMarket, localizeRules } from '../../engine.js';
import { quizModeName, quizMonths } from '../game.js';
import { t, getLang } from '../i18n.js';

const meter = (v, label) => `<span class="meter" aria-label="${label}: ${v}/5">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= v ? 'on' : ''}"></i>`).join('')}</span>`;

export const BRIEF_SECTIONS = () => [
  ['brief-resources', t('Resources', 'Kaynaklar')],
  ['brief-customers', t('Customers', 'Müşteriler')],
  ['brief-field', t('Playing field', 'Oyun alanı')],
  ['brief-score', t('Scoring', 'Puanlama')],
  ['brief-rules', t('Rules', 'Kurallar')]
];

export function briefingContent({ nav = false } = {}) {
  const s = getState(), a = s.config.assumptions, w = s.config.weights;
  const n = Math.max(2, s.teams.length), market = scaledMarket(s.config, n), rules = localizeRules(s.config, getLang());
  const sizeSum = rules.segments.reduce((sum, g) => sum + g.size, 0) || 1;
  const maxSens = Math.max(...rules.segments.map(g => g.priceSensitivity), 0.1), maxRisk = Math.max(...rules.segments.map(g => g.risk), 0.1);
  const priceSensitivityLabel = t('Price sensitivity', 'Fiyat hassasiyeti'), claimsCostLabel = t('Claims cost', 'Hasar maliyeti');
  return `<div class="brief-compact">
  ${nav ? `<nav class="brief-nav" aria-label="${t('Market brief sections', 'Pazar dosyası bölümleri')}">${BRIEF_SECTIONS().map(([id, label]) => `<button type="button" data-action="brief-jump" data-target="${id}">${label}</button>`).join('')}</nav>` : ''}
  <div class="dossier-stats" id="brief-resources">
    <div class="panel cut stat-tile"><p class="kicker">${t('Starting capital', 'Başlangıç sermayesi')}</p><strong class="num">${money(a.capital.value)}</strong><span>${t('Equal equity for every company', 'Her şirkete eşit özkaynak')}</span></div>
    <div class="panel cut stat-tile"><p class="kicker">${t('Decision budget', 'Karar bütçesi')}</p><strong class="num">${money(a.budget.value)}</strong><span>${t('Marketing + service investment', 'Pazarlama + hizmet yatırımı')}</span></div>
    <div class="panel cut stat-tile"><p class="kicker">${t('Shared customer pool', 'Ortak müşteri havuzu')}</p><strong class="num">${fmt(market.pool)}<small> / ${t('month', 'ay')}</small></strong><span>${t(`${n} teams · includes non-buyers`, `${n} takım · satın almayanlar dahil`)}</span></div>
    <div class="panel cut stat-tile"><p class="kicker">${t('Decision window', 'Karar süresi')}</p><strong class="num">${s.config.minutes}<small> ${t('min', 'dk')}</small></strong><span>${t('Decisions lock in once time runs out', 'Süre bitince kararlar kilitlenir')}</span></div>
  </div>

  <section class="dossier-block" id="brief-customers">
    <header><p class="kicker blue">${t('Customers', 'Müşteriler')}</p><h2 class="display">${t('Who are you racing for?', 'Kimin için yarışıyorsun?')}</h2></header>
    <div class="segment-cards">
      ${rules.segments.map(g => `<article class="panel segment-card">
        <div class="segment-size"><b class="num">${fmt(g.size / sizeSum * 100)}%</b><span>${t('pool share', 'havuz payı')}</span></div>
        <h3>${g.name}</h3>
        <p class="muted">${g.description}</p>
        <dl>
          <div><dt>${priceSensitivityLabel}</dt><dd>${meter(Math.max(1, Math.round(g.priceSensitivity / maxSens * 5)), priceSensitivityLabel)}</dd></div>
          <div><dt>${claimsCostLabel}</dt><dd>${meter(Math.max(1, Math.round(g.risk / maxRisk * 5)), claimsCostLabel)}</dd></div>
          <div><dt>${t('Strongest channel', 'Güçlü kanal')}</dt><dd>${rules.channels[g.channelFit.indexOf(Math.max(...g.channelFit))].name}</dd></div>
          <div><dt>${t('Reference premium', 'Referans prim')}</dt><dd class="num">${money(g.base, { exact: true })}</dd></div>
        </dl>
      </article>`).join('')}
    </div>
  </section>

  <section class="dossier-block two">
    <div id="brief-field">
      <header><p class="kicker blue">${t('Playing field', 'Oyun alanı')}</p><h2 class="display">${t('Regions and channels', 'Bölgeler ve kanallar')}</h2></header>
      <div class="panel list-panel">
        ${rules.regions.map(r => `<div class="list-row">${icon('pin', 18)}<b>${r.name}</b><span class="muted">${r.description}</span></div>`).join('')}
        ${rules.channels.map((c, i) => `<div class="list-row">${icon('megaphone', 18)}<b>${c.name}</b><span class="muted">${t(`Acquisition cost is ${fmt(c.cost * 100, 1)}% of premium${i ? ' × commission incentive' : ''}`, `Edinim gideri primin %${fmt(c.cost * 100, 1)}’i${i ? ' × komisyon teşviki' : ''}`)}</span></div>`).join('')}
        <div class="list-row">${icon('shield', 18)}<b>${t('Coverage packages', 'Teminat paketleri')}</b><span class="muted">${rules.coverages.map(c => t(`${c.name}: ${fmt(c.factor * 100)}% of reference`, `${c.name}: referansın %${fmt(c.factor * 100)}’i`)).join(' · ')}</span></div>
        <div class="list-row">${icon('chart', 18)}<b>${t('Cost outlook', 'Maliyet beklentisi')}</b><span class="muted">${t(`${pct(a.inflation.value)} monthly claims inflation. Events during the year are only announced in the month they hit.`, `Aylık ${pct(a.inflation.value)} hasar enflasyonu. Yıl içi olaylar yalnızca açıklandıkları ay duyurulur.`)}</span></div>
      </div>
    </div>
    <div id="brief-score">
      <header><p class="kicker amber">${t('Scoring', 'Puanlama')}</p><h2 class="display">${t('What decides the champion?', 'Şampiyonu ne belirler?')}</h2></header>
      <div class="panel score-rules">
        <div class="weight-bar">${[[t('Profitability', 'Kârlılık'), 'var(--comp-profit)'], [t('Market share', 'Pazar payı'), 'var(--comp-share)'], [t('Customer satisfaction', 'Müşteri memnuniyeti'), 'var(--comp-cx)']].map(([l, c], i) => `<i style="flex:${w[i]};background:${c}"><span>${l} ${w[i]}%</span></i>`).join('')}</div>
        <ul>
          <li><b>${t('Profitability', 'Kârlılık')}</b> ${t(`Technical profit / capital. ${pct(a.profitFloor.value)} → 0 points, ${pct(a.profitTarget.value)} → 100 points.`, `Teknik kâr / sermaye. ${pct(a.profitFloor.value)} → 0 puan, ${pct(a.profitTarget.value)} → 100 puan.`)}</li>
          <li><b>${t('Market share', 'Pazar payı')}</b> ${t(`Gross premium share at year end. 0% → 0 points, ${pct(market.shareTarget)} → 100 points (for ${n} teams).`, `Yıl sonu brüt prim payı. %0 → 0 puan, ${pct(market.shareTarget)} → 100 puan (${n} takım için).`)}</li>
          <li><b>${t('Customer satisfaction', 'Müşteri memnuniyeti')}</b> ${t(`Annual average service score. 0 → 0 points, ${fmt(a.serviceTarget.value)} → 100 points.`, `Yıllık ortalama hizmet skoru. 0 → 0 puan, ${fmt(a.serviceTarget.value)} → 100 puan.`)}</li>
          <li><b>${t('Interim ranking', 'Geçici sıralama')}</b> ${t('In the monthly score, profitability thresholds are pro-rated to the elapsed part of the year; December applies the full threshold.', 'Aylık puanda kârlılık eşikleri yılın geçen kısmına göre oranlanır; Aralık’ta tam eşik uygulanır.')}</li>
        </ul>
        <div class="rule-chips">
          ${rules.capitalRule ? `<span class="chip">${icon('x', 13)} ${t('A team whose equity goes negative can’t be champion', 'Özkaynağı negatife düşen şampiyon olamaz')}</span>` : ''}
          <span class="chip">${t('Ties broken by: technical profit → market share', 'Eşitlikte: teknik kâr → pazar payı')}</span>
        </div>
        <p class="kicker" style="margin-top:6px">${t('Badges (don’t change the score)', 'Rozetler (puanı değiştirmez)')}</p>
        <div class="rule-chips">${[t('Market Leader', 'Pazar Lideri'), t('Profit Master', 'Kârlılık Ustası'), t('Customer Champion', 'Müşteri Şampiyonu'), t('Biggest Comeback', 'En Güçlü Geri Dönüş')].map(b => `<span class="chip warn">${icon('cup', 13)} ${b}</span>`).join('')}</div>
      </div>
    </div>
  </section>

  <details class="panel rules" id="brief-rules" open>
    <summary>${icon('file', 17)} ${t('Submission and game rules', 'Teslim ve oyun kuralları')}</summary>
    <ul>
      <li>${t(`Price index ${rules.price.min}–${rules.price.max}. 100 = the chosen primary segment and coverage package’s annual reference premium.`, `Fiyat endeksi ${rules.price.min}–${rules.price.max}. 100 = seçilen ana segment ve teminat paketinin yıllık referans primi.`)}</li>
      <li>${t('Marketing and channel splits must total 100%; marketing + service investment can’t exceed the decision budget. The budget expenses evenly across the year, counted once.', 'Pazarlama ve kanal dağılımları %100 olmalı; pazarlama + hizmet yatırımı karar bütçesini aşamaz. Bütçe yıl boyunca eşit giderleşir, bir kez sayılır.')}</li>
      <li>${t('Target segment and channel splits are intent; the realized book forms in the shared market alongside your rivals.', 'Hedef segment ve kanal dağılımları niyettir; gerçekleşen portföy rakiplerle ortak pazarda oluşur.')}</li>
      <li>${t('Once the race starts, teams that haven’t locked in enter with their current decisions; out-of-range values are brought to the nearest valid one.', 'Yarış başladığında kilitlemeyen takımlar mevcut kararlarıyla yarışa girer; kural dışı değerler en yakın geçerli değere getirilir.')}</li>
      <li>${t('At the end of March, June and September, the race pauses for a two-minute strategy review. Teams may adjust targets, price, coverage, risk, marketing, service and reinsurance; changes apply from the next month.', 'Mart, Haziran ve Eylül sonunda yarış iki dakikalık strateji değerlendirmesi için durur. Takımlar hedef, fiyat, teminat, risk, pazarlama, hizmet ve reasürans kararlarını güncelleyebilir; değişiklikler sonraki aydan itibaren uygulanır.')}</li>
      <li>${t('The same event applies to every team in the same month; its impact varies with each team’s book.', 'Aynı olay bütün takımlara aynı ay uygulanır; etkinin büyüklüğü portföye göre değişir.')}</li>
    </ul>
  </details>
  ${quizMonths(s).length ? `<p class="note">${icon('target', 16)} <span><b>${t('Quiz rounds.', 'Bilgi turları.')}</b> ${t(`At the ${lower(quizModeName(s.quiz.mode, getLang()))}, the race pauses for a question. A fast, correct answer earns your team up to +${s.quiz.bonus} bonus points per question.`, `${lower(quizModeName(s.quiz.mode, getLang()))} yarış durur ve bir soru gelir. Hızlı ve doğru cevap, takımına soru başı +${s.quiz.bonus} puana kadar bonus kazandırır.`)}</span></p>` : ''}
  <p class="note">${icon('info', 16)} <span><b>${t('Scenario assumptions.', 'Senaryo varsayımları.')}</b> ${t(`The figures and events are for training purposes; they are not historical ${s.config.year} data. Market share reflects only the simulated market.`, `Sayılar ve olaylar eğitim amaçlıdır, tarihsel ${s.config.year} verisi değildir. Pazar payı yalnızca simülasyon pazarını gösterir.`)}</span></p>
  </div>`;
}
