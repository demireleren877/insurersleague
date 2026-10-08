// Client state. The Cloudflare room owns the game: the client sends actions over WebSocket,
// applies its own actions instantly (optimistic), and reconciles with the state the server sends back.
import * as game from './game.js';
import { getLang, t } from './i18n.js';

const HOST_KEY = 'risk-arenasi:host:v4';
const PLAYER_KEY = 'risk-arenasi:player:v4';
const STEP_KEY = 'risk-arenasi:step:v4';

const listeners = new Set();
export const subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = (source, detail) => listeners.forEach(fn => fn(source, detail));

// ——— Session ———
let session = { role: 'none', pin: null, playerId: null, connection: 'idle' };
export const getSession = () => session;

let state = game.freshSession(Date.now());
let offset = 0; // server clock − local clock
export const now = () => Date.now() + offset;
export const getState = () => state;

// ——— Derived ———
let scoredCache = { key: null, value: [] };
const invalidate = () => { scoredCache.key = null; };
export function results() {
  const key = `${state.updatedAt}|${state.results.length}|${state.quiz.rounds.map(r => r.revealedAt).join(',')}`;
  if (scoredCache.key !== key) scoredCache = { key, value: game.scoredResults(state) };
  return scoredCache.value;
}
export function playhead() {
  const h = game.playhead(state, now());
  // The client only knows about published months; wait at the last one until the boundary broadcast arrives.
  if (h.month >= state.results.length) return { ...h, month: state.results.length - 1 };
  return h;
}
export const raceStarted = () => game.raceStarted(state);
export const timeLeft = () => game.timeLeft(state, now());
export const seasonDone = () => raceStarted() && playhead().month === 11 && state.results.length === 12;
export const teamStatus = team => game.teamStatus(state, team, now(), getLang());
export const currentRound = () => game.currentRound(state);
export const currentStrategyReview = () => game.currentStrategyReview(state);
export const strategyReviewTimeLeft = () => game.strategyReviewTimeLeft(state, now());
export const isHost = () => session.role === 'host';
export function myTeam() {
  if (state.myTeamId === null || state.myTeamId === undefined) return null;
  return state.teams.find(t => t.id === state.myTeamId) || null;
}
export const canEdit = team => game.canEditTeam(state, team, now());
export const answeredTeams = round => round.answeredTeams ?? Object.values(round.answers || {}).map(a => a.teamId);

// Strategy step (per-tab)
export const getStep = () => { try { return Number(sessionStorage.getItem(STEP_KEY) || 0); } catch { return 0; } };
export const setStep = step => { try { sessionStorage.setItem(STEP_KEY, String(step)); } catch { /* ignore */ } };

// ——— Dispatching actions ———
let socket = null, seq = 0, pending = [], outbox = [], flushTimer = null, reconnectTimer = null, attempts = 0, pingTimer = null, bestRtt = Infinity;
const COALESCE = new Set(['strategy', 'mix']);

export function dispatch(action) {
  if (session.role === 'none') return { error: t('You\u2019re not connected to a game.', 'Bir oyuna bağlı değilsin.') };
  if (session.role === 'stage') return { error: t('This screen is in view-only mode.', 'Bu ekran yalnızca izleme modunda.') };
  const ctx = { role: session.role, playerId: session.playerId, now: now(), lang: getLang() };
  const draft = structuredClone(state);
  const result = game.reduce(draft, action, ctx);
  if (result?.error) return result;
  state = draft; invalidate();
  const entry = { seq: ++seq, action };
  if (COALESCE.has(action.type)) {
    const same = x => x.action.type === action.type && x.action.key === action.key && x.action.index === action.index;
    outbox = outbox.filter(x => !same(x));
    pending = pending.filter(x => !(same(x) && !x.sent));
  }
  pending.push(entry); outbox.push(entry);
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, COALESCE.has(action.type) ? 120 : 0);
  emit('local');
  return result;
}

function flush() {
  if (!socket || socket.readyState !== 1) return;
  for (const entry of outbox) { socket.send(JSON.stringify({ t: 'action', seq: entry.seq, action: entry.action, lang: getLang() })); entry.sent = true; }
  outbox = [];
}

