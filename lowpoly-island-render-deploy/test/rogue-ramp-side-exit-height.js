// v62.9: 坂から横へ出る時の床高差を検査し、上方への不自然なスナップを防ぐ。
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
const Shared=require('../public/shared.js');
const helperStart=html.indexOf('  const ROGUE_DUNGEON_INDEX = Shared.ROGUE_DUNGEON_INDEX;');
const helperEnd=html.indexOf('  function isRogueWalkable(',helperStart);
const exitStart=html.indexOf('  function rogueRampSideExitWouldStepUp(',helperEnd);
const exitEnd=html.indexOf('  function constrainRogueDungeonPosition(',exitStart);
if(helperStart<0||helperEnd<=helperStart||exitStart<0||exitEnd<=exitStart)throw new Error('ramp floor helpers not found');
const context={Shared,Math,Number,THREE:{MathUtils:{clamp:(v,min,max)=>Math.min(max,Math.max(min,v))}}};
vm.runInNewContext(html.slice(helperStart,helperEnd)+html.slice(exitStart,exitEnd)+'\nglobalThis.__rampExitTest={rogueFloorHeight,rogueRampSideExitWouldStepUp,ROGUE_WALK_AREAS};',context,{timeout:1000});
const T=context.__rampExitTest;
const ramps=T.ROGUE_WALK_AREAS.filter(a=>a.type==='segment'&&Math.abs((a.yB||0)-(a.yA||0))>1e-5);
let failures=0;function check(name,ok,details=''){console.log((ok?'PASS ':'FAIL ')+name+(ok?'':' '+details));if(!ok)failures++;}
function sidePoints(a,t,fromDist,toDist,sign=1){
  const dx=a.bx-a.ax,dz=a.bz-a.az,len=Math.hypot(dx,dz),cx=a.ax+dx*t,cz=a.az+dz*t,nx=dz/len*sign,nz=-dx/len*sign,limit=a.width*.45;
  return {from:{x:cx+nx*(limit-fromDist),z:cz+nz*(limit-fromDist)},to:{x:cx+nx*(limit+toDist),z:cz+nz*(limit+toDist)}};
}
// Descending side route at the midpoint ends on the higher y=0 chamber floor.
const descending=ramps.find(a=>(a.yB||0)<(a.yA||0)&&Math.abs((a.yB||0)-(a.yA||0))>2);
if(!descending)throw new Error('expected descending ramp not found');
const p=sidePoints(descending,.5,.3,1.4);
check('descend-ramp to higher side floor is detected as a step-up',T.rogueRampSideExitWouldStepUp(p.from.x,p.from.z,p.to.x,p.to.z),`fromY=${T.rogueFloorHeight(p.from.x,p.from.z)} toY=${T.rogueFloorHeight(p.to.x,p.to.z)}`);
// On the rising western ramp, the side floor is lower; leaving the side must remain allowed.
const rising=ramps.find(a=>(a.yB||0)>(a.yA||0));
const q=sidePoints(rising,.5,.3,1.4);
check('rising ramp can still step off onto a lower side floor',!T.rogueRampSideExitWouldStepUp(q.from.x,q.from.z,q.to.x,q.to.z),`fromY=${T.rogueFloorHeight(q.from.x,q.from.z)} toY=${T.rogueFloorHeight(q.to.x,q.to.z)}`);
// Ramp endpoints stay open for proper entry/exit.
const end=sidePoints(descending,.04,.3,1.4);
check('ramp end remains open for normal entry/exit',!T.rogueRampSideExitWouldStepUp(end.from.x,end.from.z,end.to.x,end.to.z));
if(failures){console.error(`${failures} test(s) failed`);process.exit(1);}console.log('ALL PASSED');
