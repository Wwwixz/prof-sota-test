// Единый запуск сервера, туннеля и локальной панели организатора.
const { fork, spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
process.chdir(root);
let server, tunnel, restarting, watchdog, stopping = false, failures = 0, lastUrl = '';
const localOnly = process.argv.includes('--local');
let config = { mode: 'quick', publicUrl: '', tunnelName: '' };
try { config = { ...config, ...JSON.parse(fs.readFileSync(path.join(root, 'event-config.local.json'), 'utf8')) }; }
catch (error) { if (error.code !== 'ENOENT') { console.error('Некорректный event-config.local.json'); process.exit(1); } }
if (!fs.existsSync(path.join(root, 'dist/server/index.js'))) {
  console.error('Ноутбук ещё не подготовлен. Один раз запустите prepare.bat. Затем используйте start.bat.'); process.exit(1);
}
const cloudflared = process.env.CLOUDFLARED_PATH || (fs.existsSync(path.join(root, 'runtime/cloudflared.exe')) ? path.join(root, 'runtime/cloudflared.exe') : 'cloudflared');
const notify = (url, status) => { if (server?.connected) server.send({ type: 'tunnel', url, status }); };
function openBrowser(url) {
  if (process.env.SOTA_NO_BROWSER === '1') return;
  if (process.platform === 'win32') {
    // URL содержит только локальный адрес и временный ключ, shell не используется.
    const child = spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], { windowsHide: true, stdio: 'ignore' });
    child.on('error', () => console.error('Откройте панель вручную:', url));
  } else console.log('Откройте панель:', url);
}
function startTunnel(port) {
  if (stopping) return;
  let args;
  if (config.mode === 'named') {
    if (!/^https:\/\/[^/]+\/?$/.test(config.publicUrl)) { notify('', 'Для постоянного туннеля задайте publicUrl в event-config.local.json'); return; }
    if (!process.env.TUNNEL_TOKEN && !config.tunnelName) { notify('', 'Укажите TUNNEL_TOKEN или имя настроенного туннеля'); return; }
    args = ['tunnel', '--no-autoupdate', 'run', ...(config.tunnelName ? [config.tunnelName] : [])];
  } else args = ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`, '--protocol', 'http2'];
  notify('', 'Подключаемся к Cloudflare. Нужен доступ к интернету…');
  const child = tunnel = spawn(cloudflared, args, { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let buffer = '', registered = false;
  watchdog = setTimeout(() => {
    if (!registered && child === tunnel) { notify('', 'Туннель не подключился за 45 секунд. Проверьте интернет и доступность Cloudflare.'); child.kill(); }
  }, 45000);
  function output(chunk) {
    buffer = (buffer + chunk.toString()).slice(-12000);
    const found = buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/i);
    if (found) lastUrl = found[0];
    if (/Registered tunnel connection/.test(buffer)) {
      registered = true; clearTimeout(watchdog); failures = 0;
      const url = config.mode === 'named' ? config.publicUrl : lastUrl;
      if (url) { notify(url, 'Туннель подключён. Игроки могут открывать ссылку.'); console.log('Ссылка для школьников:', url); }
      buffer = '';
    }
    if (/failed to request quick Tunnel|Unable to establish connection|no such host|connection refused|Connection terminated|failed to serve tunnel connection|All connections have been terminated/i.test(buffer))
      notify('', 'Нет связи с Cloudflare. Проверяем интернет и повторяем подключение…');
  }
  child.stdout.on('data', output); child.stderr.on('data', output);
  child.on('error', error => {
    clearTimeout(watchdog);
    notify('', error.code === 'ENOENT' ? 'cloudflared не найден. Подготовьте переносимую версию или установите Cloudflare Tunnel.' : 'Не удалось запустить туннель. Проверьте runtime и антивирус.');
    console.error('Не удалось запустить cloudflared:', error.code);
  });
  child.on('exit', () => {
    clearTimeout(watchdog); if (stopping || child !== tunnel) return;
    lastUrl = ''; notify('', 'Туннель отключён. Повторяем подключение…');
    restarting = setTimeout(() => startTunnel(port), Math.min(2000 * 2 ** failures++, 30000));
  });
}
server = fork(path.join(root, 'dist/server/index.js'), [], { cwd: root, windowsHide: true, stdio: ['inherit', 'inherit', 'inherit', 'ipc'] });
server.on('message', message => {
  if (message.type !== 'ready') return;
  const url = `http://127.0.0.1:${message.port}/organizer#${message.token}`;
  console.log('Сервер работает. Панель организатора:', url);
  console.log('Для остановки нажмите Ctrl+C. Не закрывайте это окно во время игры.');
  openBrowser(url);
  if (localOnly) notify('', 'Локальная проверка: публичный туннель отключён'); else startTunnel(message.port);
});
server.on('error', error => { console.error('Сервер не запущен:', error.code); stop(1); });
server.on('exit', code => { if (!stopping) { console.error('Сервер остановился, код:', code); stop(code || 1); } });
function stop(code = 0) {
  if (stopping) return; stopping = true; clearTimeout(restarting); clearTimeout(watchdog);
  if (tunnel && tunnel.exitCode === null) tunnel.kill();
  if (server?.connected) server.send({ type: 'stop' });
  const force = setTimeout(() => { server?.kill(); process.exit(code); }, 3000); force.unref();
  if (server?.exitCode !== null) process.exit(code);
  else server.once('exit', () => process.exit(code));
}
process.on('SIGINT', () => stop()); process.on('SIGTERM', () => stop());
process.on('message', message => { if (message?.type === 'stop') stop(); });
process.on('disconnect', () => stop());
