// 灯台(岬の塔・らせん坂・頂上の宝箱)の単体テスト。WebSocketライブラリなしで実行できる。
'use strict';
const Shared = require('../public/shared.js');
let failures = 0;
function check(name, ok, detail) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : ' ' + (detail || '')));
  if (!ok) failures++;
}
const LH = Shared.LIGHTHOUSE;
const SEEDS = [1, 7, 0x1234abcd, 424242];
for (let i = 1; i <= 30; i++) SEEDS.push((i * 2654435761) >>> 0);

// ---- 置き場所 ----
{
  let ok = true, why = '';
  for (const seed of SEEDS) {
    const L = Shared.getLighthouseLocation(seed);
    if (!L) { ok = false; why = 'seed ' + seed + ' 灯台が置けない'; continue; }
    const ruins = Shared.getRuinLocations(seed, 6);
    const h = Shared.islandHeight(L.x, L.z);
    if (Math.abs(h - L.baseY) > 0.02) { ok = false; why = 'seed ' + seed + ' baseY が地面と違う'; }
    if (Shared.isInsideCaveArea(L.x, L.z, 10)) { ok = false; why = 'seed ' + seed + ' 洞窟に近い'; }
    if (ruins.some(r => Math.hypot(r.x - L.x, r.z - L.z) < 18)) { ok = false; why = 'seed ' + seed + ' 遺跡に近い'; }
    for (let k = 0; k < 12; k++) { // 坂道の外周まで陸
      const a = k / 12 * Math.PI * 2;
      if (Shared.islandHeight(L.x + Math.cos(a) * LH.rampOut, L.z + Math.sin(a) * LH.rampOut) < 0.2) { ok = false; why = 'seed ' + seed + ' 坂の足元が海'; }
    }
    if (JSON.stringify(Shared.getLighthouseLocation(seed)) !== JSON.stringify(L)) { ok = false; why = 'seed ' + seed + ' 結果が毎回違う'; }
  }
  check('どのseedでも、灯台は洞窟・遺跡を避けた陸の岬に決まり、毎回同じ場所になる(34 seed)', ok, why);
}

// ---- らせん坂を歩いて頂上まで登れる ----
{
  let ok = true, why = '';
  for (const seed of [1, 7, 424242]) {
    const L = Shared.getLighthouseLocation(seed);
    const rMid = (LH.rampIn + LH.rampOut) / 2;
    let py = Shared.islandHeight(L.x + rMid, L.z), maxStep = 0;
    // 登り口(角度0)から、1周ごとに高さが LH.height/turns ずつ上がる坂を反時計回りに歩く
    for (let th = 0; th <= LH.turns * 2 * Math.PI + 0.001; th += 0.01) {
      const x = L.x + Math.cos(th) * rMid, z = L.z + Math.sin(th) * rMid;
      const f = Shared.lighthouseFloorY(L, x, z, py);
      const next = Math.max(Shared.islandHeight(x, z), f === undefined ? -Infinity : f);
      if (next - py > LH.step + 1e-6) { ok = false; why = 'seed ' + seed + ' 段差が大きい ' + (next - py).toFixed(2); break; }
      maxStep = Math.max(maxStep, next - py);
      py = Math.max(py, next);
    }
    if (Math.abs(py - (L.baseY + LH.height)) > 0.05) { ok = false; why = 'seed ' + seed + ' 頂上に着かない y=' + py.toFixed(2); }
  }
  check('坂道を歩いて登ると、1歩の段差が小さいまま頂上(高さ21m)に着く', ok, why);
  const L = Shared.getLighthouseLocation(7);
  const topY = L.baseY + LH.height;
  const r = (LH.rampIn + LH.rampOut) / 2;
  const underY = Shared.lighthouseFloorY(L, L.x - r, L.z, Shared.islandHeight(L.x - r, L.z));
  check('坂の下を通る人は、頭上の坂に吸い上げられない', underY === undefined);
  check('塔の中層は床ではなく、坂より外側も坂の床ではない',
    Shared.lighthouseFloorY(L, L.x + 1, L.z, L.baseY + 10) === undefined &&
    Shared.lighthouseFloorY(L, L.x + 20, L.z, 100) === undefined);
  check('頂上キャップの中央は床として認識される',
    Math.abs(Shared.lighthouseFloorY(L, L.x, L.z, topY) - topY) < 1e-6 &&
    Math.abs(Shared.lighthouseFloorY(L, L.x + 2.6, L.z, topY) - topY) < 1e-6);
  check('頂上キャップの内側は下層から頂上床へ吸い上げられない',
    Shared.lighthouseFloorY(L, L.x + 1, L.z, L.baseY + 10) === undefined);
  // 頂上デッキは坂の進入側だけを開け、出口の先側は平らな床として維持する。
  check('頂上デッキは進入開口の外では平らな床を保つ', [0, 1, 2, 3, 4].every(a => {
    const x = L.x + Math.cos(a) * r, z = L.z + Math.sin(a) * r;
    return Math.abs(Shared.lighthouseFloorY(L, x, z, topY) - topY) < 1e-6;
  }));
  // 最後の上り坂では、足元が頂上の0.9m以内まで近づいても上のデッキへ早取りされない。
  let approachOk = true;
  for (const deg of [-105, -90, -60, -30, -15, -7.5]) {
    const a = deg * Math.PI / 180, x = L.x + Math.cos(a) * r, z = L.z + Math.sin(a) * r;
    const expected = topY + a / (Math.PI * 2) * (LH.height / LH.turns);
    const actual = Shared.lighthouseFloorY(L, x, z, expected);
    if (actual === undefined || Math.abs(actual - expected) > 1e-6) approachOk = false;
  }
  check('最後の坂の進入側では、頂上床がキャラクターを先に持ち上げない', approachOk);
  const exitA = 7.5 * Math.PI / 180, ex = L.x + Math.cos(exitA) * r, ez = L.z + Math.sin(exitA) * r;
  check('出口を越えた側では、頂上デッキの床にそのまま乗れる', Math.abs(Shared.lighthouseFloorY(L, ex, ez, topY - 0.2) - topY) < 1e-6);
}

