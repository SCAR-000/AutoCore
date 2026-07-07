import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ATLAS_GRID, uvRectForTextureId } from './particle-atlas.js';

describe('uvRectForTextureId', () => {
  it('maps decimal block 16 to row 2 col 0 cell', () => {
    const uv = uvRectForTextureId('16');
    const col = 16 % ATLAS_GRID; // 0
    const row = Math.floor(16 / ATLAS_GRID); // 2
    const cell = 1 / ATLAS_GRID;
    assert.equal(uv.u0, col * cell);
    assert.equal(uv.v0, row * cell);
    assert.equal(uv.u1, uv.u0 + cell);
    assert.equal(uv.v1, uv.v0 + cell);
  });

  it('treats a single-digit block + letter as a quadrant (4C = block 4, quad C)', () => {
    const uv = uvRectForTextureId('4C');
    // block 4 → col 4, row 0; quadrant C = lower-left
    assert.equal(uv.u0, 4 / ATLAS_GRID);
    assert.equal(uv.v0, 0.5 / ATLAS_GRID);
    assert.equal(uv.u1 - uv.u0, 0.5 / ATLAS_GRID);
  });

  it('quarters block with A suffix (upper-left)', () => {
    const full = uvRectForTextureId('15');
    const sub = uvRectForTextureId('15A');
    const w = full.u1 - full.u0;
    const h = full.v1 - full.v0;
    assert.equal(sub.u0, full.u0);
    assert.equal(sub.v0, full.v0);
    assert.equal(sub.u1, full.u0 + w * 0.5);
    assert.equal(sub.v1, full.v0 + h * 0.5);
  });

  it('maps 63D to bottom-right sub-quadrant of last block', () => {
    const uv = uvRectForTextureId('63D');
    assert.ok(uv.u0 >= 0.875);
    assert.ok(uv.v0 >= 0.875);
    assert.equal(uv.u1 - uv.u0, 0.0625);
    assert.equal(uv.v1 - uv.v0, 0.0625);
  });
});
