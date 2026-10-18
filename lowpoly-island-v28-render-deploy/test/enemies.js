// 敵(岩トカゲ・カニ・クラゲ)の生息域と行動の単体テスト。WebSocketライブラリなしで実行できる。
'use strict';
const Shared = require('../public/shared.js');
let failures = 0;
function check(name, ok, detail) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : ' ' + (detail || '')));
  if (!ok) failures++;
}

const K = Shared.ENEMY_KINDS;
const SEEDS = [1, 7, 0x1234abcd, 424242];

function makeSim(seed, hurts, bcast) {
  const sim = new Shared.WorldSim({ seed });
  sim.out = { sendTo: (id, m) => hurts && hurts.push([id, m]), broadcast: m => bcast && bcast.push(m) };
  return sim;
}
function addPlayer(sim, id, x, y, z) {
  sim.addClient(id);
  sim.handle(id, { t: 'join', name: 'tester' + id, key: 'enemy-' + id });
  sim.handle(id, { t: 'state', x, y, z, ry: 0, cave: -1, f: 0 });
}
// 他の敵を遠くへ片づけて、調べたい1体だけを動かす
function isolate(sim, en) {
  for (const o of sim.enemies) if (o !== en) { o.alive = false; o.respawnAt = Infinity; }
}
function run(sim, seconds) {
  for (let i = 0; i < seconds * 20; i++) sim.tick(0.05);
}

// ---- 生息域 ----
{
  let ok = true, why = '';
  for (const seed of SEEDS) {
    const sim = makeSim(seed);
    const ruins = Shared.getRuinLocations(seed, 6);
    for (const en of sim.enemies) {
      if (!en.alive) { ok = false; why = 'seed ' + seed + ' ' + en.kind + ' が置けない'; continue; }
      const h = Shared.islandHeight(en.x, en.z);
      if (en.kind === 'lizard' && !en.camp && !ruins.some(r => Math.hypot(r.x - en.x, r.z - en.z) <= 15)) { ok = false; why = 'seed ' + seed + ' 岩トカゲが遺跡から遠い'; }
      if (en.kind === 'crab' && !(h >= 0.35 && h <= 1.2)) { ok = false; why = 'seed ' + seed + ' カニが浜にいない h=' + h; }
      if (en.kind === 'jelly' && !(h >= Shared.JELLY_WATER_MIN && h <= Shared.JELLY_WATER_MAX)) { ok = false; why = 'seed ' + seed + ' クラゲが水中にいない h=' + h; }
    }
  }
  check('岩トカゲは遺跡のそば、カニは浜、クラゲは水中に出現する(複数seed)', ok, why);
}

// ---- 生息域から出ない(外へ出る移動は取りやめる。ワープはしない) ----
{
  let ok = true, why = '', maxJump = 0;
  for (const seed of SEEDS.slice(0, 2)) {
    const sim = makeSim(seed);
    addPlayer(sim, 1, 0, 0, 6);
    let prev = sim.enemies.map(e => [e.x, e.z]);
    for (let i = 0; i < 20 * 60; i++) {
      sim.tick(0.05);
      sim.enemies.forEach((en, k) => {
        if (!en.alive) { prev[k] = [en.x, en.z]; return; }
        maxJump = Math.max(maxJump, Math.hypot(en.x - prev[k][0], en.z - prev[k][1]));
        prev[k] = [en.x, en.z];
        const h = Shared.islandHeight(en.x, en.z);
        if (!Shared.enemyCanStand(en.kind, en.x, en.z) && !Shared.enemyCanStand(en.kind, en.x + 0.5, en.z) && !Shared.enemyCanStand(en.kind, en.x - 0.5, en.z) &&
            !Shared.enemyCanStand(en.kind, en.x, en.z + 0.5) && !Shared.enemyCanStand(en.kind, en.x, en.z - 0.5)) { ok = false; why = en.kind + ' が生息域の外 h=' + h.toFixed(2); }
      });
    }
  }
  check('60秒動かしても、各敵は生息域(陸・浜・水中)から出ない', ok, why);
  check('敵が一瞬で遠くへワープしない(1tickの移動は2m未満)', maxJump < 2, 'maxJump=' + maxJump.toFixed(2));
}

