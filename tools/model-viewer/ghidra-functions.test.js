import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  lookupGhidraFunction,
  formatGhidraCallee,
  resolveGhidraCallees,
  buildGhidraCalleeHTML,
  GHIDRA_FUNCTION_COUNT,
} from './ghidra-functions.js';
import { buildReactionDetailHTML } from './trigger-graph.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const worklist = JSON.parse(
  readFileSync(join(__dirname, 'reaction-ghidra-worklist.json'), 'utf8'),
);

describe('ghidra-functions', () => {
  it('registry covers all worklist addresses', () => {
    assert.equal(GHIDRA_FUNCTION_COUNT, worklist.functions.length);
    for (const fn of worklist.functions) {
      const entry = lookupGhidraFunction(fn.address);
      assert.ok(entry, `missing registry entry for ${fn.address}`);
      assert.equal(entry.symbol, entry.symbol);
      assert.ok(entry.decompiledSignature.includes(entry.symbol) || entry.decompiledSignature.length > 10);
    }
  });

  it('lookup resolves FUN_ legacy names', () => {
    const entry = lookupGhidraFunction('FUN_00521e00');
    assert.equal(entry?.symbol, 'CVOGReaction_MarkRepairStation');
    assert.equal(entry?.address, '0x00521e00');
  });

  it('formatGhidraCallee shows symbol and decompiled signature', () => {
    const entry = lookupGhidraFunction('0x00533f90');
    const text = formatGhidraCallee(entry);
    assert.match(text, /CVOGReaction_CompleteObjective/);
    assert.match(text, /decompiledSignature|CompleteObjective|param_1/);
    assert.match(text, /0x00533f90/);
  });

  it('resolveGhidraCallees dedupes and skips vtable slots', () => {
    const list = resolveGhidraCallees(['FUN_004bae70', 'vtable+0x114', 'FUN_004bae70']);
    assert.equal(list.length, 1);
    assert.equal(list[0].symbol, 'CVOGReaction_ResolveObjectTarget');
  });

  it('buildGhidraCalleeHTML renders symbol and signature', () => {
    const entries = resolveGhidraCallees(['FUN_00521e00', 'FUN_004d38b0']);
    const html = buildGhidraCalleeHTML(entries, (s) => s);
    assert.match(html, /CVOGReaction_MarkRepairStation/);
    assert.match(html, /tp-ghidra-fn/);
    assert.match(html, /0x00521e00/);
  });
});

describe('trigger-graph ghidra callees', () => {
  it('buildReactionDetailHTML includes formatted callee rows for MarkRepairStation', () => {
    const data = {
      Reactions: [
        {
          Coid: 1,
          Cbid: 1,
          ReactionType: 'MarkRepairStation',
          GenericVar1: 3,
          Objects: [],
        },
      ],
      ObjectIndex: {},
      MapLogic: { Variables: [] },
    };
    const html = buildReactionDetailHTML(1, data);
    assert.match(html, /Ghidra callees/);
    assert.match(html, /CVOGReaction_MarkRepairStation/);
    assert.match(html, /CVOGReaction_UpdateRepairStationPosition/);
    assert.match(html, /tp-ghidra-fn/);
  });

  it('buildReactionDetailHTML includes CompleteObjective callees', () => {
    const data = {
      Reactions: [
        {
          Coid: 2,
          Cbid: 2,
          ReactionType: 'CompleteObjective',
          GenericVar1: 10,
          ObjectiveIDCheck: 1,
          Objects: [],
        },
      ],
      ObjectIndex: {},
      MapLogic: { Variables: [] },
    };
    const html = buildReactionDetailHTML(2, data);
    assert.match(html, /CVOGReaction_CompleteObjective/);
  });
});
