/**
 * nfx-parser.js — parse Auto Assault *_nfx.xml particle effect definitions.
 *
 * Spec reference: assets/extracted/data/exampleScript_nfx.xml
 */

/** @typedef {{ min: number, max: number, isRange: boolean }} ParsedRange */
/** @typedef {{ r: number, g: number, b: number }} ParsedColor */
/** @typedef {{ start: ParsedColor|null, end: ParsedColor|null, isRange: boolean }} ParsedColorRange */
/** @typedef {{ block: number, sub: string|null, raw: string }} ParsedTextureId */

const RANGE_SEP = ';';

/**
 * Parse a scalar or min;max range string.
 * @param {string|number|undefined|null} raw
 * @param {number} [fallback=0]
 * @returns {ParsedRange}
 */
export function parseRange(raw, fallback = 0) {
  if (raw == null || raw === '') {
    return { min: fallback, max: fallback, isRange: false };
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return { min: raw, max: raw, isRange: false };
  }
  const s = String(raw).trim();
  if (!s) return { min: fallback, max: fallback, isRange: false };
  if (s.includes(RANGE_SEP)) {
    const [a, b] = s.split(RANGE_SEP).map((x) => parseFloat(x.trim()));
    const min = Number.isFinite(a) ? a : fallback;
    const max = Number.isFinite(b) ? b : min;
    return { min, max, isRange: min !== max };
  }
  const v = parseFloat(s);
  const n = Number.isFinite(v) ? v : fallback;
  return { min: n, max: n, isRange: false };
}

/** Sample a ParsedRange uniformly. */
export function sampleRange(range, rng = Math.random) {
  if (!range.isRange) return range.min;
  return range.min + (range.max - range.min) * rng();
}

/** Lerp between two ParsedRange endpoints. */
export function lerpRange(start, end, t, rng = Math.random) {
  const a = start?.isRange ? sampleRange(start, rng) : (start?.min ?? 0);
  const b = end?.isRange ? sampleRange(end, rng) : (end?.min ?? a);
  return a + (b - a) * t;
}

/**
 * Parse rotation: scalar, or R-prefix random (e.g. R1 = 0..1 × 2π).
 * @param {string|undefined|null} raw
 * @param {() => number} [rng]
 */
export function parseRotation(raw, rng = Math.random) {
  if (raw == null || raw === '') return 0;
  const s = String(raw).trim();
  if (/^[Rr]/.test(s)) {
    const mul = parseFloat(s.slice(1));
    return (Number.isFinite(mul) ? mul : 1) * rng() * Math.PI * 2;
  }
  const v = parseFloat(s);
  return Number.isFinite(v) ? v : 0;
}

/**
 * Parse "r,g,b" or "r,g,b;r,g,b" color string (0–255).
 * @param {string|undefined|null} raw
 * @returns {ParsedColorRange}
 */
export function parseColorRange(raw) {
  if (!raw) return { start: null, end: null, isRange: false };
  const parts = String(raw).split(RANGE_SEP);
  const parseTriple = (s) => {
    const nums = s.split(',').map((x) => parseFloat(x.trim()));
    if (nums.length < 3 || nums.some((n) => !Number.isFinite(n))) return null;
    return { r: nums[0] / 255, g: nums[1] / 255, b: nums[2] / 255 };
  };
  const start = parseTriple(parts[0]);
  const end = parts.length > 1 ? parseTriple(parts[1]) : start;
  return { start, end, isRange: parts.length > 1 };
}

/** Lerp two ParsedColor objects. */
export function lerpColor(a, b, t) {
  if (!a && !b) return null;
  if (!a) return b;
  if (!b) return a;
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  };
}

