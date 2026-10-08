// INSURERS LEAGUE — game state and actions.
// Pure module: runs with the same code in the browser (optimistic update) and inside the Cloudflare Durable Object (single source of truth).
// reduce(state, action, ctx) mutates state in place and returns { changed } or { error }.
// Session content (segment names, events, quiz questions, and every message below) is bilingual, chosen once
// per room via `lang` on session.config ('en' | 'tr'). UI chrome (buttons, hints) is a separate per-device
// toggle handled by dist/js/i18n.js.
import { scenario, simulate, validate, rank, EVENT_SCOPES, defaultRules, rulesOf, presetName, presetOf, defaultStrategy as engineStrategy, cascoMoney, DIMENSIONS, QUARTER_KEYS, assumptionsFor, campaignOf, campaignRules } from '../engine.js';
import { QUESTIONS, questionsFor } from './quiz.js';
import { checkRule, setPath, sanitizeRules } from './rules.js';

export const SCHEMA = 5;
export const MIN_TEAMS = 2;
export const MAX_TEAMS = 12;
export const COUNTDOWN_MS = 3200;
export const REVEAL_MS = 10000;
export const FINAL_DELAY_MS = 2500;
export const STRATEGY_REVIEW_MONTHS = [2, 5, 8];
export const STRATEGY_REVIEW_MS = 120000;
export const EXCEL_REVIEW_MS = 300000; // quarter review: 5 minutes
export const TEAM_COLORS = ['#43C6FF', '#FFBE55', '#AB98F8', '#57D8B3', '#FF887C', '#6D9CFF', '#F58BD3', '#B8E06A', '#FF9F43', '#4FD1C5', '#E8D36B', '#C9A7FF'];
export const EMBLEM_COUNT = 12;
export const QUIZ_MODES = {
  off: { name: { en: 'Off', tr: 'Kapalı' }, months: [] },
  quarter: { name: { en: 'End of every quarter', tr: 'Her çeyrek sonu' }, months: [2, 5, 8] },
  bimonthly: { name: { en: 'Every two months', tr: 'İki ayda bir' }, months: [1, 3, 5, 7, 9] },
  monthly: { name: { en: 'Every month', tr: 'Her ay' }, months: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }
};
export const quizModeName = (mode, lang) => QUIZ_MODES[mode]?.name[lang === 'tr' ? 'tr' : 'en'] ?? mode;

// M(config, en, tr, lang): picks a message by `lang` when given (the viewer's own device language,
// for client-side read-only display), else falls back to the session's content language — unchanged
// behavior for every server-side/reducer call site that doesn't pass one.
// Messages answer in the language of the device that acted (ctx.lang); room content keeps config.lang.
let msgLang = null;
const M = (config, en, tr, lang) => ((lang ?? msgLang ?? config?.lang ?? config?.config?.lang) === 'tr' ? tr : en);

export function freshSession(now = Date.now(), { code = '000000', lang = 'en', preset = 'casco' } = {}) {
  const p = presetOf(preset);
  return {
    schema: SCHEMA,
    code,
    inputMode: 'excel', // teams hand in workbooks; nobody but the moderator has a screen
    config: scenario(lang, p),
    teams: [],
    nextTeamId: 0,
    phase: 'lobby', // lobby → briefing → decisions → race
    deadline: null,
    results: [],
    scales: null,
    playback: null, // { base, t0, running }
    stageLayer: 'race', // race | final
    finalShown: false,
    metric: 'score',
    focusTeam: null,
    sound: false,
    reduce: false,
    quiz: { mode: 'off', duration: 20, bonus: 2, auto: true, order: 'shuffle', questions: structuredClone(questionsFor(lang, p)), rounds: [], current: null },
    // Collecting revised workbooks takes longer than tapping a phone: the pause runs ten minutes (the moderator can close it early).
    strategyReviews: { duration: EXCEL_REVIEW_MS / 1000, rounds: [], current: null },
    notice: null,
    updatedAt: now
  };
}

export function defaultStrategy(name, config) {
  return { ...engineStrategy(config), product: `${name} ${presetName(config?.preset, config?.lang)}`, sentence: '' };
}

// ——— Derived state ———

export const raceStarted = s => s.phase === 'race' && !!s.playback;
export const timeLeft = (s, now) => (s.deadline ? Math.max(0, (s.deadline - now) / 1000) : null);
// The question bank is part of the game state; the moderator adds, edits, reorders and closes questions.
export const questionsOf = s => s.quiz.questions || questionsFor(s.config?.lang, s.config?.preset);
export const questionOf = (s, qid) => questionsOf(s).find(q => q.id === qid) || QUESTIONS.find(q => q.id === qid) || null;
export const questionReady = q => q && q.enabled !== false && String(q.text || '').trim() && q.options?.length === 4 && q.options.every(o => String(o || '').trim());
export const activeQuestions = s => questionsOf(s).filter(questionReady);
export const quizMonths = s => (activeQuestions(s).length ? QUIZ_MODES[s.quiz.mode]?.months ?? [] : []);
export const currentRound = s => (s.quiz.current != null ? s.quiz.rounds[s.quiz.current] : null);
export const currentStrategyReview = s => {
  const reviews = s.strategyReviews;
  return reviews?.current != null ? reviews.rounds?.[reviews.current] || null : null;
};
export const strategyReviewTimeLeft = (s, now) => {
  const review = currentStrategyReview(s);
  return review ? Math.max(0, (review.closesAt - now) / 1000) : null;
};
export const teamOf = (s, playerId) => (playerId ? s.teams.find(t => t.owner === playerId) || null : null);

export const canEditTeam = (s, team, now) => {
  if (!team) return false;
  if (s.phase !== 'race') return !team.locked && timeLeft(s, now) !== 0;
  const review = currentStrategyReview(s);
  return !!review && !team.ai && !!team.quarterDraft && !review.submitted?.[team.id] && now <= review.closesAt;
};

export function teamStatus(s, team, now, lang) {
  const m = (en, tr) => M(s.config, en, tr, lang);
  const review = currentStrategyReview(s);
  if (review) {
    if (review.submitted?.[team.id]) return { id: 'locked', label: m('Quarter plan submitted', 'Çeyrek planı hazır') };
    if (team.ai) return { id: 'revision', label: m('Jev is revising', 'Jev revizyonda') };
    if (team.excel) return { id: 'revision', label: m('Waiting for Excel update', 'Excel güncellemesi bekleniyor') };
    return { id: 'revision', label: m('Reviewing the plan', 'Planı gözden geçiriyor') };
  }
  if (team.ai) return { id: team.locked ? 'locked' : 'ready', label: m('Jev AI rival', 'Jev AI rakibi') };
  if (team.excel && !team.locked) return { id: 'draft', label: m('Waiting for the workbook', 'Dosya bekleniyor') };
  if (team.excel) return { id: 'locked', label: m('Plan received', 'Plan alındı') };
  if (!team.connected) return { id: 'offline', label: m('Disconnected', 'Bağlantı yok') };
  if (team.locked) return { id: 'locked', label: m('Locked in', 'Kilitledi') };
  if (s.phase === 'lobby' || s.phase === 'briefing') return { id: 'ready', label: m('Ready', 'Hazır') };
  if (timeLeft(s, now) === 0) return { id: 'late', label: m('Time’s up', 'Süre doldu') };
  if (team.revision) return { id: 'revision', label: m('Revising', 'Revizyonda') };
  return { id: 'draft', label: m('Deciding', 'Karar veriyor') };
}

// Playback clock. Every client computes the same month from the same timestamp.
// If a quiz round hasn't been asked yet, playback waits at the end of that month; tick() opens the question.
export function playhead(s, now) {
  const step = s.config.speed * 1000;
  const p = s.playback;
  if (!p || !raceStarted(s)) return { month: -1, start: 0, step, running: false, countdown: null, waiting: false };
  const done = new Set(s.quiz.rounds.map(r => r.month));
  const reviewed = new Set((s.strategyReviews?.rounds || []).map(r => r.month));
  const quizGate = quizMonths(s).find(m => m >= p.base && !done.has(m));
  const reviewGate = STRATEGY_REVIEW_MONTHS.find(m => m >= p.base && !reviewed.has(m));
  const gate = [quizGate, reviewGate].filter(Number.isInteger).sort((a, b) => a - b)[0];
  const limit = Math.min(11, gate ?? 11);
  let month = p.base, start = p.t0;
  if (p.running) {
    const n = Math.max(0, Math.floor((now - p.t0) / step));
    month = Math.min(limit, p.base + n);
    start = p.t0 + (month - p.base) * step;
  }
  const countdown = p.running && month === -1 ? Math.max(0, Math.ceil((p.t0 + step - now) / 1000)) : null;
  const waiting = p.running && gate !== undefined && month === gate && now >= start + step;
  return { month, start, step, running: p.running && month < 11 && !waiting, countdown, waiting };
}

// Model score + quiz round bonus. A bonus won in round k is added to every month after k.
export function scoredResults(s) {
  if (!s.results?.length) return [];
  const rounds = s.quiz.rounds.filter(r => r.revealedAt);
  return s.results.map(m => {
    const rows = m.rows.map(r => {
      const bonus = rounds.filter(q => q.month < m.month).reduce((sum, q) => sum + (q.bonus?.[r.id] || 0), 0);
      const modelScore = r.modelScore ?? r.score;
      return { ...r, modelScore, bonus, score: modelScore + bonus };
    });
    return { ...m, rows: rank(rows) };
  });
}

