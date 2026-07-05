/**
 * level.js — Auto Assault whole-map viewer.
 *
 * Loads a level dumped by tools/AutoCore.MapDump (levels/<map>.json), reconstructs:
 *   - terrain: 16-bit heightfield from the map's .tga (world Y = ((A<<8)|B) * HeightScale/256),
 *     textured with the game's per-cell tile blending (G&7 = tile layer, tileset atlas),
 *   - objects: every placement, instanced per resolved .geo model (unresolved -> boxes),
 *   - markers: spawn/enter/store/outpost points,
 *   - paths: map-path polylines.
 * World axes: X/Z horizontal (col*grid, row*grid), Y up. See docs/terrain-format-findings.md
 * and docs/level-renderer.md (terrain texturing RE'd from CVOGTerrainChunker +
 * NDDiffTerrainLayered2.fx).
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { parseGeo } from './geo-parser.js';
import { TextureBank, buildMaterial } from './materials.js';

const ROOT = '../../';
const HEIGHT_SCALE = 4.0;       // per-256 units of the 16-bit height (world Y = h16 * HEIGHT_SCALE/256)
const TERRAIN_MAX_SEG = 400;    // cap terrain grid resolution per axis
const MAX_UNIQUE_MODELS = 400;  // beyond this, remaining models render as boxes
const MODEL_FETCH_CONCURRENCY = 12;

const el = (id) => document.getElementById(id);
const listEl = el('level-list');
const searchEl = el('search');
const countEl = el('count');
const infoEl = el('info');
const statusEl = el('status');
const tooltipEl = el('tooltip');

// --- tooltip / highlight state -----------------------------------------------
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const highlightMesh = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshBasicMaterial({ color: 0xffff00, wireframe: true, transparent: true, opacity: 0.7 })
);
highlightMesh.visible = false;
highlightMesh.renderOrder = 999;
let pendingHover = false;
let mouseClientX = 0, mouseClientY = 0;

// --- scene scaffold ----------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
el('canvas-wrap').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0e1218);

const camera = new THREE.PerspectiveCamera(60, 1, 1, 200000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;

const sun = new THREE.DirectionalLight(0xfff4e2, 2.2);
sun.position.set(1, 1.6, 0.8);
scene.add(sun);
scene.add(new THREE.AmbientLight(0x516080, 1.0));
scene.add(new THREE.HemisphereLight(0x9db4ff, 0x2a2620, 0.5));

const worldGroup = new THREE.Group();
scene.add(worldGroup);
worldGroup.add(highlightMesh);

function resize() {
  const w = renderer.domElement.parentElement.clientWidth;
  const h = renderer.domElement.parentElement.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
renderer.domElement.addEventListener('mousemove', onMouseMove);
renderer.setAnimationLoop(() => {
  controls.update();
  processHover();
  renderer.render(scene, camera);
});

// --- state -------------------------------------------------------------------
let assetIndex = null;   // { models:[...], textures:{...} }
let modelByStem = null;  // lowercase geo stem -> repo-relative path
let bank = null;
let levelsIndex = [];
let tilesetTable = null; // tileset-table.json: TileSet byte -> { tile2, ... }
let current = null;      // { name, data, groups: {terrain, objects, markers, paths, boxes} }
const geoCache = new Map(); // path -> parsed geo (or null)

const layers = { terrain: null, objects: null, markers: null, paths: null, boxes: null };

// --- helpers -----------------------------------------------------------------
function setStatus(msg, err = false) { statusEl.textContent = msg; statusEl.classList.toggle('error', err); }

function resolveModelPath(obj) {
  const tryNames = [];
  for (const v of [obj.Unique, obj.Physics, obj.Short]) {
    if (!v) continue;
    const s = v.trim().toLowerCase();
    tryNames.push(s, `obj_${s}`);
  }
  for (const n of tryNames) {
    const p = modelByStem.get(n);
    if (p) return p;
  }
  return null;
}

function parseTGA(buf) {
  const d = new Uint8Array(buf);
  const idLen = d[0];
  const imgType = d[2];
  const w = d[12] | (d[13] << 8);
  const h = d[14] | (d[15] << 8);
  const bpp = d[16];
  const desc = d[17];
  if (imgType !== 2 || bpp !== 32) return null; // only uncompressed 32bpp BGRA
  const off = 18 + idLen;
  // Grid row index maps directly to world Z (row = Z/gridSize), i.e. RAW file order with
  // no vertical flip. Verified empirically: sampling raw [Z/grid][X/grid] puts every object
  // within ~1.3 units of the terrain; flipping (the nominal bottom-up TGA convention) is off
  // by ~38. The engine treats this .tga as top-down regardless of the descriptor byte.
  void desc;
  // Channel decode (CVOGTerrain::LoadMapImage @0x4aba80 in autoassault.exe):
  //   height  = 16-bit (A<<8)|B  — B is the LOW BYTE of the height, not noise
  //   tile    = G & 7            — per-cell terrain tile layer index (atlas row)
  const h16 = new Uint16Array(w * h);
  const tile = new Uint8Array(w * h);
  for (let i = 0, s = off; i < w * h; i++, s += 4) {
    h16[i] = (d[s + 3] << 8) | d[s]; // A<<8 | B
    tile[i] = d[s + 1] & 7;          // G & 7
  }
  return { w, h, h16, tile };
}

/** Parse a 32bpp BGRA TGA into an RGBA byte array (for the per-cell tint map). */
function parseTGARgba(buf) {
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

// --- tooltip HTML builder ----------------------------------------------------
const MARKER_LABELS = { spawn: 'Spawn Point', enter: 'Enter Point', store: 'Store', outpost: 'Outpost' };

function buildTooltipHTML(obj, kind) {
  if (kind === 'marker') {
    const lbl = MARKER_LABELS[obj.Kind] || obj.Kind;
    const pos = obj.Pos;
    return `<div class="tt-title">${lbl}<span class="tt-badge marker">${obj.Kind}</span></div>
      <div class="tt-row">position: <span>${pos[0].toFixed(1)}, ${pos[1].toFixed(1)}, ${pos[2].toFixed(1)}</span></div>`;
  }

  // Object / box
  const name = obj.Unique || obj.Physics || obj.Short || 'unnamed';
  let html = `<div class="tt-title">${name}`;
  if (!obj._resolved) html += `<span class="tt-badge warn">unresolved</span>`;
  html += `</div>`;
  html += `<div class="tt-row">CBID: <span>${obj.Cbid}</span> · COID: <span>${obj.Coid}</span></div>`;
  html += `<div class="tt-row">position: <span>${obj.Pos[0].toFixed(1)}, ${obj.Pos[1].toFixed(1)}, ${obj.Pos[2].toFixed(1)}</span></div>`;
  html += `<div class="tt-row">rotation: <span>${obj.Rot[0].toFixed(3)}, ${obj.Rot[1].toFixed(3)}, ${obj.Rot[2].toFixed(3)}, ${obj.Rot[3].toFixed(3)}</span></div>`;
  html += `<div class="tt-row">scale: <span>${(obj.Scale || 1).toFixed(2)}</span></div>`;
  if (obj._modelPath) html += `<div class="tt-row">model: <span>${obj._modelPath}</span></div>`;
  return html;
}

function showTooltip(html, x, y) {
  tooltipEl.innerHTML = html;
  tooltipEl.style.left = (x + 15) + 'px';
  tooltipEl.style.top = (y + 15) + 'px';
  tooltipEl.classList.add('visible');
}

function hideTooltip() {
  tooltipEl.classList.remove('visible');
}

// --- level list --------------------------------------------------------------
function renderList() {
  const q = searchEl.value.trim().toLowerCase();
  const shown = q ? levelsIndex.filter((l) => l.name.toLowerCase().includes(q)) : levelsIndex;
  countEl.textContent = `${shown.length} / ${levelsIndex.length} maps`;
  listEl.textContent = '';
  const frag = document.createDocumentFragment();
  for (const lv of shown) {
    const li = document.createElement('li');
    li.innerHTML = `${lv.name}<br><span class="meta">${lv.objects.toLocaleString()} obj · ${lv.markers} mk · ${lv.width}×${lv.height}</span>`;
    if (current && current.name === lv.name) li.classList.add('active');
    li.addEventListener('click', () => loadLevel(lv.name));
    frag.appendChild(li);
  }
  listEl.appendChild(frag);
}

// --- loading -----------------------------------------------------------------
async function loadLevel(name) {
  setStatus(`Loading ${name}…`);
  try {
    const data = await (await fetch(`./levels/${name}.json`)).json();
    clearWorld();
    current = { name, data };
    history.replaceState(null, '', `#${encodeURIComponent(name)}`);
    renderList();

    const bounds = await buildTerrain(data);
    fitCamera(bounds, data);
    setStatus(`Placing ${data.Objects.length.toLocaleString()} objects…`);
    // Yield so terrain shows before the (heavier) object build.
    await new Promise((r) => setTimeout(r, 0));
    await buildObjects(data);
    buildMarkers(data);
    buildPaths(data);
    applyVisibility();
    renderInfo();
    setStatus('');
  } catch (e) {
    console.error(e);
    setStatus(`Failed to load ${name}: ${e.message}`, true);
  }
}

function clearWorld() {
  worldGroup.clear();
  for (const k of Object.keys(layers)) layers[k] = null;
  worldGroup.add(highlightMesh);
  highlightMesh.visible = false;
  hideTooltip();
}

async function buildTerrain(data) {
  const t = data.Terrain;
  const grid = t.GridSize || 1;
  let bounds = { minX: 0, minZ: 0, maxX: t.Width * grid, maxZ: t.Height * grid, minY: 0, maxY: 100 };
  const group = new THREE.Group();
  layers.terrain = group;
  worldGroup.add(group);

  let tga = null;
  try {
    const buf = await (await fetch(ROOT + t.Tga)).arrayBuffer();
    tga = parseTGA(buf);
  } catch { /* fall through to flat */ }

  if (tga && tga.w === t.Width && tga.h === t.Height) {
    const step = Math.max(1, Math.ceil(Math.max(t.Width, t.Height) / TERRAIN_MAX_SEG));
    const nx = Math.floor(t.Width / step);
    const nz = Math.floor(t.Height / step);
    const heightScale = (t.HeightScale || HEIGHT_SCALE) / 256; // 16-bit height -> world Y
    const positions = new Float32Array(nx * nz * 3);
    let minY = Infinity, maxY = -Infinity;
    for (let r = 0; r < nz; r++) {
      for (let c = 0; c < nx; c++) {
        const y = tga.h16[(r * step) * t.Width + (c * step)] * heightScale;
        const i = (r * nx + c) * 3;
        positions[i] = c * step * grid;
        positions[i + 1] = y;
        positions[i + 2] = r * step * grid;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
    const indices = [];
    for (let r = 0; r < nz - 1; r++) {
      for (let c = 0; c < nx - 1; c++) {
        const a = r * nx + c, b = a + 1, d2 = a + nx, e2 = d2 + 1;
        indices.push(a, d2, b, b, d2, e2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mat = buildTerrainMaterial(data, tga) ??
      new THREE.MeshStandardMaterial({ color: 0x5a6150, roughness: 1, metalness: 0, side: THREE.DoubleSide });
    group.add(new THREE.Mesh(geo, mat));
    bounds.minY = minY; bounds.maxY = maxY;

    // Per-cell tint map (<map>_tint.tga) arrives async; flat mid-gray until then.
    loadTintTexture(t).then((tex) => {
      if (tex && mat.uniforms?.uTint) { mat.uniforms.uTint.value = tex; }
    });
  } else {
    // Flat reference plane if TGA missing/mismatched.
    const geo = new THREE.PlaneGeometry(bounds.maxX, bounds.maxZ);
    geo.rotateX(-Math.PI / 2);
    geo.translate(bounds.maxX / 2, 0, bounds.maxZ / 2);
    group.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x3a4150, roughness: 1 })));
  }
  // Grid overlay
  const gh = new THREE.GridHelper(Math.max(bounds.maxX, bounds.maxZ), 32, 0x2a3242, 0x1c2230);
  gh.position.set(bounds.maxX / 2, bounds.minY - 1, bounds.maxZ / 2);
  group.add(gh);
  return bounds;
}

async function buildObjects(data) {
  const group = new THREE.Group();
  layers.objects = group;
  worldGroup.add(group);
  const boxGroup = new THREE.Group();
  layers.boxes = boxGroup;
  worldGroup.add(boxGroup);

  // Group placements by resolved model path.
  const byModel = new Map();  // path -> [obj...]
  const unresolved = [];
  for (const o of data.Objects) {
    const p = resolveModelPath(o);
    if (p) { (byModel.get(p) ?? byModel.set(p, []).get(p)).push(o); }
    else unresolved.push(o);
  }
  // Sort models by instance count desc; cap how many unique models we actually load.
  const modelEntries = [...byModel.entries()].sort((a, b) => b[1].length - a[1].length);
  const loadEntries = modelEntries.slice(0, MAX_UNIQUE_MODELS);
  const boxedEntries = modelEntries.slice(MAX_UNIQUE_MODELS);
  for (const [, objs] of boxedEntries) unresolved.push(...objs);

  current.stats = {
    total: data.Objects.length,
    uniqueModels: modelEntries.length,
    loadedModels: loadEntries.length,
    boxed: unresolved.length,
  };

  // Boxes for unresolved / over-cap (single instanced mesh).
  if (unresolved.length) {
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const boxMat = new THREE.MeshStandardMaterial({ color: 0x8a5cff, roughness: 0.8, transparent: true, opacity: 0.55 });
    const inst = new THREE.InstancedMesh(boxGeo, boxMat, unresolved.length);
    inst.userData.objs = unresolved.map((o) => ({ ...o, _resolved: false }));
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    unresolved.forEach((o, i) => {
      const sc = Math.min(Math.max((o.Scale || 1) * 3, 2), 40);
      p.set(o.Pos[0], o.Pos[1] + sc / 2, o.Pos[2]);
      q.set(o.Rot[0], o.Rot[1], o.Rot[2], o.Rot[3]);
      s.set(sc, sc, sc);
      inst.setMatrixAt(i, m.compose(p, q, s));
    });
    inst.instanceMatrix.needsUpdate = true;
    boxGroup.add(inst);
  }

  // Load resolved models with bounded concurrency; build instanced meshes per section.
  let idx = 0;
  async function worker() {
    while (idx < loadEntries.length) {
      const my = idx++;
      const [path, objs] = loadEntries[my];
      setStatus(`Loading models ${my + 1}/${loadEntries.length}…`);
      const parsed = await loadGeo(path);
      if (!parsed) { // parse failed -> box them
        addBoxes(boxGroup, objs); continue;
      }
      const lod0 = pickLod0(parsed.sections);
      // Some models are authored at an arbitrary local scale; the body-level XOBB gives the
      // TRUE world size. Correct = bodyExtent / visualExtent (≈1 for the ~90% already correct,
      // the shrink factor for the inflated ones e.g. husk cars ~37x too big).
      const correction = modelCorrection(parsed, lod0);
      for (const section of lod0) {
        if (!section.indices.length) continue;
        const geo = sectionGeometry(section);
        const { material } = buildMaterial(section, bank, {});
        const inst = new THREE.InstancedMesh(geo, material, objs.length);
        inst.userData.objs = objs.map((o) => ({ ...o, _resolved: true, _modelPath: path }));
        const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3();
        objs.forEach((o, i) => {
          pv.set(o.Pos[0], o.Pos[1], o.Pos[2]);
          q.set(o.Rot[0], o.Rot[1], o.Rot[2], o.Rot[3]);
          const sc = (o.Scale || 1) * correction;
          sv.set(sc, sc, sc);
          inst.setMatrixAt(i, m.compose(pv, q, sv));
        });
        inst.instanceMatrix.needsUpdate = true;
        inst.frustumCulled = false;
        group.add(inst);
      }
    }
  }
  await Promise.all(Array.from({ length: MODEL_FETCH_CONCURRENCY }, worker));
}

function addBoxes(boxGroup, objs) {
  const inst = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xff5c5c, roughness: 0.8, transparent: true, opacity: 0.5 }),
    objs.length);
  inst.userData.objs = objs.map((o) => ({ ...o, _resolved: false }));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  objs.forEach((o, i) => {
    const sc = Math.min(Math.max((o.Scale || 1) * 3, 2), 40);
    p.set(o.Pos[0], o.Pos[1] + sc / 2, o.Pos[2]);
    q.set(o.Rot[0], o.Rot[1], o.Rot[2], o.Rot[3]);
    s.set(sc, sc, sc);
    inst.setMatrixAt(i, m.compose(p, q, s));
  });
  inst.instanceMatrix.needsUpdate = true;
  boxGroup.add(inst);
}

