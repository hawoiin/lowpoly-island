// 名前必須と、4種類のエモートイベント中継の回帰テスト。
'use strict';
const fs = require('fs');
const path = require('path');
const Shared = require('../public/shared.js');
let fails = 0;
const check = (name, ok) => {
  console.log((ok ? 'PASS ' : 'FAIL ') + name);
  if (!ok) fails++;
};

const sent = [], broadcasts = [];
const sim = new Shared.WorldSim({ seed: 2874 });
sim.out = {
  sendTo(id, msg) { sent.push({ id, msg }); },
  broadcast(msg, except) { broadcasts.push({ msg, except }); },
};
sim.addClient(1);
sim.addClient(2);
sim.handle(1, { t:'join', name:'   ', key:'blank-name' });
check('空白だけの名前では参加済みにならない', sim.clients.get(1).joined === false);
check('空白名に参加拒否を返す', sent.some(v => v.id === 1 && v.msg.t === 'joinRejected' && v.msg.reason === 'name-required'));
check('空白名の参加通知を他プレイヤーへ送らない', !broadcasts.some(v => v.msg.t === 'join' && v.msg.id === 1));
sim.handle(2, { t:'join', name:'<>\u0000  ', key:'sanitized-empty' });
check('無効文字を除去した結果が空になる名前も拒否する', sim.clients.get(2).joined === false && sent.some(v => v.id === 2 && v.msg.t === 'joinRejected'));
sim.handle(1, { t:'join', name:'  探索者  ', key:'valid-name' });
sim.handle(2, { t:'join', name:'見守る人', key:'observer' });
check('前後の空白を除いた名前で参加できる', sim.clients.get(1).joined && sim.clients.get(1).name === '探索者');

broadcasts.length = 0;
for (let e = 0; e < Shared.EMOTE_COUNT; e++) {
  sim.clients.get(1).lastChatAt = 0;
  sim.handle(1, { t:'emote', e });
}
const emotes = broadcasts.filter(v => v.msg.t === 'emote' && v.msg.id === 1);
check('4種類のエモートをサーバーが個別イベントとして中継する', emotes.length === 4 && emotes.every((v, i) => v.msg.e === i));
sim.clients.get(1).lastChatAt = 0;
sim.handle(1, { t:'emote', e:Shared.EMOTE_COUNT });
check('定義されていないエモート番号は拒否する', broadcasts.filter(v => v.msg.t === 'emote' && v.msg.e === Shared.EMOTE_COUNT).length === 0);

const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
const boot = fs.readFileSync(path.join(__dirname, '../public/boot.js'), 'utf8');
check('クライアントは空欄/空白の名前で開始処理を進めない', html.includes('if (!nm) {') && boot.includes('!nameInput.value.trim()'));
check('エモートはUnicode絵文字ではなく全身モーションに接続されている', !html.includes("const EMOTES = ['👋'") && html.includes('function applyEmotePose') && html.includes("case 'emote': onEmote(m); break;"));

if (fails) process.exit(1);
console.log('Name/emote regression tests passed.');
