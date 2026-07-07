/**
 * level-objects.js — instanced object placement (shared by level.js + play).
 */

import * as THREE from 'three';
import { buildMaterial } from './materials.js';
import { sectionGeometry } from './geo-mesh.js';
import { resolveModelPath } from './model-resolve.js';
import { isTrigger, placementCategory } from './level-visibility.js';

/** World Y from dump — Location.Y is already terrain-resolved; do not add TerrainOffset. */
export function placementY(o) {
  return o.Pos?.[1] ?? 0;
}

export function placementScale(o, correction = 1) {
  return (o.Scale || 1) * (o.CloneScale ?? 1) * correction;
}

export function modelCorrection(parsed, lod0) {
  const bb = parsed.bodyBBox;
  if (!bb) return 1;
  const bodyExt = Math.max(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]);
  let mn = [Infinity, Infinity, Infinity];
  let mx = [-Infinity, -Infinity, -Infinity];
  for (const s of lod0) {
    const p = s.positions;
    for (let i = 0; i < p.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        if (p[i + k] < mn[k]) mn[k] = p[i + k];
        if (p[i + k] > mx[k]) mx[k] = p[i + k];
      }
    }
  }
  const visExt = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]);
  if (!(visExt > 0) || !(bodyExt > 0)) return 1;
  return bodyExt / visExt;
}

export function pickLod0(sections) {
  const minLod = Math.min(...sections.map((s) => s.lod));
  return sections.filter((s) => s.lod === minLod && !/shadowprojection/i.test(s.effect || ''));
}

/** Rotate (x,y,z) by quaternion q=[x,y,z,w]. */
function qrotate(q, x, y, z) {
  const [qx, qy, qz, qw] = q;
  const tx = 2 * (qy * z - qz * y);
  const ty = 2 * (qz * x - qx * z);
  const tz = 2 * (qx * y - qy * x);
  return [x + qw * tx + (qy * tz - qz * ty), y + qw * ty + (qz * tx - qx * tz), z + qw * tz + (qx * ty - qy * tx)];
}

function transformedBounds(sections, rt) {
  const { quat, translation: t, scale: s } = rt;
  const mn = [Infinity, Infinity, Infinity];
  const mx = [-Infinity, -Infinity, -Infinity];
  for (const sec of sections) {
    const p = sec.positions;
    if (!p) continue;
    for (let i = 0; i < p.length; i += 3) {
      const r = qrotate(quat, p[i] * s[0], p[i + 1] * s[1], p[i + 2] * s[2]);
      for (let k = 0; k < 3; k++) {
        const v = r[k] + t[k];
        if (v < mn[k]) mn[k] = v;
        if (v > mx[k]) mx[k] = v;
      }
    }
  }
  return { mn, mx };
}

/**
 * Bake the model's TADB root transform (hkQsTransform: rotation, translation,
 * scale) into the raw vertices so the mesh lands in its true (bodyBBox) frame —
 * this is what the engine's phyBone does. Fixes props authored in a rotated /
 * offset local frame (vehicles on their side, doors sunk into the ground).
 *
 * Safety net: only applied when the transformed geometry actually matches the
 * authoritative bodyBBox, so a mis-located transform can never move a model that
 * already renders correctly. Returns true when applied (caller then skips
 * modelCorrection, whose scale is subsumed by the transform's scale).
 */
export function applyRootTransform(parsed) {
  if (parsed._rootTransformApplied) return true;
  const rt = parsed.rootTransform;
  const bb = parsed.bodyBBox;
  if (!rt || !bb) return false;
  const tb = transformedBounds(parsed.sections, rt);
  const diag = Math.hypot(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]) || 1;
  let err = 0;
  for (let k = 0; k < 3; k++) err += Math.abs(tb.mn[k] - bb.min[k]) + Math.abs(tb.mx[k] - bb.max[k]);
  if (err > 0.2 * diag) return false; // transform doesn't align to body -> don't trust it
  const { quat, translation: t, scale: s } = rt;
  for (const sec of parsed.sections) {
    const p = sec.positions;
    if (p) {
      for (let i = 0; i < p.length; i += 3) {
        const r = qrotate(quat, p[i] * s[0], p[i + 1] * s[1], p[i + 2] * s[2]);
        p[i] = r[0] + t[0];
        p[i + 1] = r[1] + t[1];
        p[i + 2] = r[2] + t[2];
      }
    }
    const n = sec.normals;
    if (n) {
      for (let i = 0; i < n.length; i += 3) {
        const r = qrotate(quat, n[i], n[i + 1], n[i + 2]);
        n[i] = r[0];
        n[i + 1] = r[1];
        n[i + 2] = r[2];
      }
    }
  }
  parsed._rootTransformApplied = true;
  return true;
}

