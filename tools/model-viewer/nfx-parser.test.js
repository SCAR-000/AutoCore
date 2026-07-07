import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOMParser } from '@xmldom/xmldom';
import {
  canonicalParticleType,
  defaultEvent,
  lerpColor,
  parseColorRange,
  parseNfx,
  parseRange,
  parseRotation,
  parseTextureId,
  parseTextureIdList,
  parseVectorRange,
  pickPreviewEvent,
  sampleRange,
  summarizePlayback,
  countPlayableSystems,
} from './nfx-parser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../..');
const DATA = path.join(REPO, 'assets/extracted/data');

function readFixture(name) {
  return fs.readFileSync(path.join(DATA, name), 'utf8');
}

function parseFixture(name) {
  return parseNfx(readFixture(name), new DOMParser());
}

describe('parseRange', () => {
  it('parses scalar and range strings', () => {
    assert.deepEqual(parseRange('1.5'), { min: 1.5, max: 1.5, isRange: false });
    assert.deepEqual(parseRange('0.1;0.2'), { min: 0.1, max: 0.2, isRange: true });
    assert.equal(sampleRange(parseRange('2;4'), () => 0.5), 3);
  });
});

describe('parseTextureId', () => {
  it('parses decimal block and sub-quadrant', () => {
    assert.deepEqual(parseTextureId('16'), { block: 16, sub: null, raw: '16' });
    assert.deepEqual(parseTextureId('15A'), { block: 15, sub: 'A', raw: '15A' });
    assert.deepEqual(parseTextureId('63D'), { block: 63, sub: 'D', raw: '63D' });
  });

  it('treats a single-digit block + letter as a quadrant, not a hex digit', () => {
    assert.deepEqual(parseTextureId('4C'), { block: 4, sub: 'C', raw: '4C' });
    assert.deepEqual(parseTextureId('2b'), { block: 2, sub: 'B', raw: '2B' });
  });

  it('parses lists separated by commas, spaces or semicolons', () => {
    assert.deepEqual(parseTextureIdList('16,3A,45').map((t) => t.block), [16, 3, 45]);
    assert.deepEqual(parseTextureIdList('16;54').map((t) => t.block), [16, 54]);
  });
});

describe('canonicalParticleType', () => {
  it('normalizes case variants to canonical names', () => {
    assert.equal(canonicalParticleType('Centerbeam'), 'CenterBeam');
    assert.equal(canonicalParticleType('billboard'), 'Billboard');
    assert.equal(canonicalParticleType('kite'), 'Kite');
    assert.equal(canonicalParticleType('Decal'), 'Decal');
    assert.equal(canonicalParticleType(undefined), 'Billboard');
  });
});

describe('parseColorRange', () => {
  it('normalizes 0-255 to 0-1', () => {
    const c = parseColorRange('255,128,0');
    assert.ok(c.start);
    assert.equal(c.start.r, 1);
    assert.equal(c.start.g, 128 / 255);
  });

  it('lerps colors', () => {
    const a = { r: 0, g: 0, b: 0 };
    const b = { r: 1, g: 1, b: 1 };
    const mid = lerpColor(a, b, 0.5);
    assert.equal(mid.r, 0.5);
  });
});

describe('parseVectorRange', () => {
  it('parses direction ranges', () => {
    const v = parseVectorRange('-1,-1,-1;1,1,1');
    assert.deepEqual(v.start, [-1, -1, -1]);
    assert.deepEqual(v.end, [1, 1, 1]);
    assert.equal(v.isRange, true);
  });

  it('strips a leading N/H spatial flag instead of collapsing to null', () => {
    const v = parseVectorRange('N-1,0.6,-1;1,1,1');
    assert.deepEqual(v.start, [-1, 0.6, -1]);
    assert.deepEqual(v.end, [1, 1, 1]);
    // parameter refs (P#) stay unresolved
    assert.equal(parseVectorRange('P1').start, null);
  });
});

describe('parseNfx fixtures', () => {
  it('parses CarExplosion01 with Death event and particles', () => {
    const { specialFx, warnings } = parseFixture('CarExplosion01_nfx.xml');
    assert.equal(warnings.length, 0);
    assert.ok(specialFx.length >= 1);
    const death = specialFx.find((fx) => fx.events.includes('Death'));
    assert.ok(death);
    const particles = death.children.filter((c) => c.kind === 'Particle');
    assert.ok(particles.length > 5);
    const p = particles[0];
    assert.equal(p.type, 'Billboard');
    assert.ok(p.keyframes.length >= 1);
    assert.ok(p.keyframes[0].particleStart?.textureID);
  });

  it('parses sec_fx_sparks_blue with Kite particles', () => {
    const { specialFx } = parseFixture('sec_fx_sparks_blue_nfx.xml');
    const create = specialFx.find((fx) => fx.events.includes('Create'));
    assert.ok(create);
    const kite = create.children.find((c) => c.kind === 'Particle');
    assert.equal(kite.type, 'Kite');
    assert.equal(kite.keyframes[0].particleStart.textureID.raw, '15A');
  });

  it('parses fx_smoke01 with looping smoke emitters', () => {
    const { specialFx } = parseFixture('fx_smoke01_nfx.xml');
    const create = defaultEvent(specialFx);
    assert.ok(create.events.includes('Create'));
    const smoke = create.children.filter((c) => c.kind === 'Particle');
    assert.equal(smoke.length, 2);
    assert.ok(smoke[0].emitter.duration.min >= 999999);
  });

  it('summarizePlayback counts billboard vs deferred', () => {
    const { specialFx } = parseFixture('sec_fx_sparks_blue_nfx.xml');
    const sum = summarizePlayback(specialFx[0]);
    assert.ok(sum.playable >= 1);
    assert.ok(sum.types.includes('Kite'));
  });

  it('parseRotation handles R-prefix random', () => {
    assert.equal(parseRotation('R1', () => 0), 0);
    assert.equal(parseRotation('R1', () => 0.5), Math.PI);
  });

  it('machine gun Fire event has nested Geometry particles', () => {
    const { specialFx } = parseFixture('weap_HSI_tur_md_01_machine-gun_nfx.xml');
    const fire = specialFx.find((fx) => fx.events.includes('Fire'));
    assert.ok(fire);
    assert.equal(countPlayableSystems(fire), 7);
    const preview = pickPreviewEvent(specialFx);
    assert.equal(preview.event, 'Fire');
    const sum = summarizePlayback(fire);
    assert.equal(sum.playable, 7);
    assert.ok(sum.types.includes('CenterBeam'));
    assert.ok(sum.types.includes('Kite'));
  });
});
