(() => {
  let token = location.hash.slice(1);
  try { if (token) sessionStorage.setItem('sota-admin', token); else token = sessionStorage.getItem('sota-admin') || ''; } catch {}
  history.replaceState(null, '', '/organizer');
  const el = id => document.getElementById(id);
  let currentUrl = '', qrObject = null, refreshing = false;
  async function request(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' } });
    if (!response.ok) { let error; try { error = (await response.json()).error; } catch {} throw new Error(error || 'Сервер недоступен'); }
    return response;
  }
  async function end(code) {
    if (!confirm(code === '*' ? 'Завершить все игровые сессии? Игроки будут отключены.' : 'Завершить комнату ' + code + '?')) return;
    try { await request('/api/admin/end', { method: 'POST', body: JSON.stringify({ code }) }); await refresh(); }
    catch (error) { el('error').textContent = error.message; }
  }
  async function refresh() {
    if (refreshing) return; refreshing = true;
    try {
      const state = await (await request('/api/admin/state')).json();
      el('status').textContent = state.status; el('tunnel').textContent = state.tunnelStatus;
      el('count').textContent = state.connected; el('error').textContent = '';
      el('waiting').hidden = !!state.publicUrl; el('copy').disabled = !state.publicUrl;
      el('link').textContent = state.publicUrl; el('link').href = state.publicUrl || '#';
      if (state.publicUrl && (state.publicUrl !== currentUrl || !qrObject)) {
        const svg = await (await request('/api/admin/qr')).blob();
        if (qrObject) URL.revokeObjectURL(qrObject); qrObject = URL.createObjectURL(svg);
        el('qr').src = qrObject; el('qr').hidden = false;
      } else if (!state.publicUrl) { el('qr').hidden = true; }
      currentUrl = state.publicUrl;
      el('rooms').replaceChildren(); el('empty').hidden = state.rooms.length > 0;
      for (const room of state.rooms) {
        const tr = document.createElement('tr');
        for (const value of [room.code, room.city, room.finished ? 'Завершена' : room.level, room.players]) { const td = document.createElement('td'); td.textContent = value; tr.appendChild(td); }
        const td = document.createElement('td'), button = document.createElement('button'); button.textContent = 'Завершить'; button.className = 'danger'; button.onclick = () => end(room.code); td.appendChild(button); tr.appendChild(td); el('rooms').appendChild(tr);
      }
    } catch (error) { el('error').textContent = error.message; el('status').textContent = 'Нет связи с сервером'; }
    finally { refreshing = false; }
  }
  el('copy').onclick = async () => { try { await navigator.clipboard.writeText(currentUrl); el('copy').textContent = 'Ссылка скопирована'; } catch { el('error').textContent = 'Выделите и скопируйте ссылку вручную.'; } };
  el('endAll').onclick = () => end('*');
  if (!token) el('error').textContent = 'Откройте панель через start.bat: отсутствует ключ организатора.';
  else { refresh(); setInterval(refresh, 2000); }
})();
