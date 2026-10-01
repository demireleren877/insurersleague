// Quiz round question bank. correct: index of the right option (0–3).
// Options are shown on stage and on the phone with the same letter and accent color.
// The bank is bilingual: a session picks one language at creation (see game.js freshSession).
export const ANSWER_STYLES_EN = [
  { letter: 'A', name: 'Option A', color: '#43C6FF' },
  { letter: 'B', name: 'Option B', color: '#FFBE55' },
  { letter: 'C', name: 'Option C', color: '#AB98F8' },
  { letter: 'D', name: 'Option D', color: '#57D8B3' }
];
export const ANSWER_STYLES_TR = [
  { letter: 'A', name: 'A şıkkı', color: '#43C6FF' },
  { letter: 'B', name: 'B şıkkı', color: '#FFBE55' },
  { letter: 'C', name: 'C şıkkı', color: '#AB98F8' },
  { letter: 'D', name: 'D şıkkı', color: '#57D8B3' }
];
export const ANSWER_STYLES = ANSWER_STYLES_EN;

export const QUESTIONS_EN = [
  { id: 'q-combined', text: 'If the combined ratio is above 100%, what does that mean?', options: ['Claims and expenses exceed earned premium', 'Market share is growing fast', 'Reinsurance has kicked in', 'Service capacity is sufficient'], correct: 0, explain: 'Combined ratio = (claims + expenses) / earned premium. Above 100% means a technical loss.' },
  { id: 'q-deductible', text: 'What’s the typical result of raising the deductible?', options: ['Premium income doubles', 'Claims cost falls, the product becomes less appealing', 'The number of service cases rises', 'Reinsurance cost drops to zero'], correct: 1, explain: 'The customer absorbs small claims: the company’s claims and case load drop, and the product becomes less attractive to buyers.' },
  { id: 'q-upr', text: 'What is unearned premium?', options: ['A reserve for unpaid claims', 'Commission paid to an agent', 'The part of written premium whose risk period hasn’t passed yet', 'Premium that can’t be collected'], correct: 2, explain: 'An annual policy’s premium is earned month by month; the remaining part is held as a liability.' },
  { id: 'q-quota', text: 'In quota-share reinsurance, what does the insurer cede?', options: ['Only large claims', 'All marketing expenses', 'Only new policies', 'A fixed percentage of premium and claims'], correct: 3, explain: 'In quota-share, every policy’s premium and claims are shared at the same rate — 15% in this game.' },
  { id: 'q-cheap', text: 'What risk awaits a company growing on very low prices?', options: ['Attracting risky customers and a rising loss ratio', 'A falling market share', 'Service quality improving on its own', 'Capital growing fast'], correct: 0, explain: 'Cheap pricing brings volume but creates adverse selection: price-driven customers carry higher risk.' },
  { id: 'q-lossratio', text: 'How is the loss ratio calculated?', options: ['Written premium / number of policies', 'Realized claims / earned premium', 'Expenses / capital', 'Technical profit / market share'], correct: 1, explain: 'The loss ratio shows how much of earned premium goes to claims.' },
  { id: 'q-segment', text: 'Which customer segment is most price-sensitive in this scenario?', options: ['Premium owners', 'Families', 'Urban drivers', 'All equally sensitive'], correct: 2, explain: 'Urban drivers compare offers fast; a small price gap creates a large volume gap.' },
  { id: 'q-brand', text: 'How does the effect of brand investment change over time in this simulation?', options: ['Peaks immediately, then fades', 'It has no effect at all', 'It only lowers claims cost', 'It builds slowly, growing stronger in the second half of the year'], correct: 3, explain: 'Digital performance starts fast then fades; brand builds up month by month instead.' },
  { id: 'q-agency', text: 'What is the agent channel’s main disadvantage versus direct digital?', options: ['Higher acquisition cost', 'It brings in no customers at all', 'It zeroes out the loss ratio', 'It makes reinsurance mandatory'], correct: 0, explain: 'In this scenario, digital acquisition costs 5% of premium, agents 12%, brokers 15%.' },
  { id: 'q-capacity', text: 'What happens first when service capacity is exceeded?', options: ['Market share rises', 'Claim files pile up and satisfaction drops', 'Premiums rise on their own', 'Capital grows'], correct: 1, explain: 'As open cases exceed capacity, the service score drops, delays raise claims cost, and reputation slows sales.' },
  { id: 'q-technical', text: 'Which of these is NOT part of technical profit?', options: ['Realized claims', 'Acquisition expenses', 'Investment income', 'Earned premium'], correct: 2, explain: 'Technical profit is the result of the insurance operation itself: earned premium minus claims minus expenses. Investment income isn’t included.' },
  { id: 'q-selective', text: 'What’s the expected result of selective risk acceptance?', options: ['More policies, higher claims', 'Rising commissions', 'Rising total demand', 'Fewer but more profitable policies'], correct: 3, explain: 'Turning away risky profiles lowers volume but improves the portfolio’s loss ratio.' },
  { id: 'q-inflation', text: 'If claims inflation rises while price stays flat, what happens?', options: ['Margin erodes', 'The loss ratio falls', 'Market share rises automatically', 'Nothing changes'], correct: 0, explain: 'The same premium now pays for a costlier claim; the loss ratio and combined ratio both rise.' },
  { id: 'q-share', text: 'What is market share based on in this game?', options: ['Number of policies', 'Gross written premium', 'Technical profit', 'Service score'], correct: 1, explain: 'Market share = a team’s gross written premium / the simulated market’s total premium. Unit-based share is also shown separately.' },
  { id: 'q-wide', text: 'What effect does wide cover have in the premium segment?', options: ['It lowers demand', 'It lowers claims cost', 'It raises both demand and claims cost', 'It has no effect at all'], correct: 2, explain: 'Premium customers value coverage; replacement vehicle and minor repair also raise claims cost.' },
  { id: 'q-dac', text: 'Why is deferred acquisition cost (DAC) used?', options: ['To push claims into next year', 'To avoid taxes', 'To artificially inflate capital', 'To expense commission in the same period as the matching premium'], correct: 3, explain: 'Commission is paid upfront but premium is earned across the year; the expense is spread to match it.' }
];