function modelCorrection(parsed, lod0) {
  const bb = parsed.bodyBBox;
  if (!bb) return 1;
  const bodyExt = Math.max(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]);
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const s of lod0) {
    const p = s.positions;
    for (let i = 0; i < p.length; i += 3)
      for (let k = 0; k < 3; k++) { if (p[i + k] < mn[k]) mn[k] = p[i + k]; if (p[i + k] > mx[k]) mx[k] = p[i + k]; }
  }
  const visExt = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]);
  if (!(visExt > 0) || !(bodyExt > 0)) return 1;
  return bodyExt / visExt;
}

function pickLod0(sections) {
  const minLod = Math.min(...sections.map((s) => s.lod));
  return sections.filter((s) => s.lod === minLod && !/shadowprojection/i.test(s.effect || ''));
}

function sectionGeometry(section) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(section.positions, 3));
  if (section.normals) g.setAttribute('normal', new THREE.BufferAttribute(section.normals, 3));
  if (section.uvs) g.setAttribute('uv', new THREE.BufferAttribute(section.uvs, 2));
  g.setIndex(new THREE.BufferAttribute(section.indices, 1));
  if (!section.normals) g.computeVertexNormals();
  return g;
}

async function loadGeo(path) {
  if (geoCache.has(path)) return geoCache.get(path);
  let parsed = null;
  try {
    const buf = await (await fetch(ROOT + path)).arrayBuffer();
    parsed = parseGeo(buf);
    if (!parsed.sections.length) parsed = null;
  } catch { parsed = null; }
  geoCache.set(path, parsed);
  return parsed;
}

