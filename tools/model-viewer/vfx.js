/**
 * vfx.js — Auto Assault VFX viewer controller.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { parseNfx, pickPreviewEvent, summarizePlayback } from './nfx-parser.js';
import { TextureBank } from './materials.js';
import { VfxRenderer } from './vfx-renderer.js';

const ROOT = '../../';
const LIST_LIMIT = 400;

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'sec_fx', label: 'sec_fx' },
  { id: 'weather', label: 'weather' },
  { id: 'fx', label: 'fx' },
  { id: 'fx_template', label: 'templates' },
  { id: 'weap', label: 'weapons' },
  { id: 'char', label: 'characters' },
  { id: 'env', label: 'env' },
  { id: 'generic', label: 'generic' },
  { id: 'include', label: 'includes' },
  { id: 'other', label: 'other' },
];

const el = (id) => document.getElementById(id);
const listEl = el('effect-list');
const searchEl = el('search');
const countEl = el('count');
const categoryBar = el('category-bar');
const detailTitle = el('detail-title');
const detailMeta = el('detail-meta');
const detailScroll = el('detail-scroll');
const statusEl = el('status');
const eventSelect = el('event-select');
const speedEl = el('speed');
const speedValueEl = el('speed-value');
const showGeoEl = el('show-geo');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
el('canvas-wrap').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0e1218);
scene.fog = new THREE.FogExp2(0x0e1218, 0.0015);

const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 4000);
camera.position.set(4, 3, 6);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;

scene.add(new THREE.AmbientLight(0x404860, 0.85));
const sun = new THREE.DirectionalLight(0xfff2e0, 1.8);
sun.position.set(6, 10, 4);
scene.add(sun);

const grid = new THREE.GridHelper(20, 20, 0x2a3242, 0x1c2230);
scene.add(grid);

let bank = null;
let vfxRenderer = null;
let index = null;
let filterResults = [];
let categoryFilter = 'all';
let current = null;
let lastClock = performance.now();
let rawXml = '';

function resize() {
  const w = renderer.domElement.parentElement.clientWidth;
  const h = renderer.domElement.parentElement.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle('error', isError);
}

function renderCategoryBar() {
  categoryBar.textContent = '';
  for (const cat of CATEGORIES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip' + (categoryFilter === cat.id ? ' active' : '');
    btn.textContent = cat.label;
    btn.addEventListener('click', () => {
      categoryFilter = cat.id;
      renderCategoryBar();
      applyFilter();
    });
    categoryBar.appendChild(btn);
  }
}

function applyFilter() {
  const q = searchEl.value.trim().toLowerCase();
  let effects = index.effects;
  if (categoryFilter !== 'all') {
    effects = effects.filter((e) => e.category === categoryFilter);
  }
  filterResults = q
    ? effects.filter((e) => e.name.toLowerCase().includes(q))
    : effects;
  countEl.textContent = `${filterResults.length.toLocaleString()} / ${index.effects.length.toLocaleString()} effects`;
  renderList();
}

function renderList() {
  listEl.textContent = '';
  const frag = document.createDocumentFragment();
  for (const entry of filterResults.slice(0, LIST_LIMIT)) {
    const li = document.createElement('li');
    li.textContent = entry.name;
    li.title = `${entry.path} (${(entry.size / 1024).toFixed(0)} KB)`;
    if (current?.entry === entry) li.classList.add('active');
    li.addEventListener('click', () => loadEffect(entry));
    frag.appendChild(li);
  }
  if (filterResults.length > LIST_LIMIT) {
    const li = document.createElement('li');
    li.className = 'more';
    li.textContent = `… ${(filterResults.length - LIST_LIMIT).toLocaleString()} more — refine the search`;
    frag.appendChild(li);
  }
  listEl.appendChild(frag);
}

function line(label, value) {
  return `<div class="row"><span class="k">${label}</span> ${value}</div>`;
}

function renderDetail(entry, parsed, playback) {
  detailTitle.textContent = entry.name;
  const s = entry.summary;
  detailMeta.textContent = `${entry.category} · ${entry.path}`;
  let html = '';
  html += line('events', entry.events.join(', ') || '—');
  html += line('particles', s.particles);
  html += line('trails', s.trails);
  html += line('lightning', s.lightning);
  html += line('geometry', s.geometry);
  html += line('sounds', s.sounds);
  if (entry.textureIds?.length) {
    html += line('textureIDs', entry.textureIds.slice(0, 24).join(', ') + (entry.textureIds.length > 24 ? '…' : ''));
  }
  if (entry.geoPath) html += line('geo', entry.geoPath);
  if (playback) {
    html += line('playback', `${playback.playable} playable, ${playback.deferred} deferred`);
    if (playback.deferred > 0) {
      html += `<div class="row warn">Deferred types: ${playback.types.filter((t) => !['Billboard', 'Kite', 'CenterBeam', 'Beam', 'Decal', 'Trail', 'Lightning', 'Geometry'].includes(t)).join(', ') || 'complex'}</div>`;
    }
  }
  html += `<details open><summary>Parsed JSON</summary><pre>${escapeHtml(JSON.stringify(parsed.specialFx, null, 2).slice(0, 12000))}${JSON.stringify(parsed.specialFx).length > 12000 ? '\n…' : ''}</pre></details>`;
  html += `<details><summary>Raw XML</summary><pre>${escapeHtml(rawXml.slice(0, 16000))}${rawXml.length > 16000 ? '\n…' : ''}</pre></details>`;
  detailScroll.innerHTML = html;
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function populateEventSelect(events) {
  eventSelect.textContent = '';
  eventSelect.disabled = !events.length;
  for (const ev of events) {
    const opt = document.createElement('option');
    opt.value = ev;
    opt.textContent = ev;
    eventSelect.appendChild(opt);
  }
}

async function loadEffect(entry) {
  setStatus(`Loading ${entry.name}…`);
  try {
    const res = await fetch(ROOT + entry.path);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    rawXml = await res.text();
    const parsed = parseNfx(rawXml);

    const allEvents = [...new Set(parsed.specialFx.flatMap((fx) => fx.events))];
    populateEventSelect(allEvents);
    const preview = pickPreviewEvent(parsed.specialFx);
    const defaultEv = preview?.event ?? allEvents[0] ?? null;
    if (defaultEv) eventSelect.value = defaultEv;

    if (vfxRenderer) vfxRenderer.dispose();
    vfxRenderer = new VfxRenderer(scene, bank);
    vfxRenderer.loadEffect(parsed, defaultEv);
    if (showGeoEl.checked && entry.geoPath) {
      await vfxRenderer.loadGeoCompanion(entry.geoPath, ROOT);
    }

    const block = parsed.specialFx.find((fx) => fx.events.includes(defaultEv)) || parsed.specialFx[0];
    const playback = block ? summarizePlayback(block) : null;

    current = { entry, parsed, defaultEv };
    renderDetail(entry, parsed, playback);
    vfxRenderer.fitCamera(camera, controls);
    grid.position.y = 0;
    history.replaceState(null, '', `#${encodeURIComponent(entry.name)}`);
    setStatus('');
    el('btn-play').textContent = 'Pause';
  } catch (e) {
    setStatus(`Failed to load ${entry.name}: ${e.message}`, true);
  }
  renderList();
}

async function onEventChange() {
  if (!current || !vfxRenderer) return;
  const ev = eventSelect.value;
  vfxRenderer.loadEffect(current.parsed, ev);
  vfxRenderer.restart();
  if (showGeoEl.checked && current.entry.geoPath) {
    await vfxRenderer.loadGeoCompanion(current.entry.geoPath, ROOT);
  }
  const block = current.parsed.specialFx.find((fx) => fx.events.includes(ev));
  renderDetail(current.entry, current.parsed, block ? summarizePlayback(block) : null);
}

searchEl.addEventListener('input', applyFilter);
eventSelect.addEventListener('change', onEventChange);
speedEl.addEventListener('input', () => {
  const v = parseFloat(speedEl.value);
  speedValueEl.textContent = `${v.toFixed(1)}×`;
  if (vfxRenderer) vfxRenderer.setSpeed(v);
});
el('btn-play').addEventListener('click', () => {
  if (!vfxRenderer) return;
  if (vfxRenderer.playing) {
    vfxRenderer.pause();
    el('btn-play').textContent = 'Play';
  } else {
    vfxRenderer.play();
    el('btn-play').textContent = 'Pause';
  }
});
el('btn-restart').addEventListener('click', () => vfxRenderer?.restart());
showGeoEl.addEventListener('change', async () => {
  if (!current || !vfxRenderer) return;
  if (showGeoEl.checked && current.entry.geoPath) {
    await vfxRenderer.loadGeoCompanion(current.entry.geoPath, ROOT);
  } else {
    vfxRenderer.disposeGeo();
  }
});
window.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement !== searchEl) {
    e.preventDefault();
    searchEl.focus();
  }
});

renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastClock) / 1000);
  lastClock = now;
  if (vfxRenderer) vfxRenderer.tick(dt, camera);
  controls.update();
  renderer.render(scene, camera);
});

async function boot() {
  resize();
  renderCategoryBar();
  setStatus('Loading vfx-index.json…');
  try {
    const [vfxRes, texRes] = await Promise.all([
      fetch('./vfx-index.json'),
      fetch('./index.json'),
    ]);
    if (!vfxRes.ok) throw new Error('vfx-index.json missing — run: python tools/build_vfx_index.py');
    index = await vfxRes.json();
    const texIndex = texRes.ok ? (await texRes.json()).textures : {};
    bank = new TextureBank(texIndex, ROOT);
  } catch (e) {
    setStatus(String(e.message), true);
    return;
  }
  applyFilter();
  setStatus('');

  const hash = decodeURIComponent(location.hash.slice(1));
  if (hash) {
    const entry = index.effects.find((e) => e.name === hash);
    if (entry) loadEffect(entry);
  } else {
    const demo = index.effects.find((e) => e.name === 'CarExplosion01')
      || index.effects.find((e) => e.name === 'sec_fx_sparks_blue')
      || index.effects[0];
    if (demo) loadEffect(demo);
  }
}

boot();
