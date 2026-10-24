// 海底洞窟(海底の岩の小部屋・クラゲ・奥の宝箱)の単体テスト。WebSocketライブラリなしで実行できる。
'use strict';
const Shared = require('../public/shared.js');
const SaveFormat = require('../public/save-format.js');
let failures = 0;
function check(name, ok, detail) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : ' ' + (detail || '')));
  if (!ok) failures++;
}
const GR = Shared.GROTTO;
const SEEDS = [1, 7, 0x1234abcd, 424242];
for (let i = 1; i <= 40; i++) SEEDS.push((i * 2654435761) >>> 0);

// ---- 置き場所 ----
{
  let ok = true, why = '';
  for (const seed of SEEDS) {
    const G = Shared.getGrottoLocation(seed);
    if (!G) { ok = false; why = 'seed ' + seed + ' 洞窟が置けない'; continue; }
    if (JSON.stringify(Shared.getGrottoLocation(seed)) !== JSON.stringify(G)) { ok = false; why = 'seed ' + seed + ' 結果が毎回違う'; }
    if (Math.abs(Shared.islandHeight(G.x, G.z) - G.y) > 0.02) { ok = false; why = 'seed ' + seed + ' y が海底と違う'; }
    if (G.y + GR.top > -0.9) { ok = false; why = 'seed ' + seed + ' 天井が水面に近すぎる'; }
    if (G.y < -9.5) { ok = false; why = 'seed ' + seed + ' クラゲが入れない深さ'; }
    if (Shared.isInsideCaveArea(G.x, G.z, 12)) { ok = false; why = 'seed ' + seed + ' 洞窟(陸)に近い'; }
    const layout = Shared.getUnderwaterLayout(seed);
    const near = [layout.shipwreck, layout.treasure].concat(layout.resources).find(o => Math.hypot(o.x - G.x, o.z - G.z) < GR.footR + 1.5);
    if (near) { ok = false; why = 'seed ' + seed + ' 沈没船・海底の採集物と重なる'; }
    for (let k = 0; k < 12; k++) {
      const a = k / 12 * Math.PI * 2, h = Shared.islandHeight(G.x + Math.cos(a) * GR.footR, G.z + Math.sin(a) * GR.footR);
      if (Math.abs(h - G.y) > 0.92) { ok = false; why = 'seed ' + seed + ' 足元が平らでない'; }
    }
  }
  check('どのseedでも、洞窟は天井まで水中に収まる平らな海底に、沈没船・採集物を避けて決まり、毎回同じ場所になる(' + SEEDS.length + ' seed)', ok, why);
}

