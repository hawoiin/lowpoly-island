// v61.2: 協力ダンジョンの共有ラン、宝箱報酬、敵HP・区画進行同期を検証
'use strict';
const assert=require('assert');
const Shared=require('../public/shared.js');
const sim=new Shared.WorldSim({seed:61011});
const sent=[];
sim.out={sendTo(id,msg){sent.push({to:id,msg});},broadcast(msg,except){for(const id of sim.clients.keys())if(id!==except)sent.push({to:id,msg});}};
function check(name,fn){try{fn();console.log('PASS '+name);}catch(err){console.error('FAIL '+name+': '+err.message);process.exitCode=1;}}
function enter(id,name){
  sim.addClient(id);sim.handle(id,{t:'join',name,key:`rogue-coop-${id}`});sim.handle(id,{t:'roguePartySelect',mode:'join',code:'PARTY1'});
  const site=Shared.CAVE_SITES[Shared.ROGUE_DUNGEON_INDEX];
  const mouth={x:site.x+site.dirX*Shared.CAVE_MOUTH_OFFSET,z:site.z+site.dirZ*Shared.CAVE_MOUTH_OFFSET};
  sim.handle(id,{t:'state',x:mouth.x,y:Shared.islandHeight(mouth.x,mouth.z),z:mouth.z,ry:0,cave:-1,f:0});
  sim.handle(id,{t:'state',x:Shared.CAVE_INTERIOR_ENTRY.x,y:0,z:Shared.CAVE_INTERIOR_ENTRY.z,ry:0,cave:Shared.ROGUE_DUNGEON_INDEX,f:0});
}
enter(41,'Player A');
const one=sent.find(x=>x.to===41&&x.msg.t==='rogueRoomJoined')?.msg;
check('最初のプレイヤーがサーバー管理の探索ランを受け取る',()=>assert.ok(one&&Number.isInteger(one.seed)&&Number.isSafeInteger(one.instanceId)));
enter(42,'Player B');
const two=sent.find(x=>x.to===42&&x.msg.t==='rogueRoomJoined')?.msg;
check('二人目は同じ探索ランIDとseedへ参加する',()=>{assert.ok(two);assert.equal(two.instanceId,one.instanceId);assert.equal(two.seed,one.seed);assert.equal(sim.getRogueRoomForClient(41).members.size,2);});
const layout=Shared.getRogueDungeonLayout(one.seed);
check('サーバーとクライアントで再現可能な地形用配置が使われる',()=>assert.deepEqual(Shared.getRogueDungeonLayout(one.seed),layout));
const chest=layout.chests[0];const c1=sim.clients.get(41);c1.lastStateAt=Date.now()-10000;
sim.handle(41,{t:'state',x:chest.x,y:0,z:chest.z,ry:0,cave:Shared.ROGUE_DUNGEON_INDEX,f:0});
sim.handle(41,{t:'rogueChestOpen',index:0});
const chestEvents=sent.filter(x=>x.msg.t==='rogueChestOpened'&&x.msg.index===0&&x.msg.instanceId===one.instanceId);
check('一人の開封で同じ宝箱イベントが全員に配信される',()=>{assert.equal(chestEvents.length,2);assert.deepEqual(chestEvents.map(x=>x.to).sort(),[41,42]);assert.deepEqual(chestEvents[0].msg.reward,chestEvents[1].msg.reward);});
sim.handle(41,{t:'rogueChestOpen',index:0});
check('同じ宝箱の連続開封要求では報酬が重複しない',()=>assert.equal(sent.filter(x=>x.msg.t==='rogueChestOpened'&&x.msg.index===0&&x.msg.instanceId===one.instanceId).length,2));
const enemy=layout.enemies[0];c1.lastStateAt=Date.now()-10000;
sim.handle(41,{t:'state',x:enemy.x,y:0,z:enemy.z,ry:0,cave:Shared.ROGUE_DUNGEON_INDEX,f:0});
sim.handle(41,{t:'rogueHit',targetId:enemy.id,damage:2,x:enemy.x,z:enemy.z});
const firstHit=sent.find(x=>x.to===42&&x.msg.t==='rogueEnemyHitState'&&x.msg.targetId===enemy.id&&x.msg.instanceId===one.instanceId);
check('敵への攻撃はサーバーでHPが計算され仲間にも共有される',()=>{assert.ok(firstHit);assert.equal(firstHit.msg.hp,enemy.hp-2);});
sim.clients.get(42).lastStateAt=Date.now()-10000;
sim.handle(42,{t:'state',x:enemy.x,y:0,z:enemy.z,ry:0,cave:Shared.ROGUE_DUNGEON_INDEX,f:0});
sim.handle(42,{t:'rogueHit',targetId:enemy.id,damage:8,x:enemy.x,z:enemy.z});
const killed=sent.find(x=>x.to===41&&x.msg.t==='rogueEnemyHitState'&&x.msg.targetId===enemy.id&&x.msg.instanceId===one.instanceId&&x.msg.killed===true);
check('敵を倒した状態と撃破報酬の通知が全員へ同期される',()=>{assert.ok(killed);assert.equal(killed.msg.hp,0);assert.ok(killed.msg.shardReward>=1&&killed.msg.shardReward<=3);});
function hitTargetFor(id,target,damage=8){
  const c=sim.clients.get(id);c.lastStateAt=Date.now()-10000;
  sim.handle(id,{t:'state',x:target.x,y:0,z:target.z,ry:0,cave:Shared.ROGUE_DUNGEON_INDEX,f:0});
  sim.rogueHitCooldowns.delete(`${id}:${target.id}`);
  sim.handle(id,{t:'rogueHit',targetId:target.id,damage,x:target.x,z:target.z});
}
for(const id of ['e1','e2','e3']) hitTargetFor(42,layout.enemies.find(e=>e.id===id));
check('本線の最初の敵を全滅させると共有区画が第2区画へ進む',()=>assert.equal(sim.getRogueRoomForClient(41).stage,1));
for(const id of ['e4','e5','e6']) hitTargetFor(42,layout.enemies.find(e=>e.id===id));
check('枝道の任意敵を残しても本線の第2区画を突破できる',()=>assert.equal(sim.getRogueRoomForClient(41).stage,2));
for(const id of ['e10','e11','e12','e13','e14']) hitTargetFor(42,layout.enemies.find(e=>e.id===id));
check('深層の本線を全滅させると共有ボス区画が解放される',()=>assert.equal(sim.getRogueRoomForClient(41).stage,3));
for(let i=0;i<6;i++) hitTargetFor(42,layout.boss,8);
check('ボス撃破・生還門の解放が同じ探索ラン全員へ共有される',()=>{assert.equal(sim.getRogueRoomForClient(41).stage,4);assert.equal(sim.getRogueRoomForClient(41).extractReady,true);});
const outsider=new Shared.WorldSim({seed:61012});const out=[];outsider.out={sendTo(id,msg){out.push(msg);},broadcast(){}};outsider.addClient(51);outsider.handle(51,{t:'join',name:'Outsider',key:'outsider'});
outsider.handle(51,{t:'rogueChestOpen',index:0});
check('ダンジョン外からの宝箱開封要求は拒否される',()=>assert.equal(out.some(m=>m.t==='rogueChestOpened'),false));
// 正規の出口位置まで移動してから退室する。
const site=Shared.CAVE_SITES[Shared.ROGUE_DUNGEON_INDEX];const exit={x:site.x+site.dirX*Shared.CAVE_EXIT_OFFSET,z:site.z+site.dirZ*Shared.CAVE_EXIT_OFFSET};
sim.clients.get(41).lastStateAt=Date.now()-10000;
sim.handle(41,{t:'state',x:Shared.CAVE_INTERIOR_EXIT.x,y:0,z:Shared.CAVE_INTERIOR_EXIT.z,ry:0,cave:Shared.ROGUE_DUNGEON_INDEX,f:0});
sim.clients.get(41).lastStateAt=Date.now()-10000;
sim.handle(41,{t:'state',x:exit.x,y:Shared.islandHeight(exit.x,exit.z),z:exit.z,ry:0,cave:-1,f:0});
check('一人が退出しても仲間が残っていれば探索ランは維持される',()=>{const remaining=sim.getRogueRoomForClient(42);assert.ok(remaining);assert.equal(remaining.members.has(41),false);assert.equal(remaining.members.has(42),true);});
check('退出したプレイヤーの攻撃クールダウン記録を破棄する',()=>assert.equal([...sim.rogueHitCooldowns.keys()].some(key=>key.startsWith('41:')),false));
sim.clients.get(42).lastStateAt=Date.now()-10000;
sim.handle(42,{t:'state',x:Shared.CAVE_INTERIOR_EXIT.x,y:0,z:Shared.CAVE_INTERIOR_EXIT.z,ry:0,cave:Shared.ROGUE_DUNGEON_INDEX,f:0});
sim.clients.get(42).lastStateAt=Date.now()-10000;
sim.handle(42,{t:'state',x:exit.x,y:Shared.islandHeight(exit.x,exit.z),z:exit.z,ry:0,cave:-1,f:0});
check('最後の参加者が退出すると探索ランが閉じる',()=>assert.equal(sim.getRogueRoomForClient(42),null));
if(!process.exitCode)console.log('Rogue co-op checks passed.');
