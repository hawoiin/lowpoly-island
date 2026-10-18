// 建築物の一括回収: サーバー権限・距離検証とUIの回帰チェック。
'use strict';
const fs = require('fs');
const path = require('path');
const Shared = require('../public/shared.js');
const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
let failed = 0, passed = 0;
function check(name, ok) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name);
  if (ok) passed++; else failed++;
}
function makeSim({ pickupOthers = false, secondClient = false } = {}) {
  const sim = new Shared.WorldSim({ seed: 24680, pickupOthers });
  const sent = [], broadcast = [];
  sim.out = {
    sendTo(id, msg) { sent.push({ id, msg }); },
    broadcast(msg) { broadcast.push(msg); },
  };
  sim.addClient(1);
  sim.handle(1, { t: 'join', name: 'builder', key: 'builder-bulk-key' });
  sim.handle(1, { t: 'state', x: 20, y: Shared.islandHeight(20, 20), z: 20, ry: 0, cave: -1, f: 0 });
  if (secondClient) {
    sim.addClient(2);
    sim.handle(2, { t: 'join', name: 'other', key: 'other-bulk-key' });
    sim.handle(2, { t: 'state', x: 20, y: Shared.islandHeight(20, 20), z: 20, ry: 0, cave: -1, f: 0 });
  }
  const pid = sim.clients.get(1).pid;
  const add = (sid, x, z, owner = pid) => {
    sim.structures.set(sid, { sid, buildId: 'fence', x, y: Shared.islandHeight(x, z), z, ry: 0, owner });
    sim.nextSid = Math.max(sim.nextSid, sid + 1);
  };
  return { sim, sent, broadcast, add, pid };
}

{
  const t = makeSim({ secondClient: true });
  t.add(1, 20, 20);
  t.add(2, 22, 20);
  t.add(3, 34, 20); // 14m離れている
  t.add(4, 20, 22, t.sim.clients.get(2).pid); // 他人の建築物
  t.sim.handle(1, { t: 'pickupMany', requestId: 7, sids: [1, 2, 3, 4, 2] });
  const result = t.sent.map(x => x.msg).find(m => m.t === 'pickupManyResult');
  check('選択した自分の複数建築物をまとめて回収する', !t.sim.structures.has(1) && !t.sim.structures.has(2));
  check('重複sidを二重回収せず件数も重複させない', result && result.recovered === 2 && result.skipped === 2);
  check('範囲外の建築物は残す', t.sim.structures.has(3));
  check('他人の建築物を回収対象に混ぜても残す', t.sim.structures.has(4));
  check('回収結果に要求IDを含め、クライアントが対応付けられる', result && result.requestId === 7);
  check('回収された建築物ごとに同期イベントを送る', t.broadcast.filter(m => m.t === 'removed').length === 2);
}

{
  const t = makeSim();
  t.add(1, 20, 20); t.add(2, 21, 20);
  t.sim.handle(1, { t: 'pickupMany', requestId: 8, sids: Array(Shared.MAX_BULK_PICKUP_IDS + 1).fill(1) });
  const result = t.sent.map(x => x.msg).find(m => m.t === 'pickupManyResult');
  check('上限を超える一括回収要求は全件拒否し、建築物を変更しない', result && result.reason === 'bad' && result.recovered === 0 && t.sim.structures.size === 2);
  t.sim.handle(1, { t: 'pickupMany', requestId: 9, sids: [1, '2'] });
  const malformed = t.sent.map(x => x.msg).filter(m => m.t === 'pickupManyResult').pop();
  check('不正なsidが混在する要求は一括拒否する', malformed && malformed.reason === 'bad' && t.sim.structures.size === 2);
  t.sim.handle(1, { t: 'pickupMany', requestId: 10, sids: [] });
  const empty = t.sent.map(x => x.msg).filter(m => m.t === 'pickupManyResult').pop();
  check('空の選択では何も回収しない', empty && empty.recovered === 0 && t.sim.structures.size === 2);
}

{
  const t = makeSim();
  t.add(1, 20, 20);
  const c = t.sim.clients.get(1);
  c.dead = true;
  t.sim.handle(1, { t: 'pickupMany', requestId: 11, sids: [1] });
  check('死亡中は一括回収できない', t.sim.structures.has(1) && t.sent.some(x => x.msg.t === 'pickupManyResult' && x.msg.requestId === 11 && x.msg.recovered === 0));
  c.dead = false; c.cave = 0;
  t.sim.handle(1, { t: 'pickupMany', requestId: 12, sids: [1] });
  check('洞窟内は一括回収できない', t.sim.structures.has(1) && t.sent.some(x => x.msg.t === 'pickupManyResult' && x.msg.requestId === 12 && x.msg.recovered === 0));
  c.cave = -1; c.hasState = false;
  t.sim.handle(1, { t: 'pickupMany', requestId: 13, sids: [1] });
  check('位置未確定の参加者は一括回収できない', t.sim.structures.has(1) && t.sent.some(x => x.msg.t === 'pickupManyResult' && x.msg.requestId === 13 && x.msg.recovered === 0));
}

{
  const t = makeSim({ pickupOthers: true, secondClient: true });
  t.add(1, 20, 20, t.sim.clients.get(2).pid);
  t.sim.handle(1, { t: 'pickupMany', requestId: 14, sids: [1] });
  check('サーバーが他人の建築物の回収を許可していればまとめて回収できる', !t.sim.structures.has(1));
}

check('ビルドメニューから一括回収画面を開ける', /id="bulkRecoverOpen"[^>]*>建築物をまとめて回収/.test(html));
check('一括回収画面に全選択・選択解除・キャンセルがある', /id="bulkRecoverSelectAll"/.test(html) && /id="bulkRecoverSelectNone"/.test(html) && /id="bulkRecoverCancel"/.test(html));
check('回収対象の選択がチェックボックスと連動する', /checkbox\.addEventListener\('change'/.test(html) && /setBulkRecoverSelection\(sid, checkbox\.checked\)/.test(html));
check('選択中の建築物をワールド上で視覚的に強調する', /function setBulkRecoverHighlight/.test(html) && /mat\.emissive\.set\(0xffc45b\)/.test(html));
check('一括回収ボタンは選択したsidだけをサーバーへ送る', /Net\.send\(\{ t:'pickupMany', sids, requestId \}\)/.test(html));
check('成功した個々の回収は既存removed処理で手持ち建築数に戻る', /case 'removed': removeStructure\(m\.sid, m\.by === NET_ID\)/.test(html) && /heldStructures\[s\.userData\.buildId\].*\+ 1/.test(html));
check('回収結果の応答が来るまで重複送信を防ぐ', /if \(bulkRecoverPending\) return/.test(html) && /bulkRecoverPending = true/.test(html));

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