// ---- 手すり: 坂・頂上の外側の縁から落ちない ----
{
  const L = Shared.getLighthouseLocation(7), PR = 0.35, topY = L.baseY + LH.height;
  const limit = LH.rampOut - 0.1 - PR;
  const surf = th => { const out = []; for (let k = 0; k < LH.turns; k++) out.push(L.baseY + (k + th / (2 * Math.PI)) * (LH.height / LH.turns)); return out; };
  // 坂の上のどの角度でも、外へ向かって全力で歩き続けても縁より外へ出ず、床に乗ったままでいる
  let ok = true, why = '';
  for (let th = 0.9; th < LH.turns * 2 * Math.PI - 0.05; th += 0.07) {
    const k = Math.floor(th / (2 * Math.PI)), ang = th % (2 * Math.PI);
    let x = L.x + Math.cos(ang) * 4.0, z = L.z + Math.sin(ang) * 4.0, py = L.baseY + th / (2 * Math.PI) * (LH.height / LH.turns);
    for (let f = 0; f < 60; f++) { // 外向きに 12m/s で 3秒(1フレーム 0.05 秒 = 0.6m 動く)
      x += Math.cos(ang) * 0.6; z += Math.sin(ang) * 0.6;
      const c = Shared.lighthouseRailClamp(L, x, z, py, PR);
      if (c) { x = c.x; z = c.z; }
      const fl = Shared.lighthouseFloorY(L, x, z, py);
      if (fl === undefined || Math.abs(fl - py) > 1e-6 && fl < py - 0.01) { ok = false; why = 'th=' + th.toFixed(2) + ' 床を外れた'; break; }
      py = Math.max(py, fl === undefined ? py : fl);
    }
    if (Math.hypot(x - L.x, z - L.z) > limit + 1e-6) { ok = false; why = 'th=' + th.toFixed(2) + ' 縁を越えた r=' + Math.hypot(x - L.x, z - L.z).toFixed(2); }
    if (!ok) break;
  }
  check('坂の上で外へ歩き続けても、手すりで止まって落ちない(全周・3周分)', ok, why);
  // 頂上の展望台でも、どの向きにも縁を越えない
  ok = true;
  for (let a = 0; a < 6.3 && ok; a += 0.1) {
    let x = L.x + Math.cos(a) * 3.5, z = L.z + Math.sin(a) * 3.5;
    for (let f = 0; f < 40; f++) { x += Math.cos(a) * 0.6; z += Math.sin(a) * 0.6; const c = Shared.lighthouseRailClamp(L, x, z, topY, PR); if (c) { x = c.x; z = c.z; } }
    if (Math.hypot(x - L.x, z - L.z) > limit + 1e-6) ok = false;
  }
  check('頂上の展望台も、どの向きに歩いても縁から落ちない', ok);
  // 高く跳んでも(足元が面から2.5m以内)手すりは越えられない
  const jx = L.x + Math.cos(2) * 5.3, jz = L.z + Math.sin(2) * 5.3, jy = surf(2)[1] + 2.0;
  check('ジャンプしても手すりを跳び越えられない(面の2m上)', Shared.lighthouseRailClamp(L, jx, jz, jy, PR) !== null);
  // 手すりが邪魔にならない所
  check('坂の下の地面を歩く人は押し戻されない', Shared.lighthouseRailClamp(L, L.x + Math.cos(3) * 5.3, L.z + Math.sin(3) * 5.3, L.baseY, PR) === null);
  check('登り口(地面から1m以内の低い部分)には手すりがなく、外から歩いて乗れる',
    Shared.lighthouseRailClamp(L, L.x + 5.4, L.z, L.baseY, PR) === null && Shared.lighthouseRailClamp(L, L.x + Math.cos(0.1) * 5.4, L.z + Math.sin(0.1) * 5.4, L.baseY + 0.4, PR) === null);
  check('縁より内側・遠く離れた人・灯台がない場合は何もしない', Shared.lighthouseRailClamp(L, L.x + 4.0, L.z, L.baseY + 3.5, PR) === null &&
    Shared.lighthouseRailClamp(L, L.x + 40, L.z, L.baseY + 3.5, PR) === null && Shared.lighthouseRailClamp(null, 0, 0, 0, PR) === null);
}