// ---- 水辺: 届かない深い水の中のプレイヤーは狙わず、そこから殴られても一方的にはならない ----
function findShore(seed) { // 陸から深い水へ変わる岸辺の断面を1か所探す
  for (let a = 0; a < Math.PI * 2; a += 0.05) {
    let land = null;
    for (let r = 20; r < 400; r += 0.5) {
      const x = Math.cos(a) * r, z = Math.sin(a) * r, h = Shared.islandHeight(x, z);
      if (h >= 1.1) land = { x, z };
      if (land && h < Shared.WADE_MIN - 0.4) {
        // 岸に立つ敵の位置(land)と、深い水の中でそこから 2m ほど先のプレイヤー位置
        let edge = null;
        for (let rr = r; rr > 20 && !edge; rr -= 0.25) { const ex = Math.cos(a) * rr, ez = Math.sin(a) * rr; if (Shared.enemyCanStand('wolf', ex, ez)) edge = { x: ex, z: ez }; }
        if (!edge) break;
        const dirx = Math.cos(a), dirz = Math.sin(a);
        for (let t = 1.0; t < 6; t += 0.25) {
          const px = edge.x + dirx * t, pz = edge.z + dirz * t;
          if (Shared.islandHeight(px, pz) < Shared.WADE_MIN - 0.5) return { edge, player: { x: px, z: pz, y: Shared.islandHeight(px, pz) + 0.8 }, dir: { x: dirx, z: dirz } };
        }
        break;
      }
    }
  }
  return null;
}
{
  const shore = findShore(7);
  check('岸辺(陸から深い水)の断面が見つかる', !!shore);
  if (shore) {
    for (const kind of ['wolf', 'lizard', 'crab']) {
      const hurts = [];
      const sim = makeSim(7, hurts);
      const en = sim.enemies.find(e => e.kind === kind);
      isolate(sim, en);
      // 敵を岸の縁に置き、深い水の中の(届かない)プレイヤーを近くに立たせる
      // 種類ごとに立てる縁が違う(カニは浅い所まで)ので、その種類が立てる一番外側の点を探す
      let edge = shore.edge;
      for (let t = -12; t <= 6; t += 0.25) { const x = shore.edge.x + shore.dir.x * t, z = shore.edge.z + shore.dir.z * t; if (Shared.enemyCanStand(kind, x, z)) edge = { x, z }; else if (t > 0) break; }
      const ex = edge.x - shore.dir.x * 0.5, ez = edge.z - shore.dir.z * 0.5;
      en.x = ex; en.z = ez; en.homeX = ex; en.homeZ = ez; en.tx = ex; en.tz = ez; en.awake = true;
      addPlayer(sim, 1, shore.player.x, shore.player.y, shore.player.z);
      run(sim, 6);
      check(kind + ': 深い水の中のプレイヤーは狙わない(届かないのでダメージを送らない)', !hurts.some(h => h[1].t === 'hurt'));
      check(kind + ': 岸の縁で止まり、水の深みへは入らない', Shared.enemyCanStand(kind, en.x, en.z));
      // 届かない場所から殴られたら、一方的に殴られ続けないよう距離を取る
      en.x = ex; en.z = ez; en.fleeTimer = 0; // 6秒の間に歩き去っていても、殴る直前に岸の縁へ戻す
      sim.handle(1, { t: 'hit', id: en.id, dmg: 1, kp: 5 });
      check(kind + ': 届かない場所から殴られると距離を取る(逃げる)', en.fleeTimer > 0, 'alive='+en.alive+' hp='+en.hp+' flee='+en.fleeTimer+' d='+Math.hypot(en.x-shore.player.x,en.z-shore.player.z).toFixed(2));
    }
  }
}
{
  // 追うのをあきらめた敵は、初期位置へ歩いて戻り、戻る間は襲ってこない
  const hurts = [];
  const sim = makeSim(7, hurts);
  const wolf = sim.enemies.find(e => e.kind === 'wolf');
  isolate(sim, wolf);
  const homeX = wolf.x, homeZ = wolf.z;
  addPlayer(sim, 1, homeX + 2, Shared.islandHeight(homeX + 2, homeZ), homeZ);
  wolf.x = homeX + 8; wolf.z = homeZ; wolf.returnT = 6;
  if (!Shared.enemyCanStand('wolf', wolf.x, wolf.z)) { wolf.x = homeX + 3; }
  const d0 = Math.hypot(wolf.x - homeX, wolf.z - homeZ);
  run(sim, 2);
  const d1 = Math.hypot(wolf.x - homeX, wolf.z - homeZ);
  check('あきらめた敵は初期位置へ向かって歩く', d1 < d0 - 1.0, d0.toFixed(1) + '→' + d1.toFixed(1));
  check('戻っている間は近くのプレイヤーを襲わない', !hurts.some(h => h[1].t === 'hurt'));
}

