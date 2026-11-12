import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {Game} from './game';
import {SnakeService} from './snake';
import {messageSchema} from './protocol';
const {Round,terminal}=require('../../assets/snake-engine.js');
const C=require('../../assets/snake-config.js');
test('snake: authoritative collection, collisions, protection and bounded growth',()=>{
  const r=new Round('test',0);r.join('a','A',0);r.join('b','B',0);r.startAt=0;
  const [a,b]=r.players;a.x=b.x=500;a.y=b.y=400;a.angle=b.angle=a.target=b.target=0;
  r.food=[{id:1,x:504,y:400,value:5}];r.tick(40);assert.equal(a.score+b.score,5);assert.equal(a.collected+b.collected,1);
  a.length=90;a.protectedUntil=b.protectedUntil=0;b.body=Array.from({length:24},()=>({x:a.x+4,y:a.y}));a.body=Array.from({length:90},()=>({x:a.x,y:a.y}));
  const generation=a.generation;r.tick(80);assert.equal(a.generation,generation);assert.equal(a.respawnAt,80+C.respawnMs);assert.ok(a.length<90);
  r.tick(120);assert.equal(a.generation,generation);r.tick(80+C.respawnMs);assert.equal(a.generation,generation+1);assert.ok(a.protectedUntil>=80+C.respawnMs+C.protectionMs);r.tick(C.roundMs+C.countdownMs);assert.equal(r.phase,'end');
});
test('snake: room isolation, resume, pause, exactly-once rewards and cleanup',()=>{
  let now=100;const game=new Game(JSON.parse(readFileSync(path.resolve(__dirname,'../../questions.json'),'utf8')),()=>now);
  const a=game.create(0,0),b=game.join(a.room.code,1),other=game.create(0,0);game.start(a.room.code);game.start(other.room.code);
  const service=new SnakeService(game,()=>{},()=>now);const r=service.invite(a.room,true);assert.equal(r.players.length,2);assert.throws(()=>service.invite(a.room));
  assert.throws(()=>service.action(other,{type:'snake_join',roundId:r.id}));assert.throws(()=>service.action(a,{type:'snake_leave',roundId:'old'}));assert.ok(a.player.snake);
  const position=[a.player.x,a.player.y];now+=1000;game.tick();assert.equal(a.player.fuel,100);assert.ok(other.player.fuel<100);
  game.disconnect(a);game.resume(a.player.token);let restored:any;service.sync(a,m=>restored=m);assert.equal(restored.id,r.id);
  now=r.endAt;service.tick();const score=a.player.score;assert.ok(score>=75);service.tick();assert.equal(a.player.score,score);assert.equal(service.rounds.size,0);assert.deepEqual([a.player.x,a.player.y],position);
  service.action(a,{type:'snake_leave',roundId:r.id});assert.equal(a.player.snakeResult,undefined);
  service.invite(a.room,true);game.end(a.room.code);service.tick();assert.equal(service.rounds.size,0);
});
test('snake: input schema rejects forged rewards; terminal is stable and preserves map',()=>{
  assert.equal(messageSchema.safeParse({type:'snake_input',roundId:'bad',angle:0,score:100}).success,false);
  const game=new Game(JSON.parse(readFileSync(path.resolve(__dirname,'../../questions.json'),'utf8'))),a=game.create(0,0),w:any=a.room.world;
  const before=JSON.stringify(w.map),t=terminal(w);w.pickups=[];assert.deepEqual(terminal(w),t);assert.equal(JSON.stringify(w.map),before);assert.equal(w.map[t.y][t.x],0);assert.ok(!w.crystals.some((c:any)=>c.x===t.x&&c.y===t.y));
});
test('snake: terminal invite is validated; declining players continue; organizer preserves questions',()=>{
  let now=100;const game=new Game(JSON.parse(readFileSync(path.resolve(__dirname,'../../questions.json'),'utf8')),()=>now);
  const a=game.create(0,0),b=game.join(a.room.code,1);game.start(a.room.code);const service=new SnakeService(game,()=>{},()=>now);
  const t=terminal(a.room.world);a.player.x=-5;assert.throws(()=>service.action(a,{type:'snake_invite'}));Object.assign(a.player,t);service.action(a,{type:'snake_invite'});
  assert.ok(a.player.snake);assert.ok(!b.player.snake);now+=500;game.tick();assert.equal(a.player.fuel,100);assert.ok(b.player.fuel<100);
  assert.throws(()=>game.action(a,{type:'move',level:1,seq:1,dx:1,dy:0}));
  const r=service.rounds.get(a.room.code);now=r.endAt;service.tick();
  const crystal=a.room.world.crystals[0];Object.assign(b.player,{x:crystal.x,y:crystal.y});game.action(b,{type:'question',level:1});const pending=b.player.pending;
  const next=service.invite(a.room,true);assert.ok(b.player.snake);assert.equal(b.player.pending,pending);now=next.endAt;service.tick();assert.equal(b.player.pending,pending);assert.equal(b.player.state,'question');
});
test('snake: 60 separated spawns, distinct colors, bounded AOI and world size',()=>{
  let seed=17;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
  const r=new Round('scale',0,random);for(let i=0;i<60;i++)assert.ok(r.join(String(i),'Player '+i,0));assert.equal(r.join('extra','Extra',0),false);
  assert.equal(new Set(r.players.map((p:any)=>p.color)).size,60);assert.equal(r.food.filter((f:any)=>f.value===1).length,1500);assert.equal(r.food.filter((f:any)=>f.value===5).length,100);
  for(const p of r.players){assert.ok(p.x>=0&&p.x<=6000&&p.y>=0&&p.y<=6000);for(const o of r.players)if(p!==o)assert.ok(Math.hypot(p.x-o.x,p.y-o.y)>=C.spawnDistance)}
  r.tick(C.countdownMs);const s=r.snapshot(C.countdownMs,'0');assert.ok(s.players.length<20);assert.equal(s.dots.length,60);assert.equal(s.top.length,10);assert.ok(s.food.length<1600);assert.equal(r.snapshot(C.countdownMs,'0',false).dots,undefined);
  assert.ok(r.players.every((p:any)=>p.protectedUntil>=C.countdownMs+C.protectionMs));
});
test('snake: crystals respawn after delay, boundary turning preserves life, input is limited',()=>{
  const r=new Round('balance',0);r.join('a','A',0);r.startAt=0;const p=r.players[0];p.x=500;p.y=500;p.angle=p.target=0;r.food=[{id:1,x:505,y:500,value:5}];r.index();r.tick(50);assert.equal(p.score,5);assert.equal(r.food.length,0);r.tick(50+C.foodRespawnMs);assert.equal(r.food.length,1);
  r.input('a',1,5000);r.input('a',2,5001);assert.equal(p.target,1);r.input('a',2,5000+C.inputMs);assert.equal(p.target,2);
  p.x=30;p.y=3000;p.angle=p.target=Math.PI;const generation=p.generation;r.tick(6000);assert.ok(Math.abs(p.angle-Math.PI)<=C.turnSpeed*.1+.001);assert.equal(p.generation,generation);assert.equal(p.respawnAt,0);
});
test('snake: nearby food removals and periodic full snapshots recover from dropped packets',()=>{
  const r=new Round('wire',0);r.join('a','A',0);r.startAt=0;const p=r.players[0];p.x=500;p.y=500;p.angle=p.target=0;
  r.food=[{id:1,x:509,y:500,value:1},{id:2,x:5200,y:5200,value:5}];r.index();
  const before=r.snapshot(0,'a');assert.deepEqual(before.food.map((f:any)=>f[0]),[1]);r.tick(50);
  const delta=r.snapshot(50,'a',false);assert.equal(delta.food,undefined);assert.ok(delta.eaten.includes(1));
  const full=r.snapshot(1050,'a',true);assert.equal(full.food.length,0);
  let x=0,y=0;const packed=delta.players[0].body;for(let i=0;i<packed.length;i+=2){x+=packed[i];y+=packed[i+1];assert.ok(x>=0&&x<=6000&&y>=0&&y<=6000)}
});
