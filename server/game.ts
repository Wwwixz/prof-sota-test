import { randomInt, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { CITIES } from './cities';
import { GameError, Message } from './protocol';
import { Cell, Crystal, generateWorld, shuffle, World } from './world';

const questionSchema = z.object({ q: z.string(), a: z.array(z.string()).optional(), c: z.number().int().optional(),
  type: z.enum(['slider', 'tf']).optional(), min: z.number().optional(), max: z.number().optional(),
  step: z.number().positive().optional(), answer: z.number().optional(), unit: z.string().optional(), fact: z.string().optional(), hard: z.boolean().optional()
}).refine(q => q.type === 'slider' ? q.min !== undefined && q.max !== undefined && q.min < q.max && q.answer !== undefined && q.answer >= q.min && q.answer <= q.max :
  q.a && q.a.length >= 2 && q.c !== undefined && q.c >= 0 && q.c < q.a.length, 'Некорректный вопрос');
export type Question = z.infer<typeof questionSchema>;
type Pending = { id: string; index: number; q: Question; answered: boolean; hint: number[]; result?: { ok: boolean; accuracy: number; value: number } };
export type Player = Cell & { id: string; token: string; skin: number; name: string; dir: number; ack: number; score: number; fuel: number; hp: number; streak: number;
  state: 'playing' | 'question' | 'dead' | 'won'; reason: string; connected: boolean; disconnectedAt: number; lastTick: number; lastMove: number; pending?: Pending;
  decks: { easy: number[]; hard: number[] } };
export type Room = { code: string; cityIndex: number; level: number; totalMines: number; runOre: number; finished: boolean; world: World; players: Map<string, Player>; touched: number };
export type Identity = { room: Room; player: Player };
const clamp = (n: number, min = 0, max = 100) => Math.min(max, Math.max(min, n));
export class Game {
  rooms = new Map<string, Room>();
  tokens = new Map<string, Identity>();
  readonly questions: Question[];
  constructor(data: unknown, readonly now = Date.now) {
    this.questions = z.array(questionSchema).min(1).parse(data);
    if (!this.questions.some(q => q.hard) || !this.questions.some(q => !q.hard)) throw new Error('Нужны обычные и сложные вопросы');
  }
  create(cityIndex: number, skin: number): Identity {
    if (this.rooms.size >= 20 || this.tokens.size >= 120) throw new GameError('Все места заняты. Обратитесь к организатору.');
    const city = CITIES[cityIndex]; if (!city) throw new GameError('Город не найден');
    let code = '';
    do { code = Array.from({ length: 5 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[randomInt(32)]).join(''); } while (this.rooms.has(code));
    const room: Room = { code, cityIndex, level: 1, totalMines: clamp(Math.ceil(city.km / 45), 2, 5), runOre: 0,
      finished: false, world: generateWorld(1), players: new Map(), touched: this.now() };
    this.rooms.set(code, room); return this.add(room, skin);
  }
  join(code: string, skin: number): Identity {
    const room = this.rooms.get(code); if (!room) throw new GameError('Комната не найдена. Проверьте код.');
    if (room.finished) throw new GameError('Этот поход завершён. Создайте новый.');
    return this.add(room, skin);
  }
  private add(room: Room, skin: number): Identity {
    if (room.players.size >= 16 || this.tokens.size >= 120) throw new GameError('В комнате нет свободных мест');
    const number = Math.max(0, ...[...room.players.values()].map(p => Number(p.name.split(' ')[1]))) + 1;
    const player: Player = { ...room.world.start, id: randomUUID(), token: randomUUID(), skin, name: `Игрок ${number}`, dir: 1, ack: 0,
      score: 0, fuel: 100, hp: 100, streak: 0, state: 'playing', reason: '', connected: true, disconnectedAt: 0,
      lastTick: this.now(), lastMove: -Infinity, decks: { easy: [], hard: [] } };
    room.players.set(player.id, player); room.touched = this.now();
    const identity = { room, player }; this.tokens.set(player.token, identity); return identity;
  }
  resume(token: string): Identity {
    const identity = this.tokens.get(token);
    if (!identity || identity.player.disconnectedAt && this.now() - identity.player.disconnectedAt > 60000) throw new GameError('Время восстановления истекло. Войдите в комнату снова.');
    identity.player.connected = true; identity.player.disconnectedAt = 0; identity.player.lastTick = this.now();
    return identity;
  }
  disconnect({ room, player }: Identity): void {
    player.connected = false; player.disconnectedAt = this.now();
    if (player.pending && !player.pending.answered) { this.release(room, player); player.state = 'playing'; }
  }
  leave(identity: Identity): void {
    this.release(identity.room, identity.player); identity.room.players.delete(identity.player.id); this.tokens.delete(identity.player.token);
    identity.room.touched = this.now();
  }
  end(code: string): void {
    const room = this.rooms.get(code); if (!room) throw new GameError('Комната уже закрыта');
    for (const p of room.players.values()) this.tokens.delete(p.token);
    this.rooms.delete(code);
  }
  tick(): void {
    const now = this.now();
    for (const room of this.rooms.values()) {
      for (const player of room.players.values()) {
        const dt = Math.max(0, (now - player.lastTick) / 1000); player.lastTick = now;
        if (player.connected && player.state === 'playing') {
          player.fuel = clamp(player.fuel - dt * 1.05);
          if (!player.fuel) this.die(room, player, 'Фонарь погас, и шахта сомкнулась.');
        }
        if (!player.connected && now - player.disconnectedAt > 60000) this.leave({ room, player });
      }
      if (!room.players.size && now - room.touched > 60000) this.rooms.delete(room.code);
    }
  }
  private die(room: Room, player: Player, reason: string): void {
    this.release(room, player); player.state = 'dead'; player.reason = reason;
  }
  private release(room: Room, player: Player): void {
    for (const c of room.world.crystals) if (c.owner === player.id) delete c.owner;
    delete player.pending;
  }
  private open(room: Room, p: Player): void {
    const index = room.world.crystals.findIndex(c => !c.done && c.x === p.x && c.y === p.y);
    const c = room.world.crystals[index];
    if (!c) return;
    if (c.owner && c.owner !== p.id) throw new GameError('Этот кристалл разбирает товарищ');
    if (p.pending && !p.pending.answered) return;
    c.owner = p.id;
    const key = c.hard ? 'hard' : 'easy';
    if (!p.decks[key].length) p.decks[key] = shuffle(this.questions.map((_, i) => i).filter(i => !!this.questions[i].hard === c.hard));
    p.pending = { id: randomUUID(), index, q: this.questions[p.decks[key].pop()!], answered: false, hint: [] }; p.state = 'question';
  }
  action({ room, player: p }: Identity, m: Message): void {
    if (!this.rooms.has(room.code)) throw new GameError('Сессия завершена организатором');
    room.touched = this.now();
    if ('level' in m && m.level !== room.level) throw new GameError('Шахта сменилась. Состояние обновлено.');
    if (p.state === 'dead' || p.state === 'won') throw new GameError('Поход для вас завершён');
    if (m.type === 'move') {
      if (p.state !== 'playing' || Math.abs(m.dx) + Math.abs(m.dy) !== 1) throw new GameError('Недопустимое движение');
      if (this.now() - p.lastMove < 75) throw new GameError('Слишком быстрое движение');
      const x = p.x + m.dx, y = p.y + m.dy;
      if (room.world.map[y]?.[x] !== 0) throw new GameError('Здесь стена');
      p.x = x; p.y = y; p.lastMove = this.now(); if (m.dx) p.dir = m.dx;
      const pickup = room.world.pickups.findIndex(c => c.x === x && c.y === y);
      if (pickup >= 0) {
        const pk = room.world.pickups.splice(pickup, 1)[0];
        if (pk.type === 'oil') p.fuel = clamp(p.fuel + 20); else p.hp = clamp(p.hp + 18);
        p.score += 30; return;
      }
      if (room.world.crystals.some(c => !c.done && c.x === x && c.y === y)) { this.open(room, p); return; }
      if (x === room.world.exitCell.x && y === room.world.exitCell.y && this.collected(room) >= room.world.needed) this.advance(room);
    } else if (m.type === 'question') {
      if (p.state !== 'playing') throw new GameError('Сначала завершите текущий вопрос');
      this.open(room, p);
    } else if (m.type === 'answer') {
      const pending = this.pending(p, m.questionId);
      const q = pending.q;
      if (q.type === 'slider' && (m.value < q.min! || m.value > q.max!) || q.type !== 'slider' && (!Number.isInteger(m.value) || !q.a?.[m.value])) throw new GameError('Некорректный ответ');
      const accuracy = q.type === 'slider' ? clamp(1 - Math.abs(m.value - q.answer!) / Math.max(1, q.max! - q.min!), 0, 1) : Number(m.value === q.c);
      const ok = accuracy >= .5, c = room.world.crystals[pending.index], hard = c.hard;
      if (c.done || c.owner !== p.id) throw new GameError('Кристалл уже занят или собран');
      pending.answered = true; pending.result = { ok, accuracy, value: m.value };
      if (ok) {
        p.streak++; p.score += Math.round((120 + room.level * 40 + p.streak * 25) * (hard ? 2 : 1) * (q.type === 'slider' ? .3 + .7 * accuracy : 1));
        p.fuel = clamp(p.fuel + (hard ? 24 : 16)); p.hp = clamp(p.hp + (hard ? 5 : 3)); c.done = true; room.runOre++;
      } else {
        p.streak = 0; p.score = Math.max(0, p.score - (q.type === 'slider' ? 20 : 40)); p.fuel = clamp(p.fuel - 12); p.hp = clamp(p.hp - 11); c.cracked = true;
      }
    } else if (m.type === 'hint') {
      const pending = this.pending(p, m.questionId);
      if (pending.hint.length || pending.q.type === 'slider' || pending.q.type === 'tf' || p.fuel <= 10) throw new GameError('Подсказка недоступна');
      pending.hint = shuffle(pending.q.a!.map((_, i) => i).filter(i => i !== pending.q.c)).slice(0, 2); p.fuel -= 10;
    } else if (m.type === 'cancel') {
      if (!p.pending || p.pending.answered) throw new GameError('Вопрос уже завершён');
      p.score = Math.max(0, p.score - 75); this.release(room, p); p.state = 'playing';
    } else if (m.type === 'next') {
      if (!p.pending?.answered) throw new GameError('Сначала ответьте на вопрос');
      const retry = !p.pending.result!.ok; this.release(room, p); p.state = 'playing';
      if (p.hp <= 0 || p.fuel <= 0) this.die(room, p, p.hp <= 0 ? 'Силы покинули вас в темноте.' : 'Фонарь погас, и шахта сомкнулась.');
      else if (retry) this.open(room, p);
    } else throw new GameError('Недопустимое действие');
  }
  private pending(p: Player, id: string): Pending {
    if (p.state !== 'question' || !p.pending || p.pending.id !== id || p.pending.answered) throw new GameError('Вопрос уже изменился или завершён');
    return p.pending;
  }
  private collected(room: Room): number { return room.world.crystals.filter(c => c.done).length; }
  private advance(room: Room): void {
    for (const p of room.players.values()) {
      if (p.state === 'dead') continue;
      if (p.hp <= 0 || p.fuel <= 0) { this.die(room, p, p.hp <= 0 ? 'Силы покинули вас в темноте.' : 'Фонарь погас, и шахта сомкнулась.'); continue; }
      this.release(room, p); p.streak = 0; p.score += 300 + (room.level + 1) * 60;
      p.fuel = clamp(p.fuel + 30); p.hp = clamp(p.hp + 12); p.state = 'playing';
    }
    if (room.level >= room.totalMines) {
      room.finished = true;
      for (const p of room.players.values()) if (p.state !== 'dead') { p.state = 'won'; p.score += Math.round(CITIES[room.cityIndex].km * 15); }
    } else {
      room.level++; room.world = generateWorld(room.level);
      for (const p of room.players.values()) { p.x = room.world.start.x; p.y = room.world.start.y; }
    }
  }
  snapshot({ room, player: p }: Identity) {
    const pending = p.pending;
    return { type: 'state', code: room.code, city: CITIES[room.cityIndex], level: room.level, totalMines: room.totalMines,
      runOre: room.runOre, collected: this.collected(room), finished: room.finished, world: room.world,
      players: [...room.players.values()].map(({ id, name, skin, x, y, dir, connected, state }) => ({ id, name, skin, x, y, dir, connected, state })),
      me: { id: p.id, x: p.x, y: p.y, dir: p.dir, ack: p.ack, score: p.score, fuel: p.fuel, hp: p.hp, streak: p.streak, state: p.state, reason: p.reason,
        pending: pending && { id: pending.id, index: pending.index, answered: pending.answered, hint: pending.hint, result: pending.result,
          question: pending.answered ? pending.q : { ...pending.q, c: undefined, answer: undefined, fact: undefined } } } };
  }
  overview() { return [...this.rooms.values()].map(r => ({ code: r.code, city: CITIES[r.cityIndex].name, level: r.level,
    players: [...r.players.values()].filter(p => p.connected).length, reserved: r.players.size, finished: r.finished })); }
}