const MARKER_COLORS = { spawn: 0x40ff80, enter: 0x40b0ff, store: 0xffd040, outpost: 0xff7040 };

// --- terrain texturing ---------------------------------------------------------
// Game-accurate per-cell tile blending, RE'd from autoassault.exe
// (CVOGTerrainChunk::BuildVertexBuffer @0x5c01e0, CVOGTerrain::BuildTileUVTable
// @0x5bedd0) + the shipped NDDiffTerrainLayered2.fx shader. See docs/level-renderer.md.
//
// The tileset's tile2_*.dds is an 8x8 atlas of 256^2 cells: row = tile layer index
// (the map TGA's G&7), column = transition pattern (0 corner / 1 edge / 2 three-corner
// / 3 diagonal, 4..7 solid variants). For each terrain cell the distinct corner layers
// are painted lowest-first: solid base, then each higher layer lerped by the atlas
// alpha (the authored transition mask).
//
// Corner mask bits (A=cell-min corner, B=+x, C=+z, D=+xz): A=1, C=2, B=4, D=8.
// LUTs (in the fragment shader) from 0xaf3fc8 / 0xaf4008; rotation r means sampling
// the art at Ra^r(f), Ra(x,y) = (y, 1-x) (verified against the LUT + atlas alpha art).

const TERRAIN_VERT = /* glsl */`
varying vec3 vWorldPos;
varying vec3 vNormal;
void main() {
  vWorldPos = position;   // terrain geometry is authored in world space
  vNormal = normal;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const TERRAIN_FRAG = /* glsl */`
