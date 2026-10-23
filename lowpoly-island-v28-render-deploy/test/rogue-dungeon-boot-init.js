// 回帰テスト：ダンジョン生成中の rockRim で引数 rx/rz を
// 同名の const で隠してしまい、初期化前参照になる問題を検出する。
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const start = html.indexOf('      function rockRim(cx,cz,rx,rz,n,floorY=0){');
const end = html.indexOf('\n      rockRim(0,12,19,16,26,0);', start);
if (start < 0 || end < 0) throw new Error('rockRim function block not found');
const functionSource = html.slice(start, end);
const testSource = `
  const rockMats = ['stoneA','stoneB','stoneC'];
  const placed = [];
  function rogueRockOverlapsPassage(){ return false; }
  function addRock(...args){ placed.push(args); }
  ${functionSource}
  rockRim(10,20,5,4,12,2);
  globalThis.__placed = placed;
`;
const deterministicMath = Object.create(Math);
deterministicMath.random = () => 0.5;
const context = { Math: deterministicMath, globalThis: {} };
vm.runInNewContext(testSource, context, { timeout: 1000 });
const placed = context.globalThis.__placed;
if (!Array.isArray(placed) || placed.length < 10) throw new Error(`rockRim placed too few rocks: ${placed?.length}`);
for (const rock of placed) {
  const [x,y,z,rx,ry,rz] = rock;
  if (![x,y,z,rx,ry,rz].every(Number.isFinite)) throw new Error('rockRim generated non-finite rock coordinates or size');
  if (rx <= 0 || ry <= 0 || rz <= 0) throw new Error('rockRim generated non-positive rock scale');
}
// rx/rz 引数（広間の半径）から置き位置を計算していることも確認。
if (Math.abs(placed[0][0] - 18.95) > 1e-6 || Math.abs(placed[0][2] - 20) > 1e-6) {
  throw new Error(`rockRim did not use the room radii correctly: first=${placed[0][0]},${placed[0][2]}`);
}
if (!/const rockRx=/.test(functionSource) || !/rockRz=/.test(functionSource)) {
  throw new Error('rock size variables must not shadow the rx/rz room-radius parameters');
}
console.log('PASS rogue dungeon startup: rockRim initializes without temporal-dead-zone error');
console.log(`PASS rogue dungeon startup: ${placed.length} rocks have valid positions and scales`);
