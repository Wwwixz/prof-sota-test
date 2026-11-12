/* Transparent, code-native pixel sprites; these never alter the world state. */
(function(){
  const cache=new Map();
  const colors={metal:'#77818a',dark:'#242d36',edge:'#a3a6a0',gold:'#c99a4a',screen:'#183b40',gem:'#38c8f4'};
  function sprite(kind){
    if(cache.has(kind))return cache.get(kind);
    const c=document.createElement('canvas');c.width=64;c.height=64;const g=c.getContext('2d');
    const box=(x,y,w,h,color)=>{g.fillStyle=color;g.fillRect(x,y,w,h)};
    const plate=(x,y,w,h,top,bottom)=>{const shade=g.createLinearGradient(x,y,x+w,y+h);shade.addColorStop(0,top);shade.addColorStop(1,bottom);box(x,y,w,h,shade);box(x,y,w,1,'#c5d1cd88');box(x,y,1,h,'#a8b4b466');box(x,y+h-1,w,1,'#0b111acc')};
    const line=(x,y,x2,y2,color,width=2)=>{g.strokeStyle=color;g.lineWidth=width;g.beginPath();g.moveTo(x,y);g.lineTo(x2,y2);g.stroke()};
    const gem=(x,y)=>{g.fillStyle=colors.gem;g.beginPath();g.moveTo(x,y-6);g.lineTo(x+6,y-1);g.lineTo(x+3,y+6);g.lineTo(x-3,y+6);g.lineTo(x-6,y-1);g.closePath();g.fill();line(x,y-6,x-1,y+6,'#b4f1ff',1)};
    // Cast shadow, rubber feet, steel carcass and front control panel.
    box(5,56,54,5,'#090d1199');box(10,49,7,10,'#11161b');box(48,49,7,10,'#11161b');
    plate(7,28,50,26,'#75808a','#303a44');plate(9,29,46,4,'#b8b8a0','#5e645e');
    plate(9,34,46,18,'#536271','#253340');
    box(12,36,18,13,'#28323b');for(let y=39;y<49;y+=3)box(14,y,14,1,'#141d25');
    box(38,36,14,12,'#152128');box(40,38,3,3,'#d7ad55');box(46,38,3,3,'#4ade80');
    box(39,44,11,2,'#82939e');
    box(7,31,3,19,'#ad7d32');box(54,31,3,19,'#775320');
    box(12,33,19,1,'#99a6aa');box(33,35,2,15,'#17232b');
    for(const x of [11,52]){box(x,33,2,2,'#d4c9a3');box(x,48,2,2,'#171f26')}
    box(8,52,48,4,'#151b20');for(let x=9;x<55;x+=8){box(x,52,4,2,'#c99a4a');box(x+2,54,4,2,'#c99a4a')}
    if(kind==='saw'){
      plate(7,17,8,25,'#daa94e','#795523');plate(12,6,35,7,'#aaa997','#4b5863');box(43,12,5,16,'#495760');
      g.fillStyle='#353d43';g.beginPath();g.arc(32,23,17,Math.PI,Math.PI*2);g.fill();
      const disc=g.createRadialGradient(30,20,2,32,23,15);disc.addColorStop(0,'#c8bc8f');disc.addColorStop(.4,'#767f82');disc.addColorStop(.7,'#e2dfc4');disc.addColorStop(1,'#879399');
      g.fillStyle=disc;g.beginPath();g.arc(32,23,14,0,Math.PI*2);g.fill();
      g.strokeStyle='#4b5862';g.lineWidth=2;for(let a=0;a<8;a++){g.beginPath();g.moveTo(35,23);g.lineTo(35+Math.cos(a*Math.PI/4)*10,23+Math.sin(a*Math.PI/4)*10);g.stroke()}
      for(let a=0;a<16;a++){const r=a*Math.PI/8;box(Math.round(32+Math.cos(r)*14),Math.round(23+Math.sin(r)*14),2,2,'#d8dfd9')}
      box(29,21,6,4,'#c99a4a');gem(19,37);
    }else if(kind==='cut'){
      plate(8,2,43,34,'#8a969b','#384750');plate(11,5,35,27,'#1c4554','#09212e');box(13,7,31,2,'#80d3e8');
      line(16,11,24,17,'#c7cdc6',4);line(24,17,32,23,'#8899a6',3);gem(34,23);box(10,30,39,3,'#bd9550');
      plate(49,13,10,29,'#a4a28b','#49545b');box(51,16,6,7,'#2794b9');box(52,27,2,2,'#ffb941');box(56,27,2,2,'#79e7bc');
    }else if(kind==='polish'){
      plate(6,24,49,12,'#d0ac63','#665a3c');
      g.fillStyle='#9aa6a9';g.beginPath();g.ellipse(30,25,19,7,0,0,Math.PI*2);g.fill();
      g.fillStyle='#3e4951';g.beginPath();g.ellipse(30,24,15,4,0,0,Math.PI*2);g.fill();
      g.strokeStyle='#43bbd4';g.lineWidth=2;g.beginPath();g.ellipse(30,25,18,6,0,0,Math.PI*2);g.stroke();
      box(47,9,5,17,'#a2a9a6');line(49,9,35,15,'#a2a9a6',4);gem(35,19);box(10,29,38,2,'#e9c67c');
    }else if(kind==='lab'){
      plate(6,27,52,6,'#d7b367','#79603a');
      box(12,27,22,4,'#9aacae');line(17,26,23,10,'#c0c6bc',5);line(23,10,32,15,'#aab6b1',5);line(29,15,26,22,'#303f47',4);
      plate(33,7,25,18,'#929e9e','#3f555f');box(35,9,21,13,'#174757');box(42,24,3,6,'#bac4bf');
      line(38,18,42,13,'#6bd6ed',1);line(42,13,49,19,'#6bd6ed',1);box(51,11,3,1,'#a0ebff');
      box(9,23,4,4,'#b5d4ce');box(10,20,2,4,'#72b6cb');box(29,25,3,3,'#dbb267');
    }else if(kind==='computer'){
      plate(9,5,46,25,'#a8b6b4','#3c515e');box(12,8,40,19,'#133b51');
      for(let x=17;x<50;x+=8)line(x,10,x,25,'#28525a',1);gem(32,17);
      box(29,30,6,4,'#9daaa5');box(17,31,28,3,'#b6bbb0');box(16,34,30,3,'#63747a');
      for(let y=10;y<25;y+=4)box(15,y,8,1,'#6ba4b1');for(let x=18;x<44;x+=4)box(x,34,2,1,'#bcc9c4');
    }else if(kind==='conveyor'){
      g.clearRect(0,0,64,64);plate(2,24,60,18,'#a2a8a0','#414e5c');box(5,26,54,11,'#151f2a');
      for(let x=7;x<58;x+=6){plate(x,26,3,11,'#7b929d','#303d47');box(x,43,3,5,'#59666b')}
      for(const x of [8,52])plate(x,41,5,15,'#8a8d7c','#3a444c');gem(18,27);gem(37,27);
      plate(48,8,13,25,'#849a9f','#304756');box(50,11,9,8,'#185470');box(52,13,5,3,'#8ddcec');box(51,24,3,2,'#ecb94d');
      for(let x=8;x<59;x+=7)box(x,20,2,10,'#52616a');gem(18,21);gem(42,21);
    }else if(kind==='power'){
      box(11,6,42,50,'#839099');box(14,9,36,43,'#485966');box(16,11,32,12,'#1c2930');
      line(33,27,26,37,'#f4b942',3);line(26,37,35,37,'#f4b942',3);line(35,37,29,47,'#f4b942',3);box(43,29,3,9,'#c2b88f');
    }else if(kind==='container'){
      box(9,18,46,35,'#384b58');box(7,17,50,5,'#788e99');box(12,23,40,23,'#142631');
      gem(21,28);gem(36,32);gem(46,26);box(13,43,38,6,'#46616b');box(26,46,12,3,'#bd9c5d');
    }else if(kind==='door'){
      box(8,1,48,59,'#8d9692');box(12,5,40,52,'#263039');
      for(let y=7;y<55;y+=7)box(14,y,36,2,'#58646a');box(30,5,3,52,'#111920');
      box(17,0,30,6,'#c99a4a');box(18,1,28,3,'#343629');box(44,27,5,9,'#dfb452');
      line(20,23,27,30,'#e6ab46',3);line(27,30,20,37,'#e6ab46',3);
      line(31,23,38,30,'#e6ab46',3);line(38,30,31,37,'#e6ab46',3);
      box(6,57,52,5,'#26282a');for(let x=8;x<56;x+=9)box(x,58,5,3,'#c39744');
    }
    cache.set(kind,c);
    if(['saw','cut','polish','lab','computer','conveyor','door'].includes(kind)){
      const local=new Image();local.onload=()=>cache.set(kind,local);
      local.src='./assets/factory/'+kind+'.png';
    }
    return c;
  }
  function floor(ctx,x,y,b){
    const px=x*44,py=y*44;ctx.globalAlpha=.60+.40*b;
    ctx.fillStyle=(x+y)%2?'#383d41':'#3f4346';ctx.fillRect(px,py,44,44);
    ctx.strokeStyle='#1c242b';ctx.lineWidth=1;ctx.strokeRect(px+.5,py+.5,43,43);
    ctx.fillStyle='#75818a18';ctx.fillRect(px+3,py+3,38,1);
    if(x%4===0){ctx.fillStyle='#d0a44c66';ctx.fillRect(px+3,py+3,2,38)}
    ctx.fillStyle='#0a11172b';ctx.fillRect(px+8,py+30,19,2);
    ctx.fillStyle='#a0a8a515';
    for(let i=0;i<12;i++)ctx.fillRect(px+((x*13+y*7+i*11)%38)+3,py+((x*3+y*17+i*7)%37)+3,2,1);
    if((x+2*y)%7===0){ctx.strokeStyle='#10171c66';ctx.beginPath();ctx.moveTo(px+13,py+4);ctx.lineTo(px+19,py+11);ctx.lineTo(px+17,py+18);ctx.stroke()}
  }
  function wall(ctx,x,y,b,map){
    const px=x*44,py=y*44;ctx.globalAlpha=.53+.47*b;
    const edge=[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>map?.[y+dy]?.[x+dx]===0);
    if(!edge){
      ctx.fillStyle='#1b242c';ctx.fillRect(px,py,44,44);
      ctx.strokeStyle='#26323c';ctx.lineWidth=1;ctx.strokeRect(px,py,44,44);
      if(y%3===0){ctx.fillStyle='#39454d';ctx.fillRect(px,py+18,44,7);ctx.fillStyle='#778079';ctx.fillRect(px,py+18,44,1);ctx.fillStyle='#111b22';ctx.fillRect(px+32,py+15,5,13)}
      if(x%6===0){ctx.fillStyle='#48545a';ctx.fillRect(px+18,py,6,44);ctx.fillStyle='#0e171f';ctx.fillRect(px+17,py+8,9,4)}
      return;
    }
    ctx.fillStyle='#202a33';ctx.fillRect(px,py,44,44);ctx.fillStyle='#414c56';ctx.fillRect(px+2,py+2,40,3);
    ctx.strokeStyle='#111b24';ctx.lineWidth=2;ctx.strokeRect(px+3,py+5,38,37);
    ctx.fillStyle='#7c8791';for(const dx of [6,37])for(const dy of [8,37])ctx.fillRect(px+dx,py+dy,2,2);
    if((x+3*y)%5===0){ctx.fillStyle='#4d5962';ctx.fillRect(px+7,py+13,30,21);ctx.fillStyle='#111c24';for(let dy=16;dy<33;dy+=4)ctx.fillRect(px+10,py+dy,24,2)}
    else{ctx.fillStyle='#586367';ctx.fillRect(px+18,py+6,7,35);ctx.fillStyle='#a5aaa36b';ctx.fillRect(px+19,py+6,2,35);ctx.fillStyle='#263038';ctx.fillRect(px+15,py+18,13,5)}
  }
  // Rendering bounds only. World coordinates, routes and hit cells stay untouched.
  function bounds(c){
    const m=c.machine||c,dx=m.x-c.x,dy=m.y-c.y;
    const w=c.kind==='conveyor'?104:92,h=c.kind==='conveyor'?76:94;
    return {x:Math.max(4,(m.x+.5)*44-w/2+dx*19),y:Math.max(4,(m.y+.5)*44-h/2+dy*22-8),w,h};
  }
  function protectedClip(ctx,r,cells){
    ctx.beginPath();ctx.rect(r.x-8,r.y-16,r.w+16,r.h+32);ctx.clip();
    ctx.beginPath();ctx.rect(r.x-8,r.y-16,r.w+16,r.h+32);
    for(const c of cells){const x=c.x*44,y=c.y*44;if(x<r.x+r.w+8&&x+44>r.x-8&&y<r.y+r.h+16&&y+44>r.y-16)ctx.rect(x,y,44,44)}
    ctx.clip('evenodd');
  }
  function object(ctx,c,now,b,completedAt,protectedCells=[]){
    const r=bounds(c),px=r.x,py=r.y;ctx.save();ctx.globalAlpha=.86+.14*b;ctx.imageSmoothingEnabled=false;
    ctx.save();protectedClip(ctx,r,protectedCells);
    const glow=ctx.createRadialGradient(px+r.w/2,py+r.h/2,5,px+r.w/2,py+r.h/2,85);
    glow.addColorStop(0,c.done?'#56d6d54a':'#eeb44f50');glow.addColorStop(1,'#eeb44f00');ctx.fillStyle=glow;ctx.fillRect(px-35,py-35,r.w+70,r.h+70);
    ctx.fillStyle='#151a20';ctx.fillRect(px,py+r.h*.72,r.w,r.h*.25);
    ctx.save();ctx.beginPath();ctx.rect(px,py+r.h*.72,r.w,r.h*.25);ctx.clip();ctx.strokeStyle='#d3a039';ctx.lineWidth=6;
    for(let x=px-20;x<px+r.w+20;x+=15){ctx.beginPath();ctx.moveTo(x,py+r.h);ctx.lineTo(x+24,py+r.h*.7);ctx.stroke()}ctx.restore();
    ctx.drawImage(sprite(c.kind),px,py,r.w,r.h);
    ctx.restore();
    // Existing completion effects use the original local sprite coordinate space.
    ctx.save();ctx.translate(px,py);ctx.scale(r.w/52,r.h/52);
    const age=completedAt?now-completedAt:Infinity;
    if(c.done&&age<1500){
      ctx.strokeStyle='#dce0cf';ctx.lineWidth=2;
      if(c.kind==='saw'||c.kind==='polish'){
        ctx.save();ctx.translate(23,10);ctx.scale(1,c.kind==='polish'?.4:1);ctx.rotate(now*.025);
        ctx.beginPath();ctx.moveTo(-9,0);ctx.lineTo(9,0);ctx.moveTo(0,-9);ctx.lineTo(0,9);ctx.stroke();ctx.restore();
      }else if(c.kind==='conveyor'){
        ctx.fillStyle='#9cacb2';for(let i=0;i<5;i++)ctx.fillRect(3+(i*9+age*.035)%43,10,2,7);
      }
    }
    if(c.done&&age<1500){ctx.strokeStyle='#f4b942';ctx.lineWidth=2;ctx.beginPath();ctx.arc(22,18,12,now*.013,now*.013+4.5);ctx.stroke();ctx.fillStyle='#ffe4a1';for(let i=0;i<5;i++)ctx.fillRect(22+Math.sin(now*.01+i)*20,20+Math.cos(now*.013+i)*12,2,2)}
    // Faceted product remains visible when machining is complete.
    if(c.done&&c.kind==='cut'){ctx.fillStyle='#b9f3ff';ctx.beginPath();ctx.moveTo(24,2);ctx.lineTo(30,8);ctx.lineTo(24,16);ctx.lineTo(18,8);ctx.closePath();ctx.fill()}
    if(c.done&&c.kind==='computer'){ctx.fillStyle='#4ade80';ctx.fillRect(10,2,25,3)}
    ctx.restore();
    const ix=(c.x+.5)*44,iy=(c.y+.5)*44;
    ctx.fillStyle=c.done?'#4ade8026':'#c99a4a20';ctx.fillRect(c.x*44+5,c.y*44+5,34,34);
    ctx.strokeStyle=c.done?'#4ade80':'#c99a4a';ctx.lineWidth=1;ctx.strokeRect(c.x*44+5,c.y*44+5,34,34);
    ctx.fillStyle=c.done?'#4ade80':(c.cracked?'#ef5350':'#e8c77b');ctx.font='bold 15px system-ui';ctx.textAlign='center';ctx.fillText(c.done?'✓':'?',ix,iy+5);
    // Question badges sit on their existing, unobstructed operator pads.
    ctx.restore();
  }
  function frame(ctx,w,h,now){
    ctx.save();ctx.fillStyle='#151e27';ctx.fillRect(0,0,w,h);
    ctx.strokeStyle='#35414b';ctx.lineWidth=8;ctx.strokeRect(12,12,w-24,h-24);
    ctx.strokeStyle='#101820';ctx.lineWidth=3;ctx.strokeRect(22,22,w-44,h-44);
    for(let x=40;x<w;x+=110){ctx.fillStyle='#4b5961';ctx.fillRect(x,8,60,6);ctx.fillStyle='#f4c56b';ctx.fillRect(x+10,19,40,3)}
    // Warm industrial luminaires and cable runs frame the live Canvas map.
    for(let y=110;y<h-70;y+=180){
      for(const x of [27,w-27]){
        const glow=ctx.createRadialGradient(x,y,2,x,y,90);glow.addColorStop(0,'#eaa74732');glow.addColorStop(1,'#eaa74700');ctx.fillStyle=glow;ctx.fillRect(x-90,y-90,180,180);
        ctx.fillStyle='#323d45';ctx.fillRect(x-9,y-26,18,52);ctx.fillStyle='#ffce75';ctx.fillRect(x-3,y-20,6,40);
      }
    }
    ctx.strokeStyle='#8e642c';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(36,h-58);ctx.lineTo(36,h-16);ctx.lineTo(w-36,h-16);ctx.lineTo(w-36,h-58);ctx.stroke();
    ctx.fillStyle='#b6a073';ctx.font='600 15px system-ui';ctx.textAlign='left';ctx.fillText('КРИСТАЛЛ · ОБРАБОТКА АЛМАЗОВ',32,h-25);
    ctx.restore();
  }
  function details(ctx,map,crystals,pickups,start,exit,bright){
    ctx.save();ctx.imageSmoothingEnabled=false;
    const occupied=new Set(crystals.filter(c=>c.machine).map(c=>c.machine.x+','+c.machine.y));
    const box=(x,y,w,h,c)=>{ctx.fillStyle=c;ctx.fillRect(x,y,w,h)};
    for(let y=1;y<map.length-1;y++)for(let x=1;x<map[y].length-1;x++){
      if(map[y][x]!==1||crystals.some(c=>c.machine&&Math.abs(c.machine.x-x)<=1&&Math.abs(c.machine.y-y)<=1))continue;
      const px=x*44,py=y*44,n=(x*13+y*31)%17;ctx.globalAlpha=.75+.25*bright[y][x];
      // Furniture lives entirely on wall tiles, never on a walkable cell.
      if(n<3){
        box(px+4,py+3,36,38,'#121d26');box(px+6,py+5,32,33,'#52616a');box(px+7,py+6,30,2,'#a4b0ac');
        box(px+20,py+9,1,27,'#26333d');box(px+17,py+21,2,6,'#d3b466');box(px+24,py+21,2,6,'#d3b466');
        for(let i=0;i<4;i++)box(px+9,py+11+i*3,7,1,'#253b47');
      }else if(n<5){
        box(px+3,py+3,38,38,'#1b242b');
        for(let i=0;i<3;i++){box(px+5,py+9+i*12,34,3,'#87918a');for(let j=0;j<3;j++){box(px+7+j*10,py+3+i*12,8,6,j%2?'#80653c':'#526d79');box(px+8+j*10,py+4+i*12,6,1,'#c5ae78')}}
        box(px+3,py+3,3,38,'#4e606b');box(px+38,py+3,3,38,'#4e606b');
      }else if(n===6){
        box(px+3,py+17,38,18,'#6f5c3c');box(px+5,py+19,34,14,'#3d4e5a');box(px+6,py+20,32,2,'#97a8a5');box(px+19,py+20,4,13,'#a48a52');
      }else if(n===8){
        const light=ctx.createRadialGradient(px+22,py+19,2,px+22,py+19,55);light.addColorStop(0,'#ffbc543d');light.addColorStop(1,'#ffbc5400');
        // Clip the casing to the wall; the light may fall onto the floor.
        ctx.fillStyle=light;ctx.fillRect(px-33,py-36,110,110);box(px+5,py+12,34,11,'#101c24');box(px+8,py+14,28,6,'#b3833f');box(px+10,py+15,24,3,'#ffda85');
      }
      if(n>10){box(px+7,py+3,3,37,'#141b23');box(px+12,py+3,2,37,'#7c6035');box(px+6,py+13,9,3,'#77827c');box(px+6,py+31,9,3,'#77827c')}
    }
    // Mount the sign on a continuous wall, without occupying the floor.
    outer:for(let y=1;y<map.length-1;y++)for(let x=1;x<map[y].length-3;x++){
      if([0,1,2].every(dx=>map[y][x+dx]===1&&!occupied.has((x+dx)+','+y))&&!crystals.some(c=>{if(!c.machine)return false;const r=bounds(c);return r.x<x*44+132&&r.x+r.w>x*44&&r.y<y*44+44&&r.y+r.h>y*44})){
        const px=x*44+4,py=y*44+3;ctx.globalAlpha=1;
        box(px,py,124,38,'#0c141c');box(px+2,py+2,120,34,'#7a6944');box(px+4,py+4,116,30,'#182733');
        ctx.fillStyle='#52cbef';ctx.beginPath();ctx.moveTo(px+14,py+8);ctx.lineTo(px+21,py+15);ctx.lineTo(px+14,py+29);ctx.lineTo(px+7,py+15);ctx.closePath();ctx.fill();
        ctx.fillStyle='#f0d59a';ctx.textAlign='left';ctx.font='bold 16px system-ui';ctx.fillText('КРИСТАЛЛ',px+27,py+20,93);
        ctx.fillStyle='#95a9b4';ctx.font='6px system-ui';ctx.fillText('СМОЛЕНСК · ОБРАБОТКА АЛМАЗОВ',px+28,py+29,90);break outer;
      }
    }
    ctx.restore();
  }
  function door(ctx,cell,open,map,protectedCells){
    const r={x:cell.x*44-21,y:cell.y*44-48,w:86,h:96};ctx.save();
    protectedClip(ctx,r,protectedCells.filter(c=>c.x!==cell.x||c.y!==cell.y));ctx.imageSmoothingEnabled=false;
    ctx.globalAlpha=1;ctx.drawImage(sprite('door'),r.x,r.y,r.w,r.h);
    ctx.fillStyle=open?'#68e0a2':'#ffc76b';ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=12;ctx.fillRect(r.x+22,r.y+3,42,4);ctx.restore();
  }
  window.FactoryArt={sprite,floor,wall,object,frame,details,door,bounds};
})();