uniform sampler2D uAtlas;   // 8x8 tileset atlas (tile2_*.dds)
uniform sampler2D uTiles;   // R8 per-cell tile layer index (0-7)
uniform sampler2D uTint;    // per-cell vertex tint (<map>_tint.tga), mid-gray default
uniform vec2 uMapSize;      // map size in grid cells
uniform float uGrid;        // world units per grid cell
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uAmbient;
varying vec3 vWorldPos;
varying vec3 vNormal;

const float CELL = 0.125;        // atlas cell size in UV
const float INSET = 0.0078125;   // 2-texel inset (from CVOGTerrain::BuildTileUVTable)
const float EXTENT = 0.109375;   // usable cell extent
const int MASK_COL[16] = int[16](4, 0, 0, 1, 0, 1, 3, 2, 0, 3, 1, 2, 1, 2, 2, 4);
const int MASK_ROT[16] = int[16](0, 0, 3, 3, 1, 0, 1, 0, 2, 0, 2, 3, 1, 1, 2, 0);

float tileAt(vec2 c) {
  c = clamp(c, vec2(0.0), uMapSize - 1.0);
  return floor(texture2D(uTiles, (c + 0.5) / uMapSize).r * 255.0 + 0.5);
}

vec2 rot90(vec2 f, int r) {   // Ra(x,y) = (y, 1-x), applied r times
  if (r == 1) return vec2(f.y, 1.0 - f.x);
  if (r == 2) return vec2(1.0 - f.x, 1.0 - f.y);
  if (r == 3) return vec2(1.0 - f.y, f.x);
  return f;
}

