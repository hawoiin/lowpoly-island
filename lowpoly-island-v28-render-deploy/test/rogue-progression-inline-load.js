// v61.5 回帰テスト: RogueProgressionは外部JS取得に失敗しても初期化できる。
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const marker = '/* v61.5: progression module is bundled inline';
const markerAt = html.indexOf(marker);
const scriptAt = html.lastIndexOf('<script>', markerAt);
const closeAt = html.indexOf('</script>', markerAt);
if (markerAt < 0 || scriptAt < 0 || closeAt < 0 || closeAt > html.indexOf('window.startGame = function')) {
  throw new Error('inline progression module must appear before startGame');
}
const script = html.slice(scriptAt + '<script>'.length, closeAt);
const sandbox = {};
vm.runInNewContext(script, sandbox, { filename: 'inline-rogue-progression.js' });
if (!sandbox.RogueProgression || typeof sandbox.RogueProgression.load !== 'function' || typeof sandbox.RogueProgression.die !== 'function') {
  throw new Error('RogueProgression API did not initialize in the inline bootstrap');
}
if (html.includes('<script src=\"rogue-progression.js')) {
  throw new Error('startup still depends on an external relative rogue-progression.js request');
}
console.log('PASS RogueProgression inline bootstrap initializes before startGame');
