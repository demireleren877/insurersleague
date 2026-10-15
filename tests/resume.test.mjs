import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { reduce, defaultStrategy, currentStrategyReview, playhead } from '../dist/js/game.js';

// Only the Cloudflare platform base is replaced; Room's persistence, TTL and auth run unchanged.
const workerUrl = new URL('../worker/index.js', import.meta.url);
const source = (await readFile(workerUrl, 'utf8'))
  .replace("import { DurableObject } from 'cloudflare:workers';", 'class DurableObject { constructor(ctx) { this.ctx = ctx; } }')
  .replace(/from '(\.\.\/[^']+)'/g, (_, path) => `from '${new URL(path, workerUrl).href}'`);
const { Room, default: worker } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const values = new Map();
let ready;
const ctx = {
  storage: {
    get: async key => structuredClone(values.get(key)),
    put: async entries => { for (const [key, value] of Object.entries(entries)) values.set(key, structuredClone(value)); },
    setAlarm: async () => {}
  },
  blockConcurrencyWhile: fn => { ready = fn(); },
  getWebSockets: () => []
};
let room;
const storage = new Map();
globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
globalThis.location = { protocol: 'http:', host: 'localhost' };
const sockets = [];
globalThis.WebSocket = class {
  constructor(url) { this.url = url; sockets.push(this); }
  close() {}
};
const nativeFetch = globalThis.fetch;
const env = { ROOMS: { idFromName: pin => pin, get: () => room } };
globalThis.fetch = (path, options) => worker.fetch(new Request(new URL(path, 'http://localhost'), options), env);
const store = await import('../dist/js/store.js');
const { home } = await import('../dist/js/views/home.js');

async function reloadRoom() { room = new Room(ctx, env); await ready; }
async function create() {
  await reloadRoom();
  const res = await room.fetch(new Request('https://room/init', { method: 'POST', body: JSON.stringify({ pin: '123456', lang: 'en' }) }));
  assert.equal(res.status, 200);
  const saved = await res.json();
  localStorage.setItem('risk-arenasi:host:v4', JSON.stringify(saved));
  return saved;
}
function action(action) {
  const result = reduce(room.state, action, { role: 'host', now: Date.now() });
  assert.equal(result?.error, undefined);
}

test('home resume follows the persisted Room lifecycle and preserves valid games', async () => {
  try {
    const saved = await create();
    assert.match(home(), /data-action="resume-host"/);
    // Each visit home disconnects the browser, but the Durable Object keeps the game.
    for (const phase of ['lobby', 'decisions', 'race']) {
      if (phase === 'decisions') {
        action({ type: 'excel-import-teams', teams: ['Atlas', 'Nova'].map(name => ({ name, strategy: defaultStrategy(name, room.state.config) })) });
        action({ type: 'phase', to: 'briefing' });
        action({ type: 'phase', to: 'decisions' });
      }
      if (phase === 'race') action({ type: 'start-race' });
      await room.persist();
      await reloadRoom();
      store.disconnect();
      assert.equal(await store.resumeHost(), true, phase);
      assert.equal(store.getSession().pin, saved.pin);
      assert.match(sockets.at(-1).url, new RegExp(`key=${saved.hostKey}`));
      room.send({ deserializeAttachment: () => ({ role: 'host' }), send: raw => sockets.at(-1).onmessage({ data: raw }) });
      assert.equal(store.getState().phase, room.state.phase);
    }
    // Finish the same season, revisiting home at the half-year review and after the last month.
    let reviews = 0;
    for (let k = 0; k < 40 && playhead(room.state, Date.now()).month < 11; k++) {
      action({ type: 'next-month' });
      if (currentStrategyReview(room.state)) {
        reviews++;
        await room.persist();
        await reloadRoom();
        store.disconnect();
        assert.equal(await store.resumeHost(), true, 'half-year review');
        action({ type: 'quarter-close' });
      }
    }
    assert.equal(reviews, 1);
    assert.equal(playhead(room.state, Date.now()).month, 11);
    action({ type: 'show-final' });
    assert.equal(room.state.stageLayer, 'final');
    await room.persist();
    await reloadRoom();
    store.disconnect();
    assert.equal(await store.resumeHost(), true, 'completed season');
    store.disconnect();
    // The actual Room TTL is evaluated from persisted activity, including across a cold start.
    room.state.updatedAt = Date.now() - 12 * 3600 * 1000 - 1;
    await room.persist();
    await reloadRoom();
    assert.equal(await store.checkSavedHost(), null);
    assert.equal(store.savedHost(), null);
    assert.doesNotMatch(home(), /data-action="resume-host"/);
    assert.equal(await store.resumeHost(), false);
    assert.equal(store.getSession().role, 'none');
    // PIN reuse must also reject the old moderator's credentials, even though info is public.
    const replacement = await create();
    assert.notEqual(replacement.hostKey, saved.hostKey);
    localStorage.setItem('risk-arenasi:host:v4', JSON.stringify(saved));
    assert.equal((await nativeInfo()).status, 200);
    assert.equal(await store.resumeHost(), false);
    assert.equal(store.savedHost(), null);
  } finally { store.disconnect(); }
});
const nativeInfo = () => worker.fetch(new Request('http://localhost/api/rooms/123456'), env);

test('temporary outages preserve the saved moderator and allow retry', async () => {
  values.clear();
  const saved = await create();
  const routedFetch = globalThis.fetch;
  try {
    for (const fail of [() => { throw Error('offline'); }, () => new Response('{}', { status: 503 })]) {
      globalThis.fetch = fail;
      await assert.rejects(store.resumeHost());
      assert.deepEqual(store.savedHost(), saved);
    }
  } finally { globalThis.fetch = routedFetch; store.disconnect(); }
  assert.equal(await store.resumeHost(), true);
  // A room can expire between the HTTP check and the socket handshake.
  sockets.at(-1).onmessage({ data: JSON.stringify({ t: 'closed', message: 'No open game with this PIN.' }) });
  assert.equal(store.savedHost(), null);
  store.disconnect();
});

test('a missing room clears the home link without opening a socket', async () => {
  values.clear();
  await reloadRoom();
  localStorage.setItem('risk-arenasi:host:v4', JSON.stringify({ pin: '123456', hostKey: 'old-key' }));
  const count = sockets.length;
  assert.equal(await store.resumeHost(), false);
  assert.equal(sockets.length, count);
  assert.doesNotMatch(home(), /data-action="resume-host"/);
});

test('a late expired-room response cannot erase a newly created game', async () => {
  const old = { pin: '123456', hostKey: 'old-key' };
  const replacement = { pin: '654321', hostKey: 'new-key' };
  localStorage.setItem('risk-arenasi:host:v4', JSON.stringify(old));
  const routedFetch = globalThis.fetch;
  let resolve;
  try {
    globalThis.fetch = () => new Promise(done => { resolve = done; });
    const checking = store.checkSavedHost();
    localStorage.setItem('risk-arenasi:host:v4', JSON.stringify(replacement));
    resolve(new Response('{}', { status: 404 }));
    assert.equal(await checking, null);
    assert.deepEqual(store.savedHost(), replacement);
  } finally { globalThis.fetch = routedFetch; }
});

test.after(() => { globalThis.fetch = nativeFetch; store.disconnect(); });
