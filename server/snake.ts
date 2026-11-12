import { randomUUID } from 'node:crypto';
import { Game, Identity, Room } from './game';
import { GameError } from './protocol';
const {Round,terminal}=require('../../assets/snake-engine.js');
const C=require('../../assets/snake-config.js');
export class SnakeService {
  rounds=new Map<string,any>();
  constructor(private game:Game,private emit:(room:Room,message:any,playerId?:string)=>void,private now=Date.now){}
  invite(room:Room,all=false){
    if(!room.started||room.finished)throw new GameError('Сначала начните игру на заводе');
    if(this.rounds.has(room.code))throw new GameError('Раунд уже идёт');
    const round=new Round(randomUUID(),this.now());this.rounds.set(room.code,round);
    if(all)for(const p of room.players.values())if(p.connected&&(p.state==='playing'||p.state==='question'))this.join({room,player:p},round.id,true);
    this.emit(room,{type:'snake_invite',...round.snapshot(this.now())});return round;
  }
  join({room,player:p}:Identity,id:string,fromOrganizer=false){const r=this.rounds.get(room.code);if(!r||r.id!==id||this.now()>=r.startAt||(p.state!=='playing'&&!(fromOrganizer&&p.state==='question'))||!r.join(p.id,p.name,this.now()))throw new GameError('Присоединиться сейчас нельзя');p.snake=true;delete p.snakeResult;}
  action(i:Identity,m:any){
    const {room,player:p}=i;const r=this.rounds.get(room.code);
    if(m.type==='snake_invite'){const t=terminal(room.world);if(p.state!=='playing'||!t||Math.abs(p.x-t.x)+Math.abs(p.y-t.y)>1)throw new GameError('Подойдите к терминалу');const next=this.invite(room);this.join(i,next.id);return}
    if(m.type==='snake_leave'){if(r?.id!==m.roundId&&p.snakeResult?.id!==m.roundId)throw new GameError('Раунд уже изменился');if(r?.id===m.roundId)r.leave(p.id);p.snake=false;delete p.snakeResult;this.emit(room,{type:'snake_leave',playerId:p.id,roundId:m.roundId});return}
    // Inputs already in flight may arrive after snake_end; discard them quietly.
    if(!r||r.id!==m.roundId){if(m.type==='snake_input')return;throw new GameError('Раунд завершён');}
    if(m.type==='snake_join')this.join(i,m.roundId);
    if(m.type==='snake_input'&&p.snake)r.input(p.id,m.angle,this.now());
  }
  sync(i:Identity,send:(m:any)=>void){const r=this.rounds.get(i.room.code);if(r)send({type:r.phase==='invite'?'snake_invite':'snake_state',...r.snapshot(this.now(),i.player.id)});if(i.player.snakeResult)send(i.player.snakeResult)}
  tick(){
    const now=this.now();for(const [code,r] of this.rounds){const room=this.game.rooms.get(code);if(!room){this.rounds.delete(code);continue}
      for(const p of r.players)if(!room.players.has(p.id))r.leave(p.id);
      const before=r.phase;r.tick(now);
      if(r.phase==='end'){const results=r.results(),message={type:'snake_end',id:r.id,results};for(const result of results){const p=room.players.get(result.id);if(p){p.score+=result.reward;p.snake=false;p.lastTick=now;p.snakeResult={...message,expires:now+C.resultMs}}}this.rounds.delete(code);this.emit(room,message)}
      else if(before!==r.phase||!r.lastSent||now-r.lastSent>=C.stateMs){
        const metadata=!r.lastMeta||now-r.lastMeta>=C.metadataMs;r.lastSent=now;if(metadata)r.lastMeta=now;
        for(const p of room.players.values())if(p.connected&&p.snake)this.emit(room,{type:before!==r.phase?'snake_start':'snake_state',...r.snapshot(now,p.id,metadata)},p.id);
      }
    }
    for(const room of this.game.rooms.values())for(const p of room.players.values())if(p.snakeResult?.expires<now)delete p.snakeResult;
  }
}
