import { getState, results, seasonDone } from '../store.js';
import { buildTeamAnalysis } from '../team-analysis.js';
import { attribution } from '../attribution.js?v=93';
import { icon, emblem } from '../ui.js';
import { esc, fmt, money, pct, points } from '../format.js';
import { t, getLang } from '../i18n.js';
import { DIMENSIONS, dimensionName, levelName, campaignOf, offerName, monthsOf, localizedEventTitle } from '../../engine.js';

export const TEAM_ANALYSIS_TABS = ['overview', 'monthly', 'campaign', 'plan', 'effects'];
const tabNames = () => [t('Overview', 'Genel analiz'), t('Monthly results', 'Aylık gelişim'), t('Campaign', 'Kampanya'), t('Pricing & plan', 'Fiyatlama ve plan'), t('Decision impact', 'Karar etkileri')];
const rate = (value, digits = 1) => Number.isFinite(value) ? pct(value, digits) : '—';
const amount = value => Number.isFinite(value) ? money(value) : '—';
const unitAmount = value => Number.isFinite(value) ? `€${fmt(value, 2)}` : '—';
const pp = value => Number.isFinite(value) ? `${points(value * 100, 2, true)} ${t('pp', 'yüzde puan')}` : '—';
const direction = value => value > 0 ? 'up' : value < 0 ? 'down' : '';
const readout = (label, value, note = '') => `<div><dt>${label}</dt><dd class="num">${value}</dd>${note ? `<small>${note}</small>` : ''}</div>`;
const sectionHead = (title, note = '') => `<header class="ta-section-head"><h3>${title}</h3>${note ? `<p>${note}</p>` : ''}</header>`;
const halfNames = () => [t('January–June', 'Ocak–Haziran'), t('July–December', 'Temmuz–Aralık')];

function profitBridge(a) {
  const r = a.totals;
  const lines = [
    [t('Gross premium', 'Brüt prim'), r.gwp, ''],
    [t('Claims', 'Hasar'), r.claims, 'cost'],
    [t('Channel commission', 'Kanal komisyonu'), r.commission, 'cost'],
    [t('Running costs', 'İşletme gideri'), r.running, 'cost'],
    [t('Marketing actually spent', 'Gerçekleşen pazarlama gideri'), r.marketing, 'cost'],
    [t('Technical profit / loss', 'Teknik kâr / zarar'), r.profit, `total ${direction(r.profit)}`]
  ];
  return `<section>${sectionHead(t('Where the premium went', 'Prim nereye gitti?'), t('Premium − claims − commission − running costs − marketing = technical profit.', 'Prim − hasar − komisyon − işletme gideri − pazarlama = teknik kâr.'))}
    <table class="ta-bridge"><caption class="sr-only">${t('Annual income and costs', 'Yıllık gelir ve giderler')}</caption><thead><tr><th scope="col">${t('Item', 'Kalem')}</th><th scope="col">${t('Amount', 'Tutar')}</th><th scope="col">${t('Of premium', 'Prime oranı')}</th></tr></thead><tbody>${lines.map(([label, value, cls]) => `<tr class="${cls}"><th scope="row">${label}</th><td class="num">${money(value, { exact: true })}</td><td class="num">${rate(r.gwp > 0 ? value / r.gwp : null)}</td></tr>`).join('')}</tbody></table>
  </section>`;
}