export const QUESTIONS_TR = [
  { id: 'q-combined', text: 'Bileşik oran %100’ün üzerindeyse bu ne anlama gelir?', options: ['Hasar ve giderler kazanılan primi aşıyor', 'Pazar payı hızla büyüyor', 'Reasürans devreye girdi', 'Hizmet kapasitesi yeterli'], correct: 0, explain: 'Bileşik oran = (hasar + gider) / kazanılmış prim. %100 üzeri teknik zarar demektir.' },
  { id: 'q-deductible', text: 'Muafiyet tutarı artırılınca şirket için tipik sonuç nedir?', options: ['Prim geliri iki katına çıkar', 'Hasar maliyeti düşer, ürün çekiciliği azalır', 'Hizmet dosyası sayısı artar', 'Reasürans maliyeti sıfırlanır'], correct: 1, explain: 'Küçük hasarları müşteri üstlenir: şirketin hasar ve dosya yükü azalır, ürün müşteri için daha az cazip olur.' },
  { id: 'q-upr', text: 'Kazanılmamış prim nedir?', options: ['Ödenmemiş hasar karşılığı', 'Acenteye ödenen komisyon', 'Yazılan primin risk süresi henüz geçmemiş kısmı', 'Tahsil edilemeyen prim'], correct: 2, explain: 'Yıllık poliçenin primi ay ay kazanılır; kalan kısım yükümlülük olarak tutulur.' },
  { id: 'q-quota', text: 'Kotpar reasüransta sigorta şirketi neyi devreder?', options: ['Yalnızca büyük hasarları', 'Tüm pazarlama giderlerini', 'Sadece yeni poliçeleri', 'Prim ve hasarın sabit bir yüzdesini'], correct: 3, explain: 'Kotparda her poliçenin primi ve hasarı aynı oranda paylaşılır; bu oyunda %15.' },
  { id: 'q-cheap', text: 'Çok düşük fiyatla büyüyen bir şirketi hangi risk bekler?', options: ['Riskli müşteriyi çekip hasar oranının yükselmesi', 'Pazar payının düşmesi', 'Hizmet kalitesinin kendiliğinden artması', 'Sermayenin hızla büyümesi'], correct: 0, explain: 'Ucuz fiyat hacim getirir ama ters seçim yaratır: fiyat odaklı müşterinin riski daha yüksektir.' },
  { id: 'q-lossratio', text: 'Hasar oranı nasıl hesaplanır?', options: ['Yazılan prim / poliçe adedi', 'Gerçekleşen hasar / kazanılmış prim', 'Giderler / sermaye', 'Teknik kâr / pazar payı'], correct: 1, explain: 'Hasar oranı, kazanılmış primin ne kadarının hasara gittiğini gösterir.' },
  { id: 'q-segment', text: 'Bu senaryoda fiyata en duyarlı müşteri segmenti hangisi?', options: ['Premium araç sahipleri', 'Aileler', 'Şehirli sürücüler', 'Hepsi eşit duyarlı'], correct: 2, explain: 'Şehirli sürücüler teklifleri hızla karşılaştırır; küçük fiyat farkı büyük hacim farkı yaratır.' },
  { id: 'q-brand', text: 'Bu simülasyonda marka yatırımının etkisi zamanla nasıl değişir?', options: ['Hemen zirve yapar, sonra yorulur', 'Hiç etkisi yoktur', 'Sadece hasar maliyetini düşürür', 'Yavaş birikir, yılın ikinci yarısında güçlenir'], correct: 3, explain: 'Dijital performans hızlı başlayıp yorulur; marka ise ay ay birikir.' },
  { id: 'q-agency', text: 'Acente kanalının direkt dijitale göre temel dezavantajı nedir?', options: ['Daha yüksek edinim maliyeti', 'Hiç müşteri getirmemesi', 'Hasar oranını sıfırlaması', 'Reasüransı zorunlu kılması'], correct: 0, explain: 'Senaryoda dijital edinim primin %5’i, acente %12’si, broker %15’i.' },
  { id: 'q-capacity', text: 'Hizmet kapasitesi aşıldığında ilk ne olur?', options: ['Pazar payı artar', 'Hasar dosyaları birikir, memnuniyet düşer', 'Primler kendiliğinden artar', 'Sermaye büyür'], correct: 1, explain: 'Açık dosya kapasiteyi aştıkça hizmet skoru düşer, gecikme hasar maliyetini artırır, itibar satışları yavaşlatır.' },
  { id: 'q-technical', text: 'Teknik kâr aşağıdakilerden hangisini içermez?', options: ['Gerçekleşen hasarları', 'Edinim giderlerini', 'Yatırım gelirini', 'Kazanılmış primi'], correct: 2, explain: 'Teknik kâr sigortacılık faaliyetinin sonucudur: kazanılmış prim − hasar − gider. Yatırım geliri dahil değildir.' },
  { id: 'q-selective', text: 'Seçici risk kabulünün beklenen sonucu hangisi?', options: ['Daha çok poliçe, daha yüksek hasar', 'Komisyonların artması', 'Toplam talebin artması', 'Daha az ama daha kârlı poliçe'], correct: 3, explain: 'Riskli profilleri reddetmek hacmi düşürür, portföyün hasar oranını iyileştirir.' },
  { id: 'q-inflation', text: 'Hasar enflasyonu yükselirken fiyat sabit kalırsa ne olur?', options: ['Marj erir', 'Hasar oranı düşer', 'Pazar payı otomatik artar', 'Hiçbir şey değişmez'], correct: 0, explain: 'Aynı prime karşı daha pahalı hasar ödenir; hasar ve bileşik oran yükselir.' },
  { id: 'q-share', text: 'Bu oyunda pazar payı neye göre hesaplanır?', options: ['Poliçe adedine', 'Brüt yazılan prime', 'Teknik kâra', 'Hizmet skoruna'], correct: 1, explain: 'Pazar payı = takımın brüt yazılan primi / simülasyon pazarının toplam primi. Adet bazlı pay ayrıca gösterilir.' },
  { id: 'q-wide', text: 'Geniş kapsamın premium segmentteki etkisi nedir?', options: ['Talebi düşürür', 'Hasar maliyetini düşürür', 'Talebi de hasar maliyetini de artırır', 'Hiç etkilemez'], correct: 2, explain: 'Premium müşteri kapsama değer verir; ikame araç ve mini onarım hasar maliyetini de büyütür.' },
  { id: 'q-dac', text: 'Ertelenmiş edinim gideri (DAC) neden kullanılır?', options: ['Hasarı sonraki yıla ertelemek için', 'Vergiden kaçınmak için', 'Sermayeyi yapay olarak artırmak için', 'Komisyonu primle aynı dönemde giderleştirmek için'], correct: 3, explain: 'Komisyon peşin ödenir ama prim yıl boyunca kazanılır; eşleştirme için gider de dağıtılır.' }
];