vec4 layerSample(float row, int col, int rot, vec2 f) {
  vec2 p = rot90(f, rot) * EXTENT + INSET;
  return texture2D(uAtlas, vec2(float(col), row) * CELL + p);
}

float cellHash(vec2 c) {   // stand-in for the game's RNG stream (solid-variant pick)
  return floor(fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453) * 4.0);
}

void main() {
  // Tile grid is offset (-1,-1) from the height-vertex grid
  // (CVOGTerrainChunk::GetCornerData fetches tile at (x-1, y-1)).
  vec2 g = vWorldPos.xz / uGrid - 1.0;
  vec2 base = floor(g);
  vec2 f = g - base;
  float tA = tileAt(base);                    // corner at local (0,0)
  float tB = tileAt(base + vec2(1.0, 0.0));   // +x
  float tC = tileAt(base + vec2(0.0, 1.0));   // +z
  float tD = tileAt(base + vec2(1.0, 1.0));   // +xz
  float lo = min(min(tA, tB), min(tC, tD));

  bool uniformCell = (tA == tB && tA == tC && tA == tD);
  int baseCol = 4 + (uniformCell ? int(cellHash(base)) : 0);
  vec3 blend = layerSample(lo, baseCol, 0, f).rgb;

  for (int v = 0; v < 8; v++) {
    float fv = float(v);
    if (fv <= lo + 0.5) continue;   // base layer (and below) already painted
    int m = (tA == fv ? 1 : 0) | (tC == fv ? 2 : 0) | (tB == fv ? 4 : 0) | (tD == fv ? 8 : 0);
    if (m == 0) continue;
    vec4 s = layerSample(fv, MASK_COL[m], MASK_ROT[m], f);
    blend = mix(blend, s.rgb, s.a);
  }

  vec3 tint = texture2D(uTint, (g + 0.5) / uMapSize).rgb;
  vec3 n = normalize(vNormal);
  vec3 light = uAmbient + uSunColor * max(dot(n, normalize(uSunDir)), 0.0);
  gl_FragColor = vec4(2.0 * tint * light * blend, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Build the game-accurate terrain material, or null if the tileset atlas is unavailable. */
function buildTerrainMaterial(data, tga) {
  const t = data.Terrain;
  const entry = tilesetTable?.[String(t.TileSet ?? 0)] || tilesetTable?.['0'];
  const atlasName = (entry?.tile2 || '').toLowerCase();
  if (!atlasName || !bank.has(atlasName)) return null;
  const atlas = bank.load(atlasName, { srgb: true }).texture;

  const tileTex = new THREE.DataTexture(tga.tile, tga.w, tga.h, THREE.RedFormat, THREE.UnsignedByteType);
  tileTex.minFilter = tileTex.magFilter = THREE.NearestFilter;
  tileTex.unpackAlignment = 1;
  tileTex.needsUpdate = true;

  const mat = new THREE.ShaderMaterial({
    vertexShader: TERRAIN_VERT,
    fragmentShader: TERRAIN_FRAG,
    side: THREE.DoubleSide,
    uniforms: {
      uAtlas: { value: atlas },
      uTiles: { value: tileTex },
      uTint: { value: makeFlatTintTexture() },
      uMapSize: { value: new THREE.Vector2(tga.w, tga.h) },
      uGrid: { value: t.GridSize || 1 },
      // Match the scene lights (sun + ambient/hemi), pre-halved for the game's x2.
      uSunDir: { value: sun.position.clone().normalize() },
      uSunColor: { value: sun.color.clone().multiplyScalar(sun.intensity * 0.5) },
      uAmbient: { value: new THREE.Color(0x516080).multiplyScalar(0.7) },
    },
  });
  return mat;
}

let flatTintTexture = null;
function makeFlatTintTexture() {
  if (!flatTintTexture) {
    flatTintTexture = new THREE.DataTexture(
      new Uint8Array([127, 127, 127, 255]), 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
    flatTintTexture.needsUpdate = true;
  }
  return flatTintTexture;
}

async function loadTintTexture(t) {
  try {
    const path = t.Tga.replace(/\.tga$/i, '_tint.tga');
    const res = await fetch(ROOT + path);
    if (!res.ok) return null;
    const parsed = parseTGARgba(await res.arrayBuffer());
    if (!parsed || parsed.w !== t.Width || parsed.h !== t.Height) return null;
    const tex = new THREE.DataTexture(parsed.rgba, parsed.w, parsed.h, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return tex;
  } catch {
    return null;
  }
}

function buildMarkers(data) {
  const group = new THREE.Group();
  layers.markers = group;
  worldGroup.add(group);
  const byKind = new Map();
  for (const mk of data.Markers) (byKind.get(mk.Kind) ?? byKind.set(mk.Kind, []).get(mk.Kind)).push(mk);
  for (const [kind, list] of byKind) {
    const geo = new THREE.SphereGeometry(1, 8, 6);
    const mat = new THREE.MeshBasicMaterial({ color: MARKER_COLORS[kind] ?? 0xffffff });
    const inst = new THREE.InstancedMesh(geo, mat, list.length);
    inst.userData.objs = list.map((mk) => ({ ...mk, Kind: kind }));
    const m = new THREE.Matrix4(), s = new THREE.Vector3(12, 12, 12), q = new THREE.Quaternion(), p = new THREE.Vector3();
    list.forEach((mk, i) => { p.set(mk.Pos[0], mk.Pos[1] + 12, mk.Pos[2]); inst.setMatrixAt(i, m.compose(p, q, s)); });
    inst.instanceMatrix.needsUpdate = true;
    group.add(inst);
  }
}

function buildPaths(data) {
  const group = new THREE.Group();
  layers.paths = group;
  worldGroup.add(group);
  const pts = [];
  for (const path of data.Paths) {
    for (let i = 0; i + 1 < path.Points.length; i++) {
      const a = path.Points[i], b = path.Points[i + 1];
      pts.push(a[0], a[1] + 4, a[2], b[0], b[1] + 4, b[2]);
    }
  }
  if (pts.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
    group.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xff40c0 })));
  }
}

