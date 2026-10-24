// 入力UIの回帰チェック。ブラウザ描画そのものではなく、HTML側の操作ルールを検査する。
'use strict';
const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
let failures = 0;
let passed = 0;
function check(name, ok) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name);
  if (ok) passed++;
  else failures++;
}
function block(start, end) {
  const i = source.indexOf(start);
  if (i < 0) return '';
  const j = source.indexOf(end, i + start.length);
  return j < 0 ? '' : source.slice(i, j);
}

const interact = block('  function tryInteract(){', '  let interactKeyActive = false;');
const keyHandlers = block('  let interactKeyActive = false;', '  // ============ カメラ追従(三人称) ============');
const recover = block('  function findRecoverableStructure(sid){', '  function refreshSettingsUi(){');
const targetScan = block('    // --- 対象の検出(採集物・洞窟の入口/出口・建築物の回収候補) ---', '  function tryInteract(){');

check('通常のインタラクト処理に建築物の回収送信を残していない', !!interact && !/n\.kind\s*===\s*['"]pickup['"]/.test(interact));
check('Eキー長押しはリピート入力を無視し、480msの保留判定を使う', /e\.code !== 'KeyE' \|\| e\.repeat/.test(keyHandlers) && /setTimeout\(\(\)=>/.test(keyHandlers) && /STRUCTURE_ACTION_HOLD_MS/.test(keyHandlers));
check('長押し対象が押下時と同じ建築物か確認してからメニューを開く', /current\.userData\.sid !== interactTargetSidAtDown/.test(keyHandlers) && /openStructureActionMenu\(current\)/.test(keyHandlers));
check('短押しはキーを離した時だけ通常インタラクトを実行する', /const shouldInteract = !interactLongPressHandled/.test(keyHandlers) && /if \(shouldInteract && !isMenuOpen\(\).*tryInteract\(\)/.test(keyHandlers));
check('回収対象の所有権・近距離・洞窟外を再確認する', /!canPickup\(structure\)/.test(recover) && /inCaveIndex >= 0/.test(recover) && /d < STRUCTURE_ACTION_RANGE/.test(recover));
check('回収メニューは明示的な「回収する」と「キャンセル」を持つ', /id="structureRecoverConfirm"[^>]*>回収する/.test(source) && /id="structureActionCancel"[^>]*>キャンセル/.test(source));
check('回収ボタンがスマホ用に独立し、通常GETボタンと別の処理に接続される', /id="recoverBtn"/.test(source) && /bindTapButton\(recoverBtn, null, \(\)=>\{ tryRecoverNearestStructure\(\); \}\)/.test(source));
check('回収対象候補を洞窟内でリセットする', /nearestRecoverableStructure = null;\s*if \(inCaveIndex === -1\)/.test(targetScan));
check('倒れたときに回収メニューが残らない', /function killPlayer\(\)[\s\S]*?playerDead = true;\s*closeStructureActionMenu\(false\)/.test(source));
check('メニュー表示中は背後の入力を止め、Escで閉じられる', /structureActionMenu\.classList\.contains\('show'\)[\s\S]*?e\.code === 'Escape'[\s\S]*?closeStructureActionMenu\(true\)/.test(source));

console.log(`\n${passed} passed, ${failures} failed`);
process.exitCode = failures ? 1 : 0;
