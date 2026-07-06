import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGeo } from './geo-parser.js';
import {
  BAKED_WHEEL_Y_EPSILON,
  filterBodySections,
  geoAuthoredWheelMetrics,
  isBakedWheelSection,
  pickLod0Sections,
  resolveModelStem,
  sectionMinY,
  wheelMeshScaleFromPhysics,
} from './geo-mesh-lib.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../..');

function makeSection({ lod = 0, effect = 'NDHumanCar.fx', yMin = 0, yMax = 1 } = {}) {
  const positions = new Float32Array([
    0, yMin, 0,
    1, yMax, 0,
    0, yMax, 1,
  ]);
  return {
    lod,
    effect,
    params: {},
    positions,
    normals: null,
    uvs: null,
    indices: new Uint16Array([0, 1, 2]),
    vertexCount: 3,
    triangleCount: 1,
  };
}

describe('resolveModelStem', () => {
  const stems = new Map([
    ['obj_veh_p_h_r_cha_02_dune-buggy', 'assets/extracted/models/obj_veh_p_h_r_cha_02_dune-buggy.geo'],
    ['veh_p_h_r_cha_02_dune-buggy', 'assets/extracted/models/veh_p_h_r_cha_02_dune-buggy.geo'],
    ['veh_only_body', 'assets/extracted/models/veh_only_body.geo'],
  ]);

  it('prefers obj_ prefix over bare veh_ stem', () => {
    const stem = resolveModelStem(stems, ['veh_p_h_r_cha_02_dune-buggy']);
    assert.equal(stem, 'obj_veh_p_h_r_cha_02_dune-buggy');
  });

  it('falls back to bare name when obj_ variant is missing', () => {
    const stem = resolveModelStem(stems, ['veh_only_body']);
    assert.equal(stem, 'veh_only_body');
  });

  it('tries PhysicsName after UniqueName', () => {
    const stem = resolveModelStem(stems, ['missing_unique', 'veh_only_body']);
    assert.equal(stem, 'veh_only_body');
  });

  it('returns null when nothing resolves', () => {
    assert.equal(resolveModelStem(stems, ['does_not_exist']), null);
    assert.equal(resolveModelStem(stems, []), null);
  });

  it('works with plain object stem maps', () => {
    const obj = Object.fromEntries(stems);
    assert.equal(
      resolveModelStem(obj, ['veh_p_h_r_cha_02_dune-buggy']),
      'obj_veh_p_h_r_cha_02_dune-buggy',
    );
  });
});

describe('pickLod0Sections', () => {
  it('keeps minimum LOD and drops shadow projection passes', () => {
    const sections = [
      makeSection({ lod: 0, effect: 'NDHumanCar.fx' }),
      makeSection({ lod: 1, effect: 'NDHumanCar.fx' }),
      makeSection({ lod: 0, effect: 'PalShadowProjection.fx' }),
    ];
    const out = pickLod0Sections(sections);
    assert.equal(out.length, 1);
    assert.equal(out[0].lod, 0);
    assert.match(out[0].effect, /HumanCar/i);
  });

  it('returns empty array for empty input', () => {
    assert.deepEqual(pickLod0Sections([]), []);
  });
});

describe('isBakedWheelSection', () => {
  it('flags low confined sections at the body XOBB floor', () => {
    const bodyBBox = { min: [-1, -0.24, -1], max: [1, 2.7, 1], center: [0, 1.15, 0] };
    const wheel = makeSection({ yMin: -0.2, yMax: 1.7 });
    const cabin = makeSection({ yMin: 0.25, yMax: 2.6 });
    assert.equal(isBakedWheelSection(wheel, bodyBBox), true);
    assert.equal(isBakedWheelSection(cabin, bodyBBox), false);
  });

  it('returns false without bodyBBox', () => {
    assert.equal(isBakedWheelSection(makeSection({ yMin: -1 }), null), false);
  });

  it('returns false when section max Y extends above body center headroom', () => {
    const bodyBBox = { min: [0, 0, 0], max: [1, 2, 1], center: [0, 1, 0] };
    assert.equal(isBakedWheelSection(makeSection({ yMin: 0, yMax: 2 }), bodyBBox), false);
  });
});

describe('filterBodySections', () => {
  it('never returns empty when LOD0 sections exist', () => {
    const bodyBBox = { min: [0, 0.34, 0], max: [1, 2, 1], center: [0, 1.27, 0] };
    const sections = [makeSection({ yMin: -0.9, yMax: 0.94 })];
    const kept = filterBodySections(sections, bodyBBox, true);
    assert.equal(kept.length, 1);
  });

  it('drops separate wheel sections when present alongside cabin sections', () => {
    const bodyBBox = { min: [-1, -0.24, -1], max: [1, 2.7, 1], center: [0, 1.15, 0] };
    const sections = [
      makeSection({ yMin: -0.2, yMax: 1.7 }),
      makeSection({ yMin: 0.25, yMax: 2.6 }),
    ];
    const kept = filterBodySections(sections, bodyBBox, true);
    assert.equal(kept.length, 1);
    assert.equal(sectionMinY(kept[0]), 0.25);
  });
});

