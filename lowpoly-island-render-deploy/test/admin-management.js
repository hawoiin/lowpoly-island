// 管理者認証・プレイヤー管理・ワールドバックアップ機能の構造回帰テスト。
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const client = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const boot = fs.readFileSync(path.join(root, 'public/boot.js'), 'utf8');
let failures = 0;
function check(name, ok) { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) failures++; }
check('管理者キーをサーバー側で定時間比較する', server.includes('function tokenMatches') && server.includes('crypto.timingSafeEqual'));
check('認証済みWebSocketだけが管理APIを使える', server.includes("if (!ws.isAdmin) { sendJson(ws, { t:'adminKickResult'") && server.includes("if (!ws.isAdmin) { sendJson(ws, { t:'adminWorldBackupResult'") && server.includes("if (!ws.isAdmin) { sendJson(ws, { t:'adminWorldRestoreResult'"));
check('管理者認証の試行回数制限がある', server.includes('authAttempts > 5'));
check('オンライン一覧には名前・接続時間・洞窟状態を送る', server.includes('function adminPlayersSnapshot') && server.includes('secondsOnline') && server.includes('cave:c.cave >= 0'));
check('自分自身のキックをサーバー側でも拒否する', server.includes("if (targetId === id) { sendJson(ws, { t:'adminKickResult', ok:false, reason:'self' })"));
check('退出通知でクライアントの自動再接続を停止する', server.includes("t:'kicked'") && boot.includes("m.t === 'kicked' && welcomed") && boot.includes('cur = null;'));
check('管理者バックアップの復元前状態を返す', server.includes('beforeWorld:result.ok ? beforeWorld : undefined'));
check('復元前バックアップが大きすぎる場合は変更前に復元を拒否する', server.includes('beforeBackupBytes > 120 * 1024') && server.includes("reason:'backupTooLarge'"));
check('クライアントに認証・一覧・キック・バックアップ・復元UIがある', ['adminLoginButton','adminPlayerList','adminKick','adminBackupButton','adminRestoreButton'].every(x => client.includes(x)));
check('プレイヤー名はtextContentでDOMへ描画する', client.includes("name.textContent = String(info.name || '旅人')"));
check('復元ファイル形式とサイズをクライアントで検証する', client.includes("payload.format !== 'lowpoly-island-world-backup'") && client.includes('file.size > 120 * 1024'));
if (failures) process.exit(1);
console.log('Admin management regression checks passed.');
