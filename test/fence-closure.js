'use strict';
const Shared = require('../public/shared.js');
const SaveFormat = require('../public/save-format.js');
let failures = 0;
function check(name, condition) {
  console.log((condition ? 'PASS ' : 'FAIL ') + name);
  if (!condition) failures++;
}
function near(a, b, eps = 0.03) { return Math.abs(a - b) <= eps; }
function distance(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }

// U字に近い3枚の柵。最後の開いた端から最初の端までは約2.06m。
const y = Shared.islandHeight(11, 11);
const structures = [
  { sid:1, buildId:'fence', x:11, y, z:10, ry:0 },
  { sid:2, buildId:'fence', x:12, y, z:11, ry:-Math.PI / 2 },
  { sid:3, buildId:'fence', x:11.25, y, z:12, ry:0, length:1.5 },
];
const startEndpoint = { x:10, y, z:10 };
const lastEndpoint = { x:10.5, y, z:12 };
const chain = { firstSid:1, lastSid:3, startEndpoint, lastEndpoint };
const requestedRy = Math.atan2(-2, 0.5);
const cursor = {
  x:lastEndpoint.x - Math.cos(requestedRy),
  z:lastEndpoint.z + Math.sin(requestedRy),
};
const closure = Shared.snapBuildPlacement('fence', cursor.x, y, cursor.z, requestedRy, structures, chain);
check('最後の柵を始点へ閉じるプレビューが出る', closure.closingLoop === true && closure.snapped === true);
check('始点と終点の間の長さを自動計算する', Number.isFinite(closure.length) && near(closure.length, distance(startEndpoint, lastEndpoint)));
const closureEnds = Shared.fenceEndpoints({ buildId:'fence', ...closure });
const joins = (near(distance(closureEnds[0], startEndpoint), 0) && near(distance(closureEnds[1], lastEndpoint), 0)) ||
  (near(distance(closureEnds[1], startEndpoint), 0) && near(distance(closureEnds[0], lastEndpoint), 0));
check('計算された柵の両端が始点・終点に合う', joins);
check('隣の柵の中心が近くても、実際に交差しなければ閉じる設置を許可',
  Shared.checkPlacement('fence', closure.x, closure.y, closure.z, structures, closure.ry, closure.length) === null);

const longGapStructures = [
  { sid:11, buildId:'fence', x:11, y, z:10, ry:0 },
  { sid:12, buildId:'fence', x:12, y, z:11, ry:-Math.PI / 2 },
  { sid:13, buildId:'fence', x:11.25, y, z:14.2, ry:0, length:1.5 },
];
const longGapStart = Shared.fenceEndpoints(longGapStructures[0])[0];
const longGapEnd = Shared.fenceEndpoints(longGapStructures[2])[1];
const longGapCursor = { x:(longGapStart.x + longGapEnd.x)/2, z:(longGapStart.z + longGapEnd.z)/2 };
check('最後の隙間が1枚の上限を超える場合は無理に伸ばさない',
  !Shared.snapBuildPlacement('fence', longGapCursor.x, y, longGapCursor.z, requestedRy, longGapStructures, null).closingLoop);
const noChain = Shared.snapBuildPlacement('fence', cursor.x, y, cursor.z, requestedRy, structures, null);
check('一度設置を中断しても、既存柵の開いた端を検出して囲いを閉じられる', noChain.closingLoop === true && near(noChain.length, distance(startEndpoint, lastEndpoint)));
const farCursor = Shared.snapBuildPlacement('fence', cursor.x + 4, y, cursor.z + 4, requestedRy, structures, null);
check('離れた場所では既存柵の間へ勝手に吸着しない', !farCursor.closingLoop);

const sim = new Shared.WorldSim({ seed:12345 });
const sent = [], broadcast = [];
sim.out = { sendTo(id, msg) { sent.push({ id, msg }); }, broadcast(msg) { broadcast.push(msg); } };
sim.addClient(7);
sim.handle(7, { t:'join', name:'fence-test', key:'fence-test-key' });
sim.handle(7, { t:'state', x:20, y:Shared.islandHeight(20,20), z:20, ry:0, cave:-1, f:0 });
sim.handle(7, { t:'place', buildId:'fence', x:20, y:Shared.islandHeight(20,20), z:20, ry:0, length:1.35 });
const savedFence = [...sim.structures.values()][0];
check('サーバーが自動調整された柵の長さを受け付ける', !!savedFence && savedFence.length === 1.35);
check('配置通知に柵の長さが含まれ、他プレイヤーへ同期できる', broadcast.some(m => m.t === 'placed' && m.length === 1.35));
sim.handle(7, { t:'place', buildId:'fence', x:24, y:Shared.islandHeight(24,20), z:20, ry:0, length:4 });
check('許容範囲を超える柵の長さは拒否する', sent.some(v => v.id === 7 && v.msg.t === 'placeDenied' && v.msg.reason === 'bad'));

const world = { layoutVersion:Shared.WORLD_LAYOUT_VERSION, seed:123, nextSid:2,
  structures:[{ sid:1, buildId:'fence', x:20, y:Shared.islandHeight(20,20), z:20, ry:0, owner:'test', length:1.35 }], chests:[] };
const normalized = SaveFormat.normalizeWorld(world);
check('短く調整された柵の長さをバックアップへ保存できる', normalized.structures[0].length === 1.35);
const restoredSim = new Shared.WorldSim({ saved:sim.serialize() });
check('ワールド再起動後も調整済みの柵の長さを保持する', [...restoredSim.structures.values()].some(s => s.length === 1.35));
let rejectsBadLength = false;
try { SaveFormat.normalizeWorld(Object.assign({}, world, { structures:[Object.assign({}, world.structures[0], { length:3.2 })] })); }
catch (_) { rejectsBadLength = true; }
check('バックアップ経由で不正な長さが復元されない', rejectsBadLength);

if (failures) process.exitCode = 1;
else console.log('全13項目合格');
