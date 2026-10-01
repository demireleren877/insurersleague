// INSURERS LEAGUE — online room server (Cloudflare Worker + Durable Object).
// Every PIN is a Room object. The room is the sole owner of game state; clients only send actions.
import { DurableObject } from 'cloudflare:workers';
import { freshSession, reduce, viewFor, nextWake, currentRound, currentStrategyReview, questionOf } from '../dist/js/game.js';
import { PRESET_IDS } from '../dist/engine.js';
import { JEV_MODEL, nextAiIdentity, buildJevRequest, strategyFromJev, buildJevQuizRequest, quizChoicesFromJev, aiProfile } from '../dist/js/jev.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const ROOM_TTL = 12 * 3600 * 1000;
const CANONICAL_HOST = 'insurersleague.demireleren.com';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // Keep one browser origin for saved moderator/player state. The workers.dev URL is
    // still available for API/WebSocket diagnostics, but page visits use the canonical app.
    if (url.hostname.endsWith('.workers.dev') && !url.pathname.startsWith('/api/') && !url.pathname.startsWith('/ws/')) {
      url.protocol = 'https:';
      url.host = CANONICAL_HOST;
      return Response.redirect(url.toString(), 308);
    }
    if (url.pathname === '/api/health') return json({ ok: true });

    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      const body = await request.clone().json().catch(() => ({}));
      const lang = body.lang === 'tr' ? 'tr' : 'en';
      const preset = PRESET_IDS[0];
      for (let i = 0; i < 6; i++) {
        const pin = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
        const res = await env.ROOMS.get(env.ROOMS.idFromName(pin)).fetch('https://room/init', { method: 'POST', body: JSON.stringify({ pin, lang, preset }) });
        if (res.status === 200) return res;
      }
      return json({ error: 'Couldn\u2019t create a room. Try again.' }, 503);
    }

    const info = url.pathname.match(/^\/api\/rooms\/(\d{6})$/);
    if (info) return env.ROOMS.get(env.ROOMS.idFromName(info[1])).fetch('https://room/info');

    // Session history: finished seasons, filed under the moderator device's private history code.
    const hist = url.pathname.match(/^\/api\/history\/([a-z0-9-]{16,64})(?:\/([a-z0-9-]{1,80}))?$/i);
    if (hist) return env.ARCHIVE.get(env.ARCHIVE.idFromName(hist[1].toLowerCase())).fetch(new Request(`https://archive/${hist[2] || ''}`, request));

    const ws = url.pathname.match(/^\/ws\/(\d{6})$/);
    if (ws) {
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket required', { status: 426 });
      return env.ROOMS.get(env.ROOMS.idFromName(ws[1])).fetch(request);
    }
    return env.ASSETS.fetch(request);
  }
};

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.env = env;
    this.state = null;
    this.hostKey = null;
    this.aiBusy = false;
    this.aiTurnBusy = false;
    ctx.blockConcurrencyWhile(async () => {
      this.state = (await ctx.storage.get('state')) || null;
      this.hostKey = (await ctx.storage.get('hostKey')) || null;
    });
  }

  live() { return this.state && Date.now() - this.state.updatedAt < ROOM_TTL; }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/init') {
      if (this.live()) return json({ error: 'busy' }, 409);
      const { pin, lang, preset } = await request.json();
      this.hostKey = crypto.randomUUID();
      this.state = freshSession(Date.now(), { code: pin, lang: lang === 'tr' ? 'tr' : 'en', preset });
      await this.persist();
      return json({ pin, hostKey: this.hostKey });
    }
    if (url.pathname === '/info') {
      if (!this.live()) return json({ error: 'No open game with this PIN. Check the PIN on stage.' }, 404);
      const s = this.state;
      return json({ pin: s.code, phase: s.phase, teams: s.teams.length, inputMode: 'excel' });
    }

    const refuse = message => {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.accept();
      server.send(JSON.stringify({ t: 'closed', message }));
      server.close(1000, 'closed');
      return new Response(null, { status: 101, webSocket: client });
    };
    if (!this.live()) return refuse('No open game with this PIN.');
    const role = url.searchParams.get('role');
    let attachment;
    if (role === 'host') {
      if (url.searchParams.get('key') !== this.hostKey) return refuse('This game\u2019s moderator key is invalid.');
      attachment = { role: 'host' };
    } else if (role === 'stage') {
      attachment = { role: 'stage' };
    } else if (role === 'player' && /^[0-9a-f]{24}$/.test(url.searchParams.get('player') || '')) {
      // A team's own device: it names its team and hands in its own workbook.
      attachment = { role: 'player', playerId: url.searchParams.get('player') };
    } else {
      return refuse('This game link is invalid.');
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ ...attachment, ack: 0 });
    if (attachment.role === 'player' && this.state.teams.some(t => t.owner === attachment.playerId)) {
      reduce(this.state, { type: 'presence', connected: true }, { role: 'system', playerId: attachment.playerId, now: Date.now() });
      await this.commit();
    } else this.send(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const att = ws.deserializeAttachment();
    if (msg.t === 'ping') { ws.send(JSON.stringify({ t: 'pong', id: msg.id, serverNow: Date.now() })); return; }
    if (msg.t !== 'action' || !msg.action) return;
    this.msgLang = msg.lang === 'tr' || msg.lang === 'en' ? msg.lang : null;
    if (msg.action.type === 'add-ai-team') {
      att.ack = Math.max(att.ack || 0, Number(msg.seq) || 0);
      ws.serializeAttachment(att);
      if (att.role !== 'host') { ws.send(JSON.stringify({ t: 'error', message: this.m('This action is only available to the moderator.', 'Bu işlem yalnızca moderatöre açık.'), seq: msg.seq })); this.send(ws); return; }
      try {
        await this.addJevTeam();
        await this.commit();
      } catch (error) {
        ws.send(JSON.stringify({ t: 'error', message: error.message || this.m('Jev could not create a strategy.', 'Jev strateji oluşturamadı.'), seq: msg.seq }));
        this.send(ws);
      }
      return;
    }
    const result = reduce(this.state, msg.action, { role: att.role, playerId: att.playerId, now: Date.now(), lang: this.msgLang });
    att.ack = Math.max(att.ack || 0, Number(msg.seq) || 0);
    ws.serializeAttachment(att);
    if (result?.error) { ws.send(JSON.stringify({ t: 'error', message: result.error, seq: msg.seq })); this.send(ws); return; }
    if (result?.changed) { await this.commit(); await this.runAiTurn(); } else this.send(ws);
  }

  async webSocketClose(ws) { await this.dropped(ws); }
  async webSocketError(ws) { await this.dropped(ws); }

  async dropped(ws) {
    const att = ws.deserializeAttachment();
    if (att?.role !== 'player' || !this.state?.teams.some(t => t.owner === att.playerId)) return;
    const stillOpen = this.ctx.getWebSockets().some(other => other !== ws && other.deserializeAttachment()?.playerId === att.playerId);
    if (stillOpen) return;
    reduce(this.state, { type: 'presence', connected: false }, { role: 'system', playerId: att.playerId, now: Date.now() });
    await this.commit();
  }

  async alarm() {
    if (!this.state) return;
    reduce(this.state, { type: 'tick' }, { role: 'system', now: Date.now() });
    await this.commit(); // also broadcasts at month boundaries: clients get the new month's results
    await this.runAiTurn();
  }

  m(en, tr) { return (this.msgLang ?? this.state?.config?.lang) === 'tr' ? tr : en; }

  async callJev(body, timeout = 15000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch('https://openrouter.ai/api/alpha/decisions', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.env.OPENROUTER_API_KEY}`,
          'content-type': 'application/json',
          'http-referer': this.env.APP_URL || 'https://insurersleague.demireleren.com',
          'x-openrouter-title': 'Risk Arenasi'
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        const upstream = String(detail?.error?.message || detail?.message || '').slice(0, 180);
        throw Error(`OpenRouter ${response.status}${upstream ? `: ${upstream}` : ''}`);
      }
      return response.json();
    } finally { clearTimeout(timer); }
  }

  fallbackQuizChoice(team, round) {
    const seed = `${team.ai?.profile || 'ai'}:${team.id}:${round.qid}`;
    let hash = 2166136261;
    for (const char of seed) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    return (hash >>> 0) % 4;
  }

  async runAiQuiz(round) {
    const pending = this.state.teams.filter(team => team.ai && !Object.values(round.answers || {}).some(answer => answer.teamId === team.id));
    if (!pending.length || round.revealedAt) return;
    const question = questionOf(this.state, round.qid);
    if (!question) return;
    let choices = {};
    try {
      const model = this.env.JEV_MODEL || JEV_MODEL;
      const request = buildJevQuizRequest({ ...this.state, teams: pending }, round, question, model);
      const data = await this.callJev(request.body, Math.min(9000, Math.max(4000, this.state.quiz.duration * 1000 - 800)));
      choices = quizChoicesFromJev(data?.answers, request.teamIds);
    } catch { /* fall through to stable profile-based choices */ }
    for (const team of pending) {
      const liveRound = currentRound(this.state);
      if (!liveRound || liveRound !== round || liveRound.revealedAt) break;
      reduce(this.state, { type: 'ai-answer', teamId: team.id, choice: choices[team.id] ?? this.fallbackQuizChoice(team, round) }, { role: 'system', now: Date.now() });
    }
    await this.commit();
  }

  async runAiReviews(review) {
    const pending = this.state.teams.filter(team => team.ai && !review.submitted?.[team.id]);
    if (!pending.length) return;
    const model = this.env.JEV_MODEL || JEV_MODEL;
    const proposals = await Promise.all(pending.map(async team => {
      try {
        const profile = aiProfile(team.ai.profile);
        const { body, context } = buildJevRequest(this.state, profile, model, review.month);
        const data = await this.callJev(body);
        const decision = strategyFromJev(this.state, profile, data?.answers || {}, context);
        return { teamId: team.id, strategy: decision.strategy };
      } catch {
        return { teamId: team.id, strategy: structuredClone(team.strategy) };
      }
    }));
    for (const proposal of proposals) {
      if (currentStrategyReview(this.state) !== review) break;
      reduce(this.state, { type: 'quarter-ai-submit', ...proposal }, { role: 'system', now: Date.now() });
    }
    await this.commit();
  }

  async runAiTurn() {
    if (this.aiTurnBusy || !this.env.OPENROUTER_API_KEY) return;
    const round = currentRound(this.state);
    const review = currentStrategyReview(this.state);
    if ((!round || round.revealedAt) && !review) return;
    this.aiTurnBusy = true;
    try {
      if (round && !round.revealedAt) await this.runAiQuiz(round);
      else if (review) await this.runAiReviews(review);
    } finally { this.aiTurnBusy = false; }
  }

  async addJevTeam() {
    if (!this.env.OPENROUTER_API_KEY) throw Error(this.m('OpenRouter is not configured. Add the OPENROUTER_API_KEY Worker secret first.', 'OpenRouter yapılandırılmamış. Önce OPENROUTER_API_KEY Worker secret’ını ekleyin.'));
    if (this.aiBusy) throw Error(this.m('Jev is already preparing an AI team.', 'Jev zaten bir AI takımı hazırlıyor.'));
    if (this.state.phase === 'race') throw Error(this.m('The race has started. New teams can’t join.', 'Yarış başladı. Yeni takım katılamaz.'));
    if (this.state.teams.length >= 12) throw Error(this.m('The room already has the maximum number of teams.', 'Oda zaten en fazla takım sayısına ulaştı.'));

    this.aiBusy = true;
    try {
      const identity = nextAiIdentity(this.state);
      const model = this.env.JEV_MODEL || JEV_MODEL;
      const { body, context } = buildJevRequest(this.state, identity.profile, model);
      const data = await this.callJev(body);
      if (!data?.answers || typeof data.answers !== 'object') throw Error(this.m('Jev returned an incomplete decision.', 'Jev eksik bir karar döndürdü.'));
      const decision = strategyFromJev(this.state, identity.profile, data.answers, context);
      const result = reduce(this.state, {
        type: 'ai-team-create', name: identity.name, emblem: identity.emblem,
        strategy: decision.strategy, model: data.model || model, profile: identity.profile.id,
        confidence: decision.confidence
      }, { role: 'system', now: Date.now() });
      if (result?.error) throw Error(result.error);
      return result;
    } catch (error) {
      if (error?.name === 'AbortError') throw Error(this.m('Jev took too long to answer. Try again.', 'Jev yanıt vermeyi geciktirdi. Tekrar deneyin.'));
      throw error;
    } finally { this.aiBusy = false; }
  }

  async persist() {
    await this.ctx.storage.put({ state: this.state, hostKey: this.hostKey });
  }

  async commit() {
    this.state.updatedAt = Date.now();
    await this.persist();
    for (const ws of this.ctx.getWebSockets()) this.send(ws);
    const wake = nextWake(this.state, Date.now());
    if (wake) await this.ctx.storage.setAlarm(wake);
  }

  send(ws) {
    const att = ws.deserializeAttachment();
    if (!att) return;
    const now = Date.now();
    try { ws.send(JSON.stringify({ t: 'state', state: viewFor(this.state, att, now), serverNow: now, ack: att.ack || 0, you: { role: att.role, playerId: att.playerId } })); } catch { /* closed connection */ }
  }
}

const ARCHIVE_LIMIT = 300;
const ARCHIVE_ENTRY_BYTES = 64 * 1024;

export class Archive extends DurableObject {
  async fetch(request) {
    const id = new URL(request.url).pathname.slice(1);
    if (request.method === 'GET' && !id) {
      const rows = [...(await this.ctx.storage.list({ prefix: 's:' })).values()];
      rows.sort((a, b) => b.at - a.at);
      return json({ sessions: rows });
    }
    if (request.method === 'PUT' && id) {
      const raw = await request.text();
      if (raw.length > ARCHIVE_ENTRY_BYTES) return json({ error: 'too large' }, 413);
      let entry;
      try { entry = JSON.parse(raw); } catch { return json({ error: 'bad json' }, 400); }
      if (!entry || entry.id !== id || !Array.isArray(entry.teams) || !Number.isFinite(entry.at)) return json({ error: 'bad entry' }, 400);
      await this.ctx.storage.put(`s:${id}`, entry);
      const keys = [...(await this.ctx.storage.list({ prefix: 's:' })).entries()].sort((a, b) => b[1].at - a[1].at).slice(ARCHIVE_LIMIT).map(([k]) => k);
      if (keys.length) await this.ctx.storage.delete(keys);
      return json({ ok: true });
    }
    if (request.method === 'DELETE' && id) {
      await this.ctx.storage.delete(`s:${id}`);
      return json({ ok: true });
    }
    return json({ error: 'not found' }, 404);
  }
}
