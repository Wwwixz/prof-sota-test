import http, { IncomingMessage, ServerResponse } from 'node:http';
import { readFileSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import QRCode from 'qrcode';
import { Game, Identity } from './game';
import { GameError, messageSchema, RateLimit } from './protocol';
import { CITIES } from './cities';

export function createApp(root = path.resolve(__dirname, '../..')) {
  const game = new Game(JSON.parse(readFileSync(path.join(root, 'questions.json'), 'utf8')));
  const adminToken = randomUUID();
  let publicUrl = '', tunnelStatus = 'Туннель не запущен', shuttingDown = false;
  const peers = new Map<WebSocket, { identity?: Identity; alive: boolean }>();
  const owners = new Map<string, WebSocket>();
  const send = (ws: WebSocket, data: unknown) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (ws.bufferedAmount > 512 * 1024) { ws.terminate(); return; }
    ws.send(JSON.stringify(data));
  };
  const broadcast = () => {
    for (const [ws, peer] of peers) if (peer.identity) {
      if (!game.rooms.has(peer.identity.room.code)) { send(ws, { type: 'ended', message: 'Организатор завершил сессию' }); ws.close(1000); }
      else send(ws, game.snapshot(peer.identity));
    }
  };
  const json = (res: ServerResponse, status: number, data: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data));
  };
  const local = (req: IncomingMessage) => {
    const address = req.socket.remoteAddress;
    return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address || '') &&
      /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(req.headers.host || '') && !req.headers['cf-connecting-ip'] && !req.headers['x-forwarded-for'];
  };
  const authorized = (req: IncomingMessage) => {
    const provided = Buffer.from(req.headers.authorization?.replace(/^Bearer /, '') || '');
    const expected = Buffer.from(adminToken);
    return local(req) && provided.length === expected.length && timingSafeEqual(provided, expected);
  };
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    let pathname: string;
    try { pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname); }
    catch { json(res, 400, { error: 'Некорректный адрес' }); return; }
    try {
      if (pathname.startsWith('/api/admin/')) {
        if (!authorized(req)) { json(res, 403, { error: 'Нет доступа' }); return; }
        if (pathname === '/api/admin/state' && req.method === 'GET') {
          json(res, 200, { status: 'Сервер работает', publicUrl, tunnelStatus, rooms: game.overview(),
            connected: [...peers.values()].filter(p => p.identity).length, cities: CITIES }); return;
        }
        if (pathname === '/api/admin/qr' && req.method === 'GET') {
          if (!publicUrl) { json(res, 409, { error: 'Публичная ссылка ещё не получена' }); return; }
          res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' });
          res.end(await QRCode.toString(publicUrl, { type: 'svg', errorCorrectionLevel: 'M', margin: 2 })); return;
        }
        if (['/api/admin/create', '/api/admin/start', '/api/admin/end'].includes(pathname) && req.method === 'POST') {
          let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 2048) { json(res, 413, { error: 'Запрос слишком большой' }); return; } }
          let input; try { input = JSON.parse(body); if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error(); } catch { json(res, 400, { error: 'Некорректный запрос' }); return; }
          if (pathname === '/api/admin/create') {
            if (!Number.isInteger(input.city) || input.city < 0 || input.city >= CITIES.length) { json(res, 400, { error: 'Выберите город' }); return; }
            const room = game.createRoom(input.city); json(res, 201, { code: room.code }); return;
          }
          const code: unknown = input.code;
          if (code !== '*' && (typeof code !== 'string' || !/^[A-Z2-9]{5}$/.test(code))) { json(res, 400, { error: 'Некорректный код' }); return; }
          if (pathname === '/api/admin/start') {
            if (code === '*') { json(res, 400, { error: 'Выберите одну комнату' }); return; }
            game.start(code as string);
          } else if (code === '*') for (const room of [...game.rooms.keys()]) game.end(room); else game.end(code as string);
          broadcast(); json(res, 200, { ok: true }); return;
        }
        json(res, 404, { error: 'Команда не найдена' }); return;
      }
      if (pathname === '/api/health' && req.method === 'GET') { json(res, 200, { ok: !shuttingDown }); return; }
      if (req.method !== 'GET' && req.method !== 'HEAD') { json(res, 405, { error: 'Метод не поддерживается' }); return; }
      if (pathname === '/organizer' && !local(req)) { json(res, 403, { error: 'Панель доступна только на ноутбуке организатора' }); return; }
      const fixed: Record<string, string> = { '/': 'index.html', '/index.html': 'index.html', '/questions.json': 'questions.json',
        '/organizer': 'public/organizer.html', '/organizer.js': 'public/organizer.js', '/network.js': 'public/network.js' };
      const relative = fixed[pathname] || (pathname.startsWith('/assets/') && !pathname.includes('..') && !pathname.includes('\\') ? pathname.slice(1) : null);
      if (!relative) { json(res, 404, { error: 'Файл не найден' }); return; }
      const file = path.resolve(root, relative);
      if (!file.startsWith(root + path.sep)) { json(res, 403, { error: 'Доступ запрещён' }); return; }
      const data = await fs.readFile(file);
      const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
      res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch (error) {
      if (error instanceof GameError) json(res, 400, { error: error.message });
      else if ((error as NodeJS.ErrnoException).code === 'ENOENT') json(res, 404, { error: 'Файл не найден' });
      else { console.error('Ошибка HTTP:', (error as Error).name); if (!res.headersSent) json(res, 500, { error: 'Ошибка сервера' }); else res.end(); }
    }
  });
  server.requestTimeout = 10000; server.headersTimeout = 10000;
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096, perMessageDeflate: false });
  server.on('upgrade', (req, socket, head) => {
    let valid = false;
    try {
      valid = new URL(req.url || '/', 'http://localhost').pathname === '/ws' &&
        (!req.headers.origin || new URL(req.headers.origin).host === req.headers.host);
    } catch { /* Некорректный запрос обновления протокола. */ }
    if (!valid || shuttingDown || peers.size >= 160) { socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
  });
  wss.on('connection', ws => {
    const peer: { identity?: Identity; alive: boolean } = { alive: true }; peers.set(ws, peer);
    const rate = new RateLimit(); let invalid = 0;
    const timeout = setTimeout(() => { if (!peer.identity) ws.close(1008, 'Время подключения истекло'); }, 10000);
    ws.on('pong', () => { peer.alive = true; });
    ws.on('error', () => { console.error('Ошибка WebSocket'); });
    ws.on('message', (raw, binary) => {
      if (!rate.take()) { ws.close(1008, 'Слишком много сообщений'); return; }
      try {
        if (binary) throw new GameError('Ожидается текстовое сообщение');
        let input: unknown; try { input = JSON.parse(raw.toString()); } catch { throw new GameError('Некорректный JSON'); }
        const parsed = messageSchema.safeParse(input);
        if (!parsed.success) { if (++invalid >= 3) ws.close(1008, 'Некорректные сообщения'); throw new GameError('Некорректное сообщение'); }
        const m = parsed.data;
        if (m.type === 'ping') { send(ws, { type: 'pong' }); return; }
        if (m.type === 'join' || m.type === 'resume') {
          if (peer.identity) throw new GameError('Сначала выйдите из текущей комнаты');
          peer.identity = m.type === 'join' ? game.join(m.code, m.skin) : game.resume(m.token);
          const old = owners.get(peer.identity.player.id); owners.set(peer.identity.player.id, ws); old?.close(1000, 'Восстановлено другое соединение');
          clearTimeout(timeout); send(ws, { type: 'welcome', token: peer.identity.player.token, code: peer.identity.room.code });
        } else {
          if (!peer.identity) throw new GameError('Сначала подключитесь к комнате');
          if (m.type === 'leave') { game.leave(peer.identity); owners.delete(peer.identity.player.id); delete peer.identity; send(ws, { type: 'left' }); }
          else { if (m.type === 'move') peer.identity.player.ack = m.seq; game.action(peer.identity, m); }
        }
        broadcast();
      } catch (error) {
        if (!(error instanceof GameError)) console.error('Ошибка игровой команды:', (error as Error).name);
        send(ws, { type: 'error', message: error instanceof GameError ? error.message : 'Ошибка сервера' });
        if (peer.identity) send(ws, game.snapshot(peer.identity));
      }
    });
    ws.on('close', () => {
      clearTimeout(timeout); peers.delete(ws);
      if (peer.identity && owners.get(peer.identity.player.id) === ws) { owners.delete(peer.identity.player.id); game.disconnect(peer.identity); broadcast(); }
    });
  });
  const tick = setInterval(() => { game.tick(); broadcast(); }, 200);
  const heartbeat = setInterval(() => { for (const [ws, p] of peers) { if (!p.alive) ws.terminate(); else { p.alive = false; ws.ping(); } } }, 15000);
  server.on('error', error => console.error('Ошибка сервера:', (error as NodeJS.ErrnoException).code || error.name));
  wss.on('error', error => console.error('Ошибка WebSocket-сервера:', error.name));
  return { server, game, adminToken,
    setTunnel(url: string, status: string) {
      publicUrl = '';
      try { const parsed = new URL(url); if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) publicUrl = parsed.origin; } catch { /* Туннель ещё не получил адрес. */ }
      tunnelStatus = status.slice(0, 200);
    },
    async close() {
      shuttingDown = true; clearInterval(tick); clearInterval(heartbeat);
      for (const ws of peers.keys()) { send(ws, { type: 'ended', message: 'Сервер остановлен организатором' }); ws.terminate(); }
      await new Promise<void>(resolve => wss.close(() => resolve()));
      await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
    }
  };
}

if (require.main === module) {
  const app = createApp();
  app.server.once('error', () => { app.close().finally(() => process.exit(1)); });
  app.server.listen(Number(process.env.PORT || 8787), '127.0.0.1', () => {
    const address = app.server.address(); const port = typeof address === 'object' && address ? address.port : 8787;
    if (process.send) process.send({ type: 'ready', port, token: app.adminToken });
    else console.log(`Панель организатора: http://127.0.0.1:${port}/organizer#${app.adminToken}`);
  });
  process.on('message', (message: any) => {
    if (message?.type === 'tunnel' && typeof message.url === 'string' && typeof message.status === 'string') app.setTunnel(message.url, message.status);
    if (message?.type === 'stop') app.close().then(() => process.exit(0));
  });
  let stopping = false;
  const stop = () => { if (stopping) return; stopping = true; app.close().then(() => process.exit(0)); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop); process.on('disconnect', stop);
}
