'use strict';
const fs = require('fs');
const path = require('path');
const Shared = require('../public/shared.js');
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
let failures = 0, passes = 0;
function check(name, ok) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name);
  if (ok) passes++; else failures++;
}
function findLand() {
  for (let x = 20; x <= 100; x += 2) for (let z = 20; z <= 100; z += 2) {
    const y = Shared.islandHeight(x, z);
    if (y > 2 && Shared.checkPlacement('fence', x, y, z, []) === null) return { x, y, z };
  }
  throw new Error('could not find land for test');
}
function makeSquare(cx, cz, y) {
  const structures = [];
  for (let x = -3; x <= 3; x += 2) {
    structures.push({ buildId:'fence', x:cx+x, y, z:cz-4, ry:0 });
    structures.push({ buildId:'fence', x:cx+x, y, z:cz+4, ry:0 });
  }
  for (let z = -3; z <= 3; z += 2) {
    structures.push({ buildId:'fence', x:cx-4, y, z:cz+z, ry:Math.PI/2 });
    structures.push({ buildId:'fence', x:cx+4, y, z:cz+z, ry:Math.PI/2 });
  }
  return structures;
}

const land = findLand();
const emptyPoint = Shared.findSafeEscapePoint(land.x, land.z, [], [], null, 12345);
check('safe escape point exists on ordinary island terrain', !!emptyPoint && Shared.islandHeight(emptyPoint.x, emptyPoint.z) > 1.0);
check('safe escape point stays inside the island build boundary', !!emptyPoint && Math.hypot(emptyPoint.x, emptyPoint.z) < Shared.WORLD_SIZE * 0.45);

const enclosure = makeSquare(land.x, land.z, land.y);
check('closed fence loop is detected', Shared.getClosedFenceLoops(enclosure).length === 1);
check('point inside closed fence is identified as enclosed', Shared.isInsideFenceEnclosure(land.x, land.z, enclosure));
const escapeFromEnclosure = Shared.findSafeEscapePoint(land.x, land.z, enclosure, [], null, 12345);
check('escape destination is outside the closed fence enclosure', !!escapeFromEnclosure && !Shared.isInsideFenceEnclosure(escapeFromEnclosure.x, escapeFromEnclosure.z, enclosure));
check('escape destination avoids the fence line itself', !!escapeFromEnclosure && enclosure.every(s => Math.hypot(escapeFromEnclosure.x-s.x, escapeFromEnclosure.z-s.z) > 2.5));
const openEnclosure = enclosure.map((s,i)=> i === 0 && s.buildId === 'fence' ? {...s,buildId:'gate',open:true} : s);
check('an open gate breaks the enclosure loop', !Shared.isInsideFenceEnclosure(land.x, land.z, openEnclosure));

const sim = new Shared.WorldSim({ seed:12345 });
const outgoing = [];
sim.out = { sendTo(id,msg){ outgoing.push({to:id,msg}); }, broadcast(msg){ outgoing.push({to:'all',msg}); } };
sim.addClient(1);
sim.handle(1,{t:'join',name:'escape tester',key:'escape-key'});
sim.handle(1,{t:'state',x:land.x,y:land.y,z:land.z,ry:0,cave:-1,f:0});
outgoing.length = 0;
sim.handle(1,{t:'emergencyEscape',requestId:1});
check('server rejects an escape request unless sustained blocked movement was detected', outgoing.some(e=>e.to===1 && e.msg.t==='emergencyEscapeResult' && !e.msg.ok && e.msg.reason==='notStuck'));

// Simulate 9 seconds of pressing movement into a barrier (same valid position, movement flag remains set).
const realNow = Date.now;
let fakeNow = realNow();
Date.now = () => fakeNow;
try {
  const c = sim.clients.get(1);
  c.x = land.x; c.y = land.y; c.z = land.z; c.cave = -1; c.hasState = true;
  for (let i=0; i<100; i++) {
    fakeNow += 100;
    sim.handle(1,{t:'state',x:land.x,y:land.y,z:land.z,ry:0,cave:-1,f:16});
  }
  outgoing.length = 0;
  sim.handle(1,{t:'emergencyEscape',requestId:2});
  const result = outgoing.find(e=>e.to===1 && e.msg.t==='emergencyEscapeResult' && e.msg.requestId===2);
  check('server grants emergency escape after 8 seconds of blocked movement', !!result && result.msg.ok);
  check('accepted escape synchronizes the server player to the safe destination', !!result && result.msg.ok && Math.hypot(c.x-result.msg.x,c.z-result.msg.z)<0.02 && c.cave===-1);
  outgoing.length = 0;
  // The player is no longer stuck, but cooldown is checked first and must survive further requests.
  sim.handle(1,{t:'emergencyEscape',requestId:3});
  check('emergency escape has a server-side cooldown', outgoing.some(e=>e.to===1 && e.msg.t==='emergencyEscapeResult' && e.msg.requestId===3 && !e.msg.ok && e.msg.reason==='cooldown'));
} finally { Date.now = realNow; }

check('settings menu offers emergency escape with clear conditions and cooldown', /id="emergencyEscapeButton"/.test(html) && /8秒以上/.test(html) && /3分間/.test(html));
check('sea material renders from below and avoids transparent depth writes', /side:THREE\.DoubleSide, depthWrite:false/.test(html));
check('client handles accepted emergency escape by leaving cave scene and moving to server point', /case 'emergencyEscapeResult':[\s\S]*?oldCave\.interiorScene\.remove\(player\)[\s\S]*?player\.position\.set\(m\.x, m\.y, m\.z\)/.test(html));

console.log(`緊急脱出・水面テスト: ${passes}件合格、${failures}件失敗`);
if (failures) process.exitCode = 1;