function overview(a) {
  const r = a.totals;
  const position = (rank, label) => t(`${label}: ${rank} of ${a.teamCount}`, `${label}: ${a.teamCount} takım içinde ${rank}.`);
  const claimsNote = a.claimsDeviation === null ? '' : Math.abs(a.claimsDeviation) < 0.5
    ? t('Realized claims match the model’s expected claims for the policies sold.', 'Gerçekleşen hasar, satılan poliçeler için modelin beklediği hasarla aynı.')
    : a.claimsDeviation > 0
      ? t(`Realized claims were ${money(a.claimsDeviation)} above expectation for the policies sold, including events.`, `Gerçekleşen hasar, olaylar dahil satılan poliçeler için beklenen tutarın ${money(a.claimsDeviation)} üzerinde.`)
      : t(`Realized claims were ${money(-a.claimsDeviation)} below expectation for the policies sold, including events.`, `Gerçekleşen hasar, olaylar dahil satılan poliçeler için beklenen tutarın ${money(-a.claimsDeviation)} altında.`);
  return `<div class="ta-overview">
    <div class="ta-awards">
      <section><span class="ta-rank num">${String(a.ranks.profit).padStart(2, '0')}</span><div><h3>${t('Profitability', 'Kârlılık')}</h3><strong class="num ${direction(r.profit)}">${money(r.profit)}</strong><p>${position(a.ranks.profit, t('Profit rank', 'Kâr sırası'))}${a.profitGap > 0 ? ` · ${t(`${money(a.profitGap)} behind the leader`, `Liderin ${money(a.profitGap)} gerisinde`)}` : ''}</p></div></section>
      <section><span class="ta-rank num">${String(a.ranks.share).padStart(2, '0')}</span><div><h3>${t('Market share', 'Pazar payı')}</h3><strong class="num">${pct(a.share)}</strong><p>${position(a.ranks.share, t('Premium-share rank', 'Prim payı sırası'))}${a.shareGap > 0 ? ` · ${t(`${fmt(a.shareGap * 100, 2)} pp behind the leader`, `Liderin ${fmt(a.shareGap * 100, 2)} yüzde puan gerisinde`)}` : ''}</p></div></section>
    </div>
    ${a.team.strategy?.product ? `<p class="ta-product"><b>${esc(a.team.strategy.product)}</b>${a.team.strategy.sentence ? `<span>${esc(a.team.strategy.sentence)}</span>` : ''}</p>` : ''}
    <dl class="ta-readouts">${readout(t('Gross premium', 'Brüt prim'), money(r.gwp))}${readout(t('Policies sold', 'Satılan poliçe'), fmt(r.policies), t(`${rate(a.policyShare)} of policies sold by teams`, `Takımların sattığı poliçelerin ${rate(a.policyShare)}’i`))}${readout(t('Average premium', 'Ortalama prim'), unitAmount(r.averagePremium), t(`Market: ${unitAmount(a.market.averagePremium)}`, `Pazar: ${unitAmount(a.market.averagePremium)}`))}${readout(t('Profit margin', 'Kâr marjı'), rate(r.margin), t(`Combined ratio: ${rate(r.combinedRatio)}`, `Bileşik oran: ${rate(r.combinedRatio)}`))}</dl>
    <div class="ta-columns">
      ${profitBridge(a)}
      <section>${sectionHead(t('The book’s claims experience', 'Portföyün hasar deneyimi'), t('Expected values include portfolio selection and market events. The difference from actual claims reflects simulated claim variability.', 'Beklenen değerler, kazanılan portföyü ve piyasa olaylarını içerir. Gerçekleşen hasarla fark, simülasyondaki rastlantısal hasar deneyimini yansıtır.'))}
        <dl class="ta-facts">${readout(t('Realized / expected loss ratio', 'Gerçekleşen / beklenen hasar oranı'), `${rate(r.lossRatio)} / ${rate(a.expectedLossRatio)}`)}${readout(t('Claims / expected claims', 'Hasar / beklenen hasar'), `${money(r.claims)} / ${amount(a.expectedClaims)}`)}${readout(t('Claim count', 'Hasar adedi'), fmt(r.claimCount))}${readout(t('Frequency / average claim', 'Frekans / ortalama hasar'), `${rate(r.frequency)} / ${unitAmount(r.severity)}`)}</dl>
        ${claimsNote ? `<p class="ta-finding">${claimsNote}</p>` : ''}
      </section>
    </div>
    <section>${sectionHead(t('Who bought the policies?', 'Poliçeleri kim aldı?'), t('Policy-count mix, compared with all policies sold by the teams. This is the book actually won, not the composition of the source sample.', 'Poliçe adedi dağılımı, tüm takımların sattığı poliçelerle karşılaştırılır. Bu, kaynak örneklemin dağılımı değil, gerçekten kazanılan portföydür.'))}
      <div class="ta-columns ta-portfolio">${a.portfolio.map(group => `<div><h4>${dimensionName(group.dimension, getLang())}</h4><table><thead><tr><th scope="col">${t('Segment', 'Segment')}</th><th scope="col">${t('Policies', 'Poliçe')}</th><th scope="col">${t('Team mix', 'Takım dağılımı')}</th><th scope="col">${t('Market mix', 'Pazar dağılımı')}</th></tr></thead><tbody>${group.levels.map(level => `<tr><th scope="row">${esc(levelName(group.dimension, level.level, getLang()))}</th><td class="num">${fmt(level.count)}</td><td class="num">${rate(level.share)}</td><td class="num">${rate(level.marketShare)}</td></tr>`).join('')}</tbody></table></div>`).join('')}</div>
    </section>
  </div>`;
}

