'use strict';
// 探索の島 マルチプレイサーバー: 静的配信(public/) + WebSocket同期
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const Shared = require('./public/shared.js');
const { isFreePlanMode, resolveFreeWorldSeed, isAllowedRestoreSeed, loadRuntimeSave, writeRuntimeSave } = require('./server-save.js');

const PORT = +process.env.PORT || 4010;
const MAX_PLAYERS = +process.env.MAX_PLAYERS || 16;
const PUBLIC = path.join(__dirname, 'public');
const SAVE_FILE = process.env.SAVE_FILE || path.join(__dirname, 'world.json');
const FREE_PLAN_MODE = isFreePlanMode();
const FREE_WORLD_SEED = resolveFreeWorldSeed();
const SERVER_SESSION_ID = crypto.randomBytes(12).toString('hex');
const PICKUP_OTHERS = process.env.PICKUP_OTHERS === '1'; // 1 なら他人の建築物も回収できる(既定は建てた人だけ)
// 管理操作と共有ワールドの復元は全員に影響するため、サーバー側の管理者キーを要求する。
// 未指定ならサーバー起動ごとに推測不能なキーを生成し、ホストのコンソールにだけ表示する。
const SAVE_ADMIN_TOKEN = process.env.SAVE_ADMIN_TOKEN || crypto.randomBytes(24).toString('hex');
// 敵の攻撃予告範囲はサーバー起動時OFF。管理者が有効化した場合だけ全参加者へ反映する。
let enemyAttackRangeDisplayEnabled = false;

const { world: saved, rogueRecovery: savedRogueRecovery } = loadRuntimeSave(SAVE_FILE, FREE_PLAN_MODE);

const sim = new Shared.WorldSim({ saved, seed: FREE_PLAN_MODE && !saved ? FREE_WORLD_SEED : undefined, pickupOthers: PICKUP_OTHERS, rogueRecoveryState:savedRogueRecovery });
const sockets = new Map();
let nextId = 1;

sim.out = {
  sendTo(id, msg) {
    const ws = sockets.get(id);
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
  },
  broadcast(msg, except) {
    const s = JSON.stringify(msg);
    for (const [id, ws] of sockets) if (id !== except && ws.readyState === 1) ws.send(s);
  },
};
function sendJson(ws, message) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(message));
}
function adminPlayersSnapshot() {
  const now = Date.now();
  return [...sim.clients.values()].filter(c => c.joined).map(c => ({
    id:c.id, name:c.name, secondsOnline:Math.max(0, Math.floor((now - (c.joinedAt || now)) / 1000)), cave:c.cave >= 0,
  }));
}
function sendAdminPlayers(ws) {
  if (!ws || !ws.isAdmin) return;
  sendJson(ws, { t:'adminPlayersResult', players:adminPlayersSnapshot() });
}
function broadcastAdminPlayers() {
  for (const ws of sockets.values()) if (ws.isAdmin && ws.readyState === 1) sendAdminPlayers(ws);
}
function tokenMatches(value) {
  const supplied = typeof value === 'string' ? Buffer.from(value, 'utf8') : Buffer.alloc(0);
  const expected = Buffer.from(SAVE_ADMIN_TOKEN, 'utf8');
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent((req.url || '/').split('?')[0]); } catch (e) { res.writeHead(400); return res.end('bad request'); }
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
});

