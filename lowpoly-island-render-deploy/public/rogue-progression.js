// ローグライク進行データ v61
// 生還時は携行装備を保持し、死亡・中断再読込では携行装備だけを失う。
// 保管庫と精算済み欠片は localStorage に残る。
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RogueProgression = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const KEY = 'lowpoly-island-rogue-progress-v61';
  const LEGACY_KEY = 'lowpoly-island-rogue-meta-v60';
  const WEAPON_MAX = 3;
  const ARMOR_MAX = 2;
  const SHARDS_MAX = 999999;

  function integer(value, max) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, Math.min(max, Math.floor(n))) : 0;
  }
  function emptyState() {
    return {
      version: 1,
      shards: 0,
      equipped: { weaponBonus: 0, armorBonus: 0 },
      stash: { weaponBonus: 0, armorBonus: 0 },
      runInProgress: false
    };
  }
  function normalize(raw) {
    const state = emptyState();
    if (!raw || typeof raw !== 'object') return state;
    state.shards = integer(raw.shards, SHARDS_MAX);
    const equipped = raw.equipped && typeof raw.equipped === 'object' ? raw.equipped : {};
    const stash = raw.stash && typeof raw.stash === 'object' ? raw.stash : {};
    state.equipped.weaponBonus = integer(equipped.weaponBonus, WEAPON_MAX);
    state.equipped.armorBonus = integer(equipped.armorBonus, ARMOR_MAX);
    state.stash.weaponBonus = integer(stash.weaponBonus, WEAPON_MAX);
    state.stash.armorBonus = integer(stash.armorBonus, ARMOR_MAX);
    state.runInProgress = raw.runInProgress === true;
    return state;
  }
  function read(storage, key) {
    try {
      const text = storage && storage.getItem(key);
      return text ? JSON.parse(text) : null;
    } catch (_) { return null; }
  }
  function save(storage, state) {
    const clean = normalize(state);
    try { if (storage) storage.setItem(KEY, JSON.stringify(clean)); } catch (_) { /* private mode or quota */ }
    Object.assign(state, clean);
    return state;
  }
  function legacyWeaponTier(level) {
    const n = integer(level, 12);
    return n <= 0 ? 0 : n >= 9 ? 3 : n >= 5 ? 2 : 1;
  }
  function legacyArmorTier(level) {
    const n = integer(level, 12);
    return n <= 0 ? 0 : n >= 7 ? 2 : 1;
  }
  function load(storage) {
    const current = read(storage, KEY);
    let state;
    if (current && typeof current === 'object') {
      state = normalize(current);
    } else {
      const legacy = read(storage, LEGACY_KEY) || {};
      state = emptyState();
      state.shards = integer(legacy.shards, SHARDS_MAX);
      // 旧版の恒久ステータス購入は、同等の上限帯に丸めた保管庫装備へ移行する。
      // これにより旧セーブの投資を失わせず、以降の能力上昇は装備の着脱として扱う。
      state.stash.weaponBonus = legacyWeaponTier(legacy.attack);
      state.stash.armorBonus = legacyArmorTier(legacy.armor);
    }
    // ダンジョン内でブラウザを再読み込みした場合は死亡と同じ扱い。
    // 保管庫と精算済み通貨を保護しつつ、携行装備や未精算戦利品の巻き戻しを防ぐ。
    if (state.runInProgress) {
      state.equipped.weaponBonus = 0;
      state.equipped.armorBonus = 0;
      state.runInProgress = false;
    }
    save(storage, state);
    return state;
  }
  function beginRun(state, storage) {
    state.runInProgress = true;
    return save(storage, state);
  }
  function survive(state, run, storage) {
    run = run || {};
    state.shards = integer(state.shards + integer(run.shards, SHARDS_MAX), SHARDS_MAX);
    state.equipped.weaponBonus = integer(run.weaponBonus, WEAPON_MAX);
    state.equipped.armorBonus = integer(run.armorBonus, ARMOR_MAX);
    state.runInProgress = false;
    return save(storage, state);
  }
  function die(state, storage) {
    state.equipped.weaponBonus = 0;
    state.equipped.armorBonus = 0;
    state.runInProgress = false;
    return save(storage, state);
  }
  function buyStoredGear(state, slot, cost, storage) {
    if (slot !== 'weapon' && slot !== 'armor') return false;
    const field = slot === 'weapon' ? 'weaponBonus' : 'armorBonus';
    const max = slot === 'weapon' ? WEAPON_MAX : ARMOR_MAX;
    const price = integer(cost, SHARDS_MAX);
    if (state.stash[field] > 0 || state.shards < price || price <= 0 || max < 1) return false;
    state.shards -= price;
    state.stash[field] = 1;
    save(storage, state);
    return true;
  }
  function deposit(state, run, slot, storage) {
    if (!run || (slot !== 'weapon' && slot !== 'armor')) return false;
    const field = slot === 'weapon' ? 'weaponBonus' : 'armorBonus';
    const max = slot === 'weapon' ? WEAPON_MAX : ARMOR_MAX;
    const carried = integer(run[field], max);
    if (carried <= 0) return false;
    // 保管庫が埋まっていれば預ける動作で装備を交換する。より良い装備を取り出せなくなるのを防ぐ。
    const stored = integer(state.stash[field], max);
    state.stash[field] = carried;
    run[field] = stored;
    save(storage, state);
    return true;
  }
  function withdraw(state, run, slot, storage) {
    if (!run || (slot !== 'weapon' && slot !== 'armor')) return false;
    const field = slot === 'weapon' ? 'weaponBonus' : 'armorBonus';
    if (state.stash[field] <= 0 || integer(run[field], slot === 'weapon' ? WEAPON_MAX : ARMOR_MAX) > 0) return false;
    run[field] = state.stash[field];
    state.stash[field] = 0;
    save(storage, state);
    return true;
  }
  return { KEY, LEGACY_KEY, WEAPON_MAX, ARMOR_MAX, emptyState, normalize, load, save, beginRun, survive, die, buyStoredGear, deposit, withdraw };
});
