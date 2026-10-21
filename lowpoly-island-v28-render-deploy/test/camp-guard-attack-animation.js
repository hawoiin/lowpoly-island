// 野営地番人の攻撃が「頭上から前方へ振り下ろす」軌道か検証する。
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'public/index.html'), 'utf8');
let failures = 0;
function check(name, ok) { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) failures++; }
const constantStart = html.indexOf('  const CAMP_GUARD_CLUB_HOLD_TILT_X = -0.45;');
const start = html.indexOf('  function campGuardAttackPose(en){', constantStart);
const end = html.indexOf('  // 新しい野営地の番人。', start);
check('棍棒の保持角と番人攻撃ポーズを分離', constantStart >= 0 && start > constantStart && end > start);
if (constantStart < 0 || start <= constantStart || end <= start) process.exit(1);
const context = {};
vm.runInNewContext(html.slice(constantStart, end) + '\nthis.CAMP_GUARD_CLUB_HOLD_TILT_X = CAMP_GUARD_CLUB_HOLD_TILT_X; this.CAMP_GUARD_READY_SHOULDER_X = CAMP_GUARD_READY_SHOULDER_X; this.CAMP_GUARD_READY_ELBOW_X = CAMP_GUARD_READY_ELBOW_X; this.campGuardAttackPose = campGuardAttackPose;', context, { timeout: 1000 });
const CLUB_TILT = context.CAMP_GUARD_CLUB_HOLD_TILT_X;
const CAMP_GUARD_READY_SHOULDER_X = context.CAMP_GUARD_READY_SHOULDER_X;
const CAMP_GUARD_READY_ELBOW_X = context.CAMP_GUARD_READY_ELBOW_X;
const pose = context.campGuardAttackPose;
const finite = v => Object.values(v).every(Number.isFinite);
const idle = pose({ph:0,wp:0,stT:0});
const prep = pose({ph:1,wp:1,stT:0.62});
const strike0 = pose({ph:2,wp:0,stT:0});
const strikeMid = pose({ph:2,wp:0,stT:0.07});
const strike = pose({ph:2,wp:0,stT:0.15});
const recover0 = pose({ph:3,wp:0,stT:0});
const recoverHalf = pose({ph:3,wp:0,stT:0.4});
const recovered = pose({ph:3,wp:0,stT:0.8});
check('全フェーズで回転値が有限', [idle,prep,strike0,strike,recover0,recoverHalf,recovered].every(finite));
check('予備動作は待機姿勢から肩を回して棍棒を頭上へ構える', CAMP_GUARD_READY_SHOULDER_X + prep.rightShoulderX < -2 && Math.abs(prep.rightShoulderZ) < 1e-9 && CAMP_GUARD_READY_ELBOW_X + prep.rightElbowX < -0.1 && prep.rightHandX > 0);
check('攻撃終端では肩・肘・手首が前下方の振り切り姿勢になる', CAMP_GUARD_READY_SHOULDER_X + strike.rightShoulderX > -1 && CAMP_GUARD_READY_SHOULDER_X + strike.rightShoulderX < -0.7 && Math.abs(strike.rightShoulderZ) < 1e-9 && strike.rightHandX > 0 && strike.torsoX > 0.3);

