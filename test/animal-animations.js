// イノシシ・オオカミのアニメーション回帰テスト。Three.jsやWebSocketサーバーを必要としない。
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const htmlPath = path.join(__dirname, '..', 'public', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
let failures = 0;
function check(name, ok, detail='') {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : ' ' + detail));
  if (!ok) failures++;
}

// All four animal variants are hooked into the shared articulated animation rig.
for (const [name, source] of [
  ['wolf', 'function makeWolf(){ return makeWolfRig(false); }'],
  ['boar', 'function makeBoar(){ return makeBoarRig(false); }'],
  ['wolfClassic', 'function makeWolfClassic(){ return makeWolfRig(true); }'],
  ['boarClassic', 'function makeBoarClassic(){ return makeBoarRig(true); }'],
]) check(name + ': articulated rig is used', html.includes(source));
check('all four wolf/boar variants use the shared enemy-maker registry',
  /const ENEMY_MAKERS\s*=\s*\{\s*wolf:makeWolf,\s*boar:makeBoar[\s\S]*?wolfClassic:makeWolfClassic,\s*boarClassic:makeBoarClassic/.test(html));

check('野営地の人型番人は独立した低ポリモデル・棍棒・関節モーションを持つ', (() => {
  const start = html.indexOf('  function makeCampRaider(info){');
  const end = html.indexOf('  const ENEMY_MAKERS =', start);
  if (start < 0 || end < 0) return false;
  const maker = html.slice(start, end);
  return maker.includes('new THREE.Group()') && maker.includes('clubHead') &&
    maker.includes('g.userData.anim = (t,en,dt)') && maker.includes('arms[1].shoulder.rotation') &&
    maker.includes('en.dying') && /raider:makeCampRaider/.test(html.slice(end, html.indexOf(';', end) + 1));
})());

check('normal wolf back ridge is short and stays within the torso outline', (() => {
  const start = html.indexOf('  function makeWolfRig(classic){');
  const head = html.indexOf('    const headY =', start);
  if (start < 0 || head < 0) return false;
  const bodyBlock = html.slice(start, head);
  const normalBranch = bodyBlock.slice(bodyBlock.indexOf('    } else {'));
  return /bp\(box\(0\.1,0\.035,0\.42\),dark,0,0\.755,0\.19\);/.test(normalBranch);
})());

// Regression: wolf leg joints must use the original lateral spacing (±0.16),
// while side remains ±1 for alternating gait. The old x=±1 placed legs far outside the torso.
check('both wolf variants keep legs close to torso with original lateral spacing', (() => {
  const start = html.indexOf('  function makeWolfRig(classic){');
  const end = html.indexOf('  function makeBoarRig(classic){', start);
  if (start < 0 || end < 0) return false;
  const rig = html.slice(start, end);
  return /pivot\.position\.set\(sx\*0\.16,0\.35,sz\)/.test(rig)
    && !/pivot\.position\.set\(sx,0\.35,sz\)/.test(rig);
})());

check('dead wolves and boars enter a short local falling animation',
  /en\.dying\s*=\s*true;\s*en\.dieT\s*=\s*0;/.test(html) && /if \(en\.dieT >= 0\.6\) removeEnemy\(en\.id\)/.test(html));

const start = html.indexOf('  function configureQuadrupedAnimation(g, rig){');
const end = html.indexOf('  // ---- 岩トカゲ:', start);
if (start < 0 || end < 0) {
  check('animation routine can be isolated for unit testing', false, 'function boundary missing');
} else {
  const routine = html.slice(start, end) + '\nthis.configureQuadrupedAnimation = configureQuadrupedAnimation;';
  const context = {};
  vm.runInNewContext(routine, context, { timeout: 1000 });
  const makeRig = (kind='wolf') => {
    const g = { userData: {} };
    const rig = {
      kind, bodyY:0.52, body:{position:{y:0.52},rotation:{x:0,z:0}},
      head:{rotation:{x:0,y:0,z:0}}, tail:{rotation:{x:0,z:0}}, tailBaseX:0, eyeH:0.7,
      legs:[
        {pivot:{rotation:{x:0,z:0}},front:true,side:-1,phase:0},
        {pivot:{rotation:{x:0,z:0}},front:false,side:1,phase:0},
        {pivot:{rotation:{x:0,z:0}},front:true,side:1,phase:Math.PI},
        {pivot:{rotation:{x:0,z:0}},front:false,side:-1,phase:Math.PI},
      ], gaitPhase:0,
    };
    context.configureQuadrupedAnimation(g, rig);
    return {g,rig};
  };
  const valuesFinite = rig => [rig.body.position.y,rig.body.rotation.x,rig.body.rotation.z,rig.head.rotation.x,rig.head.rotation.y,rig.head.rotation.z,rig.tail.rotation.x,rig.tail.rotation.z,...rig.legs.flatMap(l=>[l.pivot.rotation.x,l.pivot.rotation.z])].every(Number.isFinite);
  for (const kind of ['wolf','boar']) {
    const {g,rig}=makeRig(kind);
    let maxWalkAngle=0;
    for(let i=0;i<90;i++){
      g.userData.anim(i/60,{id:2,kind,moveSpeed:1.3,ph:0,wp:0,stT:0,hitFlash:0},1/60);
      maxWalkAngle=Math.max(maxWalkAngle,...rig.legs.map(l=>Math.abs(l.pivot.rotation.x)));
    }
    check(kind + ': walk gait animates legs and all transforms remain finite',
      maxWalkAngle>0.08 && valuesFinite(rig), 'max leg angle='+maxWalkAngle.toFixed(3));
    const prepBefore=rig.body.position.y;
    g.userData.anim(2,{id:2,kind,moveSpeed:0,ph:1,wp:1,stT:0,hitFlash:0},0);
    check(kind + ': attack wind-up lowers the body', rig.body.position.y < prepBefore + 0.02 && valuesFinite(rig));
    g.userData.anim(2.1,{id:2,kind,moveSpeed:4.2,ph:2,wp:1,stT:0.05,hitFlash:0},1/60);
    check(kind + ': run/charge pose remains finite', valuesFinite(rig) && rig.legs.some(l=>Math.abs(l.pivot.rotation.x)>0.01));
    g.userData.anim(2.2,{id:2,kind,moveSpeed:0,ph:3,wp:0,stT:0.1,hitFlash:0.2},1/60);
    check(kind + ': recoil pose reacts without invalid transforms', valuesFinite(rig) && Math.abs(rig.body.rotation.z)>0.02);
    g.userData.anim(2.3,{id:2,kind,moveSpeed:0,ph:0,wp:0,stT:0,hitFlash:0,dying:true,dieT:0.4},1/60);
    check(kind + ': death pose falls to one side and remains finite', valuesFinite(rig) && Math.abs(rig.body.rotation.z)>0.4 && rig.body.position.y<rig.bodyY);
  }
}
if (failures) process.exit(1);
