// Rule studio → Balance test: the six Jev profiles play hundreds of seasons under the current
// rules, then the same under this line's default rules and every line's defaults, so the
// moderator can see whether one approach always wins.
import { icon } from '../ui.js';
import { esc, fmt, pct } from '../format.js';
import { scenario, TEAM_META } from '../../engine.js';
import { playSeason, emptyTally, tallySeason, summarize, FAIR_SHARE, DOMINANT, APPROACHES } from '../balance.js';
import { ARCHETYPES } from '../narrative.js';
import { t, getLang } from '../i18n.js';

export const balanceState = { seasons: 100, running: false, done: 0, total: 0, key: '', result: null, base: null, branches: null, error: '' };

export const balanceKey = config => JSON.stringify([config.rules, config.assumptions, config.weights, config.events, config.preset]);

const CHUNK = 25;
const tick = () => new Promise(resolve => setTimeout(resolve));

export async function runBalanceTest(config, onChange) {
  const b = balanceState;
  if (b.running) return;
  const seasons = b.seasons;
  const jobs = [
    { id: 'now', config: structuredClone(config) },
    { id: 'base', config: { ...scenario(config.lang), assumptions: structuredClone(config.assumptions) } }
  ];
  Object.assign(b, { running: true, done: 0, total: seasons * jobs.length, error: '' });
  onChange();
  try {
    const out = {};
    for (const job of jobs) {
      const tally = emptyTally();
      for (let i = 0; i < seasons; i += CHUNK) {
        for (let k = i; k < Math.min(seasons, i + CHUNK); k++) tallySeason(tally, playSeason(job.config, 7919 + k));
        b.done += Math.min(CHUNK, seasons - i);
        onChange();
        await tick();
      }
      out[job.id] = summarize(tally, seasons);
    }
    Object.assign(b, { key: balanceKey(config), result: out.now, base: out.base });
  } catch (err) {
    b.error = err.message;
  } finally {
    b.running = false;
    onChange();
  }
}

const PLAYS = {
  actuary: () => t('Coefficients from the claims model; aims for a ~60% loss ratio', 'Katsayılar hasar modelinden; yaklaşık %60 hasar oranı hedefler'),
  flat: () => t('Ignores the data: every coefficient near 1', 'Veriyi yok sayar: tüm katsayılar 1 civarında'),
  volume: () => t('Risk-based but cheap (75–85% loss ratio), heavy marketing', 'Riske göre ama ucuz (%75–85 hasar oranı), yoğun pazarlama'),
  margin: () => t('Risk-based and dear (45–55%), spends little on marketing', 'Riske göre ve pahalı (%45–55), pazarlamaya az harcar'),
  digital: () => t('Cheaper online, a big campaign with cheap coffee cards', 'Dijitalde ucuz; ucuz kahve kartlarıyla büyük kampanya'),
  gifts: () => t('Leans on the rich gym gift, most of the budget on gifts', 'Değerli spor salonu hediyesine yaslanır; bütçenin çoğu hediyeye')
};
const colorOf = id => TEAM_META[APPROACHES.indexOf(id)]?.color ?? 'var(--ink-4)';
const nameOf = id => esc(ARCHETYPES[id]?.name ?? id);

const VERDICT = {
  dominant: { cls: 'bad', label: () => t('One approach dominates', 'Tek yaklaşım baskın') },
  watch: { cls: 'warn', label: () => t('Leaning', 'Eğilimli') },
  fair: { cls: 'ok', label: () => t('Balanced', 'Dengeli') }
};

function verdictText(r) {
  const top = r.rows[0], share = pct(top.winRate, 0), fair = pct(FAIR_SHARE, 0);
  if (r.verdict === 'dominant') return t(`${nameOf(top.profile)} wins ${share} of seasons, ${fmt(top.winRate / FAIR_SHARE, 1)}× its fair share of ${fair}. With these rules, a team that finds this approach is very likely to win.`, `${nameOf(top.profile)} sezonların ${share} kadarını kazanıyor; bu, adil payın (${fair}) ${fmt(top.winRate / FAIR_SHARE, 1)} katı. Bu kurallarla bu yaklaşımı bulan takım büyük olasılıkla kazanır.`);
  if (r.verdict === 'watch') {
    return r.winners < 3
      ? t(`Only ${r.winners} of six approaches ever win. The game is playable, but the rules narrow the paths to the title.`, `Altı yaklaşımdan yalnızca ${r.winners} tanesi kazanabiliyor. Oyun oynanabilir, ama kurallar şampiyonluğa giden yolları daraltıyor.`)
      : t(`${nameOf(top.profile)} wins ${share} of seasons against a fair share of ${fair}. Playable, with a clear edge for this approach.`, `${nameOf(top.profile)} sezonların ${share} kadarını kazanıyor (adil pay: ${fair}). Oynanabilir, ama bu yaklaşımın belirgin bir avantajı var.`);
  }
  return t(`No approach wins more than ${share} of seasons, and ${r.winners} different approaches take titles. Decisions matter more than picking the “right” style.`, `Hiçbir yaklaşım sezonların ${share} kadarından fazlasını kazanmıyor ve ${r.winners} farklı yaklaşım şampiyon olabiliyor. Doğru “tarzı” seçmekten çok kararlar önemli.`);
}

