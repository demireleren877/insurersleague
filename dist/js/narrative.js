// Race narration: every string is derived from the engine's monthly results. Nothing is guessed.
// Chrome words (titles, connectives) are translated per-viewer via t(); segment/coverage/channel
// names come from localizeRules(), which shows each viewer's own language for any name the host
// never customized away from the room's default.
import { monthsOf, rank, localizedEventText, cascoMoney, bookProfile, strategyAt, levelName, offerName, campaignRules, campaignOf, rulesOf } from '../engine.js';
import { fmt, money, pct, points, lower } from './format.js';
import { t, getLang } from './i18n.js';

const MONTHS = () => monthsOf(getLang());

export const METRICS = {
  score: { id: 'score', get label() { return t('Total score', 'Toplam puan'); }, get title() { return t('Interim total score', 'Geçici toplam puan'); }, get finalTitle() { return t('Season total score', 'Sezon toplam puanı'); }, get unit() { return t('SCORE / 100', 'PUAN / 100'); }, gapUnit: '' },
  share: { id: 'share', get label() { return t('Market share', 'Pazar payı'); }, get title() { return t('Premium-based market share', 'Prime dayalı pazar payı'); }, get finalTitle() { return t('Premium-based market share', 'Prime dayalı pazar payı'); }, get unit() { return t('SIMULATED MARKET · %', 'SİMÜLASYON PAZARI · %'); }, get gapUnit() { return t(' pp', ' yp'); } },
  profit: { id: 'profit', get label() { return t('Technical profit', 'Teknik kâr'); }, get title() { return t('Cumulative technical profit', 'Kümülatif teknik kâr'); }, get finalTitle() { return t('Annual technical profit', 'Yıllık teknik kâr'); }, get unit() { return t('CURRENCY · CUMULATIVE', 'PARA BİRİMİ · KÜMÜLATİF'); }, gapUnit: '' }
};

export function metricText(metric, v) {
  if (metric === 'score') return fmt(v, 1);
  if (metric === 'share') return pct(v);
  return money(v, { signed: false });
}
export function gapText(metric, gap) {
  if (metric === 'score') return points(-gap, 1, true);
  if (metric === 'share') return `${points(-gap * 100, 1, true)}${t(' pp', ' yp')}`;
  return money(-gap, { signed: true });
}

const nameOf = (teams, id) => teams.find(t2 => t2.id === id)?.name ?? '';
const row = (month, id) => month.rows.find(r => r.id === id);

// A plan's approach, from its decisions alone. The key is stable across languages (session history
// stores it) and matches the balance test's approaches.
export function archetypeKey(s, config) {
  const money = cascoMoney(config), p = bookProfile(s, config);
  const near = Math.max(0.02, p.spread * 0.5);
  if (p.flatGap < near && p.dataGap > near) return 'flat';
  if (s.marketing >= money.budget * 0.75) return 'gifts';
  if (p.impliedLossRatio >= 0.72) return 'volume';
  if (p.impliedLossRatio <= 0.55) return 'margin';
  return p.dataGap <= near ? 'actuary' : 'custom';
}

export const ARCHETYPES = {
  actuary: { get name() { return t('Risk-based pricer', 'Riske göre fiyatlayan'); }, get text() { return t('Prices every segment close to its true risk.', 'Her segmenti gerçek riskine yakın fiyatlar.'); } },
  flat: { get name() { return t('One price for all', 'Herkese tek fiyat'); }, get text() { return t('Leaves the coefficients near 1 and ignores what the data says.', 'Katsayıları 1 civarında bırakır, verinin söylediğini dikkate almaz.'); } },
  volume: { get name() { return t('Volume hunter', 'Hacim avcısı'); }, get text() { return t('Cheap prices and loud marketing to win share fast.', 'Hızlı pay için ucuz fiyat ve yoğun pazarlama.'); } },
  margin: { get name() { return t('Selective margin', 'Seçici marj'); }, get text() { return t('Fewer but profitable policies; price discipline.', 'Az ama kârlı poliçe; fiyat disiplini.'); } },
  digital: { get name() { return t('Digital focus', 'Dijital odak'); }, get text() { return t('Puts marketing behind the cheapest channel.', 'Pazarlamayı en ucuz kanala yığar.'); } },
  gifts: { get name() { return t('Campaign-led', 'Kampanyacı'); }, get text() { return t('Spends most of the marketing budget to win customers through the digital campaign.', 'Pazarlama bütçesinin çoğunu dijital kampanyayla müşteri kazanmaya harcar.'); } },
  // Approaches from earlier versions, kept so saved sessions still read.
  service: { get name() { return t('Service first', 'Önce hizmet'); }, get text() { return t('Spent most of the budget on claims operations.', 'Bütçenin çoğunu hasar operasyonuna ayırdı.'); } },
  custom: { get name() { return t('Own read of the data', 'Kendi okuması'); }, get text() { return t('Prices segments on its own view, away from both the data and a flat tariff.', 'Segmentleri ne veriye ne düz tarifeye göre, kendi görüşüyle fiyatlar.'); } }
};

