// 実際のダンジョン座標関数をVM内で実行し、高低差と裂け目の通行判定を確認する。
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm');
const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
const a=html.indexOf('  const ROGUE_WALK_AREAS = [');
const b=html.indexOf('  function buildRogueDungeonInterior(){',a);
if(a<0||b<a) throw new Error('Rogue terrain coordinate functions are missing');
const source=html.slice(a,b)+'\n globalThis.__rogueTest={ROGUE_WALK_AREAS,ROGUE_GATE_Z,rogueFloorHeight,isRogueWalkable};';
const context={Math,Number,console,rogueRun:null,THREE:{MathUtils:{clamp:(v,min,max)=>Math.min(max,Math.max(min,v))}}};
vm.runInNewContext(source,context,{timeout:1000});
const g=context.__rogueTest;
let failed=0;function check(name,condition){console.log((condition?'PASS ':'FAIL ')+name);if(!condition)failed++;}
const near=(a,b,t=.08)=>Math.abs(a-b)<=t;
check('入口広間は通常床の高さ0にある',near(g.rogueFloorHeight(0,12),0));
check('西の分岐は3.8m高い高台になる',near(g.rogueFloorHeight(-42,-66),3.8));
check('西側の斜路は床高を連続補間する',near(g.rogueFloorHeight(-21.5,-73.5),1.9));
check('東の水晶窪地は2.6m低い',near(g.rogueFloorHeight(44,-97),-2.6));
check('深層は5.2m低く、下降路は中間高になる',near(g.rogueFloorHeight(0,-184),-5.2)&&near(g.rogueFloorHeight(0,-159),-3.3));
check('裂け目は中央橋から渡れる',g.isRogueWalkable(0,-83,3)===true);
check('裂け目の橋以外の中央部分は横断できない',g.isRogueWalkable(8,-83,3)===false);
check('裂け目の東側の細い橋は渡れる',g.isRogueWalkable(15,-83,3)===true);
check('裂け目の端を回り込んで通り抜けられない',g.isRogueWalkable(30,-83,3)===false);
check('閉じた最初の封印門は通れない',g.isRogueWalkable(0,-52,0)===false);
check('敵を倒して門を開けば前進できる',g.isRogueWalkable(0,-52,1)===true);
if(failed)process.exit(1);console.log('Rogue geometry runtime checks passed.');
