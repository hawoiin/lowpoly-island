// 敵の野営地(人型の番人・戦利品の箱)の単体テスト。WebSocketライブラリなしで実行できる。
'use strict';
const Shared = require('../public/shared.js');
const SaveFormat = require('../public/save-format.js');
let failures = 0;
function check(name, ok, detail) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : ' ' + (detail || '')));
  if (!ok) failures++;
}
const SEEDS = [1, 7, 0x1234abcd, 424242];
for (let i = 1; i <= 40; i++) SEEDS.push((i * 2654435761) >>> 0);

// ---- 置き場所 ----
{
  let ok = true, why = '';
  for (const seed of SEEDS) {
    const C = Shared.getCampLocation(seed);
    if (!C) { ok = false; why = 'seed ' + seed + ' 野営地が置けない'; continue; }
    if (JSON.stringify(Shared.getCampLocation(seed)) !== JSON.stringify(C)) { ok = false; why = 'seed ' + seed + ' 結果が毎回違う'; }
    if (Math.abs(Shared.islandHeight(C.x, C.z) - C.y) > 0.02) { ok = false; why = 'seed ' + seed + ' y が地面と違う'; }
    if (Shared.isInsideCaveArea(C.x, C.z, 12)) { ok = false; why = 'seed ' + seed + ' 洞窟に近い'; }
    if (Math.hypot(C.x, C.z - 6) < 60) { ok = false; why = 'seed ' + seed + ' 初期位置に近い'; }
    if (Shared.getRuinLocations(seed, 6).some(r => Math.hypot(r.x - C.x, r.z - C.z) < 16)) { ok = false; why = 'seed ' + seed + ' 遺跡に近い'; }
    const boss = Shared.getBossHome(seed), lh = Shared.getLighthouseLocation(seed);
    if (boss && Math.hypot(boss.x - C.x, boss.z - C.z) < 26) { ok = false; why = 'seed ' + seed + ' ボスの持ち場に近い'; }
    if (lh && Math.hypot(lh.x - C.x, lh.z - C.z) < 24) { ok = false; why = 'seed ' + seed + ' 灯台に近い'; }
    if (Shared.getSpringLocations(seed, 2).some(s => Math.hypot(s.x - C.x, s.z - C.z) < 30)) { ok = false; why = 'seed ' + seed + ' 泉に近い'; }
    for (let k = 0; k < 12; k++) {
      const a = k / 12 * Math.PI * 2;
      if (Shared.islandHeight(C.x + Math.cos(a) * Shared.CAMP.footR, C.z + Math.sin(a) * Shared.CAMP.footR) < 0.9) { ok = false; why = 'seed ' + seed + ' 陣地の外周が海'; }
    }
    const chest = Shared.campChestSpot(C);
    if (Math.hypot(chest.x - C.x, chest.z - C.z) > 2 || chest.camp !== true) { ok = false; why = 'seed ' + seed + ' 箱の位置'; }
  }
  check('どのseedでも、野営地は洞窟・遺跡・ボス・灯台・泉を避けた陸に決まり、毎回同じ場所になる(' + SEEDS.length + ' seed)', ok, why);
}

// 泉の配置方式だけを変えても、既存seedの野営地位置を不用意に移動させない。
{
  const baseline = [
    { seed: 1, x: -120.47, y: 4.01, z: -197.51, ry: 1.3437656721597084 },
    { seed: 7, x: 152.70, y: 5.08, z: 141.47, ry: 3.941833937845661 },
    { seed: 0x1234abcd, x: -238.70, y: 2.51, z: -20.39, ry: 6.124097779059763 },
    { seed: 424242, x: 151.35, y: 5.40, z: 138.77, ry: 6.049842479948501 },
  ];
  let ok = true, why = '';
  for (const b of baseline) {
    const c = Shared.getCampLocation(b.seed);
    if (!c || Math.abs(c.x - b.x) > 0.001 || Math.abs(c.y - b.y) > 0.001 ||
        Math.abs(c.z - b.z) > 0.001 || Math.abs(c.ry - b.ry) > 1e-9) {
      ok = false; why = 'seed ' + b.seed + ' の野営地位置が従来と異なる'; break;
    }
  }
  check('泉の再配置だけでは既存の野営地位置を変えない', ok, why);
}

