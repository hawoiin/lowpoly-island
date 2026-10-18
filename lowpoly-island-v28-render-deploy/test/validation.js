// WorldSim 入力検証のユニットテスト。ws を使わず `node test/validation.js` で実行できる。
'use strict';
const Shared = require('../public/shared.js');
let fails = 0;
const check = (name, ok) => {
  console.log((ok ? 'PASS ' : 'FAIL ') + name);
  if (!ok) fails++;
};

const sim = new Shared.WorldSim({ seed: 12345 });
const sent = [], broadcast = [];
sim.out = {
  sendTo(id, msg) { sent.push({ id, msg }); },
  broadcast(msg) { broadcast.push(msg); },
};
sim.addClient(1);
sim.handle(1, { t: 'join', name: 'tester', key: 'test-key' });
sim.handle(1, { t: 'state', x: 12, y: Shared.islandHeight(12, 10), z: 10, ry: 0, cave: -1, f: 0 });
const c = sim.clients.get(1);

// 不正な位置で、直前に受け取った正常な状態が上書きされないことを確認する。
sim.handle(1, { t: 'state', x: 'NaN', y: 0, z: 0, ry: 0, cave: -1, f: 0 });
check('文字列の座標を無視してプレイヤー位置を保持する', c.x === 12 && c.z === 10);
sim.handle(1, { t: 'state', x: 9999, y: 0, z: 0, ry: 0, cave: -1, f: 0 });
check('ワールド範囲外の座標を無視する', c.x === 12 && c.z === 10);
sim.handle(1, { t: 'state', x: 20, y: 0, z: 20, ry: 0, cave: 9, f: 0 });
check('存在しない洞窟番号を無視する', c.x === 12 && c.z === 10 && c.cave === -1);

sim.handle(1, { t: 'take', key: '<script>', kind: 'wood' });
sim.handle(1, { t: 'take', key: 'o420', kind: 'wood' });
sim.handle(1, { t: 'take', key: 'o0005', kind: 'wood' });
check('不正な採集キーを登録しない', !sim.taken.has('<script>'));
check('屋外採集キーが現在の最大範囲を超えない', !sim.taken.has('o420'));
check('存在しないゼロ埋め形式の採集キーを拒否する', !sim.taken.has('o0005'));
sim.handle(1, { t: 'take', key: 'c0o0', kind: 'crystal' });
check('屋外から洞窟素材を取得できない', !sim.taken.has('c0o0'));
sim.handle(1, { t: 'take', key: 'o5', kind: 'bogus' });
check('未定義の素材種別を受け付けない', !sim.taken.has('o5'));
sim.handle(1, { t: 'take', key: 'o5', kind: 'wood' });
check('正しい形式の屋外素材は取得できる', sim.taken.has('o5') && broadcast.some(m => m.t === 'taken' && m.key === 'o5'));

// 洞窟内の素材キーと屋外アクションは、それぞれ別の初期状態で検証する。
const caveSim = new Shared.WorldSim({ seed: 111 });
const caveSent = [], caveBroadcast = [];
caveSim.out = { sendTo(id, msg) { caveSent.push(msg); }, broadcast(msg) { caveBroadcast.push(msg); } };
caveSim.addClient(2);
caveSim.handle(2, { t: 'join', name: 'cave tester', key: 'cave-key' });
caveSim.handle(2, { t: 'state', x: Shared.CAVE_INTERIOR_ENTRY.x, y: 0, z: Shared.CAVE_INTERIOR_ENTRY.z, ry: 0, cave: 0, f: 0 });
caveSim.handle(2, { t: 'take', key: 'c1o0', kind: 'crystal' });
check('別の洞窟の素材を取得できない', !caveSim.taken.has('c1o0'));
caveSim.handle(2, { t: 'take', key: 'c0o0', kind: 'crystal' });
check('現在いる洞窟の素材は取得できる', caveSim.taken.has('c0o0'));
caveSim.handle(2, { t: 'take', key: 'c0o5', kind: 'crystal' });
caveSim.handle(2, { t: 'take', key: 'c0i4', kind: 'item' });
caveSim.handle(2, { t: 'take', key: 'c0o1', kind: 'item' });
check('洞窟の鉱石キーは5個分を超えない', !caveSim.taken.has('c0o5'));
check('洞窟アイテムキーは4個分を超えない', !caveSim.taken.has('c0i4'));
check('鉱石キーにアイテム用の種別を指定できない', !caveSim.taken.has('c0o1'));
caveSim.handle(2, { t: 'take', key: 'c0i0', kind: 'item' });
check('洞窟アイテムは正しい種別で取得できる', caveSim.taken.has('c0i0'));
caveSim.handle(2, { t: 'chest', idx: 0 });
check('洞窟内から屋外の宝箱を開けられない', !caveSim.chests.has(0));

