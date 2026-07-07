/**
 * vfx-renderer.js — Three.js CPU-billboard particle renderer for NFX effects.
 *
 * Expands each particle to a camera-facing quad in JS so every sprite gets the
 * correct atlas UV (InstancedMesh custom UV attrs were unreliable in practice).
 */

import * as THREE from 'three';
import { loadParticleAtlas, uvRectForTextureId } from './particle-atlas.js';
import {
  createVfxSimulation,
  getLiveParticles,
  getLiveStrips,
  resetSimulation,
  tickSimulation,
} from './particle-sim-lib.js';
import { pickPreviewEvent } from './nfx-parser.js';
import { buildGeoGroup, pickLod0Sections } from './geo-mesh.js';
import { parseGeo } from './geo-parser.js';

const MAX_QUADS = 4096;
const MAX_VERTS = MAX_QUADS * 4;
const MAX_IDX = MAX_QUADS * 6;

const QUAD_UVS = [[0, 0], [1, 0], [1, 1], [0, 1]];
const QUAD_CORNERS = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
const QUAD_INDICES = [0, 1, 2, 0, 2, 3];

const vertexShader = /* glsl */`
attribute vec4 aColor;

varying vec2 vUv;
varying vec4 vColor;

void main() {
  vUv = uv;
  vColor = aColor;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = /* glsl */`
uniform sampler2D uMap;
uniform float uBright;

varying vec2 vUv;
varying vec4 vColor;