function placementObjects(data) {
  return data.Triggers?.length ? data.Objects : data.Objects.filter((o) => !isTrigger(o));
}

function addPlacementBoxes(targetGroup, objs, color, opacity, parseFailed) {
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const boxMat = new THREE.MeshStandardMaterial({ color, roughness: 0.8, transparent: true, opacity });
  const inst = new THREE.InstancedMesh(boxGeo, boxMat, objs.length);
  inst.userData.objs = objs.map((o) => ({
    ...o,
    _resolved: false,
    _category: placementCategory(o, { parseFailed }),
  }));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  objs.forEach((o, i) => {
    const sc = Math.min(Math.max(placementScale(o) * 3, 2), 40);
    p.set(o.Pos[0], placementY(o) + sc / 2, o.Pos[2]);
    q.set(o.Rot[0], o.Rot[1], o.Rot[2], o.Rot[3]);
    s.set(sc, sc, sc);
    inst.setMatrixAt(i, m.compose(p, q, s));
  });
  inst.instanceMatrix.needsUpdate = true;
  targetGroup.add(inst);
}

function isCollidableObject(o) {
  const name = (o.Unique || o.Short || '').toLowerCase();
  if (name.includes('sec_dec') || name.includes('_dec_') || name.includes('sec_decals') || name.includes('decal') || name.includes('crack') || name.includes('white-line') || name.includes('tire-track') || name.includes('oil') || name.includes('skid') || name.includes('manhole')) {
    return false;
  }
  return true;
}

/**
 * @param {object} opts
 * @param {object} opts.level
 * @param {Map<string,string>} opts.modelByStem
 * @param {import('./materials.js').TextureBank} opts.textureBank
 * @param {function(string): Promise<object|null>} opts.loadGeo
 * @param {number} [opts.maxUniqueModels]
 * @param {number} [opts.concurrency]
 */