// ---- 見張り ----
const seed = 7;
const sim = new Shared.WorldSim({ seed });
const C = sim.campLocation;
const guards = sim.enemies.filter(e => e.camp);
check('野営地の見張りはプレイヤー風デフォルメの人型番人4体で、敵のidは既存の敵の後ろに付く',
  guards.length === 4 && guards.every(e => e.kind === 'campGuard' && Shared.ENEMY_KINDS[e.kind] && Shared.ENEMY_KINDS[e.kind].hp === 10) &&
  guards.every(e => Shared.isCampEnemyId(e.id) && e.id >= Shared.ENEMY_CAMP_START) && sim.enemies.filter(e => !e.camp && !e.grotto).length === Shared.ENEMY_CAMP_START);
check('見張りは野営地のまわりに生きて出現する', guards.every(e => e.alive && Math.hypot(e.x - C.x, e.z - C.z) < 5.5));
check('野営地以外の既存の敵の並び・数は維持される', Shared.ENEMY_CAMP_START === Shared.ENEMY_WOLF_COUNT + Shared.ENEMY_BOAR_COUNT + Shared.ENEMY_LIZARD_COUNT + Shared.ENEMY_CRAB_COUNT + Shared.ENEMY_JELLY_COUNT + Shared.ENEMY_CLASSIC_WOLF_COUNT + Shared.ENEMY_CLASSIC_BOAR_COUNT && Shared.ENEMY_GROTTO_START === Shared.ENEMY_CAMP_START + 4 && Shared.ENEMY_ORDER.length === Shared.ENEMY_GROTTO_START + 3);
check('野営地以外の敵は野営地の見張りとして数えられない', !Shared.isCampEnemyId(0) && !Shared.isCampEnemyId(Shared.ENEMY_CAMP_START - 1) && !Shared.isCampEnemyId(Shared.ENEMY_ORDER.length));
{
  let maxD = 0;
  for (let i = 0; i < 1200; i++) { // 60秒、誰もいない間も見張りは持ち場から離れない
    sim.tick(0.05);
    for (const e of guards) if (e.alive) maxD = Math.max(maxD, Math.hypot(e.x - C.x, e.z - C.z));
  }
  check('誰もいなくても見張りは野営地から離れない(60秒)', maxD < 8, 'max=' + maxD.toFixed(2));
}

// ---- 人型番人の近接AI ----
{
  const hurts = [], bcast = [];
  const s = new Shared.WorldSim({ seed: 7 });
  s.out = { sendTo: (id, m) => hurts.push([id, m]), broadcast: m => bcast.push(m) };
  const r = s.enemies.find(e => e.camp && e.kind === 'campGuard');
  for (const e of s.enemies) if (e !== r) { e.alive = false; e.respawnAt = Infinity; }
  s.addClient(8);
  s.handle(8, { t: 'join', name: 'tester', key: 'camp-guard-test' });
  s.handle(8, { t: 'state', x: r.x + 1.1, y: Shared.islandHeight(r.x + 1.1, r.z), z: r.z, ry: Math.PI, cave: -1, f: 0 });
  for (let i=0;i<80;i++) s.tick(0.05);
  check('人型番人は近づいたプレイヤーへ接近し、棍棒の予備動作・攻撃ステートを使う', r.alive && r.kind === 'campGuard' && bcast.some(m => m.t === 'eatk' && m.id === r.id && m.mv === Shared.MOVE_ID.lunge));
  check('人型番人の近接攻撃は既存のhurt通信でプレイヤーへダメージを送る', hurts.some(([id,m]) => id === 8 && m.t === 'hurt' && m.amount === Shared.ENEMY_KINDS.campGuard.moves.lunge.hurt));
}

