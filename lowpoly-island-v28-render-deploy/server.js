'use strict';
// 探索の島 マルチプレイサーバー: 静的配信(public/) + WebSocket同期
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const Shared = require('./public/shared.js');

const PORT = +process.env.PORT || 4010;
const MAX_PLAYERS = +process.env.MAX_PLAYERS || 16;
const PUBLIC = path.join(__dirname, 'public');
const SAVE_FILE = process.env.SAVE_FILE || path.join(__dirname, 'world.json');
const PICKUP_OTHERS = process.env.PICKUP_OTHERS === '1'; // 1 なら他人の建築物も回収できる(既定は建てた人だけ)
// 共有ワールドのインポートは全員に影響するため、サーバー側の管理者キーを要求する。
// 未指定ならサーバー起動ごとに推測不能なキーを生成し、ホストのコンソールにだけ表示する。
const SAVE_ADMIN_TOKEN = process.env.SAVE_ADMIN_TOKEN || crypto.randomBytes(24).toString('hex');

let saved = null;
try { saved = JSON.parse(fs.readFileSync(SAVE_FILE, 'utf8')); } catch (e) { /* 初回起動 */ }

const sim = new Shared.WorldSim({ saved, pickupOthers: PICKUP_OTHERS });
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

  let budget = 120; // 1秒あたりの受信上限(スパム対策)
  let lastSaveOperationAt = 0;
  let lastLargePayloadAt = 0;
  const refill = setInterval(() => { budget = 120; }, 1000);

  ws.send(JSON.stringify(sim.addClient(id)));

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
    if (payloadBytes > 2048 && m.t !== 'worldImport') return;
    try {
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
        const result = sim.restoreWorld(m.world);
        sendResult(result);
        if (result.ok) save(); // 管理者が明示的に復元した状態はすぐディスクへ保存する
        return;
      }
      sim.handle(id, m);
    } catch (e) { console.error('handle error', e); }
  });
  ws.on('close', () => {
    clearInterval(refill);
    sockets.delete(id);
    sim.removeClient(id);
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

// ワールド保存(建築物・開封済みの宝箱・シード)
function save() {
  try {
    const tmp = SAVE_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(sim.serialize()));
    fs.renameSync(tmp, SAVE_FILE);
  } catch (e) { console.error('save error', e); }
}
setInterval(save, 30000);
function shutdown() { save(); process.exit(0); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`探索の島サーバー起動: http://localhost:${PORT}  (最大${MAX_PLAYERS}人 / seed ${sim.seed} / 他人の建築物の回収: ${PICKUP_OTHERS ? '可' : '不可'})`);
  if (!process.env.SAVE_ADMIN_TOKEN) console.log(`共有ワールド復元キー(ホストのみ使用): ${SAVE_ADMIN_TOKEN}`);
});