function fitCamera(b, data) {
  const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2, cy = (b.minY + b.maxY) / 2;
  const span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ, 1);
  controls.target.set(cx, cy, cz);
  camera.position.set(cx + span * 0.5, cy + span * 0.6, cz + span * 0.7);
  camera.near = Math.max(span / 5000, 0.5);
  camera.far = span * 12;
  camera.updateProjectionMatrix();
}

function applyVisibility() {
  if (layers.terrain) layers.terrain.visible = el('show-terrain').checked;
  if (layers.objects) layers.objects.visible = el('show-objects').checked;
  if (layers.markers) layers.markers.visible = el('show-markers').checked;
  if (layers.paths) layers.paths.visible = el('show-paths').checked;
  if (layers.boxes) layers.boxes.visible = el('show-boxes').checked && el('show-objects').checked;
}

function renderInfo() {
  if (!current) { infoEl.textContent = ''; return; }
  const d = current.data, s = current.stats || {};
  const t = d.Terrain;
  const line = (k, v) => `<div><span class="k">${k}</span> ${v}</div>`;
  let html = '';
  html += line('map', current.name);
  html += line('terrain', `${t.Width}×${t.Height} @ grid ${t.GridSize} (world ${(t.Width * t.GridSize).toLocaleString()}×${(t.Height * t.GridSize).toLocaleString()})`);
  html += line('objects', `${(s.total ?? 0).toLocaleString()} placed · ${s.loadedModels ?? 0}/${s.uniqueModels ?? 0} models loaded`);
  if (s.boxed) html += `<div class="warn"><span class="k">boxed</span> ${s.boxed.toLocaleString()} unresolved/over-cap (shown as boxes)</div>`;
  html += line('markers', d.Markers.length + ' · paths ' + d.Paths.length);
  infoEl.innerHTML = html;
}