const chestSim = new Shared.WorldSim({ seed: 112 });
const chestSent = [], chestBroadcast = [];
chestSim.out = { sendTo(id, msg) { chestSent.push(msg); }, broadcast(msg) { chestBroadcast.push(msg); } };
chestSim.addClient(3);
chestSim.handle(3, { t: 'join', name: 'chest tester', key: 'chest-key' });
chestSim.handle(3, { t: 'state', x: 12, y: Shared.islandHeight(12, 10), z: 10, ry: 0, cave: -1, f: 0 });
chestSim.handle(3, { t: 'chest', idx: 1.5 });
check('小数の宝箱番号を受け付けない', !chestSim.chests.has(1.5));
chestSim.handle(3, { t: 'chest', idx: 0 });
check('離れた場所から宝箱を開けられない', !chestSim.chests.has(0));
const chestSpot = chestSim.chestLocations[0];
const chestClient = chestSim.clients.get(3);
chestClient.hasState = false; // この単体テストでは移動経路ではなく距離判定を分離して検証
chestSim.handle(3, { t: 'state', x: chestSpot.x, y: chestSpot.y, z: chestSpot.z, ry: 0, cave: -1, f: 0 });
chestSim.handle(3, { t: 'chest', idx: 0 });
check('正規の宝箱の近くから開封できる', chestSim.chests.has(0));
chestSim.handle(3, { t: 'chest', idx: Shared.MAX_CHESTS });
check('配置上限を超える宝箱番号を受け付けない', !chestSim.chests.has(Shared.MAX_CHESTS));

const sameRuinLayout = Shared.getRuinLocations(112, 6);
const sameChestLayoutA = Shared.getChestLocations(112, sameRuinLayout, 3);
const sameChestLayoutB = Shared.getChestLocations(112, Shared.getRuinLocations(112, 6), 3);
check('同じseedなら遺跡と宝箱の座標を再現できる', sameChestLayoutA.length === sameChestLayoutB.length && sameChestLayoutA.every((v, i) => v.x === sameChestLayoutB[i].x && v.z === sameChestLayoutB[i].z));
const laterRuinCanBeSelected = Array.from({ length: 40 }, (_, i) => i + 1).some(seed => {
  const ruins = Shared.getRuinLocations(seed, 6);
  const chests = Shared.getChestLocations(seed, ruins, 3);
  return chests.some(chest => {
    const nearest = ruins.reduce((best, ruin, index) => {
      const d = Math.hypot(chest.x - ruin.x, chest.z - ruin.z);
      return d < best.d ? { d, index } : best;
    }, { d: Infinity, index: -1 });
    return nearest.index >= 3;
  });
});
check('宝箱の配置先は先頭3遺跡に固定されず、後半の遺跡も選ばれる', laterRuinCanBeSelected);

const oldLayoutSave = new Shared.WorldSim({ saved: { seed: 112, chests: [0, 1, 2] } });
check('旧配置バージョンの開封状態を別の宝箱に誤適用しない', oldLayoutSave.chests.size === 0);

