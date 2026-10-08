// Stage: the moderator's single screen (for projection). The desktop surface fills the browser;
// portrait tablets and phones use the dedicated moderator workspace below.
// Phases: lobby → briefing → decision window → live race (with quiz rounds) → final.
// The rank animation moves linearly between two months' results; every overtake on screen matches a real rank change.
import { getState, playhead, raceStarted, teamStatus, seasonDone, results, getSession, currentRound, currentStrategyReview, answeredTeams, timeLeft, now as clockNow, brochureUrl } from '../store.js';
import { icon, emblem, byId, qrSvg, joinUrl, letter } from '../ui.js';
import { MIN_TEAMS, MAX_TEAMS, quizModeName, questionOf, quizMonths } from '../game.js';
import { t, getLang, languageControl } from '../i18n.js';
import { answerStylesFor, localizedQuestion } from '../quiz.js';
import { esc, fmt, money, pct, pad, clamp, lerp, easeInOut, upper, lower, clock } from '../format.js';
import { monthsOf, rank, scaledMarket, rulesOf, localizedBranch, localizedTeamProduct, localizedEventText, DIMENSIONS, dimensionName, levelName, marketCells, policiesOf } from '../../engine.js';
import { monthDigest } from '../narrative.js';
import { sfx } from '../audio.js';
import { podium, AWARDS } from './results.js';
import { spark } from './charts.js';
import { planSummary } from './plan.js';
import { sampleWorkbook } from './home.js';

const LANES_H = 672;
const phasesOf = () => [
  ['lobby', t('Lobby', 'Lobi')], ['briefing', t('Briefing', 'Brifing')], ['decisions', t('Decisions', 'Kararlar')],
  ['race', t('Race', 'Yarış')], ['final', t('Final', 'Final')]
];

// The trophies the season hands out; no weights, no total score.
function awardsBrief(s, compact = false) {
  const R = rulesOf(s.config);
  return `<div class="${compact ? 'mobile-awards' : 'brief-awards'}">${AWARDS.map(a => `<article>${icon(a.icon, compact ? 18 : 22)}<div><b>${a.label}</b><small>${a.basis}</small></div></article>`).join('')}</div>
    <p class="score-note">${icon('sliders', 16)} ${t('Two separate trophies. Teams can revise their prices and their campaign at every quarter end.', 'İki ayrı kupa. Takımlar her çeyrek sonunda fiyatlarını ve kampanyalarını güncelleyebilir.')}</p>`;
}

// The market events that have hit by `upTo`, newest first, in the viewer's language.
function marketNews(s, upTo) {
  const months = monthsOf(getLang());
  return (s.config.events || []).filter(e => e.month <= upTo).sort((a, b) => b.month - a.month)
    .map(e => { const shown = localizedEventText(e, s.config, getLang()); return { month: e.month, when: upper(months[e.month].slice(0, 3)), title: shown.title, description: shown.description }; });
}

// The market's profile from the sample: each dimension's levels and their share of customers.
function marketProfile(compact = false) {
  const lang = getLang(), shares = {};
  let total = 0;
  for (const c of marketCells()) { total += c[5]; DIMENSIONS.forEach((dim, k) => { (shares[dim] ??= [])[c[k]] = (shares[dim][c[k]] || 0) + c[5]; }); }
  return `<div class="${compact ? 'mobile-segments' : 'brief-segments'} market-profile">${DIMENSIONS.map(dim => `<article><strong>${dimensionName(dim, lang)}</strong><ul>${shares[dim].map((n, i) => `<li><span>${esc(levelName(dim, i, lang))}</span><i><b style="width:${(n / total * 100).toFixed(1)}%"></b></i><em class="num">${fmt(n / total * 100)}%</em></li>`).join('')}</ul></article>`).join('')}</div>`;
}

// Excel mode: every team has its own card. The moderator adds the team by name, hands it its own
// template and uploads the returned workbook onto the same card (at the start and at every quarter review).
function excelTeamCard(team, { quarter = false, canManage = true, submitted = false } = {}) {
  const s = getState(), done = quarter ? submitted : team.locked;
  const status = team.ai ? t('Jev AI rival', 'Jev AI rakibi')
    : quarter ? (submitted ? t('Next-quarter plan received', 'Gelecek çeyrek planı alındı') : t('Keeps its plan unless a file arrives', 'Dosya gelmezse planı aynen sürer'))
      : done ? t('Plan received', 'Plan alındı') : t('Waiting for the workbook', 'Dosya bekleniyor');
  const manage = canManage && !team.ai;
  const device = team.owner ? `<span class="xl-team-device ${team.connected ? 'on' : ''}">${icon('users', 12)} ${team.connected ? t('On its own device', 'Kendi cihazında') : t('Device offline', 'Cihazı çevrimdışı')}</span>` : '';
  return `<article class="xl-team ${done ? 'done' : 'waiting'}" style="--team:${team.color}">
    <header>${emblem(team, 'md')}<div><strong class="display">${esc(team.name)}</strong><span class="xl-team-status">${done ? icon('check', 13) : '<i class="dot"></i>'} ${status}</span>${device}</div>
      ${manage && !quarter && s.phase !== 'race' ? `<button class="icon-btn sm" data-action="remove-team" data-team="${team.id}" aria-label="${t(`Remove ${esc(team.name)}`, `${esc(team.name)} takımını çıkar`)}" title="${t('Remove team', 'Takımı çıkar')}">${icon('x', 14)}</button>` : ''}</header>
    ${team.brochure ? `<button class="xl-brochure" data-action="brochure-view" data-team="${team.id}" aria-label="${t(`Open ${esc(team.name)}’s brochure`, `${esc(team.name)} broşürünü aç`)}"><img src="${brochureUrl(team.id, team.brochure)}" alt="${t(`${esc(team.name)} brochure`, `${esc(team.name)} broşürü`)}" loading="lazy" style="aspect-ratio:${team.brochure.w} / ${team.brochure.h}"></button>`
      : quarter && !team.ai ? `<div class="xl-brochure empty">${icon('file', 18)} ${t('No brochure yet', 'Henüz broşür yok')}</div>` : ''}
    <p class="xl-team-plan">${team.locked || team.ai ? esc(excelSummary(team, s.config)) : t('No plan yet. Hand the team its template.', 'Henüz plan yok. Takıma kendi şablonunu ver.')}</p>
    ${manage ? `<div class="xl-team-actions">
      <button class="btn ghost sm" data-action="excel-team-template" data-team="${team.id}" ${quarter ? 'data-quarter="true"' : ''}>${icon('file', 14)} ${quarter ? t('Its current plan', 'Güncel planı') : t('Its template', 'Şablonu')}</button>
      <button class="btn ${done ? 'ghost' : 'gold'} sm" data-action="excel-team-upload" data-team="${team.id}">${icon('upload', 14)} ${done ? t('Replace file', 'Dosyayı değiştir') : t('Upload file', 'Dosya yükle')}</button>
      <input type="file" data-team-upload="${team.id}" ${quarter ? 'data-quarter="true"' : ''} accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden>
      <button class="btn ghost sm" data-action="brochure-upload" data-team="${team.id}">${icon('eye', 14)} ${team.brochure ? t('Replace brochure', 'Broşürü değiştir') : t('Brochure', 'Broşür')}</button>
      <input type="file" data-brochure-upload="${team.id}" accept="image/png,image/jpeg,image/webp,application/pdf" hidden>
    </div>` : ''}
  </article>`;
}

function excelAddTeam() {
  return `<form class="xl-add" data-form="excel-add-team">
    <label for="xl-new-team">${t('Add a team', 'Takım ekle')}</label>
    <input class="input" id="xl-new-team" name="name" maxlength="16" autocomplete="off" placeholder="${t('Team name', 'Takım adı')}">
    <button class="btn go" type="submit">${icon('plus', 16)} ${t('Add', 'Ekle')}</button>
    <a class="btn ghost" href="${sampleWorkbook()}" download>${icon('eye', 16)} ${t('Filled-in example', 'Doldurulmuş örnek')}</a>
  </form>`;
}

// Teams join from their own device with the PIN and hand in their own workbook.
function excelJoin(s, compact = false) {
  const url = joinUrl(s.code), pin = s.code.replace(/(\d{3})(\d{3})/, '$1 $2');
  return `<div class="xl-join ${compact ? 'compact' : ''}">${qrSvg(url, { size: compact ? 96 : 132 })}<div><p class="kicker">${t('Teams upload their own file', 'Takımlar dosyasını kendi yükler')}</p><strong>${esc(url.replace(/^https?:\/\//, '').replace(/\/#\/join\?pin=\d+$/, ''))}</strong><span>${t('Scan the code or open the site and enter the PIN', 'Kodu okut ya da siteyi açıp PIN’i gir')}</span><b class="display num">${pin}</b></div></div>`;
}

function excelRoster(s, { quarter = false, isHost = true, review = null, add = false } = {}) {
  const submitted = new Set(Object.keys(review?.submitted || {}).map(Number));
  return `${add && isHost && s.teams.length < MAX_TEAMS ? excelAddTeam() : ''}
    <div class="xl-teams">${s.teams.length ? s.teams.map(team => excelTeamCard(team, { quarter, canManage: isHost, submitted: submitted.has(team.id) })).join('')
      : `<div class="pre-empty">${icon('file', 40)}<p>${t('Teams appear here as they join with the PIN. You can also add one by name.', 'Takımlar PIN ile katıldıkça burada görünür. İstersen adıyla sen de ekleyebilirsin.')}</p></div>`}</div>`;
}

const excelSummary = (team, config) => planSummary(team.strategy, config);