/**
 * Parse "x,y,z" or "x,y,z;x,y,z" vector string.
 *
 * A leading `N` (normalized) or `H` (heading-relative) spatial flag on the first
 * component — e.g. `direction="N-1,0.6,-1;1,1,1"` — is stripped so the numbers
 * parse. (Downstream, direction/axis vectors are normalized anyway, and in the
 * preview body-heading is identity, so H reduces to absolute.) A `P` parameter
 * reference like `P1` is left unresolved (returns null).
 * @param {string|undefined|null} raw
 * @returns {{ start: number[]|null, end: number[]|null, isRange: boolean }}
 */
export function parseVectorRange(raw) {
  if (!raw) return { start: null, end: null, isRange: false };
  const parts = String(raw).split(RANGE_SEP);
  const parseVec = (s) => {
    const nums = s.split(',').map((x) => parseFloat(x.trim().replace(/^[NHnh]/, '')));
    return nums.length >= 3 && nums.every((n) => Number.isFinite(n)) ? nums.slice(0, 3) : null;
  };
  const start = parseVec(parts[0]);
  const end = parts.length > 1 ? parseVec(parts[1]) : start;
  return { start, end, isRange: parts.length > 1 };
}

/**
 * Parse textureID like "16", "15A", "63D".
 * Per the format spec (exampleScript_nfx.xml:154-155) the block is the *decimal*
 * number 0–63 (an 8×8 atlas), with an optional A/B/C/D suffix selecting a
 * quadrant of that block (0A = upper-left … 63D = bottom-right).
 * @param {string|undefined|null} raw
 * @returns {ParsedTextureId|null}
 */
export function parseTextureId(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim().toUpperCase();
  const m = /^(\d{1,2})([ABCD])?$/.exec(s);
  if (!m) return { block: 0, sub: null, raw: s };
  const block = parseInt(m[1], 10);
  return { block: Math.min(63, block), sub: m[2] || null, raw: s };
}

/** Parse a textureID list separated by commas, spaces or semicolons (random pick). */
export function parseTextureIdList(raw) {
  if (!raw) return [];
  return String(raw)
    .split(/[\s,;]+/)
    .map((x) => parseTextureId(x))
    .filter(Boolean);
}

/** Canonical particle-type names, so case variants in the data still render. */
const PARTICLE_TYPE_CANON = {
  billboard: 'Billboard',
  kite: 'Kite',
  centerbeam: 'CenterBeam',
  beam: 'Beam',
  decal: 'Decal',
  fluid: 'Fluid',
};

/** Particle types the simulator can render as quads. */
export const SIMULATED_PARTICLE_TYPES = ['Billboard', 'Kite', 'CenterBeam', 'Beam', 'Decal'];

/** Normalize a raw `type=` attribute to a canonical name (defaults to Billboard). */
export function canonicalParticleType(raw) {
  if (!raw) return 'Billboard';
  return PARTICLE_TYPE_CANON[String(raw).trim().toLowerCase()] ?? raw;
}

function attrs(node) {
  const out = {};
  if (!node?.attributes) return out;
  for (const a of node.attributes) out[a.name] = a.value;
  return out;
}

function childElements(node, tag) {
  if (!node) return [];
  return [...node.children].filter((c) => c.tagName === tag);
}

function firstChild(node, tag) {
  return childElements(node, tag)[0] ?? null;
}

function parseMotionBlock(node) {
  if (!node) return null;
  const a = attrs(node);
  const axisRaw = a.axis ?? a.direction;
  return {
    tag: node.tagName,
    attrs: a,
    speed: parseRange(a.speed),
    direction: parseVectorRange(a.direction),
    acceleration: parseVectorRange(a.acceleration),
    length: parseRange(a.length),
    radius: parseRange(a.radius),
    axis: parseVectorRange(axisRaw),
    rotationSpeed: parseRange(a.rotationSpeed),
    rotationPosition: parseRange(a.rotationPosition),
    useBodyH: a.useBodyH === '1',
    relativeCoords: a.relativeCoords === '1',
  };
}

