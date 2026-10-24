// パーティーコードごとにダンジョンの状態が分離することを検証
'use strict';
const assert=require('assert');
const Shared=require('../public/shared.js');
const sim=new Shared.WorldSim({seed:61123});
const sent=[];
sim.out={sendTo(id,msg){sent.push({to:id,msg});},broadcast(msg,except){for(const id of sim.clients.keys())if(id!==except)sent.push({to:id,msg});}};
function check(name,fn){try{fn();console.log('PASS '+name);}catch(err){console.error('FAIL '+name+': '+err.message);process.exitCode=1;}}
function enter(id,name,code){
  sim.addClient(id);sim.handle(id,{t:'join',name,key:`party-isolate-${id}`});
  sim.handle(id,{t:'roguePartySelect',mode:'join',code});
  const site=Shared.CAVE_SITES[Shared.ROGUE_DUNGEON_INDEX];
  const mouth={x:site.x+site.dirX*Shared.CAVE_MOUTH_OFFSET,z:site.z+site.dirZ*Shared.CAVE_MOUTH_OFFSET};
  sim.handle(id,{t:'state',x:mouth.x,y:Shared.islandHeight(mouth.x,mouth.z),z:mouth.z,ry:0,cave:-1,f:0});
  sim.handle(id,{t:'state',x:Shared.CAVE_INTERIOR_ENTRY.x,y:0,z:Shared.CAVE_INTERIOR_ENTRY.z,ry:0,cave:Shared.ROGUE_DUNGEON_INDEX,f:0});
}
enter(101,'A','ALPHA1');
enter(102,'B','BRAVO2');
const roomA=sim.getRogueRoomForClient(101),roomB=sim.getRogueRoomForClient(102);
check('異なるパーティーコードは別々の探索ランを生成する',()=>{assert.ok(roomA&&roomB);assert.notEqual(roomA.id,roomB.id);assert.notEqual(roomA.seed,roomB.seed);assert.equal(sim.rogueRooms.size,2);});
sim.broadcastSnap();
const snapshot=sent.filter(x=>x.msg.t==='snap').at(-1)?.msg;
const snapA=snapshot?.p.find(p=>p[0]===101),snapB=snapshot?.p.find(p=>p[0]===102);
check('プレイヤー同期にダンジョンインスタンスIDが含まれ、別パーティーを判別できる',()=>{assert.ok(snapA&&snapB);assert.equal(snapA[7],roomA.id);assert.equal(snapB[7],roomB.id);assert.notEqual(snapA[7],snapB[7]);});
enter(103,'A2','ALPHA1');
check('同じパーティーコードの3人目はAの探索ランへ参加する',()=>{assert.equal(sim.getRogueRoomForClient(103).id,roomA.id);assert.equal(roomA.members.size,2);assert.equal(roomB.members.size,1);});
const layoutA=Shared.getRogueDungeonLayout(roomA.seed),layoutB=Shared.getRogueDungeonLayout(roomB.seed);
const beforeB=roomB.enemyHp.get('e0');
const target=layoutA.enemies.find(e=>e.id==='e0');
sim.clients.get(101).lastStateAt=Date.now()-10000;
sim.handle(101,{t:'state',x:target.x,y:0,z:target.z,ry:0,cave:Shared.ROGUE_DUNGEON_INDEX,f:0});
sim.clients.get(101).lastStateAt=Date.now()-10000;
sim.handle(101,{t:'rogueHit',targetId:'e0',damage:1,x:target.x,z:target.z});
check('Aパーティーの攻撃はBパーティーの敵HPへ影響しない',()=>{assert.equal(roomB.enemyHp.get('e0'),beforeB);assert.ok(roomA.enemyHp.get('e0')<target.hp);});
const chestBBefore=roomB.openedChests.size;
const chestA=layoutA.chests[0];
sim.clients.get(101).lastStateAt=Date.now()-10000;
sim.handle(101,{t:'state',x:chestA.x,y:0,z:chestA.z,ry:0,cave:Shared.ROGUE_DUNGEON_INDEX,f:0});
sim.handle(101,{t:'rogueChestOpen',index:0});
check('Aの宝箱開封はAメンバーだけに配信されBには届かない',()=>{assert.equal(roomA.openedChests.has(0),true);assert.equal(roomB.openedChests.size,chestBBefore);assert.ok(!sent.some(x=>x.to===102&&x.msg.t==='rogueChestOpened'&&x.msg.instanceId===roomA.id));assert.ok(sent.some(x=>x.to===103&&x.msg.t==='rogueChestOpened'&&x.msg.instanceId===roomA.id));});
sim.addClient(104);sim.handle(104,{t:'join',name:'Bad Code',key:'party-isolate-104'});
const rejectCount=sent.filter(x=>x.to===104&&x.msg.t==='roguePartySelected'&&x.msg.ok===false).length;
sim.handle(104,{t:'roguePartySelect',mode:'join',code:'BAD!'});
check('不正なパーティーコードはサーバーで拒否される',()=>assert.equal(sent.filter(x=>x.to===104&&x.msg.t==='roguePartySelected'&&x.msg.ok===false).length,rejectCount+1));
if(!process.exitCode)console.log('Rogue party isolation checks passed.');
