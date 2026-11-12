(function(root){
  const C=typeof module!=='undefined'?require('./snake-config.js'):root.SnakeConfig;
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  function terminal(world){
    if(world.snakeTerminal)return world.snakeTerminal;
    const used=[...world.crystals,...world.pickups,world.exitCell,world.start];
    for(let y=1;y<world.map.length-1;y++)for(let x=1;x<world.map[y].length-1;x++)if(world.map[y][x]===0&&!used.some(c=>c&&c.x===x&&c.y===y))return world.snakeTerminal={x,y};
    return null;
  }
  class Grid {
    constructor(){this.cells=new Map()}
    add(item,x=item.x,y=item.y){const key=Math.floor(x/C.cellSize)+','+Math.floor(y/C.cellSize);let cell=this.cells.get(key);if(!cell)this.cells.set(key,cell=[]);cell.push(item)}
    query(x,y,r){const out=[];for(let cy=Math.floor((y-r)/C.cellSize);cy<=Math.floor((y+r)/C.cellSize);cy++)for(let cx=Math.floor((x-r)/C.cellSize);cx<=Math.floor((x+r)/C.cellSize);cx++){const cell=this.cells.get(cx+','+cy);if(cell)for(const item of cell)out.push(item)}return out}
  }
  const viewRadius=length=>Math.min(C.viewMax,C.viewBase+Math.max(0,length-C.initialLength)*C.viewGrowth);
  class Round {
    constructor(id,now,random=Math.random){this.id=id;this.startAt=now+C.countdownMs;this.endAt=this.startAt+C.roundMs;this.phase='invite';this.players=[];this.food=[];this.pendingFood=[];this.eaten=[];this.random=random;this.serial=0;this.seq=0;this.last=now;this.metadataAt=0;for(let i=0;i<C.foodCount;i++)this.food.push(this.crystal(i<C.normalCount?C.points:C.rarePoints));this.index()}
    crystal(value){return {id:++this.serial,x:20+this.random()*(C.width-40),y:20+this.random()*(C.height-40),value}}
    index(){this.foodGrid=new Grid();for(const f of this.food)this.foodGrid.add(f);this.bodyGrid=new Grid();for(const p of this.players)if(p.active&&!p.respawnAt)for(const b of p.body)this.bodyGrid.add({x:b.x,y:b.y,p});}
    spawn(p,now){
      let best=null,bestDistance=-1;
      // A stratified set covers the entire map even when a crowded cell is unlucky.
      for(let i=0;i<100;i++){const spot={x:C.spawnMargin+((i%10+this.random())/10)*(C.width-2*C.spawnMargin),y:C.spawnMargin+((Math.floor(i/10)+this.random())/10)*(C.height-2*C.spawnMargin)};let separation=Infinity;for(const o of this.players)if(o!==p&&o.active&&!o.respawnAt)for(const b of o.body)separation=Math.min(separation,distance(b,spot));if(separation>bestDistance){bestDistance=separation;best=spot}}
      Object.assign(p,best);p.angle=this.random()*Math.PI*2;p.target=p.angle;p.body=Array.from({length:p.length},()=>({...best}));p.protectedUntil=now+C.protectionMs;p.generation=(p.generation||0)+1;p.respawnAt=0;
    }
    join(id,name,now,bot=false){if(this.phase!=='invite'||this.players.length>=C.maxPlayers||this.players.some(p=>p.id===id))return false;const index=this.players.length,p={id,name,bot,index,color:`hsl(${(index*137.508)%360} 78% 65%)`,score:0,collected:0,length:C.initialLength,active:true,body:[],lastInput:-Infinity};this.spawn(p,now);p.protectedUntil=this.startAt+C.protectionMs;this.players.push(p);this.index();return true}
    input(id,angle,now=this.last){const p=this.players.find(p=>p.id===id&&p.active);if(p&&Number.isFinite(angle)&&now-p.lastInput>=C.inputMs){p.target=angle;p.lastInput=now}}
    leave(id){const p=this.players.find(p=>p.id===id);if(p)p.active=false;this.index()}
    tick(now){
      if(this.phase==='end')return;if(now>=this.endAt){this.phase='end';return}if(now<this.startAt){this.last=now;return}
      this.phase='running';this.seq++;const dt=Math.min(.1,Math.max(0,(now-Math.max(this.last,this.startAt))/1000));this.last=now;
      for(const p of this.players){if(!p.active)continue;if(p.respawnAt){if(now>=p.respawnAt)this.spawn(p,now);else continue}
        if(p.bot){let food=this.foodGrid.query(p.x,p.y,800);if(!food.length)food=this.food;const f=food.reduce((a,b)=>!a||distance(p,b)<distance(p,a)?b:a,null);const danger=this.bodyGrid.query(p.x,p.y,100).some(b=>b.p!==p&&distance(b,{x:p.x+Math.cos(p.angle)*70,y:p.y+Math.sin(p.angle)*70})<40);if(danger)p.target=p.angle+1.8;else if(f)p.target=Math.atan2(f.y-p.y,f.x-p.x)}
        let target=p.target;const margin=C.boundaryMargin;
        if(p.x<margin||p.x>C.width-margin||p.y<margin||p.y>C.height-margin)target=Math.atan2(C.height/2-p.y,C.width/2-p.x);
        const delta=Math.atan2(Math.sin(target-p.angle),Math.cos(target-p.angle));p.angle+=Math.max(-C.turnSpeed*dt,Math.min(C.turnSpeed*dt,delta));
        p.x=Math.max(C.radius,Math.min(C.width-C.radius,p.x+Math.cos(p.angle)*C.speed*dt));p.y=Math.max(C.radius,Math.min(C.height-C.radius,p.y+Math.sin(p.angle)*C.speed*dt));
        p.body[0]={x:p.x,y:p.y};for(let i=1;i<p.body.length;i++){const a=p.body[i-1],b=p.body[i],d=distance(a,b);if(d>C.spacing){b.x=a.x+(b.x-a.x)*C.spacing/d;b.y=a.y+(b.y-a.y)*C.spacing/d}}
      }
      this.index();const victims=this.players.filter(p=>p.active&&!p.respawnAt&&now>=p.protectedUntil&&this.bodyGrid.query(p.x,p.y,C.radius*2).some(b=>b.p!==p&&now>=b.p.protectedUntil&&distance(p,b)<C.radius*1.6));
      for(const p of victims){p.length=Math.max(C.initialLength,Math.floor(p.length*(1-C.loss)));p.respawnAt=now+C.respawnMs;p.body=[]}
      const taken=new Set();for(const p of this.players.filter(p=>p.active&&!p.respawnAt))for(const f of this.foodGrid.query(p.x,p.y,C.radius+7))if(!taken.has(f.id)&&distance(p,f)<C.radius+7){taken.add(f.id);this.eaten.push({id:f.id,x:f.x,y:f.y,at:now});p.score+=f.value;p.collected++;p.length=Math.min(C.maxLength,p.length+f.value*C.growth);while(p.body.length<p.length)p.body.push({...p.body[p.body.length-1]});this.pendingFood.push({at:now+C.foodRespawnMs,value:f.value})}
      this.eaten=this.eaten.filter(f=>now-f.at<C.metadataMs*2);if(taken.size)this.food=this.food.filter(f=>!taken.has(f.id));while(this.pendingFood.length&&this.pendingFood[0].at<=now)this.food.push(this.crystal(this.pendingFood.shift().value));this.index();
    }
    results(){return this.players.filter(p=>p.active).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id)).map((p,i)=>({id:p.id,name:p.name,score:p.score,collected:p.collected,place:i+1,reward:C.rewards[i]||C.participationReward}))}
    snapshot(now,viewerId,includeMeta=true){
      const viewer=this.players.find(p=>p.id===viewerId&&p.active),r=viewer?viewRadius(viewer.length)+C.viewPadding:0;
      const nearby=viewer?new Set(this.bodyGrid.query(viewer.x,viewer.y,r).filter(b=>Math.abs(b.x-viewer.x)<=r&&Math.abs(b.y-viewer.y)<=r).map(b=>b.p)):new Set();if(viewer)nearby.add(viewer);
      const players=[...nearby].map(p=>{const body=[];let bx=0,by=0;for(let i=0;i<p.body.length;i+=C.bodyStride){const x=Math.round(p.body[i].x),y=Math.round(p.body[i].y);body.push(x-bx,y-by);bx=x;by=y;}return {id:p.id,name:p.name,color:p.color,x:Math.round(p.x),y:Math.round(p.y),angle:+p.angle.toFixed(3),body,length:p.length,score:p.score,collected:p.collected,protected:now<p.protectedUntil,generation:p.generation,respawn:Math.max(0,(p.respawnAt||0)-now)}});
      const food=viewer&&includeMeta?this.foodGrid.query(viewer.x,viewer.y,r).filter(f=>Math.abs(f.x-viewer.x)<=r&&Math.abs(f.y-viewer.y)<=r).map(f=>[f.id,Math.round(f.x),Math.round(f.y),f.value]):[];
      const result={id:this.id,seq:this.seq,serverTime:now,phase:this.phase,remaining:Math.max(0,(this.phase==='invite'?this.startAt:this.endAt)-now),players,eaten:viewer?this.eaten.filter(f=>Math.abs(f.x-viewer.x)<=r&&Math.abs(f.y-viewer.y)<=r).map(f=>f.id):[],participant:!!viewer,count:this.players.filter(p=>p.active).length};
      if(includeMeta){result.food=food;const ranked=this.results();result.top=ranked.slice(0,10);result.rank=ranked.find(p=>p.id===viewerId)?.place||0;result.dots=this.players.filter(p=>p.active&&!p.respawnAt).map(p=>[p.index,Math.round(p.x),Math.round(p.y)]);result.selfIndex=viewer?.index;}
      return result;
    }
  }
  const api={Round,terminal,Grid,viewRadius};if(typeof module!=='undefined')module.exports=api;else root.SnakeEngine=api;
})(typeof window==='undefined'?globalThis:window);
