// 遺品袋のサーバー保存・復元テスト。ブラウザやWebSocketサーバーは不要。
'use strict';
const assert=require('assert');
const Shared=require('../public/shared.js');
const fs=require('fs');
const path=require('path');
function check(name,fn){try{fn();console.log('PASS '+name);}catch(err){console.error('FAIL '+name+': '+err.message);process.exitCode=1;}}
function state(sim,id,x,z,cave,f=0){const c=sim.clients.get(id);c.lastStateAt=Date.now()-10000;sim.handle(id,{t:'state',x,y:0,z,ry:0,cave,f});c.lastStateAt=Date.now();}
function enter(sim,id,name,key,code='PERS01'){
  sim.addClient(id);sim.handle(id,{t:'join',name,key});sim.handle(id,{t:'roguePartySelect',mode:code?'join':'solo',code});
  const site=Shared.CAVE_SITES[Shared.ROGUE_DUNGEON_INDEX];
  state(sim,id,site.x+site.dirX*Shared.CAVE_MOUTH_OFFSET,site.z+site.dirZ*Shared.CAVE_MOUTH_OFFSET,-1,0);
  state(sim,id,Shared.CAVE_INTERIOR_ENTRY.x,Shared.CAVE_INTERIOR_ENTRY.z,Shared.ROGUE_DUNGEON_INDEX,0);
}
const sim=new Shared.WorldSim({seed:62519});
const sent=[];sim.out={sendTo(id,msg){sent.push({to:id,msg});},broadcast(msg,except){for(const id of sim.clients.keys())if(id!==except)sent.push({to:id,msg});}};
const ownerKey='stable-persist-owner-key';
enter(sim,701,'Persistent Owner',ownerKey);
const owner=sim.clients.get(701), room=sim.getRogueRoomForClient(701);
sim.handle(701,{t:'rogueCarryState',weaponBonus:3,armorBonus:2,shards:17,attackBuffMs:40000,speedBuffMs:20000});
state(sim,701,Shared.CAVE_INTERIOR_ENTRY.x,Shared.CAVE_INTERIOR_ENTRY.z,Shared.ROGUE_DUNGEON_INDEX,8);
sim.handle(701,{t:'rogueRecoveryDrop'});
const bag=room.recoveryBags.get(owner.pid);
assert.ok(bag,'setup: bag created');
// Simulate partial progression and a disk round-trip.
room.stage=2;room.openGates=2;room.enemyHp.set('e0',0);room.openedChests.add(1);
const savedRecovery=JSON.parse(JSON.stringify(sim.serializeRogueRecoveryState()));
check('遺品保存は袋の内容と同じ探索シード・進行状態を記録する',()=>{
  assert.equal(savedRecovery.version,1);assert.equal(savedRecovery.rooms.length,1);
  assert.equal(savedRecovery.rooms[0].key,room.key);assert.equal(savedRecovery.rooms[0].seed,room.seed);
  assert.equal(savedRecovery.rooms[0].stage,2);assert.equal(savedRecovery.rooms[0].openGates,2);
  assert.ok(savedRecovery.rooms[0].openedChests.includes(1));assert.equal(savedRecovery.rooms[0].bags[0].payload.shards,17);
});
check('遺品の装備・欠片は公開ワールド保存/エクスポートへ混入しない',()=>{
  const publicWorld=JSON.stringify(sim.serialize());
  assert.ok(!publicWorld.includes('rogueRecovery'));assert.ok(!publicWorld.includes('ownerPid'));assert.ok(!publicWorld.includes('weaponBonus'));
});
const reloaded=new Shared.WorldSim({saved:JSON.parse(JSON.stringify(sim.serialize())),rogueRecoveryState:savedRecovery});
const reloadedSent=[];reloaded.out={sendTo(id,msg){reloadedSent.push({to:id,msg});},broadcast(msg,except){for(const id of reloaded.clients.keys())if(id!==except)reloadedSent.push({to:id,msg});}};
enter(reloaded,702,'Persistent Owner Rejoined',ownerKey);
const newRoom=reloaded.getRogueRoomForClient(702),loadedBag=newRoom&&newRoom.recoveryBags.get(reloaded.clients.get(702).pid);
check('サーバーを作り直して同じパーティーへ戻ると遺品袋を再表示する',()=>{
  assert.ok(newRoom&&loadedBag);assert.equal(newRoom.seed,room.seed);assert.equal(newRoom.stage,2);assert.equal(newRoom.openGates,2);
  assert.equal(newRoom.enemyHp.get('e0'),0);assert.ok(newRoom.openedChests.has(1));
  assert.equal(loadedBag.payload.weaponBonus,3);assert.equal(loadedBag.payload.armorBonus,2);assert.equal(loadedBag.payload.shards,17);
  const snapshot=reloadedSent.find(x=>x.to===702&&x.msg.t==='rogueRoomJoined')?.msg;
  assert.ok(snapshot.recoveryBags.some(b=>b.bagId===loadedBag.bagId&&b.mine));
});
check('再起動中は遺品の残り時間を勝手に減らさない',()=>assert.equal(loadedBag.remainingMs,bag.remainingMs));
state(reloaded,702,loadedBag.x,loadedBag.z,Shared.ROGUE_DUNGEON_INDEX,0);
reloaded.handle(702,{t:'rogueRecoveryClaim',bagId:loadedBag.bagId});
check('復元した袋も従来どおり所有者が回収でき、保存対象から消える',()=>{
  assert.ok(!newRoom.recoveryBags.has(reloaded.clients.get(702).pid));
  assert.equal(reloaded.serializeRogueRecoveryState().rooms.length,0);
  assert.ok(reloadedSent.some(x=>x.to===702&&x.msg.t==='rogueRecoveryClaimResult'&&x.msg.ok&&x.msg.payload.shards===17));
});
const forged={version:1,rooms:[{key:'party:BAD123',seed:1,stage:0,openGates:0,bags:[{bagId:'fake-bag',ownerPid:'0123456789abcdef',ownerName:'fake',x:999,z:999,remainingMs:420000,payload:{weaponBonus:999,armorBonus:999,shards:999999}}]}]};
const guarded=new Shared.WorldSim({seed:9,rogueRecoveryState:forged});
check('壊れた位置の偽保存データは遺品として復元されない',()=>assert.equal(guarded.rogueRecoveryStore.size,0));
const clamped={version:1,rooms:[{key:'party:SAFE12',seed:1,stage:0,openGates:0,bags:[{bagId:'safe-bag',ownerPid:'0123456789abcdef',ownerName:'valid',x:bag.x,z:bag.z,remainingMs:420000,payload:{weaponBonus:999,armorBonus:999,shards:999999}}]}]};
const guardedClamp=new Shared.WorldSim({seed:9,rogueRecoveryState:clamped});
check('復元時も装備・欠片の値は既存の上限へ正規化される',()=>{
  const record=guardedClamp.rogueRecoveryStore.get('party:SAFE12');
  // The test point must pass the shared dungeon walkability validation to reach this assertion.
  assert.ok(record,'valid saved bag should be restored for clamping checks');
  assert.equal(record.bags[0].payload.weaponBonus,3);assert.equal(record.bags[0].payload.armorBonus,2);assert.equal(record.bags[0].payload.shards,999999);
});

const serverSource=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
const saveSource=fs.readFileSync(path.join(__dirname,'..','server-save.js'),'utf8');
check('遺品保存は公開ワールド形式と分離し、旧版向け raw world.json を維持する',()=>{
  assert.ok(serverSource.includes('loadRuntimeSave(SAVE_FILE, FREE_PLAN_MODE)'));
  assert.ok(serverSource.includes('if (FREE_PLAN_MODE) return;'));
  assert.ok(serverSource.includes('writeRuntimeSave(SAVE_FILE, sim.serialize(), sim.serializeRogueRecoveryState(), false)'));
  assert.ok(saveSource.includes("const RECOVERY_SIDECAR_FORMAT = 'lowpoly-island-rogue-recovery'"));
  assert.ok(saveSource.includes("world: world && typeof world === 'object' ? world : null"));
  assert.ok(saveSource.includes("diskData.format === LEGACY_ENVELOPE_FORMAT"));
});

if(!process.exitCode)console.log('Rogue recovery persistence checks passed.');