// --- hover / tooltip ---------------------------------------------------------
function onMouseMove(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  mouseClientX = e.clientX - rect.left;
  mouseClientY = e.clientY - rect.top;
  pendingHover = true;
}

function processHover() {
  if (!pendingHover) return;
  pendingHover = false;

  raycaster.setFromCamera(mouse, camera);

  const targets = [];
  for (const layerKey of ['objects', 'markers', 'boxes']) {
    const layer = layers[layerKey];
    if (!layer || !layer.visible) continue;
    for (const child of layer.children) {
      if (child.isInstancedMesh && child.userData.objs) targets.push(child);
    }
  }

  const hits = raycaster.intersectObjects(targets);

  if (hits.length > 0) {
    const hit = hits[0];
    const mesh = hit.object;
    const idx = hit.instanceId;
    const objs = mesh.userData.objs;
    if (objs && idx < objs.length) {
      const mat4 = new THREE.Matrix4();
      mesh.getMatrixAt(idx, mat4);
      const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scale = new THREE.Vector3();
      mat4.decompose(pos, quat, scale);
      highlightMesh.position.copy(pos);
      highlightMesh.quaternion.copy(quat);
      const maxDim = Math.max(scale.x, scale.y, scale.z) * 0.6;
      highlightMesh.scale.set(maxDim, maxDim, maxDim);
      highlightMesh.visible = true;

      const obj = objs[idx];
      const kind = obj.Kind !== undefined ? 'marker' : 'object';
      showTooltip(buildTooltipHTML(obj, kind), mouseClientX, mouseClientY);
      return;
    }
  }

  highlightMesh.visible = false;
  hideTooltip();
}

