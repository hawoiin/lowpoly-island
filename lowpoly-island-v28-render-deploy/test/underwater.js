// 海底の配置・採集・宝箱の単体テスト。WebSocketライブラリなしで実行できる。
'use strict';
const Shared = require('../public/shared.js');
const SaveFormat = require('../public/save-format.js');
let failures = 0, checks = 0;
function check(name, ok) {
  checks++;
  console.log((ok ? 'PASS ' : 'FAIL ') + name);
  if (!ok) failures++;
}

const seed = 0x1234abcd;
const layoutA = Shared.getUnderwaterLayout(seed);
const layoutB = Shared.getUnderwaterLayout(seed);
check('海底の座標とオブジェクト配置は同じseedで再現できる', JSON.stringify(layoutA) === JSON.stringify(layoutB));
const rocksA = layoutA.resources.filter(r => r.big);
check('海底に採集ポイント80個(基本48 + 追加の海藻・サンゴ・大岩32)を配置する', layoutA.resources.length === 80 && layoutA.resources.length <= Shared.MAX_UNDERWATER_RESOURCES && rocksA.length >= 5);
check('大岩は石材として拾え、景観装飾には岩が残らない', rocksA.every(r => r.type === 'stone' && r.kind === 'stone' && r.scale > 0) && layoutA.decorations.length === 0);
check('採集種類は海藻24・真珠貝6・サンゴ12・普通の貝殻16・小石10(+大岩12)。レア度の高い順に少ない',
  layoutA.resources.filter(r => r.type === 'item_seaweed').length === 24 &&
  layoutA.resources.filter(r => r.type === 'item_pearl_shell').length === 6 &&
  layoutA.resources.filter(r => r.type === 'item_coral').length === 12 &&
  layoutA.resources.filter(r => r.type === 'item_seashell').length === 16 &&
  layoutA.resources.filter(r => r.type === 'stone' && !r.big).length === 10);
check('小石は石材、他の海底収集品は図鑑アイテムとして区別される', layoutA.resources.filter(r => r.type === 'stone').every(r => r.kind === 'stone') && layoutA.resources.filter(r => r.type !== 'stone').every(r => r.kind === 'item'));
check('採集キーは専用のu0〜で重複せず配列位置と一致', new Set(layoutA.resources.map(r => r.key)).size === layoutA.resources.length && layoutA.resources.every((r, i) => r.key === 'u' + i && r.index === i));
check('海底資源はすべて水面より下の地面に接地する', layoutA.resources.every(r => r.y < 0.15 && Math.abs(r.y - Shared.islandHeight(r.x, r.z)) < 0.011));
check('見た目だけで拾えない飾りは置かない(置いたものは全部拾える)', layoutA.decorations.length === 0);
check('沈没船は水中の地面に置かれる', layoutA.shipwreck.y < -2.5 && layoutA.shipwreck.y > -7.5);
check('宝箱は沈没船の近くの水中に置かれる', layoutA.treasure.underwater === true && layoutA.treasure.y < 0.15 && Math.hypot(layoutA.treasure.x - layoutA.shipwreck.x, layoutA.treasure.z - layoutA.shipwreck.z) >= 2.9 && Math.hypot(layoutA.treasure.x - layoutA.shipwreck.x, layoutA.treasure.z - layoutA.shipwreck.z) <= 4.5);

// 既存の陸上宝箱3個の座標・番号は維持し、4個目に海底、5個目に灯台の頂上を追加する(既存の番号は動かさない)。
const ruins = Shared.getRuinLocations(seed, 6);
const oldChests = Shared.getChestLocations(seed, ruins, 3);
const newChests = Shared.getChestLocations(seed, ruins, Shared.MAX_CHESTS);
check('既存の陸上宝箱は座標も順番も変わらない', oldChests.length === 3 && newChests.length === 7 && newChests[3].underwater === true && newChests[4].lighthouse === true && newChests[5].camp === true && newChests[6].grotto === true && oldChests.every((c, i) => c.x === newChests[i].x && c.y === newChests[i].y && c.z === newChests[i].z && c.ry === newChests[i].ry));
check('4個目の宝箱だけが沈没船のそばに追加される', newChests[3].underwater === true && newChests[3].x === layoutA.treasure.x && newChests[3].z === layoutA.treasure.z);

