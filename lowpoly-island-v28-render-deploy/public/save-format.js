// セーブファイルのスキーマと検証。ブラウザとNode.jsの両方で使う純粋関数。
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SaveFormat = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const FORMAT = 'lowpoly-island-backup';
  const VERSION = 1;
  const MAX_FILE_BYTES = 256 * 1024;
  const MAX_COUNT = 1000000;
  const INVENTORY_KEYS = ['wood', 'stone', 'herb', 'crystal', 'relic'];
  const ITEM_IDS = [
    'item_blue_mushroom', 'item_red_mushroom', 'item_white_flower', 'item_moonlight_herb',
    'item_amber', 'item_fossil', 'item_mystery_stone', 'item_silver_ore', 'item_old_key',
    'item_ancient_coin', 'item_deep_crystal', 'item_ancient_gold', 'item_seaweed', 'item_pearl_shell',
    'item_coral', 'item_seashell'
  ];
  const BUILD_IDS = ['campfire', 'hut', 'cabin', 'fence', 'gate', 'floor'];
  const CATEGORY_IDS = ['plant', 'mineral', 'relic', 'underwater'];
  const MAX_CAVES = 2;
  const MAX_STRUCTURES = 400;
  const MAX_CHESTS = 7; // shared.js の MAX_CHESTS と同じ値(テストで一致を確認)

  function isRecord(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }
  function fail(message) { throw new Error(message); }
  function count(value, label) {
    if (!Number.isSafeInteger(value) || value < 0 || value > MAX_COUNT) fail(label + ' の数値が不正です');
    return value;
  }
  function cleanCountRecord(source, keys, label) {
    if (!isRecord(source)) fail(label + ' の形式が不正です');
    const out = Object.create(null);
    for (const key of keys) out[key] = source[key] === undefined ? 0 : count(source[key], label + '.' + key);
    return out;
  }

  function normalizePlayer(raw) {
    if (!isRecord(raw)) fail('プレイヤーデータがありません');
    if (!isRecord(raw.inv) || !isRecord(raw.collected) || !Array.isArray(raw.discovered) ||
        !isRecord(raw.held) || !isRecord(raw.claimed) || !Array.isArray(raw.seenCaves)) {
      fail('プレイヤーデータの形式が古いか壊れています');
    }
    const inv = cleanCountRecord(raw.inv, INVENTORY_KEYS, '所持品');
    const collected = cleanCountRecord(raw.collected, ITEM_IDS, '収集アイテム');
    const held = cleanCountRecord(raw.held, BUILD_IDS, '所持建築物');
    const discovered = [];
    const discoveredSet = new Set();
    for (const id of raw.discovered) {
      if (typeof id !== 'string' || !ITEM_IDS.includes(id)) fail('未知の図鑑アイテムが含まれています');
      if (!discoveredSet.has(id)) { discoveredSet.add(id); discovered.push(id); }
    }
    const claimed = Object.create(null);
    for (const id of CATEGORY_IDS) {
      if (raw.claimed[id] !== undefined && typeof raw.claimed[id] !== 'boolean') fail('コレクション報酬の状態が不正です');
      claimed[id] = raw.claimed[id] === true;
    }
    const seenCaves = [];
    const seenSet = new Set();
    for (const idx of raw.seenCaves) {
      if (!Number.isInteger(idx) || idx < 0 || idx >= MAX_CAVES) fail('洞窟の発見データが不正です');
      if (!seenSet.has(idx)) { seenSet.add(idx); seenCaves.push(idx); }
    }
    if (typeof raw.codexDone !== 'boolean') fail('図鑑完了フラグが不正です');
    if (!Number.isInteger(raw.swordLv) || raw.swordLv < 1 || raw.swordLv > 2) fail('剣の強化段階が不正です');
    return {
      inv: Object.fromEntries(INVENTORY_KEYS.map(k => [k, inv[k]])),
      collected: Object.fromEntries(ITEM_IDS.filter(k => collected[k] > 0).map(k => [k, collected[k]])),
      discovered,
      swordLv: raw.swordLv,
      held: Object.fromEntries(BUILD_IDS.map(k => [k, held[k]])),
      claimed: Object.fromEntries(CATEGORY_IDS.map(k => [k, claimed[k]])),
      codexDone: raw.codexDone,
      seenCaves
    };
  }

  function normalizeSettings(raw) {
    if (!isRecord(raw)) fail('設定データの形式が不正です');
    if (typeof raw.volume !== 'number' || !Number.isFinite(raw.volume) || raw.volume < 0 || raw.volume > 1 ||
        typeof raw.sens !== 'number' || !Number.isFinite(raw.sens) || raw.sens < 0.5 || raw.sens > 2 ||
        typeof raw.shake !== 'boolean') fail('設定値が範囲外です');
    return { volume: raw.volume, sens: raw.sens, shake: raw.shake };
  }

  function normalizeWorld(raw) {
    if (!isRecord(raw)) fail('ワールドデータの形式が不正です');
    if (!Number.isInteger(raw.layoutVersion) || raw.layoutVersion < 1) fail('ワールドの配置バージョンが不正です');
    if (!Number.isInteger(raw.seed) || raw.seed < 0 || raw.seed > 0xffffffff) fail('ワールドのシードが不正です');
    if (!Array.isArray(raw.structures) || raw.structures.length > MAX_STRUCTURES) fail('建築物データの件数が不正です');
    if (!Array.isArray(raw.chests) || raw.chests.length > MAX_CHESTS) fail('宝箱データの件数が不正です');
    const structures = [];
    const ids = new Set();
    let maxSid = 0;
    for (const s of raw.structures) {
      if (!isRecord(s) || !Number.isSafeInteger(s.sid) || s.sid < 1 || s.sid > 1000000000 || ids.has(s.sid) ||
          !BUILD_IDS.includes(s.buildId) || ![s.x, s.y, s.z, s.ry].every(v => typeof v === 'number' && Number.isFinite(v)) ||
          Math.hypot(s.x, s.z) > 1000 || s.y < -100 || s.y > 200 || Math.abs(s.ry) > 1000 ||
          (s.owner !== undefined && (typeof s.owner !== 'string' || s.owner.length > 64)) ||
          (s.open !== undefined && typeof s.open !== 'boolean')) {
        fail('建築物データに不正な項目があります');
      }
      ids.add(s.sid);
      maxSid = Math.max(maxSid, s.sid);
      const normalized = { sid:s.sid, buildId:s.buildId, x:s.x, y:s.y, z:s.z, ry:s.ry, owner:s.owner || '' };
      if (s.buildId === 'gate') normalized.open = s.open === true;
      structures.push(normalized);
    }
    if (!Number.isSafeInteger(raw.nextSid) || raw.nextSid <= maxSid || raw.nextSid > 1000000000) fail('次の建築IDが不正です');
    const chests = [];
    const chestSet = new Set();
    for (const idx of raw.chests) {
      if (!Number.isInteger(idx) || idx < 0 || idx >= MAX_CHESTS || chestSet.has(idx)) fail('宝箱の開封状態が不正です');
      chestSet.add(idx); chests.push(idx);
    }
    return { layoutVersion:raw.layoutVersion, seed:raw.seed, nextSid:raw.nextSid, structures, chests };
  }

  function createBundle(player, settings, world) {
    return {
      format: FORMAT,
      version: VERSION,
      exportedAt: new Date().toISOString(),
      player: normalizePlayer(player),
      settings: normalizeSettings(settings),
      world: normalizeWorld(world)
    };
  }

  function parseBundle(text) {
    if (typeof text !== 'string') fail('ファイルを読み込めません');
    // UTF-16文字数を上限として使い、ブラウザに重いJSONを渡す前に拒否する。
    if (text.length > MAX_FILE_BYTES) fail('セーブファイルが大きすぎます');
    let data;
    try { data = JSON.parse(text); } catch (_) { fail('JSONファイルを読み取れません'); }
    if (!isRecord(data) || data.format !== FORMAT || data.version !== VERSION) fail('対応していないセーブファイルです');
    return {
      format: FORMAT, version: VERSION,
      exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt.slice(0, 64) : '',
      player: normalizePlayer(data.player),
      settings: normalizeSettings(data.settings),
      world: normalizeWorld(data.world)
    };
  }

  return { FORMAT, VERSION, MAX_FILE_BYTES, normalizePlayer, normalizeSettings, normalizeWorld, createBundle, parseBundle };
});
