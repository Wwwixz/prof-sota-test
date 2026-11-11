import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import { WebSocket } from 'ws';
import { createApp } from './index';

async function peer(url: string) {
  const ws = new WebSocket(url); const messages: any[] = [];
  ws.on('message', raw => messages.push(JSON.parse(raw.toString()))); await once(ws, 'open');
  return { ws, messages, send: (m: unknown) => ws.send(JSON.stringify(m)),
    async next(type: string, predicate: (m: any) => boolean = () => true) {
      const end = Date.now() + 3000;
      while (Date.now() < end) {
        const index = messages.findIndex(m => m.type === type && predicate(m));
        if (index >= 0) return messages.splice(index, 1)[0];
        await new Promise(r => setTimeout(r, 10));
      }
      throw new Error('Не получено сообщение: ' + type);
    } };
}
test('HTTP, WebSocket, изоляция админки, восстановление и завершение сессии', async () => {
  const app = createApp(); app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
  const address = app.server.address() as { port: number }; const base = `http://127.0.0.1:${address.port}`;
  const clients: WebSocket[] = [];
  try {
    assert.equal((await fetch(base + '/')).status, 200);
    assert.equal((await fetch(base + '/%ZZ')).status, 400);
    assert.equal((await fetch(base + '/server/game.ts')).status, 404);
    assert.equal((await fetch(base + '/api/admin/state')).status, 403);
    const headers = { Authorization: 'Bearer ' + app.adminToken };
    assert.equal((await fetch(base + '/api/admin/state', { headers: { ...headers, 'x-forwarded-for': '1.1.1.1' } })).status, 403);
    const publicHostStatus = await new Promise<number | undefined>((resolve, reject) => {
      const request = http.get(base + '/api/admin/state', { headers: { ...headers, Host: 'public.example' } }, response => { response.resume(); resolve(response.statusCode); });
      request.on('error', reject);
    });
    assert.equal(publicHostStatus, 403);
    app.setTunnel('https://example.trycloudflare.com', 'Готово');
    const admin = await (await fetch(base + '/api/admin/state', { headers })).json(); assert.equal(admin.publicUrl, 'https://example.trycloudflare.com');
    const qr = await fetch(base + '/api/admin/qr', { headers }); assert.equal(qr.status, 200); assert.ok((await qr.text()).includes('<svg'));
    assert.equal((await fetch(base + '/api/admin/create', { method: 'POST', body: JSON.stringify({ city: 0 }) })).status, 403);
    const createdResponse = await fetch(base + '/api/admin/create', { method: 'POST', headers, body: JSON.stringify({ city: 0 }) });
    assert.equal(createdResponse.status, 201); const created = await createdResponse.json();
    assert.equal((await fetch(base + '/api/admin/start', { method: 'POST', headers, body: JSON.stringify({ code: created.code }) })).status, 400);
    const a = await peer(base.replace('http', 'ws') + '/ws'); clients.push(a.ws);
    a.send({ type: 'create', city: 0, skin: 1 }); await a.next('error');
    a.send({ type: 'join', code: created.code, skin: 1 }); const welcome = await a.next('welcome'); const state = await a.next('state');
    assert.equal(state.started, false); assert.equal(state.me.state, 'waiting');
    const b = await peer(base.replace('http', 'ws') + '/ws'); clients.push(b.ws);
    b.send({ type: 'join', code: welcome.code, skin: 2 }); await b.next('welcome');
    assert.deepEqual((await b.next('state')).world.map, state.world.map);
    const waiting = await a.next('state', s => s.players.length === 2);
    a.send({ type: 'move', level: 1, seq: 1, dx: 1, dy: 0 });
    assert.match((await a.next('error')).message, /не началась/);
    a.send({ type: 'start', code: welcome.code }); await a.next('error');
    assert.equal((await fetch(base + '/api/admin/start', { method: 'POST', body: JSON.stringify({ code: created.code }) })).status, 403);
    assert.equal((await fetch(base + '/api/admin/start', { method: 'POST', headers, body: JSON.stringify({ code: created.code }) })).status, 200);
    const before = await a.next('state', s => s.started);
    const startedB = await b.next('state', s => s.started);
    assert.equal(before.me.fuel, 100); assert.equal(before.me.x, waiting.me.x);
    assert.equal(startedB.me.state, 'playing');
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const [dx, dy] = dirs.find(([x, y]) => before.world.map[before.me.y + y]?.[before.me.x + x] === 0)!;
    a.send({ type: 'move', level: 1, seq: 2, dx, dy });
    await a.next('state', s => s.me.x === before.me.x + dx && s.me.y === before.me.y + dy);
    await b.next('state', s => s.players.find((p: any) => p.id === before.me.id).x === before.me.x + dx);
    a.ws.terminate();
    await b.next('state', s => s.players.some((p: any) => p.id === before.me.id && !p.connected));
    const resumed = await peer(base.replace('http', 'ws') + '/ws'); clients.push(resumed.ws);
    resumed.send({ type: 'resume', token: welcome.token }); await resumed.next('welcome');
    assert.equal((await resumed.next('state')).me.id, before.me.id);
    assert.equal((await fetch(base + '/api/admin/end', { method: 'POST', headers, body: JSON.stringify({ code: welcome.code }) })).status, 200);
    await b.next('ended'); assert.equal(app.game.rooms.size, 0);
    const malformed = await peer(base.replace('http', 'ws') + '/ws'); clients.push(malformed.ws);
    malformed.ws.send('{'); assert.match((await malformed.next('error')).message, /JSON/);
    malformed.send({ type: 'join', code: '<bad>', skin: 0 }); await malformed.next('error');
  } finally { for (const ws of clients) ws.terminate(); await app.close(); }
});
test('превышение частоты сообщений и большой пакет закрывают WebSocket', async () => {
  const app = createApp(); app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
  const url = `ws://127.0.0.1:${(app.server.address() as { port: number }).port}/ws`;
  try {
    const a = await peer(url); const closed = once(a.ws, 'close'); for (let i = 0; i < 90; i++) a.send({ type: 'ping' });
    assert.equal((await closed)[0], 1008);
    const b = await peer(url); const tooBig = once(b.ws, 'close'); b.ws.send('x'.repeat(5000)); assert.equal((await tooBig)[0], 1009);
  } finally { await app.close(); }
});