export function seasonScales(results) {
  const all = k => results.flatMap(m => m.rows.map(r => r[k]));
  const scores = all('score'), profits = all('profit');
  return {
    scoreMin: Math.max(0, Math.floor(Math.min(...scores) / 10) * 10 - 10),
    shareMax: Math.max(0.05, ...all('share')) * 1.12,
    gwpMax: Math.max(1, ...all('gwp')) * 1.08,
    profitMin: Math.min(0, ...profits) * 1.08,
    profitMax: Math.max(1, ...profits) * 1.08
  };
}

// ——— Helpers ———

const clean = v => String(v ?? '').trim().replace(/\s+/g, ' ');
const upperEn = v => String(v).toLocaleUpperCase('en-US');
const upperTr = v => String(v).toLocaleUpperCase('tr-TR');
const upperOf = (v, lang) => (lang === 'tr' ? upperTr(v) : upperEn(v));

// Switching a room's content language changes only untouched default copy.
// Custom rules, event descriptions and edited quiz questions stay as written.
function relocalizeDefaults(value, before, after) {
  if (typeof value === 'string') return value === before && typeof after === 'string' ? after : value;
  if (Array.isArray(value)) {
    if (!Array.isArray(before) || !Array.isArray(after)) return value;
    return value.map((item, index) => {
      const oldItem = item && typeof item === 'object' && 'id' in item
        ? before.find(entry => entry?.id === item.id)
        : item && typeof item === 'object' && 'title' in item
          ? before.find(entry => entry?.title === item.title)
          : before[index];
      const newItem = oldItem && typeof oldItem === 'object' && 'id' in oldItem
        ? after.find(entry => entry?.id === oldItem.id)
        : oldItem && typeof oldItem === 'object' && 'title' in oldItem
          ? after[before.indexOf(oldItem)]
          : after[index];
      return oldItem === undefined || newItem === undefined ? item : relocalizeDefaults(item, oldItem, newItem);
    });
  }
  if (!value || typeof value !== 'object' || !before || !after) return value;
  for (const key of Object.keys(value)) {
    if (key in before && key in after) value[key] = relocalizeDefaults(value[key], before[key], after[key]);
  }
  return value;
}

function teamCode(s, name, selfId) {
  const lang = s.config?.lang;
  const letters = upperOf(name, lang).replace(lang === 'tr' ? /[^A-ZÇĞİÖŞÜ]/g : /[^A-Z]/g, '');
  const base = (letters.slice(0, 3) || (lang === 'tr' ? 'TKM' : 'TEA')).padEnd(3, 'X');
  let code = base, i = 2;
  while (s.teams.some(t => t.id !== selfId && t.code === code)) code = base.slice(0, 2) + i++;
  return code;
}

// Brings out-of-range decisions to the nearest valid value at race start; returns the fields that were fixed.
export function repairStrategy(team, config) {
  const st = team.strategy, fixes = [], R = rulesOf(config), money = cascoMoney(config);
  if (!clean(st.product)) { st.product = `${team.name} ${presetName(config?.preset, config?.lang)}`; fixes.push(M(config, 'product name', 'ürün adı')); }
  if (!clean(st.sentence)) { st.sentence = M(config, 'We’ll show our strategy in the race.', 'Stratejimizi yarışta göstereceğiz.', config?.lang); fixes.push(M(config, 'strategy sentence', 'strateji cümlesi')); }
  if (!Number.isFinite(st.basePremium) || st.basePremium <= 0) { st.basePremium = engineStrategy(config).basePremium; fixes.push(M(config, 'base premium', 'baz prim')); }
  st.coef = st.coef || {};
  for (const dim of DIMENSIONS) {
    const n = R.dimensions[dim].length, list = Array.isArray(st.coef[dim]) ? st.coef[dim] : [];
    const fixed = Array.from({ length: n }, (_, i) => Math.min(R.coef.max, Math.max(R.coef.min, Number.isFinite(list[i]) ? list[i] : 1)));
    if (fixed.some((v, i) => v !== list[i])) { st.coef[dim] = fixed; fixes.push(M(config, `${dim} coefficients`, `${dim} katsayıları`)); }
  }
  // Gift weights: whole steps of 5 summing to 100 (all on the first gift when nothing usable is there).
  const c = campaignOf(st), n = campaignRules(R).offers.length;
  const arr = Array.from({ length: n }, (_, i) => Math.max(0, Math.round((Number(c.weights[i]) || 0) / 5) * 5)), sum = arr.reduce((a, b) => a + b, 0);
  if (!Array.isArray(st.offers) || st.offers.length !== n || sum !== 100 || st.offers.some((v, i) => v !== arr[i])) {
    const scaled = sum ? arr.map(v => Math.floor(v / sum * 20) * 5) : arr.map((_, i) => (i ? 0 : 100));
    scaled[scaled.indexOf(Math.max(...scaled))] += 100 - scaled.reduce((a, b) => a + b, 0);
    if (Array.isArray(st.offers) && st.offers.length === n && sum !== 100) fixes.push(M(config, 'gift weights', 'hediye ağırlıkları'));
    st.offers = scaled;
  }
  const media = Math.round((Number.isFinite(c.media) ? c.media : 50) / 5) * 5;
  if (st.mediaShare !== Math.min(100, Math.max(0, media))) { st.mediaShare = Math.min(100, Math.max(0, media)); fixes.push(M(config, 'media share', 'medya payı')); }
  if (!Number.isFinite(st.marketing) || st.marketing < 0) { st.marketing = 0; fixes.push(M(config, 'marketing budget', 'pazarlama bütçesi')); }
  if (st.marketing > money.budget) { st.marketing = money.budget; fixes.push(M(config, 'budget', 'bütçe')); }
  for (const key of ['channelFocus', 'claimsOps', 'reinsurance', 'campaign', 'offer']) delete st[key];
  return fixes;
}

function startPlayback(s, now) {
  s.playback = { base: -1, t0: now + COUNTDOWN_MS - s.config.speed * 1000, running: true };
  s.stageLayer = 'race';
  s.finalShown = false;
}

function shuffled(list, seed) {
  let a = seed >>> 0;
  const rnd = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const order = [...list];
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  return order;
}

// Next question: the first not-yet-asked active question, in bank order or a seeded shuffle.
export function nextQuestion(s) {
  const active = activeQuestions(s);
  if (!active.length) return null;
  const order = s.quiz.order === 'fixed' ? active : shuffled(active, s.config.seed);
  const asked = new Set(s.quiz.rounds.map(r => r.qid));
  return order.find(q => !asked.has(q.id)) || order[s.quiz.rounds.length % order.length];
}

function openRound(s, h, now) {
  const q = nextQuestion(s);
  if (!q) return;
  s.playback = { base: h.month, t0: h.start, running: false };
  s.quiz.rounds.push({ month: h.month, qid: q.id, openedAt: now, closesAt: now + s.quiz.duration * 1000, revealedAt: null, answers: {}, teamPoints: {}, bonus: {} });
  s.quiz.current = s.quiz.rounds.length - 1;
}

export const answerPoints = (answer, round, q, duration) =>
  answer && answer.choice === q.correct ? Math.round(1000 * (1 - 0.5 * Math.min(1, Math.max(0, (answer.at - round.openedAt) / (duration * 1000))))) : 0;

function revealRound(s, now) {
  const round = currentRound(s);
  if (!round || round.revealedAt) return;
  const q = questionOf(s, round.qid);
  for (const a of Object.values(round.answers)) a.points = answerPoints(a, round, q, s.quiz.duration);
  for (const team of s.teams) {
    const answer = Object.values(round.answers).find(a => a.teamId === team.id);
    round.teamPoints[team.id] = answer?.points || 0;
    round.bonus[team.id] = Math.round(round.teamPoints[team.id] / 1000 * s.quiz.bonus * 10) / 10;
  }
  round.revealedAt = now;
}

function reviewsOf(s) {
  if (!s.strategyReviews) s.strategyReviews = { duration: STRATEGY_REVIEW_MS / 1000, rounds: [], current: null };
  if (!Array.isArray(s.strategyReviews.rounds)) s.strategyReviews.rounds = [];
  return s.strategyReviews;
}

function recalculateSeason(s) {
  const results = simulate(s.teams, s.config);
  s.results = results;
  s.scales = seasonScales(results);
}

function openStrategyReview(s, month, now) {
  const reviews = reviewsOf(s);
  if (!STRATEGY_REVIEW_MONTHS.includes(month) || reviews.rounds.some(r => r.month === month)) return false;
  const h = playhead(s, now);
  s.playback = { base: month, t0: h.start || now, running: false };
  const review = { month, openedAt: now, closesAt: now + (reviews.duration || STRATEGY_REVIEW_MS / 1000) * 1000, submitted: {}, changed: {}, initialStrategies: {} };
  reviews.rounds.push(review);
  reviews.current = reviews.rounds.length - 1;
  for (const team of s.teams) {
    review.initialStrategies[team.id] = structuredClone(team.strategy);
    team.locked = true;
    team.revision = !team.ai;
    if (!team.ai) team.quarterDraft = structuredClone(team.strategy);
  }
  return true;
}

function commitQuarterStrategy(s, team, strategy, review, now) {
  const draftTeam = { ...team, strategy };
  const errors = validate(draftTeam, s.config, msgLang ?? undefined);
  if (errors.length) return { error: errors[0] };
  const before = JSON.stringify(team.strategy);
  const previous = structuredClone(team.strategy);
  if (!Array.isArray(team.strategyHistory) || !team.strategyHistory.length) team.strategyHistory = [{ effectiveMonth: 0, strategy: previous }];
  team.strategy = structuredClone(strategy);
  const effectiveMonth = review.month + 1;
  team.strategyHistory = team.strategyHistory.filter(entry => entry.effectiveMonth !== effectiveMonth);
  team.strategyHistory.push({ effectiveMonth, strategy: structuredClone(team.strategy), decidedAt: now });
  team.strategyHistory.sort((a, b) => a.effectiveMonth - b.effectiveMonth);
  review.submitted[team.id] = true;
  review.changed[team.id] = before !== JSON.stringify(team.strategy);
  delete team.quarterDraft;
  team.revision = false;
  recalculateSeason(s);
  return { changed: true };
}