export function stageMarkup() {
  return `<div class="stage-viewport" id="main">
    <header class="stage-appbar" aria-label="${t('Game management', 'Oyun yönetimi')}">
      <div class="stage-appbar-context">
        <span class="stage-role"><i></i>${t('Moderator console', 'Moderatör paneli')}</span>
        <span class="stage-room" data-st="app-room"></span>
      </div>
      <div class="stage-appbar-actions">
        <div class="stage-playback" data-st="dock" aria-label="${t('Race controls', 'Yarış kontrolleri')}">
          <button class="btn sm" data-action="toggle-play" data-st="play"></button>
          <button class="btn sm" data-action="next-month" data-st="next">${icon('next', 14)} ${t('Next month', 'Sonraki ay')}</button>
          <select class="select sm" data-config="speed" aria-label="${t('Time per month', 'Ay başına süre')}">${[3, 4, 6, 8, 12].map(n => `<option value="${n}">${t(`${n}s / month`, `${n} sn / ay`)}</option>`).join('')}</select>
          <button class="btn sm ghost" data-action="toggle-detail">${icon('eye', 15)} ${t('Team detail', 'Takım detayı')}</button>
          <button class="icon-btn" data-action="toggle-sound" data-st="sound" aria-label="${t('Broadcast sound', 'Yayın sesi')}"></button>
        </div>
        <nav class="stage-admin-nav" aria-label="${t('Management pages', 'Yönetim sayfaları')}">
          <a class="btn sm ghost" href="#/rules">${icon('cup', 15)} ${t('Rule studio', 'Kural stüdyosu')}</a>
          <button class="btn sm ghost" data-action="open-settings">${icon('sliders', 15)} ${t('Settings', 'Ayarlar')}</button>
          ${languageControl(true)}
        </nav>
      </div>
    </header>
    <div class="stage" data-stage>
      <header class="st-head">
        <div class="st-brand"><span class="brand-mark">${icon('bolt', 22)}</span><div><strong class="display">Insurers League</strong><span data-st="title"></span></div></div>
        <div class="st-live" data-st="live"></div>
        <ol class="st-months" data-st="months">${monthsOf(getLang()).map(m => `<li><span>${upper(m.slice(0, 3))}</span><i><b></b></i></li>`).join('')}</ol>
        <div class="st-month"><small data-st="month-no"></small><strong class="display" data-st="month"></strong></div>
      </header>

      <section class="st-race">
        <div class="st-race-head">
          <div><p class="kicker" data-st="metric-kicker"></p><h2 class="display">${t('Gross premium race', 'Brüt prim yarışı')}</h2></div>
        </div>
        <div class="st-cols"><span>${t('RANK', 'SIRA')}</span><span></span><span>${t('TEAM', 'TAKIM')}</span><span class="r">${t('GROSS PREMIUM', 'BRÜT PRİM')}</span><span class="r">${t('SHARE', 'PAY')}</span><span class="r">${t('PROFIT / LOSS', 'KÂR / ZARAR')}</span><span class="r">${t('LOSS RATIO', 'HASAR / PRİM')}</span></div>
        <div class="st-lanes" data-st="lanes"></div>
        <div class="st-banner" data-st="banner" aria-hidden="true"></div>
        <div class="st-notice" data-st="notice" hidden></div>
      </section>

      <aside class="st-feed" aria-label="${t('Market news', 'Piyasa haberleri')}">
        <header><span class="live-dot"></span><h2 class="display">${t('Market news', 'Piyasa haberleri')}</h2></header>
        <ol data-st="feed"></ol>
      </aside>

      <footer class="st-ticker" data-st="ticker"></footer>

      <div class="st-overlay st-pre" data-st="pre" hidden></div>
      <div class="st-overlay st-countdown" data-st="countdown" hidden></div>
      <div class="st-overlay st-quiz" data-st="quiz" hidden></div>
      <div class="st-overlay st-review" data-st="review" hidden></div>
      <div class="st-overlay st-final" data-st="final" hidden></div>
      <div class="st-detail" data-st="detail" hidden></div>
      <div class="sr-only" aria-live="polite" data-st="sr"></div>
    </div>
    <section class="stage-mobile" data-st="mobile" aria-label="${t('Moderator workspace', 'Moderatör çalışma alanı')}">
      <header class="mobile-stage-top">
        <a class="mobile-stage-brand" href="#/stage" aria-label="Insurers League"><span class="brand-mark">${icon('bolt', 18)}</span><strong class="display">Insurers<b>League</b></strong></a>
        <div class="mobile-stage-tools">
          <button class="icon-btn" data-action="open-settings" aria-label="${t('Game settings', 'Oyun ayarları')}" title="${t('Game settings', 'Oyun ayarları')}">${icon('sliders', 17)}</button>
          ${languageControl(true)}
        </div>
      </header>
      <main class="mobile-stage-main" data-st="mobile-body"></main>
    </section>
    <div class="st-lightbox" data-st="lightbox" data-action="brochure-close" hidden></div>
  </div>`;
}

