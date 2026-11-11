import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Game } from './game';
import { messageSchema, RateLimit } from './protocol';
import { dirs, generateWorld } from './world';
const data = JSON.parse(readFileSync(path.resolve(__dirname, '../../questions.json'), 'utf8'));
const activeRoom = (game: Game, city: number, skin: number) => { const identity = game.create(city, skin); game.start(identity.room.code); return identity; };
const setup = () => { let time = 1000; const game = new Game(data, () => time); return { game, advance: (ms = 100) => { time += ms; game.tick(); } }; };

test('карта связная, кристаллов достаточно, старт и лестница доступны', () => {
  for (let i = 0; i < 60; i++) {
    const world = generateWorld(i % 5 + 1), queue = [world.start], visited = new Set([`${world.start.x},${world.start.y}`]);
    for (let n = 0; n < queue.length; n++) for (const [dx, dy] of dirs) {
      const x = queue[n].x + dx, y = queue[n].y + dy, key = `${x},${y}`;
      if (world.map[y]?.[x] === 0 && !visited.has(key)) { visited.add(key); queue.push({ x, y }); }
    }
    assert.equal(visited.size, world.map.flat().filter(v => !v).length);
    assert.ok(world.crystals.length >= world.needed);
    for (const c of [...world.crystals, ...world.pickups, world.exitCell]) assert.ok(visited.has(`${c.x},${c.y}`));
  }
});
test('сервер проверяет шаг, стену, частоту движения и версию шахты', () => {
  const { game, advance } = setup(), a = activeRoom(game, 0, 1), { player: p, room } = a;
  assert.throws(() => game.action(a, { type: 'move', level: 1, seq: 1, dx: 1, dy: 1 }));
  const [dx, dy] = dirs.find(([x, y]) => room.world.map[p.y + y]?.[p.x + x] === 0)!;
  game.action(a, { type: 'move', level: 1, seq: 2, dx, dy });
  assert.throws(() => game.action(a, { type: 'move', level: 1, seq: 3, dx: -dx, dy: -dy }));
  advance();
  if (p.state === 'question') game.action(a, { type: 'cancel', level: 1 });
  assert.throws(() => game.action(a, { type: 'move', level: 2, seq: 4, dx, dy }));
  p.x = 1; p.y = 1; room.world.map[1][2] = 1;
  assert.throws(() => game.action(a, { type: 'move', level: 1, seq: 5, dx: 1, dy: 0 }));
});
test('комнаты изолированы, решения проверяются сервером, награда выдаётся один раз', () => {
  const { game } = setup(), a = activeRoom(game, 0, 0), b = game.join(a.room.code, 2), other = activeRoom(game, 1, 1);
  assert.notEqual(other.room.code, a.room.code);
  assert.equal(a.room.world, b.room.world);
  const c = a.room.world.crystals[0]; Object.assign(a.player, c); Object.assign(b.player, c);
  game.action(a, { type: 'question', level: 1 });
  assert.throws(() => game.action(b, { type: 'question', level: 1 }));
  const pending = a.player.pending!;
  pending.q = { q: 'Проверка', a: ['Верно', 'Неверно', 'Другой ответ', 'Ещё ответ'], c: 0 };
  const safe = game.snapshot(a).me.pending!.question;
  assert.equal(safe.c, undefined); assert.equal(safe.answer, undefined);
  game.action(a, { type: 'hint', level: 1, questionId: pending.id });
  assert.ok(!pending.hint.includes(pending.q.c!)); assert.equal(a.player.fuel, 90);
  game.action(a, { type: 'answer', level: 1, questionId: pending.id, value: pending.q.c! });
  assert.equal(a.room.runOre, 1); assert.equal(a.player.score, 185);
  assert.throws(() => game.action(a, { type: 'answer', level: 1, questionId: pending.id, value: pending.q.c! }));
  assert.equal(a.room.runOre, 1);
  assert.equal(JSON.stringify(game.snapshot(b)).includes(a.player.token), false);
});
test('ползунок, неверные ответы, штраф выхода и смерть сохраняют правила игры', () => {
  const { game } = setup(), a = activeRoom(game, 0, 0), c = a.room.world.crystals[0]; Object.assign(a.player, c);
  game.action(a, { type: 'question', level: 1 });
  const pending = a.player.pending!;
  pending.q = { q: 'Число', type: 'slider', min: 0, max: 100, step: 1, answer: 90 };
  game.action(a, { type: 'answer', level: 1, questionId: pending.id, value: 90 });
  assert.equal(a.player.score, 185);
  game.action(a, { type: 'next', level: 1 });
  const second = a.room.world.crystals[1]; second.hard = false; Object.assign(a.player, second);
  game.action(a, { type: 'question', level: 1 });
  a.player.score = 100; game.action(a, { type: 'cancel', level: 1 }); assert.equal(a.player.score, 25);
  game.action(a, { type: 'question', level: 1 });
  const retry = a.player.pending!; retry.q = { q: 'Проверка', a: ['Да', 'Нет'], c: 0 };
  a.player.hp = 10;
  game.action(a, { type: 'answer', level: 1, questionId: retry.id, value: 1 });
  assert.equal(a.player.fuel, 88); assert.equal(second.cracked, true);
  game.action(a, { type: 'next', level: 1 }); assert.equal(a.player.state, 'dead');
});
test('следующая шахта и победа общие; повторный переход отклоняется', () => {
  const { game } = setup(), a = activeRoom(game, 0, 0), b = game.join(a.room.code, 1);
  for (let level = 1; level <= 2; level++) {
    a.room.world.crystals.forEach(c => { c.done = true; });
    const exit = a.room.world.exitCell;
    const [dx, dy] = dirs.find(([x, y]) => a.room.world.map[exit.y - y]?.[exit.x - x] === 0)!;
    a.player.x = exit.x - dx; a.player.y = exit.y - dy; a.player.lastMove = -Infinity;
    game.action(a, { type: 'move', level, seq: level, dx, dy });
    if (level === 1) { assert.equal(a.room.level, 2); assert.equal(b.player.x, a.room.world.start.x); }
  }
  assert.equal(a.room.finished, true); assert.equal(b.player.state, 'won');
  assert.throws(() => game.action(a, { type: 'move', level: 2, seq: 3, dx: 1, dy: 0 }));
});
test('восстановление сохраняет игрока; отключение снимает блокировку, RAM очищается', () => {
  const { game, advance } = setup(), a = activeRoom(game, 0, 0), token = a.player.token;
  const c = a.room.world.crystals[0]; Object.assign(a.player, c); game.action(a, { type: 'question', level: 1 });
  a.player.score = 42; game.disconnect(a); assert.equal(c.owner, undefined);
  const fuel = a.player.fuel; advance(30000); assert.equal(a.player.fuel, fuel);
  const restored = game.resume(token); assert.equal(restored.player.id, a.player.id); assert.equal(restored.player.score, 42);
  game.disconnect(restored); advance(61000); assert.throws(() => game.resume(token)); advance(61000);
  assert.equal(game.rooms.size, 0); assert.equal(game.tokens.size, 0);
});
test('валидатор отвергает подмену очков, некорректные типы и лишние поля; лимитер восстанавливается', () => {
  assert.equal(messageSchema.safeParse({ type: 'move', level: 1, seq: 1, dx: 1, dy: 0, score: 999 }).success, false);
  assert.equal(messageSchema.safeParse({ type: 'join', code: '<html>', skin: 0 }).success, false);
  let time = 0; const rate = new RateLimit(2, 1, () => time);
  assert.equal(rate.take(), true); assert.equal(rate.take(), true); assert.equal(rate.take(), false);
  time = 1000; assert.equal(rate.take(), true);
});

