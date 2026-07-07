#!/usr/bin/env node
/**
 * Build reaction-ghidra-worklist.json from example map dumps + reaction-catalog.json.
 * Run: node tools/scripts/extract-reaction-ghidra-worklist.mjs [mapStem ...]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const levelsDir = join(root, 'model-viewer/levels');
const catalogPath = join(root, 'model-viewer/reaction-catalog.json');
const outPath = join(root, 'model-viewer/reaction-ghidra-worklist.json');

const DEFAULT_MAPS = [
  'sec_f_h_map_tut_j2_arkbaytutorial',
  'sec_f_b_map_hwy_a2_1_scrapvalley',
];

const mapStems = process.argv.length > 2 ? process.argv.slice(2) : DEFAULT_MAPS;
const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
const byName = Object.fromEntries(catalog.types.map((t) => [t.name, t]));

const FUN_RE = /FUN_[0-9a-fA-F]+/g;
const ADDR_RE = /^0x[0-9a-fA-F]+$/;

function parseCalleeAddresses(callees = []) {
  const addrs = new Set();
  for (const c of callees) {
    if (ADDR_RE.test(c)) {
      addrs.add(c.toLowerCase());
      continue;
    }
    const m = c.match(/FUN_([0-9a-fA-F]+)/i);
    if (m) addrs.add(`0x${m[1].toLowerCase()}`);
  }
  return [...addrs];
}

function hasFunCallee(callees = []) {
  return callees.some((c) => ADDR_RE.test(c) || /FUN_[0-9a-fA-F]+/i.test(c));
}

const typeCounts = new Map();
const maps = [];

for (const stem of mapStems) {
  const path = join(levelsDir, `${stem}.json`);
  const data = JSON.parse(readFileSync(path, 'utf8'));
  maps.push({
    stem,
    triggers: data.Triggers?.length ?? 0,
    reactions: data.Reactions?.length ?? 0,
  });
  for (const r of data.Reactions ?? []) {
    typeCounts.set(r.ReactionType, (typeCounts.get(r.ReactionType) ?? 0) + 1);
  }
}

const reactionTypes = [...typeCounts.entries()]
  .sort((a, b) => b[1] - a[1])
  .map(([name, count]) => {
    const entry = byName[name];
    const catalogCallees = entry?.callees ?? [];
    return {
      name,
      count,
      dispatchCase: entry?.ghidra?.dispatchCase ?? null,
      catalogCallees,
      missingCallee: !hasFunCallee(catalogCallees),
    };
  });

const fnMap = new Map();

for (const { name } of reactionTypes) {
  const entry = byName[name];
  if (!entry?.callees) continue;
  for (const addr of parseCalleeAddresses(entry.callees)) {
    const legacyName = `FUN_${addr.slice(2)}`;
    if (!fnMap.has(addr)) {
      fnMap.set(addr, {
        address: addr,
        legacyNames: [legacyName],
        reactionTypes: [name],
        status: 'pending',
      });
    } else {
      const rec = fnMap.get(addr);
      if (!rec.legacyNames.includes(legacyName)) rec.legacyNames.push(legacyName);
      if (!rec.reactionTypes.includes(name)) rec.reactionTypes.push(name);
    }
  }
}

const functions = [...fnMap.values()].sort((a, b) => a.address.localeCompare(b.address));
const missingTypes = reactionTypes.filter((t) => t.missingCallee).map((t) => t.name);

const worklist = {
  version: 1,
  generatedAt: new Date().toISOString(),
  maps,
  reactionTypes,
  functions,
  summary: {
    mapCount: maps.length,
    reactionTypeCount: reactionTypes.length,
    functionCount: functions.length,
    missingCalleeTypes: missingTypes,
  },
};

writeFileSync(outPath, `${JSON.stringify(worklist, null, 2)}\n`);
console.log(`Wrote ${outPath}`);
console.log(`Maps: ${maps.map((m) => `${m.stem} (${m.triggers} triggers, ${m.reactions} reactions)`).join('; ')}`);
console.log(`Reaction types: ${reactionTypes.length}, unique FUN addresses: ${functions.length}`);
if (missingTypes.length) {
  console.log(`Missing FUN_* callees (${missingTypes.length}): ${missingTypes.join(', ')}`);
}