export function archetype(s, config) {
  const a = ARCHETYPES[archetypeKey(s, config)];
  return { name: a.name, text: a.text };
}

// Monthly broadcast digest for the live commentary: the month's events, the gross-premium race and the
// alarms worth saying out loud. Every line is read from the engine's rows; nothing is guessed.
export function monthDigest(results, m, teams, config) {
  const now = results[m];
  if (!now) return null;
  const prev = results[m - 1];
  const byGwp = rows => [...rows].sort((a, b) => b.gwp - a.gwp);
  const ranked = byGwp(now.rows), prevRanked = prev ? byGwp(prev.rows) : null;
  const items = [];
  const add = (type, icon, tone, weight, text, ids) => items.push({ type, icon, tone, weight, text, teams: ids });

  for (const e of now.events.filter(ev => ev.month === m)) {
    const shown = localizedEventText(e, config, getLang());
    add('event', 'bolt', 'event', 7, t(`Market flash: ${shown.title}. ${shown.description}`, `Piyasa flaşı: ${shown.title}. ${shown.description}`), []);
  }
  const lead = ranked[0];
  if (!prev) add('leader', 'flag', 'good', 5, t(`${nameOf(teams, lead.id)} opens the year on top: ${money(lead.gwp)} of gross premium in January.`, `${nameOf(teams, lead.id)} yılı önde açtı: ocakta ${money(lead.gwp)} brüt prim.`), [lead.id]);
  else if (prevRanked[0].id !== lead.id) add('leader', 'cup', 'good', 6, t(`${nameOf(teams, lead.id)} takes the gross-premium lead from ${nameOf(teams, prevRanked[0].id)}.`, `${nameOf(teams, lead.id)}, brüt primde liderliği ${nameOf(teams, prevRanked[0].id)} takımından aldı.`), [lead.id]);

  if (prev) {
    const topMonth = [...now.rows].sort((a, b) => b.monthGwp - a.monthGwp)[0];
    if (topMonth.id !== lead.id) add('sales', 'megaphone', 'neutral', 3, t(`${nameOf(teams, topMonth.id)} sold the most this month: ${money(topMonth.monthGwp)} written.`, `Ayın satış lideri ${nameOf(teams, topMonth.id)}: ${money(topMonth.monthGwp)} yazılan prim.`), [topMonth.id]);
  }

  for (const r of now.rows) {
    const before = prev && row(prev, r.id), name = nameOf(teams, r.id);
    if (r.monthGwp > 0 && r.monthLossRatio > 1)
      add('claims', 'shield', 'bad', 5 + Math.min(2, r.monthLossRatio - 1), t(`${name} paid out more than it earned this month: claims at ${pct(r.monthLossRatio, 0)} of premium.`, `${name} bu ay kazandığından fazla hasar ödedi: hasar/prim ${pct(r.monthLossRatio, 0)}.`), [r.id]);
    if (before && before.profit < 0 && r.profit >= 0)
      add('profit', 'up', 'good', 4, t(`${name} is back in profit: ${money(r.profit)} so far.`, `${name} kâra geçti: şimdiye kadar ${money(r.profit)}.`), [r.id]);
    if (before && before.profit >= 0 && r.profit < 0)
      add('profit', 'down', 'bad', 4, t(`${name} slips into a loss: ${money(r.profit)} so far.`, `${name} zarara düştü: şimdiye kadar ${money(r.profit)}.`), [r.id]);
    if (before && r.share - before.share >= 0.02)
      add('share', 'chart', 'good', 3, t(`${name} climbs from ${pct(before.share)} to ${pct(r.share)} market share.`, `${name} pazar payını ${pct(before.share)}’dan ${pct(r.share)}’a çıkardı.`), [r.id]);
  }

  // The digital campaign: the month's best haul, a gift budget that ran out, the frequency bonus kicking in.
  const lang = getLang(), K = campaignRules(rulesOf(config));
  const camp = now.rows.filter(r => r.campaign?.customers >= 1).sort((a, b) => b.campaign.customers - a.campaign.customers);
  if (camp[0]) {
    const best = [...(camp[0].campaign.gifts || [])].sort((a, b) => b.customers - a.customers)[0];
    const gift = best ? lower(offerName(best.id, lang)) : t('its gifts', 'hediyeleri');
    add('campaign', 'megaphone', 'good', 3, t(`${nameOf(teams, camp[0].id)}’s campaign won ${fmt(camp[0].campaign.customers)} new customers this month, most with the ${gift}.`, `${nameOf(teams, camp[0].id)} kampanyası bu ay ${fmt(camp[0].campaign.customers)} yeni müşteri kazandı; çoğu ${gift} ile.`), [camp[0].id]);
  }
  const capped = now.rows.filter(r => r.campaign && r.campaign.wanted > r.campaign.customers * 1.5 && r.campaign.wanted - r.campaign.customers >= 50).sort((a, b) => (b.campaign.wanted - b.campaign.customers) - (a.campaign.wanted - a.campaign.customers))[0];
  if (capped) add('gifts', 'coins', 'bad', 3, t(`${nameOf(teams, capped.id)} ran out of gifts: about ${fmt(capped.campaign.wanted - capped.campaign.customers)} interested customers walked away.`, `${nameOf(teams, capped.id)} hediyeleri tükendi: yaklaşık ${fmt(capped.campaign.wanted - capped.campaign.customers)} ilgili müşteri kaçtı.`), [capped.id]);
  const freqNow = now.rows[0]?.campaign?.frequency ?? 1, freqBefore = prev?.rows[0]?.campaign?.frequency ?? 1;
  if (freqNow > K.frequency && freqBefore <= K.frequency) add('frequency', 'eye', 'event', 4, t(`The target group now sees the ads ${fmt(freqNow, 1)} times on average: every campaign converts ${Math.round(K.frequencyBonus * 100)}% better.`, `Hedef kitle reklamları artık ortalama ${fmt(freqNow, 1)} kez görüyor: tüm kampanyaların dönüşümü %${Math.round(K.frequencyBonus * 100)} arttı.`), []);

  return {
    month: m, events: now.events, ranked,
    items: items.sort((a, b) => b.weight - a.weight).slice(0, 5),
    market: { monthGwp: now.monthGwp, newPolicies: now.rows.reduce((sum, r) => sum + r.newPolicies, 0), nonBuyerRate: now.available ? now.nonBuyers / now.available : 0, costIndex: now.costIndex, demandIndex: now.demandIndex }
  };
}

