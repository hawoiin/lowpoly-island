// 湧き水の泉(回復スポット)の位置ルールのテスト。WebSocketライブラリなしで実行できる。
'use strict';
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
      for (let k = 0; k < 12; k++) { // 池のふちまで陸でほぼ平ら
        const a = k / 12 * Math.PI * 2, h = Shared.islandHeight(s.x + Math.cos(a) * SP.footR, s.z + Math.sin(a) * SP.footR);
        if (h < 0.9 || Math.abs(h - s.y) > 0.7) { ok = false; why = 'seed ' + seed + ' 池のふちが海か急斜面'; }
      }
    }
    if (Math.hypot(list[0].x - list[1].x, list[0].z - list[1].z) < 60) { ok = false; why = 'seed ' + seed + ' 泉どうしが近い'; }
  }
  check('どのseedでも、泉は洞窟・遺跡・ボス・灯台を避けた平らな陸に2つ、毎回同じ場所に決まる(' + SEEDS.length + ' seed)', ok, why);
}
check('回復量は焚き火(6/秒)より弱い', SP.healRate > 0 && SP.healRate < 6, String(SP.healRate));
check('個数の指定は0〜4に収まる', Shared.getSpringLocations(1, 0).length === 0 && Shared.getSpringLocations(1, 99).length <= 4);

console.log(failures ? 'FAILED: ' + failures : 'ALL PASSED (spring)');
process.exit(failures ? 1 : 0);
