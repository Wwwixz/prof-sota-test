// Дополнительная браузерная проверка: нужен установленный Playwright и Chromium.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { createApp } = require('../dist/server/index');
const questions = JSON.parse(fs.readFileSync('questions.json', 'utf8'));
const source = fs.readFileSync('index.html', 'utf8').replace(/\}\)\(\);\s*<\/script>/,
  `window.__test={snapshot:()=>({map,crystals,player:{...player},fuel,state,netLevel,netReady,netMovePending,netPeers,activeQuestion,score}),move:tryMove,connection};})();</script>`);
function nearest(s) {
  const queue = [{ x: s.player.gx, y: s.player.gy, path: [] }], visited = new Set([s.player.gx + ',' + s.player.gy]);
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i];
    if (c.path.length && s.crystals.some(p => !p.done && p.x === c.x && p.y === c.y)) return c.path;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = c.x + dx, y = c.y + dy, key = x + ',' + y;
      if (s.map[y]?.[x] !== 0 || visited.has(key)) continue;
      visited.add(key); queue.push({ x, y, path: [...c.path, [dx, dy]] });
    }
  }
  throw Error('No crystal path');
}
(async () => {
  const app = createApp(); await new Promise(r => app.server.listen(0, '127.0.0.1', r)); let browser;
  try {
    // Перехват HTML для тестовых наблюдений меняет классификацию локального адреса Chromium.
    // Исключение применяется только к тестовому браузеру, а не к приложению.
    browser = await require(process.env.PLAYWRIGHT_MODULE || 'playwright').chromium.launch({ headless: true,
      args: ['--disable-features=LocalNetworkAccessChecks,LocalNetworkAccessRestrictions'] });
    const errors = [], base = 'http://127.0.0.1:' + app.server.address().port;
    async function page(width) {
      const p = await browser.newPage({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
      p.on('pageerror', e => errors.push(e.message));
      await p.route('**/index.html', r => r.fulfill({ contentType: 'text/html', body: source }));
      await p.goto(base + '/index.html'); return p;
    }
    const admin = await browser.newPage(); app.setTunnel('https://example.trycloudflare.com', 'Test tunnel');
    await admin.goto(base + '/organizer#' + app.adminToken); await admin.waitForSelector('#qr:not([hidden])');
    await admin.waitForSelector('#createBtn:not([disabled])'); await admin.click('#createBtn');
    await admin.waitForFunction(() => document.getElementById('createdRoom').textContent.length > 0);
    const code = [...app.game.rooms.keys()][0]; assert.ok(code);
    const a = await page(390); await a.fill('#roomCode', code); await a.click('#startBtn');
    await a.waitForSelector('#netLobby:not([hidden])');
    const identity = [...app.game.tokens.values()][0], id = identity.player.id;
    const b = await page(360); await b.fill('#roomCode', code); await b.locator('#roomJoin button').click();
    await b.waitForFunction(() => window.__test.snapshot().netLevel === 1);
    await a.waitForFunction(() => window.__test.snapshot().netPeers.length === 1);
    assert.deepEqual(await a.evaluate(() => window.__test.snapshot().map), await b.evaluate(() => window.__test.snapshot().map));
    assert.equal(await a.evaluate(() => window.__test.snapshot().state), 'waiting');
    await a.evaluate(() => window.__test.move(1, 0)); await a.waitForTimeout(700);
    assert.equal(await a.evaluate(() => window.__test.snapshot().fuel), 100);
    await a.evaluate(() => window.__test.connection.socket.close()); await a.waitForTimeout(100);
    await a.waitForFunction(() => window.__test.snapshot().netReady);
    assert.equal(await a.evaluate(() => window.__test.snapshot().state), 'waiting');
    assert.equal(app.game.tokens.get(identity.player.token).player.id, id);
    const start = admin.locator('#rooms tr[data-code="' + code + '"] button[data-action="start"]');
    await start.waitFor(); await admin.waitForFunction(() => document.querySelector('#rooms button[data-action="start"]:not([disabled])'));
    await start.click();
    for (const player of [a,b]) { await player.waitForFunction(() => window.__test.snapshot().state === 'playing'); assert.equal(await player.locator('#netLobby').getAttribute('hidden'), ''); }
    console.log('Admin creates room; two mobile players wait and reconnect; admin starts both OK');
    const steps = nearest(await a.evaluate(() => window.__test.snapshot()));
    for (const [dx, dy] of steps) {
      await a.evaluate(([dx, dy]) => window.__test.move(dx, dy), [dx, dy]);
      await a.waitForFunction(() => !window.__test.snapshot().netMovePending); await a.waitForTimeout(85);
    }
    await a.waitForSelector('#qScreen:not(.hidden)');
    const q = await a.evaluate(() => window.__test.snapshot().activeQuestion), truth = questions.find(x => x.q === q.q);
    assert.ok(truth); assert.equal(q.c, undefined); assert.equal(q.answer, undefined);
    if (q.type === 'slider') {
      await a.locator('#sliderInput').evaluate((e, v) => { e.value = v; e.dispatchEvent(new Event('input')); }, truth.answer);
      await a.click('#sliderSubmit');
    } else await a.locator('#qAnswers button[data-option="' + truth.c + '"]').click();
    await a.waitForSelector('#qNextBtn:not(.hidden)'); await a.click('#qNextBtn');
    await a.waitForFunction(() => window.__test.snapshot().state === 'playing');
    await b.waitForFunction(() => document.getElementById('oreVal').textContent.startsWith('1/'));
    assert.ok(await a.evaluate(() => window.__test.snapshot().score) > 0);
    console.log('Movement, answer and shared crystal OK');
    await a.evaluate(() => window.__test.connection.socket.close()); await a.waitForTimeout(100);
    await a.waitForFunction(() => window.__test.snapshot().netReady);
    assert.equal(app.game.tokens.get(identity.player.token).player.id, id);
    console.log('Reconnect preserves player OK');
    assert.equal(await admin.locator('#count').textContent(), '2'); console.log('Organizer and QR OK');
    assert.deepEqual(errors, []);
  } finally { if (browser) await browser.close(); await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
