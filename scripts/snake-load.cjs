// npm run build && node scripts/snake-load.cjs [50..60]
// Real WebSocket traffic; server runs in a separate process for CPU/RAM measurements.
const {fork}=require('node:child_process');
const {performance,monitorEventLoopDelay}=require('node:perf_hooks');
const assert=require('node:assert/strict');
const path=require('node:path');
const C=require('../assets/snake-config.js');
if(process.argv.includes('--server')){
  const {createApp}=require('../dist/server/index.js');const app=createApp();
  const lag=monitorEventLoopDelay({resolution:10});lag.enable();let peakRss=0,ticks=[],scoreErrors=0;
  const tick=app.snake.tick.bind(app.snake);app.snake.tick=()=>{const before=[...app.snake.rounds.values()].map(r=>({r,score:r.players.reduce((s,p)=>s+p.score,0),food:new Map(r.food.map(f=>[f.id,f.value]))}));const t=performance.now();tick();ticks.push(performance.now()-t);for(const b of before){const remaining=new Set(b.r.food.map(f=>f.id));const removed=[...b.food].filter(([id])=>!remaining.has(id)).reduce((s,[,v])=>s+v,0);if(b.r.players.reduce((s,p)=>s+p.score,0)-b.score!==removed)scoreErrors++}};
  const sample=setInterval(()=>peakRss=Math.max(peakRss,process.memoryUsage().rss),500);let cpu=process.cpuUsage(),began=performance.now();
  app.server.listen(0,'127.0.0.1',()=>process.send({type:'ready',port:app.server.address().port,token:app.adminToken}));
  process.on('message',async m=>{if(m.type==='begin'){cpu=process.cpuUsage();began=performance.now();ticks=[];lag.reset()}if(m.type==='finish'){const used=process.cpuUsage(cpu),elapsed=performance.now()-began;const rewards=[...app.game.rooms.values()].flatMap(r=>[...r.players.values()].map(p=>({id:p.id,score:p.score,result:p.snakeResult})));process.send({type:'metrics',actualTPS:ticks.length*1000/elapsed,cpuOneCorePercent:(used.user+used.system)/1000/elapsed*100,peakRssMB:peakRss/1048576,eventLoopP99Ms:lag.percentile(99)/1e6,tickP99Ms:percentile(ticks,99),tickMaxMs:Math.max(...ticks),scoreErrors,rewards,activeRounds:app.snake.rounds.size});}if(m.type==='stop'){clearInterval(sample);lag.disable();await app.close();process.exit(0)}});
}else main().catch(e=>{console.error(e);process.exitCode=1});
function percentile(a,p){const b=[...a].sort((x,y)=>x-y);return b[Math.min(b.length-1,Math.floor(b.length*p/100))]||0}
async function main(){
  const count=Number(process.argv[2]||60);assert.ok(count>=50&&count<=60);
  const WebSocket=require('ws');const child=fork(__filename,['--server'],{cwd:path.resolve(__dirname,'..'),windowsHide:true,stdio:['ignore','ignore','inherit','ipc']});const sockets=[],timers=[];
  const waitMessage=type=>new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{child.off('message',listener);reject(Error('Server response timeout: '+type))},15000);function listener(m){if(m.type===type){clearTimeout(timeout);child.off('message',listener);resolve(m)}}child.on('message',listener)});
  let bytes=0,packets=0,ended=0,errors=[],ages=[],visible=[],firstEnd,roundId;const endPromise=new Promise(r=>firstEnd=r);
  try{const ready=await waitMessage('ready'),base='http://127.0.0.1:'+ready.port,headers={Authorization:'Bearer '+ready.token,'Content-Type':'application/json'};
    const post=async(action,body)=>{const r=await fetch(base+'/api/admin/'+action,{method:'POST',headers,body:JSON.stringify(body)});assert.ok(r.ok,await r.clone().text());return r.json()};
    const {code}=await post('create',{city:0});
    for(let i=0;i<count;i++){const ws=new WebSocket(base.replace('http','ws')+'/ws');sockets.push(ws);await new Promise((resolve,reject)=>{ws.on('error',reject);ws.on('open',()=>ws.send(JSON.stringify({type:'join',code,skin:i%3})));ws.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='welcome')resolve();if(m.type==='error'){errors.push(m.message);reject(Error(m.message))}if(m.type==='snake_state'||m.type==='snake_start'){roundId=m.id;packets++;bytes+=raw.length;ages.push(Date.now()-m.serverTime);visible.push(m.players.length)}if(m.type==='snake_end'){ended++;if(ended===count)firstEnd(m)}})});}
    await post('start',{code});child.send({type:'begin'});const began=Date.now();await post('snake',{code});
    sockets.forEach((ws,i)=>timers.push(setInterval(()=>{if(roundId&&ws.readyState===1&&ws.bufferedAmount<=C.maxBufferedBytes)ws.send(JSON.stringify({type:'snake_input',roundId,angle:Math.sin(Date.now()/4000+i)*Math.PI}))},C.inputMs)));
    let timeout;const result=await Promise.race([endPromise,new Promise((_,reject)=>timeout=setTimeout(()=>reject(Error('Round timed out')),C.roundMs+C.countdownMs+20000))]);clearTimeout(timeout);timers.forEach(clearInterval);
    // Wait for subsequent server ticks to catch accidental repeated awards.
    await new Promise(r=>setTimeout(r,700));const metricsPromise=waitMessage('metrics');child.send({type:'finish'});const m=await metricsPromise;
    assert.equal(ended,count);assert.equal(errors.length,0,errors.join(';'));assert.equal(m.scoreErrors,0);assert.equal(m.activeRounds,0);assert.ok(m.actualTPS>=19&&m.actualTPS<=21,'Server TPS outside 19..21');assert.ok(percentile(ages,95)<250,'Local message p95 exceeded 250 ms');
    for(const p of m.rewards){const mine=p.result.results.find(r=>r.id===p.id);assert.ok(mine);assert.equal(p.score,mine.reward);assert.ok(p.score>=C.participationReward&&p.score<=C.rewards[0])}
    assert.equal(result.results.length,count);assert.equal(new Set(result.results.map(p=>p.id)).size,count);
    const seconds=(Date.now()-began)/1000;console.log(JSON.stringify({clients:count,seconds,packets,totalMB:bytes/1048576,kbpsPerClient:bytes*8/1000/seconds/count,messageAgeP50Ms:percentile(ages,50),messageAgeP95Ms:percentile(ages,95),messageAgeP99Ms:percentile(ages,99),averageDetailedSnakes:visible.reduce((a,b)=>a+b,0)/visible.length,actualTPS:m.actualTPS,cpuOneCorePercent:m.cpuOneCorePercent,peakRssMB:m.peakRssMB,eventLoopP99Ms:m.eventLoopP99Ms,tickP99Ms:m.tickP99Ms,tickMaxMs:m.tickMaxMs,scoreErrors:m.scoreErrors,results:result.results.length},null,2));
  }finally{timers.forEach(clearInterval);sockets.forEach(s=>s.terminate());child.send({type:'stop'});}
}
