(() => {
  let token = location.hash.slice(1);
  try { if (token) sessionStorage.setItem('sota-admin', token); else token = sessionStorage.getItem('sota-admin') || ''; } catch {}
  history.replaceState(null, '', '/organizer');
  const el = id => document.getElementById(id);
  let currentUrl = '', qrObject = null, refreshing = false, citiesLoaded = false;
  const starting = new Set();
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
  async function start(code) {
    if (starting.has(code)) return;
    starting.add(code);
    try { await request('/api/admin/start', { method: 'POST', body: JSON.stringify({ code }) }); await refresh(); }
    catch (error) { el('error').textContent = error.message; }
    finally { starting.delete(code); }
  }
  async function refresh() {
    if (refreshing) return; refreshing = true;
    try {
      const state = await (await request('/api/admin/state')).json();
      el('status').textContent = state.status; el('tunnel').textContent = state.tunnelStatus;
      el('count').textContent = state.connected; el('error').textContent = '';
      if (!citiesLoaded){
        state.cities.forEach((city, index) => { const option = document.createElement('option'); option.value = index; option.textContent = city.name; el('citySelect').appendChild(option); });
        citiesLoaded = true; el('createBtn').disabled = false;
      }
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
        tr.dataset.code = room.code;
        for (const value of [room.code, room.city, room.finished ? 'Завершена' : room.started ? 'Игра · шахта ' + room.level : 'Ожидание старта']) { const td = document.createElement('td'); td.textContent = value; tr.appendChild(td); }
        tr.firstElementChild.className = 'code';
        const players = document.createElement('td'); players.textContent = 'Онлайн: ' + room.players + '/60';
        const roster = document.createElement('ul'); roster.className = 'roster';
        room.roster.forEach(player => { const li = document.createElement('li'); li.textContent = player.name + ' · ' + ['Шахтёр','Гном','Инженер'][player.skin] + (player.connected ? '' : ' · нет связи'); roster.appendChild(li); });
        players.appendChild(roster); tr.appendChild(players);
        const td = document.createElement('td'), launch = document.createElement('button'), button = document.createElement('button');
        launch.textContent = room.started ? 'Игра началась' : 'Начать игру'; launch.dataset.action = 'start'; launch.disabled = room.started || room.finished || !room.players || starting.has(room.code); launch.onclick = () => start(room.code); td.appendChild(launch);
        const snake=document.createElement('button');snake.textContent='Алмазная змейка';snake.disabled=!room.started||room.finished;snake.onclick=async()=>{try{await request('/api/admin/snake',{method:'POST',body:JSON.stringify({code:room.code})})}catch(e){el('error').textContent=e.message}};td.appendChild(snake);
        button.textContent = 'Завершить'; button.className = 'danger'; button.onclick = () => end(room.code); td.appendChild(button); tr.appendChild(td); el('rooms').appendChild(tr);
      }
    } catch (error) { el('error').textContent = error.message; el('status').textContent = 'Нет связи с сервером'; }
    finally { refreshing = false; }
  }
  el('copy').onclick = async () => { try { await navigator.clipboard.writeText(currentUrl); el('copy').textContent = 'Ссылка скопирована'; } catch { el('error').textContent = 'Выделите и скопируйте ссылку вручную.'; } };
  el('endAll').onclick = () => end('*');
  el('createRoom').onsubmit = async event => {
    event.preventDefault(); el('createBtn').disabled = true;
    try {
      const result = await (await request('/api/admin/create', { method: 'POST', body: JSON.stringify({ city: Number(el('citySelect').value) }) })).json();
      el('createdRoom').textContent = 'Код комнаты: ' + result.code + '. Дождитесь участников и нажмите «Начать игру».';
      await refresh();
    } catch (error) { el('error').textContent = error.message; }
    finally { el('createBtn').disabled = false; }
  };
  if (!token) el('error').textContent = 'Откройте панель через start.bat: отсутствует ключ организатора.';
  else { refresh(); setInterval(refresh, 2000); }
})();