export function badges(results, teams) {
  const last = results[11], first = rank(results[0].rows), final = rank(last.rows);
  const top = key => [...last.rows].sort((a, b) => b[key] - a[key])[0];
  const comeback = final.map(r => ({ id: r.id, gain: first.find(x => x.id === r.id).rank - r.rank })).sort((a, b) => b.gain - a.gain)[0];
  return [
    { id: 'market', label: t('Market Leader', 'Pazar Lideri'), rule: t('Highest premium-based share', 'En yüksek prim bazlı pay'), team: top('share').id, value: pct(top('share').share) },
    { id: 'profit', label: t('Profit Master', 'Kârlılık Ustası'), rule: t('Highest technical profit', 'En yüksek teknik kâr'), team: top('profit').id, value: money(top('profit').profit) },
    { id: 'comeback', label: t('Biggest Comeback', 'En Güçlü Geri Dönüş'), rule: t('Most places gained since January', 'Ocak’tan bu yana en çok sıra kazanan'), team: comeback.gain > 0 ? comeback.id : null, value: comeback.gain > 0 ? t(`+${comeback.gain} places`, `+${comeback.gain} sıra`) : t('No one gained places', 'Sıra kazanan olmadı') }
  ];
}

export function debrief(team, results, config) {
  const s = strategyAt(team, 11), r = row(results[11], team.id);
  const lang = getLang(), p = bookProfile(s, config);
  const c = campaignOf(s), giftTop = c.weights.indexOf(Math.max(...c.weights)), gift = lower(offerName(campaignRules(rulesOf(config)).offers[giftTop]?.id, lang));
  const read = p.flatGap < 0.06 && p.dataGap > 0.12 ? t('a flat tariff', 'düz bir tarife') : p.dataGap <= 0.12 ? t('coefficients close to the true risk', 'gerçek riske yakın katsayılar') : t('its own view of the segments', 'segmentlere kendi bakışı');
  const chose = t(`Base premium €${fmt(s.basePremium, 2)} with ${read}; prices aimed at a ${pct(p.impliedLossRatio, 0)} loss ratio on the sample. ${money(s.marketing)} marketing, ${c.media}% of it on media; gifts led by the ${gift} (${c.weights[giftTop]}%).`,
    `${read} ile €${fmt(s.basePremium, 2)} baz prim; fiyatlar örneklemde ${pct(p.impliedLossRatio, 0)} hasar oranını hedefledi. ${money(s.marketing)} pazarlama, %${c.media}'i medyaya; hediyelerde öne çıkan ${gift} (%${c.weights[giftTop]}).`);
  const personaTop = r.segments.indexOf(Math.max(...r.segments)), channelTop = r.channels.indexOf(Math.max(...r.channels));
  const happened = t(`${fmt(r.policies)} policies, ${pct(r.share)} premium share, ${money(r.profit)} technical profit, ${pct(r.lossRatio)} loss ratio, ${fmt(r.campaign?.total ?? 0)} customers won by the campaign. The largest group in the book was ${lower(levelName('persona', personaTop, lang))} (${fmt(r.segments[personaTop] / r.policies * 100)}%), sold mostly through ${lower(levelName('channel', channelTop, lang))}.`,
    `${fmt(r.policies)} poliçe, ${pct(r.share)} prim payı, ${money(r.profit)} teknik kâr, ${pct(r.lossRatio)} hasar oranı, kampanyayla ${fmt(r.campaign?.total ?? 0)} müşteri. Portföyün en büyük grubu ${lower(levelName('persona', personaTop, lang))} (%${fmt(r.segments[personaTop] / r.policies * 100)}), çoğu ${lower(levelName('channel', channelTop, lang))} kanalından.`);
  let tradeoff;
  if (r.expectedLossRatio > p.impliedLossRatio + 0.08) tradeoff = { title: t('The risky customers chose you.', 'Riskli müşteri seni seçti.'), text: t(`On paper your prices aimed at ${pct(p.impliedLossRatio, 0)}, but the book you actually wrote was expected to run at ${pct(r.expectedLossRatio, 0)}: the segments you underpriced came to you, the ones you overpriced went elsewhere.`, `Kâğıt üstünde fiyatların ${pct(p.impliedLossRatio, 0)} hedefliyordu, ama gerçekte yazdığın portföyün beklenen hasar oranı ${pct(r.expectedLossRatio, 0)} oldu: ucuz fiyatladığın segmentler sana geldi, pahalı fiyatladıkların başka yere gitti.`) };
  else if (r.combinedRatio > 1) tradeoff = { title: t('The cost of growth outran margin.', 'Büyümenin maliyeti marjı aştı.'), text: t(`Every €100 of premium brought €${fmt(r.combinedRatio * 100)} of claims and expenses.`, `Her €100 prime karşı €${fmt(r.combinedRatio * 100)} hasar ve gider oluştu.`) };
  else if (r.share < 0.1) tradeoff = { title: t('Profit discipline, a narrow market.', 'Kâr disiplini, dar pazar.'), text: t(`The book made ${money(r.profit)}, but a ${pct(r.share)} share left you behind in the market-share race.`, `Portföy ${money(r.profit)} kazandırdı, ama ${pct(r.share)} pay seni pazar payı yarışında geride bıraktı.`) };
  else tradeoff = { title: t('Price and volume stayed in balance.', 'Fiyat ve hacim dengede kaldı.'), text: t(`A ${pct(r.share)} share and a ${pct(r.combinedRatio)} combined ratio: you grew and stayed profitable at once.`, `${pct(r.share)} pay ve ${pct(r.combinedRatio)} bileşik oran: hem büyüdün hem kârlı kaldın.`) };
  return { chose, happened, tradeoff };
}

export function rankHistory(results, metric = 'score') {
  return results.map(m => rank(m.rows, metric).map(r => ({ id: r.id, rank: r.rank, value: r[metric] })));
}
