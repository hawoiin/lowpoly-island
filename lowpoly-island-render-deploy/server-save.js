'use strict';
// Keep the public world file compatible with releases that predate recovery bags.
// Private death-recovery data lives in a sidecar file and is never exported as a world backup.
const fs = require('fs');
const path = require('path');

const LEGACY_ENVELOPE_FORMAT = 'lowpoly-island-server-save';
const RECOVERY_SIDECAR_FORMAT = 'lowpoly-island-rogue-recovery';
const DEFAULT_FREE_WORLD_SEED = 24101986;

function isFreePlanMode(env = process.env) {
  const value = String(env.FREE_PLAN_MODE || '').trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}

function resolveFreeWorldSeed(env = process.env) {
  const value = Number(env.FREE_WORLD_SEED);
  return Number.isInteger(value) && value >= 0 && value <= 0xffffffff
    ? value >>> 0
    : DEFAULT_FREE_WORLD_SEED;
}

// In Free mode the base terrain seed must stay fixed across manual restores.
// Local/development mode retains the original ability to restore another seed.
function isAllowedRestoreSeed(world, freePlanMode = false, expectedSeed = DEFAULT_FREE_WORLD_SEED) {
  if (!freePlanMode) return true;
  return !!world && Number.isInteger(world.seed) && world.seed >= 0 && world.seed <= 0xffffffff && (world.seed >>> 0) === (expectedSeed >>> 0);
}

// Render Free has an ephemeral filesystem. Do not pretend files written there
// are durable; keep world/run state in memory for the lifetime of this process.
function loadRuntimeSave(saveFile, freePlanMode = false) {
  return freePlanMode ? { world: null, rogueRecovery: null } : loadServerSave(saveFile);
}

function writeRuntimeSave(saveFile, world, rogueRecovery, freePlanMode = false) {
  if (freePlanMode) return false;
  writeServerSave(saveFile, world, rogueRecovery);
  return true;
}

function isRecoveryState(value) {
  return !!value && typeof value === 'object' && value.version === 1 && Array.isArray(value.rooms);
}

function sidecarPath(saveFile) {
  return `${saveFile}.rogue-recovery.json`;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return null;
  }
}

function loadServerSave(saveFile) {
  const diskData = readJson(saveFile);
  let world = diskData;
  let recoveryFromLegacyEnvelope = null;

  // v62.0 wrote the world plus recovery state inside a single envelope.
  // Read it during upgrade, then the next save migrates to the sidecar format.
  if (diskData && diskData.format === LEGACY_ENVELOPE_FORMAT && diskData.version === 1 && diskData.world && typeof diskData.world === 'object') {
    world = diskData.world;
    recoveryFromLegacyEnvelope = isRecoveryState(diskData.rogueRecovery) ? diskData.rogueRecovery : null;
  }

  const sidecar = readJson(sidecarPath(saveFile));
  const sidecarIsValid = !!sidecar &&
    sidecar.format === RECOVERY_SIDECAR_FORMAT &&
    sidecar.version === 1 &&
    isRecoveryState(sidecar.rogueRecovery);

  return {
    world: world && typeof world === 'object' ? world : null,
    // An existing sidecar is authoritative even when its room list is empty;
    // this prevents a stale v62.0 envelope from resurrecting already-claimed bags.
    rogueRecovery: sidecarIsValid ? sidecar.rogueRecovery : recoveryFromLegacyEnvelope
  };
}

function writeJsonAtomically(file, data) {
  const directory = path.dirname(file);
  fs.mkdirSync(directory, { recursive: true });
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(data));
  fs.renameSync(temporary, file);
}

function writeServerSave(saveFile, world, rogueRecovery) {
  const recovery = isRecoveryState(rogueRecovery) ? rogueRecovery : { version: 1, rooms: [] };
  // Write private recovery data first, so a later world-write failure doesn't
  // discard the only copy of a recovery bag during migration from v62.0.
  writeJsonAtomically(sidecarPath(saveFile), {
    format: RECOVERY_SIDECAR_FORMAT,
    version: 1,
    rogueRecovery: recovery
  });
  // Keep world.json in the long-standing raw format for rollback compatibility.
  writeJsonAtomically(saveFile, world);
}

module.exports = { loadServerSave, writeServerSave, sidecarPath, isFreePlanMode, resolveFreeWorldSeed, isAllowedRestoreSeed, DEFAULT_FREE_WORLD_SEED, loadRuntimeSave, writeRuntimeSave };