describe('sectionMinY', () => {
  it('returns lowest vertex Y', () => {
    assert.equal(sectionMinY(makeSection({ yMin: -0.5, yMax: 2 })), -0.5);
  });
});

describe('geoAuthoredWheelMetrics', () => {
  it('derives radius and width from bodyBBox', () => {
    const parsed = {
      bodyBBox: {
        min: [-0.25, -0.5, -0.5],
        max: [0.25, 0.5, 0.5],
        radius: 0.528,
      },
    };
    const m = geoAuthoredWheelMetrics(parsed);
    assert.ok(Math.abs(m.radius - 0.528) < 1e-9);
    assert.ok(Math.abs(m.width - 0.5) < 1e-9);
  });

  it('falls back when bodyBBox is missing', () => {
    const m = geoAuthoredWheelMetrics({});
    assert.equal(m.radius, 0.5);
    assert.equal(m.width, 0.5);
  });
});

describe('wheelMeshScaleFromPhysics', () => {
  const authored = { radius: 0.528, width: 0.505 };

  it('scales rear Callisto wheels larger than front', () => {
    const front = wheelMeshScaleFromPhysics(authored, 0.7, 1, false);
    const rear = wheelMeshScaleFromPhysics(authored, 0.83, 1, false);
    assert.ok(rear.y > front.y);
    assert.ok(rear.z > front.z);
    assert.equal(front.y, front.z);
    assert.equal(rear.y, rear.z);
  });

  it('mirrors left wheels on X only', () => {
    const left = wheelMeshScaleFromPhysics(authored, 0.7, 1, true);
    const right = wheelMeshScaleFromPhysics(authored, 0.7, 1, false);
    assert.equal(left.x, -right.x);
    assert.equal(left.y, right.y);
    assert.equal(left.z, right.z);
  });

  it('returns unit scale when targets match authored size', () => {
    const s = wheelMeshScaleFromPhysics(authored, authored.radius, authored.width, false);
    assert.ok(Math.abs(s.x - 1) < 1e-9);
    assert.ok(Math.abs(s.y - 1) < 1e-9);
    assert.ok(Math.abs(s.z - 1) < 1e-9);
  });
});

describe('integration — obj_veh dune-buggy geo', () => {
  const geoPath = path.join(REPO, 'assets/extracted/models/obj_veh_p_h_r_cha_02_dune-buggy.geo');

  it('classifies wheel vs cabin sections from real asset', { skip: !fs.existsSync(geoPath) }, () => {
    const buf = fs.readFileSync(geoPath);
    const parsed = parseGeo(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const lod0 = pickLod0Sections(parsed.sections);
    assert.ok(lod0.length > 0);

    const wheelSections = lod0.filter((s) => isBakedWheelSection(s, parsed.bodyBBox));
    const bodySections = lod0.filter((s) => !isBakedWheelSection(s, parsed.bodyBBox));
    assert.ok(wheelSections.length >= 1, 'expected at least one baked wheel section');
    assert.ok(bodySections.length >= 1, 'expected at least one body section');
    for (const s of wheelSections) {
      assert.ok(sectionMinY(s) <= parsed.bodyBBox.min[1] + BAKED_WHEEL_Y_EPSILON);
    }
  });

  it('Callisto wheel geo matches authored metrics used for scaling', () => {
    const wheelPath = path.join(REPO, 'assets/extracted/models/whl_h_4_01_rivits.geo');
    if (!fs.existsSync(wheelPath)) return;
    const buf = fs.readFileSync(wheelPath);
    const parsed = parseGeo(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const authored = geoAuthoredWheelMetrics(parsed);
    const front = wheelMeshScaleFromPhysics(authored, 0.7, 1, false);
    const rear = wheelMeshScaleFromPhysics(authored, 0.83, 1, false);
    assert.ok(rear.y / front.y > 1.15, 'rear radius scale should exceed front');
  });

  it('resolveModelStem picks obj_ variant for dune-buggy', () => {
    const idxPath = path.join(REPO, 'tools/model-viewer/index.json');
    if (!fs.existsSync(idxPath)) return;
    const idx = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
    const stems = new Map(
      idx.models.map((m) => [m.name.toLowerCase().replace(/\.geo$/, ''), m.path]),
    );
    assert.equal(
      resolveModelStem(stems, ['veh_p_h_r_cha_02_dune-buggy']),
      'obj_veh_p_h_r_cha_02_dune-buggy',
    );
  });
});
