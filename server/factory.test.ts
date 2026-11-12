import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { generateWorld, World } from './world';
import { Game } from './game';
const factory: { arrange(world: World, depth: number): World } = require('../../assets/factory.js');

test('станки имеют уникальные доступные посты на полу и корпуса в стенах; правила уровня сохранены', () => {
  const types = new Set<string>();
  for (let depth = 1; depth <= 5; depth++) for (let i = 0; i < 50; i++) {
    const world = generateWorld(depth), equipment = world.crystals.filter(c => c.kind);
    assert.ok(equipment.length > world.crystals.length / 2);
    assert.ok(new Set(equipment.map(c => c.kind)).size >= 3);
    assert.equal(new Set(world.crystals.map(c => `${c.x},${c.y}`)).size, world.crystals.length);
    assert.equal(new Set(equipment.map(c => `${c.machine!.x},${c.machine!.y}`)).size, equipment.length);
    for (const c of equipment) {
      types.add(c.kind!);
      assert.equal(world.map[c.y][c.x], 0);
      assert.equal(world.map[c.machine!.y][c.machine!.x], 1);
      assert.equal(Math.abs(c.x-c.machine!.x)+Math.abs(c.y-c.machine!.y), 1);
      for (const occupied of [...world.pickups, world.start, world.exitCell]) assert.ok(c.x!==occupied.x || c.y!==occupied.y);
    }
    assert.equal(world.needed, Math.min(3 + Math.floor((depth - 1) / 2), 6));
    // Browser and server must produce identical placement from the same input.
    const input = structuredClone(world); input.crystals.forEach(c => { delete c.kind; delete c.machine; });
    const a = structuredClone(input), b = structuredClone(input), map = JSON.stringify(input.map);
    factory.arrange(a, depth); factory.arrange(b, depth);
    assert.deepEqual(a, b); assert.equal(JSON.stringify(a.map), map);
  }
  assert.equal(types.size, 6);
});

test('испытание станка синхронизируется, сохраняет штрафы и выдаёт награду единственный раз', () => {
  const questions = JSON.parse(readFileSync(path.resolve(__dirname, '../../questions.json'), 'utf8'));
  const game = new Game(questions), a = game.create(0, 0), b = game.join(a.room.code, 1);
  game.start(a.room.code);
  const c = a.room.world.crystals.find(c => c.kind)!;
  Object.assign(a.player, {x:c.x,y:c.y}); Object.assign(b.player, {x:c.x,y:c.y});
  game.action(a, {type:'question',level:1});
  assert.throws(() => game.action(b, {type:'question',level:1}));
  a.player.pending!.q = {q:'Проверка',a:['Да','Нет'],c:0};
  const id = a.player.pending!.id;
  game.action(a, {type:'answer',level:1,questionId:id,value:1});
  assert.equal(c.done, false); assert.equal(c.cracked,true); assert.equal(a.player.fuel,88); assert.equal(a.player.hp,89);
  game.action(a, {type:'next',level:1});
  a.player.pending!.q = {q:'Проверка',a:['Да','Нет'],c:0};
  const retry = a.player.pending!.id;
  game.action(a, {type:'answer',level:1,questionId:retry,value:0});
  const score = a.player.score;
  assert.equal(c.done,true); assert.equal(a.room.runOre,1);
  assert.throws(() => game.action(a, {type:'answer',level:1,questionId:retry,value:0}));
  assert.equal(a.player.score,score);
  game.action(a, {type:'next',level:1});
  game.action(b, {type:'question',level:1});
  assert.equal(b.player.pending,undefined);
  assert.equal(game.snapshot(b).world.crystals.find(s=>s.x===c.x && s.y===c.y)!.done,true);
});