// ---- 岩トカゲ: 近づくまで動かず、近づくと起きて噛みつく ----
{
  const hurts = [], bcast = [];
  const sim = makeSim(7, hurts, bcast);
  const liz = sim.enemies.find(e => e.kind === 'lizard');
  isolate(sim, liz);
  const x0 = liz.x, z0 = liz.z;
  addPlayer(sim, 1, x0 + 30, Shared.islandHeight(x0 + 30, z0), z0);
  run(sim, 10);
  check('岩トカゲは誰も近くにいなければ動かない(擬態中)', liz.awake === false && liz.x === x0 && liz.z === z0);
  addPlayer(sim, 2, x0 + 6, Shared.islandHeight(x0 + 6, z0), z0); // 少し離れた別のプレイヤー(wakeR=4.5 の外)
  run(sim, 2);
  check('wakeR より遠くのプレイヤーでは起きない', liz.awake === false);
  addPlayer(sim, 3, x0 + 2, Shared.islandHeight(x0 + 2, z0), z0); // すぐそばに来たプレイヤー
  run(sim, 0.5);
  check('近づくと岩トカゲが起きる', liz.awake === true);
  run(sim, 3);
  check('起きた岩トカゲがプレイヤーにダメージを送る(10)', hurts.some(h => h[0] === 3 && h[1].t === 'hurt' && h[1].amount === K.lizard.hurt));
  check('岩トカゲが攻撃すると、全員へ攻撃の通知(eatk)が配信される', bcast.some(m => m.t === 'eatk' && m.id === liz.id));
  const snapMsgs = [];
  sim.out = { sendTo() {}, broadcast: m => snapMsgs.push(m) };
  run(sim, 0.2);
  const snap = snapMsgs.find(m => m.t === 'snap');
  check('スナップショットに「起きているか」(5番目の値)が含まれる', snap && snap.e.some(e => e[0] === liz.id && e[4] === 1));
  // 殴られても逃げず、そのまま戦う
  const hp0 = liz.hp;
  sim.handle(3, { t: 'hit', id: liz.id, dmg: 1, kp: 5 });
  check('岩トカゲは殴られてもダメージを受けるが逃げない', liz.hp === hp0 - 1 && liz.fleeTimer === 0);
}

// ---- 岩トカゲ: 離れるとまた擬態に戻る ----
{
  const sim = makeSim(7);
  const liz = sim.enemies.find(e => e.kind === 'lizard');
  isolate(sim, liz);
  addPlayer(sim, 1, liz.x + 3, Shared.islandHeight(liz.x + 3, liz.z), liz.z);
  run(sim, 0.2);
  const woke = liz.awake;
  sim.clients.get(1).cave = 0; // 洞窟へ入った扱い(外の敵には狙われない)
  run(sim, 1);
  check('近くにいても洞窟内のプレイヤーでは起き続けず、擬態に戻る', woke === true && liz.awake === false);
}

// ---- カニ ----
{
  const hurts = [];
  const sim = makeSim(7, hurts);
  const crab = sim.enemies.find(e => e.kind === 'crab');
  isolate(sim, crab);
  addPlayer(sim, 1, crab.x + 2, Shared.islandHeight(crab.x + 2, crab.z), crab.z);
  run(sim, 4);
  check('カニは近くのプレイヤーを挟んでダメージを送る(6)', hurts.some(h => h[0] === 1 && h[1].t === 'hurt' && h[1].amount === K.crab.hurt));
}