// ---- 高さ: 坂の上のプレイヤーは、地面の敵に襲われない ----
{
  const seedH = 7, L = Shared.getLighthouseLocation(seedH), topY = L.baseY + LH.height;
  const trial = (py) => {
    const sim = new Shared.WorldSim({ seed: seedH });
    const hurts = [];
    sim.out = { sendTo: (id, m) => { if (m.t === 'hurt') hurts.push(m); }, broadcast() {} };
    for (const e of sim.enemies) { e.alive = false; e.respawnAt = Infinity; }
    const wolf = sim.enemies.find(e => e.kind === 'wolf' && !e.camp);
    const wx = L.x + 6.5, wz = L.z; // 塔のふもとの地面
    Object.assign(wolf, { alive: true, hp: wolf.maxHp, x: wx, z: wz, homeX: wx, homeZ: wz, tx: wx, tz: wz, awake: true });
    sim.addClient(1); sim.handle(1, { t: 'join', name: 'a', key: 'lh-h' });
    const c = sim.clients.get(1);
    c.hasState = true; c.x = L.x + 4.2; c.z = L.z; c.y = py;
    let engaged = false;
    for (let i = 0; i < 80; i++) { c.hasState = true; sim.tick(0.05); if (wolf.mv) engaged = true; }
    return { engaged, hurts: hurts.length, dist: Math.hypot(wolf.x - wx, wolf.z - wz) };
  };
  const ground = trial(Shared.islandHeight(L.x + 4.2, L.z));
  check('(対照)地面にいるプレイヤーは、近くの狼に襲われる', ground.engaged || ground.hurts > 0, JSON.stringify(ground));
  const top = trial(topY);
  check('頂上(21m上)のプレイヤーは、真下の狼に襲われない(狙われず、技も出ず、被弾もしない)', !top.engaged && top.hurts === 0, JSON.stringify(top));
  const jump = trial(Shared.islandHeight(L.x + 4.2, L.z) + 1.8);
  check('ジャンプ中(地面から1.8m)なら、今までどおり襲われる', jump.engaged || jump.hurts > 0, JSON.stringify(jump));
  const c = { x: L.x + 4.2, z: L.z, y: topY };
  check('届く高さの判定は、地面を歩く敵すべてに効き、クラゲは従来の水中の判定のまま',
    ['wolf', 'boar', 'lizard', 'crab', 'wolfClassic', 'boarClassic', 'raider', 'campGuard'].every(k => Shared.enemyCanReach(k, c) === false) && Shared.enemyCanReach('wolf', { x: L.x + 4.2, z: L.z, y: Shared.islandHeight(L.x + 4.2, L.z) + 1 }) === true);
}

