/**
 * particle-atlas.js — map NFX textureID values to UV rects on particles.dds.
 *
 * Atlas layout (from exampleScript_nfx.xml):
 *   8×8 grid of blocks indexed 0–63 (decimal, left-to-right then top-to-bottom).
 *   Optional suffix A/B/C/D selects a quadrant within the block.
 */

import { parseTextureId } from './nfx-parser.js';

export const ATLAS_GRID = 8;

/** Sub-quadrant offsets within a block (A=UL, B=UR, C=LL, D=LR). */
const SUB_QUAD = {
  A: { u0: 0, v0: 0, u1: 0.5, v1: 0.5 },
  B: { u0: 0.5, v0: 0, u1: 1, v1: 0.5 },
  C: { u0: 0, v0: 0.5, u1: 0.5, v1: 1 },
  D: { u0: 0.5, v0: 0.5, u1: 1, v1: 1 },
};

/**
 * UV rect { u0, v0, u1, v1 } for a textureID string.
 * D3D convention: v=0 at top; DDS loaded without flipY in materials.js.
 * @param {string} idStr
 * @returns {{ u0: number, v0: number, u1: number, v1: number }}
 */
export function uvRectForTextureId(idStr) {
  const parsed = parseTextureId(idStr);
  const block = parsed?.block ?? 0;
  const col = block % ATLAS_GRID;
  const row = Math.floor(block / ATLAS_GRID);
  const cell = 1 / ATLAS_GRID;

  let u0 = col * cell;
  let v0 = row * cell;
  let u1 = u0 + cell;
  let v1 = v0 + cell;

  const sub = parsed?.sub;
  if (sub && SUB_QUAD[sub]) {
    const q = SUB_QUAD[sub];
    const w = u1 - u0;
    const h = v1 - v0;
    u0 = u0 + q.u0 * w;
    v0 = v0 + q.v0 * h;
    u1 = u0 + (q.u1 - q.u0) * w;
    v1 = v0 + (q.v1 - q.v0) * h;
  }

  return { u0, v0, u1, v1 };
}

/** Pick a repo-relative particles.dds path from TextureBank index keys. */
export function resolveParticlesAtlasPath(textureIndex) {
  const candidates = ['particles.dds', 'mq_particles.dds', 'lq_particles.dds'];
  for (const key of candidates) {
    const hit = textureIndex[key];
    if (hit) return hit;
  }
  return null;
}

/**
 * Load the particle atlas texture via TextureBank.
 * @param {import('./materials.js').TextureBank} bank
 */
export function loadParticleAtlas(bank) {
  const path = resolveParticlesAtlasPath(bank.index);
  if (!path) return { texture: bank.placeholder, resolved: false };
  const name = path.split('/').pop();
  return bank.load(name, { srgb: true });
}