void main() {
  vec4 tex = texture2D(uMap, vUv);
  vec3 col = tex.rgb * vColor.rgb;
  float a = tex.a * vColor.a;
  if (a < 0.004) discard;
  if (uBright > 0.5) {
    gl_FragColor = vec4(col * a, a);
  } else {
    gl_FragColor = vec4(col, a);
  }
}
`;

const _camPos = new THREE.Vector3();
const _viewDir = new THREE.Vector3();
const _vel = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _scratch = new THREE.Vector3();

function makeParticleMesh(bright) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_VERTS * 3), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(MAX_VERTS * 2), 2));
  geo.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(MAX_VERTS * 4), 4));
  geo.setIndex(new THREE.BufferAttribute(new Uint16Array(MAX_IDX), 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: null },
      uBright: { value: bright ? 1 : 0 },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: bright ? THREE.AdditiveBlending : THREE.NormalBlending,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.count = 0;
  return mesh;
}

/**
 * Write one billboard quad into dynamic buffers.
 */
function writeQuad(p, camera, posArr, uvArr, colArr, baseVert) {
  _camPos.set(camera.position.x, camera.position.y, camera.position.z);
  _viewDir.set(p.x, p.y, p.z).sub(_camPos).normalize();

  const me = camera.matrixWorldInverse.elements;
  _right.set(me[0], me[1], me[2]).normalize();
  _up.set(me[4], me[5], me[6]).normalize();

  if (p.orient === 2) {
    // Decal: fixed quad lying in the plane whose normal is p.normal.
    const n = p.normal || { x: 0, y: 1, z: 0 };
    _up.set(n.x, n.y, n.z).normalize();
    const refX = Math.abs(_up.y) > 0.99 ? 1 : 0;
    _scratch.set(refX, refX ? 0 : 1, 0);
    _right.crossVectors(_up, _scratch).normalize();
    _up.crossVectors(_right, new THREE.Vector3(n.x, n.y, n.z).normalize()).normalize();
  } else if (p.orient > 0.5) {
    _vel.set(p.vx ?? 0, p.vy ?? 0, p.vz ?? 0);
    const vlen = _vel.length();
    if (vlen > 0.001) {
      _up.copy(_vel).multiplyScalar(1 / vlen);
      _right.crossVectors(_viewDir, _up);
      if (_right.lengthSq() < 1e-6) _right.crossVectors(_up, _scratch).normalize();
      else _right.normalize();
    }
  }

  const hw = p.scale * 0.5;
  const hh = (p.type === 'Billboard' ? p.scale : p.scaleY) * 0.5;
  const c = Math.cos(p.rotation);
  const s = Math.sin(p.rotation);
  const col = p.color || { r: 1, g: 1, b: 1 };
  const uvRect = uvRectForTextureId(p.textureId);

  for (let i = 0; i < 4; i++) {
    const vi = baseVert + i;
    const [lx, ly] = QUAD_CORNERS[i];
    const rx = lx * hw * c - ly * hh * s;
    const ry = lx * hw * s + ly * hh * c;

    posArr[vi * 3] = p.x + _right.x * rx + _up.x * ry;
    posArr[vi * 3 + 1] = p.y + _right.y * rx + _up.y * ry;
    posArr[vi * 3 + 2] = p.z + _right.z * rx + _up.z * ry;

    const [tu, tv] = QUAD_UVS[i];
    uvArr[vi * 2] = uvRect.u0 + tu * (uvRect.u1 - uvRect.u0);
    uvArr[vi * 2 + 1] = uvRect.v0 + tv * (uvRect.v1 - uvRect.v0);

    colArr[vi * 4] = col.r;
    colArr[vi * 4 + 1] = col.g;
    colArr[vi * 4 + 2] = col.b;
    colArr[vi * 4 + 3] = p.alpha;
  }
}

const _p0 = new THREE.Vector3();
const _p1 = new THREE.Vector3();
const _along = new THREE.Vector3();
const _perp = new THREE.Vector3();
const _toCam = new THREE.Vector3();

/**
 * Write one camera-facing ribbon segment (Trail / Lightning) into the buffers.
 * The quad connects seg.(x0,y0,z0)→(x1,y1,z1) with per-end width/colour/alpha.
 */
function writeSegment(seg, camera, posArr, uvArr, colArr, baseVert) {
  _p0.set(seg.x0, seg.y0, seg.z0);
  _p1.set(seg.x1, seg.y1, seg.z1);
  _along.subVectors(_p1, _p0);
  if (_along.lengthSq() < 1e-9) _along.set(0, 1, 0);
  _along.normalize();
  _toCam.set(camera.position.x, camera.position.y, camera.position.z)
    .sub(_p0.clone().add(_p1).multiplyScalar(0.5)).normalize();
  _perp.crossVectors(_along, _toCam);
  if (_perp.lengthSq() < 1e-6) _perp.set(1, 0, 0);
  else _perp.normalize();

  const uvRect = uvRectForTextureId(seg.textureId);
  const c0 = seg.c0 || { r: 1, g: 1, b: 1 };
  const c1 = seg.c1 || c0;
  const hw0 = seg.w0 * 0.5;
  const hw1 = seg.w1 * 0.5;

  // corners: 0=p0-perp, 1=p1-perp, 2=p1+perp, 3=p0+perp (matches QUAD_INDICES)
  const verts = [
    { x: seg.x0 - _perp.x * hw0, y: seg.y0 - _perp.y * hw0, z: seg.z0 - _perp.z * hw0, u: 0, v: 0, c: c0, a: seg.a0 },
    { x: seg.x1 - _perp.x * hw1, y: seg.y1 - _perp.y * hw1, z: seg.z1 - _perp.z * hw1, u: 0, v: 1, c: c1, a: seg.a1 },
    { x: seg.x1 + _perp.x * hw1, y: seg.y1 + _perp.y * hw1, z: seg.z1 + _perp.z * hw1, u: 1, v: 1, c: c1, a: seg.a1 },
    { x: seg.x0 + _perp.x * hw0, y: seg.y0 + _perp.y * hw0, z: seg.z0 + _perp.z * hw0, u: 1, v: 0, c: c0, a: seg.a0 },
  ];
  for (let i = 0; i < 4; i++) {
    const vi = baseVert + i;
    const q = verts[i];
    posArr[vi * 3] = q.x;
    posArr[vi * 3 + 1] = q.y;
    posArr[vi * 3 + 2] = q.z;
    uvArr[vi * 2] = uvRect.u0 + q.u * (uvRect.u1 - uvRect.u0);
    uvArr[vi * 2 + 1] = uvRect.v0 + q.v * (uvRect.v1 - uvRect.v0);
    colArr[vi * 4] = q.c.r;
    colArr[vi * 4 + 1] = q.c.g;
    colArr[vi * 4 + 2] = q.c.b;
    colArr[vi * 4 + 3] = q.a;
  }
}

export class VfxRenderer {
  /**
   * @param {THREE.Scene} scene
   * @param {import('./materials.js').TextureBank} bank
   */
  constructor(scene, bank) {
    this.scene = scene;
    this.bank = bank;
    this.atlas = loadParticleAtlas(bank);
    this.sim = null;
    this.speed = 1;
    this.playing = true;
    this.geoGroup = null;

    this.brightMesh = makeParticleMesh(true);
    this.softMesh = makeParticleMesh(false);
    this.brightMesh.material.uniforms.uMap.value = this.atlas.texture;
    this.softMesh.material.uniforms.uMap.value = this.atlas.texture;
    this.scene.add(this.brightMesh);
    this.scene.add(this.softMesh);

    this._idxTemplate = new Uint16Array(MAX_IDX);
    for (let q = 0; q < MAX_QUADS; q++) {
      const vo = q * 4;
      const io = q * 6;
      for (let k = 0; k < 6; k++) this._idxTemplate[io + k] = vo + QUAD_INDICES[k];
    }
  }

  /**
   * @param {object} parsedNfx result of parseNfx()
   * @param {string|null} eventName
   */
  loadEffect(parsedNfx, eventName = null) {
    this.disposeGeo();
    let block = null;
    if (eventName) {
      block = parsedNfx.specialFx.find((fx) => fx.events.includes(eventName));
    }
    if (!block) block = pickPreviewEvent(parsedNfx.specialFx)?.block ?? null;
    this.sim = block ? createVfxSimulation(block) : null;
    this.playing = true;
    this._clearMeshes();
  }

  async loadGeoCompanion(geoPath, rootPrefix) {
    this.disposeGeo();
    if (!geoPath) return;
    try {
      const res = await fetch(rootPrefix + geoPath);
      if (!res.ok) return;
      const buf = await res.arrayBuffer();
      const parsed = parseGeo(buf);
      const sections = pickLod0Sections(parsed.sections);
      const { group } = buildGeoGroup({ sections }, this.bank, { texturesEnabled: true });
      group.traverse((o) => {
        if (o.isMesh) {
          o.material = o.material.clone();
          o.material.transparent = true;
          o.material.opacity = 0.25;
          o.material.depthWrite = false;
        }
      });
      this.geoGroup = group;
      this.scene.add(group);
    } catch {
      /* optional companion mesh */
    }
  }

  disposeGeo() {
    if (this.geoGroup) {
      this.scene.remove(this.geoGroup);
      this.geoGroup.traverse((o) => {
        if (o.isMesh) {
          o.geometry.dispose();
          o.material.dispose();
        }
      });
      this.geoGroup = null;
    }
  }

  play() { this.playing = true; }
  pause() { this.playing = false; }
  restart() {
    if (this.sim) resetSimulation(this.sim);
    this.playing = true;
  }
  setSpeed(v) { this.speed = Math.max(0.05, v); }

  tick(dt, camera) {
    if (!this.sim || !this.playing) return;
    tickSimulation(this.sim, dt * this.speed);
    if (camera) this._updateMeshes(camera);
  }

  _clearMeshes() {
    for (const mesh of [this.brightMesh, this.softMesh]) {
      mesh.geometry.setDrawRange(0, 0);
      mesh.visible = false;
    }
  }

  _fillMesh(mesh, items, camera) {
    const n = Math.min(items.length, MAX_QUADS);
    if (n === 0) {
      mesh.visible = false;
      mesh.geometry.setDrawRange(0, 0);
      return;
    }

    const pos = mesh.geometry.attributes.position.array;
    const uv = mesh.geometry.attributes.uv.array;
    const col = mesh.geometry.attributes.aColor.array;
    const idx = mesh.geometry.index.array;

    for (let q = 0; q < n; q++) {
      const item = items[q];
      if (item.seg) writeSegment(item.seg, camera, pos, uv, col, q * 4);
      else writeQuad(item.p, camera, pos, uv, col, q * 4);
    }
    idx.set(this._idxTemplate.subarray(0, n * 6));

    mesh.geometry.attributes.position.needsUpdate = true;
    mesh.geometry.attributes.uv.needsUpdate = true;
    mesh.geometry.attributes.aColor.needsUpdate = true;
    mesh.geometry.index.needsUpdate = true;
    mesh.geometry.setDrawRange(0, n * 6);
    mesh.visible = true;
  }

  _updateMeshes(camera) {
    const bright = [];
    const soft = [];
    for (const p of getLiveParticles(this.sim)) {
      (p.bright ? bright : soft).push({ p });
    }
    for (const seg of getLiveStrips(this.sim)) {
      (seg.bright ? bright : soft).push({ seg });
    }
    this._fillMesh(this.brightMesh, bright, camera);
    this._fillMesh(this.softMesh, soft, camera);
  }

  fitCamera(camera, controls) {
    const box = new THREE.Box3();
    if (this.geoGroup) box.expandByObject(this.geoGroup);
    const live = this.sim ? getLiveParticles(this.sim) : [];
    for (const p of live) {
      box.expandByPoint(new THREE.Vector3(p.x, p.y, p.z));
    }
    const strips = this.sim ? getLiveStrips(this.sim) : [];
    for (const s of strips) {
      box.expandByPoint(new THREE.Vector3(s.x0, s.y0, s.z0));
      box.expandByPoint(new THREE.Vector3(s.x1, s.y1, s.z1));
    }
    if (box.isEmpty()) {
      box.setFromCenterAndSize(new THREE.Vector3(0, 2, 0), new THREE.Vector3(4, 4, 4));
    }
    const center = box.getCenter(new THREE.Vector3());
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const r = Math.max(sphere.radius, 1);
    const dir = new THREE.Vector3(0.75, 0.45, 1).normalize();
    camera.position.copy(center).addScaledVector(dir, r * 2.8);
    camera.near = Math.max(r / 500, 0.01);
    camera.far = Math.max(r * 50, 100);
    camera.updateProjectionMatrix();
    controls.target.copy(center);
  }

  dispose() {
    this.disposeGeo();
    this.scene.remove(this.brightMesh);
    this.scene.remove(this.softMesh);
    this.brightMesh.geometry.dispose();
    this.softMesh.geometry.dispose();
    this.brightMesh.material.dispose();
    this.softMesh.material.dispose();
    this.sim = null;
  }
}