// Most of the bank is insurance fundamentals and reads the same in any line of business. These few
// questions name the scenario's own segments, covers and channel costs, so each preset replaces them.
const OVERRIDES = {
  home: {
    en: {
      'q-segment': { text: 'Which customer segment is most price-sensitive in this scenario?', options: ['High-value homes', 'Mortgaged homeowners', 'Apartment residents', 'All equally sensitive'], correct: 2, explain: 'Apartment residents renew online and compare quotes first; a small price gap moves a lot of volume.' },
      'q-agency': { explain: 'In this scenario digital acquisition costs 4% of premium, agents 11%, the bank branch 17%.' },
      'q-wide': { text: 'What effect does all-risk cover have in high-value homes?', options: ['It lowers demand', 'It lowers claims cost', 'It raises both demand and claims cost', 'It has no effect at all'], correct: 2, explain: 'High-value owners want contents and liability included; those covers also raise claim severity.' }
    },
    tr: {
      'q-segment': { text: 'Bu senaryoda fiyata en duyarlı müşteri segmenti hangisi?', options: ['Yüksek değerli konutlar', 'Konut kredili ev sahipleri', 'Apartman sakinleri', 'Hepsi eşit duyarlı'], correct: 2, explain: 'Apartman sakinleri yenilemeyi internetten yapar ve önce teklif karşılaştırır; küçük fiyat farkı büyük hacim taşır.' },
      'q-agency': { explain: 'Senaryoda dijital edinim primin %4’ü, acente %11’i, banka şubesi %17’si.' },
      'q-wide': { text: 'Tüm riskler teminatının yüksek değerli konutlardaki etkisi nedir?', options: ['Talebi düşürür', 'Hasar maliyetini düşürür', 'Talebi de hasar maliyetini de artırır', 'Hiç etkilemez'], correct: 2, explain: 'Yüksek değerli konut sahibi eşya ve sorumluluğun da kapsanmasını ister; bu teminatlar hasar tutarını da büyütür.' }
    }
  },
  health: {
    en: {
      'q-deductible': { text: 'What’s the typical result of raising the co-payment?', options: ['Premium income doubles', 'Claims cost falls, the product becomes less appealing', 'The number of service cases rises', 'Reinsurance cost drops to zero'], correct: 1, explain: 'The member absorbs part of each visit: claims and case load drop, and the product becomes less attractive to buyers.' },
      'q-segment': { text: 'Which customer segment is most price-sensitive in this scenario?', options: ['Over-50s', 'Families with children', 'Young professionals', 'All equally sensitive'], correct: 2, explain: 'Young members buy online and switch on price; a small premium gap moves a lot of volume.' },
      'q-agency': { explain: 'In this scenario digital acquisition costs 6% of premium, agents 13%, corporate brokers 16%.' },
      'q-wide': { text: 'What effect does comprehensive cover have in the over-50 segment?', options: ['It lowers demand', 'It lowers claims cost', 'It raises both demand and claims cost', 'It has no effect at all'], correct: 2, explain: 'Older members value dental, optical and check-up cover; those benefits also raise claims cost and case load.' }
    },
    tr: {
      'q-deductible': { text: 'Katılım payı artırılınca şirket için tipik sonuç nedir?', options: ['Prim geliri iki katına çıkar', 'Hasar maliyeti düşer, ürün çekiciliği azalır', 'Hizmet dosyası sayısı artar', 'Reasürans maliyeti sıfırlanır'], correct: 1, explain: 'Her başvurunun bir kısmını üye üstlenir: hasar ve dosya yükü azalır, ürün müşteri için daha az cazip olur.' },
      'q-segment': { text: 'Bu senaryoda fiyata en duyarlı müşteri segmenti hangisi?', options: ['50 yaş üstü', 'Çocuklu aileler', 'Genç profesyoneller', 'Hepsi eşit duyarlı'], correct: 2, explain: 'Genç üyeler internetten alır ve fiyata göre şirket değiştirir; küçük prim farkı büyük hacim taşır.' },
      'q-agency': { explain: 'Senaryoda dijital edinim primin %6’sı, acente %13’ü, kurumsal broker %16’sı.' },
      'q-wide': { text: 'Kapsamlı teminatın 50 yaş üstü segmentteki etkisi nedir?', options: ['Talebi düşürür', 'Hasar maliyetini düşürür', 'Talebi de hasar maliyetini de artırır', 'Hiç etkilemez'], correct: 2, explain: 'Yaşı ileri üye diş, göz ve check-up teminatına değer verir; bu haklar hasar maliyetini ve dosya yükünü de büyütür.' }
    }
  }
};