function trend(values, label, format, zero = true) {
  const w = 640, h = 225, left = 76, right = 18, top = 25, bottom = 34;
  const low = Math.min(...values), high = Math.max(...values), padding = Math.max((high - low) * 0.15, 0.001);
  const lo = zero ? Math.min(0, low) : Math.max(0, low - padding), hi = zero ? Math.max(high, lo + 0.01) : Math.min(1, Math.max(high + padding, lo + 0.002)), span = hi - lo;
  const x = i => left + i / 11 * (w - left - right), y = value => top + (hi - value) / span * (h - top - bottom);
  const path = values.map((value, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)} ${y(value).toFixed(2)}`).join(' ');
  const ticks = [lo, (lo + hi) / 2, hi];
  return `<figure class="ta-trend"><figcaption><span>${label}</span><b class="num">${format(values.at(-1))}</b></figcaption><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}">
    ${ticks.map(value => `<line class="ta-chart-grid" x1="${left}" x2="${w - right}" y1="${y(value)}" y2="${y(value)}"/><text x="${left - 10}" y="${y(value) + 4}" text-anchor="end">${esc(format(value))}</text>`).join('')}
    <line class="ta-review-line" x1="${x(5.5)}" x2="${x(5.5)}" y1="${top}" y2="${h - bottom}"/>
    ${lo < 0 ? `<line class="ta-chart-zero" x1="${left}" x2="${w - right}" y1="${y(0)}" y2="${y(0)}"/>` : ''}
    <path class="ta-chart-line" d="${path}"/>${values.map((value, i) => `<circle class="ta-chart-dot" cx="${x(i)}" cy="${y(value)}" r="3"><title>${esc(monthsOf(getLang())[i])}: ${esc(format(value))}</title></circle>`).join('')}
    ${monthsOf(getLang()).map((month, i) => `<text x="${x(i)}" y="${h - 9}" text-anchor="middle">${esc(month.slice(0, 3))}</text>`).join('')}
  </svg></figure>`;
}

function monthly(a) {
  const m = monthsOf(getLang()), r = a.totals;
  return `<section>${sectionHead(t('Twelve months, two halves', 'On iki ay, iki yarıyıl'), t('The dashed line marks the June review. Premium share and cumulative profit are year to date; the other table columns are monthly.', 'Kesikli çizgi Haziran molasını gösterir. Prim payı ve birikimli kâr yıl başından itibaren hesaplanır; tablonun diğer sütunları aylıktır.'))}
    <div class="ta-trends">${trend(a.monthly.map(row => row.cumulativeProfit), t('Cumulative technical profit', 'Birikimli teknik kâr'), money)}${trend(a.monthly.map(row => row.share), t('Gross premium share', 'Brüt prim payı'), pct, false)}</div>
    <div class="table-wrap" tabindex="0" role="region" aria-label="${t('Monthly results table', 'Aylık sonuç tablosu')}"><table class="ta-months"><caption class="sr-only">${t('Monthly results for this team', 'Takımın aylık sonuçları')}</caption><thead><tr>${[t('Month', 'Ay'), t('Policies', 'Poliçe'), t('Premium', 'Prim'), t('Claims', 'Hasar'), t('Commission', 'Komisyon'), t('Running costs', 'İşletme gideri'), t('Marketing', 'Pazarlama'), t('Monthly profit', 'Aylık kâr'), t('Cumulative profit', 'Birikimli kâr'), t('Premium share', 'Prim payı')].map(label => `<th scope="col">${label}</th>`).join('')}</tr></thead>
      <tbody>${a.monthly.map(row => `<tr class="${row.month === 6 ? 'ta-half-start' : ''}"><th scope="row">${m[row.month]}</th>${['policies', 'gwp', 'claims', 'commission', 'running', 'marketing', 'profit', 'cumulativeProfit'].map(key => `<td class="num ${['profit', 'cumulativeProfit'].includes(key) ? direction(row[key]) : ''}">${key === 'policies' ? fmt(row[key]) : money(row[key])}</td>`).join('')}<td class="num">${pct(row.share)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><th scope="row">${t('Year', 'Yıl')}</th>${['policies', 'gwp', 'claims', 'commission', 'running', 'marketing', 'profit', 'profit'].map(key => `<td class="num">${key === 'policies' ? fmt(r[key]) : money(r[key])}</td>`).join('')}<td class="num">${pct(a.share)}</td></tr></tfoot>
    </table></div>
    <div class="ta-half-results">${a.halves.map((half, i) => `<section><h4>${halfNames()[i]}</h4><dl class="ta-facts">${readout(t('Technical profit', 'Teknik kâr'), money(half.profit))}${readout(t('Loss / combined ratio', 'Hasar / bileşik oran'), `${rate(half.lossRatio)} / ${rate(half.combinedRatio)}`)}${readout(t('Share of premiums written in this half', 'Bu yarıyılda yazılan primlerin payı'), rate(half.share))}</dl></section>`).join('')}</div>
  </section>`;
}

function campaign(a) {
  const c = a.campaign;
  if (!c.available) return `<p class="ta-empty">${t('This saved season has no campaign funnel details. Actual marketing costs are available in the overview and monthly results.', 'Bu kayıtlı sezonda kampanya hunisi ayrıntıları bulunmuyor. Gerçekleşen pazarlama giderleri genel analizde ve aylık sonuçlarda görülebilir.')}</p>`;
  const stats = [
    [t('Contacts bought', 'Satın alınan temas'), fmt(c.contacts)], [t('Monthly reach, summed', 'Aylık erişimlerin toplamı'), fmt(c.reach)],
    [t('Leads', 'İlgili müşteri'), fmt(c.leads)], [t('Customers won', 'Kazanılan müşteri'), fmt(c.customers)]
  ];
  return `<section>${sectionHead(t('What the campaign bought', 'Kampanya ne kazandırdı?'), t('Each half has its own cap. Only media purchased and gifts handed out are expensed; unspent money stays in profit and does not carry over.', 'Her yarıyılın ayrı bütçe sınırı var. Yalnızca satın alınan medya ve verilen hediyeler giderleşir; harcanmayan para kârda kalır ve sonraki yarıyıla devretmez.'))}
    <dl class="ta-readouts">${readout(t('Budget allocated', 'Ayrılan bütçe'), amount(c.allocated))}${readout(t('Actual campaign cost', 'Gerçekleşen kampanya gideri'), money(c.spend))}${readout(t('Allocated but unspent', 'Ayrılıp harcanmayan'), amount(c.unspent))}${readout(t('Cost per customer', 'Müşteri edinme maliyeti'), unitAmount(c.costPerCustomer), t(`${rate(c.policyShare)} of the team’s policies came from the campaign`, `Takımın poliçelerinin ${rate(c.policyShare)}’i kampanyadan geldi`))}</dl>
    ${c.spend === 0 ? `<p class="ta-empty">${t('The team bought no campaign activity this season. There are no campaign acquisition costs or customers.', 'Takım bu sezon kampanya harcaması yapmadı. Kampanya kaynaklı edinme maliyeti ve müşteri yok.')}</p>` : `<ol class="ta-funnel">${stats.map(([label, value]) => `<li><span>${label}</span><b class="num">${value}</b></li>`).join('')}</ol><p class="ta-caption">${t(`Distinct reach is ${rate(c.contactEfficiency)} of purchased contacts. Reach is added across months, so a person may appear in several months; it is not an annual unique-person count.`, `Tekil erişim, satın alınan temasların ${rate(c.contactEfficiency)}’i. Erişimler aylar boyunca toplanır; aynı kişi farklı aylarda yer alabileceği için bu, yıllık tekil kişi sayısı değildir.`)}</p>`}
    ${sectionHead(t('First half vs second half', 'İlk yarıyıl ve ikinci yarıyıl'))}<div class="table-wrap" tabindex="0" role="region" aria-label="${t('Half-year campaign results', 'Yarıyıl kampanya sonuçları')}"><table><thead><tr><th scope="col">${t('Period', 'Dönem')}</th>${[t('Allocated', 'Ayrılan'), t('Media spent', 'Medya gideri'), t('Gifts used', 'Hediye gideri'), t('Actual total', 'Gerçekleşen toplam'), t('Unspent', 'Harcanmayan'), t('Customers', 'Müşteri'), t('Cost / customer', 'Maliyet / müşteri')].map(label => `<th scope="col">${label}</th>`).join('')}</tr></thead><tbody>${a.halves.map((half, i) => `<tr><th scope="row">${halfNames()[i]}</th>${['allocated', 'media', 'giftsUsed', 'spend', 'unspent', 'customers', 'costPerCustomer'].map(key => `<td class="num">${key === 'customers' ? fmt(half.campaign[key]) : key === 'costPerCustomer' ? unitAmount(half.campaign[key]) : amount(half.campaign[key])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    ${sectionHead(t('Gift performance', 'Hediyelerin performansı'), t('Gift money is allocated by that month’s weights. Wanted customers above the gift cap cannot be acquired.', 'Hediye bütçesi, ilgili ayın ağırlıklarına göre ayrılır. Hediye sınırını aşan talep müşteriye dönüşmez.'))}
    <div class="table-wrap" tabindex="0" role="region" aria-label="${t('Gift performance', 'Hediyelerin performansı')}"><table><thead><tr>${[t('Gift', 'Hediye'), t('Gift budget', 'Hediye bütçesi'), t('Gift cost', 'Hediye gideri'), t('Customers won', 'Kazanılan müşteri'), t('Unmet demand', 'Karşılanamayan talep')].map(label => `<th scope="col">${label}</th>`).join('')}</tr></thead><tbody>${c.gifts.map(gift => `<tr><th scope="row">${esc(offerName(gift.id, getLang()))}</th><td class="num">${money(gift.budget)}</td><td class="num">${money(gift.spent)}</td><td class="num">${fmt(gift.customers)}</td><td class="num">${fmt(gift.missed)}</td></tr>`).join('')}</tbody></table></div>
    <p class="ta-caption">${t('Acquisition cost = actual media and gift costs ÷ campaign customers. It is not a measure of incremental profit.', 'Edinme maliyeti = gerçekleşen medya ve hediye giderleri ÷ kampanya müşterileri. İlave kârın ölçümü değildir.')}</p>
  </section>`;
}

function plan(a) {
  if (!a.planVisible) return `<p class="ta-empty">${t('The full plans are not available on this screen. The analysis uses the published results only.', 'Bu ekranda planların tamamı mevcut değil. Analiz, yalnızca yayınlanan sonuçları kullanır.')}</p>`;
  const [first, second] = a.halves, c = a.halves.map(half => campaignOf(half.plan));
  const rows = [
    [t('Base premium', 'Baz prim'), first.plan.basePremium, second.plan.basePremium, value => `€${fmt(value, 2)}`],
    [t('Half-year marketing allocation', 'Yarıyıl pazarlama bütçesi'), first.campaign.allocated, second.campaign.allocated, amount],
    [t('Media share', 'Medya payı'), c[0].media, c[1].media, value => `${fmt(value)}%`],
    [t('Loss ratio implied on the source sample', 'Kaynak örneklemde ima edilen hasar oranı'), first.profile.impliedLossRatio, second.profile.impliedLossRatio, rate],
    ...c[0].weights.map((weight, i) => [offerName(a.campaign.gifts[i].id, getLang()), weight, c[1].weights[i], value => `${fmt(value)}%`])
  ];
  return `<section>${sectionHead(t('The two plans actually applied', 'Uygulanan iki plan'), t('The first column applies through June, the second from July. Highlighted values changed. The implied loss ratio prices the whole source sample; it is not the loss ratio of the customers actually won.', 'İlk sütun Haziran sonuna kadar, ikinci sütun Temmuz’dan itibaren geçerlidir. Vurgulanan değerler değişmiştir. İma edilen hasar oranı kaynak örneklemin tamamına aittir; gerçekten kazanılan müşterilerin hasar oranı değildir.'))}
    <table class="ta-plan-summary"><thead><tr><th scope="col">${t('Decision', 'Karar')}</th><th scope="col">${halfNames()[0]}</th><th scope="col">${halfNames()[1]}</th></tr></thead><tbody>${rows.map(([label, one, two, format]) => `<tr><th scope="row">${esc(label)}</th><td class="num">${format(one)}</td><td class="num ${Math.abs(one - two) > 1e-8 ? 'ta-changed' : ''}">${format(two)}${Math.abs(one - two) > 1e-8 ? ` <span aria-label="${t('Changed', 'Değişti')}">✎</span>` : ''}</td></tr>`).join('')}</tbody></table>
    ${sectionHead(t('All 19 pricing coefficients', '19 fiyatlama katsayısının tamamı'))}
    <div class="ta-coefficients">${DIMENSIONS.map(dim => `<section><h4>${dimensionName(dim, getLang())}</h4><table><thead><tr><th scope="col">${t('Segment', 'Segment')}</th><th scope="col">${t('H1', '1. yarı')}</th><th scope="col">${t('H2', '2. yarı')}</th></tr></thead><tbody>${first.plan.coef[dim].map((value, i) => `<tr><th scope="row">${esc(levelName(dim, i, getLang()))}</th><td class="num">${fmt(value, 2)}</td><td class="num ${value !== second.plan.coef[dim][i] ? 'ta-changed' : ''}">${fmt(second.plan.coef[dim][i], 2)}${value !== second.plan.coef[dim][i] ? ' ✎' : ''}</td></tr>`).join('')}</tbody></table></section>`).join('')}</div>
  </section>`;
}

function effects(a, state) {
  const data = a.planVisible ? attribution(state.teams, state.config, a.team.id) : null;
  if (!data || Math.abs(data.profit - a.totals.profit) > 0.05 || Math.abs(data.share - a.share) > 1e-8) return `<p class="ta-empty">${t('Decision effects require all teams’ full plans and the original season rules. The saved result cannot be reproduced from the information available here.', 'Karar etkileri için tüm takımların tam planları ve sezonun özgün kuralları gerekir. Buradaki bilgilerle kayıtlı sonuç yeniden üretilemiyor.')}</p>`;
  const names = {
    basePremium: t('Base premium', 'Baz prim'), marketing: t('Both half-year marketing budgets', 'İki yarıyılın pazarlama bütçeleri'),
    mediaShare: t('Media share', 'Medya payı'), offers: t('Gift weights', 'Hediye ağırlıkları'),
    ...Object.fromEntries(DIMENSIONS.map(dim => [`coef.${dim}`, t(`${dimensionName(dim, getLang())} coefficients`, `${dimensionName(dim, getLang())} katsayıları`)]))
  };
  const table = (entries, label) => `<div class="table-wrap" tabindex="0" role="region" aria-label="${label}"><table class="ta-effects"><caption class="sr-only">${label}</caption><thead><tr><th scope="col">${t('Change tested', 'Sınanan değişiklik')}</th><th scope="col">${t('Profit contribution', 'Kâra katkı')}</th><th scope="col">${t('Premium-share contribution', 'Prim payına katkı')}</th></tr></thead><tbody>${entries.map(entry => `<tr><th scope="row">${esc(entry.label)}</th><td class="num ${direction(entry.profitDelta)}">${money(entry.profitDelta, { signed: true })}</td><td class="num ${direction(entry.shareDelta)}">${pp(entry.shareDelta)}</td></tr>`).join('')}</tbody></table></div>`;
  const decisions = data.decisions.map(entry => ({ ...entry, label: names[entry.key] || entry.key })).sort((x, y) => Math.abs(y.profitDelta) - Math.abs(x.profitDelta));
  const events = data.events.map(entry => ({ ...entry, label: `${monthsOf(getLang())[entry.month]} · ${localizedEventTitle(entry.title, state.config, getLang())}` })).sort((x, y) => Math.abs(y.profitDelta) - Math.abs(x.profitDelta));
  return `<section>${sectionHead(t('What did each decision contribute?', 'Her kararın katkısı ne oldu?'), t('The season is replayed under the same market conditions and random inputs, with one decision reset to its starting default across both halves. Contribution = the actual result minus that alternative result. Positive means this choice helped that criterion.', 'Sezon aynı piyasa koşulları ve rastlantısal girdilerle, iki yarıyıl boyunca tek bir karar başlangıç varsayımına döndürülerek yeniden hesaplanır. Katkı = gerçekleşen sonuç − alternatif sonuç. Pozitif değer, bu seçimin ilgili ölçüte katkı yaptığını gösterir.'))}
    ${decisions.length ? table(decisions, t('Decision contributions', 'Karar katkıları')) : `<p class="ta-empty">${t('The team kept the default decisions throughout the season.', 'Takım sezon boyunca başlangıç kararlarını korudu.')}</p>`}
    <p class="ta-caution">${icon('info', 17)} ${t('Each change is tested separately. Effects interact, so these contributions must not be added together. Market-share changes are percentage points, not percentage growth.', 'Her değişiklik ayrı sınanır. Etkiler birbiriyle etkileştiği için katkılar toplanamaz. Pazar payı farkları yüzde puandır; yüzdesel büyüme değildir.')}</p>
    ${sectionHead(t('The effect of market events', 'Piyasa olaylarının etkisi'), t('Each event is neutralised on its own, with the team’s plans left as applied. Contribution = actual result minus the result without that event.', 'Her olay tek başına etkisizleştirilir; takımların uyguladığı planlar korunur. Katkı = gerçekleşen sonuç − o olay olmadan oluşan sonuç.'))}
    ${events.length ? table(events, t('Event contributions', 'Olay katkıları')) : `<p class="ta-empty">${t('No market events were configured for this season.', 'Bu sezon için piyasa olayı tanımlanmamış.')}</p>`}
  </section>`;
}

export function renderTeamAnalysis(state, season, teamId, selected = 'overview') {
  const a = buildTeamAnalysis(state, season, teamId);
  if (!a) return { title: t('Team analysis', 'Takım analizi'), kind: 'modal team-analysis', body: `<p class="ta-empty">${t('Complete twelve-month results for this team are not available.', 'Bu takımın on iki aylık sonuçları henüz mevcut değil.')}</p>` };
  const active = TEAM_ANALYSIS_TABS.includes(selected) ? selected : 'overview';
  const panels = { overview, monthly, campaign, plan, effects: data => effects(data, state) };
  return {
    title: `<span class="ta-title" style="--team:${a.team.color}">${emblem(a.team, 'md')}<span>${esc(a.team.name)}<small>${t('Team analysis', 'Takım analizi')} · ${state.config.year}</small></span></span>`,
    kind: 'modal team-analysis',
    body: `<div class="ta-tabs" role="tablist" aria-label="${t('Analysis sections', 'Analiz bölümleri')}">${TEAM_ANALYSIS_TABS.map((id, i) => `<button type="button" role="tab" id="ta-tab-${id}" data-action="team-analysis-tab" data-tab="${id}" aria-selected="${id === active}" aria-controls="ta-panel" tabindex="${id === active ? '0' : '-1'}">${tabNames()[i]}</button>`).join('')}</div><div class="ta-panel" id="ta-panel" role="tabpanel" aria-labelledby="ta-tab-${active}" tabindex="0" style="--team:${a.team.color}">${panels[active](a)}</div>`
  };
}

export function teamAnalysisModal(teamId, tab) {
  return renderTeamAnalysis(getState(), seasonDone() ? results() : [], teamId, tab);
}