function parseParticleInfo(node) {
  if (!node) return null;
  const a = attrs(node);
  const has = (k) => Object.prototype.hasOwnProperty.call(a, k) && String(a[k]).trim() !== '';
  return {
    attrs: a,
    hasTexture: has('textureID'),
    hasColor: has('color'),
    hasAlpha: has('alpha'),
    hasScale: has('scale'),
    hasScaleY: has('scaleY'),
    hasRotationSpeed: has('rotationSpeed'),
    hasBright: has('bright'),
    textureID: has('textureID') ? parseTextureId(a.textureID) : null,
    textureIDs: has('textureID') ? parseTextureIdList(a.textureID) : [],
    color: has('color') ? parseColorRange(a.color) : null,
    alpha: has('alpha') ? parseRange(a.alpha, 255) : null,
    scale: has('scale') ? parseRange(a.scale, 1) : null,
    scaleY: has('scaleY') ? parseRange(a.scaleY, 1) : (has('scale') ? parseRange(a.scale, 1) : null),
    rotation: parseRange(a.rotation, 0),
    rotationRaw: a.rotation ?? null,
    rotationSpeed: has('rotationSpeed') ? parseRange(a.rotationSpeed, 0) : null,
    acceleration: parseVectorRange(a.acceleration),
    detachFromEmitter: a.detachFromEmitter === '1',
    addEmitterVelocity: a.addEmitterVelocity === '1',
    bright: a.bright === '1',
    light: a.light === '1',
  };
}

function parseKeyframe(node) {
  const a = attrs(node);
  return {
    attrs: a,
    duration: parseRange(a.duration, 1),
    playSound: a.playSound || null,
    initiateDamage: a.initiateDamage === '1',
    particleStart: parseParticleInfo(firstChild(node, 'ParticleInfo')),
    particleEnd: parseParticleInfo(firstChild(node, 'ParticleInfoEnd')),
    ray: parseMotionBlock(firstChild(node, 'Ray')),
    circle: parseMotionBlock(firstChild(node, 'Circle')),
    orbit: parseMotionBlock(firstChild(node, 'Orbit')),
    environment: attrs(firstChild(node, 'Environment')),
    geometryStart: attrs(firstChild(node, 'GeometryInfo')),
    geometryEnd: attrs(firstChild(node, 'GeometryInfoEnd')),
  };
}

function parseEmitterInfo(node) {
  if (!node) return { attrs: {}, keyframes: [], shapes: [] };
  const a = attrs(node);
  return {
    attrs: a,
    offset: parseVectorRange(a.offset)?.start,
    duration: parseRange(a.duration, 1),
    particlesPerSecond: parseRange(a.particlesPerSecond, 1),
    numberPerEmission: parseRange(a.numberPerEmission, 1),
    numberOfEmitters: parseRange(a.numberOfEmitters, 1),
    particleDuration: parseRange(a.particleDuration, 1),
    startDelay: parseRange(a.startDelay, 0),
    minParticles: parseRange(a.minParticles, 0),
    loopingKeyframes: a.loopingKeyframes === '1',
    continuousFire: a.continuousFire === '1',
    alwaysAddBodyVelocity: a.alwaysAddBodyVelocity === '1',
    terrainCollision: a.terrainCollision === '1',
    bounceEnergy: parseRange(a.bounceEnergy, 0),
    neverTimeout: a.neverTimeout === '1',
    shapes: childElements(node, 'Ray').map(parseMotionBlock)
      .concat(childElements(node, 'Circle').map(parseMotionBlock)),
    keyframes: childElements(node, 'Keyframe').map(parseKeyframe),
  };
}

function parseParticle(node) {
  const a = attrs(node);
  const emitter = parseEmitterInfo(firstChild(node, 'EmitterInfo'));
  const keyframes = emitter.keyframes.length
    ? emitter.keyframes
    : childElements(node, 'Keyframe').map(parseKeyframe);
  return {
    kind: 'Particle',
    attrs: a,
    type: canonicalParticleType(a.type),
    bright: a.bright === '1',
    heading: a.heading || 'Body',
    distort: a.distort === '1',
    glow: a.glow === '1',
    terrain: a.terrain === '1',
    skybox: a.skybox === '1',
    emitter,
    keyframes,
  };
}

