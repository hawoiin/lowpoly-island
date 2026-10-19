// 野営地番人の棍棒が予備動作から正面(+Z)へ振られることを検証。
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'public/index.html'), 'utf8');
let failures = 0;
function check(name, ok) { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) failures++; }
const start = html.indexOf('  function campGuardAttackPose(en){');
const end = html.indexOf('  // 新しい野営地の番人。', start);
check('番人攻撃ポーズを純粋関数として分離', start >= 0 && end > start);
if (start < 0 || end <= start) process.exit(1);
const context = {};
vm.runInNewContext(html.slice(start, end) + '\nthis.campGuardAttackPose = campGuardAttackPose;', context, { timeout: 1000 });
const pose = context.campGuardAttackPose;
const finite = v => Object.values(v).every(Number.isFinite);
const idle = pose({ph:0,wp:0,stT:0});
const prep0 = pose({ph:1,wp:0,stT:0});
const prep = pose({ph:1,wp:1,stT:0.62});
const strike0 = pose({ph:2,wp:0,stT:0});
const strike = pose({ph:2,wp:0,stT:0.12});
const recover0 = pose({ph:3,wp:0,stT:0});
const recoverHalf = pose({ph:3,wp:0,stT:0.4});
const recovered = pose({ph:3,wp:0,stT:0.8});
check('全フェーズで回転値が有限', [idle,prep0,prep,strike0,strike,recover0,recoverHalf,recovered].every(finite));
check('予備動作は棍棒を後方へ引き、腕を過剰に横へ振り上げない', prep.rightShoulderZ > 0.45 && prep.rightShoulderZ < 0.7 && prep.rightShoulderX > 0.4 && prep.rightHandX > 0.1);
function rx(a,v){ const c=Math.cos(a),s=Math.sin(a); return [v[0],v[1]*c-v[2]*s,v[1]*s+v[2]*c]; }
function rz(a,v){ const c=Math.cos(a),s=Math.sin(a); return [v[0]*c-v[1]*s,v[0]*s+v[1]*c,v[2]]; }
function rotatePose(p){
  // 棍棒の軸はhandローカル-Y。Three.jsのEuler XYZを手→肘→肩の順に適用。
  let v=[0,-1,0];
  for (const q of [[p.rightHandX,p.rightHandZ],[p.rightElbowX,p.rightElbowZ],[p.rightShoulderX,p.rightShoulderZ]]) v=rz(q[1],rx(q[0],v));
  return v;
}
const prepVector = rotatePose(prep), strikeVector = rotatePose(strike);
check('攻撃の棍棒軸が敵の正面(+Z)へ向く', strikeVector[2] > 0.9 && Math.abs(strikeVector[0]) < 0.12);
check('攻撃軌道が後方から前方へ移動する', prepVector[2] < -0.25 && strikeVector[2] > 0.9);
check('肩の回転で腕が胴体正面を大きく横切らない', strike.rightShoulderZ < 0.25 && strike.rightElbowZ < 0);
check('予備動作から本攻撃に姿勢が連続する', Math.abs(prep.rightShoulderZ-strike0.rightShoulderZ)<1e-9 && Math.abs(prep.rightShoulderX-strike0.rightShoulderX)<1e-9 && Math.abs(prep.rightHandX-strike0.rightHandX)<1e-9);
check('振り切り直後から回復姿勢へ連続する', Math.abs(strike.rightShoulderZ-recover0.rightShoulderZ)<1e-9 && Math.abs(strike.rightShoulderX-recover0.rightShoulderX)<1e-9 && Math.abs(strike.rightHandX-recover0.rightHandX)<1e-9);
check('回復後は通常姿勢へ戻る', Math.abs(recovered.rightShoulderZ)<1e-9 && Math.abs(recovered.rightShoulderX)<1e-9 && Math.abs(recovered.torsoX)<1e-9);
check('回復中は姿勢が通常状態へ向かって戻る', Math.abs(recoverHalf.rightShoulderZ)<Math.abs(recover0.rightShoulderZ) && Math.abs(recoverHalf.rightShoulderX)<Math.abs(recover0.rightShoulderX));
const guardStart = html.indexOf('  function makeCampGuard(info){');
const guardEnd = html.indexOf('  const ENEMY_MAKERS =', guardStart);
const guard = html.slice(guardStart, guardEnd);
check('番人専用アニメーションでポーズ関数を使用', guard.includes('const pose = campGuardAttackPose(en)') && guard.includes('arms[1].shoulder.rotation') && guard.includes('arms[1].hand.rotation'));
check('攻撃判定とタイミングを変更していない', fs.readFileSync(path.join(__dirname, '..', 'public/shared.js'), 'utf8').includes("lunge: { trigger: 2.65, windup: 0.62, dur: 0.16, speed: 0, hitR: 1.65, hurt: 9, recover: 0.8, cd: 1.4, dash: false }"));
if (failures) process.exit(1);
console.log('Camp guard forward attack animation tests passed.');