// ---- クラゲ: 水の上のプレイヤーだけを狙う ----
{
  const hurts = [];
  const sim = makeSim(7, hurts);
  const jelly = sim.enemies.find(e => e.kind === 'jelly');
  isolate(sim, jelly);
  const jy = Shared.jellyHeight(jelly.x, jelly.z);
  const jellyGround = Shared.islandHeight(jelly.x, jelly.z);
  check('クラゲの基準位置は海底より上で水面より下にある', jy < 0.15 && jy >= jellyGround);
  // クライアント側モデルの上端を最大攻撃膨張(ローカルY約1.129m)、縦縮尺0.65、上下動0.15m込みで検証。
  check('クラゲの傘は最大膨張と上下動を含めても水面を越えない', jy + 0.15 + 1.129 * 0.65 < 0.15);
  // 長い触手の最下端はモデル原点から約0.4m下。縦縮尺0.65で海底を突き抜けない。
  check('クラゲの触手は浅い生息域でも海底を突き抜けない', jy - 0.25 * 0.65 >= jellyGround);
  check('クラゲは十分な水深がある場所でのみ泳げる', jellyGround <= Shared.JELLY_WATER_MAX && Shared.enemyCanStand('jelly', jelly.x, jelly.z));
  check('クラゲの届く範囲は水中のプレイヤーだけ(陸のプレイヤーには届かない)', Shared.enemyCanReach('jelly', { x: jelly.x, z: jelly.z, y: jy }) && !Shared.enemyCanReach('jelly', { x: 0, z: 6, y: 5 }));
  addPlayer(sim, 1, jelly.x + 2, jy, jelly.z);
  run(sim, 5);
  check('クラゲは水の中のプレイヤーを刺してダメージを送る(6)', hurts.some(h => h[0] === 1 && h[1].t === 'hurt' && h[1].amount === K.jelly.hurt));
}
{
  const hurts = [];
  const sim = makeSim(7, hurts);
  const jelly = sim.enemies.find(e => e.kind === 'jelly');
  isolate(sim, jelly);
  // 水面から離れた高い位置のプレイヤーは狙われない(上空のイメージ)
  addPlayer(sim, 1, jelly.x + 2, 20, jelly.z);
  run(sim, 5);
  check('クラゲは水から遠く離れた高さのプレイヤーを刺さない', !hurts.some(h => h[1].t === 'hurt'));
}

// ---- 猪: 殴られると突進で反撃する(予備動作→突進→のけぞり) ----
{
  for (const kind of ['boar', 'boarClassic']) {
    const hurts = [];
    const sim = makeSim(7, hurts);
    const boar = sim.enemies.find(e => e.kind === kind);
    isolate(sim, boar);
    addPlayer(sim, 1, boar.x + 1, Shared.islandHeight(boar.x + 1, boar.z), boar.z);
    sim.handle(1, { t: 'hit', id: boar.id, dmg: 1, kp: 5 });
    check(kind + ': 殴られると逃げずに、突進の予備動作に入る', boar.mv === 'charge' && boar.mvPh === 0 && boar.fleeTimer === 0);
    run(sim, 2);
    check(kind + ': 突進が当たるとダメージを送る(12)', hurts.some(h => h[0] === 1 && h[1].t === 'hurt' && h[1].amount === K.boar.moves.charge.hurt));
  }
}

// ---- 初期版の見た目の狼・猪: 強さと動きは元の狼・猪と同じ ----
{
  const hurts = [];
  const sim = makeSim(7, hurts);
  const cw = sim.enemies.find(e => e.kind === 'wolfClassic');
  const cb = sim.enemies.find(e => e.kind === 'boarClassic');
  check('初期版の狼・猪は元の狼・猪と同じHP・速さで、陸に出現する',
    cw.maxHp === K.wolf.hp && cw.speed === K.wolf.speed && cb.maxHp === K.boar.hp && cb.speed === K.boar.speed &&
    Shared.islandHeight(cw.x, cw.z) >= 1.1 && Shared.islandHeight(cb.x, cb.z) >= 1.1);
  isolate(sim, cw);
  addPlayer(sim, 1, cw.x + 2, Shared.islandHeight(cw.x + 2, cw.z), cw.z);
  run(sim, 4);
  check('初期版の狼は近くのプレイヤーを襲う(8ダメージ)', hurts.some(h => h[0] === 1 && h[1].t === 'hurt' && h[1].amount === K.wolf.hurt));
}