function parseTrail(node) {
  const a = attrs(node);
  return {
    kind: 'Trail',
    attrs: a,
    textureIDs: parseTextureIdList(a.textureID),
    numberOfLinks: Math.max(2, Math.round(parseRange(a.numberOfLinks, 4).min)),
    bright: a.bright === '1',
    duration: parseRange(a.duration, 1),
    colorStart: parseColorRange(a.colorStart).start,
    colorEnd: parseColorRange(a.colorEnd).start,
    alphaStart: parseRange(a.alphaStart, 255).min,
    alphaEnd: parseRange(a.alphaEnd, 0).min,
    scaleStart: parseRange(a.scaleStart, 1).min,
    scaleEnd: parseRange(a.scaleEnd, 1).min,
  };
}

function parseLightning(node) {
  const a = attrs(node);
  return {
    kind: 'Lightning',
    attrs: a,
    textureID: parseTextureId(a.textureID),
    bright: a.bright === '1',
    startOffset: parseVectorRange(a.startOffset)?.start,
    target: a.target ?? null,
    targetVec: parseVectorRange(a.target)?.start,
    duration: parseRange(a.duration, 1).min,
    linksPerMeter: parseRange(a.linksPerMeter, 1).min,
    color: parseColorRange(a.color).start,
    alpha: parseRange(a.alpha, 255).min,
    scale: parseRange(a.scale, 0.1).min,
    jiggleRadius: parseRange(a.jiggleRadius, 0.5),
    changeTime: parseRange(a.changeTime, 0.1).min,
    lightningStream: a.lightningStream !== '0',
    forked: a.forked === '1',
    forkChance: parseRange(a.forkChance, 0).min,
    forkScale: parseRange(a.forkScale, 0.3).min,
    numberOfForksScale: parseRange(a.numberOfForksScale, 1).min,
    startDelay: parseRange(a.startDelay, 0).min,
  };
}

function parseGeometry(node) {
  const a = attrs(node);
  return {
    kind: 'Geometry',
    attrs: a,
    filename: a.filename || null,
    useOwnerGfx: a.useOwnerGfx === '1',
    keyframes: childElements(node, 'Keyframe').map(parseKeyframe),
    trails: childElements(node, 'Trail').map(parseTrail),
    particles: childElements(node, 'Particle').map(parseParticle),
  };
}

function parseSound(node) {
  return { kind: 'Sound', attrs: attrs(node) };
}

function parseSpecialFx(node) {
  const eventRaw = node.getAttribute('event') || '';
  const events = eventRaw.split('|').map((s) => s.trim()).filter(Boolean);
  const children = [];
  for (const child of node.children) {
    switch (child.tagName) {
      case 'Particle': children.push(parseParticle(child)); break;
      case 'Trail': children.push(parseTrail(child)); break;
      case 'Lightning': children.push(parseLightning(child)); break;
      case 'Geometry': children.push(parseGeometry(child)); break;
      case 'Sound': children.push(parseSound(child)); break;
      case 'Force': children.push({ kind: 'Force', attrs: attrs(child) }); break;
      case 'Group': children.push({ kind: 'Group', attrs: attrs(child) }); break;
      case 'Parameter': children.push({ kind: 'Parameter', attrs: attrs(child) }); break;
      default: children.push({ kind: child.tagName, attrs: attrs(child) }); break;
    }
  }
  return {
    events,
    eventRaw,
    animationEvent: node.getAttribute('animationEvent'),
    animationStart: parseRange(node.getAttribute('animationStart'), 0),
    children,
  };
}

/**
 * Parse NFX XML using a DOMParser-like interface (browser or tests).
 * @param {string} xmlText
 * @param {{ parseFromString: (s: string, mime: string) => Document }} [domParser]
 */