// 古い・壊れたセーブは有効なレコードだけ復元し、ID衝突を起こさない。
const restored = new Shared.WorldSim({ saved: {
  seed: 12345,
  layoutVersion: Shared.WORLD_LAYOUT_VERSION,
  nextSid: 2,
  structures: [
    { sid: 7, buildId: 'fence', x: 40, y: Shared.islandHeight(40, 40), z: 40, ry: 0, owner: 'owner' },
    { sid: 7, buildId: 'hut', x: 45, y: Shared.islandHeight(45, 45), z: 45, ry: 0, owner: 'duplicate' },
    { sid: 8, buildId: 'unknown', x: 45, y: 1, z: 45, ry: 0 },
    { sid: 9, buildId: 'fence', x: 'bad', y: 1, z: 45, ry: 0 },
    { sid: 10, buildId: 'fence', x: 300, y: 1, z: 300, ry: 0 },
    null,
  ],
  chests: [1, 2, 7, -1, '0', 2.5], // 7 は宝箱の数(0〜6)の範囲外
} });
check('壊れたセーブから有効な建築物だけ復元する', restored.structures.size === 1 && restored.structures.has(7));
check('復元後の建築IDが既存IDと衝突しない', restored.nextSid > 7);
check('保存済みの宝箱番号を実際の配置数の範囲で復元する', restored.chests.size === 2 && restored.chests.has(1) && restored.chests.has(2));


// 移動速度と洞窟出入りは別のシミュレーションで検証する。
const moveSim = new Shared.WorldSim({ seed: 4321 });
const moveSent = [];
moveSim.out = { sendTo(id, msg) { moveSent.push(msg); }, broadcast() {} };
moveSim.addClient(2);
moveSim.handle(2, { t: 'join', name: 'mover', key: 'move-key' });
moveSim.handle(2, { t: 'state', x: 12, y: 0, z: 10, ry: 0, cave: -1, f: 0 });
const mover = moveSim.clients.get(2);
mover.lastStateAt = Date.now() - 250;
moveSim.handle(2, { t: 'state', x: 18, y: 0, z: 10, ry: 0, cave: -1, f: 0 });
check('通常速度の範囲内の移動を受け付ける', mover.x === 18);
mover.lastStateAt = Date.now() - 3000;
moveSim.handle(2, { t: 'state', x: 78, y: 0, z: 10, ry: 0, cave: -1, f: 0 });
check('通信遅延後も経過時間に見合う移動を受け付ける', mover.x === 78);
moveSim.handle(2, { t: 'state', x: 150, y: 0, z: -100, ry: 0, cave: -1, f: 0 });
check('短時間の大きな位置ワープを拒否する', mover.x === 78 && mover.z === 10);
moveSim.handle(2, { t: 'state', x: Shared.CAVE_INTERIOR_ENTRY.x, y: 0, z: Shared.CAVE_INTERIOR_ENTRY.z, ry: 0, cave: 0, f: 0 });
check('入口を経由しない洞窟ワープを拒否する', mover.cave === -1);
const site0 = Shared.CAVE_SITES[0];
mover.x = site0.x; mover.z = site0.z + Shared.CAVE_MOUTH_OFFSET; mover.cave = -1; mover.lastStateAt = Date.now();
moveSim.handle(2, { t: 'state', x: 0, y: 0, z: -10, ry: 0, cave: 0, f: 0 });
check('入口から洞窟内の離れた場所へ飛ぶ操作を拒否する', mover.cave === -1);
moveSim.handle(2, { t: 'state', x: Shared.CAVE_INTERIOR_ENTRY.x, y: 0, z: Shared.CAVE_INTERIOR_ENTRY.z, ry: 0, cave: 0, f: 0 });
check('洞窟入口からの正当な入室を受け付ける', mover.cave === 0 && mover.x === Shared.CAVE_INTERIOR_ENTRY.x && mover.z === Shared.CAVE_INTERIOR_ENTRY.z);
mover.lastStateAt = Date.now() - 1000;
moveSim.handle(2, { t: 'state', x: 13.3, y: 0, z: 0, ry: 0, cave: 0, f: 0 });
check('画面側が許容する洞窟の壁際位置をサーバーも受け付ける', mover.cave === 0 && mover.x === 13.3 && Shared.CAVE_ROOM_RADIUS === 13.5);
moveSim.handle(2, { t: 'state', x: 0, y: 0, z: 5.5, ry: 0, cave: 1, f: 0 });
check('洞窟から別の洞窟への直接ワープを拒否する', mover.cave === 0);
mover.x = Shared.CAVE_INTERIOR_EXIT.x; mover.z = Shared.CAVE_INTERIOR_EXIT.z; mover.lastStateAt = Date.now();
const exit0 = { x: site0.x + site0.dirX * Shared.CAVE_EXIT_OFFSET, z: site0.z + site0.dirZ * Shared.CAVE_EXIT_OFFSET };
moveSim.handle(2, { t: 'state', x: exit0.x, y: Shared.islandHeight(exit0.x, exit0.z), z: exit0.z, ry: 0, cave: -1, f: 0 });
check('洞窟出口付近からの退室を受け付ける', mover.cave === -1 && Math.abs(mover.x - exit0.x) < 0.01);

