'use strict';
const fs = require('fs');
const path = require('path');
const Shared = require('../public/shared.js');
const SaveFormat = require('../public/save-format.js');
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
let failures = 0, passes = 0;
function check(name, condition) {
  if (condition) passes++;
  else { failures++; console.error('FAIL ' + name); }
}
function findLand() {
  for (let x=20; x<=100; x+=2) for (let z=20; z<=100; z+=2) {
    const y=Shared.islandHeight(x,z);
    if (y>2 && Shared.checkPlacement('gate',x,y,z,[])===null) return {x,z,y};
  }
  throw new Error('land spot not found');
}

check('gate is a recognized building type', Shared.BUILD_RADIUS.gate === 1.0);
check('fence snaps can consider gates as connection targets', /if \(!isFenceLike\(s\.buildId\)\) continue/.test(fs.readFileSync(path.join(__dirname,'..','public','shared.js'),'utf8')));
const p = findLand();
const fence = { buildId:'fence', x:p.x, y:p.y, z:p.z, ry:0 };
const snapped = Shared.snapBuildPlacement('gate', p.x + 1.5, p.y, p.z + 0.4, 0, [fence]);
check('gate automatically snaps to an existing fence endpoint', snapped.snapped && Math.abs(Math.hypot(snapped.x-p.x,snapped.z-p.z)-2) < 0.02);
const gate = { buildId:'gate', x:0, y:1, z:0, ry:0, open:false };
const blocked = Shared.resolveFencePoint(0,0,0.35,[gate]);
check('closed gate blocks player collision', Math.hypot(blocked.x,blocked.z) > 0.5);
const open = Shared.resolveFencePoint(0,0,0.35,[{...gate,open:true}]);
check('open gate does not block player collision', Math.hypot(open.x,open.z) < 1e-8);
const mixed = Shared.resolveFencePoint(0,0,0.35,[{...gate,open:true},{buildId:'fence',x:4,z:4,ry:0}]);
check('open gate does not block when other fences exist away from the player', Math.hypot(mixed.x,mixed.z) < 1e-8);
check('gate open state is a permitted save field', SaveFormat.normalizeWorld({
  layoutVersion:Shared.WORLD_LAYOUT_VERSION, seed:123, nextSid:2,
  structures:[{sid:1,buildId:'gate',x:p.x,y:p.y,z:p.z,ry:0,open:true}], chests:[]
}).structures[0].open === true);
check('legacy player backup without a held gate defaults gate inventory to zero', SaveFormat.normalizePlayer({
  inv:{wood:1,stone:1,herb:0,crystal:0,relic:0}, collected:{}, discovered:[], swordLv:1,
  held:{campfire:0,hut:0,cabin:0,fence:0,floor:0}, claimed:{}, codexDone:false, seenCaves:[]
}).held.gate === 0);
let threw = false;
try {
  SaveFormat.normalizeWorld({ layoutVersion:Shared.WORLD_LAYOUT_VERSION, seed:123, nextSid:2,
    structures:[{sid:1,buildId:'gate',x:p.x,y:p.y,z:p.z,ry:0,open:'yes'}],chests:[] });
} catch (_) { threw = true; }
check('malformed gate open state is rejected by backup validation', threw);

const sim = new Shared.WorldSim({ seed:123 });
const outgoing = [];
sim.out = { sendTo(id,m){outgoing.push({to:id,msg:m});}, broadcast(m){outgoing.push({to:'all',msg:m});} };
sim.addClient(1);
sim.handle(1,{t:'join',name:'gate tester',key:'gate-player'});
sim.handle(1,{t:'state',x:p.x,y:p.y,z:p.z,ry:0,cave:-1,f:0,ts:1000});
sim.handle(1,{t:'place',buildId:'gate',x:p.x,y:p.y,z:p.z,ry:0});
const placed = [...sim.structures.values()].find(s=>s.buildId==='gate');
check('server accepts gate construction with normal resources-independent placement request', !!placed && placed.open === false);
if (placed) {
  outgoing.length = 0;
  sim.handle(1,{t:'gateToggle',sid:placed.sid});
  check('nearby player can open a gate', placed.open === true && outgoing.some(m=>m.msg.t==='gateState' && m.msg.open===true));
  check('gate state broadcast includes structure ID', outgoing.some(m=>m.msg.t==='gateState' && m.msg.sid===placed.sid));
  const exported = sim.serialize();
  check('world export preserves an open gate', exported.structures.some(s=>s.sid===placed.sid && s.open===true));
  const restore = new Shared.WorldSim({seed:456});
  const result = restore.restoreWorld(exported);
  check('world import succeeds with a gate', result.ok);
  check('restored gate retains open state', restore.structures.get(placed.sid)?.open === true);
  const malformedGate = restore.restoreWorld({ ...exported, structures: exported.structures.map(s => ({...s, open:'yes'})) });
  check('server rejects malformed gate-open value during world import', !malformedGate.ok && malformedGate.reason === 'invalid');
  const c=sim.clients.get(1);
  c.lastGateToggleAt = Date.now() - 500;
  sim.handle(1,{t:'gateToggle',sid:placed.sid});
  check('nearby player can close a gate', placed.open === false && outgoing.some(m=>m.msg.t==='gateState' && m.msg.open===false));
  const before=placed.open;
  c.x += 20; c.z += 20; c.lastGateToggleAt=Date.now()-500;
  sim.handle(1,{t:'gateToggle',sid:placed.sid});
  check('gate cannot be operated from beyond the interaction range', placed.open === before && outgoing.some(m=>m.msg.t==='gateToggleDenied' && m.msg.reason==='distance'));
}
const second = new Shared.WorldSim({seed:123});
check('gate state in the initial welcome payload is preserved', (function(){
  const w = new Shared.WorldSim({saved:{layoutVersion:Shared.WORLD_LAYOUT_VERSION,seed:123,nextSid:2,
    structures:[{sid:1,buildId:'gate',x:p.x,y:p.y,z:p.z,ry:0,open:true}],chests:[]}});
  return w.welcomeFor(9).structures.some(s=>s.buildId==='gate'&&s.open===true);
})());

check('client build menu registers the gate', /id:'gate'\s*,\s*name:'門'/.test(html));
check('client has a dedicated gate model and animated hinge', /function makeGate\(/.test(html) && /function updateGateAnimations\(/.test(html));
check('E/GET interaction sends server-validated gate toggle', /Net\.send\(\{ t:'gateToggle', sid \}\)/.test(html));
check('gate-state broadcasts update the local visual/collision state', /case 'gateState':[\s\S]*setGateOpenVisual\(mesh, m\.open, false\)/.test(html));
check('existing gate open state is restored when structures are created', /if \(def\.id === 'gate'\) setGateOpenVisual\(real, m\.open === true, true\)/.test(html));

console.log(`門のテスト: ${passes}件合格、${failures}件失敗`);
if (failures) process.exitCode=1;
