/**
 * terrain-render.js — shared terrain heightfield + tile-blend shader (level.js + play).
 */

import * as THREE from 'three';

const HEIGHT_SCALE = 4.0;

const TERRAIN_VERT = /* glsl */`
varying vec3 vWorldPos;
varying vec3 vNormal;
void main() {
  vWorldPos = position;
  vNormal = normal;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const TERRAIN_FRAG = /* glsl */`
uniform sampler2D uAtlas;
uniform sampler2D uTiles;
uniform sampler2D uTint;
uniform vec2 uMapSize;
uniform float uGrid;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uHemiTop;
uniform vec3 uHemiBottom;
varying vec3 vWorldPos;
varying vec3 vNormal;

const float CELL = 0.125;
const float INSET = 0.0078125;
const float EXTENT = 0.109375;
const int MASK_COL[16] = int[16](4, 0, 0, 1, 0, 1, 3, 2, 0, 3, 1, 2, 1, 2, 2, 4);
const int MASK_ROT[16] = int[16](0, 0, 3, 3, 1, 0, 1, 0, 2, 0, 2, 3, 1, 1, 2, 0);

float tileAt(vec2 c) {
  c = clamp(c, vec2(0.0), uMapSize - 1.0);
  return floor(texture2D(uTiles, (c + 0.5) / uMapSize).r * 255.0 + 0.5);
}

vec2 rot90(vec2 f, int r) {
  if (r == 1) return vec2(f.y, 1.0 - f.x);
  if (r == 2) return vec2(1.0 - f.x, 1.0 - f.y);
  if (r == 3) return vec2(1.0 - f.y, f.x);
  return f;
}

vec4 layerSample(float row, int col, int rot, vec2 f, float uOff, vec2 dGdx, vec2 dGdy) {
  vec2 p = rot90(f, rot) * EXTENT + INSET;
  vec2 uv = vec2(float(col), row) * CELL + p + vec2(uOff, 0.0);
  return texture2DGradEXT(uAtlas, uv, dGdx * EXTENT, dGdy * EXTENT);
}

float solidVariantU(vec2 cell) {
  return floor(fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453) * 4.0) * CELL;
}