// 送信時刻を使い、ネットワーク復旧時に位置更新がまとめて届いても連続して検証できる。
const timedSim = new Shared.WorldSim({ seed: 4323 });
timedSim.out = { sendTo() {}, broadcast() {} };
timedSim.addClient(6);
timedSim.handle(6, { t: 'join', name: 'timed mover', key: 'timed-key' });
timedSim.handle(6, { t: 'state', x: 12, y: 0, z: 10, ry: 0, cave: -1, f: 0, ts: 1000 });
const timedClient = timedSim.clients.get(6);
// 3秒間のネットワーク停止後をシミュレーションする。
timedClient.lastStateAt = Date.now() - 3000;
timedClient.serverTimeOrigin = Date.now() - 3000;
timedSim.handle(6, { t: 'state', x: 70, y: 0, z: 10, ry: 0, cave: -1, f: 0, ts: 4000 });
check('遅延後の位置をクライアントの経過時刻で検証する', timedSim.clients.get(6).x === 70);
timedSim.handle(6, { t: 'state', x: 71.5, y: 0, z: 10, ry: 0, cave: -1, f: 0, ts: 4066 });
check('まとめて届いた位置更新も送信間隔に基づいて処理する', timedSim.clients.get(6).x === 71.5);
timedSim.handle(6, { t: 'state', x: 72, y: 0, z: 10, ry: 0, cave: -1, f: 0, ts: 4001 });
check('古い送信時刻の位置更新を拒否する', timedSim.clients.get(6).x === 71.5);
timedSim.handle(6, { t: 'state', x: 100, y: 0, z: 10, ry: 0, cave: -1, f: 0, ts: 100000 });
check('クライアント時刻を大きく水増しした位置更新を拒否する', timedSim.clients.get(6).x === 71.5);

// 同じ敵への攻撃連打は1回だけ反映し、クールダウン後は次の攻撃を許可する。
const hitSim = new Shared.WorldSim({ seed: 9876 });
const hitBroadcast = [];
hitSim.out = { sendTo() {}, broadcast(msg) { hitBroadcast.push(msg); } };
hitSim.addClient(3);
hitSim.handle(3, { t: 'join', name: 'fighter', key: 'hit-key' });
const target = hitSim.enemies.find(e => e.alive);
hitSim.handle(3, { t: 'state', x: target.x + 1, y: 0, z: target.z, ry: 0, cave: -1, f: 0 });
const hitPlayer = hitSim.clients.get(3);
hitSim.handle(3, { t: 'hit', id: target.id, dmg: 1, kp: 5 });
hitSim.handle(3, { t: 'hit', id: target.id, dmg: 1, kp: 5 });
check('同じ敵への攻撃連打をクールダウンで抑える', hitBroadcast.filter(m => m.t === 'ehit' && m.id === target.id).length === 1);
hitPlayer.lastHitAt.set(target.id, Date.now() - Shared.HIT_COOLDOWN_MS - 1);
hitSim.handle(3, { t: 'hit', id: target.id, dmg: 1, kp: 5 });
check('クールダウン後の正当な攻撃を受け付ける', hitBroadcast.filter(m => m.t === 'ehit' && m.id === target.id).length === 2);