function closeStrategyReview(s, now) {
  const review = currentStrategyReview(s);
  if (!review) return false;
  for (const team of s.teams) {
    delete team.quarterDraft;
    team.revision = false;
    team.locked = true;
  }
  review.closedAt = now;
  reviewsOf(s).current = null;
  resume(s, now);
  return true;
}

function allReviewTeamsSubmitted(s, review) {
  return s.teams.every(team => !!review.submitted?.[team.id]);
}

function continueAfterQuiz(s, month, now) {
  if (openStrategyReview(s, month, now)) return;
  resume(s, now);
}

function resume(s, now) {
  const h = playhead(s, now);
  if (h.month >= 11) return;
  s.playback = { base: h.month, t0: now + 700 - s.config.speed * 1000, running: true };
}

// The next scheduled event (for the server alarm).
export function nextWake(s, now) {
  const times = [];
  const round = currentRound(s);
  const review = currentStrategyReview(s);
  if (round && !round.revealedAt) times.push(round.closesAt);
  if (round?.revealedAt && s.quiz.auto) times.push(round.revealedAt + REVEAL_MS);
  if (review) times.push(review.closesAt);
  if (raceStarted(s)) {
    const h = playhead(s, now);
    if (s.playback.running && h.month < 11) times.push(h.start + h.step);
    if (h.month === 11 && !s.finalShown) times.push(h.start + h.step + FINAL_DELAY_MS);
  }
  if (s.deadline && s.deadline > now) times.push(s.deadline);
  const future = times.filter(t => t > now);
  return future.length ? Math.min(...future) + 15 : null;
}

export function checkedConfig(c, lang = 'en') {
  if (!c || typeof c !== 'object') throw Error(M({ lang }, 'No valid scenario (config) found in the file.', 'Dosyada geçerli bir senaryo (config) bulunamadı.'));
  const base = scenario(c.lang === 'tr' || c.lang === 'en' ? c.lang : lang);
  const ranges = { year: [2000, 2100], minutes: [1, 90], speed: [3, 12] };
  for (const [k, [lo, hi]] of Object.entries(ranges)) {
    if (!Number.isFinite(c[k]) || c[k] < lo || c[k] > hi) throw Error(M(base, `${k} must be between ${lo} and ${hi}.`, `${k} değeri ${lo}–${hi} aralığında olmalı.`));
    base[k] = c[k];
  }
  if (typeof c.branch === 'string' && c.branch.trim()) base.branch = c.branch.slice(0, 30);
  base.seed = Number.isInteger(c.seed) ? c.seed : base.seed;
  // Files saved before the satisfaction score was dropped carry three weights: keep the first two, rescaled.
  const weights = Array.isArray(c.weights) && c.weights.length === 3 && c.weights[0] + c.weights[1] > 0
    ? (w => [w, 100 - w])(Math.round(c.weights[0] / (c.weights[0] + c.weights[1]) * 100)) : c.weights;
  if (!Array.isArray(weights) || weights.length !== 2 || weights.some(x => !Number.isFinite(x) || x < 0 || x > 100) || weights.reduce((a, b) => a + b, 0) !== 100) throw Error(M(base, 'Score weights must total 100%.', 'Puan ağırlıklarının toplamı %100 olmalı.'));
  base.weights = weights;
  base.rules = sanitizeRules(c.rules, base.lang);
  for (const [k, def] of Object.entries(base.assumptions)) {
    const v = c.assumptions?.[k]?.value;
    if (v === undefined) continue;
    if (!Number.isFinite(v) || v < def.min || v > def.max) throw Error(M(base, `${def.label} must be between ${def.min} and ${def.max}.`, `${def.label} ${def.min}–${def.max} aralığında olmalı.`));
    base.assumptions[k].value = v;
  }
  if (!Array.isArray(c.events) || c.events.length > 12) throw Error(M(base, 'The event calendar can hold at most 12 events.', 'Olay takvimi en fazla 12 olay içerebilir.'));
  base.events = c.events.map(e => {
    if (!Number.isInteger(e.month) || e.month < 0 || e.month > 11 || typeof e.title !== 'string' || !e.title.trim()) throw Error(M(base, 'An event’s month or title is invalid.', 'Olay ayı veya başlığı geçersiz.'));
    for (const k of ['cost', 'demand']) if (!Number.isFinite(e[k]) || e[k] < 0.5 || e[k] > 2) throw Error(M(base, `The ${k} multiplier for "${e.title}" must be between 0.5 and 2.`, `"${e.title}" olayında ${k} çarpanı 0,5–2 aralığında olmalı.`));
    return { month: e.month, duration: Math.max(1, Math.min(12, Number(e.duration) | 0 || 1)), title: e.title.slice(0, 70), description: String(e.description ?? e.title).slice(0, 220),
      cost: e.cost, demand: e.demand, scope: EVENT_SCOPES.some(x => x.id === e.scope) ? e.scope : 'all' };
  });
  return base;
}

const cleanQuestion = (q, i) => ({
  id: typeof q?.id === 'string' && q.id ? q.id.slice(0, 40) : `q-import-${i}`,
  text: String(q?.text ?? '').slice(0, 160),
  options: [0, 1, 2, 3].map(k => String(q?.options?.[k] ?? '').slice(0, 90)),
  correct: [0, 1, 2, 3].includes(q?.correct) ? q.correct : 0,
  explain: String(q?.explain ?? '').slice(0, 240),
  enabled: q?.enabled !== false
});

// A strategy arriving from a workbook: keep only known fields, coerce numbers, fall back to `base`.
function strategyFrom(source, base, cfg) {
  const src = source && typeof source === 'object' ? source : {}, R = rulesOf(cfg), gifts = campaignRules(R).offers.length;
  const num = v => (v === '' || v === null || v === undefined ? NaN : Number(v));
  const out = {
    ...structuredClone(base),
    product: clean(src.product).slice(0, 32) || base.product,
    sentence: clean(src.sentence).slice(0, 90) || base.sentence || M(cfg, 'Our strategy speaks in the race.', 'Stratejimiz yarışta konuşacak.', cfg.lang),
    basePremium: num(src.basePremium ?? base.basePremium),
    marketing: num(src.marketing ?? base.marketing),
    coef: Object.fromEntries(DIMENSIONS.map(dim => [dim, Array.isArray(src.coef?.[dim]) ? src.coef[dim].slice(0, R.dimensions[dim].length).map(num) : base.coef[dim]])),
    mediaShare: num(src.mediaShare ?? campaignOf(base).media),
    offers: (Array.isArray(src.offers) ? src.offers : campaignOf(base).weights).slice(0, gifts).map(num)
  };
  for (const key of ['channelFocus', 'claimsOps', 'reinsurance', 'campaign', 'offer']) delete out[key];
  const numbers = [out.basePremium, out.marketing, out.mediaShare, ...out.offers, ...DIMENSIONS.flatMap(dim => out.coef[dim])];
  if (numbers.some(v => !Number.isFinite(v)) || out.offers.length !== gifts || DIMENSIONS.some(dim => out.coef[dim].length !== R.dimensions[dim].length))
    return { error: M(cfg, 'a decision is missing or not a number.', 'eksik ya da sayısal olmayan bir karar var.') };
  return out;
}

// ——— Actions ———

const HOST_ONLY = new Set(['phase', 'extend', 'start-race', 'toggle-play', 'next-month', 'skip-countdown', 'show-final', 'stage-race', 'replay',
  'revision', 'remove-team', 'config', 'setting', 'weight', 'assumption', 'event', 'import-config', 'quiz-config', 'quiz-close', 'quiz-continue', 'quarter-close',
  'excel-import-teams', 'excel-quarter-submit', 'excel-add-team',
  'new-game', 'metric', 'focus', 'rule', 'rules-reset', 'weights-normalize', 'event-add', 'event-remove',
  'question-add', 'question-update', 'question-remove', 'question-move', 'questions-reset', 'add-ai-team']);

export function reduce(s, action, ctx) {
  msgLang = ctx.lang === 'tr' || ctx.lang === 'en' ? ctx.lang : null;
  try { return reduceAction(s, action, ctx); } finally { msgLang = null; }
}