void main() {
  vec2 g = vWorldPos.xz / uGrid - 1.0;
  vec2 base = floor(g);
  vec2 f = g - base;
  vec2 dGdx = dFdx(g);
  vec2 dGdy = dFdy(g);
  float tA = tileAt(base);
  float tB = tileAt(base + vec2(1.0, 0.0));
  float tC = tileAt(base + vec2(0.0, 1.0));
  float tD = tileAt(base + vec2(1.0, 1.0));
  float lo = min(min(tA, tB), min(tC, tD));

  bool uniformCell = (tA == tB && tA == tC && tA == tD);
  float uOff = uniformCell ? solidVariantU(base) : 0.0;
  vec3 blend = layerSample(lo, 4, 0, f, uOff, dGdx, dGdy).rgb;

  for (int v = 0; v < 8; v++) {
    float fv = float(v);
    if (fv <= lo + 0.5) continue;
    int m = (tA == fv ? 1 : 0) | (tC == fv ? 2 : 0) | (tB == fv ? 4 : 0) | (tD == fv ? 8 : 0);
    if (m == 0) continue;
    vec4 s = layerSample(fv, MASK_COL[m], MASK_ROT[m], f, 0.0, dGdx, dGdy);
    blend = mix(blend, s.rgb, s.a);
  }

  vec3 tint = texture2D(uTint, (g + 0.5) / uMapSize).rgb;
  vec3 n = normalize(vNormal);
  vec3 hemi = mix(uHemiBottom, uHemiTop, 0.5 * (n.y + 1.0));
  vec3 diff = uSunColor * max(dot(n, -normalize(uSunDir)), 0.0);
  vec3 light = hemi + diff;
  gl_FragColor = vec4(2.0 * tint * light * blend, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const DEFAULT_ENV = {
  hemiTop: [150, 165, 190],
  hemiBottom: [60, 55, 60],
  sun: [235, 225, 200],
  dir: [-0.2, -0.6, 0.2],
  fogColor: [120, 120, 130],
};

/** @param {ArrayBuffer} buf */
export function parseTGA(buf) {
  const d = new Uint8Array(buf);
  const idLen = d[0];
  const imgType = d[2];
  const w = d[12] | (d[13] << 8);
  const h = d[14] | (d[15] << 8);
  const bpp = d[16];
  if (imgType !== 2 || bpp !== 32) return null;
  const off = 18 + idLen;
  const h16 = new Uint16Array(w * h);
  const tile = new Uint8Array(w * h);
  for (let i = 0, s = off; i < w * h; i++, s += 4) {
    h16[i] = (d[s + 3] << 8) | d[s];
    tile[i] = d[s + 1] & 7;
  }
  return { w, h, h16, tile };
}

/** @param {ArrayBuffer} buf */
export function parseTGARgba(buf) {
  const d = new Uint8Array(buf);
  if (d[2] !== 2 || d[16] !== 32) return null;
  const w = d[12] | (d[13] << 8);
  const h = d[14] | (d[15] << 8);
  const off = 18 + d[0];
  const rgba = new Uint8Array(w * h * 4);
  for (let i = 0, s = off; i < w * h; i++, s += 4) {
    rgba[i * 4] = d[s + 2];
    rgba[i * 4 + 1] = d[s + 1];
    rgba[i * 4 + 2] = d[s];
    rgba[i * 4 + 3] = 255;
  }
  return { w, h, rgba };
}

/** @param {string} levelName */
export function resolveEnvKey(levelName, envLighting) {
  if (!envLighting) return null;
  const segs = levelName.toLowerCase().split(/[^a-z]+/).filter((s) => s.length >= 4);
  const mapZone = segs.length ? segs[segs.length - 1] : levelName.toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const key of Object.keys(envLighting)) {
    const zone = (envLighting[key].zone || '').toLowerCase();
    if (zone.length < 4) continue;
    let score = 0;
    if (zone === mapZone) score = 1000 + zone.length;
    else if (mapZone.includes(zone) || zone.includes(mapZone)) score = Math.min(zone.length, mapZone.length);
    else continue;
    if (score > bestScore) {
      bestScore = score;
      best = key;
    }
  }
  if (!best) return null;
  const zone = envLighting[best].zone.toLowerCase();
  const zoneOnly = Object.keys(envLighting).find(
    (k) => envLighting[k].zone.toLowerCase() === zone && k.split('_').length === 4,
  );
  return zoneOnly || best;
}

function envRecord(key, tod, envLighting) {
  const rec = key && envLighting?.[key]?.tod;
  return (rec && (rec[tod] || rec.midday)) || DEFAULT_ENV;
}

const envColor = (rgb) => new THREE.Color(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255).convertSRGBToLinear();

function envUniforms(e) {
  return {
    uHemiTop: envColor(e.hemiTop || DEFAULT_ENV.hemiTop),
    uHemiBottom: envColor(e.hemiBottom || DEFAULT_ENV.hemiBottom),
    uSunColor: envColor(e.sun || DEFAULT_ENV.sun),
    uSunDir: new THREE.Vector3(...(e.dir || DEFAULT_ENV.dir)).normalize(),
  };
}

let flatTintTexture = null;
function makeFlatTintTexture() {
  if (!flatTintTexture) {
    flatTintTexture = new THREE.DataTexture(
      new Uint8Array([127, 127, 127, 255]),
      1,
      1,
      THREE.RGBAFormat,
      THREE.UnsignedByteType,
    );
    flatTintTexture.needsUpdate = true;
  }
  return flatTintTexture;
}

/**
 * @param {object} data level JSON
 * @param {object} tga parseTGA result
 * @param {import('./materials.js').TextureBank} bank
 * @param {Record<string, object>} tilesetTable
 * @param {Record<string, object>|null} envLighting
 * @param {string} mapName
 */
export function buildTerrainMaterial(data, tga, bank, tilesetTable, envLighting, mapName) {
  const t = data.Terrain;
  const entry = tilesetTable?.[String(t.TileSet ?? 0)] || tilesetTable?.['0'];
  const atlasName = (entry?.tile2 || '').toLowerCase();
  if (!atlasName || !bank.has(atlasName)) return null;
  const atlas = bank.load(atlasName, { srgb: true }).texture;
  atlas.wrapS = atlas.wrapT = THREE.ClampToEdgeWrapping;
  const envKey = resolveEnvKey(mapName, envLighting);
  const el = envUniforms(envRecord(envKey, 'midday', envLighting));

  const tileTex = new THREE.DataTexture(tga.tile, tga.w, tga.h, THREE.RedFormat, THREE.UnsignedByteType);
  tileTex.minFilter = tileTex.magFilter = THREE.NearestFilter;
  tileTex.unpackAlignment = 1;
  tileTex.needsUpdate = true;

  return new THREE.ShaderMaterial({
    vertexShader: TERRAIN_VERT,
    fragmentShader: TERRAIN_FRAG,
    side: THREE.DoubleSide,
    extensions: { derivatives: true, shaderTextureLOD: true },
    uniforms: {
      uAtlas: { value: atlas },
      uTiles: { value: tileTex },
      uTint: { value: makeFlatTintTexture() },
      uMapSize: { value: new THREE.Vector2(tga.w, tga.h) },
      uGrid: { value: t.GridSize || 1 },
      uSunDir: { value: el.uSunDir },
      uSunColor: { value: el.uSunColor },
      uHemiTop: { value: el.uHemiTop },
      uHemiBottom: { value: el.uHemiBottom },
    },
  });
}

/**
 * @param {string} assetRoot e.g. '/game-data/assets/'
 * @param {object} terrain Terrain block from level JSON
 */
export async function loadTintTexture(assetRoot, terrain) {
  try {
    const path = terrain.Tga.replace(/^assets\/extracted\//, '').replace(/\.tga$/i, '_tint.tga');
    const res = await fetch(`${assetRoot}${path}`);
    if (!res.ok) return null;
    const parsed = parseTGARgba(await res.arrayBuffer());
    if (!parsed || parsed.w !== terrain.Width || parsed.h !== terrain.Height) return null;
    const tex = new THREE.DataTexture(parsed.rgba, parsed.w, parsed.h, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return tex;
  } catch {
    return null;
  }
}

/**
 * Build terrain mesh group + height sampler.
 *
 * @param {object} opts
 * @param {object} opts.level level JSON
 * @param {import('./materials.js').TextureBank} opts.textureBank
 * @param {Record<string, object>} opts.tilesetTable
 * @param {Record<string, object>|null} [opts.envLighting]
 * @param {string} opts.assetRoot
 * @param {number} [opts.maxSeg]
 * @param {number} [opts.heightScale]
 */
export async function buildTerrainMesh(opts) {
  const {
    level,
    textureBank,
    tilesetTable,
    envLighting = null,
    assetRoot,
    maxSeg = 400,
    heightScale = HEIGHT_SCALE,
  } = opts;

  const t = level.Terrain;
  const grid = t.GridSize || 1;
  const group = new THREE.Group();
  let terrainHeightFn = null;

  const tgaPath = t.Tga.replace(/^assets\/extracted\//, '');
  let tga = null;
  try {
    const buf = await fetch(`${assetRoot}${tgaPath}`).then((r) => r.arrayBuffer());
    tga = parseTGA(buf);
  } catch {
    tga = null;
  }

  if (tga && tga.w === t.Width && tga.h === t.Height) {
    const step = Math.max(1, Math.ceil(Math.max(t.Width, t.Height) / maxSeg));
    const nx = Math.floor(t.Width / step);
    const nz = Math.floor(t.Height / step);
    const hs = (t.HeightScale || heightScale) / 256;
    const positions = new Float32Array(nx * nz * 3);
    for (let r = 0; r < nz; r++) {
      for (let c = 0; c < nx; c++) {
        const y = tga.h16[(r * step) * t.Width + (c * step)] * hs;
        const i = (r * nx + c) * 3;
        positions[i] = c * step * grid;
        positions[i + 1] = y;
        positions[i + 2] = r * step * grid;
      }
    }
    const indices = [];
    for (let r = 0; r < nz - 1; r++) {
      for (let c = 0; c < nx - 1; c++) {
        const a = r * nx + c;
        const b = a + 1;
        const d2 = a + nx;
        const e2 = d2 + 1;
        indices.push(a, d2, b, b, d2, e2);
      }
    }
    const cell = step * grid;
    terrainHeightFn = (x, z) => {
      const fx = Math.min(Math.max(x / cell, 0), nx - 1.001);
      const fz = Math.min(Math.max(z / cell, 0), nz - 1.001);
      const c0 = Math.floor(fx);
      const r0 = Math.floor(fz);
      const tx = fx - c0;
      const tz = fz - r0;
      const hAt = (qr, qc) => positions[(qr * nx + qc) * 3 + 1];
      return (hAt(r0, c0) * (1 - tx) + hAt(r0, c0 + 1) * tx) * (1 - tz)
        + (hAt(r0 + 1, c0) * (1 - tx) + hAt(r0 + 1, c0 + 1) * tx) * tz;
    };

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mat = buildTerrainMaterial(level, tga, textureBank, tilesetTable, envLighting, level.Name)
      ?? new THREE.MeshStandardMaterial({ color: 0x5a6150, roughness: 1, metalness: 0, side: THREE.DoubleSide });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    group.add(mesh);

    const tintTex = await loadTintTexture(assetRoot, t);
    if (tintTex && mat.uniforms?.uTint) mat.uniforms.uTint.value = tintTex;

    return { group, terrainHeightFn, material: mat };
  }

  const geo = new THREE.PlaneGeometry(t.Width * grid, t.Height * grid);
  geo.rotateX(-Math.PI / 2);
  geo.translate((t.Width * grid) / 2, 0, (t.Height * grid) / 2);
  group.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x3a4150, roughness: 1 })));
  terrainHeightFn = () => 0;
  return { group, terrainHeightFn, material: null };
}
