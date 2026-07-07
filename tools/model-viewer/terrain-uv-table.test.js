import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  comboIndex,
  rot90,
  buildComboEntry,
  buildTileUvTable,
  solidVariantOffset,
  tileAtVertex,
  cornerStageUvs,
  MASK_COL,
} from './terrain-uv-table.js';

describe('terrain-uv-table', () => {
  it('comboIndex packs 4 tile indices', () => {
    assert.equal(comboIndex(0, 0, 0, 0), 0);
    assert.equal(comboIndex(1, 0, 0, 0), 1);
    assert.equal(comboIndex(0, 1, 0, 0), 8);
    assert.equal(comboIndex(0, 0, 1, 0), 64);
    assert.equal(comboIndex(0, 0, 0, 1), 512);
    assert.equal(comboIndex(7, 7, 7, 7), 7 + 56 + 448 + 3584);
  });

  it('rot90 matches Ra(x,y)=(y,1-x)', () => {
    assert.deepEqual(rot90(0, 0, 0), [0, 0]);
    assert.deepEqual(rot90(0.25, 0.75, 1), [0.75, 0.75]);
    assert.deepEqual(rot90(0.25, 0.75, 2), [0.75, 0.25]);
    assert.deepEqual(rot90(0.25, 0.75, 3), [0.25, 0.25]);
  });

  it('uniform combo entry has identical stage UVs per corner', () => {
    const entry = buildComboEntry(3, 3, 3, 3);
    for (let ci = 0; ci < 4; ci++) {
      const stages = cornerStageUvs(entry, ci);
      for (let s = 1; s < 4; s++) {
        assert.equal(stages[s][0], stages[0][0]);
        assert.equal(stages[s][1], stages[0][1]);
      }
    }
  });

  it('solid variant offset is in 0, 0.125, 0.25, 0.375', () => {
    const vals = new Set();
    for (let r = 0; r < 50; r++) {
      for (let c = 0; c < 50; c++) {
        vals.add(solidVariantOffset(c, r));
      }
    }
    for (const v of vals) {
      assert.ok([0, 0.125, 0.25, 0.375].includes(v), `unexpected offset ${v}`);
    }
  });

  it('tileAtVertex applies (-1,-1) offset and clamps', () => {
    const grid = new Uint8Array([0, 1, 2, 3]);
    assert.equal(tileAtVertex(grid, 2, 2, 0, 0), 0);
    assert.equal(tileAtVertex(grid, 2, 2, 1, 1), 0);
    assert.equal(tileAtVertex(grid, 2, 2, 2, 2), 3);
  });

  it('buildTileUvTable returns 4096 entries', () => {
    const table = buildTileUvTable();
    assert.equal(table.length, 4096 * 32);
    const idx = comboIndex(2, 2, 3, 3);
    const entry = table.subarray(idx * 32, idx * 32 + 32);
    assert.ok(entry[0] >= 0 && entry[0] <= 1);
    assert.ok(entry[16] >= 0 && entry[16] <= 1);
  });

  it('MASK_COL has 16 entries', () => {
    assert.equal(MASK_COL.length, 16);
  });
});
