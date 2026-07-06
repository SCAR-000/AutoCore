/**
 * geo-mesh-lib.js — pure .geo mesh helpers (no three.js; Node-testable).
 */

/** Default Y slack when classifying baked wheel sections in obj_veh geos. */
export const BAKED_WHEEL_Y_EPSILON = 0.05;

function isShadowEffect(effect) {
  return /shadowprojection/i.test(effect || '');
}

/**
 * @param {Map<string,string>|Record<string,string>} stems lowercase stem → repo path
 * @param {string[]} names candidate clonebase names (UniqueName, PhysicsName, …)
 * @returns {string|null} resolved stem (without .geo) or null
 */
export function resolveModelStem(stems, names) {
  const lookup = (stem) => {
    const key = stem.toLowerCase();
    if (stems instanceof Map) return stems.get(key) ?? null;
    return stems[key] ?? null;
  };

  for (const name of names) {
    if (!name) continue;
    const base = name.trim().toLowerCase();
    for (const candidate of [`obj_${base}`, base]) {
      if (lookup(candidate)) return candidate;
    }
  }
  return null;
}

/**
 * LOD 0 sections, excluding shadow-projection passes (viewer.js default).
 * @param {Array<{ lod: number, effect?: string }>} sections
 */
export function pickLod0Sections(sections) {
  if (!sections.length) return [];
  const minLod = Math.min(...sections.map((s) => s.lod));
  return sections.filter(
    (s) => s.lod === minLod && !isShadowEffect(s.effect),
  );
}

/**
 * Lowest Y among a section's vertices.
 * @param {{ positions: Float32Array }} section
 */
export function sectionMinY(section) {
  const pos = section.positions;
  let minY = Infinity;
  for (let i = 1; i < pos.length; i += 3) {
    if (pos[i] < minY) minY = pos[i];
  }
  return minY;
}

/**
 * Highest Y among a section's vertices.
 * @param {{ positions: Float32Array }} section
 */
export function sectionMaxY(section) {
  const pos = section.positions;
  let maxY = -Infinity;
  for (let i = 1; i < pos.length; i += 3) {
    if (pos[i] > maxY) maxY = pos[i];
  }
  return maxY;
}

/**
 * True for separate baked wheel/tire sections in obj_veh geos.
 *
 * Requires geometry at the body XOBB floor *and* confined to the lower half of
 * the vehicle (avoids classifying monolithic body sections or veh_* fallbacks).
 *
 * @param {{ positions: Float32Array }} section
 * @param {{ min: number[], max?: number[], center?: number[] }|null|undefined} bodyBBox
 * @param {number} [epsilon]
 * @param {number} [headroom] max Y slack above body XOBB center for wheel sections
 */
export function isBakedWheelSection(section, bodyBBox, epsilon = BAKED_WHEEL_Y_EPSILON, headroom = 0.75) {
  if (!bodyBBox || !Array.isArray(bodyBBox.min)) return false;
  const minY = sectionMinY(section);
  if (minY > bodyBBox.min[1] + epsilon) return false;
  const maxY = sectionMaxY(section);
  const centerY = bodyBBox.center?.[1]
    ?? ((bodyBBox.min[1] + (bodyBBox.max?.[1] ?? bodyBBox.min[1])) / 2);
  return maxY <= centerY + headroom;
}

/**
 * LOD0 body sections for play.html — optionally drops baked wheel geometry when
 * animating separate Wheel0Name meshes. Never returns empty if LOD0 exists.
 *
 * @param {Array<{ lod: number, effect?: string, positions: Float32Array }>} sections
 * @param {{ min: number[] }|null|undefined} bodyBBox
 * @param {boolean} skipBakedWheels
 */
export function filterBodySections(sections, bodyBBox, skipBakedWheels) {
  const lod0 = pickLod0Sections(sections);
  let kept = lod0.filter(
    (s) => !skipBakedWheels || !isBakedWheelSection(s, bodyBBox),
  );
  if (kept.length === 0 && lod0.length > 0) kept = lod0;
  return kept;
}

/**
 * Authored wheel size from a parsed wheel `.geo` (axle along +X, roll about X).
 *
 * @param {{ bodyBBox?: { min: number[], max?: number[], radius?: number } }} parsed
 * @returns {{ radius: number, width: number }}
 */
export function geoAuthoredWheelMetrics(parsed) {
  const bb = parsed?.bodyBBox;
  if (!bb || !Array.isArray(bb.min)) {
    return { radius: 0.5, width: 0.5 };
  }
  const min = bb.min;
  const max = bb.max ?? min;
  const width = max[0] - min[0];
  let radius = bb.radius;
  if (!(typeof radius === 'number' && radius > 0)) {
    radius = Math.max(max[1] - min[1], max[2] - min[2]) / 2;
  }
  if (!(radius > 0)) radius = 0.5;
  return { radius, width: width > 0 ? width : radius };
}

/**
 * Per-wheel mesh scale from physics `WheelRadius` / `WheelWidth` vs authored geo.
 * play.html rolls wheels with `rotateX`, so radius scales Y and Z; width scales X.
 *
 * @param {{ radius: number, width: number }} authored
 * @param {number} targetRadius world-space rolling radius (m)
 * @param {number} targetWidth world-space tire width along axle (m)
 * @param {boolean} [mirrorLeft] negate X for left-side wheels
 * @returns {{ x: number, y: number, z: number }}
 */
export function wheelMeshScaleFromPhysics(authored, targetRadius, targetWidth, mirrorLeft = false) {
  const rScale = targetRadius / authored.radius;
  const wScale = targetWidth / authored.width;
  const sx = (mirrorLeft ? -1 : 1) * wScale;
  return { x: sx, y: rScale, z: rScale };
}