export const QUESTIONS = QUESTIONS_EN;
export function questionsFor(lang, preset = 'motor') {
  const base = lang === 'tr' ? QUESTIONS_TR : QUESTIONS_EN;
  const patch = OVERRIDES[preset]?.[lang === 'tr' ? 'tr' : 'en'];
  if (!patch) return base;
  return base.map(q => (patch[q.id] ? { ...q, ...patch[q.id] } : q));
}
export const answerStylesFor = lang => (lang === 'tr' ? ANSWER_STYLES_TR : ANSWER_STYLES_EN);
export const questionById = (id, lang = 'en', preset = 'motor') => questionsFor(lang, preset).find(q => q.id === id) || QUESTIONS.find(q => q.id === id);

// A quiz round's question is fixed in the room's own language at creation, same as segment/coverage
// names. If the host never edited a default bank question, swap it to the viewer's own language for
// display; a question the host wrote or edited has no known translation and is shown as stored.
// Before a round is revealed, the anti-cheat player view strips `correct`/`explain` from the question
// (see game.js viewFor) — so only compare/translate fields that are actually present on `q`.
export function localizedQuestion(q, ownLang, viewerLang, preset = 'motor') {
  if (!q || !ownLang || ownLang === viewerLang) return q;
  const own = questionsFor(ownLang, preset).find(x => x.id === q.id), target = questionsFor(viewerLang, preset).find(x => x.id === q.id);
  if (!own || !target) return q;
  if (q.text !== own.text || q.options.some((o, i) => o !== own.options[i])) return q;
  if ('explain' in q && q.explain !== own.explain) return q;
  const out = { ...q, text: target.text, options: [...target.options] };
  if ('explain' in q) out.explain = target.explain;
  return out;
}