// ---- 倒すと再出現する ----
{
  const sim = makeSim(7);
  const crab = sim.enemies.find(e => e.kind === 'crab');
  addPlayer(sim, 1, crab.x + 1, Shared.islandHeight(crab.x + 1, crab.z), crab.z);
  crab.hp = 1; crab.ry = Math.PI; // 背中側(プレイヤーは+x側、カニは-z向き)から殴る
  sim.handle(1, { t: 'hit', id: crab.id, dmg: 4, kp: 5 });
  check('カニを倒せる', crab.alive === false);
  crab.respawnAt = 0;
  sim.tick(0.05);
  check('倒したカニはまた出現する', crab.alive === true && crab.hp === crab.maxHp);
}


// ---- 新しい動き: 予備動作→本攻撃→のけぞり ----
function waitFor(sim, cond, seconds) { for (let i = 0; i < seconds * 20; i++) { if (cond()) return true; sim.tick(0.05); } return cond(); }
function snapCodeOf(sim, en) { // スナップショットで送られる状態コード
  const msgs = []; const old = sim.out;
  sim.out = { sendTo: old.sendTo, broadcast: m => { msgs.push(m); old.broadcast(m); } };
  sim.tick(0.05); sim.tick(0.05);
  sim.out = old;
  const snap = msgs.find(m => m.t === 'snap'); const e = snap && snap.e.find(x => x[0] === en.id);
  return e ? e[5] : undefined;
}
{
  // 狼: 近づくと飛びかかる(予備動作→突進)。予備動作を見てかわせる。予備動作中に殴ると中断する
  const mk = () => {
    const hurts = [], bc = [], sim = makeSim(7, hurts, bc);
    const wolf = sim.enemies.find(e => e.kind === 'wolf');
    isolate(sim, wolf);
    addPlayer(sim, 1, wolf.x + 3, Shared.islandHeight(wolf.x + 3, wolf.z), wolf.z);
    return { sim, wolf, hurts, bc, c: sim.clients.get(1) };
  };
  let t = mk();
  check('狼: HPが上がっている(6)', t.wolf.maxHp === 6);
  check('狼: 近づくと予備動作(しゃがみ)に入る', waitFor(t.sim, () => t.wolf.mv === 'lunge' && t.wolf.mvPh === 0, 1));
  check('狼: 予備動作の間は噛まない(0.5秒近くダメージが来ない)', !t.hurts.some(h => h[1].t === 'hurt'));
  check('狼: スナップショットに状態コード(予備動作=11)が載る', snapCodeOf(t.sim, t.wolf) === 11);
  check('狼: 飛びかかるとダメージを送る(8)', waitFor(t.sim, () => t.hurts.some(h => h[1].t === 'hurt' && h[1].amount === 8), 1.5));
  check('狼: 飛びかかりの瞬間に eatk(技番号1)が配信される', t.bc.some(m => m.t === 'eatk' && m.id === t.wolf.id && m.mv === Shared.MOVE_ID.lunge));

  t = mk();
  waitFor(t.sim, () => t.wolf.mv === 'lunge' && t.wolf.mvPh === 1, 1.5);
  // 飛びかかった瞬間にプレイヤーが横へ大きく避けたことにする
  t.c.x = t.wolf.x - t.wolf.dirZ * 6; t.c.z = t.wolf.z + t.wolf.dirX * 6;
  run(t.sim, 1);
  check('狼: 飛びかかりの向きは固定なので、横へ避けると当たらない', !t.hurts.some(h => h[1].t === 'hurt'));

  t = mk();
  waitFor(t.sim, () => t.wolf.mv === 'lunge' && t.wolf.mvPh === 0, 1);
  t.sim.handle(1, { t: 'hit', id: t.wolf.id, dmg: 1, kp: 5 });
  check('狼: 予備動作中に殴ると中断されてのけぞる', t.wolf.mvPh === 2);
  check('狼: 1発目は逃げない(HPが多い間は戦い続ける)', t.wolf.fleeTimer === 0 && t.wolf.hp === 5);
  t.c.lastHitAt.clear(); t.wolf.hp = 3;
  t.sim.handle(1, { t: 'hit', id: t.wolf.id, dmg: 1, kp: 5 });
  check('狼: HPが1/3以下まで減ると逃げる', t.wolf.fleeTimer > 0);
}
{
  // 岩トカゲ: 噛みつき×2のあと、3回目は尻尾の薙ぎ払い(予備動作が長く、範囲が広い)
  const hurts = [], bc = [], sim = makeSim(7, hurts, bc);
  const liz = sim.enemies.find(e => e.kind === 'lizard');
  isolate(sim, liz);
  addPlayer(sim, 1, liz.x + 1.6, Shared.islandHeight(liz.x + 1.6, liz.z), liz.z);
  check('岩トカゲ: HPが上がっている(12)', liz.maxHp === 12);
  waitFor(sim, () => bc.filter(m => m.t === 'eatk').length >= 3, 15);
  const seq = bc.filter(m => m.t === 'eatk').slice(0, 3).map(m => m.mv);
  check('岩トカゲ: 噛みつき→噛みつき→尻尾の薙ぎ払い の順に出す', seq.join() === [Shared.MOVE_ID.bite, Shared.MOVE_ID.bite, Shared.MOVE_ID.whip].join(), seq.join());
  check('岩トカゲ: 薙ぎ払いは12ダメージ', hurts.some(h => h[1].t === 'hurt' && h[1].amount === 12));
}
{
  // カニ: 正面からはハサミで防がれる。側面・背後・のけぞり中は通る
  const bc = [], sim = makeSim(7, null, bc);
  const crab = sim.enemies.find(e => e.kind === 'crab');
  isolate(sim, crab);
  addPlayer(sim, 1, crab.x + 1, Shared.islandHeight(crab.x + 1, crab.z), crab.z);
  const c = sim.clients.get(1);
  crab.ry = Math.PI / 2; // +x 向き(プレイヤーは正面)
  sim.handle(1, { t: 'hit', id: crab.id, dmg: 1, kp: 5 });
  const hit1 = bc.filter(m => m.t === 'ehit').pop();
  check('カニ: 正面から殴るとガードされてダメージ0(g=1)', crab.hp === 6 && hit1 && hit1.g === 1 && hit1.dmg === 0);
  c.lastHitAt.clear(); c.x = crab.x - 1; // 背後へ回る
  sim.handle(1, { t: 'hit', id: crab.id, dmg: 1, kp: 5 });
  check('カニ: 背後から殴るとダメージが通る', crab.hp === 5);
  c.lastHitAt.clear(); c.x = crab.x + 1; crab.mv = 'pinch'; crab.mvPh = 2; crab.mvT = 0.5;
  sim.handle(1, { t: 'hit', id: crab.id, dmg: 1, kp: 5 });
  check('カニ: 挟んだあとののけぞり中は正面からでも通る', crab.hp === 4);
}
{
  // クラゲ: 近づいて触手を広げ(予備動作)、周囲へパルス。範囲の外へ出ればかわせる
  const mk = () => {
    const hurts = [], sim = makeSim(7, hurts);
    const jelly = sim.enemies.find(e => e.kind === 'jelly');
    isolate(sim, jelly);
    const jy = Shared.jellyHeight(jelly.x, jelly.z);
    addPlayer(sim, 1, jelly.x + 2.2, jy, jelly.z);
    return { sim, jelly, hurts, c: sim.clients.get(1) };
  };
  let t = mk();
  check('クラゲ: HPが上がっている(5)', t.jelly.maxHp === 5);
  check('クラゲ: 近くのプレイヤーに触手を広げる予備動作を見せる', waitFor(t.sim, () => t.jelly.mv === 'pulse' && t.jelly.mvPh === 0, 3));
  check('クラゲ: パルスでダメージを送る(8)', waitFor(t.sim, () => t.hurts.some(h => h[1].t === 'hurt' && h[1].amount === 8), 3));
  t = mk();
  waitFor(t.sim, () => t.jelly.mv === 'pulse' && t.jelly.mvPh === 0, 3);
  t.c.x = t.jelly.x + 4.5; // 予備動作の間に範囲(2.8m)の外へ離れる
  run(t.sim, 2);
  check('クラゲ: パルスの範囲の外へ離れるとかわせる', !t.hurts.some(h => h[1].t === 'hurt'));
}

if (failures) { console.log(failures + ' FAILED'); process.exitCode = 1; } else console.log('ALL PASSED');
