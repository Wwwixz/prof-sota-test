/* Соединение игры: восстановление сессии и задержка повторных подключений. */
window.SotaConnection = class {
  constructor(onMessage, onStatus) {
    this.onMessage = onMessage; this.onStatus = onStatus; this.socket = null;
    this.token = null; this.attempt = 0; this.stopped = true; this.timer = null;
    try { this.token = sessionStorage.getItem('sota-session'); } catch {}
    window.addEventListener('online', () => { if (!this.stopped && !this.connected) { clearTimeout(this.timer); this.open(); } });
  }
  get connected() { return this.socket?.readyState === WebSocket.OPEN; }
  start(message) { this.stop(false); this.token = null; this.remember(); this.initial = message; this.stopped = false; this.attempt = 0; this.open(); }
  resume() { if (this.token) { this.stopped = false; this.open(); return true; } return false; }
  remember() { try { if (this.token) sessionStorage.setItem('sota-session', this.token); else sessionStorage.removeItem('sota-session'); } catch {} }
  open() {
    if (this.stopped) return;
    clearTimeout(this.timer);
    if (this.socket) { this.socket.onclose = null; this.socket.close(); }
    this.onStatus('connecting');
    const socket = this.socket = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
    let receivedWelcome = false;
    const timeout = setTimeout(() => socket.close(), 10000);
    socket.onopen = () => socket.send(JSON.stringify(this.token ? { type: 'resume', token: this.token } : this.initial));
    socket.onmessage = event => {
      let message; try { message = JSON.parse(event.data); } catch { this.onStatus('error', 'Сервер вернул некорректный ответ'); socket.close(); return; }
      if (message.type === 'welcome') { receivedWelcome = true; clearTimeout(timeout); this.token = message.token; this.remember(); this.attempt = 0; this.onStatus('connected'); }
      if (message.type === 'error' && !receivedWelcome) { this.stop(); this.onStatus('error', message.message); return; }
      if (message.type === 'ended') { this.stop(); this.onStatus('error', message.message); return; }
      this.onMessage(message);
    };
    socket.onerror = () => this.onStatus('connecting', navigator.onLine ? 'Проверяем связь с сервером…' : 'Нет интернета. Ожидаем подключения…');
    socket.onclose = () => {
      clearTimeout(timeout);
      if (this.stopped) return;
      this.onStatus('connecting', 'Связь прервана. Восстанавливаем подключение…');
      this.timer = setTimeout(() => this.open(), Math.min(500 * 2 ** this.attempt++, 5000) + Math.random() * 250);
    };
  }
  send(message) { if (!this.connected || this.stopped) return false; this.socket.send(JSON.stringify(message)); return true; }
  stop(clear = true) {
    this.stopped = true; clearTimeout(this.timer);
    if (this.connected) this.socket.send(JSON.stringify({ type: 'leave' }));
    if (this.socket) { this.socket.onclose = null; this.socket.close(); this.socket = null; }
    if (clear) { this.token = null; this.remember(); }
  }
};
