/**
 * terrain-uv-table.js — port of CVOGTerrain::BuildTileUVTable @ 0x5bedd0 (autoassault.exe).
 *
 * Precomputes atlas UVs for every combination of 4 corner tile indices (8^4 = 4096 entries).
 * Each entry holds 4 corners × 4 texture stages × (U,V) = 32 floats.
 *
 * See docs/level-renderer.md and Ghidra plate comments on BuildTileUVTable.
 */

export const MASK_COL = [4, 0, 0, 1, 0, 1, 3, 2, 0, 3, 1, 2, 1, 2, 2, 4];
export const MASK_ROT = [0, 0, 3, 3, 1, 0, 1, 0, 2, 0, 2, 3, 1, 1, 2, 0];

const CELL = 0.125;
const INSET = 0.0078125;
const EXTENT = 0.109375;

/** U float offsets per corner/stage within one 32-float LUT entry. */
const CORNER_U_OFFSET = [0, 4, 8, 12];
const CORNER_V_OFFSET = [16, 20, 24, 28];

/** @param {number} tA corner at cell-min (0,0) */
export function comboIndex(tA, tB, tC, tD) {
  return tA + tB * 8 + tC * 64 + tD * 512;
}

/** Ra(x,y) = (y, 1-x), applied r times. */
export function rot90(fx, fy, r) {
  let x = fx;
  let y = fy;
  for (let i = 0; i < (r & 3); i++) {
    const nx = y;
    const ny = 1 - x;
    x = nx;
    y = ny;
  }
  return [x, y];
}

function layerUv(row, col, rot, fx, fy) {
  const [rx, ry] = rot90(fx, fy, rot);
  const u = col * CELL + INSET + rx * EXTENT;
  const v = row * CELL + INSET + ry * EXTENT;
  return [u, v];
}

/**
 * Build one 32-float LUT entry for corner tiles (a,b,c,d) at local fractions
 * (fx,fy) for each of the 4 quad corners.
 *
 * @returns {Float32Array} length 32 — U[0..15] then V[0..15] per corner/stage layout
 */
export function buildComboEntry(tA, tB, tC, tD) {
  const corners = [tA, tB, tC, tD];
  const out = new Float32Array(32);
  const fracs = [[0, 0], [1, 0], [0, 1], [1, 1]];

  for (let ci = 0; ci < 4; ci++) {
    const [fx, fy] = fracs[ci];
    const tiles = [];
    for (const t of corners) {
      if (!tiles.includes(t)) tiles.push(t);
    }
    tiles.sort((a, b) => a - b);

    const stageRows = new Array(4).fill(0);
    const stageCols = new Array(4).fill(4);
    const stageRots = new Array(4).fill(0);

    let layer = 0;
    for (const tile of tiles) {
      let mask = 0;
      if (corners[0] === tile) mask |= 1;
      if (corners[2] === tile) mask |= 2;
      if (corners[1] === tile) mask |= 4;
      if (corners[3] === tile) mask |= 8;
      const si = 3 - layer;
      stageRows[si] = tile;
      stageCols[si] = MASK_COL[mask];
      stageRots[si] = MASK_ROT[mask];
      layer++;
    }

    if (tiles.length === 1) {
      for (let s = 0; s < 4; s++) {
        stageRows[s] = tiles[0];
        stageCols[s] = 4;
        stageRots[s] = 0;
      }
    } else {
      // Pad unused stages with the base layer (Ghidra copies into empty slots).
      const base = 4 - tiles.length;
      for (let s = 0; s < base; s++) {
        stageRows[s] = stageRows[base];
        stageCols[s] = stageCols[base];
        stageRots[s] = stageRots[base];
      }
    }

    for (let s = 0; s < 4; s++) {
      const [u, v] = layerUv(stageRows[s], stageCols[s], stageRots[s], fx, fy);
      out[CORNER_U_OFFSET[ci] + s] = u;
      out[CORNER_V_OFFSET[ci] + s] = v;
    }
  }

  return out;
}

let cachedTable = null;

/** @returns {Float32Array} flat 4096×32 floats */
export function buildTileUvTable() {
  if (cachedTable) return cachedTable;
  const table = new Float32Array(4096 * 32);
  for (let d = 0; d < 8; d++) {
    for (let c = 0; c < 8; c++) {
      for (let b = 0; b < 8; b++) {
        for (let a = 0; a < 8; a++) {
          const idx = comboIndex(a, b, c, d);
          table.set(buildComboEntry(a, b, c, d), idx * 32);
        }
      }
    }
  }
  cachedTable = table;
  return table;
}

/**
 * Per-tile-cell U offset when all 4 corners share one layer: (rand & 3) * 0.125.
 * Uses tile-grid coordinates (not decimated mesh quad indices).
 */
export function solidVariantOffset(tileCol, tileRow) {
  const h = Math.sin(tileCol * 12.9898 + tileRow * 78.233) * 43758.5453;
  return (Math.floor((h - Math.floor(h)) * 4) & 3) * CELL;
}

/**
 * Tile layer index at a height-vertex grid position (offset -1,-1 per GetCornerData).
 */
export function tileAtVertex(tileGrid, width, height, col, row) {
  const c = Math.max(0, Math.min(col - 1, width - 1));
  const r = Math.max(0, Math.min(row - 1, height - 1));
  return tileGrid[r * width + c] & 7;
}

/**
 * Read stage UVs for one quad corner from a LUT entry.
 * @param {Float32Array} entry 32-float slice
 * @param {number} cornerIdx 0..3
 * @returns {number[][]} [[u,v]×4 stages]
 */
export function cornerStageUvs(entry, cornerIdx) {
  const uBase = CORNER_U_OFFSET[cornerIdx];
  const vBase = CORNER_V_OFFSET[cornerIdx];
  const stages = [];
  for (let s = 0; s < 4; s++) {
    stages.push([entry[uBase + s], entry[vBase + s]]);
  }
  return stages;
}
