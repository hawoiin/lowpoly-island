// Save compatibility: keep the public world format readable by v61.9 and older releases.
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadServerSave, writeServerSave, sidecarPath } = require('../server-save.js');

function check(name, fn) {
  try { fn(); console.log('PASS ' + name); }
  catch (error) { console.error('FAIL ' + name + ': ' + error.message); process.exitCode = 1; }
}
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'island-save-compat-'));
const saveFile = path.join(directory, 'world.json');
const world = { seed: 1234, structures: [{ sid: 7, buildId: 'fence', x: 12, y: 1, z: 13, ry: 0 }], chests: [2] };
const recovery = { version: 1, rooms: [{ key: 'party:ABC234', seed: 8, stage: 2, openGates: 2, bags: [{ bagId: 'bag-1', ownerPid: '0123456789abcdef' }] }] };

try {
  writeServerSave(saveFile, world, recovery);
  check('保存後も world.json は旧版が読める生のワールド形式', () => {
    const raw = JSON.parse(fs.readFileSync(saveFile, 'utf8'));
    assert.deepStrictEqual(raw, world);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(raw, 'format'), false);
    assert.strictEqual(JSON.stringify(raw).includes('ownerPid'), false);
  });
  check('遺品状態は非公開 sidecar へ分離される', () => {
    const privateData = JSON.parse(fs.readFileSync(sidecarPath(saveFile), 'utf8'));
    assert.strictEqual(privateData.format, 'lowpoly-island-rogue-recovery');
    assert.deepStrictEqual(privateData.rogueRecovery, recovery);
    assert.deepStrictEqual(loadServerSave(saveFile), { world, rogueRecovery: recovery });
  });

  // Simulate a server upgraded from v62.0's one-file envelope.
  fs.unlinkSync(saveFile);
  fs.unlinkSync(sidecarPath(saveFile));
  const oldEnvelope = { format: 'lowpoly-island-server-save', version: 1, world, rogueRecovery: recovery };
  fs.writeFileSync(saveFile, JSON.stringify(oldEnvelope));
  check('v62.0の旧保存ファイルからワールドと遺品状態を両方読み込む', () => {
    assert.deepStrictEqual(loadServerSave(saveFile), { world, rogueRecovery: recovery });
  });
  writeServerSave(saveFile, world, recovery);
  check('v62.0形式は次回保存で互換形式へ移行し、遺品を保持する', () => {
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(saveFile, 'utf8')), world);
    assert.deepStrictEqual(loadServerSave(saveFile), { world, rogueRecovery: recovery });
  });

  // A newer empty sidecar must suppress stale bags embedded by a previous version.
  fs.writeFileSync(saveFile, JSON.stringify(oldEnvelope));
  writeSidecarEmpty();
  function writeSidecarEmpty() {
    fs.writeFileSync(sidecarPath(saveFile), JSON.stringify({
      format: 'lowpoly-island-rogue-recovery', version: 1, rogueRecovery: { version: 1, rooms: [] }
    }));
  }
  check('回収済みを表す空の新sidecarは旧ラッパー内の遺品を復活させない', () => {
    assert.deepStrictEqual(loadServerSave(saveFile), { world, rogueRecovery: { version: 1, rooms: [] } });
  });

  // Existing v61.9 and earlier raw world files remain loadable without a sidecar.
  fs.writeFileSync(saveFile, JSON.stringify(world));
  fs.unlinkSync(sidecarPath(saveFile));
  check('旧版の raw world.json も引き続き読み込める', () => {
    assert.deepStrictEqual(loadServerSave(saveFile), { world, rogueRecovery: null });
  });
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
if (!process.exitCode) console.log('Server save compatibility checks passed.');