function resultTable(r, base) {
  const baseRate = Object.fromEntries((base?.rows ?? []).map(x => [x.profile, x.winRate]));
  return `<div class="table-wrap"><table class="bt-table">
    <thead><tr><th>${t('Approach', 'Yaklaşım')}</th><th class="bt-wins-col">${t('Seasons won', 'Kazandığı sezon')}</th><th>${t('Podium', 'Podyum')}</th><th>${t('Avg. rank', 'Ort. sıra')}</th>${base ? `<th>${t('vs default rules', 'Varsayılana göre')}</th>` : ''}</tr></thead>
    <tbody>${r.rows.map(x => {
      const delta = base ? x.winRate - baseRate[x.profile] : 0;
      return `<tr style="--team:${colorOf(x.profile)}">
        <td><span class="bt-name"><i class="bt-swatch"></i><span><b>${nameOf(x.profile)}</b><small>${PLAYS[x.profile]()}</small></span></span></td>
        <td class="bt-wins-col"><span class="bt-wins"><b class="num">${pct(x.winRate, 0)}</b><i class="bt-bar" style="--fair:${FAIR_SHARE * 100}%"><b style="width:${x.winRate * 100}%"></b></i></span></td>
        <td class="num">${pct(x.podiumRate, 0)}</td>
        <td class="num">${fmt(x.avgRank, 1)}</td>
        <td class="num ${x.breachRate ? 'down' : 'faint'}">${pct(x.breachRate, 0)}</td>
        ${base ? `<td class="num ${Math.abs(delta) < 0.005 ? 'faint' : delta > 0 ? 'up' : 'down'}">${Math.abs(delta) < 0.005 ? '±0' : `${delta > 0 ? '▲' : '▼'} ${fmt(Math.abs(delta) * 100, 0)}`}<small>${t(' pp', ' yp')}</small></td>` : ''}
      </tr>`;
    }).join('')}</tbody>
  </table></div>`;
}

export function balanceSection(s) {
  const b = balanceState, stale = b.result && b.key !== balanceKey(s.config);
  const progress = b.total ? b.done / b.total : 0;
  return `<section class="rb bt" aria-labelledby="bt-title">
    <header class="rb-head"><div><h2 id="bt-title">${t('Does one strategy always win?', 'Hep aynı strateji mi kazanıyor?')}</h2>
      <p>${t('Six approaches play the season again and again in this market with the current rules. Every season changes the market’s luck and each bot’s exact decisions. If one approach wins far more than one season in six, the rules favour it.', 'Altı yaklaşım bu pazarda mevcut kurallarla sezonu tekrar tekrar oynar. Her sezon pazarın şansı ve her botun kararları biraz değişir. Bir yaklaşım altı sezonda birden çok daha fazla kazanıyorsa kurallar onu kayırıyor demektir.')}</p></div></header>
    <div class="bt-controls">
      <label class="bt-seasons"><span>${t('Seasons per rule set', 'Kural seti başına sezon')}</span>
        <select class="input" id="bt-seasons" data-balance-seasons ${b.running ? 'disabled' : ''}>${[50, 100, 300].map(n => `<option value="${n}" ${b.seasons === n ? 'selected' : ''}>${fmt(n)}</option>`).join('')}</select></label>
      <button class="btn go" data-action="balance-run" ${b.running ? 'disabled' : ''}>${icon('play', 16)} ${b.running ? t('Running…', 'Çalışıyor…') : b.result ? t('Run again', 'Tekrar çalıştır') : t('Run balance test', 'Denge testini çalıştır')}</button>
      ${b.running ? `<div class="bt-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(progress * 100)}" aria-label="${t('Balance test progress', 'Denge testi ilerlemesi')}"><i style="width:${progress * 100}%"></i></div><span class="faint small num">${fmt(b.done)} / ${fmt(b.total)} ${t('seasons', 'sezon')}</span>` : ''}
    </div>
    ${b.error ? `<p class="rb-warn">${icon('info', 16)} ${t(`The test couldn’t run: ${esc(b.error)}`, `Test çalıştırılamadı: ${esc(b.error)}`)}</p>` : ''}
    ${b.result ? `
      ${stale ? `<p class="note">${icon('info', 16)} ${t('The rules changed after this test. Run it again to see the effect.', 'Bu testten sonra kurallar değişti. Etkisini görmek için tekrar çalıştır.')}</p>` : ''}
      <div class="bt-verdict ${VERDICT[b.result.verdict].cls}">
        <span class="bt-stamp">${VERDICT[b.result.verdict].label()}</span>
        <p>${verdictText(b.result)}</p>
      </div>
      <h4 class="bt-sub">${t(`Current rules · ${fmt(b.result.seasons)} seasons`, `Mevcut kurallar · ${fmt(b.result.seasons)} sezon`)}</h4>
      ${resultTable(b.result, b.base)}
      <p class="faint small">${t(`Fair share is one season in six (${pct(FAIR_SHARE, 0)}); the tick on each bar marks it. “Dominant” means winning ${pct(DOMINANT, 0)} or more.`, `Adil pay altı sezonda birdir (${pct(FAIR_SHARE, 0)}); her çubuktaki çizgi bunu gösterir. “Baskın”: sezonların en az ${pct(DOMINANT, 0)} kadarını kazanmak.`)}</p>
      ` : ''}
    <p class="pv-note">${t('The bots play on this device; no AI calls are made, so the test is free and takes seconds.', 'Botlar bu cihazda oynar; yapay zekâ çağrısı yapılmaz, bu yüzden test ücretsizdir ve saniyeler sürer.')}</p>
  </section>`;
}
