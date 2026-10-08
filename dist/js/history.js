// Session history: a compact record of every finished season, filed on the server under this
// device's private history code (and cached locally so the list opens offline).
import { rank, bookProfile } from '../engine.js';
import { archetypeKey } from './narrative.js';

const CODE_KEY = 'il-history-code';
const CACHE_KEY = 'il-history-cache';
const SAVED_KEY = 'il-history-saved';
const CODE_RE = /^[a-z0-9-]{16,64}$/;

const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ } };

export function historyCode() {
  let code = read(CODE_KEY, null);
  if (typeof code !== 'string' || !CODE_RE.test(code)) { code = crypto.randomUUID(); write(CODE_KEY, code); }
  return code;
}
export const validHistoryCode = code => CODE_RE.test(String(code || '').trim().toLowerCase());
export function useHistoryCode(code) {
  const clean = String(code).trim().toLowerCase();
  if (!CODE_RE.test(clean)) return false;
  write(CODE_KEY, clean); write(CACHE_KEY, []);
  return true;
}

export const cachedSessions = () => read(CACHE_KEY, []);

// The season's identity: its PIN plus the moment the race started, so a replay of the same
// season updates one record while "New game, same teams" files a new one.
const raceStart = s => { const starts = s.teams.map(t => t.strategyHistory?.[0]?.decidedAt).filter(Number.isFinite); return starts.length ? Math.min(...starts) : null; };
export const sessionId = s => (raceStart(s) ? `${s.code}-${raceStart(s)}` : null);

export function buildSummary(s, months, label = '') {
  const rows = rank(months[11].rows);
  const quarter = t => (t.strategyHistory?.length || 1) - 1;
  return {
    id: sessionId(s), at: raceStart(s) ?? Date.now(), code: s.code, label,
    preset: s.config.preset, lang: s.config.lang, year: s.config.year, weights: s.config.weights,
    teams: rows.map(r => {
      const team = s.teams.find(t => t.id === r.id), st = team.strategy;
      return {
        name: team.name, color: team.color, emblem: team.emblem, code: team.code, ai: team.ai?.profile ?? null,
        rank: r.rank, score: r.score, eligible: r.eligible, bonus: r.bonus || 0, profit: r.profit, share: r.share, combinedRatio: r.combinedRatio,
        style: archetypeKey(st, s.config), changes: quarter(team), lossRatio: r.lossRatio, priced: bookProfile(st, s.config).impliedLossRatio,
        strategy: { basePremium: st.basePremium, coef: st.coef, marketing: st.marketing, mediaShare: st.mediaShare, offers: st.offers, sentence: st.sentence }
      };
    })
  };
}

async function call(path = '', init) {
  const r = await fetch(`/api/history/${historyCode()}${path ? `/${path}` : ''}`, init);
  if (!r.ok) throw Error(String(r.status));
  return r.json();
}

export async function fetchSessions() {
  const { sessions } = await call();
  write(CACHE_KEY, sessions);
  return sessions;
}

export async function putSession(entry) {
  const cache = cachedSessions().filter(x => x.id !== entry.id);
  write(CACHE_KEY, [entry, ...cache].sort((a, b) => b.at - a.at));
  await call(entry.id, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(entry) });
}

export async function deleteSession(id) {
  write(CACHE_KEY, cachedSessions().filter(x => x.id !== id));
  await call(id, { method: 'DELETE' });
}

// Files the finished season once per device; later calls for the same season are no-ops.
// A failed upload is retried on a later call, at most once every 30 seconds.
let inFlight = null, lastFailure = 0;
const filed = new Set();
export async function archiveSeason(s, months) {
  const id = sessionId(s);
  if (!id || filed.has(id) || inFlight === id || Date.now() - lastFailure < 30000) return false;
  const saved = read(SAVED_KEY, []);
  if (saved.includes(id)) { filed.add(id); return false; }
  inFlight = id;
  try {
    const previous = cachedSessions().find(x => x.id === id);
    await putSession(buildSummary(s, months, previous?.label || ''));
    write(SAVED_KEY, [id, ...saved].slice(0, 400));
    filed.add(id);
    return true;
  } catch { lastFailure = Date.now(); return false; } finally { inFlight = null; }
}
