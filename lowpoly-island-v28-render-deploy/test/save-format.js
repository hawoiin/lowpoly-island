'use strict';
const SaveFormat = require('../public/save-format.js');
const Shared = require('../public/shared.js');
let failures = 0;
function check(name, condition) {
  console.log((condition ? 'PASS ' : 'FAIL ') + name);
  if (!condition) failures++;
}
function throws(name, fn) {
  let didThrow = false;
  try { fn(); } catch (_) { didThrow = true; }
  check(name, didThrow);
}

const player = {
  inv:{ wood:12, stone:8, herb:3, crystal:2, relic:1 },
  collected:{ item_blue_mushroom:2, item_deep_crystal:1, item_seaweed:3, item_pearl_shell:1, item_coral:2, item_seashell:4 },
  discovered:['item_blue_mushroom','item_deep_crystal','item_seaweed','item_pearl_shell','item_coral','item_seashell'], swordLv:2,
  held:{ campfire:1, hut:0, cabin:0, fence:4, floor:3 },
  claimed:{ plant:true, mineral:false, relic:true, underwater:true }, codexDone:false, seenCaves:[0,1]
};
const settings = { volume:0.7, sens:1.25, shake:true };
const world = {
  layoutVersion:Shared.WORLD_LAYOUT_VERSION, seed:123456, nextSid:3,
  structures:[
    { sid:1, buildId:'fence', x:20, y:Shared.islandHeight(20,20), z:20, ry:Math.PI/4, owner:'owner-a' },
    { sid:2, buildId:'floor', x:24, y:Shared.islandHeight(24,20), z:20, ry:0, owner:'' }
  ],
  chests:[0,2,3]
};

try {
  const bundle = SaveFormat.createBundle(player, settings, world);
  const imported = SaveFormat.parseBundle(JSON.stringify(bundle));
  check('JSONバックアップを作成して読み戻せる', imported.format === SaveFormat.FORMAT && imported.version === SaveFormat.VERSION);
  check('所持品・図鑑・強化と海底アイテムを保持する', imported.player.inv.wood === 12 && imported.player.discovered.length === 6 && imported.player.collected.item_seaweed === 3 && imported.player.collected.item_pearl_shell === 1 && imported.player.collected.item_coral === 2 && imported.player.collected.item_seashell === 4 && imported.player.claimed.underwater === true && imported.player.swordLv === 2);
  check('設定・建築物・陸上/海底宝箱の開封状態を保持する', imported.settings.sens === 1.25 && imported.world.structures.length === 2 && imported.world.chests.includes(2) && imported.world.chests.includes(3));
  check('知らない余分なプロパティを実行せず既知項目だけを保存する', !Object.prototype.hasOwnProperty.call(imported.player, '__proto__'));
} catch (e) {
  check('有効なセーブデータは例外なく往復する', false);
  console.error(e);
}


const legacyPlayer = {
  inv:{ wood:1, stone:2, herb:0, crystal:0, relic:0 },
  collected:{ item_seaweed:1, item_pearl_shell:1 },
  discovered:['item_seaweed','item_pearl_shell'], swordLv:1,
  held:{ campfire:0, hut:0, cabin:0, fence:0, gate:0, floor:0 },
  claimed:{ plant:false, mineral:false, relic:false }, codexDone:false, seenCaves:[]
};
const legacyNormalized = SaveFormat.normalizePlayer(legacyPlayer);
check('新しい海のカテゴリがない既存セーブも読み込める', legacyNormalized.claimed.underwater === false && legacyNormalized.collected.item_pearl_shell === 1);

throws('未対応のファイル形式を拒否する', () => SaveFormat.parseBundle(JSON.stringify({ format:'other', version:1 })));
throws('未対応のバージョンを拒否する', () => SaveFormat.parseBundle(JSON.stringify({ format:SaveFormat.FORMAT, version:999 })));
throws('過大なJSONファイルを拒否する', () => SaveFormat.parseBundle(' '.repeat(SaveFormat.MAX_FILE_BYTES + 1)));
throws('負の所持数を拒否する', () => SaveFormat.createBundle(Object.assign({}, player, { inv:{ wood:-1 } }), settings, world));
throws('未知の図鑑IDを拒否する', () => SaveFormat.createBundle(Object.assign({}, player, { discovered:['script'] }), settings, world));
throws('範囲外の剣レベルを拒否する', () => SaveFormat.createBundle(Object.assign({}, player, { swordLv:3 }), settings, world));
throws('重複した建築IDを拒否する', () => SaveFormat.createBundle(player, settings, Object.assign({}, world, { structures:[world.structures[0], world.structures[0]] })));
throws('不正な宝箱番号を拒否する', () => SaveFormat.createBundle(player, settings, Object.assign({}, world, { chests:[0,99] })));
throws('不正な設定値を拒否する', () => SaveFormat.createBundle(player, { volume:7, sens:1, shake:true }, world));

if (failures) process.exitCode = 1;
else console.log('全14項目合格');
