// Проверка переносимой сборки через настоящий публичный Quick Tunnel.
const { fork } = require('node:child_process');
const path = require('node:path');
const assert = require('node:assert/strict');
const WebSocket = require('ws');
const root = path.resolve(__dirname, '../portable');
const clients = [];
function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url); clients.push(ws); const messages = [];
    const timeout = setTimeout(() => { ws.terminate(); reject(Error('WSS connection timeout')); }, 20000);
    ws.once('open', () => { clearTimeout(timeout); resolve({ ws, messages }); });
    ws.on('message', raw => messages.push(JSON.parse(raw.toString()))); ws.on('error', reject);
  });
}
async function next(peer, type) {
  const until = Date.now() + 15000;
  while (Date.now() < until) { const index = peer.messages.findIndex(m => m.type === type); if (index >= 0) return peer.messages.splice(index, 1)[0]; await new Promise(r => setTimeout(r, 100)); }
  throw Error('WSS message timeout: ' + type);
}
(async () => {
  let adminUrl = '', output = '';
  const child = fork(path.join(root, 'scripts/launch.cjs'), [], { cwd: root, execPath: path.join(root, 'runtime/node.exe'),
    env: { ...process.env, SOTA_NO_BROWSER: '1', PORT: '0' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  child.stdout.on('data', chunk => { output = (output + chunk).slice(-8000); const match = output.match(/http:\/\/127\.0\.0\.1:\d+\/organizer#[a-f0-9-]+/); if (match) adminUrl = match[0]; });
  child.stderr.on('data', () => {});
  try {
    let state, headers, base; const until = Date.now() + 90000;
    while (Date.now() < until) {
      if (child.exitCode !== null) throw Error('Portable launcher exited: ' + child.exitCode);
      if (adminUrl) {
        const parsed = new URL(adminUrl); headers = { Authorization: 'Bearer ' + parsed.hash.slice(1) }; base = parsed.origin;
        state = await (await fetch(base + '/api/admin/state', { headers })).json();
        if (state.publicUrl) break;
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    if (!state?.publicUrl) throw Error('Tunnel unavailable: ' + (state?.tunnelStatus || 'server not ready'));
    const publicUrl = state.publicUrl;
    console.log('Quick Tunnel registered; checking external HTTPS');
    let health;
    try { health = await fetch(publicUrl + '/api/health', { signal: AbortSignal.timeout(15000) }); }
    catch { throw Error('Quick Tunnel started, but external HTTPS could not be reached from this network. Check the public link on a phone using mobile internet.'); }
    assert.equal(health.status, 200);
    assert.equal((await fetch(publicUrl + '/api/admin/state', { headers, signal: AbortSignal.timeout(15000) })).status, 403);
    console.log('Public HTTPS and admin protection OK');
    const a = await connect(publicUrl.replace('https:', 'wss:') + '/ws');
    a.ws.send(JSON.stringify({ type: 'create', city: 0, skin: 0 }));
    const welcome = await next(a, 'welcome'), first = await next(a, 'state');
    const b = await connect(publicUrl.replace('https:', 'wss:') + '/ws');
    b.ws.send(JSON.stringify({ type: 'join', code: welcome.code, skin: 2 })); await next(b, 'welcome');
    const second = await next(b, 'state'); assert.deepEqual(first.world.map, second.world.map); assert.equal(second.players.length, 2);
    console.log('Two players connected through public WSS OK');
    console.log('Portable Node.js, cloudflared and real Quick Tunnel OK');
  } finally {
    for (const ws of clients) ws.terminate();
    if (child.connected) child.send({ type: 'stop' });
    await new Promise(resolve => { if (child.exitCode !== null) resolve(); else { const timer = setTimeout(() => { child.kill(); resolve(); }, 5000); child.once('exit', () => { clearTimeout(timer); resolve(); }); } });
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