export async function buildInstancedObjects(opts) {
  const {
    level,
    modelByStem,
    textureBank,
    loadGeo,
    maxUniqueModels = 800,
    concurrency = 12,
  } = opts;

  const rootGroup = new THREE.Group();
  const boxGroup = new THREE.Group();
  const failGroup = new THREE.Group();
  rootGroup.add(boxGroup);
  rootGroup.add(failGroup);

  const objectMeshes = new Map();
  const nonTriggers = placementObjects(level);
  const byModel = new Map();
  const unresolved = [];
  const colliders = [];

  for (const o of nonTriggers) {
    const p = resolveModelPath(o, modelByStem);
    if (p) {
      if (!byModel.has(p)) byModel.set(p, []);
      byModel.get(p).push(o);
    } else {
      unresolved.push(o);
    }
  }

  const modelEntries = [...byModel.entries()].sort((a, b) => b[1].length - a[1].length);
  const loadEntries = modelEntries.slice(0, maxUniqueModels);
  const boxedEntries = modelEntries.slice(maxUniqueModels);
  for (const [, objs] of boxedEntries) unresolved.push(...objs);

  if (unresolved.length) {
    addPlacementBoxes(boxGroup, unresolved, 0x8a5cff, 0.55, false);
    for (const o of unresolved) {
      objectMeshes.set(o.Coid, boxGroup);
      if (!isCollidableObject(o)) continue;
      const sc = Math.min(Math.max(placementScale(o) * 3, 2), 40);
      const half = sc / 2;
      colliders.push({
        coid: o.Coid,
        min: [o.Pos[0] - half, placementY(o), o.Pos[2] - half],
        max: [o.Pos[0] + half, placementY(o) + sc, o.Pos[2] + half],
        label: o.Unique || o.Short || '',
      });
    }
  }

  let placed = 0;
  let parseFailed = 0;
  let idx = 0;

  async function worker() {
    while (idx < loadEntries.length) {
      const my = idx++;
      const [path, objs] = loadEntries[my];
      const parsed = await loadGeo(path);
      if (!parsed) {
        parseFailed += objs.length;
        addPlacementBoxes(failGroup, objs, 0xff5c5c, 0.5, true);
        for (const o of objs) {
          if (!isCollidableObject(o)) continue;
          const sc = Math.min(Math.max(placementScale(o) * 3, 2), 40);
          const half = sc / 2;
          colliders.push({
            coid: o.Coid,
            min: [o.Pos[0] - half, placementY(o), o.Pos[2] - half],
            max: [o.Pos[0] + half, placementY(o) + sc, o.Pos[2] + half],
            label: o.Unique || o.Short || '',
          });
        }
        continue;
      }
      // Bake the TADB root transform into the vertices when it aligns to bodyBBox;
      // its scale then subsumes modelCorrection (avoid double-scaling).
      const rooted = applyRootTransform(parsed);
      const lod0 = pickLod0(parsed.sections);
      const correction = rooted ? 1 : modelCorrection(parsed, lod0);
      const isInvis = /(^|\/)invis[^/]*\.geo$/i.test(path);
      for (const section of lod0) {
        if (!section.indices?.length) continue;
        const geo = sectionGeometry(section);
        const { material } = buildMaterial(section, textureBank, {});
        if (isInvis) {
          material.transparent = true;
          material.opacity = 0.08;
          material.depthWrite = false;
        }
        const inst = new THREE.InstancedMesh(geo, material, objs.length);
        // Tag with source model + per-instance object records so a raycast picker
        // can resolve instanceId -> { Coid, Unique/Short, Cbid } (level.js parity).
        inst.name = path.split('/').pop().replace(/\.geo$/i, '');
        inst.userData.model = path;
        inst.userData.objs = objs;
        const m = new THREE.Matrix4();
        const q = new THREE.Quaternion();
        const sv = new THREE.Vector3();
        const pv = new THREE.Vector3();
        objs.forEach((o, i) => {
          pv.set(o.Pos[0], placementY(o), o.Pos[2]);
          q.set(o.Rot[0], o.Rot[1], o.Rot[2], o.Rot[3]);
          const sc = placementScale(o, correction);
          sv.set(sc, sc, sc);
          const matrix = m.compose(pv, q, sv);
          inst.setMatrixAt(i, matrix);
          objectMeshes.set(o.Coid, inst);

          if (!isCollidableObject(o)) return;

          if (parsed.bodyBBox) {
            const localMin = new THREE.Vector3().fromArray(parsed.bodyBBox.min);
            const localMax = new THREE.Vector3().fromArray(parsed.bodyBBox.max);
            const box = new THREE.Box3(localMin, localMax);
            box.applyMatrix4(matrix);
            colliders.push({
              coid: o.Coid,
              min: [box.min.x, box.min.y, box.min.z],
              max: [box.max.x, box.max.y, box.max.z],
              label: o.Unique || o.Short || '',
            });
          } else {
            const half = sc * 2;
            colliders.push({
              coid: o.Coid,
              min: [o.Pos[0] - half, placementY(o), o.Pos[2] - half],
              max: [o.Pos[0] + half, placementY(o) + half * 2, o.Pos[2] + half],
              label: o.Unique || o.Short || '',
            });
          }
        });
        inst.instanceMatrix.needsUpdate = true;
        inst.frustumCulled = false;
        rootGroup.add(inst);
        placed += objs.length;
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  return {
    group: rootGroup,
    objectMeshes,
    colliders,
    stats: {
      placed,
      unresolved: unresolved.length,
      parseFailed,
      loadedModels: loadEntries.length,
    },
  };
}
