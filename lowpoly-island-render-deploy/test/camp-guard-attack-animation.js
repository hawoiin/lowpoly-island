// 野営地番人の持ち方・攻撃軌道をThree.jsの既定Euler順序で検証する。
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'public/index.html'), 'utf8');
let failures = 0;
function check(name, ok) { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) failures++; }

const constantStart = html.indexOf('  const CAMP_GUARD_CLUB_GRIP_ROTATION_Z =');
const start = html.indexOf('  function campGuardAttackPose(en){', constantStart);
const end = html.indexOf('  // 新しい野営地の番人。', start);
check('棍棒保持設定と攻撃ポーズ関数がひとまとまりになっている', constantStart >= 0 && start > constantStart && end > start);
if (constantStart < 0 || start <= constantStart || end <= start) process.exit(1);
const context = {};
vm.runInNewContext(
  html.slice(constantStart, end) +
  '\nthis.GRIP_Z = CAMP_GUARD_CLUB_GRIP_ROTATION_Z;' +
  'this.GRIP_OFFSET_Z = CAMP_GUARD_CLUB_GRIP_OFFSET_Z;' +
  'this.READY_SHOULDER_X = CAMP_GUARD_READY_SHOULDER_X;' +
  'this.READY_ELBOW_X = CAMP_GUARD_READY_ELBOW_X;' +
  'this.READY_HAND_X = CAMP_GUARD_READY_HAND_X;' +
  'this.campGuardAttackPose = campGuardAttackPose;',
  context,
  { timeout: 1000 }
);
const pose = context.campGuardAttackPose;
const finite = value => Object.values(value).every(Number.isFinite);
const idle = pose({ph:0,wp:0,stT:0});
const wind = pose({ph:1,wp:1,stT:0.62});
const strikeStart = pose({ph:2,wp:0,stT:0});
const strikeMid = pose({ph:2,wp:0,stT:0.07});
const strikeEnd = pose({ph:2,wp:0,stT:0.15});
const recoverStart = pose({ph:3,wp:0,stT:0});
const recoverHalf = pose({ph:3,wp:0,stT:0.4});
const recovered = pose({ph:3,wp:0,stT:0.8});
check('全フェーズの姿勢値が有限', [idle,wind,strikeStart,strikeMid,strikeEnd,recoverStart,recoverHalf,recovered].every(finite));

// Three.jsのEuler order=XYZは、列ベクトルへ適用する行列として Rz * Ry * Rx。
// v56までのテストはRx * Ry * Rzを使っていたため、ブラウザ実際の向きと異なる判定になっていた。
const mul = (a,b) => a.map((row,i)=>row.map((_,j)=>a[i][0]*b[0][j]+a[i][1]*b[1][j]+a[i][2]*b[2][j]));
const mv = (m,v) => m.map(row=>row[0]*v[0]+row[1]*v[1]+row[2]*v[2]);
function Rxyz(x=0,y=0,z=0){
  const sx=Math.sin(x), cx=Math.cos(x), sy=Math.sin(y), cy=Math.cos(y), sz=Math.sin(z), cz=Math.cos(z);
  const rx=[[1,0,0],[0,cx,-sx],[0,sx,cx]];
  const ry=[[cy,0,sy],[0,1,0],[-sy,0,cy]];
  const rz=[[cz,-sz,0],[sz,cz,0],[0,0,1]];
  return mul(mul(rz,ry),rx);
}
function node(parent,pos,rot){
  const offset=mv(parent.r,pos);
  return {p:parent.p.map((v,i)=>v+offset[i]),r:mul(parent.r,Rxyz(...rot))};
}
function guardPoint(poseValue, localClubPoint){
  const torso=node({p:[0,0,0],r:Rxyz()},[0,0.5-poseValue.bodyDip,0],[poseValue.torsoX,poseValue.torsoY,0]);
  const shoulder=node(torso,[0.47,0.56,0],[context.READY_SHOULDER_X+poseValue.rightShoulderX,0,0.06+poseValue.rightShoulderZ]);
  const elbow=node(shoulder,[0,-0.28,0],[context.READY_ELBOW_X+poseValue.rightElbowX,0,poseValue.rightElbowZ]);
  const hand=node(elbow,[0,-0.23,0.035],[context.READY_HAND_X+poseValue.rightHandX,0,poseValue.rightHandZ]);
  const club=node(hand,[0,0,context.GRIP_OFFSET_Z],[0,0,context.GRIP_Z]);
  return {clubPoint:club.p.map((v,i)=>v+mv(club.r,localClubPoint)[i]),handPoint:hand.p};
}
const localHeadAxis=mv(Rxyz(0,0,context.GRIP_Z),[0,-1,0]);
check('棍棒モデルの長軸(-Y)を握りから上(+Y)へ向ける',
  Math.abs(localHeadAxis[0])<1e-9 && localHeadAxis[1]>0.999 && Math.abs(localHeadAxis[2])<1e-9);
check('待機時の肘(-1.3)と手首(+1.3)が相殺され、棍棒は手の上へ伸びる基準姿勢になる',
  Math.abs(context.READY_ELBOW_X+context.READY_HAND_X)<1e-9 && context.GRIP_Z===Math.PI);

