#!/usr/bin/env node
/**
 * Build tools/model-viewer/ghidra-functions.json from manifest + optional decompile sidecar.
 * Run after Ghidra rename pass: node tools/scripts/sync-ghidra-functions.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const manifestPath = join(__dirname, 'ghidra-function-manifest.json');
const worklistPath = join(root, 'model-viewer/reaction-ghidra-worklist.json');
const outPath = join(root, 'model-viewer/ghidra-functions.json');

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const worklist = JSON.parse(readFileSync(worklistPath, 'utf8'));

/** @type {Record<string, { decompiledSignature: string, legacyName: string }>} */
const signatures = {
  '0x004059f0': {
    legacyName: 'FUN_004059f0',
    decompiledSignature: 'void __thiscall Client_SendLogicUiPacket(int param_1, undefined4 param_2)',
  },
  '0x0040d260': {
    legacyName: 'FUN_0040d260',
    decompiledSignature: 'void __thiscall CVOGPhysics_ApplyImpulseVector(int param_1, undefined4 param_2)',
  },
  '0x004149d0': {
    legacyName: 'FUN_004149d0',
    decompiledSignature: 'void __thiscall CVOGReaction_FailMissionNotify(int param_1, undefined4 *param_2)',
  },
  '0x004bae70': {
    legacyName: 'FUN_004bae70',
    decompiledSignature:
      'undefined4 __thiscall CVOGReaction_ResolveObjectTarget(int param_1, char param_2, uint param_3, uint param_4)',
  },
  '0x004cd3a0': {
    legacyName: 'FUN_004cd3a0',
    decompiledSignature:
      'void __thiscall CVOGReaction_FireNestedReactions(CVOGReaction *this, CVOGClonedObjectBase *activator, int nestedFlags, int unused)',
  },
  '0x004d09a0': {
    legacyName: 'FUN_004d09a0',
    decompiledSignature:
      'undefined4 __thiscall CVOGReaction_CastSkillOnTarget(int param_1, int param_2, int param_3, int *param_4, ...)',
  },
  '0x004d37f0': {
    legacyName: 'FUN_004d37f0',
    decompiledSignature: 'void __thiscall CVOGReaction_TransferMap(int param_1, int *param_2, undefined4 param_3)',
  },
  '0x004d38b0': {
    legacyName: 'FUN_004d38b0',
    decompiledSignature:
      'undefined4 __thiscall CVOGReaction_UpdateRepairStationPosition(int param_1, uint *param_2, int param_3)',
  },
  '0x004db8b0': {
    legacyName: 'FUN_004db8b0',
    decompiledSignature:
      'undefined4 __thiscall CVOGReaction_RemoveObject(int param_1, uint param_2, undefined4 param_3, char param_4)',
  },
  '0x004de550': {
    legacyName: 'FUN_004de550',
    decompiledSignature:
      'undefined4 __thiscall CVOGReaction_SpawnObject(int param_1, undefined4 param_2, undefined4 param_3)',
  },
  '0x004e4870': {
    legacyName: 'FUN_004e4870',
    decompiledSignature: 'void __thiscall CVOGReaction_BuildTextParams(int param_1, undefined4 param_2)',
  },
  '0x0051a170': {
    legacyName: 'FUN_0051a170',
    decompiledSignature: 'int CVOGReaction_GiveItemByCbid(int param_1)',
  },
  '0x00521e00': {
    legacyName: 'FUN_00521e00',
    decompiledSignature: 'uint __thiscall CVOGReaction_MarkRepairStation(int param_1, undefined4 param_2)',
  },
  '0x00522bc0': {
    legacyName: 'FUN_00522bc0',
    decompiledSignature: 'uint __thiscall CVOGReaction_RecordFirstTimeEvent(int param_1, int param_2)',
  },
  '0x0052a1b0': {
    legacyName: 'FUN_0052a1b0',
    decompiledSignature: 'void __thiscall CVOGReaction_RelockContinentObject(int param_1, undefined4 param_2)',
  },
  '0x0052da30': {
    legacyName: 'FUN_0052da30',
    decompiledSignature: 'undefined4 __thiscall CVOGReaction_FailMission(int param_1, uint param_2)',
  },
  '0x00531c80': {
    legacyName: 'FUN_00531c80',
    decompiledSignature: 'void __thiscall CVOGReaction_UnlockContinentObject(int param_1, uint param_2)',
  },
  '0x005327c0': {
    legacyName: 'FUN_005327c0',
    decompiledSignature: 'undefined4 __thiscall CVOGReaction_GiveMission(int param_1, undefined4 param_2)',
  },
  '0x00533c30': {
    legacyName: 'FUN_00533c30',
    decompiledSignature: 'undefined4 __thiscall CVOGReaction_AddExperience(int param_1, int param_2, char param_3)',
  },
  '0x00533f90': {
    legacyName: 'FUN_00533f90',
    decompiledSignature:
      'undefined4 __thiscall CVOGReaction_CompleteObjective(int param_1, uint param_2, uint param_3, uint param_4, char param_5)',
  },
  '0x0053d790': {
    legacyName: 'FUN_0053d790',
    decompiledSignature: 'void __thiscall CVOGReaction_TeleportTarget(int *param_1, undefined4 *param_2)',
  },
  '0x0054c570': {
    legacyName: 'FUN_0054c570',
    decompiledSignature: 'undefined4 * CVOGReaction_ResolveSkillTargets(void *param_1, undefined4 param_2)',
  },
  '0x005721c0': {
    legacyName: 'FUN_005721c0',
    decompiledSignature: 'int __thiscall CVOGReaction_RemoveInventoryItem(int param_1, int param_2, int param_3)',
  },
  '0x0057a190': {
    legacyName: 'FUN_0057a190',
    decompiledSignature: 'void __thiscall CVOGReaction_ShowDialog(int param_1, int param_2)',
  },
  '0x0057c4a0': {
    legacyName: 'FUN_0057c4a0',
    decompiledSignature: 'void __thiscall CVOGReaction_ShowScreenText(int param_1, int param_2)',
  },
  '0x005afbc0': {
    legacyName: 'FUN_005afbc0',
    decompiledSignature:
      'void __thiscall CVOGMap_SetVariable(int param_1, uint param_2, float param_3, undefined4 param_4)',
  },
  '0x005b05f0': {
    legacyName: 'FUN_005b05f0',
    decompiledSignature:
      'undefined4 __thiscall CVOGMap_LookupVariable(int param_1, uint param_2, undefined4 *param_3)',
  },
  '0x007a4330': {
    legacyName: 'FUN_007a4330',
    decompiledSignature: 'undefined * CVOGReaction_RandomUnitScalar(void)',
  },
};

const reactionTypesByAddr = new Map();
for (const fn of worklist.functions) {
  reactionTypesByAddr.set(fn.address.toLowerCase(), fn.reactionTypes);
}

const functions = {};
for (const entry of manifest.functions) {
  const addr = entry.address.toLowerCase();
  const sig = signatures[addr];
  if (!sig) {
    console.warn(`Missing signature for ${addr}`);
    continue;
  }
  functions[addr] = {
    address: addr,
    legacyName: sig.legacyName,
    symbol: entry.symbol,
    decompiledSignature: sig.decompiledSignature,
    reactionTypes: reactionTypesByAddr.get(addr) ?? [],
    confidence: 'verified',
  };
}

const registry = {
  version: 1,
  program: manifest.program,
  generatedAt: new Date().toISOString(),
  functions,
};

writeFileSync(outPath, `${JSON.stringify(registry, null, 2)}\n`);
console.log(`Wrote ${outPath} (${Object.keys(functions).length} functions)`);
