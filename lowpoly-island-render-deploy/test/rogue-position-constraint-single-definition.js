'use strict';
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const declarations = html.match(/function\s+constrainRogueDungeonPosition\s*\(/g) || [];
if (declarations.length !== 1) {
  throw new Error(`expected exactly one constrainRogueDungeonPosition declaration, got ${declarations.length}`);
}
if (html.includes('rogueRampSideExitWouldStepUp')) {
  throw new Error('obsolete undefined helper rogueRampSideExitWouldStepUp must not be referenced');
}
if (!html.includes('rogueDungeonMovePathAllowed(last.x,last.z,x,z,openGates,footY,airborne)')) {
  throw new Error('active position constraint must use the unified dungeon movement path checker');
}
console.log('PASS single unified position constraint; no undefined legacy helper');
