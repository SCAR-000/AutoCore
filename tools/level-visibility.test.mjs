#!/usr/bin/env node
/**
 * level-visibility.test.mjs — unit tests for placement classification helpers.
 * Run: node tools/level-visibility.test.mjs
 */

import { isTrigger, placementCategory, resolvedMeshCategory } from './model-viewer/level-visibility.js';

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; return; }
  failed++;
  console.error(`FAIL: ${msg}`);
}

function assertEq(actual, expected, msg) {
  assert(actual === expected, `${msg}: expected ${expected}, got ${actual}`);
}

// isTrigger
assertEq(isTrigger({ Type: 'Trigger' }), true, 'Trigger type');
assertEq(isTrigger({ Type: 'Object' }), false, 'Object type');
assertEq(isTrigger({ Type: 'ObjectGraphicsPhysics' }), false, 'ObjectGraphicsPhysics type');
assertEq(isTrigger({}), false, 'missing Type');
assertEq(isTrigger(null), false, 'null obj');

// placementCategory — trigger always wins
assertEq(
  placementCategory({ Type: 'Trigger' }, { resolved: true }),
  'trigger',
  'trigger overrides resolved flag',
);
assertEq(
  placementCategory({ Type: 'Trigger' }, { parseFailed: true }),
  'trigger',
  'trigger overrides parseFailed flag',
);

// placementCategory — resolved paths
assertEq(
  placementCategory({ Type: 'ObjectGraphicsPhysics' }, { resolved: true }),
  'resolved-physics',
  'resolved physics prop',
);
assertEq(
  placementCategory({ Type: 'Object' }, { resolved: true }),
  'resolved-graphics',
  'resolved graphics-only',
);
assertEq(
  placementCategory({}, { resolved: true }),
  'resolved-physics',
  'resolved default type falls back to physics',
);

// placementCategory — parse-failed and unresolved
assertEq(
  placementCategory({ Type: 'ObjectGraphicsPhysics' }, { parseFailed: true }),
  'parse-failed',
  'parse failed',
);
assertEq(
  placementCategory({ Type: 'ObjectGraphicsPhysics' }),
  'unresolved',
  'unresolved physics prop',
);
assertEq(
  placementCategory({ Type: 'Object' }),
  'unresolved',
  'unresolved graphics prop',
);

// resolvedMeshCategory
assertEq(resolvedMeshCategory('Object'), 'resolved-graphics', 'mesh category graphics');
assertEq(resolvedMeshCategory('ObjectGraphicsPhysics'), 'resolved-physics', 'mesh category physics');
assertEq(resolvedMeshCategory(undefined), 'resolved-physics', 'mesh category default');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