// 死亡中・洞窟内のプレイヤーに建築回収を許可しない。
const actionSim = new Shared.WorldSim({ seed: 4322 });
const actionMsgs = [];
actionSim.out = { sendTo(id, msg) { actionMsgs.push(msg); }, broadcast(msg) { actionMsgs.push(msg); } };
actionSim.addClient(4);
actionSim.handle(4, { t: 'join', name: 'builder', key: 'builder-key' });
actionSim.handle(4, { t: 'state', x: 30, y: Shared.islandHeight(30, 30), z: 30, ry: 0, cave: -1, f: 0 });
actionSim.handle(4, { t: 'place', buildId: 'fence', x: 30, y: Shared.islandHeight(30, 30), z: 30, ry: 0 });
const built = [...actionSim.structures.values()][0];
const actionClient = actionSim.clients.get(4);
actionClient.dead = true;
actionSim.handle(4, { t: 'pickup', sid: built.sid });
actionSim.handle(4, { t: 'place', buildId: 'campfire', x: 32, y: Shared.islandHeight(32, 30), z: 30, ry: 0 });
check('死亡中は建築物を回収できない', actionSim.structures.has(built.sid));
check('死亡中は建築物を設置できない', actionSim.structures.size === 1);
actionClient.dead = false; actionClient.cave = 0; actionClient.x = Shared.CAVE_INTERIOR_ENTRY.x; actionClient.z = Shared.CAVE_INTERIOR_ENTRY.z;
actionSim.handle(4, { t: 'pickup', sid: built.sid });
check('洞窟内から屋外の建築物を回収できない', actionSim.structures.has(built.sid));


// 採集キーの許可範囲は現在の配置上限に合わせ、上限保護が通常プレイを止めないようにする。
check('採集キーの理論上限は全キーの組み合わせより大きい',
  Shared.MAX_TRACKED_TAKEN > Shared.MAX_OUTDOOR_COLLECTIBLE_KEYS + 2 * (Shared.MAX_CAVE_ORE_KEYS + Shared.MAX_CAVE_ITEM_KEYS) + Shared.MAX_UNDERWATER_RESOURCES);
const capSim = new Shared.WorldSim({ seed: 222 });
const capMsgs = [];
capSim.out = { sendTo(id, msg) { capMsgs.push(msg); }, broadcast() {} };
capSim.addClient(5);
capSim.handle(5, { t: 'join', name: 'cap', key: 'cap-key' });
capSim.handle(5, { t: 'state', x: 12, y: Shared.islandHeight(12, 10), z: 10, ry: 0, cave: -1, f: 0 });
capSim.handle(5, { t: 'take', key: 'o777', kind: 'wood' });
check('上限外の架空キーは再生待ちMapに登録しない', capSim.taken.size === 0 && capMsgs.some(m => m.t === 'takeDenied' && m.key === 'o777'));

const beforeMalformedPlace = actionSim.structures.size;
actionClient.dead = false; actionClient.cave = -1;
actionSim.handle(4, { t: 'place', buildId: 'fence', x: '30', y: 1, z: 30, ry: 0 });
check('文字列座標の建築要求を拒否する', actionSim.structures.size === beforeMalformedPlace && actionMsgs.some(m => m.t === 'placeDenied' && m.reason === 'bad'));

