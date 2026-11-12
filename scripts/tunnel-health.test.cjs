const { test } = require('node:test');
const assert = require('node:assert/strict');
const { checkTunnel } = require('./tunnel-health.cjs');
const url = 'https://example.trycloudflare.com';
test('публичная проверка подтверждает именно свой сервер', async () => {
  const result = await checkTunnel(url, 'instance-1', async target => {
    assert.equal(target.href, url + '/api/health');
    return { ok: true, json: async () => ({ ok: true, service: 'profsota-game', instance: 'instance-1' }) };
  });
  assert.equal(result.ok, true);
  assert.equal((await checkTunnel(url, 'instance-1', async () => ({ ok: true, json: async () => ({ ok: true, service: 'profsota-game', instance: 'other' }) }))).ok, false);
});
test('Cloudflare 1033 и сетевые сбои не выдаются за работающую ссылку', async () => {
  const unavailable = await checkTunnel(url, 'id', async () => ({ ok: false, status: 530, text: async () => '<h1>Error 1033</h1>' }));
  assert.equal(unavailable.ok, false); assert.match(unavailable.message, /1033/);
  assert.equal((await checkTunnel(url, 'id', async () => { throw Error('Network error'); })).ok, false);
  assert.equal((await checkTunnel(url, 'id', async () => ({ ok: true, json: async () => { throw Error('Invalid JSON'); } }))).ok, false);
  assert.equal((await checkTunnel('http://example.test', 'id')).ok, false);
});
