// 湧き水の泉(回復スポット)の位置ルールのテスト。WebSocketライブラリなしで実行できる。
'use strict';
const fs = require('fs');
const path = require('path');
const Shared = require('../public/shared.js');
let failures = 0;
function check(name, ok, detail) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : ' ' + (detail || '')));
  if (!ok) failures++;
}
const SP = Shared.SPRING;
const SEEDS = [1, 7, 0x1234abcd, 424242];
for (let i = 1; i <= 40; i++) SEEDS.push((i * 2654435761) >>> 0);

{
  let ok = true, why = '';
  for (const seed of SEEDS) {
    const list = Shared.getSpringLocations(seed, 2);
    if (list.length !== 2) { ok = false; why = 'seed ' + seed + ' 泉が' + list.length + '個'; continue; }
    if (JSON.stringify(Shared.getSpringLocations(seed, 2)) !== JSON.stringify(list)) { ok = false; why = 'seed ' + seed + ' 結果が毎回違う'; }
    const ruins = Shared.getRuinLocations(seed, 6), boss = Shared.getBossHome(seed), lh = Shared.getLighthouseLocation(seed);
    for (const s of list) {
      if (Math.abs(Shared.islandHeight(s.x, s.z) - s.y) > 0.02) { ok = false; why = 'seed ' + seed + ' y が地面と違う'; }
      if (s.y < 1.6) { ok = false; why = 'seed ' + seed + ' 低すぎる(' + s.y + ')'; }
      if (Shared.isInsideCaveArea(s.x, s.z, 12)) { ok = false; why = 'seed ' + seed + ' 洞窟に近い'; }
      if (Math.hypot(s.x, s.z - 6) < 30) { ok = false; why = 'seed ' + seed + ' 初期位置に近い'; }
      if (ruins.some(r => Math.hypot(r.x - s.x, r.z - s.z) < 14)) { ok = false; why = 'seed ' + seed + ' 遺跡に近い'; }
      if (boss && Math.hypot(boss.x - s.x, boss.z - s.z) < 24) { ok = false; why = 'seed ' + seed + ' ボスの持ち場に近い'; }
      if (lh && Math.hypot(lh.x - s.x, lh.z - s.z) < 22) { ok = false; why = 'seed ' + seed + ' 灯台に近い'; }
      const terrainHeights = [Shared.islandHeight(s.x, s.z)];
      for (const [radius, samples] of [[SP.footR * 0.5, 8], [SP.footR, 16]]) {
        for (let k = 0; k < samples; k++) { // 泉の内側と外周の地形を確認
          const a = k / samples * Math.PI * 2;
          const h = Shared.islandHeight(s.x + Math.cos(a) * radius, s.z + Math.sin(a) * radius);
          if (h < 0.9) { ok = false; why = 'seed ' + seed + ' 池のふちが海'; }
          terrainHeights.push(h);
        }
      }
      const relief = Math.max(...terrainHeights) - Math.min(...terrainHeights);
      if (relief > 0.380001) { ok = false; why = 'seed ' + seed + ' 泉の footprint の高低差が大きい(' + relief.toFixed(3) + 'm)'; }
    }
    if (Math.hypot(list[0].x - list[1].x, list[0].z - list[1].z) < 60) { ok = false; why = 'seed ' + seed + ' 泉どうしが近い'; }
  }
  check('どのseedでも、泉は洞窟・遺跡・ボス・灯台を避け、footprint全体の高低差38cm以内の陸に2つ、毎回同じ場所に決まる(' + SEEDS.length + ' seed)', ok, why);
}
// 泉の縁の装飾で使う高さ差分が、指定したワールド座標の地形と一致することを確認。
{
  let ok = true, why = '';
  for (const seed of SEEDS.slice(0, 12)) {
    for (const sp of Shared.getSpringLocations(seed, 2)) {
      for (let i = 0; i < 11; i++) {
        const a = i / 11 * Math.PI * 2;
        const x = sp.x + Math.cos(a) * (2.7 + (i % 3) * 0.17);
        const z = sp.z + Math.sin(a) * (2.7 + (i % 3) * 0.17);
        const y = sp.y + Shared.springTerrainOffset(sp.y, x, z);
        if (Math.abs(y - Shared.islandHeight(x, z)) > 1e-9) {
          ok = false; why = 'seed ' + seed + ' の縁パーツのYが地形高さと一致しない'; break;
        }
      }
      if (!ok) break;
    }
    if (!ok) break;
  }
  check('泉の縁装飾用の高さ補正が地形の高さと一致する', ok, why);
}
{
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  const calls = (html.match(/Shared\.springTerrainOffset\(/g) || []).length;
  check('縁石と水辺の草の両方が地形高さ補正を使う', calls >= 2, '補正呼び出し=' + calls);
}
check('回復量は焚き火(6/秒)より弱い', SP.healRate > 0 && SP.healRate < 6, String(SP.healRate));
check('個数の指定は0〜4に収まる', Shared.getSpringLocations(1, 0).length === 0 && Shared.getSpringLocations(1, 99).length <= 4);

console.log(failures ? 'FAILED: ' + failures : 'ALL PASSED (spring)');
process.exit(failures ? 1 : 0);
