// Проверяем, что публичная ссылка действительно ведёт к этому экземпляру игры.
async function checkTunnel(url, healthId, fetchRequest = fetch) {
  try {
    const target = new URL(url);
    if (target.protocol !== 'https:' || target.username || target.password || !healthId)
      return { ok: false, message: 'Не удалось проверить адрес туннеля. Перезапустите start.bat.' };
    const response = await fetchRequest(new URL('/api/health', target.origin), {
      signal: AbortSignal.timeout(8000), redirect: 'error', headers: { 'Cache-Control': 'no-cache' }
    });
    if (!response.ok) {
      const body = await response.text();
      if (response.status === 530 && /1033/.test(body))
        return { ok: false, message: 'Cloudflare 1033: публичный адрес не связан с работающим туннелем. Проверьте интернет и перезапустите start.bat. Повторяем проверку…' };
      return { ok: false, message: 'Внешняя проверка: HTTP ' + response.status + '. Публичная ссылка пока не готова. Повторяем проверку…' };
    }
    const body = await response.json();
    if (body.ok !== true || body.service !== 'profsota-game' || body.instance !== healthId)
      return { ok: false, message: 'Публичная ссылка не подтвердила связь с этой игрой. Перезапустите туннель.' };
    return { ok: true, message: 'Игра доступна по публичной ссылке. HTTPS-проверка прошла.' };
  } catch {
    return { ok: false, message: 'Не удалось проверить публичную ссылку через интернет. Проверьте сеть; повторяем проверку…' };
  }
}
module.exports = { checkTunnel };