// ——— Connection ———
function connect(params) {
  clearTimeout(reconnectTimer); clearInterval(pingTimer);
  if (socket) { socket.onclose = null; socket.close(); }
  session.connection = attempts ? 'reconnecting' : 'connecting'; emit('connection');
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/${session.pin}?${new URLSearchParams(params)}`);
  socket = ws;
  ws.onopen = () => {
    attempts = 0; bestRtt = Infinity;
    session.connection = 'open'; emit('connection');
    outbox = pending.filter(p => !outbox.includes(p)).concat(outbox);
    flush();
    ping(); pingTimer = setInterval(ping, 15000);
  };
  ws.onmessage = e => {
    let msg; try { msg = JSON.parse(e.data); } catch { return; }
    const received = Date.now();
    if (msg.t === 'pong') {
      const rtt = received - msg.id;
      if (rtt < bestRtt) { bestRtt = rtt; offset = msg.serverNow - (msg.id + rtt / 2); }
      return;
    }
    if (msg.t === 'error') { emit('error', msg.message); return; }
    if (msg.t === 'closed') { session.connection = 'closed'; emit('connection', msg.message); return; }
    if (msg.t !== 'state') return;
    if (bestRtt === Infinity) offset = msg.serverNow - received;
    pending = pending.filter(p => p.seq > msg.ack);
    const next = msg.state;
    for (const p of pending) game.reduce(next, p.action, { role: session.role, playerId: session.playerId, now: now() });
    state = next; invalidate();
    emit('remote');
  };
  ws.onclose = () => {
    if (socket !== ws || session.connection === 'closed') return;
    clearInterval(pingTimer);
    session.connection = 'reconnecting'; emit('connection');
    reconnectTimer = setTimeout(() => connect(params), Math.min(8000, 500 * 2 ** attempts++));
  };
}
function ping() { if (socket?.readyState === 1) socket.send(JSON.stringify({ t: 'ping', id: Date.now() })); }

function goOnline(role, pin, params, playerId = null) {
  if (session.role === role && session.pin === pin && session.playerId === playerId && session.connection !== 'closed') return;
  session = { role, pin, playerId, connection: 'connecting' };
  state = game.freshSession(Date.now(), { code: pin });
  state.myTeamId = null;
  pending = []; outbox = []; attempts = 0; invalidate();
  connect(params);
}

export function disconnect() {
  clearTimeout(reconnectTimer); clearInterval(pingTimer);
  if (socket) { socket.onclose = null; socket.close(); socket = null; }
  session = { role: 'none', pin: null, playerId: null, connection: 'idle' };
  state = game.freshSession(Date.now()); invalidate();
  emit('connection');
}

async function api(path, options) {
  let r;
  try { r = await fetch(path, { cache: 'no-store', ...options }); } catch { throw Error(t('Couldn\u2019t reach the server. Check your internet connection.', 'Sunucuya ulaşılamadı. İnternet bağlantını kontrol et.')); }
  const data = await r.json().catch(() => ({}));
  // The server's words are English; the device words the known cases in its own language.
  if (r.status === 404) throw Error(t('No open game with this PIN. Check the PIN on stage.', 'Bu PIN ile açık bir oyun yok. Sahnedeki PIN’i kontrol et.'));
  if (r.status === 503) throw Error(t('Couldn\u2019t create a game. Try again.', 'Oyun kurulamadı. Tekrar dene.'));
  if (!r.ok) throw Error(t('Couldn\u2019t reach the server.', 'Sunucuya ulaşılamadı.'));
  return data;
}

// Moderator
export const savedHost = () => { try { return JSON.parse(localStorage.getItem(HOST_KEY)); } catch { return null; } };
export function forgetHost() { try { localStorage.removeItem(HOST_KEY); } catch { /* ignore */ } }
export async function createRoom() {
  const room = await api('/api/rooms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lang: getLang() }) });
  try { localStorage.setItem(HOST_KEY, JSON.stringify(room)); } catch { /* ignore */ }
  connectHost(room);
  return room;
}
export function connectHost(room = savedHost()) {
  if (!room) return false;
  goOnline('host', room.pin, { role: 'host', key: room.hostKey });
  return true;
}
export const connectStage = pin => goOnline('stage', pin, { role: 'stage' });

// Participant
export const roomInfo = pin => api(`/api/rooms/${pin}`);
export const savedPlayer = () => { try { return JSON.parse(sessionStorage.getItem(PLAYER_KEY)); } catch { return null; } };
export function connectPlayer(pin) {
  const saved = savedPlayer();
  const playerId = saved?.pin === pin ? saved.playerId : [...crypto.getRandomValues(new Uint8Array(12))].map(b => b.toString(16).padStart(2, '0')).join('');
  try { sessionStorage.setItem(PLAYER_KEY, JSON.stringify({ pin, playerId })); } catch { /* ignore */ }
  goOnline('player', pin, { role: 'player', player: playerId }, playerId);
}
export function resumePlayer() {
  const saved = savedPlayer();
  if (!saved) return false;
  goOnline('player', saved.pin, { role: 'player', player: saved.playerId }, saved.playerId);
  return true;
}
export function forgetPlayer() {
  try { sessionStorage.removeItem(PLAYER_KEY); sessionStorage.removeItem(STEP_KEY); } catch { /* ignore */ }
  disconnect();
}

// ——— Brochures (images live on the room server; the state carries { v, w, h } per team) ———
export const brochureUrl = (teamId, brochure) => (brochure && session.pin ? `/api/rooms/${session.pin}/brochure/${teamId}?v=${brochure.v}` : null);
export async function sendBrochure(teamId, blob, w, h) {
  if (!session.pin) throw Error(t('You\u2019re not connected to a game.', 'Bir oyuna bağlı değilsin.'));
  const headers = { 'content-type': blob.type };
  if (session.role === 'host') headers['x-host-key'] = savedHost()?.hostKey || '';
  if (session.playerId) headers['x-player'] = session.playerId;
  let r;
  try { r = await fetch(`/api/rooms/${session.pin}/brochure/${teamId}?w=${w}&h=${h}`, { method: 'POST', headers, body: blob }); }
  catch { throw Error(t('Couldn\u2019t reach the server. Check your internet connection.', 'Sunucuya ulaşılamadı. İnternet bağlantını kontrol et.')); }
  if (!r.ok) throw Error((await r.json().catch(() => ({}))).error || t('The brochure was not saved.', 'Broşür kaydedilmedi.'));
}