test('организатор собирает группу и запускает всех одновременно без расхода света в ожидании', () => {
  const { game, advance } = setup();
  const room = game.createRoom(0);
  assert.equal(room.players.size, 0); assert.equal(room.started, false);
  assert.throws(() => game.start(room.code));
  advance(120000); assert.ok(game.rooms.has(room.code));
  const a = game.join(room.code, 0), b = game.join(room.code, 2);
  advance(120000);
  assert.equal(a.player.fuel, 100); assert.equal(b.player.fuel, 100);
  assert.equal(game.snapshot(a).me.state, 'waiting');
  assert.throws(() => game.action(a, { type: 'move', level: 1, seq: 1, dx: 1, dy: 0 }));
  assert.throws(() => game.action(a, { type: 'question', level: 1 }));
  game.disconnect(b); advance(10000); game.resume(b.player.token);
  assert.equal(b.player.state, 'waiting');
  game.start(room.code);
  assert.equal(a.player.state, 'playing'); assert.equal(b.player.state, 'playing');
  assert.deepEqual({ x: a.player.x, y: a.player.y }, room.world.start);
  assert.equal(a.player.fuel, 100); advance(1000); assert.ok(a.player.fuel < 100);
  assert.throws(() => game.start(room.code));
  const c = game.join(room.code, 1); assert.equal(c.player.state, 'playing');
});