export function parseNfx(xmlText, domParser = null) {
  const warnings = [];
  let parser = domParser;
  if (!parser && typeof DOMParser !== 'undefined') {
    parser = new DOMParser();
  }
  if (!parser) {
    warnings.push('DOMParser unavailable');
    return { specialFx: [], warnings };
  }

  const doc = parser.parseFromString(xmlText, 'application/xml');
  const err = doc.querySelector?.('parsererror');
  if (err) warnings.push('XML parse error');

  const root = doc.querySelector?.('xml') || doc.documentElement;
  const nodes = root?.getElementsByTagName?.('NDSpecialFX') ?? [];
  const specialFx = [...nodes].map(parseSpecialFx);
  return { specialFx, warnings };
}

/** Collect playback support flags for an event block (includes Geometry-nested particles). */
export function summarizePlayback(specialFxBlock) {
  let playable = 0;
  let deferred = 0;
  const types = new Set();
  walkEffectNodes(specialFxBlock, (node) => {
    if (node.kind === 'Particle') {
      types.add(node.type);
      if (SIMULATED_PARTICLE_TYPES.includes(node.type)) playable++;
      else deferred++;
    } else if (node.kind === 'Trail' || node.kind === 'Lightning') {
      types.add(node.kind);
      playable++;
    } else if (node.kind !== 'Geometry' && node.kind !== 'Include' && node.kind !== 'Parameter' && node.kind !== 'Sound') {
      deferred++;
      types.add(node.kind);
    }
  });
  return { playable, deferred, types: [...types] };
}

/** Walk all effect nodes including particles nested under Geometry. */
export function walkEffectNodes(specialFxBlock, fn) {
  if (!specialFxBlock?.children) return;
  for (const ch of specialFxBlock.children) {
    fn(ch);
    if (ch.kind === 'Geometry') {
      if (ch.particles) for (const p of ch.particles) fn(p);
      if (ch.trails) for (const t of ch.trails) fn(t);
    }
  }
}

/** Collect simulatable particle nodes (top-level and Geometry-nested). */
export function collectParticleNodes(specialFxBlock) {
  const out = [];
  walkEffectNodes(specialFxBlock, (node) => {
    if (node.kind === 'Particle' && SIMULATED_PARTICLE_TYPES.includes(node.type)) {
      out.push(node);
    }
  });
  return out;
}

/** Collect Trail nodes (top-level and Geometry-nested). */
export function collectTrailNodes(specialFxBlock) {
  const out = [];
  walkEffectNodes(specialFxBlock, (node) => {
    if (node.kind === 'Trail') out.push(node);
  });
  return out;
}

/** Collect Lightning nodes. */
export function collectLightningNodes(specialFxBlock) {
  const out = [];
  walkEffectNodes(specialFxBlock, (node) => {
    if (node.kind === 'Lightning') out.push(node);
  });
  return out;
}

/** Count simulatable particle systems in a block. */
export function countPlayableSystems(specialFxBlock) {
  return collectParticleNodes(specialFxBlock).length;
}

/** Pick best event/block for preview playback. */
export function pickPreviewEvent(specialFxList) {
  const priority = ['Create', 'Fire', 'Hit', 'Death', 'Charge', 'Status', 'Miss'];
  for (const ev of priority) {
    const block = specialFxList.find((fx) => fx.events.includes(ev));
    if (block && countPlayableSystems(block) > 0) return { block, event: ev };
  }
  for (const block of specialFxList) {
    if (countPlayableSystems(block) > 0) {
      return { block, event: block.events[0] };
    }
  }
  if (!specialFxList.length) return null;
  return { block: specialFxList[0], event: specialFxList[0].events[0] };
}

/** Pick default event: Create if present, else first. */
export function defaultEvent(specialFxList) {
  return pickPreviewEvent(specialFxList)?.block ?? null;
}
