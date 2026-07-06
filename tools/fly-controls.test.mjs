#!/usr/bin/env node
/**
 * fly-controls.test.mjs — unit tests for fly control helpers.
 * Run: node tools/fly-controls.test.mjs
 */

import { shouldIgnoreKeyEvent, movementSpeed } from './model-viewer/fly-controls-helpers.js';

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; return; }
  failed++;
  console.error(`FAIL: ${msg}`);
}

function assertClose(actual, expected, msg) {
  assert(Math.abs(actual - expected) < 1e-6, `${msg}: expected ${expected}, got ${actual}`);
}

assert(shouldIgnoreKeyEvent({ target: { tagName: 'INPUT' } }), 'ignore input');
assert(shouldIgnoreKeyEvent({ target: { tagName: 'TEXTAREA' } }), 'ignore textarea');
assert(!shouldIgnoreKeyEvent({ target: { tagName: 'DIV' } }), 'allow div');

const idle = { forward: false, back: false, left: false, right: false, up: false, down: false, boost: false };
assertClose(movementSpeed(idle, 400, 3, 0.016), 0, 'idle speed');

const forward = { ...idle, forward: true };
assertClose(movementSpeed(forward, 400, 3, 0.016), 6.4, 'forward speed');

const boosted = { ...forward, boost: true };
assertClose(movementSpeed(boosted, 400, 3, 0.016), 19.2, 'boost speed');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