function reduceAction(s, action, ctx) {
  const now = ctx.now ?? Date.now();
  const role = ctx.role; // host | stage | player | system
  const type = action?.type;
  const cfg = s?.config;
  if (!type) return { error: M(cfg, 'Invalid action.', 'Geçersiz işlem.') };
  if (HOST_ONLY.has(type) && role !== 'host') return { error: M(cfg, 'This action is only available to the moderator.', 'Bu işlem yalnızca moderatöre açık.') };
  const mine = teamOf(s, ctx.playerId);
  const done = { changed: true };

  switch (type) {
    // ——— Team setup (every connected device is one team) ———
    case 'create-team': {
      if (s.inputMode === 'excel') return { error: M(cfg, 'This game is managed by the moderator. Teams submit strategies in the Excel template.', 'Bu oyunu moderatör yönetiyor. Takımlar stratejilerini Excel şablonuyla iletir.') };
      if (role !== 'player' || !ctx.playerId) return { error: M(cfg, 'A team can only be created from a participant device.', 'Takım yalnızca katılımcı cihazından kurulur.') };
      const name = clean(action.name).slice(0, 16);
      const emblem = Number(action.emblem);
      if (name.length < 2) return { error: M(cfg, 'The team name must be at least 2 characters.', 'Takım adı en az 2 karakter olmalı.') };
      if (!Number.isInteger(emblem) || emblem < 0 || emblem >= EMBLEM_COUNT) return { error: M(cfg, 'Pick a logo.', 'Bir logo seç.') };
      if (s.teams.some(t => t !== mine && upperOf(t.name, cfg.lang) === upperOf(name, cfg.lang))) return { error: M(cfg, `"${name}" is taken. Pick another name.`, `"${name}" adı alınmış. Başka bir ad seç.`) };
      if (mine) {
        if (s.phase === 'race') return { error: M(cfg, 'The race has started; team details can’t be changed.', 'Yarış başladı; takım bilgileri değiştirilemez.') };
        const branchWord = presetName(cfg?.preset, cfg?.lang);
        if (mine.strategy.product === `${mine.name} ${branchWord}`) mine.strategy.product = `${name} ${branchWord}`;
        mine.name = name; mine.emblem = emblem; mine.code = teamCode(s, name, mine.id); mine.connected = true;
        return done;
      }
      if (s.phase === 'race') return { error: M(cfg, 'The race has started. New teams can’t join.', 'Yarış başladı. Yeni takım katılamaz.') };
      if (s.teams.length >= MAX_TEAMS) return { error: M(cfg, `Room full: ${MAX_TEAMS} teams max.`, `Oda dolu: en fazla ${MAX_TEAMS} takım.`) };
      const used = new Set(s.teams.map(t => t.color));
      const id = s.nextTeamId++;
      s.teams.push({
        id, owner: ctx.playerId, name, code: teamCode(s, name, id), emblem,
        color: TEAM_COLORS.find(c => !used.has(c)) || TEAM_COLORS[id % TEAM_COLORS.length],
        connected: true, locked: false, revision: false, joinedAt: now, strategy: defaultStrategy(name, cfg)
      });
      return done;
    }
    case 'excel-import-teams': {
      if (s.inputMode !== 'excel') return { error: M(cfg, 'Excel intake is not enabled for this game.', 'Bu oyunda Excel ile takım alımı açık değil.') };
      if (s.phase === 'race') return { error: M(cfg, 'The race has started. Strategies can only change at a quarter review.', 'Yarış başladı. Stratejiler yalnızca çeyrek molasında değişebilir.') };
      if (!Array.isArray(action.teams) || action.teams.length < 1 || action.teams.length > MAX_TEAMS) return { error: M(cfg, `Upload between 1 and ${MAX_TEAMS} teams.`, `1–${MAX_TEAMS} takım yükleyin.`) };

      const imported = [], names = new Set();
      for (const item of action.teams) {
        const name = clean(item?.name).slice(0, 16), key = upperOf(name, cfg.lang);
        if (name.length < 2) return { error: M(cfg, 'Every team name must be 2–16 characters.', 'Her takım adı 2–16 karakter olmalı.') };
        if (names.has(key)) return { error: M(cfg, `“${name}” appears more than once in the upload.`, `“${name}” yüklemede birden fazla kez var.`) };
        names.add(key);
        const strategy = strategyFrom(item?.strategy, defaultStrategy(name, cfg), cfg);
        if (strategy.error) return { error: M(cfg, `“${name}”: ${strategy.error}`, `“${name}”: ${strategy.error}`) };
        const errors = validate({ name, strategy }, cfg, msgLang ?? undefined);
        if (errors.length) return { error: M(cfg, `“${name}”: ${errors[0]}`, `“${name}”: ${errors[0]}`) };
        imported.push({ name, strategy });
      }

      const next = s.teams.map(team => ({ ...team })), used = new Set(next.map(team => team.color));
      let nextId = s.nextTeamId;
      for (const entry of imported) {
        const match = next.find(team => upperOf(team.name, cfg.lang) === upperOf(entry.name, cfg.lang));
        if (match && !match.excel) return { error: M(cfg, `“${entry.name}” is already used by another team. Choose a different team name.`, `“${entry.name}” başka bir takım tarafından kullanılıyor. Farklı takım adı seçin.`) };
        if (match) { match.strategy = entry.strategy; match.locked = true; match.connected = true; match.excel = true; continue; }
        const id = nextId++;
        next.push({ id, owner: null, name: entry.name, code: teamCode({ ...s, teams: next }, entry.name, id), emblem: id % EMBLEM_COUNT,
          color: TEAM_COLORS.find(color => !used.has(color)) || TEAM_COLORS[id % TEAM_COLORS.length], connected: true, locked: true,
          revision: false, excel: true, joinedAt: now, strategy: entry.strategy });
        used.add(next.at(-1).color);
      }
      if (next.length > MAX_TEAMS) return { error: M(cfg, `A game can have at most ${MAX_TEAMS} teams.`, `Oyunda en fazla ${MAX_TEAMS} takım olabilir.`) };
      s.teams = next; s.nextTeamId = nextId;
      return done;
    }
    // The moderator adds each team by name in the lobby; its workbook arrives on its own card.
    case 'excel-add-team': {
      if (s.inputMode !== 'excel') return { error: M(cfg, 'Excel intake is not enabled for this game.', 'Bu oyunda Excel ile takım alımı açık değil.') };
      if (s.phase === 'race') return { error: M(cfg, 'The race has started. New teams can’t join.', 'Yarış başladı. Yeni takım katılamaz.') };
      if (s.teams.length >= MAX_TEAMS) return { error: M(cfg, `A game can have at most ${MAX_TEAMS} teams.`, `Oyunda en fazla ${MAX_TEAMS} takım olabilir.`) };
      const name = clean(action.name).slice(0, 16);
      if (name.length < 2) return { error: M(cfg, 'The team name must be at least 2 characters.', 'Takım adı en az 2 karakter olmalı.') };
      if (s.teams.some(team => upperOf(team.name, cfg.lang) === upperOf(name, cfg.lang))) return { error: M(cfg, `“${name}” is taken. Pick another name.`, `“${name}” adı alınmış. Başka bir ad seç.`) };
      const used = new Set(s.teams.map(team => team.color)), usedEmblems = new Set(s.teams.map(team => team.emblem));
      const id = s.nextTeamId++;
      s.teams.push({ id, owner: null, name, code: teamCode(s, name, id), emblem: [...Array(EMBLEM_COUNT).keys()].find(e => !usedEmblems.has(e)) ?? id % EMBLEM_COUNT,
        color: TEAM_COLORS.find(color => !used.has(color)) || TEAM_COLORS[id % TEAM_COLORS.length], connected: true, locked: false,
        revision: false, excel: true, joinedAt: now, strategy: defaultStrategy(name, cfg) });
      return done;
    }
    // A team joins from its own device: it claims the card the moderator already made under that name,
    // or opens a new one. Before the race it can rename itself; the name stays unique.
    case 'excel-join': {
      if (s.inputMode !== 'excel') return { error: M(cfg, 'Excel intake is not enabled for this game.', 'Bu oyunda Excel ile takım alımı açık değil.') };
      if (role !== 'player' || !ctx.playerId) return { error: M(cfg, 'A team joins from its own device.', 'Takım kendi cihazından katılır.') };
      if (s.phase === 'race') return { error: M(cfg, 'The race has started. New teams can’t join.', 'Yarış başladı. Yeni takım katılamaz.') };
      const name = clean(action.name).slice(0, 16), key = upperOf(name, cfg.lang);
      if (name.length < 2) return { error: M(cfg, 'The team name must be at least 2 characters.', 'Takım adı en az 2 karakter olmalı.') };
      const same = s.teams.find(team => upperOf(team.name, cfg.lang) === key);
      if (same && same !== mine && (same.owner || same.ai)) return { error: M(cfg, `“${name}” is taken. Pick another name.`, `“${name}” adı alınmış. Başka bir ad seç.`) };
      if (same && same !== mine) {
        if (mine) s.teams = s.teams.filter(team => team !== mine);
        same.owner = ctx.playerId; same.connected = true;
        return done;
      }
      if (mine) { mine.name = name; mine.code = teamCode(s, name, mine.id); mine.connected = true; return done; }
      if (s.teams.length >= MAX_TEAMS) return { error: M(cfg, `A game can have at most ${MAX_TEAMS} teams.`, `Oyunda en fazla ${MAX_TEAMS} takım olabilir.`) };
      const used = new Set(s.teams.map(team => team.color)), usedEmblems = new Set(s.teams.map(team => team.emblem));
      const id = s.nextTeamId++;
      s.teams.push({ id, owner: ctx.playerId, name, code: teamCode(s, name, id), emblem: [...Array(EMBLEM_COUNT).keys()].find(e => !usedEmblems.has(e)) ?? id % EMBLEM_COUNT,
        color: TEAM_COLORS.find(color => !used.has(color)) || TEAM_COLORS[id % TEAM_COLORS.length], connected: true, locked: false,
        revision: false, excel: true, joinedAt: now, strategy: defaultStrategy(name, cfg) });
      return done;
    }
    case 'excel-team-plan': {
      if (s.inputMode !== 'excel') return { error: M(cfg, 'Excel intake is not enabled for this game.', 'Bu oyunda Excel ile takım alımı açık değil.') };
      const team = s.teams.find(candidate => candidate.id === Number(action.teamId) && candidate.excel && !candidate.ai);
      if (!team) return { error: M(cfg, 'That team is not in this game.', 'Bu takım oyunda yok.') };
      if (role !== 'host' && (role !== 'player' || team !== mine)) return { error: M(cfg, 'A team can only hand in its own workbook.', 'Takım yalnızca kendi dosyasını teslim edebilir.') };
      const review = currentStrategyReview(s);
      if (s.phase === 'race' && !review) return { error: M(cfg, 'Plans can change only before the race or at a quarter review.', 'Planlar yalnızca yarıştan önce ya da çeyrek molasında değişebilir.') };
      // Once the decision window runs out, teams can't hand in from their own devices; the moderator still can (or adds time).
      if (role === 'player' && s.phase === 'decisions' && s.deadline && now > s.deadline) return { error: M(cfg, 'Time’s up for the decisions. Ask the moderator to add time.', 'Karar süresi doldu. Moderatörden süre eklemesini iste.') };
      if (role === 'player' && review && now > review.closesAt) return { error: M(cfg, 'The quarterly strategy review is closed.', 'Çeyrek strateji değerlendirmesi kapandı.') };
      const incoming = strategyFrom(action.strategy, team.strategy, cfg);
      if (incoming.error) return { error: M(cfg, `“${team.name}”: ${incoming.error}`, `“${team.name}”: ${incoming.error}`) };
      const strategy = review ? { ...structuredClone(team.strategy), ...Object.fromEntries(QUARTER_KEYS.map(key => [key, structuredClone(incoming[key])])) } : incoming;
      const errors = validate({ ...team, strategy }, cfg, msgLang ?? undefined);
      if (errors.length) return { error: M(cfg, `“${team.name}”: ${errors[0]}`, `“${team.name}”: ${errors[0]}`) };
      if (review) return commitQuarterStrategy(s, team, strategy, review, now);
      team.strategy = strategy; team.locked = true;
      return done;
    }
    case 'excel-quarter-submit': {
      if (s.inputMode !== 'excel') return { error: M(cfg, 'Excel intake is not enabled for this game.', 'Bu oyunda Excel ile takım alımı açık değil.') };
      const review = currentStrategyReview(s);
      if (!review || now > review.closesAt) return { error: M(cfg, 'The quarterly strategy review is closed.', 'Çeyrek strateji değerlendirmesi kapandı.') };
      if (!Array.isArray(action.teams) || !action.teams.length || action.teams.length > MAX_TEAMS) return { error: M(cfg, 'No team strategies were found in the workbook.', 'Çalışma kitabında takım stratejisi bulunamadı.') };
      const proposals = [], seen = new Set();
      for (const item of action.teams) {
        const name = clean(item?.name), key = upperOf(name, cfg.lang);
        const team = s.teams.find(candidate => candidate.excel && !candidate.ai && upperOf(candidate.name, cfg.lang) === key);
        if (!team) return { error: M(cfg, `“${name}” is not an Excel team in this game.`, `“${name}” bu oyunda Excel takımı olarak bulunamadı.`) };
        if (seen.has(team.id)) return { error: M(cfg, `“${team.name}” appears more than once in the upload.`, `“${team.name}” yüklemede birden fazla kez var.`) };
        seen.add(team.id);
        // Only the quarter levers move; everything else (names, product) stays as it was.
        const incoming = strategyFrom(item?.strategy, team.strategy, cfg);
        if (incoming.error) return { error: M(cfg, `“${team.name}”: ${incoming.error}`, `“${team.name}”: ${incoming.error}`) };
        const strategy = structuredClone(team.strategy);
        for (const field of QUARTER_KEYS) strategy[field] = structuredClone(incoming[field]);
        const errors = validate({ ...team, strategy }, cfg, msgLang ?? undefined);
        if (errors.length) return { error: M(cfg, `“${team.name}”: ${errors[0]}`, `“${team.name}”: ${errors[0]}`) };
        proposals.push({ team, strategy });
      }
      for (const proposal of proposals) commitQuarterStrategy(s, proposal.team, proposal.strategy, review, now);
      return done;
    }
    // The public host action is resolved asynchronously by the Durable Object.
    // Browser-side optimistic state stays unchanged while Jev is deciding.
    case 'add-ai-team':
      return { changed: false };
    case 'ai-team-create': {
      if (role !== 'system') return { error: M(cfg, 'AI teams can only be created by the game server.', 'AI takımları yalnızca oyun sunucusu tarafından oluşturulabilir.') };
      if (s.phase === 'race') return { error: M(cfg, 'The race has started. New teams can’t join.', 'Yarış başladı. Yeni takım katılamaz.') };
      if (s.teams.length >= MAX_TEAMS) return { error: M(cfg, `Room full: ${MAX_TEAMS} teams max.`, `Oda dolu: en fazla ${MAX_TEAMS} takım.`) };
      let name = clean(action.name).slice(0, 16) || 'Jev AI';
      const base = name;
      let suffix = 2;
      while (s.teams.some(team => upperOf(team.name, cfg.lang) === upperOf(name, cfg.lang))) name = `${base.slice(0, 13)} ${suffix++}`;
      const emblem = Number.isInteger(Number(action.emblem)) ? Math.max(0, Math.min(EMBLEM_COUNT - 1, Number(action.emblem))) : 0;
      const used = new Set(s.teams.map(team => team.color));
      const id = s.nextTeamId++;
      const strategy = strategyFrom(action.strategy, defaultStrategy(name, cfg), cfg);
      if (strategy.error) return { error: M(cfg, `Jev returned an invalid strategy: ${strategy.error}`, `Jev geçersiz bir strateji döndürdü: ${strategy.error}`) };
      const team = {
        id, owner: `ai-${id}`, name, code: teamCode(s, name, id), emblem,
        color: TEAM_COLORS.find(color => !used.has(color)) || TEAM_COLORS[id % TEAM_COLORS.length],
        connected: true, locked: true, revision: false, joinedAt: now, strategy,
        ai: { model: String(action.model || 'typesafe/jev-1.13').slice(0, 60), profile: String(action.profile || 'ai').slice(0, 30), confidence: Number.isFinite(Number(action.confidence)) ? Number(action.confidence) : null, decidedAt: now }
      };
      repairStrategy(team, cfg);
      const errors = validate(team, cfg, msgLang ?? undefined);
      if (errors.length) return { error: M(cfg, `Jev returned an invalid strategy: ${errors[0]}`, `Jev geçersiz bir strateji döndürdü: ${errors[0]}`) };
      s.teams.push(team);
      return done;
    }
    // The room server stores the image; the state only says which version each team has.
    case 'brochure-set': {
      if (role !== 'system') return { error: M(cfg, 'Brochures are uploaded through the room server.', 'Broşürler oda sunucusu üzerinden yüklenir.') };
      const team = s.teams.find(t => t.id === Number(action.teamId));
      if (!team) return { changed: false };
      team.brochure = action.brochure ? { v: Number(action.brochure.v), w: Number(action.brochure.w), h: Number(action.brochure.h) } : null;
      return done;
    }
    case 'presence': {
      if (role !== 'system' || !mine) return { changed: false };
      mine.connected = !!action.connected;
      return done;
    }
    case 'leave-team': {
      if (!mine) return { changed: false };
      if (s.phase === 'race') return { error: M(cfg, 'You can’t leave a team during the race.', 'Yarış sırasında takımdan ayrılınamaz.') };
      // An Excel team stays in the game without its device; the moderator can still run it.
      if (mine.excel) { mine.owner = null; return done; }
      s.teams = s.teams.filter(t => t !== mine);
      return done;
    }
    case 'remove-team': {
      if (s.phase === 'race') return { error: M(cfg, 'A team can’t be removed during the race.', 'Yarış sırasında takım çıkarılamaz.') };
      const before = s.teams.length;
      s.teams = s.teams.filter(t => t.id !== Number(action.teamId));
      return { changed: s.teams.length !== before };
    }

    // ——— Team decisions ———
    case 'strategy':
    case 'mix':
    case 'balance-mix': {
      if (!mine) return { error: M(cfg, 'Create your team first.', 'Önce takımını kur.') };
      if (!canEditTeam(s, mine, now)) return { error: mine.locked ? M(cfg, 'Your strategy is locked in.', 'Stratejin kilitli.') : s.phase === 'race' ? M(cfg, 'The race has started.', 'Yarış başladı.') : M(cfg, 'The decision window has closed.', 'Karar süresi doldu.') };
      const st = mine.strategy;
      if (type === 'strategy') {
        const key = action.key;
        const allowed = ['product', 'sentence', 'primary', 'secondary', 'region', 'price', 'coverage', 'deductible', 'risk', 'marketing', 'commission', 'service', 'reinsurance'];
        if (!allowed.includes(key)) return { error: M(cfg, 'Unknown decision.', 'Bilinmeyen karar.') };
        let value = action.value;
        if (['price', 'marketing', 'service', 'deductible', 'commission'].includes(key)) value = value === '' || value === null ? NaN : Number(value);
        if (key === 'reinsurance') value = !!value;
        if (key === 'product' || key === 'sentence') value = String(value ?? '').slice(0, key === 'product' ? 32 : 90);
        if (key === 'primary' && st.secondary === value) st.secondary = st.primary;
        st[key] = value;
        return done;
      }
      if (!['marketingMix', 'channels'].includes(action.key)) return { error: M(cfg, 'Unknown split.', 'Bilinmeyen dağılım.') };
      if (type === 'mix') {
        st[action.key][Number(action.index)] = action.value === '' || action.value === null ? NaN : Number(action.value);
        return done;
      }
      const arr = st[action.key].map(v => Math.max(0, Math.min(100, Math.round(Number(v) || 0))));
      let diff = 100 - arr.reduce((a, b) => a + b, 0);
      for (const i of arr.map((v, i) => i).sort((a, b) => arr[b] - arr[a])) { if (!diff) break; const next = Math.max(0, Math.min(100, arr[i] + diff)); diff -= next - arr[i]; arr[i] = next; }
      st[action.key] = arr;
      return done;
    }
    case 'quarter-strategy': {
      const review = currentStrategyReview(s);
      if (role !== 'player' || !mine || !review) return { error: M(cfg, 'The quarterly strategy review is not open.', 'Çeyrek strateji değerlendirmesi açık değil.') };
      if (!canEditTeam(s, mine, now)) return { error: M(cfg, 'Your quarterly plan has already been submitted.', 'Çeyrek planın zaten gönderildi.') };
      const key = action.key;
      const allowed = ['primary', 'secondary', 'price', 'coverage', 'risk', 'marketing', 'service', 'reinsurance'];
      if (!allowed.includes(key)) return { error: M(cfg, 'This decision stays fixed during the quarterly review.', 'Bu karar çeyrek değerlendirmesinde sabit kalır.') };
      let value = action.value;
      if (['price', 'marketing', 'service'].includes(key)) value = value === '' || value === null ? NaN : Number(value);
      if (key === 'reinsurance') value = !!value;
      if (key === 'primary' && mine.quarterDraft.secondary === value) mine.quarterDraft.secondary = mine.quarterDraft.primary;
      if (key === 'secondary' && mine.quarterDraft.primary === value) return { error: M(cfg, 'Primary and secondary targets must differ.', 'Ana ve ikincil hedef farklı olmalı.') };
      mine.quarterDraft[key] = value;
      return done;
    }
    case 'quarter-submit': {
      const review = currentStrategyReview(s);
      if (role !== 'player' || !mine || !review || !mine.quarterDraft) return { error: M(cfg, 'There is no quarterly plan to submit.', 'Gönderilecek bir çeyrek planı yok.') };
      if (review.submitted?.[mine.id]) return { error: M(cfg, 'Your quarterly plan has already been submitted.', 'Çeyrek planın zaten gönderildi.') };
      const result = commitQuarterStrategy(s, mine, mine.quarterDraft, review, now);
      if (result.error) return result;
      if (allReviewTeamsSubmitted(s, review)) closeStrategyReview(s, now);
      return done;
    }
    case 'quarter-ai-submit': {
      if (role !== 'system') return { error: M(cfg, 'AI revisions can only be submitted by the game server.', 'AI revizyonları yalnızca oyun sunucusu tarafından gönderilebilir.') };
      const review = currentStrategyReview(s), team = s.teams.find(t => t.id === Number(action.teamId));
      if (!review || !team?.ai || review.submitted?.[team.id]) return { changed: false };
      const incoming = strategyFrom(action.strategy, team.strategy, cfg);
      if (incoming.error) return { changed: false };
      const strategy = structuredClone(team.strategy);
      for (const key of QUARTER_KEYS) strategy[key] = structuredClone(incoming[key]);
      repairStrategy({ ...team, strategy }, cfg);
      const result = commitQuarterStrategy(s, team, strategy, review, now);
      if (result.error) return result;
      team.ai.decidedAt = now;
      if (allReviewTeamsSubmitted(s, review)) closeStrategyReview(s, now);
      return done;
    }
    case 'lock': {
      if (!mine) return { error: M(cfg, 'Create your team first.', 'Önce takımını kur.') };
      if (s.phase !== 'decisions') return { error: M(cfg, 'Locking in opens during the decision window.', 'Kilitleme karar süresinde açılır.') };
      if (!canEditTeam(s, mine, now)) return { error: mine.locked ? M(cfg, 'Your strategy is already locked in.', 'Strateji zaten kilitli.') : M(cfg, 'The decision window has closed.', 'Karar süresi doldu.') };
      const errors = validate(mine, s.config, msgLang ?? undefined);
      if (errors.length) return { error: errors[0] };
      mine.locked = true; mine.revision = false;
      return done;
    }

    // ——— Moderator: flow ———
    case 'phase': {
      const order = ['lobby', 'briefing', 'decisions'];
      if (!order.includes(action.to) || s.phase === 'race') return { error: M(cfg, 'Can’t move to that phase.', 'Bu aşamaya geçilemez.') };
      if (action.to !== 'lobby' && s.teams.length < MIN_TEAMS) return { error: M(cfg, `At least ${MIN_TEAMS} teams are needed to start.`, `Başlamak için en az ${MIN_TEAMS} takım gerekli.`) };
      s.phase = action.to;
      s.deadline = action.to === 'decisions' ? now + s.config.minutes * 60000 : null; // decision window: config.minutes (25 by default)
      return done;
    }
    case 'extend':
      if (s.phase !== 'decisions') return { changed: false };
      s.deadline = Math.max(now, s.deadline || now) + 300000;
      return done;
    case 'start-race': {
      if (s.phase !== 'decisions') return { error: M(cfg, 'Start the decision window first.', 'Önce karar süresini başlat.') };
      if (s.teams.length < MIN_TEAMS) return { error: M(cfg, `At least ${MIN_TEAMS} teams are needed to race.`, `Yarış için en az ${MIN_TEAMS} takım gerekli.`) };
      if (s.config.weights.reduce((a, b) => a + b, 0) !== 100) return { error: M(cfg, 'Score weights must total 100%. Rule studio → Scoring.', 'Puan ağırlıklarının toplamı %100 olmalı. Kural stüdyosu → Puanlama.') };
      const autoLocked = [];
      for (const t of s.teams) {
        const fixes = repairStrategy(t, s.config);
        if (!t.locked || fixes.length) autoLocked.push(t.name);
        t.locked = true; t.revision = false;
        t.strategyHistory = [{ effectiveMonth: 0, strategy: structuredClone(t.strategy), decidedAt: now }];
        delete t.quarterDraft;
      }
      let results;
      try { results = simulate(s.teams, s.config); } catch (e) { return { error: e.message }; }
      s.results = results;
      s.scales = seasonScales(results);
      s.phase = 'race';
      s.deadline = null;
      s.quiz.rounds = []; s.quiz.current = null;
      s.strategyReviews = { duration: s.strategyReviews?.duration || STRATEGY_REVIEW_MS / 1000, rounds: [], current: null };
      s.focusTeam = null;
      s.notice = autoLocked.length ? { kind: 'auto-locked', names: autoLocked, at: now } : null;
      startPlayback(s, now);
      if (s.reduce) s.playback.t0 = now - s.config.speed * 1000;
      return done;
    }
    case 'revision': {
      const team = s.teams.find(t => t.id === Number(action.teamId));
      if (!team || s.phase === 'race') return { error: M(cfg, 'Revision can’t be opened.', 'Revizyon açılamaz.') };
      team.locked = false; team.revision = true;
      if (s.deadline !== null && s.deadline <= now) s.deadline = now + 120000;
      return done;
    }
    case 'toggle-play': {
      if (!raceStarted(s) || currentRound(s) || currentStrategyReview(s)) return { changed: false };
      const h = playhead(s, now);
      if (h.month >= 11) return { changed: false };
      if (h.running || h.countdown !== null) s.playback = { base: h.month, t0: h.start, running: false };
      else resume(s, now);
      return done;
    }
    case 'next-month': {
      if (!raceStarted(s) || currentRound(s) || currentStrategyReview(s)) return { changed: false };
      const h = playhead(s, now);
      if (h.month >= 11) return { changed: false };
      const asked = new Set(s.quiz.rounds.map(r => r.month));
      if (h.month >= 0 && quizMonths(s).includes(h.month) && !asked.has(h.month)) { openRound(s, h, now); return done; }
      const reviewed = new Set((s.strategyReviews?.rounds || []).map(r => r.month));
      if (h.month >= 0 && STRATEGY_REVIEW_MONTHS.includes(h.month) && !reviewed.has(h.month)) { openStrategyReview(s, h.month, now); return done; }
      s.playback = { base: h.month + 1, t0: now, running: false };
      return done;
    }
    case 'skip-countdown':
      if (!s.playback || playhead(s, now).month !== -1) return { changed: false };
      s.playback.t0 = now - s.config.speed * 1000;
      return done;
    case 'show-final':
      if (playhead(s, now).month !== 11) return { error: M(cfg, 'The final opens once all twelve months are complete.', 'Final on iki ay tamamlandığında açılır.') };
      s.stageLayer = 'final'; s.finalShown = true;
      return done;
    case 'stage-race':
      s.stageLayer = 'race'; s.finalShown = true;
      return done;
    case 'replay':
      if (!raceStarted(s)) return { changed: false };
      s.quiz.current = null;
      startPlayback(s, now);
      return done;
    case 'new-game': {
      const keep = s.teams.map(t => { const copy = { ...t, locked: !!t.ai || !!t.excel, revision: false, strategy: t.ai || t.excel ? structuredClone(t.strategy) : defaultStrategy(t.name, cfg) }; delete copy.strategyHistory; delete copy.quarterDraft; return copy; });
      const { quiz, config, sound, reduce: reduceMotion, code, nextTeamId, inputMode } = s;
      const fresh = freshSession(now, { code, lang: config?.lang, preset: config?.preset, inputMode });
      Object.keys(s).forEach(k => delete s[k]);
      Object.assign(s, fresh, { teams: keep, nextTeamId, config, sound, reduce: reduceMotion, quiz: { ...quiz, rounds: [], current: null } });
      return done;
    }
    case 'metric':
      if (!['score', 'share', 'profit'].includes(action.metric)) return { changed: false };
      s.metric = action.metric;
      return done;
    case 'focus':
      s.focusTeam = action.teamId === null || action.teamId === undefined ? null : Number(action.teamId);
      return done;

    // ——— Moderator: settings ———
    case 'config': {
      const k = action.key;
      if (k === 'speed') {
        const v = Number(action.value);
        if (![3, 4, 6, 8, 12].includes(v)) return { error: M(cfg, 'Invalid speed.', 'Geçersiz hız.') };
        const h = playhead(s, now);
        s.config.speed = v;
        if (s.playback) s.playback = { base: h.month, t0: h.start, running: s.playback.running };
        return done;
      }
      if (s.phase === 'race') return { error: M(cfg, 'The scenario can’t change once the race has started.', 'Yarış başladıktan sonra senaryo değiştirilemez.') };
      const ranges = { year: [2000, 2100], minutes: [1, 90], seed: [1, 999999] };
      if (k === 'branch') { const v = clean(action.value).slice(0, 30); if (v) s.config.branch = v; return done; }
      if (k === 'lang') {
        const nextLang = action.value;
        if (nextLang !== 'en' && nextLang !== 'tr') return { error: M(cfg, 'Unknown language.', 'Bilinmeyen dil.') };
        if (nextLang === cfg.lang) return { changed: false };
        const oldLang = cfg.lang;
        relocalizeDefaults(s.config, scenario(oldLang, cfg.preset), scenario(nextLang, cfg.preset));
        if (s.quiz.questions) relocalizeDefaults(s.quiz.questions, questionsFor(oldLang, cfg.preset), questionsFor(nextLang, cfg.preset));
        for (const team of s.teams) {
          if (team.strategy.product === `${team.name} ${presetName(cfg.preset, oldLang)}`)
            team.strategy.product = `${team.name} ${presetName(cfg.preset, nextLang)}`;
        }
        s.config.lang = nextLang;
        return done;
      }
      if (!ranges[k]) return { error: M(cfg, 'Unknown setting.', 'Bilinmeyen ayar.') };
      const v = Number(action.value);
      if (!Number.isFinite(v) || v < ranges[k][0] || v > ranges[k][1]) return { error: M(cfg, `Enter a value between ${ranges[k][0]} and ${ranges[k][1]}.`, `Değeri ${ranges[k][0]}–${ranges[k][1]} aralığında girin.`) };
      s.config[k] = k === 'seed' ? Math.round(v) : v;
      if (k === 'minutes' && s.phase === 'decisions') s.deadline = now + v * 60000;
      return done;
    }
    case 'setting':
      if (!['reduce', 'sound'].includes(action.key)) return { changed: false };
      s[action.key] = !!action.value;
      return done;
    case 'weight': {
      if (s.phase === 'race') return { error: M(cfg, 'The race has started.', 'Yarış başladı.') };
      const v = Number(action.value);
      if (!Number.isFinite(v) || v < 0 || v > 100) return { error: M(cfg, 'Enter a weight between 0 and 100.', 'Ağırlığı 0–100 aralığında girin.') };
      if (![0, 1].includes(Number(action.index))) return { changed: false };
      s.config.weights[Number(action.index)] = v;
      return done;
    }
    case 'assumption': {
      if (s.phase === 'race') return { error: M(cfg, 'The race has started.', 'Yarış başladı.') };
      const def = s.config.assumptions[action.key], v = Number(action.value);
      if (!def || !Number.isFinite(v) || v < def.min || v > def.max) return { error: M(cfg, 'Enter the assumption within its allowed range.', 'Varsayımı izin verilen aralıkta girin.') };
      // A bigger market needs bigger budgets: money moves with the policy count, keeping its proportions.
      if (action.key === 'policies' && def.value > 0) {
        const k = v / def.value;
        for (const key of ['budget', 'fixedCost']) if (s.config.assumptions[key]) s.config.assumptions[key].value = Math.round(s.config.assumptions[key].value * k / 1000) * 1000;
        for (const team of s.teams) if (team.excel || team.ai) team.strategy.marketing = Math.round(team.strategy.marketing * k);
      }
      s.config.assumptions[action.key].value = v;
      return done;
    }
    case 'event': {
      if (s.phase === 'race') return { error: M(cfg, 'The race has started.', 'Yarış başladı.') };
      const ev = s.config.events[Number(action.index)];
      if (!ev) return { changed: false };
      if (action.prop === 'title') { const v = String(action.value).trim().slice(0, 70); if (!v) return { error: M(cfg, 'The event title can’t be empty.', 'Olay başlığı boş olamaz.') }; ev.title = v; }
      else if (action.prop === 'description') ev.description = String(action.value).trim().slice(0, 220);
      else if (action.prop === 'scope') { if (EVENT_SCOPES.some(x => x.id === action.value)) ev.scope = action.value; }
      else if (action.prop === 'month') ev.month = Math.max(0, Math.min(11, Number(action.value) | 0));
      else if (action.prop === 'duration') ev.duration = Math.max(1, Math.min(12, Number(action.value) | 0));
      else if (['cost', 'demand'].includes(action.prop)) {
        const v = Number(action.value);
        if (!Number.isFinite(v) || v < 0.5 || v > 2) return { error: M(cfg, 'The event multiplier must be between 0.5 and 2.', 'Olay çarpanı 0,5–2 aralığında olmalı.') };
        ev[action.prop] = v;
      }
      return done;
    }
    case 'import-config': {
      if (s.phase === 'race') return { error: M(cfg, 'The race has started.', 'Yarış başladı.') };
      try { s.config = checkedConfig(action.config, cfg?.lang); } catch (e) { return { error: e.message }; }
      if (action.quiz && typeof action.quiz === 'object') {
        const q = action.quiz;
        if (QUIZ_MODES[q.mode]) s.quiz.mode = q.mode;
        if ([10, 15, 20, 30].includes(q.duration)) s.quiz.duration = q.duration;
        if ([0, 1, 2, 3, 5].includes(q.bonus)) s.quiz.bonus = q.bonus;
        if (typeof q.auto === 'boolean') s.quiz.auto = q.auto;
        if (['shuffle', 'fixed'].includes(q.order)) s.quiz.order = q.order;
        if (Array.isArray(q.questions)) s.quiz.questions = q.questions.slice(0, 60).map(cleanQuestion);
      }
      s.teams.forEach(t => { if (t.locked) { t.locked = false; t.revision = true; } });
      return done;
    }

    // ——— Quiz round ———
    case 'quiz-config': {
      const q = s.quiz, started = s.phase === 'race' && q.rounds.length > 0;
      if (action.key === 'mode' && QUIZ_MODES[action.value]) { if (started) return { error: M(cfg, 'The quiz frequency can’t change during the race.', 'Yarış sırasında soru sıklığı değiştirilemez.') }; q.mode = action.value; }
      else if (action.key === 'duration' && [10, 15, 20, 30].includes(Number(action.value))) q.duration = Number(action.value);
      else if (action.key === 'bonus' && [0, 1, 2, 3, 5].includes(Number(action.value))) { if (started) return { error: M(cfg, 'The bonus can’t change during the race.', 'Yarış sırasında bonus değiştirilemez.') }; q.bonus = Number(action.value); }
      else if (action.key === 'auto') q.auto = !!action.value;
      else if (action.key === 'order' && ['shuffle', 'fixed'].includes(action.value)) { if (started) return { error: M(cfg, 'The question order can’t change during the race.', 'Yarış sırasında soru sırası değiştirilemez.') }; q.order = action.value; }
      else return { error: M(cfg, 'Invalid quiz setting.', 'Geçersiz soru ayarı.') };
      return done;
    }
    case 'answer': {
      const round = currentRound(s);
      if (!round || round.revealedAt || now > round.closesAt) return { error: M(cfg, 'Time’s up for this question.', 'Bu soru için süre doldu.') };
      if (role !== 'player' || !mine) return { error: M(cfg, 'Answers are given from a team device.', 'Cevaplar takım cihazından verilir.') };
      if (Object.values(round.answers).some(a => a.teamId === mine.id)) return { error: M(cfg, 'Your team has already answered.', 'Takımının cevabı zaten alındı.') };
      const choice = Number(action.choice);
      if (![0, 1, 2, 3].includes(choice)) return { error: M(cfg, 'Invalid option.', 'Geçersiz şık.') };
      round.answers[ctx.playerId] = { choice, at: now, teamId: mine.id };
      const active = s.teams.filter(t => t.connected);
      if (active.length && active.every(t => Object.values(round.answers).some(a => a.teamId === t.id))) revealRound(s, now);
      return done;
    }
    case 'ai-answer': {
      const round = currentRound(s), team = s.teams.find(t => t.id === Number(action.teamId));
      if (role !== 'system') return { error: M(cfg, 'AI answers can only come from the game server.', 'AI cevapları yalnızca oyun sunucusundan gelebilir.') };
      if (!round || round.revealedAt || now > round.closesAt || !team?.ai) return { changed: false };
      if (Object.values(round.answers).some(answer => answer.teamId === team.id)) return { changed: false };
      const choice = Number(action.choice);
      if (![0, 1, 2, 3].includes(choice)) return { error: M(cfg, 'Invalid AI answer.', 'Geçersiz AI cevabı.') };
      round.answers[`ai-${team.id}`] = { choice, at: Math.max(round.openedAt, Math.min(now, round.closesAt)), teamId: team.id };
      const active = s.teams.filter(t => t.connected);
      if (active.length && active.every(t => Object.values(round.answers).some(answer => answer.teamId === t.id))) revealRound(s, now);
      return done;
    }
    case 'quiz-close':
      if (!currentRound(s) || currentRound(s).revealedAt) return { changed: false };
      revealRound(s, now);
      return done;
    case 'quiz-continue': {
      const round = currentRound(s);
      if (!round) return { changed: false };
      if (!round.revealedAt) revealRound(s, now);
      s.quiz.current = null;
      continueAfterQuiz(s, round.month, now);
      return done;
    }
    case 'quarter-close':
      return { changed: closeStrategyReview(s, now) };

    // ——— Rule studio ———
    case 'rule': {
      if (s.phase === 'race') return { error: M(cfg, 'Rules can’t change while the race is running.', 'Yarış sürerken kurallar değiştirilemez.') };
      if (!s.config.rules) s.config.rules = defaultRules(cfg?.lang, cfg?.preset);
      if (!s.config.rules.campaign) s.config.rules.campaign = defaultRules(cfg?.lang, cfg?.preset).campaign; // rooms from before the campaign
      const checked = checkRule(s.config.rules, action.path, action.value, cfg?.lang);
      if (checked.error) return checked;
      setPath(s.config.rules, action.path, checked.value);
      return done;
    }
    case 'rules-reset': {
      if (s.phase === 'race') return { error: M(cfg, 'Rules can’t change while the race is running.', 'Yarış sürerken kurallar değiştirilemez.') };
      const defaults = defaultRules(cfg?.lang, cfg?.preset);
      if (!s.config.rules) s.config.rules = defaultRules(cfg?.lang, cfg?.preset);
      const keys = Array.isArray(action.keys) ? action.keys : Object.keys(defaults);
      for (const k of keys) if (k in defaults) s.config.rules[k] = defaults[k];
      if (action.scoring) { s.config.weights = [50, 50]; const a = assumptionsFor(cfg?.lang); for (const k of ['profitFloor', 'profitTarget', 'shareTarget']) s.config.assumptions[k] = { ...a[k] }; }
      if (action.market) { const a = assumptionsFor(cfg?.lang); for (const k of ['policies', 'budget', 'fixedCost']) s.config.assumptions[k] = { ...a[k] }; }
      if (action.events) s.config.events = scenario(cfg?.lang, cfg?.preset).events;
      return done;
    }
    case 'weights-normalize': {
      if (s.phase === 'race') return { error: M(cfg, 'The race has started.', 'Yarış başladı.') };
      const w = s.config.weights, total = w.reduce((a, b) => a + b, 0);
      if (!total) { s.config.weights = [50, 50]; return done; }
      const scaled = w.map(v => Math.floor(v / total * 100));
      scaled[scaled.indexOf(Math.max(...scaled))] += 100 - scaled.reduce((a, b) => a + b, 0);
      s.config.weights = scaled;
      return done;
    }
    case 'event-add': {
      if (s.phase === 'race') return { error: M(cfg, 'The race has started.', 'Yarış başladı.') };
      if (s.config.events.length >= 12) return { error: M(cfg, 'At most 12 events can be added.', 'En fazla 12 olay eklenebilir.') };
      s.config.events.push({ month: 6, duration: 1, title: M(cfg, 'New market event', 'Yeni piyasa olayı', cfg.lang), description: M(cfg, 'The text shown to teams for this event.', 'Olayın takımlara açıklanacak metni.', cfg.lang), cost: 1, demand: 1, scope: 'all' });
      return done;
    }
    case 'event-remove': {
      if (s.phase === 'race') return { error: M(cfg, 'The race has started.', 'Yarış başladı.') };
      const i = Number(action.index);
      if (!s.config.events[i]) return { changed: false };
      s.config.events.splice(i, 1);
      return done;
    }
    case 'question-add': {
      if (s.phase === 'race') return { error: M(cfg, 'The question bank can’t change while the race is running.', 'Yarış sürerken soru bankası değiştirilemez.') };
      if (!s.quiz.questions) s.quiz.questions = structuredClone(questionsFor(cfg?.lang, cfg?.preset));
      if (s.quiz.questions.length >= 60) return { error: M(cfg, 'The question bank can hold at most 60 questions.', 'Soru bankasında en fazla 60 soru olabilir.') };
      const wanted = typeof action.id === 'string' && /^[a-z0-9-]{3,40}$/.test(action.id) && !s.quiz.questions.some(q => q.id === action.id) ? action.id : null;
      s.quiz.questions.push({ id: wanted || `q-${now.toString(36)}-${s.quiz.questions.length}`, text: '', options: ['', '', '', ''], correct: 0, explain: '', enabled: true });
      return done;
    }
    case 'question-update': {
      if (s.phase === 'race') return { error: M(cfg, 'The question bank can’t change while the race is running.', 'Yarış sürerken soru bankası değiştirilemez.') };
      if (!s.quiz.questions) s.quiz.questions = structuredClone(questionsFor(cfg?.lang, cfg?.preset));
      const q = s.quiz.questions.find(x => x.id === action.id);
      if (!q) return { error: M(cfg, 'Question not found.', 'Soru bulunamadı.') };
      const v = action.value;
      if (action.key === 'text') q.text = String(v ?? '').slice(0, 160);
      else if (action.key === 'explain') q.explain = String(v ?? '').slice(0, 240);
      else if (action.key === 'option' && [0, 1, 2, 3].includes(Number(action.index))) q.options[Number(action.index)] = String(v ?? '').slice(0, 90);
      else if (action.key === 'correct' && [0, 1, 2, 3].includes(Number(v))) q.correct = Number(v);
      else if (action.key === 'enabled') q.enabled = !!v;
      else return { error: M(cfg, 'Invalid question field.', 'Geçersiz soru alanı.') };
      return done;
    }
    case 'question-remove': {
      if (s.phase === 'race') return { error: M(cfg, 'The question bank can’t change while the race is running.', 'Yarış sürerken soru bankası değiştirilemez.') };
      const list = questionsOf(s), before = list.length;
      s.quiz.questions = list.filter(q => q.id !== action.id);
      return { changed: s.quiz.questions.length !== before };
    }
    case 'question-move': {
      if (s.phase === 'race') return { error: M(cfg, 'The question bank can’t change while the race is running.', 'Yarış sürerken soru bankası değiştirilemez.') };
      const list = [...questionsOf(s)], i = list.findIndex(q => q.id === action.id), j = i + (action.dir === 'up' ? -1 : 1);
      if (i < 0 || j < 0 || j >= list.length) return { changed: false };
      [list[i], list[j]] = [list[j], list[i]];
      s.quiz.questions = list;
      return done;
    }
    case 'questions-reset':
      if (s.phase === 'race') return { error: M(cfg, 'The question bank can’t change while the race is running.', 'Yarış sürerken soru bankası değiştirilemez.') };
      s.quiz.questions = structuredClone(questionsFor(cfg?.lang, cfg?.preset));
      return done;

    case 'tick': {
      const round = currentRound(s);
      const review = currentStrategyReview(s);
      if (round && !round.revealedAt && now >= round.closesAt) { revealRound(s, now); return done; }
      if (round?.revealedAt && s.quiz.auto && now >= round.revealedAt + REVEAL_MS) { s.quiz.current = null; continueAfterQuiz(s, round.month, now); return done; }
      if (review && now >= review.closesAt) { closeStrategyReview(s, now); return done; }
      if (!round && !review && raceStarted(s)) {
        const h = playhead(s, now);
        if (h.waiting) {
          const asked = new Set(s.quiz.rounds.map(r => r.month));
          if (quizMonths(s).includes(h.month) && !asked.has(h.month)) openRound(s, h, now);
          else openStrategyReview(s, h.month, now);
          return done;
        }
        if (h.month === 11 && !s.finalShown && s.stageLayer === 'race' && now >= h.start + h.step + FINAL_DELAY_MS) { s.stageLayer = 'final'; s.finalShown = true; return done; }
      }
      return { changed: false };
    }
    default:
      return { error: M(cfg, `Unknown action: ${type}`, `Bilinmeyen işlem: ${type}`) };
  }
}