// Three.jsのEuler XYZを模した3x3回転と実モデルの階層位置計算。棍棒先端の上下/前後/左右の軌道を確認する。
const mul = (a,b) => a.map((row,i)=>row.map((_,j)=>a[i][0]*b[0][j]+a[i][1]*b[1][j]+a[i][2]*b[2][j]));
const mv = (m,v) => m.map(row=>row[0]*v[0]+row[1]*v[1]+row[2]*v[2]);
function Rxyz(x=0,y=0,z=0){
  const sx=Math.sin(x), cx=Math.cos(x), sy=Math.sin(y), cy=Math.cos(y), sz=Math.sin(z), cz=Math.cos(z);
  const rx=[[1,0,0],[0,cx,-sx],[0,sx,cx]], ry=[[cy,0,sy],[0,1,0],[-sy,0,cy]], rz=[[cz,-sz,0],[sz,cz,0],[0,0,1]];
  return mul(mul(rx,ry),rz);
}
function node(parent, pos, rot){
  const offset=mv(parent.r,pos);
  return { p:parent.p.map((v,i)=>v+offset[i]), r:mul(parent.r,Rxyz(...rot)) };
}
function clubPoint(pose, localPoint){
  const torso=node({p:[0,0,0],r:Rxyz()},[0,0.5-pose.bodyDip,0],[pose.torsoX,pose.torsoY,0]);
  const shoulder=node(torso,[0.47,0.56,0],[pose.rightShoulderX+CAMP_GUARD_READY_SHOULDER_X,0,pose.rightShoulderZ+0.06]);
  const elbow=node(shoulder,[0,-0.28,0],[pose.rightElbowX+CAMP_GUARD_READY_ELBOW_X,0,pose.rightElbowZ]);
  const hand=node(elbow,[0,-0.23,0.035],[pose.rightHandX,0,pose.rightHandZ]);
  const tilted=mv(Rxyz(CLUB_TILT,0,0),localPoint);
  const clubLocal=[tilted[0],tilted[1],tilted[2]+0.055];
  const offset=mv(hand.r,clubLocal); return hand.p.map((v,i)=>v+offset[i]);
}
const idleTip=clubPoint(idle,[0,-0.46,0]);
const idleHead=clubPoint(idle,[0,-0.32,0]);
const idleHand=clubPoint(idle,[0,0,0]);
const prepTip=clubPoint(prep,[0,-0.46,0]);
const prepHead=clubPoint(prep,[0,-0.32,0]);
const strikeMidTip=clubPoint(strikeMid,[0,-0.46,0]);
const strikeTip=clubPoint(strike,[0,-0.46,0]);
const strikeHead=clubPoint(strike,[0,-0.32,0]);
check('待機時の棍棒先端は手より高く、前方(+Z)へ向く', idleTip[1] > idleHand[1]+0.08 && idleTip[2] > idleHand[2]+0.12);
check('待機時の棍棒の太い先端は手より高く、胴体の前側に出る', idleTip[1] > 0.05 && idleHead[1] > idleHand[1]+0.06 && idleHead[2] > idleHand[2]+0.10);
check('準備姿勢で棍棒の頭が頭部より高く、体の近くに収まる', prepHead[1] > 1.55 && prepTip[1] > 1.65 && Math.abs(prepHead[0]) < 0.75);
check('攻撃中に棍棒が大きく下へ移動する', prepTip[1]-strikeTip[1] > 1.2);
check('振り下ろしの中盤で棍棒が前方(+Z)へ弧を描いて進む', strikeMidTip[2]-prepTip[2] > 0.3 && strikeMidTip[1] < prepTip[1]-0.5);
check('振り切り位置も構えより前方にあり、実際に前下方へ抜ける', strikeTip[2] > prepTip[2] && strikeTip[2] > 0.5);
check('振り下ろし中に棍棒が真横へ大きく振り出されない', Math.max(Math.abs(prepTip[0]), Math.abs(strikeMidTip[0]), Math.abs(strikeTip[0])) < 0.85);
check('攻撃終端で棍棒の先端が頭より下にある', strikeTip[1] < strikeHead[1]-0.08);
check('予備動作から本攻撃に姿勢が連続する', Math.abs(prep.rightShoulderZ-strike0.rightShoulderZ)<1e-9 && Math.abs(prep.rightShoulderX-strike0.rightShoulderX)<1e-9 && Math.abs(prep.rightHandX-strike0.rightHandX)<1e-9);
check('振り切り直後から回復姿勢へ連続する', Math.abs(strike.rightShoulderZ-recover0.rightShoulderZ)<1e-9 && Math.abs(strike.rightShoulderX-recover0.rightShoulderX)<1e-9 && Math.abs(strike.rightHandX-recover0.rightHandX)<1e-9);
check('回復後は通常姿勢へ戻る', Math.abs(recovered.rightShoulderZ)<1e-9 && Math.abs(recovered.rightShoulderX)<1e-9 && Math.abs(recovered.torsoX)<1e-9);
check('回復中は姿勢が通常状態へ向かって戻る', Math.abs(recoverHalf.rightShoulderX)<Math.abs(recover0.rightShoulderX) && Math.abs(recoverHalf.torsoX)<Math.abs(recover0.torsoX));
const guardStart = html.indexOf('  function makeCampGuard(info){');
const guardEnd = html.indexOf('  const ENEMY_MAKERS =', guardStart);
const guard = html.slice(guardStart, guardEnd);
check('番人モデルは武器専用ピボットを手の子として使う', guard.includes('const club = new THREE.Group()') && guard.includes('club.rotation.x = CAMP_GUARD_CLUB_HOLD_TILT_X') && guard.includes('hand.add(club)'));
check('番人専用アニメーションでポーズ関数と手首補正を使用', guard.includes('const pose = campGuardAttackPose(en)') && guard.includes('arms[1].shoulder.rotation') && guard.includes('arms[1].hand.rotation') && html.includes('pose.rightHandX += clubTiltCompensation'));
check('棍棒モデルの局所取り付け角を維持し、待機時は腕の基準姿勢で先端を上へ向ける', CLUB_TILT < -0.3 && CLUB_TILT > -0.7 && CAMP_GUARD_READY_SHOULDER_X < -0.5 && CAMP_GUARD_READY_ELBOW_X < -0.8);
check('攻撃判定とタイミングを変更していない', fs.readFileSync(path.join(__dirname, '..', 'public/shared.js'), 'utf8').includes("lunge: { trigger: 2.65, windup: 0.62, dur: 0.16, speed: 0, hitR: 1.65, hurt: 9, recover: 0.8, cd: 1.4, dash: false }"));
if (failures) process.exit(1);
console.log('Camp guard downward chop animation tests passed.');