// サーバーが採集キーの種類・距離を検証し、正しい資源だけを許可する。
function makeSim(playerId, pos) {
  const sim = new Shared.WorldSim({ seed });
  sim.out = { sendTo() {}, broadcast() {} };
  sim.addClient(playerId);
  sim.handle(playerId, { t:'join', name:'underwater tester', key:'uw-' + playerId });
  sim.handle(playerId, { t:'state', x:pos.x, y:pos.y, z:pos.z, ry:0, cave:-1, f:0 });
  return sim;
}
const first = layoutA.resources[0];
let sim = makeSim(1, first);
sim.handle(1, { t:'take', key:first.key, kind:'item', itemId:first.type });
check('正規の海底資源を近くから採集できる', sim.taken.has(first.key));
sim = makeSim(2, { x:first.x + 12, y:first.y, z:first.z });
sim.handle(2, { t:'take', key:first.key, kind:'item', itemId:first.type });
check('離れた場所から海底資源を取得できない', !sim.taken.has(first.key));
sim = makeSim(3, first);
sim.handle(3, { t:'take', key:first.key, kind:'item', itemId:'item_pearl_shell' });
check('海藻の採集キーを真珠貝として偽装できない', !sim.taken.has(first.key));
sim = makeSim(4, first);
sim.handle(4, { t:'take', key:first.key, kind:'wood', itemId:first.type });
check('海底アイテムに木材など別種の取得を指定できない', !sim.taken.has(first.key));
sim = makeSim(5, { x:first.x, y:first.y + 8, z:first.z });
sim.handle(5, { t:'take', key:first.key, kind:'item', itemId:first.type });
check('水面側など高さが大きく離れた位置から採集できない', !sim.taken.has(first.key));
const coral = layoutA.resources.find(r => r.type === 'item_coral');
sim = makeSim(8, coral);
sim.handle(8, { t:'take', key:coral.key, kind:'item', itemId:'item_coral' });
check('サンゴを正規の場所から採集できる', sim.taken.has(coral.key));
const shell = layoutA.resources.find(r => r.type === 'item_seashell');
sim = makeSim(9, shell);
sim.handle(9, { t:'take', key:shell.key, kind:'item', itemId:'item_seashell' });
check('普通の貝殻を真珠貝とは別のアイテムとして採集できる', sim.taken.has(shell.key));
const pebble = layoutA.resources.find(r => r.type === 'stone');
sim = makeSim(10, pebble);
sim.handle(10, { t:'take', key:pebble.key, kind:'stone', itemId:'stone' });
check('海底の小石は既存の石材として採集できる', sim.taken.has(pebble.key));
sim = makeSim(11, pebble);
sim.handle(11, { t:'take', key:pebble.key, kind:'item', itemId:'stone' });
check('小石を図鑑アイテムとして偽装できない', !sim.taken.has(pebble.key));

const bigRock = layoutA.resources.find(r => r.big);
sim = makeSim(12, bigRock);
sim.handle(12, { t:'take', key:bigRock.key, kind:'stone', itemId:'stone' });
check('海底の大岩も石材として正規の場所から採集できる', sim.taken.has(bigRock.key));
sim = makeSim(13, { x:bigRock.x + 12, y:bigRock.y, z:bigRock.z });
sim.handle(13, { t:'take', key:bigRock.key, kind:'stone', itemId:'stone' });
check('大岩も遠くからは採集できない', !sim.taken.has(bigRock.key));

const extraWeed = layoutA.resources.find(r => r.index >= 48 && r.type === 'item_seaweed');
sim = makeSim(14, extraWeed);
sim.handle(14, { t:'take', key:extraWeed.key, kind:'item', itemId:'item_seaweed' });
check('追加された海藻・サンゴ(u48以降)も採集できる', sim.taken.has(extraWeed.key) && layoutA.resources.some(r => r.index >= 48 && r.type === 'item_coral'));

const chestSim = makeSim(6, newChests[3]);
chestSim.handle(6, { t:'chest', idx:3 });
check('海底宝箱は近づけばサーバーが開封を記録する', chestSim.chests.has(3));
const farChestSim = makeSim(7, { x:newChests[3].x + 15, y:newChests[3].y, z:newChests[3].z });
farChestSim.handle(7, { t:'chest', idx:3 });
check('海底宝箱も遠隔開封できない', !farChestSim.chests.has(3));

const player = { inv:{wood:0,stone:0,herb:0,crystal:0,relic:0}, collected:{item_seaweed:2,item_pearl_shell:1,item_coral:3,item_seashell:4}, discovered:['item_seaweed','item_pearl_shell','item_coral','item_seashell'], swordLv:1, held:{campfire:0,hut:0,cabin:0,fence:0,gate:0,floor:0}, claimed:{plant:false,mineral:false,relic:false,underwater:true}, codexDone:false, seenCaves:[] };
const settings = { volume:0.7, sens:1, shake:true };
const world = { layoutVersion:Shared.WORLD_LAYOUT_VERSION, seed, nextSid:1, structures:[], chests:[3] };
try {
  const roundTrip = SaveFormat.parseBundle(JSON.stringify(SaveFormat.createBundle(player, settings, world)));
  check('海藻・真珠貝・サンゴ・普通の貝殻と海底宝箱がセーブ/ロードされる', roundTrip.player.collected.item_seaweed === 2 && roundTrip.player.collected.item_pearl_shell === 1 && roundTrip.player.collected.item_coral === 3 && roundTrip.player.collected.item_seashell === 4 && roundTrip.world.chests.includes(3));
  check('新しい海の図鑑カテゴリの達成状態もセーブ形式で保持される', roundTrip.player.claimed.underwater === true);
} catch (e) {
  check('海底アイテムと宝箱をセーブ/ロードできる', false);
  console.error(e);
}

// seedを変えても水中配置が正しい深さに生成されることを複数seedで確認する。
let variedSeedsOkay = true;
for (let n=0;n<30;n++) {
  const l = Shared.getUnderwaterLayout((seed + n * 7919) >>> 0);
  if (l.resources.length < 70 || l.resources.length > Shared.MAX_UNDERWATER_RESOURCES || l.resources.some((r, i) => r.key !== 'u' + i) || !(l.shipwreck.y < -2.5 && l.shipwreck.y > -7.5) || !(l.treasure.y < 0.15)) { variedSeedsOkay = false; break; }
}
check('複数のワールドseedでも必要数と水中の深さを確保する', variedSeedsOkay);

if (failures) process.exitCode = 1;
else console.log('海底機能テスト全' + checks + '項目合格');