// ——— Client-specific view (privacy) ———
// who: { role: 'host' | 'stage' | 'player', playerId }
export function viewFor(s, who, now) {
  if (who.role === 'host') return { ...s, myTeamId: null };
  const mine = teamOf(s, who.playerId);
  const h = playhead(s, now);
  const seasonOver = raceStarted(s) && h.month === 11;
  const view = { ...s, myTeamId: mine ? mine.id : null };
  view.strategyReviews = {
    ...s.strategyReviews,
    rounds: (s.strategyReviews?.rounds || []).map(review => {
      const { initialStrategies, ...publicReview } = review;
      return publicReview;
    })
  };
  view.teams = s.teams.map(t => {
    if (t === mine) return t;
    const pub = { ...t, owner: null, quarterDraft: null };
    if (seasonOver) return pub;
    return { ...pub, strategy: { _hidden: true, product: t.strategy.product, sentence: t.strategy.sentence } };
  });
  view.results = s.results.slice(0, Math.max(0, h.month + 1));
  view.config = { ...s.config, events: s.config.events.filter(e => raceStarted(s) && e.month <= h.month) };
  const roundQids = new Set(s.quiz.rounds.map(r => r.qid));
  view.quiz = {
    ...s.quiz,
    // Teams and viewers only get questions that have been asked; the correct option and explanation ship once the result is revealed.
    questions: questionsOf(s).filter(q => roundQids.has(q.id)).map(q => {
      const revealed = s.quiz.rounds.some(r => r.qid === q.id && r.revealedAt);
      return revealed ? q : { id: q.id, text: q.text, options: q.options };
    }),
    rounds: s.quiz.rounds.map(r => {
      const open = !r.revealedAt;
      const counts = [0, 0, 0, 0];
      Object.values(r.answers).forEach(a => { counts[a.choice]++; });
      const own = mine ? Object.entries(r.answers).find(([, a]) => a.teamId === mine.id) : null;
      return {
        month: r.month, qid: r.qid, openedAt: r.openedAt, closesAt: r.closesAt, revealedAt: r.revealedAt,
        answeredTeams: Object.values(r.answers).map(a => a.teamId),
        counts: open ? null : counts,
        teamPoints: open ? {} : r.teamPoints, bonus: open ? {} : r.bonus,
        answers: own ? { [own[0]]: open ? { choice: own[1].choice, at: own[1].at, teamId: own[1].teamId } : own[1] } : {}
      };
    })
  };
  return view;
}