// ---- 戦利品の箱 ----
{
  const opened = [];
  sim.out = { sendTo() {}, broadcast: m => { if (m.t === 'chestOpened') opened.push(m); } };
  const idx = sim.chestLocations.findIndex(c => c.camp);
  check('宝箱の最後(5番)が野営地の箱', idx === 5 && sim.chestLocations.length === 7);
  const chest = sim.chestLocations[idx];
  sim.addClient(1); sim.handle(1, { t: 'join', name: 'a', key: 'camp-1' });
  const c = sim.clients.get(1);
  c.hasState = true; c.x = chest.x; c.z = chest.z; c.y = chest.y;
  sim.handle(1, { t: 'chest', idx });
  check('見張りが残っている間は箱を開けられない', opened.length === 0 && !sim.chests.has(idx));
  for (const e of guards.slice(0, 3)) e.alive = false; // 1体残す
  sim.handle(1, { t: 'chest', idx });
  check('見張りが1体でも残っていれば開けられない', opened.length === 0 && !sim.chests.has(idx));
  guards[3].alive = false;
  c.x = chest.x + 30;
  sim.handle(1, { t: 'chest', idx });
  check('見張りを全員倒しても、箱から離れていれば開けられない', opened.length === 0);
  c.x = chest.x;
  sim.handle(1, { t: 'chest', idx });
  check('見張りを全員倒して箱のそばなら開けられ、全員へ配信される', opened.some(m => m.idx === idx) && sim.chests.has(idx));
}

// ---- 見張りの再出現(箱は開封済みのまま) ----
{
  const s2 = new Shared.WorldSim({ seed });
  const gs = s2.enemies.filter(e => e.camp);
  for (const e of gs) { e.alive = false; e.respawnAt = Date.now() - 1; }
  s2.tick(0.05);
  check('倒した見張りは時間がたつと野営地に再出現する', gs.every(e => e.alive && Math.hypot(e.x - s2.campLocation.x, e.z - s2.campLocation.z) < 5.5));
}

// ---- セーブ互換 ----
{
  const old = new Shared.WorldSim({ saved: { layoutVersion: Shared.WORLD_LAYOUT_VERSION, seed, nextSid: 1, structures: [], chests: [0, 1, 2, 3, 4] } });
  check('宝箱5個まで開けた古いセーブを読み込んでも、野営地の箱(5番)は未開封のまま', old.chests.size === 5 && !old.chests.has(5) && old.chestLocations.length === 7);
  const world = i => ({ layoutVersion: Shared.WORLD_LAYOUT_VERSION, seed: 123456, nextSid: 1, structures: [], chests: i });
  const player = { inv:{ wood:0, stone:0, herb:0, crystal:0, relic:0 }, collected:{}, discovered:[], swordLv:1, held:{ campfire:0, hut:0, cabin:0, fence:0, floor:0 }, claimed:{ plant:false, mineral:false, relic:false, underwater:false }, codexDone:false, seenCaves:[] };
  const settings = { volume:0.7, sens:1, shake:true };
  let okAll = true;
  for (const chests of [[4], [5], [0, 1, 2, 3, 4, 5]]) {
    try { SaveFormat.parseBundle(JSON.stringify(SaveFormat.createBundle(player, settings, world(chests)))); } catch (e) { okAll = false; console.log('  読み込めない', JSON.stringify(chests), e.message); }
  }
  check('JSONバックアップは灯台(4番)・野営地(5番)の宝箱の開封状態も読み戻せる', okAll);
  let rejected = false;
  try { SaveFormat.parseBundle(JSON.stringify(SaveFormat.createBundle(player, settings, world([7])))); } catch (_) { rejected = true; }
  check('存在しない宝箱の番号(7番)は拒否される', rejected);
}

console.log(failures ? 'FAILED: ' + failures : 'ALL PASSED (camp)');
process.exit(failures ? 1 : 0);