// --- events ------------------------------------------------------------------
searchEl.addEventListener('input', renderList);
for (const id of ['show-terrain', 'show-objects', 'show-markers', 'show-paths', 'show-boxes'])
  el(id).addEventListener('change', applyVisibility);

// --- boot --------------------------------------------------------------------
async function boot() {
  resize();
  setStatus('Loading indexes…');
  try {
    assetIndex = await (await fetch('./index.json')).json();
    levelsIndex = await (await fetch('./levels/levels-index.json')).json();
  } catch (e) {
    setStatus(`Could not load index files: ${e.message} — run build_viewer_index.py and mapdump`, true);
    return;
  }
  try {
    tilesetTable = await (await fetch('./tileset-table.json')).json();
  } catch { tilesetTable = null; /* terrain falls back to untextured */ }
  modelByStem = new Map();
  for (const m of assetIndex.models) modelByStem.set(m.name.toLowerCase().replace(/\.geo$/, ''), m.path);
  bank = new TextureBank(assetIndex.textures, ROOT);
  setStatus('');
  renderList();

  const hash = decodeURIComponent(location.hash.slice(1));
  const start = levelsIndex.find((l) => l.name === hash) || levelsIndex.find((l) => /scrapvalley/i.test(l.name)) || levelsIndex[0];
  if (start) loadLevel(start.name);
}
boot();
