'use strict';
const assert=require('assert');
const Shared=require('../public/shared.js');
const fs=require('fs'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
const sim=new Shared.WorldSim({seed:61701});
const sent=[];
sim.out={sendTo(id,msg){sent.push({to:id,msg});},broadcast(msg,except){for(const id of sim.clients.keys())if(id!==except)sent.push({to:id,msg});}};
function enter(id){
  sim.addClient(id);sim.handle(id,{t:'join',name:'ArchetypeTest',key:`rogue-archetype-${id}`});
  sim.handle(id,{t:'roguePartySelect',mode:'solo'});
  const site=Shared.CAVE_SITES[Shared.ROGUE_DUNGEON_INDEX];
  const mouth={x:site.x+site.dirX*Shared.CAVE_MOUTH_OFFSET,z:site.z+site.dirZ*Shared.CAVE_MOUTH_OFFSET};
  sim.handle(id,{t:'state',x:mouth.x,y:Shared.islandHeight(mouth.x,mouth.z),z:mouth.z,ry:0,cave:-1,f:0});
  sim.handle(id,{t:'state',x:Shared.CAVE_INTERIOR_ENTRY.x,y:0,z:Shared.CAVE_INTERIOR_ENTRY.z,ry:0,cave:Shared.ROGUE_DUNGEON_INDEX,f:0});
}
enter(617);
const c=sim.clients.get(617),room=sim.getRogueRoomForClient(617);
function check(name,fn){try{fn();console.log('PASS '+name);}catch(err){console.error('FAIL '+name+': '+err.message);process.exitCode=1;}}
const layout=Shared.getRogueDungeonLayout(room.seed);
check('レイアウトに役割の異なる5種類の敵が含まれる',()=>{
  const kinds=new Set(layout.enemies.map(e=>e.kind));
  for(const k of ['shade','crawler','spitter','sentinel','charger'])assert.ok(kinds.has(k),`missing ${k}`);
  assert.ok(layout.enemies.length<=20,'enemy ids fit the accepted server hit-id range');
});
check('深い階層ほど通常敵のHP・攻撃力が増える',()=>{
  assert.ok(Shared.getRogueEnemyProfile('sentinel',2).hp>Shared.getRogueEnemyProfile('sentinel',0).hp);
  assert.ok(Shared.getRogueEnemyProfile('shade',2).damage>=Shared.getRogueEnemyProfile('shade',0).damage);
});
check('遠距離型は回避可能な範囲攻撃の予兆を持つ',()=>{
  const p=Shared.getRogueEnemyProfile('spitter',1);
  assert.equal(p.role,'ranged');assert.ok(p.windup>=.7);assert.ok(p.attackRadius>1.5);assert.ok(p.minRange<p.preferredRange&&p.preferredRange<p.attackRange);
});
check('クライアントに遠距離・突進型のモデルと攻撃予兆リングがある',()=>{
  assert.ok(html.includes('spitterCore')&&html.includes('chargerHorn')&&html.includes('ROGUE_ATTACK_WARNING_GEO'));
  assert.ok(html.includes('target.warningMesh.visible=warningActive')&&html.includes('state.attackMode'));
});
check('突進型は予兆・突進速度・クールダウンを持つ',()=>{
  const p=Shared.getRogueEnemyProfile('charger',2);
  assert.equal(p.role,'charger');assert.ok(p.triggerRange>p.attackRange);assert.ok(p.chargeSpeed>p.speed);assert.ok(p.windup>0);
});
// Put the room at stage 1 and place the player eight metres from a mandatory spitter.
room.stage=1;room.openGates=1;
for(const [id,state] of room.enemyStates){state.cooldown=1000;state.phase='idle';state.repath=1000;state.path=[];state.pathIndex=0;}
const spitter=layout.enemies.find(e=>e.kind==='spitter'&&!e.optional);
const ss=room.enemyStates.get(spitter.id);ss.x=spitter.x;ss.z=spitter.z;ss.homeX=spitter.x;ss.homeZ=spitter.z;ss.cooldown=0;ss.repath=0;ss.path=[];ss.pathIndex=0;
let found=null;
for(const a of [0,Math.PI/4,Math.PI/2,Math.PI,Math.PI*1.5,Math.PI*1.75]){
  const x=spitter.x+Math.cos(a)*8,z=spitter.z+Math.sin(a)*8;
  if(Shared.isRogueDungeonWalkable(x,z,room.openGates)&&Shared.findRogueDungeonPath(ss.x,ss.z,x,z,room.openGates).length){found={x,z};break;}
}
assert.ok(found,'a valid attack test position should exist');
c.x=found.x;c.z=found.z;c.cave=Shared.ROGUE_DUNGEON_INDEX;c.dead=false;c.hasState=true;c.lastStateAt=Date.now();
sim.tick(.05);
check('サーバーAIはspitterの警告フェーズを同期する',()=>{
  assert.equal(ss.phase,'windup');assert.equal(ss.attackMode,'projectile');
  const motion=sent.slice().reverse().find(e=>e.msg.t==='rogueEnemyMotion'&&e.msg.instanceId===room.id)?.msg;
  assert.ok(motion&&motion.enemies.some(e=>e.id===spitter.id&&e.phase==='windup'&&e.attackMode==='projectile'&&Number.isFinite(e.aimX)));
});
const hurtStart=sent.length;
for(let i=0;i<30;i++){c.lastStateAt=Date.now();sim.tick(.05);}
check('予兆後に範囲内へ留まるとサーバーが攻撃を命中させる',()=>{
  assert.ok(sent.slice(hurtStart).some(e=>e.to===617&&e.msg.t==='roguePlayerHurt'&&e.msg.sourceId===spitter.id));
});
// A second room uses the charger profile and confirms windup transitions into server-side movement.
const ch=layout.enemies.find(e=>e.kind==='charger'&&!e.optional),cs=room.enemyStates.get(ch.id);
room.stage=2;room.openGates=2;
for(const [id,state] of room.enemyStates){state.cooldown=1000;state.phase='idle';state.windupTimer=0;state.recoverTimer=0;state.repath=1000;state.path=[];state.pathIndex=0;}
cs.x=ch.x;cs.z=ch.z;cs.homeX=ch.x;cs.homeZ=ch.z;cs.cooldown=0;cs.repath=0;
let cpos=null;
for(const a of [0,Math.PI/4,Math.PI/2,Math.PI,Math.PI*1.5,Math.PI*1.75]){
 const x=ch.x+Math.cos(a)*6,z=ch.z+Math.sin(a)*6;
 if(Shared.isRogueDungeonWalkable(x,z,room.openGates)&&Shared.findRogueDungeonPath(cs.x,cs.z,x,z,room.openGates).length){cpos={x,z};break;}
}
assert.ok(cpos,'charger test position exists');c.x=cpos.x;c.z=cpos.z;c.lastStateAt=Date.now();
sim.tick(.05);
check('突進型は予兆後に突進フェーズへ進む',()=>assert.equal(cs.phase,'windup'));
for(let i=0;i<Math.ceil(Shared.getRogueEnemyProfile('charger',2).windup/.05)+1;i++){c.lastStateAt=Date.now();sim.tick(.05);}
check('突進の移動はサーバー上で処理される',()=>assert.ok(cs.phase==='charge'||cs.phase==='recover'));
if(!process.exitCode)console.log('Rogue enemy archetypes checks passed.');