// ---- 壁の当たり判定: 入口だけが通れる ----
{
  let ok = true, why = '';
  for (const seed of [1, 7, 424242]) {
    const G = Shared.getGrottoLocation(seed), solids = Shared.grottoWallSolids(G);
    const blocked = (x, z) => solids.some(o => Math.hypot(o.x - x, o.z - z) < o.r + 0.35); // プレイヤー半径 0.35
    // 入口の向きは通れる(外から中央まで一直線)
    for (let t = GR.R + 3; t >= 0; t -= 0.1) {
      if (blocked(G.x + Math.cos(G.ry) * t, G.z + Math.sin(G.ry) * t)) { ok = false; why = 'seed ' + seed + ' 入口がふさがっている t=' + t.toFixed(1); break; }
    }
    // 入口以外の向きは、輪のところで必ず止まる
    for (let k = 0; k < 72; k++) {
      const a = G.ry + (k / 72) * Math.PI * 2;
      const diff = Math.abs(((a - G.ry + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (diff < GR.gap + 0.35) continue; // 入口まわりは除く
      let hit = false;
      for (let t = GR.R + 3; t >= 0 && !hit; t -= 0.1) if (blocked(G.x + Math.cos(a) * t, G.z + Math.sin(a) * t)) hit = true;
      if (!hit) { ok = false; why = 'seed ' + seed + ' 壁に抜け道 a=' + (a - G.ry).toFixed(2); break; }
    }
  }
  check('壁の当たり判定は入口以外ふさがり、入口は(体の太さを入れても)通れる', ok, why);
}

// ---- クラゲ ----
const seed = 7;
const sim = new Shared.WorldSim({ seed });
const G = sim.grottoLocation;
const jellies = sim.enemies.filter(e => e.grotto);
check('洞窟のクラゲは3匹で、敵のidは野営地の見張りの後ろに付く',
  jellies.length === 3 && jellies.every(e => e.kind === 'jelly' && Shared.isGrottoEnemyId(e.id) && e.id >= Shared.ENEMY_GROTTO_START) &&
  !Shared.isGrottoEnemyId(Shared.ENEMY_GROTTO_START - 1) && !Shared.isGrottoEnemyId(Shared.ENEMY_ORDER.length) && !Shared.isCampEnemyId(Shared.ENEMY_GROTTO_START));
check('クラゲは洞窟の中(壁の輪の内側)に生きて出現する', jellies.every(e => e.alive && Math.hypot(e.x - G.x, e.z - G.z) < GR.R - 1.5));
{
  let maxD = 0;
  for (let i = 0; i < 1200; i++) { // 60秒、誰もいない間もクラゲは洞窟から出ない
    sim.tick(0.05);
    for (const e of jellies) if (e.alive) maxD = Math.max(maxD, Math.hypot(e.x - G.x, e.z - G.z));
  }
  check('誰もいなければクラゲは洞窟の中にとどまる(60秒)', maxD < GR.R - 0.8, 'max=' + maxD.toFixed(2));
}
{
  const s2 = new Shared.WorldSim({ seed });
  const js = s2.enemies.filter(e => e.grotto);
  for (const e of js) { e.alive = false; e.respawnAt = Date.now() - 1; }
  s2.tick(0.05);
  check('倒したクラゲは時間がたつと洞窟の中に再出現する', js.every(e => e.alive && Math.hypot(e.x - s2.grottoLocation.x, e.z - s2.grottoLocation.z) < GR.R - 1.5));
}

// ---- 奥の宝箱(鍵はクライアント側で不要。サーバーは距離と高さを見る) ----
{
  const opened = [];
  sim.out = { sendTo() {}, broadcast: m => { if (m.t === 'chestOpened') opened.push(m); } };
  const idx = sim.chestLocations.findIndex(c => c.grotto);
  check('既存index 6の海底洞窟の奥の宝箱は位置・番号を維持し、追加野営地の箱は末尾に置かれる', idx === 6 && sim.chestLocations.length === 9 && sim.chestLocations[7].campIndex === 1 && sim.chestLocations[8].campIndex === 2 && sim.chestLocations[idx].underwater === true &&
    Math.hypot(sim.chestLocations[idx].x - G.x, sim.chestLocations[idx].z - G.z) < GR.R - 1 &&
    ((sim.chestLocations[idx].x - G.x) * Math.cos(G.ry) + (sim.chestLocations[idx].z - G.z) * Math.sin(G.ry)) < 0);
  const chest = sim.chestLocations[idx];
  sim.addClient(1); sim.handle(1, { t: 'join', name: 'a', key: 'grotto-1' });
  const c = sim.clients.get(1);
  c.hasState = true; c.x = chest.x; c.z = chest.z; c.y = chest.y + 8; // 水面の上
  sim.handle(1, { t: 'chest', idx });
  check('水面の上(高さが離れた所)からは洞窟の宝箱を開けられない', opened.length === 0 && !sim.chests.has(idx));
  c.y = chest.y + 0.5; c.x = chest.x + 30;
  sim.handle(1, { t: 'chest', idx });
  check('洞窟から離れていれば開けられない', opened.length === 0);
  c.x = chest.x;
  sim.handle(1, { t: 'chest', idx });
  check('宝箱のそばまで潜れば開けられ、全員へ配信される', opened.some(m => m.idx === idx) && sim.chests.has(idx));
}

// ---- セーブ互換 ----
{
  const old = new Shared.WorldSim({ saved: { layoutVersion: Shared.WORLD_LAYOUT_VERSION, seed, nextSid: 1, structures: [], chests: [0, 1, 2, 3, 4, 5] } });
  check('宝箱6個まで開けた古いセーブを読み込んでも、洞窟の宝箱(6番)は未開封のまま(追加分は末尾)', old.chests.size === 6 && !old.chests.has(6) && old.chestLocations.length === 9);
  const world = i => ({ layoutVersion: Shared.WORLD_LAYOUT_VERSION, seed: 123456, nextSid: 1, structures: [], chests: i });
  const player = { inv:{ wood:0, stone:0, herb:0, crystal:0, relic:0 }, collected:{}, discovered:[], swordLv:1, held:{ campfire:0, hut:0, cabin:0, fence:0, floor:0 }, claimed:{ plant:false, mineral:false, relic:false, underwater:false }, codexDone:false, seenCaves:[] };
  const settings = { volume:0.7, sens:1, shake:true };
  let okAll = true;
  for (const chests of [[6], [0, 1, 2, 3, 4, 5, 6]]) {
    try { SaveFormat.parseBundle(JSON.stringify(SaveFormat.createBundle(player, settings, world(chests)))); } catch (e) { okAll = false; console.log('  読み込めない', JSON.stringify(chests), e.message); }
  }
  check('JSONバックアップは洞窟(6番)の宝箱の開封状態も読み戻せる', okAll);
  let rejected = false;
  try { SaveFormat.parseBundle(JSON.stringify(SaveFormat.createBundle(player, settings, world([9])))); } catch (_) { rejected = true; }
  check('存在しない宝箱の番号(9番)は拒否される', rejected);
}

console.log(failures ? 'FAILED: ' + failures : 'ALL PASSED (grotto)');
process.exit(failures ? 1 : 0);
