// v61.6: ソロでパーティーを作成した場合も全敵が停止して見えない問題を防ぐ。
'use strict';
const assert=require('assert');
const Shared=require('../public/shared.js');
const sim=new Shared.WorldSim({seed:61601});
const sent=[];
sim.out={sendTo(id,msg){sent.push({to:id,msg});},broadcast(msg,except){for(const id of sim.clients.keys())if(id!==except)sent.push({to:id,msg});}};
sim.addClient(616);
sim.handle(616,{t:'join',name:'SoloParty',key:'rogue-enemy-patrol-solo'});
sim.handle(616,{t:'roguePartySelect',mode:'create',code:'SOLO61'});
const site=Shared.CAVE_SITES[Shared.ROGUE_DUNGEON_INDEX];
const mouth={x:site.x+site.dirX*Shared.CAVE_MOUTH_OFFSET,z:site.z+site.dirZ*Shared.CAVE_MOUTH_OFFSET};
sim.handle(616,{t:'state',x:mouth.x,y:Shared.islandHeight(mouth.x,mouth.z),z:mouth.z,ry:0,cave:-1,f:0});
sim.handle(616,{t:'state',x:Shared.CAVE_INTERIOR_ENTRY.x,y:0,z:Shared.CAVE_INTERIOR_ENTRY.z,ry:0,cave:Shared.ROGUE_DUNGEON_INDEX,f:0});
const c=sim.clients.get(616),room=sim.getRogueRoomForClient(616);
assert.ok(room,'party-creation flow should create a rogue room even with one player');
c.x=Shared.CAVE_INTERIOR_ENTRY.x;c.z=Shared.CAVE_INTERIOR_ENTRY.z;c.cave=Shared.ROGUE_DUNGEON_INDEX;c.dead=false;c.hasState=true;c.lastStateAt=Date.now();
const initial=new Map([...room.enemyStates].map(([id,e])=>[id,{x:e.x,z:e.z}]));
const initialTargets=new Map(room.enemyStates);
// Simulate 8 seconds in the 20Hz server loop with a lone living member.
for(let i=0;i<160;i++){c.lastStateAt=Date.now();sim.tick(.05);}
const distances=[];
for(const [id,e] of room.enemyStates){
 if(id==='boss')continue;
 const p=initial.get(id);distances.push({id,d:Math.hypot(e.x-p.x,e.z-p.z)});
}
assert.ok(distances.filter(e=>e.d>.15).length>=12,'most visible mobs should patrol or pursue instead of remaining static');
const layout=Shared.getRogueDungeonLayout(room.seed);
const firstRoomIds=new Set(layout.enemies.filter(e=>e.stage===0).map(e=>e.id));
assert.ok(distances.some(e=>firstRoomIds.has(e.id)&&e.d>2),'first-area enemies should react from the entrance approach');
const futureIds=new Set(layout.enemies.filter(e=>e.stage>0).map(e=>e.id));
assert.ok(distances.some(e=>futureIds.has(e.id)&&e.d>.15),'enemies in locked future areas should make local patrol movements');
assert.equal(sent.some(e=>e.msg.t==='roguePlayerHurt'&&futureIds.has(e.msg.sourceId)),false,'future-stage enemies must not attack through their locked stage');
console.log('PASS solo-created party keeps dungeon enemies moving; future-stage patrols do not attack early.');
