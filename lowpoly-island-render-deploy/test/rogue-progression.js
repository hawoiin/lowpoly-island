// v61: 生還・死亡・保管庫におけるローグライク進行データのテスト
'use strict';
const assert = require('assert');
const P = require('../public/rogue-progression.js');
class MemoryStorage {
  constructor(initial = {}) { this.map = new Map(Object.entries(initial)); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k,v) { this.map.set(k,String(v)); }
}
function check(name, fn) { try { fn(); console.log('PASS ' + name); } catch (e) { console.error('FAIL ' + name + ': ' + e.message); process.exitCode=1; } }

check('旧恒久強化は欠片を維持し、保管庫装備に変換される', () => {
  const store=new MemoryStorage({[P.LEGACY_KEY]:JSON.stringify({shards:37,attack:9,armor:7})});
  const s=P.load(store);
  assert.equal(s.shards,37); assert.equal(s.stash.weaponBonus,3); assert.equal(s.stash.armorBonus,2);
  assert.equal(s.equipped.weaponBonus,0); assert.equal(s.equipped.armorBonus,0);
  assert.ok(store.getItem(P.KEY));
});
check('生還は携行装備と欠片を精算し、次の挑戦へ持ち越す', () => {
  const store=new MemoryStorage(); const s=P.load(store);
  P.beginRun(s,store);
  P.survive(s,{shards:11,weaponBonus:3,armorBonus:2},store);
  const next=P.load(store);
  assert.equal(next.shards,11); assert.equal(next.equipped.weaponBonus,3); assert.equal(next.equipped.armorBonus,2);
  assert.equal(next.runInProgress,false);
});
check('死亡は携行装備だけ失い、保管庫と精算済み欠片を残す', () => {
  const store=new MemoryStorage(); const s=P.load(store);
  s.shards=24; s.equipped.weaponBonus=2; s.equipped.armorBonus=1; s.stash.weaponBonus=3; s.stash.armorBonus=2;
  P.save(store,s); P.beginRun(s,store); P.die(s,store);
  const after=P.load(store);
  assert.equal(after.shards,24); assert.equal(after.equipped.weaponBonus,0); assert.equal(after.equipped.armorBonus,0);
  assert.equal(after.stash.weaponBonus,3); assert.equal(after.stash.armorBonus,2); assert.equal(after.runInProgress,false);
});
check('ダンジョン中の再読み込みは死亡扱いになり携行装備を巻き戻さない', () => {
  const store=new MemoryStorage(); const s=P.load(store);
  s.equipped.weaponBonus=2; s.stash.armorBonus=1; P.save(store,s); P.beginRun(s,store);
  const after=P.load(store);
  assert.equal(after.equipped.weaponBonus,0); assert.equal(after.equipped.armorBonus,0);
  assert.equal(after.stash.armorBonus,1); assert.equal(after.runInProgress,false);
});
check('保管庫への預け入れ・取り出し・交換で装備を二重所持しない', () => {
  const store=new MemoryStorage(); const s=P.load(store); const run={weaponBonus:2,armorBonus:1};
  assert.equal(P.deposit(s,run,'weapon',store),true); assert.equal(run.weaponBonus,0); assert.equal(s.stash.weaponBonus,2);
  assert.equal(P.withdraw(s,run,'weapon',store),true); assert.equal(run.weaponBonus,2); assert.equal(s.stash.weaponBonus,0);
  run.weaponBonus=1; s.stash.weaponBonus=3;
  assert.equal(P.deposit(s,run,'weapon',store),true); assert.equal(run.weaponBonus,3); assert.equal(s.stash.weaponBonus,1);
  assert.equal(P.withdraw(s,run,'weapon',store),false);
});
check('欠片は恒久ステータスでなく保管庫装備の購入に使われる', () => {
  const store=new MemoryStorage(); const s=P.load(store); s.shards=16; P.save(store,s);
  assert.equal(P.buyStoredGear(s,'weapon',8,store),true);
  assert.equal(s.shards,8); assert.equal(s.stash.weaponBonus,1);
  assert.equal(P.buyStoredGear(s,'weapon',8,store),false);
  assert.equal(P.buyStoredGear(s,'armor',8,store),true);
  assert.equal(s.shards,0); assert.equal(s.stash.armorBonus,1);
});
check('不正なセーブ値を上限内へ正規化する', () => {
  const store=new MemoryStorage({[P.KEY]:JSON.stringify({shards:-10,equipped:{weaponBonus:999,armorBonus:-1},stash:{weaponBonus:2.9,armorBonus:1},runInProgress:false})});
  const s=P.load(store);
  assert.equal(s.shards,0); assert.equal(s.equipped.weaponBonus,3); assert.equal(s.equipped.armorBonus,0);
  assert.equal(s.stash.weaponBonus,2); assert.equal(s.stash.armorBonus,1);
});
if (!process.exitCode) console.log('Rogue progression persistence checks passed.');
