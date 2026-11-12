/* Shared placement only. The original crystal remains the authoritative trial. */
(function(root){
  const kinds = ['saw','cut','polish','lab','computer','conveyor'];
  const labels = {saw:'Распиловка',cut:'Огранка',polish:'Полировка',lab:'Контроль качества',computer:'Компьютерное моделирование',conveyor:'Сортировка'};
  function arrange(world, depth){
    const {map,crystals,pickups,start,exitCell}=world;
    const key=c=>c.x+','+c.y;
    const reserved=new Set([start,exitCell,...pickups,...crystals].map(key)), used=new Set();
    const slots=[];
    for(let y=1;y<map.length-1;y++)for(let x=1;x<map[y].length-1;x++)if(map[y][x]===0){
      // Prefer a station behind the operator, then either side. No new obstacles.
      for(const [dx,dy] of [[0,-1],[-1,0],[1,0],[0,1]])if(map[y+dy]?.[x+dx]===1)
        slots.push({x,y,machine:{x:x+dx,y:y+dy}});
    }
    const count=Math.max(0,crystals.length-2);
    for(let i=0;i<count;i++){
      const c=crystals[i];reserved.delete(key(c));
      const candidates=slots.filter(s=>!reserved.has(key(s))&&!used.has(key(s.machine)));
      candidates.sort((a,b)=>(Math.abs(a.x-c.x)+Math.abs(a.y-c.y))-(Math.abs(b.x-c.x)+Math.abs(b.y-c.y)));
      const slot=candidates[0];
      if(slot){c.x=slot.x;c.y=slot.y;c.machine=slot.machine;c.kind=kinds[(i+(depth-1)*2)%kinds.length];used.add(key(slot.machine));}
      reserved.add(key(c));
    }
    return world;
  }
  const api={arrange,kinds,labels};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.SotaFactory=api;
})(typeof window!=='undefined'?window:globalThis);
