import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOMParser } from '@xmldom/xmldom';
import { defaultEvent, parseNfx, pickPreviewEvent } from './nfx-parser.js';
import {
  MAX_PARTICLES_PER_SYSTEM,
  createVfxSimulation,
  getLiveParticles,
  getLiveStrips,
  resetSimulation,
  tickSimulation,
} from './particle-sim-lib.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../..');

function loadSim(fixture) {
  const xml = fs.readFileSync(path.join(REPO, 'assets/extracted/data', fixture), 'utf8');
  const { specialFx } = parseNfx(xml, new DOMParser());
  const block = defaultEvent(specialFx);
  return createVfxSimulation(block, () => 0.42);
}

describe('createVfxSimulation', () => {
  it('creates systems from sparks effect', () => {
    const sim = loadSim('sec_fx_sparks_blue_nfx.xml');
    assert.ok(sim.systems.length >= 1);
    assert.equal(sim.systems[0].type, 'Kite');
  });

  it('spawns particles over time', () => {
    const sim = loadSim('fx_smoke01_nfx.xml');
    for (let i = 0; i < 30; i++) tickSimulation(sim, 0.1);
    const live = getLiveParticles(sim);
    assert.ok(live.length > 0);
    assert.ok(live.every((p) => p.alpha >= 0 && p.textureId));
  });

  it('respects particle cap', () => {
    const sim = loadSim('CarExplosion01_nfx.xml');
    for (let i = 0; i < 200; i++) tickSimulation(sim, 0.05);
    let total = 0;
    for (const s of sim.systems) total += s.particles.filter((p) => p.alive).length;
    assert.ok(total <= MAX_PARTICLES_PER_SYSTEM * sim.systems.length);
  });

  it('reset clears particles', () => {
    const sim = loadSim('CarExplosion01_nfx.xml');
    for (let i = 0; i < 40; i++) tickSimulation(sim, 0.05);
    assert.ok(getLiveParticles(sim).length > 0);
    resetSimulation(sim);
    assert.equal(getLiveParticles(sim).length, 0);
    assert.equal(sim.time, 0);
  });

  it('machine gun Fire spawns nested Geometry particles', () => {
    const xml = fs.readFileSync(
      path.join(REPO, 'assets/extracted/data/weap_HSI_tur_md_01_machine-gun_nfx.xml'),
      'utf8',
    );
    const { specialFx } = parseNfx(xml, new DOMParser());
    const { block } = pickPreviewEvent(specialFx);
    const sim = createVfxSimulation(block, () => 0.37);
    assert.equal(sim.systems.length, 7);
    assert.ok(sim.systems.some((s) => s.type === 'CenterBeam'));
    assert.ok(sim.systems.some((s) => s.type === 'Kite'));
    for (let i = 0; i < 50; i++) tickSimulation(sim, 0.1);
    const live = getLiveParticles(sim);
    assert.ok(live.length > 0, 'expected live particles after 5s sim');
    const texIds = new Set(live.map((p) => p.textureId));
    assert.ok(texIds.has('17') || texIds.has('47') || texIds.has('15B'), `got textures: ${[...texIds]}`);
  });

  it('builds a static Trail ribbon of numberOfLinks-1 segments', () => {
    const xml = fs.readFileSync(
      path.join(REPO, 'assets/extracted/data/weap_roc_tur_sm_01_spike-launcher_nfx.xml'),
      'utf8',
    );
    const { specialFx } = parseNfx(xml, new DOMParser());
    const block = specialFx.find((fx) => fx.events.includes('HitFirer'));
    const sim = createVfxSimulation(block, () => 0.5);
    assert.ok(sim.trails.length >= 1);
    const strips = getLiveStrips(sim);
    // numberOfLinks="12" → 11 segments, available without ticking
    assert.ok(strips.length >= 11);
    assert.ok(strips.every((s) => s.textureId === '4C'));
  });

  it('simulates a Lightning bolt into ribbon strips', () => {
    const xml = fs.readFileSync(
      path.join(REPO, 'assets/extracted/data/weap_LG_tur_sm_01_coil-lighting_nfx.xml'),
      'utf8',
    );
    const { specialFx } = parseNfx(xml, new DOMParser());
    const block = specialFx.find((fx) => fx.events.includes('HitFirer'));
    assert.ok(block, 'HitFirer event with Lightning');
    const sim = createVfxSimulation(block, () => 0.5);
    assert.ok(sim.lightning.length >= 1);
    // startDelay 0.2, duration 0.2 → active around t=0.25
    for (let i = 0; i < 5; i++) tickSimulation(sim, 0.05);
    const strips = getLiveStrips(sim);
    assert.ok(strips.length > 0, 'expected lightning ribbon segments');
    assert.ok(strips.every((s) => Number.isFinite(s.x0) && Number.isFinite(s.w0)));
  });

  it('builds a Decal system oriented by its heading normal', () => {
    const xml = fs.readFileSync(
      path.join(REPO, 'assets/extracted/data/weather_Windjammer_PLACED-sprinkler_nfx.xml'),
      'utf8',
    );
    const { specialFx } = parseNfx(xml, new DOMParser());
    const { block } = pickPreviewEvent(specialFx);
    const sim = createVfxSimulation(block, () => 0.5);
    const decal = sim.systems.find((s) => s.type === 'Decal');
    assert.ok(decal, 'Decal system present');
    assert.ok(decal.decalNormal, 'Decal has a surface normal');
    // Decal flashes are short-lived; sample across frames for a fixed-plane particle.
    let sawDecal = false;
    for (let i = 0; i < 40 && !sawDecal; i++) {
      tickSimulation(sim, 0.02);
      sawDecal = getLiveParticles(sim).some((p) => p.orient === 2);
    }
    assert.ok(sawDecal, 'Decal particles use fixed-plane orient');
  });

  it('preserves textureID when later keyframes omit it', () => {
    const xml = fs.readFileSync(
      path.join(REPO, 'assets/extracted/data/CarExplosion01_nfx.xml'),
      'utf8',
    );
    const { specialFx } = parseNfx(xml, new DOMParser());
    const block = specialFx.find((fx) => fx.events.includes('Death'));
    const sim = createVfxSimulation(block, () => 0.1);
    for (let i = 0; i < 80; i++) tickSimulation(sim, 0.05);
    const live = getLiveParticles(sim);
    const tex38 = live.filter((p) => p.textureId === '38').length;
    const tex33 = live.filter((p) => p.textureId === '33').length;
    assert.ok(tex38 > 0, 'expected flash texture 38');
    assert.ok(tex33 > 0, 'expected fire texture 33');
    assert.ok(live.filter((p) => p.textureId === '16').length < live.length * 0.5,
      'most particles should not fall back to smoke texture 16');
  });
});