const idleTip=guardPoint(idle,[0,-0.46,0]);
const idleHead=guardPoint(idle,[0,-0.32,0]);
const windTip=guardPoint(wind,[0,-0.46,0]);
const windHead=guardPoint(wind,[0,-0.32,0]);
const strikeMidTip=guardPoint(strikeMid,[0,-0.46,0]);
const strikeEndTip=guardPoint(strikeEnd,[0,-0.46,0]);
const strikeEndHead=guardPoint(strikeEnd,[0,-0.32,0]);
check('待機時の棍棒先端が手より十分高く、水平に突き出した形ではない',
  idleTip.clubPoint[1]>idleTip.handPoint[1]+0.40 && Math.abs(idleTip.clubPoint[2]-idleTip.handPoint[2])<0.15);
check('待機時の太い先端が手の上にあり、先端と柄の向きが一致する',
  idleHead.clubPoint[1]>idleTip.handPoint[1]+0.24 && idleHead.clubPoint[1]<idleTip.clubPoint[1]);
check('振りかぶりでは棍棒の頭が頭部上端(約1.53m)より高くなる',
  windHead.clubPoint[1]>1.53 && windTip.clubPoint[1]>1.65);
check('振りかぶり位置は待機姿勢より高い', windTip.clubPoint[1]>idleTip.clubPoint[1]+0.35);
check('振り下ろし中盤で棍棒が前方へ進みながら下がる',
  strikeMidTip.clubPoint[2]>windTip.clubPoint[2]+0.55 && strikeMidTip.clubPoint[1]<windTip.clubPoint[1]-0.45);
check('振り切りでは棍棒の頭が手より下に入り、前方へ抜ける',
  strikeEndTip.clubPoint[1]<strikeEndTip.handPoint[1]-0.30 && strikeEndTip.clubPoint[2]>windTip.clubPoint[2]+0.35 && strikeEndTip.clubPoint[1]<strikeEndHead.clubPoint[1]);
check('準備開始と本攻撃開始の腕の角度が連続する',
  Math.abs(wind.rightShoulderX-strikeStart.rightShoulderX)<1e-9 &&
  Math.abs(wind.rightElbowX-strikeStart.rightElbowX)<1e-9 &&
  Math.abs(wind.rightHandX-strikeStart.rightHandX)<1e-9 &&
  Math.abs(wind.rightShoulderZ-strikeStart.rightShoulderZ)<1e-9 &&
  Math.abs(wind.rightElbowZ-strikeStart.rightElbowZ)<1e-9 &&
  Math.abs(wind.rightHandZ-strikeStart.rightHandZ)<1e-9);
check('本攻撃終端と回復開始の姿勢が連続する',
  ['rightShoulderX','rightShoulderZ','rightElbowX','rightElbowZ','rightHandX','rightHandZ','leftShoulderX','leftShoulderZ','leftElbowX','leftElbowZ','torsoX','torsoY','bodyDip','legBrace','kneeBrace','headX']
    .every(key=>Math.abs(strikeEnd[key]-recoverStart[key])<1e-9));
check('回復終了で腕・胴体の差分が待機姿勢へ戻る',
  Object.values(recovered).every(v=>Math.abs(v)<1e-9));
check('回復中に姿勢が待機方向へ戻る',
  Math.abs(recoverHalf.rightShoulderX)<Math.abs(recoverStart.rightShoulderX) &&
  Math.abs(recoverHalf.rightHandX)<Math.abs(recoverStart.rightHandX) &&
  Math.abs(recoverHalf.torsoX)<Math.abs(recoverStart.torsoX));

const guardStart=html.indexOf('  function makeCampGuard(info){');
const guardEnd=html.indexOf('  const ENEMY_MAKERS =',guardStart);
const guard=guardStart>=0&&guardEnd>guardStart?html.slice(guardStart,guardEnd):'';
check('棍棒は手の子で、基準角は一箇所のみで設定される',
  guard.includes('club.position.set(0,0,CAMP_GUARD_CLUB_GRIP_OFFSET_Z)') &&
  guard.includes('club.rotation.set(0, 0, CAMP_GUARD_CLUB_GRIP_ROTATION_Z)') &&
  guard.includes('hand.add(club)') && !html.includes('clubTiltCompensation'));
check('攻撃時の手首は基準角+ポーズ差分で計算される',
  guard.includes("set(arms[1].hand.rotation,'x',CAMP_GUARD_READY_HAND_X + pose.rightHandX)"));
check('指と親指の形が手のグループに属する',guard.includes('// 親指')&&guard.includes('part(hand, box(0.04,0.032,0.028), skin'));
check('攻撃判定とタイミングを維持している',
  fs.readFileSync(path.join(__dirname,'..','public/shared.js'),'utf8').includes("lunge: { trigger: 2.65, windup: 0.62, dur: 0.16, speed: 0, hitR: 1.65, hurt: 9, recover: 0.8, cd: 1.4, dash: false }"));
if (failures) process.exit(1);
console.log('Camp guard weapon grip tests passed.');