export function mountStage(root) {
  const $ = k => root.querySelector(`[data-st="${k}"]`);
  const stage = root.querySelector('[data-stage]');
  const reduced = () => getState().reduce || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const host = () => getSession().role === 'host';
  let raf = 0, alive = true;
  let shownMonth = null, shownMetric = null, shownLayer = null, shownCountdown = null, preKey = '', laneKey = '';
  const seenTeams = new Set();
  let lastOrder = [], digestPushed = -2, bannerTimer = 0, detail = false, laneH = 112;
  const lanes = new Map();
  const handleResize = () => { laneKey = ''; };
  window.addEventListener('resize', handleResize);

  function buildLanes() {
    const s = getState(), el = $('lanes'), n = s.teams.length;
    const available = Math.max(240, el.clientHeight || LANES_H);
    laneH = Math.min(112, Math.floor(available / Math.max(1, n)));
    el.style.setProperty('--lane-h', `${Math.max(34, laneH - 8)}px`);
    el.classList.toggle('compact', n > 6);
    el.classList.toggle('tight', n > 9);
    el.innerHTML = s.teams.map(t2 => `<button class="lane" data-lane="${t2.id}" data-focus="${t2.id}" style="--team:${t2.color}">
      <span class="lane-pos num">--</span>
      <span class="lane-move num"></span>
      <span class="lane-id ${t2.name.length > 11 ? 'long' : ''}">${emblem(t2, 'md')}<span><b class="display">${esc(t2.name)}</b><small>${esc(t2.code)} · ${esc(localizedTeamProduct(t2, s.config, getLang()))}</small><span class="lane-tag"></span></span></span>
      <span class="lane-val num">—</span>
      <span class="lane-stat num" data-k="share"></span>
      <span class="lane-stat num" data-k="profit"></span>
      <span class="lane-stat num" data-k="loss"></span>
    </button>`).join('');
    lanes.clear();
    el.querySelectorAll('.lane').forEach(node => lanes.set(Number(node.dataset.lane), {
      node, pos: node.querySelector('.lane-pos'), move: node.querySelector('.lane-move'),
      val: node.querySelector('.lane-val'), tag: node.querySelector('.lane-tag'),
      stat: Object.fromEntries([...node.querySelectorAll('.lane-stat')].map(el => [el.dataset.k, el])),
      text: {}
    }));
    laneKey = s.teams.map(t2 => t2.id).join(',');
    lastOrder = [];
  }

  const setText = (lane, key, el, value, html = false) => {
    if (lane.text[key] === value) return;
    lane.text[key] = value;
    if (html) el.innerHTML = value; else el.textContent = value;
  };

  function announce(text) { $('sr').textContent = text; }

  // Leader alerts queue up, so two changes in one month each get their moment.
  const bannerQueue = [];
  let bannerBusy = false;
  function banner(text, team, label = t('NEW LEADER', 'YENİ LİDER')) {
    bannerQueue.push([text, team, label]);
    if (!bannerBusy) nextBanner();
  }
  function nextBanner() {
    const item = bannerQueue.shift();
    if (!item || !alive) { bannerBusy = false; return; }
    bannerBusy = true;
    const [text, team, label] = item;
    if (getState().sound) sfx.leader();
    showBanner(text, team, label);
    bannerTimer = setTimeout(nextBanner, 2800);
  }
  function showBanner(text, team, label) {
    const el = $('banner');
    el.style.setProperty('--team', team?.color || 'var(--amber)');
    el.innerHTML = `${team ? emblem(team, 'lg') : icon('cup', 40)}<div><small>${icon('cup', 16)} ${label}</small><strong class="display">${esc(text)}</strong></div>`;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2600);
  }

  // A fixed axis for the whole season (the server computes it at race start).
  const gwpMax = () => getState().scales?.gwpMax || Math.max(1, ...results().flatMap(m => m.rows.map(r => r.gwp))) * 1.08;

  // Market news: the market events that have hit so far, newest first. Team results stay on the board.
  let feedKey = '';
  function renderFeed(upTo) {
    const s = getState(), key = `${upTo}|${getLang()}|${JSON.stringify(s.config.events)}`;
    if (key === feedKey) return;
    feedKey = key;
    const list = marketNews(s, upTo);
    $('feed').innerHTML = list.length ? list.map(item => `<li class="feed-item event${item.month === upTo && !reduced() ? ' fresh' : ''}"><span class="feed-mark">${icon('bolt', 18)}</span><div><small>${item.when}</small><p><b>${esc(item.title)}</b> ${esc(item.description)}</p></div></li>`).join('')
      : `<li class="feed-empty">${t('No market news yet. Events land here in the month they hit.', 'Henüz piyasa haberi yok. Olaylar yaşandıkları ay burada görünür.')}</li>`;
  }

  function renderHeader(h) {
    const s = getState();
    $('title').textContent = t(`${s.config.year} · ${upper(localizedBranch(s.config, getLang()))} SEASON`, `${s.config.year} · ${upper(localizedBranch(s.config, getLang()))} SEZONU`);
    const state = currentRound() ? ['quiz', t('QUIZ ROUND', 'BİLGİ TURU')] : currentStrategyReview() ? ['review', t('STRATEGY REVIEW', 'STRATEJİ MOLASI')] : h.countdown !== null ? ['live', t('STARTING', 'BAŞLIYOR')] : h.running ? ['live', t('LIVE', 'CANLI')] : h.month === 11 ? ['done', t('SEASON COMPLETE', 'SEZON TAMAMLANDI')] : ['pause', t('PAUSED', 'DURAKLATILDI')];
    const live = $('live');
    if (live.dataset.state !== state.join()) { live.dataset.state = state.join(); live.className = `st-live ${state[0]}`; live.innerHTML = `${state[0] === 'live' ? '<span class="live-dot"></span>' : ''}${state[1]}`; }
    $('month-no').textContent = h.month >= 0 ? t(`MONTH ${pad(h.month + 1)} / 12`, `AY ${pad(h.month + 1)} / 12`) : t(`${s.teams.length} TEAMS`, `${s.teams.length} TAKIM`);
    $('month').textContent = h.month >= 0 ? upper(monthsOf(getLang())[h.month]) : t('START', 'BAŞLA');
    const now = clockNow();
    $('months').querySelectorAll('li').forEach((li, i) => {
      li.className = i < h.month ? 'past' : i === h.month ? 'now' : '';
      const p = i < h.month ? 1 : i === h.month ? (h.running ? clamp((now - h.start) / h.step) : 1) : 0;
      li.querySelector('b').style.width = `${p * 100}%`;
    });
  }

  function renderTicker(m) {
    const s = getState();
    const months = monthsOf(getLang());
    const d = monthDigest(results(), m, s.teams, s.config);

    $('ticker').innerHTML = `<span class="tick-label">${icon('chart', 16)} ${t('MARKET PULSE', 'PAZAR NABZI')} · ${upper(months[m])}</span>
      <span><small>${t('Premium written this month', 'Bu ay yazılan prim')}</small><b class="num">${money(d.market.monthGwp)}</b></span>
      <span><small>${t('New policies', 'Yeni poliçe')}</small><b class="num">${fmt(d.market.newPolicies)}</b></span>
      <span><small>${t('Non-buying customers', 'Satın almayan müşteri')}</small><b class="num">${pct(d.market.nonBuyerRate)}</b></span>
      <span><small>${t('Claims cost index', 'Hasar maliyet endeksi')}</small><b class="num">${fmt(d.market.costIndex * 100)}</b></span>
      <span><small>${t('Demand index', 'Talep endeksi')}</small><b class="num">${fmt(d.market.demandIndex * 100)}</b></span>`;
    return d;
  }

  // ——— Pre-race: lobby, briefing, decision window ———
  function steps(active) {
    const phases = phasesOf();
    const idx = phases.findIndex(([id]) => id === active);
    return `<ol class="pre-steps">${phases.map(([id, label], i) => `<li class="${i < idx ? 'done' : i === idx ? 'on' : ''}"><i class="num">${i < idx ? '✓' : i + 1}</i>${label}</li>`).join('')}</ol>`;
  }
  function teamTile(t2, i, withStatus) {
    const s = getState();
    const st = teamStatus(t2);
    const fresh = !seenTeams.has(t2.id);
    seenTeams.add(t2.id);
    return `<div class="pre-team ${fresh && !reduced() ? 'pop' : ''} ${t2.locked ? 'locked' : ''} ${t2.connected ? '' : 'off'}" style="--team:${t2.color};--i:${i}">
      ${emblem(t2, 'lg')}<div><strong class="display ${t2.name.length > 11 ? 'long' : ''}">${esc(t2.name)}</strong>
      ${withStatus ? `<span class="chip ${t2.locked ? 'ok' : st.id === 'offline' ? 'bad' : ''}">${t2.locked ? icon('lock', 13) : '<span class="dot"></span>'} ${st.label}</span>${s.inputMode === 'excel' && t2.excel ? `<small class="pre-team-strategy">${esc(excelSummary(t2, s.config))}</small>` : ''}` : s.inputMode === 'excel' && t2.excel ? `<small class="pre-team-strategy">${esc(excelSummary(t2, s.config))}</small>` : t2.connected ? `<small>${esc(t2.code)}</small>` : `<span class="chip bad">${t('Disconnected', 'Bağlantı yok')}</span>`}</div>
    </div>`;
  }
  function renderPre() {
    const s = getState(), isHost = host();
    const review = currentStrategyReview();
    const key = JSON.stringify([s.phase, s.inputMode, s.deadline, timeLeft() === 0, s.code, isHost, getLang(), s.config.lang, s.config.minutes, s.quiz.mode, s.quiz.bonus, review?.submitted, s.teams.map(t2 => [t2.id, t2.name, t2.emblem, t2.locked, t2.connected, t2.owner, t2.brochure?.v, t2.strategy])]);
    if (key === preKey) return;
    if (s.teams.length > seenTeams.size && preKey && s.sound) sfx.tick();
    preKey = key;
    const n = s.teams.length, url = joinUrl(s.code), pinText = s.code.replace(/(\d{3})(\d{3})/, '$1 $2');
    const el = $('pre');
    el.className = `st-overlay st-pre phase-${s.phase}`;
    if (s.phase === 'lobby') {
      el.innerHTML = `${steps('lobby')}
        ${s.inputMode === 'excel' ? `${excelJoin(s)}${excelRoster(s, { isHost, add: true })}` : `<div class="pre-join">
          <div class="pre-qr">${qrSvg(url, { size: 236 })}</div>
          <div class="pre-join-text"><p class="kicker">${t('Join on your phone', 'Telefonunla katıl')}</p><strong>${esc(location.host)}</strong><span>${t('Game PIN', 'Oyun PIN’i')}</span><b class="display num">${pinText}</b></div>
        </div>`}
        ${s.inputMode === 'excel' ? '' : `<div class="pre-teams-head"><h2 class="display">${n ? t('Teams are joining the league', 'Takımlar lige katılıyor') : t('Waiting for the first team', 'İlk takım bekleniyor')}</h2><span class="num"><b>${n}</b> / ${MAX_TEAMS}</span></div>
        <div class="pre-teams">${n ? s.teams.map((t2, i) => teamTile(t2, i, false)).join('') : `<div class="pre-empty">${icon('users', 40)}<p>${t('Scan the QR code or enter the PIN. Each device sets up its own team: a name and a logo.', 'QR kodu okut ya da PIN’i gir. Her cihaz bir takım kurar: ad ve logo seçer.')}</p></div>`}</div>`}
        <footer class="pre-foot">
          <p>${n < MIN_TEAMS ? t(`At least ${MIN_TEAMS} teams are needed to start.`, `Başlamak için en az ${MIN_TEAMS} takım gerekli.`) : s.inputMode === 'excel' ? t(`${s.teams.filter(t2 => t2.locked).length} of ${n} plans received. Files can still arrive until the race starts.`, `${n} takımdan ${s.teams.filter(t2 => t2.locked).length} tanesinin planı alındı. Dosyalar yarış başlayana kadar gelebilir.`) : t('Move to the briefing once teams are ready. Latecomers can still join until the decision window closes.', 'Takımlar hazır olduğunda brifinge geç. Geç kalanlar karar süresi bitene kadar katılabilir.')}</p>
          ${isHost ? `<button class="btn go xl" data-action="phase" data-to="briefing" ${n < MIN_TEAMS ? 'disabled' : ''}>${t('Start the briefing', 'Brifingi başlat')} ${icon('arrow', 22)}</button>` : ''}
        </footer>`;
    } else if (s.phase === 'briefing') {
      const a = s.config.assumptions, market = scaledMarket(s.config, n);
      const quizMonthList = quizMonths(s);
      el.innerHTML = `${steps('briefing')}
        ${s.inputMode === 'excel' ? '' : `<span class="pre-pin chip">${t('Join at', 'Katılım')}: ${esc(location.host)} · PIN <b class="num">${pinText}</b></span>`}
        <div class="brief-head"><p class="kicker amber">${t('Market brief', 'Pazar dosyası')} · ${s.config.year} ${esc(localizedBranch(s.config, getLang()))}</p><h1 class="display">${t('Everyone starts under the same conditions.', 'Herkes aynı koşullarda başlar.')}</h1></div>
        <div class="brief-stats">
          <div><small>${t('Marketing budget', 'Pazarlama bütçesi')}</small><b class="num">${money(a.budget.value)}</b><span>${t('the digital campaign: media + gifts', 'dijital kampanya: medya + hediye')}</span></div>
          <div><small>${t('Policies a year', 'Yıllık poliçe')}</small><b class="num">${fmt(policiesOf(s.config))}</b><span>${t('the whole market', 'tüm pazar')}</span></div>
          <div><small>${t('Customers a month', 'Aylık müşteri')}</small><b class="num">${fmt(market.pool)}</b><span>${t(`shared by ${n} teams and the rest of the market`, `${n} takım ve piyasanın geri kalanı paylaşıyor`)}</span></div>
        </div>
        ${marketProfile()}
        <div class="brief-score">${awardsBrief(s)}</div>
        <footer class="pre-foot">
          <p>${s.inputMode === 'excel' ? t('The moderator controls the full session from this screen.', 'Moderatör tüm oturumu bu ekrandan yönetir.') : t('The market brief is also open on the teams’ phones.', 'Pazar dosyası takımların telefonunda da açık.')}</p>
          ${isHost ? `<button class="btn go xl" data-action="phase" data-to="decisions">${s.inputMode === 'excel' ? t('Collect the decisions', 'Kararları topla') : t(`Start the decision window · ${s.config.minutes} min`, `Karar süresini başlat · ${s.config.minutes} dk`)} ${icon('arrow', 22)}</button>` : ''}
        </footer>`;
    } else {
      const locked = s.teams.filter(t2 => t2.locked).length, open = n - locked, left = timeLeft();
      el.innerHTML = `${steps('decisions')}
        ${s.inputMode === 'excel' ? '' : `<span class="pre-pin chip">${t('Join at', 'Katılım')}: ${esc(location.host)} · PIN <b class="num">${pinText}</b></span>`}
        <div class="decide-head">
          <div><p class="kicker amber">${t('Decision window', 'Karar süresi')}</p><strong class="display num decide-clock ${left !== null && left < 60 ? 'hot' : ''}" data-clock>${left === null ? '--:--' : clock(left)}</strong></div>
          <div class="decide-count"><b class="num">${locked}</b><span>${s.inputMode === 'excel' ? t(`/ ${n} teams<br>handed in a plan`, `/ ${n} takım<br>planını teslim etti`) : t(`/ ${n} teams<br>locked in their strategy`, `/ ${n} takım<br>stratejisini kilitledi`)}</span></div>
        </div>
        ${s.inputMode === 'excel' ? excelRoster(s, { isHost }) : `<div class="pre-teams">${s.teams.map((t2, i) => teamTile(t2, i, true)).join('')}</div>`}
        <footer class="pre-foot">
          <p>${s.inputMode === 'excel' ? (left === 0 ? t('Time’s up: teams can no longer upload from their devices. Start the race or add 5 minutes.', 'Süre doldu: takımlar artık kendi cihazından yükleyemez. Yarışı başlat ya da 5 dakika ekle.') : open ? t(`${open} team${open === 1 ? '' : 's'} without a file will race with the default plan.`, `Dosyası gelmeyen ${open} takım varsayılan planla yarışır.`) : t('Every plan is in. The grid is ready.', 'Bütün planlar geldi. Pist hazır.')) : left === 0 ? t('Time’s up. You can start the race.', 'Süre doldu. Yarışı başlatabilirsin.') : open ? t(`${open} team${open === 1 ? '' : 's'} still deciding. They’ll enter the race with their current decisions once you start.`, `${open} takım hâlâ karar veriyor. Başlattığında mevcut kararlarıyla yarışa girerler.`) : t('Every strategy is locked in. The grid is ready.', 'Bütün stratejiler kilitli. Pist hazır.')}</p>
          ${isHost ? `<div class="pre-actions"><button class="btn lg" data-action="extend">${icon('plus', 18)} ${t('Add 5 minutes', '5 dakika ekle')}</button><button class="btn go xl" data-action="start-race">${icon('flag', 22)} ${t('Start the race', 'Yarışı başlat')}</button></div>` : ''}
        </footer>`;
    }
  }

  // ——— Quiz round ———
  let quizKey = '', quizSound = '';
  function renderQuiz(round) {
    const s = getState(), q = localizedQuestion(questionOf(s, round.qid), s.config.lang, getLang(), s.config.preset), isHost = host();
    const styles = answerStylesFor(getLang());
    const el = $('quiz');
    const answered = new Set(answeredTeams(round));
    const key = `${round.qid}|${round.revealedAt}|${[...answered].join(',')}|${s.teams.length}|${isHost}|${s.quiz.auto}|${getLang()}`;
    const left = Math.max(0, (round.closesAt - clockNow()) / 1000);
    const clockEl = el.querySelector('[data-q-clock]');
    if (clockEl) { clockEl.textContent = Math.ceil(left); el.querySelector('.q-timer i')?.style.setProperty('width', `${left / s.quiz.duration * 100}%`); }
    if (key === quizKey) return;
    const firstRender = !quizKey.startsWith(round.qid + '|');
    quizKey = key;
    if (s.sound && quizSound !== `${round.qid}|${!!round.revealedAt}`) { quizSound = `${round.qid}|${!!round.revealedAt}`; (round.revealedAt ? sfx.leader : sfx.event)(); }
    const counts = round.counts || (round.revealedAt ? [0, 1, 2, 3].map(i => Object.values(round.answers).filter(a => a.choice === i).length) : null);
    const total = counts ? Math.max(1, counts.reduce((a, b) => a + b, 0)) : 1;
    const roundNo = s.quiz.rounds.indexOf(round) + 1, roundTotal = quizMonths(s).length || roundNo;
    el.className = `st-overlay st-quiz ${round.revealedAt ? 'revealed' : 'open'} ${firstRender && !reduced() ? 'enter' : ''}`;
    el.innerHTML = `<header class="q-head">
        <div class="q-title"><span class="q-badge">${icon('target', 22)}</span><div><p class="kicker amber">${t(`Quiz round ${roundNo} / ${roundTotal} · end of ${upper(monthsOf(getLang())[round.month])}`, `Bilgi turu ${roundNo} / ${roundTotal} · ${upper(monthsOf(getLang())[round.month])} sonu`)}</p><p class="q-sub">${round.revealedAt ? t('The correct answer has been revealed. Bonuses are added to the score starting next month.', 'Doğru cevap açıklandı. Bonuslar bir sonraki aydan itibaren puana eklenir.') : t(`Answer from your phone · a fast, correct answer earns up to +${fmt(s.quiz.bonus)} bonus points`, `Telefonundan cevapla · hızlı ve doğru cevap +${fmt(s.quiz.bonus)} puana kadar bonus kazandırır`)}</p></div></div>
        ${round.revealedAt ? '' : `<div class="q-clock"><b class="display num" data-q-clock>${Math.ceil(left)}</b><small>${t('seconds', 'saniye')}</small></div>`}
      </header>
      ${round.revealedAt ? '' : `<div class="q-timer"><i style="width:${left / s.quiz.duration * 100}%"></i></div>`}
      <h1 class="q-text">${esc(q.text)}</h1>
      <div class="q-grid">${q.options.map((o, i) => `<div class="q-opt ${round.revealedAt ? (i === q.correct ? 'correct' : 'dim') : ''}" style="--c:${styles[i].color};--i:${i}">
        ${letter(i, styles[i].color)}<span class="q-opt-text">${esc(o)}</span>
        ${counts ? `<span class="q-share"><b class="num">${counts[i]}</b><i><em style="width:${counts[i] / total * 100}%"></em></i></span>` : ''}
        ${round.revealedAt && i === q.correct ? `<span class="q-check">${icon('check', 30)}</span>` : ''}</div>`).join('')}</div>
      <footer class="q-foot">
        ${round.revealedAt
          ? `<p class="q-explain">${icon('info', 20)} ${esc(q.explain)}</p>
             <ol class="q-bonus">${[...s.teams].sort((a, b) => (round.bonus[b.id] || 0) - (round.bonus[a.id] || 0)).map((t2, i) => `<li class="${round.bonus[t2.id] ? '' : 'zero'}" style="--team:${t2.color};--i:${i}">${emblem(t2, 'sm')}<span class="display">${esc(t2.code)}</span><b class="num">+${fmt(round.bonus[t2.id] || 0, 1)}</b></li>`).join('')}</ol>`
          : `<div class="q-answered"><span class="kicker">${t('Teams that answered', 'Cevaplayan takımlar')} · <b class="num">${answered.size}/${s.teams.length}</b></span><ul>${s.teams.map(t2 => `<li class="${answered.has(t2.id) ? 'on' : ''}" style="--team:${t2.color}">${emblem(t2, 'sm')}<small>${esc(t2.code)}</small></li>`).join('')}</ul></div>`}
        ${isHost ? `<div class="q-host">${round.revealedAt
          ? `${s.quiz.auto ? `<span class="q-auto"><i></i> ${t('Auto-continue', 'Otomatik devam')}</span>` : ''}<button class="btn go lg" data-action="quiz-continue">${icon('play', 18)} ${t('Continue the race', 'Yarışa devam')}</button>`
          : `<button class="btn gold lg" data-action="quiz-close">${icon('check', 18)} ${t('Close answers', 'Cevapları kapat')}</button>`}</div>` : ''}
      </footer>`;
  }

  let reviewKey = '';
  function renderStrategyReview(review) {
    const s = getState(), isHost = host();
    const reviewEl = $('review');
    reviewEl.className = `st-overlay st-review${s.inputMode === 'excel' ? ' excel-mode' : ''}`;
    const submitted = new Set(Object.keys(review.submitted || {}).map(Number));
    const left = Math.max(0, (review.closesAt - clockNow()) / 1000);
    const key = `${review.month}|${[...submitted].join(',')}|${isHost}|${s.inputMode}|${getLang()}|${JSON.stringify(s.teams.map(t2 => [t2.id, t2.brochure?.v, t2.strategy]))}`;
    const clockEl = $('review').querySelector('[data-quarter-clock]');
    if (clockEl) clockEl.textContent = clock(left);
    if (key === reviewKey) return;
    reviewKey = key;
    const quarter = Math.floor(review.month / 3) + 1;
    reviewEl.innerHTML = `<header class="review-stage-head"><div><p class="kicker amber">${t(`Strategy review · quarter ${quarter} complete`, `Strateji molası · ${quarter}. çeyrek tamamlandı`)}</p><h1 class="display">${t(`Quarter ${quarter} results`, `${quarter}. çeyrek sonuçları`)}</h1><p>${s.inputMode === 'excel' ? t('Teams can upload their next-quarter plan now. Changes apply next month; completed months stay fixed.', 'Takımlar gelecek çeyrek planını şimdi yükleyebilir. Değişiklikler gelecek ay uygulanır; tamamlanan aylar sabit kalır.') : t('Teams can adjust the main lines of their plan. Every approved change takes effect next month.', 'Takımlar planlarının ana hatlarını güncelleyebilir. Onaylanan her değişiklik gelecek ay devreye girer.')}</p></div><div class="review-stage-clock"><b class="display num" data-quarter-clock>${clock(left)}</b><small>${t('remaining', 'kaldı')}</small></div></header>
      ${quarterResults(review.month)}
      <div class="qr-strip">${s.teams.map(team => reviewChip(team, { done: submitted.has(team.id), manage: isHost && !team.ai && s.inputMode === 'excel' })).join('')}</div>
      <footer class="review-stage-foot"><p><b class="num">${submitted.size}/${s.teams.length}</b> ${t('plans submitted', 'plan gönderildi')}</p>${isHost ? `<button class="btn go lg" data-action="quarter-close">${icon('play', 18)} ${t('Close review and continue', 'Değerlendirmeyi kapat ve devam et')}</button>` : ''}</footer>`;
  }

  // The quarter's results stay on screen through the review: the year so far, ranked by gross premium,
  // with what the quarter itself added.
  function quarterResults(month) {
    const s = getState(), now = results()[month], before = results()[month - 3];
    if (!now) return '';
    const rows = [...now.rows].sort((a, b) => b.gwp - a.gwp);
    const quarterGwp = r => r.gwp - (before?.rows.find(x => x.id === r.id)?.gwp ?? 0);
    return `<section class="qr-results"><table class="qr-table">
      <thead><tr><th>${t('Rank', 'Sıra')}</th><th>${t('Team', 'Takım')}</th><th class="r">${t('Gross premium', 'Brüt prim')}</th><th class="r">${t('This quarter', 'Bu çeyrek')}</th><th class="r">${t('Share', 'Pay')}</th><th class="r">${t('Profit / loss', 'Kâr / zarar')}</th><th class="r">${t('Loss ratio', 'Hasar / prim')}</th><th class="r">${t('Campaign customers', 'Kampanya müşterisi')}</th></tr></thead>
      <tbody>${rows.map((r, i) => { const team = byId(s.teams, r.id); return `<tr style="--team:${team.color}" class="${i === 0 ? 'leader' : ''}">
        <td class="num rank">${pad(i + 1)}</td>
        <td><span class="qr-team">${emblem(team, 'sm')}<b class="display">${esc(team.name)}</b></span></td>
        <td class="num r strong">${money(r.gwp)}</td><td class="num r">${money(quarterGwp(r))}</td><td class="num r">${pct(r.share)}</td>
        <td class="num r ${r.profit < 0 ? 'down' : ''}">${money(r.profit)}</td><td class="num r ${r.grossLossRatio > 1 ? 'down' : ''}">${pct(r.grossLossRatio, 0)}</td><td class="num r">${fmt(r.campaign?.total ?? 0)}</td>
      </tr>`; }).join('')}</tbody>
    </table></section>`;
  }

  // One team in the review strip: its brochure, whether its next-quarter plan is in, and (for the
  // moderator in Excel mode) the plan and brochure uploads.
  function reviewChip(team, { done, manage }) {
    const status = team.ai ? t('Recalculating', 'Yeniden hesaplıyor') : done ? t('Plan received', 'Plan alındı') : t('Keeps its plan', 'Planı aynen sürer');
    return `<article class="xl-chip ${done ? 'done' : ''}" style="--team:${team.color}">
      ${team.brochure ? `<button class="xl-chip-brochure" data-action="brochure-view" data-team="${team.id}" aria-label="${t(`Open ${esc(team.name)}’s brochure`, `${esc(team.name)} broşürünü aç`)}"><img src="${brochureUrl(team.id, team.brochure)}" alt="" loading="lazy"></button>` : `<span class="xl-chip-brochure empty" title="${t('No brochure yet', 'Henüz broşür yok')}">${icon('file', 16)}</span>`}
      <div class="xl-chip-who"><b>${esc(team.name)}</b><small>${done ? icon('check', 12) : '<i class="dot"></i>'} ${status}</small></div>
      ${manage ? `<div class="xl-chip-actions">
        <button class="icon-btn sm" data-action="excel-team-template" data-team="${team.id}" data-quarter="true" title="${t('Its current plan', 'Güncel planı')}" aria-label="${t(`${esc(team.name)}: current plan`, `${esc(team.name)}: güncel plan`)}">${icon('file', 14)}</button>
        <button class="icon-btn sm" data-action="excel-team-upload" data-team="${team.id}" title="${t('Upload file', 'Dosya yükle')}" aria-label="${t(`${esc(team.name)}: upload file`, `${esc(team.name)}: dosya yükle`)}">${icon('upload', 14)}</button>
        <input type="file" data-team-upload="${team.id}" data-quarter="true" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden>
        <button class="icon-btn sm" data-action="brochure-upload" data-team="${team.id}" title="${team.brochure ? t('Replace brochure', 'Broşürü değiştir') : t('Brochure', 'Broşür')}" aria-label="${t(`${esc(team.name)}: brochure`, `${esc(team.name)}: broşür`)}">${icon('eye', 14)}</button>
        <input type="file" data-brochure-upload="${team.id}" accept="image/png,image/jpeg,image/webp,application/pdf" hidden>
      </div>` : ''}
    </article>`;
  }

  // ——— Final ———
  // The finale is a ceremony with one trophy on screen at a time: its title, then third → second →
  // (a beat) → first, with an announcer line; then the next trophy takes the stage. Once all of them
  // are given, the screen keeps rotating through them; the host can pin one with the tabs.
  let ceremony = [], finalAward = 0;
  const clearCeremony = () => { ceremony.forEach(clearTimeout); ceremony = []; };
  function finalAwardMarkup(k, rows, teams) {
    const a = AWARDS[k], order = rows.filter(r => r.eligible).sort(a.sort);
    const rest = order.slice(3);
    return `<header class="final-one-head"><span class="award-icon">${icon(a.icon, 26)}</span><div><small>${t('Trophy', 'Kupa')} ${k + 1} / ${AWARDS.length}</small><h2 class="display">${a.label}</h2><p>${a.basis}</p></div></header>
      ${podium(rows, teams, 'final-podium', a)}
      ${rest.length ? `<ol class="final-rest" start="4">${rest.map((r, i) => { const t2 = byId(teams, r.id); return `<li style="--team:${t2.color}"><b class="num">${i + 4}.</b>${emblem(t2, 'sm')}<span>${esc(t2.name)}</span><em class="num">${a.value(r)}</em></li>`; }).join('')}</ol>` : ''}`;
  }
  function renderFinal() {
    const s = getState();
    const rows = rank(results()[11].rows, 'gwp');
    const el = $('final');
    clearCeremony();
    el.classList.remove('skip', 'done');
    el.innerHTML = `<canvas class="confetti" aria-hidden="true"></canvas>
      <div class="final-intro"><p class="kicker amber">${t('Season finale', 'Sezon finali')} · ${s.config.year}</p><h1 class="display">${t(`12 months. ${rows.length} strategies.<br><em>${AWARDS.length} trophies.</em>`, `12 ay. ${rows.length} strateji.<br><em>${AWARDS.length} kupa.</em>`)}</h1></div>
      <p class="final-call" aria-live="polite"></p>
      <nav class="final-tabs" aria-label="${t('Trophies', 'Kupalar')}">${AWARDS.map((a, k) => `<button data-action="final-award" data-award="${k}" ${host() ? '' : 'tabindex="-1"'}>${icon(a.icon, 15)} ${a.label}</button>`).join('')}</nav>
      <div class="final-one" data-st="final-one"></div>
      ${host() ? `<div class="final-host"><button class="btn ghost" data-action="skip-final">${t('Skip the ceremony', 'Töreni atla')}</button><a class="btn" href="#/results">${icon('chart', 16)} ${t('Detailed results', 'Detaylı sonuçlar')}</a><button class="btn gold" data-action="new-game">${icon('reset', 16)} ${t('New game, same teams', 'Aynı takımlarla yeni oyun')}</button></div>` : ''}`;
    const calm = reduced(), sound = () => getState().sound;
    const call = el.querySelector('.final-call'), canvas = el.querySelector('.confetti'), stageEl = el.querySelector('.final-one');
    const say = (html, cls = '') => { call.className = `final-call show ${cls}`; call.innerHTML = html; };
    const at = (ms, fn) => ceremony.push(setTimeout(fn, ms));
    // Puts trophy k on stage; `reveal` leaves its places hidden for the ceremony to raise.
    const show = (k, { reveal = false } = {}) => {
      finalAward = k;
      el.querySelectorAll('.final-tabs button').forEach((b2, i) => { b2.classList.toggle('on', i === k); b2.setAttribute('aria-pressed', i === k); });
      stageEl.classList.add('leaving');
      const swap = () => {
        stageEl.innerHTML = finalAwardMarkup(k, rows, s.teams);
        stageEl.classList.toggle('revealing', reveal);
        if (!reveal) stageEl.querySelectorAll('.podium-slot').forEach(x => x.classList.add('shown'));
        stageEl.classList.remove('leaving');
      };
      if (calm || !stageEl.innerHTML) swap(); else setTimeout(swap, 380);
    };
    this_.show = show;
    const nameIn = place => stageEl.querySelector(`.p${place} .podium-who strong`)?.textContent ?? '';
    const valueIn = place => stageEl.querySelector(`.p${place} .podium-who span.num`)?.textContent ?? '';
    const rotate = from => { let k = from; const next = () => { k = (k + 1) % AWARDS.length; show(k); call.className = 'final-call'; at(9000, next); }; at(9000, next); };
    this_.rotate = rotate;
    const STEP = calm ? [0, 700, 1300, 1900, 2500, 4200] : [0, 1100, 2100, 3100, 4100, 6800];
    let time = calm ? 300 : 2100;
    AWARDS.forEach((a, k) => {
      const base = time;
      at(base + STEP[0], () => { show(k, { reveal: true }); say(`<small>${t('Trophy', 'Kupa')} ${k + 1} / ${AWARDS.length}</small>${esc(a.label)}`); });
      [3, 2].forEach((place, i) => at(base + STEP[1 + i], () => {
        const slot = stageEl.querySelector(`.p${place}`);
        if (!slot) return;
        slot.classList.add('shown');
        say(`<small>${esc(a.label)} · ${place}.</small>${esc(nameIn(place))} <em>${esc(valueIn(place))}</em>`);
        if (sound()) sfx.tick();
      }));
      at(base + STEP[3], () => say(`<small>${esc(a.label)}</small>${t('And the trophy goes to…', 'Ve kupa…')}`, 'suspense'));
      at(base + STEP[4], () => {
        const slot = stageEl.querySelector('.p1');
        if (!slot) return;
        slot.classList.add('shown');
        stageEl.querySelector('.final-rest')?.classList.add('shown');
        say(`<small>${esc(a.label)} · ${t('winner', 'kazanan')}</small>${esc(nameIn(1))} <em>${esc(valueIn(1))}</em>`, 'winner');
        if (sound()) (k === AWARDS.length - 1 ? sfx.fanfare : sfx.leader)();
        if (!calm) confetti(canvas, [slot.style.getPropertyValue('--team') || '#FFBE55', '#FFBE55'], 0, 0.5, 140);
      });
      time = base + STEP[5];
    });
    at(time, () => { el.classList.add('done'); say(t('Congratulations to every team.', 'Tüm takımları tebrik ederiz.'), 'end'); rotate(AWARDS.length - 1); });
  }
  const this_ = {};

  // Portrait tablets and phones use a real moderator workspace rather than a shrunken 16:9 broadcast.
  // The broadcast remains the landscape projection view; both surfaces drive the same reducer actions.
  let mobileKey = '';
  function renderMobile(h) {
    const s = getState(), body = $('mobile-body'), isHost = host();
    const round = currentRound(), review = currentStrategyReview();
    const left = timeLeft();
    const submitted = review ? Object.keys(review.submitted || {}).length : 0;
    const teamKey = JSON.stringify(s.teams.map(team => [team.id, team.name, team.locked, team.connected, team.owner, team.brochure?.v, team.revision, team.strategy]));
    const scoreConfigKey = JSON.stringify([s.config.weights, s.config.assumptions, s.quiz.mode, s.quiz.bonus]);
    const key = [s.phase, s.inputMode, teamKey, scoreConfigKey, h.month, h.running, h.countdown, s.stageLayer, round?.qid, round?.revealedAt, Object.keys(round?.answers || {}).join(','), review?.month, JSON.stringify(review?.submitted || {}), submitted, left === null ? 'none' : left === 0 ? 'over' : 'on', getLang()].join('|');
    if (key === mobileKey) return;
    mobileKey = key;

    const phase = s.phase === 'lobby' ? 0 : s.phase === 'briefing' ? 1 : s.phase === 'decisions' ? 2 : 3;
    const steps = [t('Lobby', 'Lobi'), t('Brief', 'Brifing'), t('Decide', 'Karar'), t('Race', 'Yarış')];
    const progress = `<ol class="mobile-stage-progress">${steps.map((label, i) => `<li class="${i < phase ? 'done' : i === phase ? 'on' : ''}"><i>${i < phase ? icon('check', 12) : i + 1}</i><span>${label}</span></li>`).join('')}</ol>`;
    const teamList = (compact = false) => `<ul class="mobile-team-list ${compact ? 'compact' : ''}">${s.teams.length ? s.teams.map(team => {
      const status = teamStatus(team);
      return `<li style="--team:${team.color}">${emblem(team, 'xs')}<span><b>${esc(team.name)}</b><small>${team.ai ? 'JEV AI · ' : ''}${esc(status.label)}</small>${s.inputMode === 'excel' && team.excel ? `<small class="mobile-team-strategy">${esc(excelSummary(team, s.config))}</small>` : ''}</span><i class="${status.id}">${status.id === 'locked' ? icon('lock', 14) : status.id === 'ready' ? icon('check', 14) : '<span class="live-dot"></span>'}</i></li>`;
    }).join('') : `<li class="empty">${t('Waiting for the first team.', 'İlk takım bekleniyor.')}</li>`}</ul>`;
    const stat = (label, value, note = '') => `<div class="mobile-stat"><small>${label}</small><b class="num">${value}</b>${note ? `<span>${note}</span>` : ''}</div>`;

    if (s.phase === 'lobby') {
      const url = joinUrl(s.code);
      body.innerHTML = `${progress}
        <section class="mobile-stage-hero lobby"><p class="kicker amber">${t('Lobby', 'Lobi')}</p><h1 class="display">${s.inputMode === 'excel' ? t('Add the teams', 'Takımları ekle') : t('Build the league', 'Ligi kur')}</h1><p>${s.inputMode === 'excel' ? t('Teams join with the PIN on their own device and upload their own workbook. You can also add a team here and upload for it.', 'Takımlar PIN ile kendi cihazından katılır ve kendi dosyasını yükler. İstersen takımı buradan ekleyip dosyasını sen de yükleyebilirsin.') : t('Teams join from their own phones. When they are ready, start the briefing from here.', 'Takımlar kendi telefonlarından katılır. Hazır olduklarında brifingi buradan başlat.')}</p></section>
        ${s.inputMode === 'excel' ? `<section class="mobile-stage-card">${excelJoin(s, true)}${excelRoster(s, { isHost, add: true })}</section>` : `<section class="mobile-join-card"><div><p class="kicker">${t('Join the game', 'Oyuna katıl')}</p><b class="num">${esc(s.code.replace(/(\d{3})(\d{3})/, '$1 $2'))}</b><a href="${esc(url)}" translate="no">${esc(url.replace(/^https?:\/\//, ''))}</a></div>${qrSvg(url, { size: 112 })}</section>`}
        ${s.inputMode === 'excel' ? '' : `<section class="mobile-stage-card"><header><div><p class="kicker">${t('Teams', 'Takımlar')}</p><h2 class="display">${s.teams.length}/12</h2></div>${isHost ? `<button class="btn gold sm" data-action="open-settings">${icon('plus', 14)} ${t('Add AI', 'AI ekle')}</button>` : ''}</header>${teamList()}</section>`}
        ${isHost ? `<button class="btn go lg mobile-primary" data-action="phase" data-to="briefing" ${s.teams.length < MIN_TEAMS ? 'disabled' : ''}>${t('Start briefing', 'Brifingi başlat')} ${icon('arrow', 18)}</button>` : ''}`;
      return;
    }

    if (s.phase === 'briefing') {
      const a = s.config.assumptions, market = scaledMarket(s.config, s.teams.length);
      body.innerHTML = `${progress}
        <section class="mobile-stage-hero"><p class="kicker amber">${t(`Market brief · ${s.config.year}`, `Pazar dosyası · ${s.config.year}`)}</p><h1 class="display">${t('Everyone starts from the same market.', 'Herkes aynı koşullarda başlar.')}</h1><p>${s.inputMode === 'excel' ? t('The imported team strategies will compete in the same market under the same rules.', 'İçe alınan takım stratejileri aynı pazarda ve aynı kurallarla yarışacak.') : t('The teams choose their route; the market and the rules stay shared.', 'Takımlar kendi rotasını seçer; pazar ve kurallar ortaktır.')}</p></section>
        <section class="mobile-stat-grid">${stat(t('Marketing budget', 'Pazarlama bütçesi'), money(a.budget.value), t('the digital campaign: media + gifts', 'dijital kampanya: medya + hediye'))}${stat(t('Policies a year', 'Yıllık poliçe'), fmt(policiesOf(s.config)))}${stat(t('Customers a month', 'Aylık müşteri'), fmt(market.pool))}</section>
        <section class="mobile-stage-card"><p class="kicker">${t('The market', 'Pazar')}</p>${marketProfile(true)}</section>
        <section class="mobile-stage-card"><p class="kicker">${t(`${AWARDS.length} trophies`, `${AWARDS.length} kupa`)}</p>${awardsBrief(s, true)}</section>
        ${isHost ? `<button class="btn go lg mobile-primary" data-action="phase" data-to="decisions">${s.inputMode === 'excel' ? t('Collect the decisions', 'Kararları topla') : t(`Start decisions · ${s.config.minutes} min`, `Karar süresini başlat · ${s.config.minutes} dk`)} ${icon('arrow', 18)}</button>` : ''}`;
      return;
    }

    if (s.phase === 'decisions') {
      const locked = s.teams.filter(team => team.locked).length;
      body.innerHTML = `${progress}
        <section class="mobile-stage-hero decision"><p class="kicker amber">${s.inputMode === 'excel' ? t('Excel strategies', 'Excel stratejileri') : t('Decision window', 'Karar süresi')}</p><b class="display num" data-clock>${left === null ? '--:--' : clock(left)}</b><p>${locked}/${s.teams.length} ${s.inputMode === 'excel' ? t('plans received', 'plan alındı') : t('teams locked in their plan', 'takım planını kilitledi')}</p></section>
        ${s.inputMode === 'excel' ? `<section class="mobile-stage-card">${excelRoster(s, { isHost })}</section>` : `<section class="mobile-stage-card"><header><div><p class="kicker">${t('Live status', 'Canlı durum')}</p><h2 class="display">${t('Teams', 'Takımlar')}</h2></div><span class="chip ${locked === s.teams.length ? 'ok' : 'warn'}">${locked}/${s.teams.length}</span></header>${teamList()}</section>`}
        ${isHost ? (false ? '' : `<div class="mobile-action-row"><button class="btn ghost" data-action="extend">${icon('plus', 15)} ${t('Add 5 min', '5 dk ekle')}</button><button class="btn go lg" data-action="start-race">${t('Start race', 'Yarışı başlat')} ${icon('arrow', 18)}</button></div>`) : ''}`;
      return;
    }

    if (round) {
      const q = localizedQuestion(questionOf(s, round.qid), s.config.lang, getLang(), s.config.preset), styles = answerStylesFor(getLang());
      const counts = round.counts || [0, 1, 2, 3].map(i => Object.values(round.answers || {}).filter(answer => answer.choice === i).length);
      const answered = answeredTeams(round).length;
      body.innerHTML = `${progress}
        <section class="mobile-stage-hero quiz"><p class="kicker amber">${t('Quiz round', 'Bilgi turu')} · ${monthsOf(getLang())[round.month]}</p><h1 class="display">${esc(q.text)}</h1>${round.revealedAt ? `<p>${esc(q.explain)}</p>` : `<b class="num mobile-timer"><span data-quiz-clock>${Math.ceil(Math.max(0, (round.closesAt - clockNow()) / 1000))}</span> ${t('s', 'sn')}</b>`}</section>
        <section class="mobile-quiz-options">${q.options.map((option, i) => `<article class="${round.revealedAt && i === q.correct ? 'correct' : ''}" style="--c:${styles[i].color}">${letter(i, styles[i].color)}<span>${esc(option)}</span><b class="num">${counts[i]}</b></article>`).join('')}</section>
        <section class="mobile-stage-card compact"><p class="kicker">${round.revealedAt ? t('Quiz bonus', 'Bilgi bonusu') : t('Answers received', 'Alınan cevaplar')}</p>${round.revealedAt ? teamList(true) : `<b class="num mobile-answer-count">${answered}/${s.teams.length}</b>`}</section>
        ${isHost ? `<button class="btn ${round.revealedAt ? 'go' : 'gold'} lg mobile-primary" data-action="${round.revealedAt ? 'quiz-continue' : 'quiz-close'}">${round.revealedAt ? t('Continue race', 'Yarışa devam') : t('Close answers', 'Cevapları kapat')} ${icon(round.revealedAt ? 'play' : 'check', 18)}</button>` : ''}`;
      return;
    }

    if (review) {
      const seconds = Math.max(0, (review.closesAt - clockNow()) / 1000);
      body.innerHTML = `${progress}
        <section class="mobile-stage-hero review"><p class="kicker amber">${t(`Quarter ${Math.floor(review.month / 3) + 1} complete`, `${Math.floor(review.month / 3) + 1}. çeyrek tamamlandı`)}</p><h1 class="display">${t('Strategy review', 'Strateji molası')}</h1><b class="display num" data-quarter-clock>${clock(seconds)}</b><p>${s.inputMode === 'excel' ? t('Submit revised workbooks during this pause. Plans apply next month; completed months remain fixed.', 'Bu molada güncellenmiş çalışma kitaplarını yükle. Planlar gelecek ay uygulanır; tamamlanan aylar değişmez.') : t('Plans apply from next month. Completed months remain fixed.', 'Planlar gelecek ay uygulanır. Tamamlanan aylar sabit kalır.')}</p></section>
        ${s.inputMode === 'excel' ? `<section class="mobile-stage-card">${excelRoster(s, { quarter: true, isHost, review })}</section>` : `<section class="mobile-stage-card"><header><div><p class="kicker">${t('Plan status', 'Plan durumu')}</p><h2 class="display">${submitted}/${s.teams.length}</h2></div></header>${teamList()}</section>`}
        ${isHost ? `<button class="btn go lg mobile-primary" data-action="quarter-close">${t('Close review and continue', 'Değerlendirmeyi kapat ve devam et')} ${icon('arrow', 18)}</button>` : ''}`;
      return;
    }

    const m = Math.max(0, h.month), rows = rank(results()[m]?.rows || [], 'gwp'), lead = rows[0], month = monthsOf(getLang())[m];
    const news = marketNews(s, m);
    body.innerHTML = `${progress}
      <section class="mobile-race-head"><div><p class="kicker"><span class="live-dot"></span> ${t('Live race', 'Canlı yarış')}</p><h1 class="display">${month}</h1><span>${t(`Month ${m + 1} / 12`, `Ay ${m + 1} / 12`)}</span></div></section>
      <section class="mobile-stage-card standings"><header><div><p class="kicker">${t('Gross premium leader', 'Brüt prim lideri')}</p><h2 class="display">${lead ? esc(byId(s.teams, lead.id).name) : '—'}</h2></div><span class="chip info">${lead ? money(lead.gwp) : '—'}</span></header>
        <ol>${rows.map(row => { const team = byId(s.teams, row.id); return `<li style="--team:${team.color}" class="${row.id === lead?.id ? 'leader' : ''}"><b class="num">${pad(row.rank)}</b>${emblem(team, 'xs')}<span><strong>${esc(team.name)}</strong><small>${pct(row.share)} ${t('share', 'pay')} · <i class="${row.profit < 0 ? 'down' : ''}">${money(row.profit)}</i> · ${t('LR', 'H/P')} ${pct(row.grossLossRatio, 0)}</small></span><em class="num">${money(row.gwp)}</em></li>`; }).join('')}</ol>
      </section>
      <section class="mobile-stage-card mobile-feed"><p class="kicker">${t('Market news', 'Piyasa haberleri')}</p><ol>${news.length ? news.map(item => `<li class="event"><small>${item.when}</small><span><b>${esc(item.title)}</b> ${esc(item.description)}</span></li>`).join('') : `<li><span>${t('No market news yet.', 'Henüz piyasa haberi yok.')}</span></li>`}</ol></section>
      ${isHost ? `<div class="mobile-action-row"><button class="btn ghost" data-action="toggle-play">${icon(h.running ? 'pause' : 'play', 16)} ${h.running ? t('Pause', 'Duraklat') : t('Resume', 'Devam')}</button><button class="btn go" data-action="next-month">${t('Next month', 'Sonraki ay')} ${icon('next', 16)}</button></div>` : ''}`;
  }

  function frame() {
    if (!alive) return;
    const s = getState(), h = playhead(), now = clockNow(), isHost = host();
    root.classList.toggle('viewer', !isHost);
    $('app-room').textContent = s.code ? `PIN ${s.code.replace(/(\d{3})(\d{3})/, '$1 $2')}` : t('Preparing game', 'Oyun hazırlanıyor');
    // Controls are only rewritten when their state changes, so a press is never interrupted by a redraw.
    const playKey = `${h.running}|${getLang()}`;
    if ($('play').dataset.key !== playKey) { $('play').dataset.key = playKey; $('play').innerHTML = `${icon(h.running ? 'pause' : 'play', 14)} ${h.running ? t('Pause', 'Duraklat') : t('Resume', 'Devam')}`; }
    $('play').disabled = !raceStarted() || h.month >= 11 || !!currentRound() || !!currentStrategyReview();
    $('next').disabled = !raceStarted() || h.month >= 11 || !!currentRound() || !!currentStrategyReview();
    if ($('sound').dataset.key !== String(!!s.sound)) { $('sound').dataset.key = String(!!s.sound); $('sound').innerHTML = icon(s.sound ? 'volume' : 'mute', 17); }
    const speedSel = root.querySelector('[data-config="speed"]');
    if (speedSel && document.activeElement !== speedSel) speedSel.value = s.config.speed;
    root.classList.toggle('prerace', !raceStarted());
    root.classList.toggle('overlay-on', raceStarted() && (!!currentRound() || !!currentStrategyReview() || (s.stageLayer === 'final' && seasonDone())));
    renderMobile(h);

    const pre = !raceStarted();
    $('pre').hidden = !pre;
    if (pre) {
      if (getSession().connection === 'closed') { const key = `closed|${getLang()}`; if (preKey !== key) $('pre').innerHTML = `<div class="pre-closed"><h1 class="display">${t('Game not found', 'Oyun bulunamadı')}</h1><p>${t('There’s no open game with this PIN, or the game was closed.', 'Bu PIN ile açık bir oyun yok ya da oyun kapatıldı.')}</p><a class="btn go lg" href="#/">${t('Back to home', 'Girişe dön')}</a></div>`; preKey = key; }
      else renderPre();
      shownMonth = null; shownLayer = null; $('quiz').hidden = true; $('review').hidden = true; $('final').hidden = true; $('countdown').hidden = true;
      raf = requestAnimationFrame(frame); return;
    }
    renderHeader(h);

    const round = currentRound();
    $('quiz').hidden = !round;
    if (round) renderQuiz(round); else quizKey = '';
    const review = currentStrategyReview();
    $('review').hidden = !review;
    if (review) renderStrategyReview(review); else reviewKey = '';

    const cd = h.countdown;
    $('countdown').hidden = cd === null;
    if (cd !== null && cd !== shownCountdown) {
      shownCountdown = cd;
      $('countdown').innerHTML = `<p class="kicker amber">${t('The market is opening', 'Pazar açılıyor')}</p><strong class="display">${cd > 0 ? cd : t('GO', 'BAŞLA')}</strong>${isHost ? `<button class="btn ghost sm" data-action="skip-countdown">${t('Skip the countdown', 'Geri sayımı atla')}</button>` : ''}`;
      if (s.sound) sfx.countdown(cd);
    }
    if (cd === null) shownCountdown = null;

    const notice = s.notice && now - s.notice.at < 9000 ? s.notice : null;
    $('notice').hidden = !notice || cd !== null;
    if (notice) $('notice').innerHTML = `${icon('lock', 18)} ${esc(notice.kind === 'auto-locked' ? t(`${notice.names.join(', ')} entered the race with their current decisions.`, `${notice.names.join(', ')} mevcut kararlarıyla yarışa alındı.`) : notice.text || '')}`;

    const layer = s.stageLayer === 'final' && seasonDone() ? 'final' : 'race';
    $('final').hidden = layer !== 'final';
    if (layer !== shownLayer) { shownLayer = layer; if (layer === 'final') renderFinal(); }

    if (laneKey !== s.teams.map(t2 => t2.id).join(',')) buildLanes();
    if (h.month < 0) {
      if (shownMonth !== -1) { shownMonth = -1; buildLanes(); $('ticker').innerHTML = ''; feedKey = ''; renderFeed(-1); $('metric-kicker').textContent = t('Simulated market', 'Simülasyon pazarı'); }
      raf = requestAnimationFrame(frame); return;
    }

    const m = h.month;
    const months = monthsOf(getLang());
    const elapsed = now - h.start;
    const revealAt = Math.min(900, h.step * 0.15), growFor = Math.min(3200, h.step * 0.55);
    const t2v = reduced() ? 1 : easeInOut(clamp((elapsed - revealAt) / growFor));

    const monthChanged = m !== shownMonth;
    if (monthChanged) {
      const d = renderTicker(m);
      if (!reduced()) {
        root.querySelector('.st-month')?.animate([{ transform: 'translateY(-24px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 480, easing: 'cubic-bezier(.2,.8,.2,1)' });
      }
      if (s.sound) (d.events.length ? sfx.event : sfx.month)();
      if (d.events.length) announce(t('A market event affected this month’s results.', 'Bu ayki sonuçları bir piyasa olayı etkiledi.'));
      shownMonth = m; digestPushed = -1;
      lastOrder = [];
      $('metric-kicker').textContent = m === 11 ? t('Season-end ranking · cumulative gross premium', 'Sezon sonu sıralaması · kümülatif brüt prim') : t('Live ranking · cumulative gross premium', 'Canlı sıralama · kümülatif brüt prim');
    }
    renderFeed(m);

    const to = results()[m].rows, from = m > 0 ? results()[m - 1].rows : null;
    const rankedTo = rank(to, 'gwp');
    const values = to.map(r => {
      const f = from ? from.find(x => x.id === r.id).gwp : 0;
      return { id: r.id, v: lerp(f, r.gwp, t2v), endRank: rankedTo.find(x => x.id === r.id).rank };
    });
    const order = [...values].sort((a, b) => b.v - a.v || a.endRank - b.endRank).map(x => x.id);
    const startOrder = from ? rank(from, 'gwp').map(r => r.id) : order;

    if (lastOrder.length && t2v > 0 && t2v < 1) {
      for (let p = 0; p < order.length; p++) {
        const id = order[p], before = lastOrder.indexOf(id);
        if (before > p) {
          const passed = lastOrder.slice(p, before).filter(x => order.indexOf(x) > p);
          if (passed.length) {
            const a = byId(s.teams, id), b = byId(s.teams, passed[0]);
            announce(t(`${a.name} passed ${b.name} in gross premium`, `${a.name}, brüt primde ${b.name} takımını geçti`));
            const lane = lanes.get(id);
            if (lane && !reduced()) { lane.node.classList.remove('overtake'); void lane.node.offsetWidth; lane.node.classList.add('overtake'); }
            if (s.sound) sfx.overtake();
          }
        }
      }
      if (order[0] !== lastOrder[0]) {
        const lead = byId(s.teams, order[0]);
        banner(lead.name, lead, t('NEW GROSS PREMIUM LEADER', 'BRÜT PRİMDE YENİ LİDER'));
      }
    }
    lastOrder = order;

    for (const x of values) {
      const lane = lanes.get(x.id); if (!lane) continue;
      const row = to.find(r => r.id === x.id), prev = from?.find(r => r.id === x.id);
      const p = order.indexOf(x.id);
      lane.node.style.transform = `translateY(${p * laneH}px)`;
      lane.node.classList.toggle('leader', p === 0);
      lane.node.classList.toggle('p2', p === 1);
      lane.node.classList.toggle('p3', p === 2);
      lane.node.classList.toggle('focus', s.focusTeam === x.id && detail);
      lane.node.classList.toggle('dq', !row.eligible);
      setText(lane, 'pos', lane.pos, pad(t2v >= 1 ? x.endRank : p + 1));
      setText(lane, 'val', lane.val, money(x.v));
      // The side stats move with the bar: last month's figure until the month lands, then this month's.
      const shown = t2v >= 1 || !prev ? row : prev;
      setText(lane, 'share', lane.stat.share, pct(lerp(prev?.share ?? 0, row.share, t2v)));
      setText(lane, 'profit', lane.stat.profit, money(lerp(prev?.profit ?? 0, row.profit, t2v)));
      lane.stat.profit.classList.toggle('down', lerp(prev?.profit ?? 0, row.profit, t2v) < 0);
      setText(lane, 'loss', lane.stat.loss, pct(shown.grossLossRatio, 0));
      lane.stat.loss.classList.toggle('down', shown.grossLossRatio > 1);
      const moved = startOrder.indexOf(x.id) - p;
      setText(lane, 'move', lane.move, !from ? '' : moved > 0 ? `<b class="up">▲${moved}</b>` : moved < 0 ? `<b class="down">▼${-moved}</b>` : '<b class="flat">–</b>', true);
      const tag = elapsed < revealAt ? '' : !row.eligible ? `<i class="bad">${icon('x', 12)} ${t('OUT OF THE TROPHIES', 'KUPA DIŞI')}</i>` : row.exposed.length ? `<i class="warn">${icon('bolt', 12)} ${t('EVENT IMPACT', 'OLAY ETKİSİ')}</i>` : row.monthLossRatio > 1 ? `<i class="bad">${icon('shield', 12)} ${t('CLAIMS OVER PREMIUM', 'HASAR PRİMİ AŞTI')}</i>` : '';
      setText(lane, 'tag', lane.tag, tag, true);
    }

    if (t2v >= 1 && digestPushed !== m) {
      digestPushed = m;
      // Month landed: a new profit leader gets its own alert.
      if (from) for (const [key, label] of [['profit', t('NEW PROFIT LEADER', 'KÂRLILIKTA YENİ LİDER')]]) {
        const best = rows => [...rows].sort((a, b) => b[key] - a[key])[0];
        const was = best(from), is = best(to);
        if (was.id !== is.id && is[key] !== was[key]) { const lead = byId(s.teams, is.id); banner(lead.name, lead, label); }
      }
      const top = rankedTo[0];
      $('sr').textContent = t(`End of ${months[m]}: ${byId(s.teams, top.id).name} leads with ${money(top.gwp)} of gross premium.`, `${months[m]} sonu: ${byId(s.teams, top.id).name} ${money(top.gwp)} brüt primle lider.`);
    }

    if (detail) renderDetail(m); else $('detail').hidden = true;
    raf = requestAnimationFrame(frame);
  }

  let detailKey = '';
  function renderDetail(m) {
    const s = getState(), t2 = byId(s.teams, s.focusTeam) || s.teams[0];
    const key = `${m}-${t2.id}-${getLang()}`;
    $('detail').hidden = false;
    if (key === detailKey) return;
    detailKey = key;
    const r = results()[m].rows.find(x => x.id === t2.id);
    const gwps = results().slice(0, m + 1).map(x => x.rows.find(y => y.id === t2.id).gwp);
    $('detail').style.setProperty('--team', t2.color);
    $('detail').innerHTML = `<header>${emblem(t2, 'md')}<div><p class="kicker">${t('Published results', 'Yayınlanan sonuçlar')} · ${monthsOf(getLang())[m]}</p><strong class="display">${esc(t2.name)}</strong></div><button class="icon-btn" data-action="toggle-detail" aria-label="${t('Close detail', 'Detayı kapat')}">${icon('x', 16)}</button></header>
      <div class="detail-grid">${[[t('Policies', 'Poliçe'), fmt(r.policies)], [t('Gross premium', 'Brüt prim'), money(r.gwp)], [t('Market share', 'Pazar payı'), pct(r.share)], [t('Technical profit', 'Teknik kâr'), money(r.profit)], [t('Loss ratio', 'Hasar/prim'), pct(r.grossLossRatio)], [t('Campaign customers', 'Kampanya müşterisi'), fmt(r.campaign?.total ?? 0)], [t('Ad frequency', 'Reklam frekansı'), fmt(r.campaign?.frequency ?? 1, 1)]].map(([k, v]) => `<div><small>${k}</small><b class="num">${v}</b></div>`).join('')}</div>
      ${spark(gwps, t2.color, { width: 520, height: 120, min: 0, max: gwpMax(), label: t(`${t2.name} cumulative gross premium`, `${t2.name} kümülatif brüt prim`) })}`;
  }

  raf = requestAnimationFrame(frame);

  return {
    toggleDetail() { detail = !detail; detailKey = ''; },
    openDetail() { detail = true; detailKey = ''; },
    skipFinal() { clearCeremony(); const el = $('final'); el.classList.add('skip', 'done'); const c = el.querySelector('.final-call'); if (c) c.className = 'final-call'; this_.show?.(finalAward); this_.rotate?.(finalAward); },
    // The host pins one trophy: the rotation stops on it.
    // A brochure full screen; a click anywhere closes it.
    showBrochure(id) {
      const s = getState(), team = byId(s.teams, id), el = $('lightbox');
      if (!team?.brochure || !el) return;
      el.innerHTML = `<figure><img src="${brochureUrl(team.id, team.brochure)}" alt="${t(`${esc(team.name)} brochure`, `${esc(team.name)} broşürü`)}"><figcaption style="--team:${team.color}">${emblem(team, 'sm')} ${esc(team.name)}${team.strategy?.product ? ` · ${esc(team.strategy.product)}` : ''}</figcaption></figure><button class="icon-btn" data-action="brochure-close" aria-label="${t('Close', 'Kapat')}">${icon('x', 18)}</button>`;
      el.hidden = false;
    },
    closeBrochure() { const el = $('lightbox'); if (el) el.hidden = true; },
    showFinalAward(k) { clearCeremony(); const el = $('final'); el.classList.add('skip', 'done'); const c = el.querySelector('.final-call'); if (c) c.className = 'final-call'; this_.show?.(k); },
    destroy() { clearCeremony(); alive = false; cancelAnimationFrame(raf); window.removeEventListener('resize', handleResize); clearTimeout(bannerTimer); }
  };
}

function confetti(canvas, colors, delay = 4200, originX = 0.5, count = 160) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const width = Math.max(1, canvas.clientWidth || 1920), height = Math.max(1, canvas.clientHeight || 1080);
  canvas.width = width; canvas.height = height;
  const parts = Array.from({ length: count }, (_, i) => ({
    x: width * originX + (Math.random() - 0.5) * Math.min(260, width * .2), y: height * .58, vx: (Math.random() - 0.5) * 22, vy: -12 - Math.random() * 16,
    r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3, w: 8 + Math.random() * 10, h: 4 + Math.random() * 6,
    c: i % 3 === 0 ? '#FFBE55' : colors[i % colors.length]
  }));
  const start = performance.now() + delay;
  function draw(now) {
    if (!canvas.isConnected) return;
    const t2 = now - start;
    ctx.clearRect(0, 0, width, height);
    if (t2 < 0) return requestAnimationFrame(draw);
    for (const p of parts) {
      p.vy += 0.42; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.globalAlpha = Math.max(0, 1 - t2 / 3200); ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
    }
    if (t2 < 3300) requestAnimationFrame(draw); else ctx.clearRect(0, 0, width, height);
  }
  requestAnimationFrame(draw);
}
