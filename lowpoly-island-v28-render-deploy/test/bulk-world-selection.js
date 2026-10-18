// World-space selection for bulk building recovery: UI/input-routing regression checks.
'use strict';
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
let passed = 0, failed = 0;
function check(name, ok) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name);
  if (ok) passed++; else failed++;
}

check('一括回収メニューにワールド上で選ぶ入口がある', /id="bulkRecoverWorldSelect"[^>]*>ワールド上で選ぶ/.test(html));
check('移動・右ドラッグ視点・マウス位置選択・Enter・Tab・Escの案内がある', /WASD：移動　右ドラッグ：視点変更　クリック：選択／解除　Enter：まとめて回収　Tab：一覧　Esc：終了/.test(html));
check('ワールド上の選択は設置済み建築物だけにレイキャストする', /intersectObjects\(placedStructures, true\)/.test(html));
check('選択モード中は画面全体のマウス座標をレイキャストに使う', /bulkRecoverWorldNdc\.set\(\(e\.clientX \/ innerWidth\) \* 2 - 1, -\(e\.clientY \/ innerHeight\) \* 2 \+ 1\)/.test(html));
check('通常の攻撃クリックより先にマウス位置の回収対象選択を処理する', /if \(bulkRecoverWorldSelectMode\)\{\s*toggleBulkRecoverWorldTarget\(e\);[\s\S]*?return;[\s\S]*?if \(!isTouch\)/.test(html));
check('選択対象の距離と所有権を確認する', /if \(!canPickup\(target\)\)/.test(html) && /if \(d > BULK_RECOVER_RANGE\)/.test(html));
check('ワールド上で選択と解除を切り替え、既存のハイライトを共有する', /if \(bulkRecoverSelected\.has\(sid\)\)\{\s*setBulkRecoverSelection\(sid, false\)/.test(html) && /setBulkRecoverSelection\(sid, true\)/.test(html));
check('最大選択数を超える選択を拒否する', /bulkRecoverSelected\.size >= BULK_RECOVER_MAX/.test(html));
check('Enterで回収、Tabで一覧へ、Escで選択解除できる', /e\.code === 'Enter'.*submitBulkRecovery\(\)/.test(html) && /e\.code === 'Tab'.*switchBulkRecoverWorldToList\(\)/.test(html) && /e\.code === 'Escape'.*cancelBulkRecoverWorldMode\(\)/.test(html));
check('一覧へ切り替えると選択状態を維持して再表示する', /function switchBulkRecoverWorldToList\(\)[\s\S]*?bulkRecoverMenu\.classList\.add\('show'\);\s*renderBulkRecoverList\(\)/.test(html));
check('スマホではワールド選択ボタンを隠し、既存の一覧方式を残す', /body\.touch #bulkRecoverWorldSelect \{ display:none; \}/.test(html));
check('選択モード中もプレイヤーの移動とジャンプ入力を許可する', /const inputOn = !isMenuOpen\(\) \|\| bulkRecoverWorldSelectMode/.test(html));
check('選択モード開始時にポインターロックせず、カーソルを解放する', (()=>{ const enter = html.slice(html.indexOf('function enterBulkRecoverWorldMode()'), html.indexOf('function switchBulkRecoverWorldToList()')); return /document\.exitPointerLock\(\)/.test(enter) && /renderer\.domElement\.style\.cursor = 'crosshair'/.test(enter) && /updateBulkRecoverWorldTarget\(\)/.test(enter) && !/lockPointer\(\)/.test(enter); })());
check('右ドラッグで視点を操作し、画面上のカーソルを選択照準にする', /bulkRecoverWorldLookDragging[\s\S]*?yaw -= dx \* 0\.0022[\s\S]*?pitch \+= dy \* 0\.0018[\s\S]*?bulkRecoverWorldCrosshair\.style\.left = `\$\{e\.clientX\}px`/.test(html));
check('回収結果待ちには一覧を再表示し、二重実行を避ける', /bulkRecoverPending = true;[\s\S]*?bulkRecoverMenu\.classList\.add\('show'\);/.test(html) && /if \(bulkRecoverPending\) return;/.test(html));

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
