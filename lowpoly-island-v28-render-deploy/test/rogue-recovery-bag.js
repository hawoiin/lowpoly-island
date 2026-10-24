// v61.4: 死亡・切断時の遺品袋、期限、所有者限定回収を検証
'use strict';
const assert=require('assert');
const Shared=require('../public/shared.js');
const sim=new Shared.WorldSim({seed:61407});
const sent=[];
sim.out={sendTo(id,msg){sent.push({to:id,msg});},broadcast(msg,except){for(const id of sim.clients.keys())if(id!==except)sent.push({to:id,msg});}};
function check(name,fn){try{fn();console.log('PASS '+name);}catch(err){console.error('FAIL '+name+': '+err.message);process.exitCode=1;}}
function state(id,x,z,cave,f=0){const c=sim.clients.get(id);c.lastStateAt=Date.now()-10000;sim.handle(id,{t:'state',x,y:0,z,ry:0,cave,f});c.lastStateAt=Date.now();}
function enter(id,name,key,code='RECOV1'){
  sim.addClient(id);sim.handle(id,{t:'join',name,key});sim.handle(id,{t:'roguePartySelect',mode:code?'join':'solo',code});
  const site=Shared.CAVE_SITES[Shared.ROGUE_DUNGEON_INDEX];
  const mouth={x:site.x+site.dirX*Shared.CAVE_MOUTH_OFFSET,z:site.z+site.dirZ*Shared.CAVE_MOUTH_OFFSET};
  state(id,mouth.x,mouth.z,-1,0);state(id,Shared.CAVE_INTERIOR_ENTRY.x,Shared.CAVE_INTERIOR_ENTRY.z,Shared.ROGUE_DUNGEON_INDEX,0);
}
const site=Shared.CAVE_SITES[Shared.ROGUE_DUNGEON_INDEX];
enter(601,'Recovery Owner','persist-owner-key','RECOV1');
enter(602,'Teammate','persist-teammate-key','RECOV1');
const owner=sim.clients.get(601), room=sim.getRogueRoomForClient(601);
check('同一パーティーに遺品回収用の共有探索ランがある',()=>{assert.ok(room);assert.equal(room.members.size,2);assert.ok(room.recoveryBags instanceof Map);});
// Simulate a recent carried-inventory sync before death.
sim.handle(601,{t:'rogueCarryState',weaponBonus:3,armorBonus:2,shards:17,attackBuffMs:40000,speedBuffMs:20000});
state(601,Shared.CAVE_INTERIOR_ENTRY.x,Shared.CAVE_INTERIOR_ENTRY.z,Shared.ROGUE_DUNGEON_INDEX,8);
// Intentionally falsify the drop packet; server must use the last synchronized carry state.
sim.handle(601,{t:'rogueRecoveryDrop',weaponBonus:0,armorBonus:0,shards:999999,attackBuffMs:120000,speedBuffMs:120000});
const bag=room.recoveryBags.get(owner.pid);
check('死亡時に装備・未精算欠片・一時強化を含む遺品袋が生成される',()=>{assert.ok(bag);assert.equal(bag.payload.weaponBonus,3);assert.equal(bag.payload.armorBonus,2);assert.equal(bag.payload.shards,17);assert.equal(bag.payload.attackBuffMs,40000);assert.equal(bag.payload.speedBuffMs,20000);assert.equal(bag.remainingMs,420000);});
check('死亡要求に偽の装備値や欠片が含まれていても直前のサーバー同期値を使う',()=>{assert.notEqual(bag.payload.shards,999999);assert.notEqual(bag.payload.attackBuffMs,120000);});
check('他のパーティーメンバーには袋の位置だけを公開し中身は返さない',()=>{const msg=sent.find(x=>x.to===602&&x.msg.t==='rogueRecoveryBagState'&&x.msg.instanceId===room.id)?.msg;assert.ok(msg);assert.equal(msg.bags[0].mine,false);assert.equal(Object.prototype.hasOwnProperty.call(msg.bags[0],'payload'),false);});
// A teammate at the bag cannot claim the dead player's personal equipment.
const pos={x:bag.x,z:bag.z};state(602,pos.x,pos.z,Shared.ROGUE_DUNGEON_INDEX,0);sim.handle(602,{t:'rogueRecoveryClaim',bagId:bag.bagId});
check('遺品袋は所有者以外が回収できない',()=>{assert.ok(room.recoveryBags.has(owner.pid));assert.ok(sent.some(x=>x.to===602&&x.msg.t==='rogueRecoveryClaimResult'&&x.msg.ok===false));});
// Timer runs while another living member is active.
const before=bag.remainingMs;sim.updateRogueRoom(room,1,Date.now());
check('パーティーの探索が動作中は回収期限が減る',()=>assert.ok(room.recoveryBags.get(owner.pid).remainingMs<before));
// If all players are dead/offline, the timer pauses.
sim.clients.get(602).dead=true;owner.dead=true;const pausedAt=room.recoveryBags.get(owner.pid).remainingMs;sim.updateRogueRoom(room,20,Date.now());
check('全員が死亡・非活動中なら期限は進まない',()=>assert.equal(room.recoveryBags.get(owner.pid).remainingMs,pausedAt));
// Owner revives/re-enters near the bag and claims it.
owner.dead=false;state(601,pos.x,pos.z,Shared.ROGUE_DUNGEON_INDEX,0);sim.handle(601,{t:'rogueRecoveryClaim',bagId:bag.bagId});
check('所有者が近距離で回収すると正しい装備と欠片を返す',()=>{const result=sent.filter(x=>x.to===601&&x.msg.t==='rogueRecoveryClaimResult'&&x.msg.ok).at(-1)?.msg;assert.ok(result);assert.equal(result.payload.weaponBonus,3);assert.equal(result.payload.armorBonus,2);assert.equal(result.payload.shards,17);assert.equal(result.restoredBuffRatio,.5);assert.equal(room.recoveryBags.has(owner.pid),false);});
// Disconnect while alive also drops the last server-synchronized carry snapshot.
const room2=sim.getRogueRoomForClient(602);const teammate=sim.clients.get(602);teammate.dead=false;
sim.handle(602,{t:'rogueCarryState',weaponBonus:2,armorBonus:1,shards:5,attackBuffMs:0,speedBuffMs:0});
state(602,Shared.CAVE_INTERIOR_ENTRY.x,Shared.CAVE_INTERIOR_ENTRY.z,Shared.ROGUE_DUNGEON_INDEX,0);
sim.removeClient(602);
check('探索中の切断でも直近同期済みの携行品を遺品袋として残す',()=>{assert.ok(room2.recoveryBags.has(teammate.pid));assert.equal(room2.recoveryBags.get(teammate.pid).payload.weaponBonus,2);});
// A reconnected browser with the same persistent key can rejoin its solo room and see its bag.
const stableKey='solo-stable-persistent-key';
enter(603,'Solo Owner',stableKey,'');
const soloRoom=sim.getRogueRoomForClient(603);sim.handle(603,{t:'rogueCarryState',weaponBonus:1,armorBonus:0,shards:3,attackBuffMs:0,speedBuffMs:0});
state(603,Shared.CAVE_INTERIOR_ENTRY.x,Shared.CAVE_INTERIOR_ENTRY.z,Shared.ROGUE_DUNGEON_INDEX,8);
sim.handle(603,{t:'rogueRecoveryDrop',weaponBonus:1,armorBonus:0,shards:3,attackBuffMs:0,speedBuffMs:0});
const soloBag=soloRoom.recoveryBags.get(sim.clients.get(603).pid);
state(603,site.x+site.dirX*Shared.CAVE_EXIT_OFFSET,site.z+site.dirZ*Shared.CAVE_EXIT_OFFSET,Shared.ROGUE_DUNGEON_INDEX,8);
// No need to model cave exit to test that room data survives member leave; remove client as if browser reloaded.
sim.removeClient(603);
enter(604,'Solo Owner Reconnected',stableKey,'');
const reconnectRoom=sim.getRogueRoomForClient(604);
check('同じブラウザ識別子で再接続すればソロ探索の遺品袋を再表示できる',()=>{assert.equal(reconnectRoom.id,soloRoom.id);const snap=sent.filter(x=>x.to===604&&x.msg.t==='rogueRoomJoined').at(-1)?.msg;assert.ok(snap.recoveryBags.some(b=>b.bagId===soloBag.bagId&&b.mine));});
if(!process.exitCode)console.log('Rogue recovery bag checks passed.');
