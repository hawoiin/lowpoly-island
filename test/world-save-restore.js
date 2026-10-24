'use strict';
const Shared = require('../public/shared.js');
let failures = 0;
function check(name, condition) {
  console.log((condition ? 'PASS ' : 'FAIL ') + name);
  if (!condition) failures++;
}

const original = new Shared.WorldSim({ seed:1111 });
const messages = [];
original.out = { sendTo(id, m) { messages.push(m); }, broadcast(m) { messages.push(m); } };
const y = Shared.islandHeight(30,30);
const backup = {
  layoutVersion:Shared.WORLD_LAYOUT_VERSION,
  seed:2222,
  nextSid:2,
  structures:[{ sid:1, buildId:'fence', x:30, y, z:30, ry:Math.PI/4, owner:'owner-hash' }],
  chests:[1]
};
const result = original.restoreWorld(backup);
check('正しいバックアップを復元する', result.ok && original.seed === 2222 && original.structures.size === 1 && original.chests.has(1));
check('シードが変わったことを全参加者へ通知する', messages.some(m => m.t === 'worldRestored' && m.seedChanged && m.world.seed === 2222));
check('復元後も建築IDが衝突しない', original.nextSid === 2);

const before = JSON.stringify(original.serialize());
const bad = original.restoreWorld(Object.assign({}, backup, { layoutVersion:Shared.WORLD_LAYOUT_VERSION - 1 }));
check('古い配置バージョンは拒否する', !bad.ok && bad.reason === 'layout' && JSON.stringify(original.serialize()) === before);
const badStructure = original.restoreWorld(Object.assign({}, backup, { structures:[{ sid:1, buildId:'unknown', x:1, y:1, z:1, ry:0, owner:'' }] }));
check('不正な建築物が含まれるバックアップを拒否する', !badStructure.ok && JSON.stringify(original.serialize()) === before);
const badChests = original.restoreWorld(Object.assign({}, backup, { chests:[1,1] }));
check('重複宝箱状態を拒否する', !badChests.ok && JSON.stringify(original.serialize()) === before);

const zeroSeed = new Shared.WorldSim({ saved:{ layoutVersion:Shared.WORLD_LAYOUT_VERSION, seed:0, nextSid:1, structures:[], chests:[] } });
check('シード0も有効な整数として保持する', zeroSeed.seed === 0);

if (failures) process.exitCode = 1;
else console.log('全7項目合格');
