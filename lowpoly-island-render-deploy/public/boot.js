// 探索の島 — 起動と通信
//   ・サーバー(WebSocket)に接続して遊ぶ。繋がらない場合はブラウザ内のソロ(同じ WorldSim を動かす)
//   ・遊んでいる途中で切れたら、自動で再接続する
//
// ゲーム本体(window.startGame)には次の形で渡す:
//   { online, net:{ send(msg) }, welcome, setHandler(fn) }
// サーバーからのメッセージは setHandler の関数に届く。それに加えて、この起動処理から次の2つが届く:
//   { t:'netState', state:'reconnecting' }   … 切断されて再接続を試みている
//   { t:'welcome', ... }                      … 再接続できた(最新のワールド状態。ゲーム側が世界を作り直す)
//   { t:'disconnected' }                      … 再接続をあきらめた
(function () {
  'use strict';

  const RECONNECT_DELAYS = [500, 1000, 2000, 4000, 8000]; // 以降は8秒間隔
  const RECONNECT_GIVE_UP_MS = 120000;                    // 2分つながらなければあきらめる
  const FIRST_CONNECT_TIMEOUT_MS = 4000;                  // 最初の接続がこれ以内に成功しなければソロで始める
  const CONNECT_GUARD_MS = 8000;                          // 再接続の1回あたりの待ち時間

  const SOLO_WORLD_KEY = 'lowpoly-island-solo-world-v1';
  const statusEl = document.getElementById('netStatus');
  const startBtn = document.getElementById('startBtn');
  const nameInput = document.getElementById('nameInput');
  let gameReady = false;
  try { nameInput.value = localStorage.getItem('lowpoly-island-name') || ''; } catch (e) { /* 保存できない環境 */ }
  function updateStartAvailability() {
    // 空白だけの名前は不許可。ゲーム生成が終わるまでは入力があっても開始できない。
    startBtn.disabled = !gameReady || !nameInput.value.trim();
  }
  nameInput.addEventListener('input', updateStartAvailability);
  nameInput.addEventListener('change', updateStartAvailability);
  updateStartAvailability();

  // ---- ゲームへ渡すもの ----
  let handler = null;
  const buffer = [];
  function deliver(m) { if (handler) handler(m); else buffer.push(m); }
  const net = { send() {} };
  const init = {
    online: false, net, welcome: null,
    setHandler(fn) { handler = fn; buffer.splice(0).forEach(fn); },
  };

  function launch(welcome, online) {
    init.welcome = welcome; init.online = online;
    statusEl.textContent = '島を生成中…';
    setTimeout(() => { // 表示を更新してから重い生成を始める
      try {
        window.startGame(init);
        statusEl.textContent = online ? 'サーバーに接続しました' : 'ソロプレイ(サーバーに接続できなかったため)';
        gameReady = true;
        updateStartAvailability();
      } catch (err) {
        statusEl.textContent = '起動エラー: ' + err.message;
        console.error(err);
      }
    }, 40);
  }

  // ---- ソロ: ブラウザの中で WorldSim を動かす ----
  function startSolo() {
    let savedWorld = null;
    try { savedWorld = JSON.parse(localStorage.getItem(SOLO_WORLD_KEY) || 'null'); } catch (_) { savedWorld = null; }
    const sim = new Shared.WorldSim({ saved:savedWorld });
    const id = 1;
    function persistSoloWorld(){
      try { localStorage.setItem(SOLO_WORLD_KEY, JSON.stringify(sim.serialize())); } catch (_) { /* storage quota/privacy mode */ }
    }
    sim.out = {
      sendTo(to, m) { if (to === id) setTimeout(() => deliver(m), 0); },
      broadcast(m, except) {
        if (except === id) return;
        if (m && m.t === 'worldRestored') persistSoloWorld();
        setTimeout(() => deliver(m), 0);
      },
    };
    const welcome = sim.addClient(id);
    net.send = m => sim.handle(id, m);
    let last = performance.now();
    setInterval(() => {
      const now = performance.now();
      sim.tick(Math.min(0.2, (now - last) / 1000));
      last = now;
    }, 50);
    setInterval(persistSoloWorld, 30000);
    addEventListener('beforeunload', persistSoloWorld);
    document.addEventListener('visibilitychange', ()=>{ if (document.hidden) persistSoloWorld(); });
    launch(welcome, false);
  }

  // ---- オンライン: WebSocket + 自動再接続 ----
  function startOnline() {
    const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
    let cur = null;          // 現在のソケット(古いソケットのイベントは無視する)
    let launched = false;    // ゲーム本体を起動済みか
    let attempt = 0;         // 再接続の試行回数
    let giveUpAt = 0;        // 再接続をあきらめる時刻(切断された時点で設定)
    let soloStarted = false;

    // 最初の接続に失敗(または遅すぎ)したら、ソロで始める
    function fallbackToSolo() {
      if (launched || soloStarted) return;
      soloStarted = true;
      const old = cur; cur = null; // 以降このソケットのイベントは無視される
      try { old && old.close(); } catch (e) { /* 既に閉じている */ }
      startSolo();
    }

    net.send = o => { if (cur && cur.readyState === 1) cur.send(JSON.stringify(o)); };
    if (window.__LOWPOLY_DEBUG) window.__net = { get ws() { return cur; } }; // 自動テスト用

    function open() {
      let ws;
      try { ws = new WebSocket(url); } catch (e) { return onClosed(); }
      cur = ws;
      let welcomed = false;
      const guard = setTimeout(() => { if (!welcomed) { try { ws.close(); } catch (e) { /* 既に閉じている */ } } }, CONNECT_GUARD_MS);
      ws.onmessage = ev => {
        if (ws !== cur) return;
        let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (m.t === 'kicked' && welcomed) {
          // 管理者による退出は通常の通信断と区別し、自動再接続を止める。
          deliver(m);
          cur = null;
          try { ws.close(4001, 'kicked'); } catch (_) {}
          return;
        }
        if (m.t === 'welcome' && !welcomed) {
          welcomed = true; clearTimeout(guard);
          attempt = 0; giveUpAt = 0;
          if (!launched) { launched = true; launch(m, true); }
          else deliver(m); // 再接続: ゲーム側が最新の状態で世界を作り直す
          return;
        }
        if (welcomed) deliver(m);
      };
      ws.onclose = () => { clearTimeout(guard); if (ws === cur) onClosed(); };
      ws.onerror = () => { /* onclose で処理する */ };
    }

    function onClosed() {
      if (!launched) { fallbackToSolo(); return; }
      if (!giveUpAt) giveUpAt = Date.now() + RECONNECT_GIVE_UP_MS;
      if (Date.now() > giveUpAt) { deliver({ t: 'disconnected' }); return; }
      deliver({ t: 'netState', state: 'reconnecting' });
      const delay = RECONNECT_DELAYS[Math.min(attempt, RECONNECT_DELAYS.length - 1)];
      attempt++;
      setTimeout(open, delay);
    }

    statusEl.textContent = 'サーバーに接続中…';
    open();
    setTimeout(fallbackToSolo, FIRST_CONNECT_TIMEOUT_MS);
  }

  if (location.protocol === 'http:' || location.protocol === 'https:') startOnline();
  else startSolo(); // file:// で直接開いた場合
})();
