'use strict';
const Shared = require('../public/shared.js');
let failures = 0;
function check(name, condition) {
  console.log((condition ? 'PASS ' : 'FAIL ') + name);
  if (!condition) failures++;
}
function approx(a, b, eps = 0.025) { return Math.abs(a - b) <= eps; }

const fence90 = { buildId:'fence', x:0, z:0, ry:Math.PI / 2 };
const hit90 = Shared.resolveFencePoint(0.12, 0.5, 0.35, [fence90]);
check('90度に回した柵の衝突面は見た目の向きと一致する', approx(hit90.x, 0.53) && approx(hit90.z, 0.5));

const fenceMinus90 = { buildId:'fence', x:0, z:0, ry:-Math.PI / 2 };
const hitMinus90 = Shared.resolveFencePoint(0.12, 0.5, 0.35, [fenceMinus90]);
check('-90度に回した柵でも衝突面が正しい', approx(hitMinus90.x, 0.53) && approx(hitMinus90.z, 0.5));

const fence45 = { buildId:'fence', x:10, z:10, ry:Math.PI / 4 };
const c = Math.cos(fence45.ry), sn = Math.sin(fence45.ry);
const inputLocal = { x:0.2, z:0.1 };
const inputWorld = {
  x:fence45.x + inputLocal.x*c + inputLocal.z*sn,
  z:fence45.z - inputLocal.x*sn + inputLocal.z*c,
};
const hit45 = Shared.resolveFencePoint(inputWorld.x, inputWorld.z, 0.35, [fence45]);
const dx = hit45.x - fence45.x, dz = hit45.z - fence45.z;
const localZ = sn*dx + c*dz;
const localX = c*dx - sn*dz;
const clampedX = Math.max(-0.95, Math.min(0.95, localX));
check('斜め45度の柵からも必要な距離だけ押し出す', Math.hypot(localX-clampedX, localZ) >= 0.35 + 0.18 - 1e-6);

const centerline = Shared.resolveFencePoint(0, 0, 0.35, [{ buildId:'fence', x:0, z:0, ry:0 }]);
check('柵の中心線に完全に重なっても押し出し方向がゼロにならない', approx(Math.abs(centerline.z), 0.53));

const tunneled = Shared.moveFencePoint(-0.7, 0, 1.4, 0, 0.35, [fence90], 0.18);
check('1フレーム分の大きな移動でも柵を飛び越えない', tunneled.x <= -0.52);

const slid = Shared.moveFencePoint(-0.7, -1.5, 1.4, 2.5, 0.35, [fence90], 0.18);
check('柵にぶつかった斜め移動は反対側へ抜けず横方向へ滑る', slid.x <= -0.52 && slid.z > 0.6);

const clear = Shared.resolveFencePoint(0, 0.7, 0.35, [{ buildId:'fence', x:0, z:0, ry:0 }]);
check('柵から十分離れた位置は動かさない', approx(clear.x, 0) && approx(clear.z, 0.7));
const invalidDelta = Shared.moveFencePoint(3, 4, Infinity, NaN, 0.35, [], 0.18);
check('不正な移動量でも無限ループせず有限座標を返す', Number.isFinite(invalidDelta.x) && Number.isFinite(invalidDelta.z) && invalidDelta.x === 3 && invalidDelta.z === 4);

const sim = new Shared.WorldSim({ seed:12345 });
sim.structures.set(1, { sid:1, buildId:'fence', x:0, y:0, z:0, ry:Math.PI/2, owner:'' });
const enemy = { x:0.1, z:0.5 };
sim.fenceCollide(enemy, 0.4);
check('サーバー側の敵・ボス用柵判定も共通の回転処理を使う', approx(enemy.x, 0.58) && approx(enemy.z, 0.5));

if (failures) process.exitCode = 1;
else console.log('全9項目合格');