// 普通メッセージは従来どおり2KiB以内。大きいペイロードはバックアップのワールド復元だけに許可する。
const wss = new WebSocketServer({ server, maxPayload: 128 * 1024 });
wss.on('connection', ws => {
  if (sockets.size >= MAX_PLAYERS) { ws.close(1013, 'full'); return; }
  const id = nextId++;
  sockets.set(id, ws);
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.isAdmin = false;
  let budget = 120; // 1秒あたりの受信上限(スパム対策)
  let lastSaveOperationAt = 0;
  let lastLargePayloadAt = 0;
  let authWindowAt = Date.now();
  let authAttempts = 0;
  const refill = setInterval(() => { budget = 120; }, 1000);

  const welcome = sim.addClient(id);
  welcome.serverSessionId = SERVER_SESSION_ID;
  welcome.freePlanMode = FREE_PLAN_MODE;
  ws.send(JSON.stringify(welcome));
  // 再参加者も現在の管理者設定を受け取る。新規サーバー起動時の既定値はOFF。
  sendJson(ws, { t:'attackRangeDisplayState', enabled:enemyAttackRangeDisplayEnabled });

  ws.on('message', data => {
    if (--budget < 0) return;
    const payloadBytes = Number.isFinite(data && data.length) ? data.length : (Number.isFinite(data && data.byteLength) ? data.byteLength : 0);
    if (payloadBytes > 128 * 1024) return;
    // 大きいメッセージのJSON parse自体を連打されないよう、パース前にも間隔を設ける。
    if (payloadBytes > 2048) {
      const now = Date.now();
      if (now - lastLargePayloadAt < 1200) return;
      lastLargePayloadAt = now;
    }
    let m;
    try { m = JSON.parse(data.toString()); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;
    if (payloadBytes > 2048 && m.t !== 'worldImport' && m.t !== 'adminWorldRestore') return;
    try {
      if (m.t === 'adminAuth') {
        const now = Date.now();
        if (now - authWindowAt >= 60000) { authWindowAt = now; authAttempts = 0; }
        if (++authAttempts > 5) {
          ws.isAdmin = false;
          sendJson(ws, { t:'adminAuthResult', ok:false, reason:'rateLimit' });
          return;
        }
        ws.isAdmin = tokenMatches(m.token);
        sendJson(ws, { t:'adminAuthResult', ok:ws.isAdmin, reason:ws.isAdmin ? undefined : 'unauthorized' });
        return;
      }
      if (m.t === 'adminLogout') {
        ws.isAdmin = false;
        sendJson(ws, { t:'adminLoggedOut' });
        return;
      }
      if (m.t === 'adminSetAttackRangeDisplay') {
        if (!ws.isAdmin) {
          sendJson(ws, { t:'adminAttackRangeDisplayResult', ok:false, enabled:enemyAttackRangeDisplayEnabled, reason:'unauthorized' });
          return;
        }
        if (typeof m.enabled !== 'boolean') {
          sendJson(ws, { t:'adminAttackRangeDisplayResult', ok:false, enabled:enemyAttackRangeDisplayEnabled, reason:'invalid' });
          return;
        }
        enemyAttackRangeDisplayEnabled = m.enabled;
        // 全参加者へ同期。これは見た目だけの設定で、攻撃判定・ダメージは変わらない。
        sim.out.broadcast({ t:'attackRangeDisplayState', enabled:enemyAttackRangeDisplayEnabled });
        sendJson(ws, { t:'adminAttackRangeDisplayResult', ok:true, enabled:enemyAttackRangeDisplayEnabled });
        return;
      }
      if (m.t === 'adminPlayers') {
        if (!ws.isAdmin) { sendJson(ws, { t:'adminAuthResult', ok:false, reason:'unauthorized' }); return; }
        sendAdminPlayers(ws);
        return;
      }
      if (m.t === 'adminKick') {
        if (!ws.isAdmin) { sendJson(ws, { t:'adminKickResult', ok:false, reason:'unauthorized' }); return; }
        const targetId = Number.isSafeInteger(m.targetId) ? m.targetId : -1;
        if (targetId === id) { sendJson(ws, { t:'adminKickResult', ok:false, reason:'self' }); return; }
        const targetState = sim.clients.get(targetId);
        const targetWs = sockets.get(targetId);
        if (!targetState || !targetState.joined || !targetWs || targetWs.readyState !== 1) {
          sendJson(ws, { t:'adminKickResult', ok:false, reason:'notFound' }); return;
        }
        sendJson(ws, { t:'adminKickResult', ok:true, targetId, name:targetState.name });
        // クライアントへ理由を知らせ、自動再接続ループに入らず画面を止める。
        sendJson(targetWs, { t:'kicked', reason:'admin' });
        setTimeout(() => { try { if (targetWs.readyState === 1) targetWs.close(4001, 'kicked by administrator'); } catch (_) {} }, 50);
        setTimeout(broadcastAdminPlayers, 150);
        return;
      }
      if (m.t === 'adminWorldBackup') {
        if (!ws.isAdmin) { sendJson(ws, { t:'adminWorldBackupResult', requestId:m.requestId, ok:false, reason:'unauthorized' }); return; }
        const now = Date.now();
        if (now - lastSaveOperationAt < 1200) { sendJson(ws, { t:'adminWorldBackupResult', requestId:m.requestId, ok:false, reason:'rateLimit' }); return; }
        lastSaveOperationAt = now;
        const world = sim.serialize();
        const savedAt = new Date().toISOString();
        const envelope = { format:'lowpoly-island-world-backup', version:1, savedAt, world };
        if (Buffer.byteLength(JSON.stringify(envelope, null, 2), 'utf8') > 120 * 1024) {
          sendJson(ws, { t:'adminWorldBackupResult', requestId:m.requestId, ok:false, reason:'backupTooLarge' }); return;
        }
        sendJson(ws, { t:'adminWorldBackupResult', requestId:m.requestId, ok:true, savedAt, world });
        return;
      }
      if (m.t === 'adminWorldRestore') {
        const requestId = Number.isSafeInteger(m.requestId) && m.requestId >= 0 ? m.requestId : null;
        if (!ws.isAdmin) { sendJson(ws, { t:'adminWorldRestoreResult', requestId, ok:false, reason:'unauthorized' }); return; }
        const now = Date.now();
        if (now - lastSaveOperationAt < 1200) { sendJson(ws, { t:'adminWorldRestoreResult', requestId, ok:false, reason:'rateLimit' }); return; }
        lastSaveOperationAt = now;
        if (!isAllowedRestoreSeed(m.world, FREE_PLAN_MODE, FREE_WORLD_SEED)) {
          sendJson(ws, { t:'adminWorldRestoreResult', requestId, ok:false, reason:'seedMismatch' }); return;
        }
        // 復元前の状態をレスポンスに含め、管理者ブラウザへ自動保存させる。
        const beforeWorld = sim.serialize();
        const beforeSavedAt = new Date().toISOString();
        // 復元前バックアップをブラウザへ確実に渡せない大きさなら、ワールドを変更しない。
        const beforeBackupBytes = Buffer.byteLength(JSON.stringify({ format:'lowpoly-island-world-backup', version:1, savedAt:beforeSavedAt, world:beforeWorld }, null, 2), 'utf8');
        if (beforeBackupBytes > 120 * 1024) {
          sendJson(ws, { t:'adminWorldRestoreResult', requestId, ok:false, reason:'backupTooLarge' });
          return;
        }
        const result = sim.restoreWorld(m.world);
        sendJson(ws, Object.assign({ t:'adminWorldRestoreResult', requestId, beforeWorld:result.ok ? beforeWorld : undefined, beforeSavedAt }, result));
        if (result.ok) save();
        return;
      }
      if (m.t === 'saveExport' || m.t === 'worldImport') {
        const now = Date.now();
        if (now - lastSaveOperationAt < 1200) {
          if (m.t === 'worldImport') {
            const live = sockets.get(id);
            if (live && live.readyState === 1) live.send(JSON.stringify({ t:'worldImportResult', requestId:m.requestId, ok:false, reason:'rateLimit' }));
          }
          return;
        }
        lastSaveOperationAt = now;
      }
      if (m.t === 'worldImport') {
        const requestId = Number.isSafeInteger(m.requestId) && m.requestId >= 0 ? m.requestId : null;
        const sendResult = result => {
          const live = sockets.get(id);
          if (live && live.readyState === 1) live.send(JSON.stringify(Object.assign({ t:'worldImportResult', requestId }, result)));
        };
        const supplied = typeof m.adminToken === 'string' ? Buffer.from(m.adminToken, 'utf8') : Buffer.alloc(0);
        const expected = Buffer.from(SAVE_ADMIN_TOKEN, 'utf8');
        const authorized = supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
        if (!authorized) { sendResult({ ok:false, reason:'unauthorized' }); return; }
        if (!isAllowedRestoreSeed(m.world, FREE_PLAN_MODE, FREE_WORLD_SEED)) {
          sendResult({ ok:false, reason:'seedMismatch' }); return;
        }
        const result = sim.restoreWorld(m.world);
        sendResult(result);
        if (result.ok) save(); // 管理者が明示的に復元した状態はすぐディスクへ保存する
        return;
      }
      const recoveryBefore = (m.t === 'rogueRecoveryDrop' || m.t === 'rogueRecoveryClaim')
        ? JSON.stringify(sim.serializeRogueRecoveryState()) : null;
      sim.handle(id, m);
      if (m.t === 'join') broadcastAdminPlayers();
      // 遺品袋の作成・回収は30秒の通常保存を待たずに保存する。失敗要求では内容が変わらないため書き込まない。
      if (recoveryBefore !== null && recoveryBefore !== JSON.stringify(sim.serializeRogueRecoveryState())) save();
    } catch (e) { console.error('handle error', e); }
  });
  ws.on('close', () => {
    clearInterval(refill);
    sockets.delete(id);
    const recoveryBefore = JSON.stringify(sim.serializeRogueRecoveryState());
    sim.removeClient(id);
    if (recoveryBefore !== JSON.stringify(sim.serializeRogueRecoveryState())) save();
    broadcastAdminPlayers();
  });
  ws.on('error', () => {});
});

// シミュレーション: 20Hz
let last = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = Math.min(0.2, (now - last) / 1000);
  last = now;
  try { sim.tick(dt); } catch (e) { console.error('tick error', e); }
}, 50);

// 生存確認
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

// サーバー保存: 公開ワールドデータに加え、遺品袋だけを非公開の別枠へ保存する。
// saveExport / worldImport は従来どおり sim.serialize() のワールド部分だけを扱う。
function save() {
  // On Render Free, avoid repeated serialization and writes to an ephemeral filesystem.
  if (FREE_PLAN_MODE) return;
  try {
    writeRuntimeSave(SAVE_FILE, sim.serialize(), sim.serializeRogueRecoveryState(), false);
  } catch (e) { console.error('save error', e); }
}
setInterval(save, 30000);
function shutdown() { save(); process.exit(0); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`探索の島サーバー起動: http://localhost:${PORT}  (最大${MAX_PLAYERS}人 / seed ${sim.seed} / 他人の建築物の回収: ${PICKUP_OTHERS ? '可' : '不可'})`);
  if (FREE_PLAN_MODE) console.log('Render Free仕様: サーバー内のワールド・ダンジョン進行・遺品袋は一時データです。再起動/スリープ/再デプロイ後は初期状態に戻ります。');
  if (!process.env.SAVE_ADMIN_TOKEN) console.log(`共有ワールド復元キー(ホストのみ使用): ${SAVE_ADMIN_TOKEN}`);
});