// 建築スナップ: 柵は端点どうし、床は既存床の四辺へ吸着する。
const fenceY = Shared.islandHeight(40, 40);
const fenceA = { buildId: 'fence', x: 40, y: fenceY, z: 40, ry: 0 };
const fenceLineSnap = Shared.snapBuildPlacement('fence', 41.9, fenceY, 40, 0, [fenceA]);
check('柵を近づけると端点が一直線につながる', fenceLineSnap.snapped && Math.abs(fenceLineSnap.x - 42) < 0.01 && Math.abs(fenceLineSnap.z - 40) < 0.01);
check('端点が接続する柵は設置判定を通る', Shared.checkPlacement('fence', fenceLineSnap.x, fenceLineSnap.y, fenceLineSnap.z, [fenceA], fenceLineSnap.ry) === null);
const fenceCornerSnap = Shared.snapBuildPlacement('fence', 41.9, fenceY, 41, Math.PI / 2, [fenceA]);
check('柵は向きを変えて直角の角でも接続できる', fenceCornerSnap.snapped && Math.abs(fenceCornerSnap.x - 41) < 0.01 && Math.abs(fenceCornerSnap.z - 41) < 0.01 && Shared.checkPlacement('fence', fenceCornerSnap.x, fenceCornerSnap.y, fenceCornerSnap.z, [fenceA], fenceCornerSnap.ry) === null);
check('端点でつながらず中央で交差する柵は拒否する', Shared.checkPlacement('fence', 40, fenceY, 40, [fenceA], Math.PI / 2) === 'overlap');
const fenceFar = Shared.snapBuildPlacement('fence', 40, fenceY, 43, 0, [fenceA]);
check('柵から離れた場所では自由配置を維持する', !fenceFar.snapped && fenceFar.x === 40 && fenceFar.z === 43);

const floorY = Shared.islandHeight(30, 30);
const floorA = { buildId: 'floor', x: 30, y: floorY, z: 30, ry: 0 };
const floorSnap = Shared.snapBuildPlacement('floor', 32.9, floorY + 0.5, 30, 0.3, [floorA]);
check('床を近づけると既存床の縁に整列する', floorSnap.snapped && Math.abs(floorSnap.x - (30 + 1.15 * 1.9)) < 0.01 && Math.abs(floorSnap.z - 30) < 0.01);
check('接続する床は既存床と高さ・向きを揃え設置できる', floorSnap.y === floorY && floorSnap.ry === floorA.ry && Shared.checkPlacement('floor', floorSnap.x, floorSnap.y, floorSnap.z, [floorA], floorSnap.ry) === null);
const floorFar = Shared.snapBuildPlacement('floor', 34.1, floorY, 30, 0, [floorA]);
check('床から離れた場所では自由配置を維持する', !floorFar.snapped && floorFar.x === 34.1 && floorFar.z === 30);
const floorB = { buildId: 'floor', x: floorSnap.x, y: floorSnap.y, z: floorSnap.z, ry: floorSnap.ry };
const occupiedFloorSnap = Shared.snapBuildPlacement('floor', floorB.x, floorB.y, floorB.z, 0, [floorA, floorB]);
check('既に床がある場所へは吸着せず、重複配置を避ける', !occupiedFloorSnap.snapped && Shared.checkPlacement('floor', occupiedFloorSnap.x, occupiedFloorSnap.y, occupiedFloorSnap.z, [floorA, floorB], occupiedFloorSnap.ry) === 'overlap');

// サーバーの place メッセージでも、端点接続と向きが同じ判定で許可されることを確認。
const serverSnapSim = new Shared.WorldSim({ seed: 7654 });
serverSnapSim.out = { sendTo() {}, broadcast() {} };
serverSnapSim.addClient(8);
serverSnapSim.handle(8, { t: 'join', name: 'snap builder', key: 'snap-builder' });
serverSnapSim.handle(8, { t: 'state', x: 41, y: Shared.islandHeight(41, 41), z: 41, ry: 0, cave: -1, f: 0 });
serverSnapSim.handle(8, { t: 'place', buildId: 'fence', x: 40, y: fenceY, z: 40, ry: 0 });
serverSnapSim.handle(8, { t: 'place', buildId: 'fence', x: 41, y: fenceY, z: 41, ry: Math.PI / 2 });
check('サーバーも直角接続した柵を受理する', serverSnapSim.structures.size === 2);

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exitCode = fails ? 1 : 0;