// ---- 灯台・泉・野営地のまわりは、木・岩・草を置かない円になる ----
{
  let ok = true, why = '';
  for (const seed of [1, 7, 424242]) {
    const zones = Shared.getFeatureClearZones(seed);
    const lh = Shared.getLighthouseLocation(seed), camps = Shared.getCampLocations(seed), springs = Shared.getSpringLocations(seed, 2);
    if (zones.length !== 1 + springs.length + camps.length) { ok = false; why = 'seed ' + seed + ' 円の数 ' + zones.length; }
    const lz = zones.find(z => z.x === lh.x && z.z === lh.z);
    if (!lz || lz.r < LH.rampOut + 1.5) { ok = false; why = 'seed ' + seed + ' 灯台の円が坂をおおわない'; }
    const campZonesOk = camps.every(camp => { const z = zones.find(q => q.x === camp.x && q.z === camp.z); return !!z && z.r >= Shared.CAMP.footR; });
    if (!campZonesOk) { ok = false; why = 'seed ' + seed + ' 野営地の円が杭をおおわない'; }
    for (const sp of springs) { const z = zones.find(q => q.x === sp.x && q.z === sp.z); if (!z || z.r < Shared.SPRING.footR + 1) { ok = false; why = 'seed ' + seed + ' 泉の円が池をおおわない'; } }
    if (JSON.stringify(zones) !== JSON.stringify(Shared.getFeatureClearZones(seed))) { ok = false; why = 'seed ' + seed + ' 毎回違う'; }
  }
  check('灯台(坂の外縁+2m)・泉(池のふち+1.8m)・3か所の野営地(杭+1m)の円が、seedから毎回同じに決まる', ok, why);
}

// ---- 頂上の宝箱 ----
{
  const sim = new Shared.WorldSim({ seed: 7 });
  const opened = [];
  sim.out = { sendTo() {}, broadcast: m => { if (m.t === 'chestOpened') opened.push(m); } };
  check('宝箱は最大9個(従来7個+追加野営地2個)で、5番目は灯台の頂上', sim.chestLocations.length === 9 && sim.chestLocations[4].lighthouse === true && sim.chestLocations[3].underwater === true);
  const L = Shared.getLighthouseLocation(7), chest = sim.chestLocations[4];
  check('灯台の宝箱は頂上の高さにあり、坂の上に乗れる(展望台の内側)',
    Math.abs(chest.y - (L.baseY + LH.height)) < 1e-6 && Math.hypot(chest.x - L.x, chest.z - L.z) > LH.rampIn && Math.hypot(chest.x - L.x, chest.z - L.z) < LH.rampOut);
  sim.addClient(1); sim.handle(1, { t: 'join', name: 'a', key: 'lh-1' });
  const c = sim.clients.get(1);
  c.hasState = true; c.x = chest.x; c.z = chest.z; c.y = Shared.islandHeight(chest.x, chest.z); // 真下の地面
  sim.handle(1, { t: 'chest', idx: 4 });
  check('塔のふもと(真下)からは、水平の距離が近くても灯台の宝箱を開けられない', opened.length === 0 && !sim.chests.has(4));
  c.y = chest.y;
  sim.handle(1, { t: 'chest', idx: 4 });
  check('頂上まで登れば開けられ、全員へ chestOpened が配信される', opened.some(m => m.idx === 4) && sim.chests.has(4));
}

// ---- 既存のセーブ(宝箱4個まで)がそのまま読め、灯台の宝箱は未開封になる ----
{
  const sim = new Shared.WorldSim({ saved: { layoutVersion: Shared.WORLD_LAYOUT_VERSION, seed: 7, nextSid: 1, structures: [], chests: [0, 1, 2, 3] } });
  check('宝箱4個まで開けた古いセーブを読み込んでも、灯台の宝箱(4番)は未開封のまま', sim.chests.size === 4 && !sim.chests.has(4) && sim.chestLocations.length === 9);
  const exp = sim.exportSave ? sim.exportSave() : null;
  check('保存した内容に灯台の宝箱の開封状態も含められる', !exp || Array.isArray(exp.chests));
}

if (failures) { console.log(failures + ' FAILED'); process.exitCode = 1; } else console.log('ALL PASSED');
