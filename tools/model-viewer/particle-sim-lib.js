/**
 * particle-sim-lib.js — pure JS particle simulation for NFX Billboard/Kite/CenterBeam systems.
 * No Three.js dependency (unit-testable).
 */

import {
  collectLightningNodes,
  collectParticleNodes,
  collectTrailNodes,
  lerpColor,
  lerpRange,
  parseRange,
  parseRotation,
  parseVectorRange,
  sampleRange,
} from './nfx-parser.js';

export const MAX_PARTICLES_PER_SYSTEM = 512;
export const MAX_SYSTEMS = 64;

/** @typedef {{ x:number, y:number, z:number }} Vec3 */

function vec3(x = 0, y = 0, z = 0) {
  return { x, y, z };
}

function sampleVec(range, rng) {
  if (!range?.start) return vec3();
  if (!range.isRange || !range.end) {
    return { x: range.start[0], y: range.start[1], z: range.start[2] };
  }
  const t = rng();
  return {
    x: range.start[0] + (range.end[0] - range.start[0]) * t,
    y: range.start[1] + (range.end[1] - range.start[1]) * t,
    z: range.start[2] + (range.end[2] - range.start[2]) * t,
  };
}

function pickTextureId(info, rng) {
  if (!info?.hasTexture) return null;
  const list = info.textureIDs?.length ? info.textureIDs : (info.textureID ? [info.textureID] : []);
  if (!list.length) return null;
  return list[Math.floor(rng() * list.length)];
}

function scalarFromPrev(prevVal, fallback = 0) {
  return prevVal ?? fallback;
}

function rangeFromScalar(v) {
  return { min: v, max: v, isRange: false };
}

/**
 * Interpolate particle visual state for a keyframe segment.
 * Omitted ParticleInfo fields preserve the previous particle state (NFX spec).
 */
function interpParticleState(kf, t, rng = () => 0.5, prev = {}) {
  const s = kf.particleStart;
  const e = kf.particleEnd ?? s;

  let color = prev.color ?? { r: 1, g: 1, b: 1 };
  if (s?.hasColor || e?.hasColor) {
    const c0 = s?.hasColor ? s.color?.start : prev.color;
    const c1 = e?.hasColor ? e.color?.start : (s?.hasColor ? s.color?.end : prev.color);
    color = lerpColor(c0, c1 ?? c0, t) ?? color;
  }

  let alpha = scalarFromPrev(prev.alpha, 1);
  if (s?.hasAlpha || e?.hasAlpha) {
    const a0 = s?.hasAlpha ? s.alpha : rangeFromScalar((prev.alpha ?? 1) * 255);
    const a1 = e?.hasAlpha ? e.alpha : a0;
    alpha = lerpRange(a0, a1, t, rng) / 255;
  }

  let scale = scalarFromPrev(prev.scale, 1);
  if (s?.hasScale || e?.hasScale) {
    const sc0 = s?.hasScale ? s.scale : rangeFromScalar(prev.scale ?? 1);
    const sc1 = e?.hasScale ? e.scale : sc0;
    scale = lerpRange(sc0, sc1, t, rng);
  }

  let scaleY = scalarFromPrev(prev.scaleY, scale);
  if (s?.hasScaleY || e?.hasScaleY || s?.hasScale || e?.hasScale) {
    const sy0 = s?.hasScaleY ? s.scaleY : (s?.hasScale ? s.scale : rangeFromScalar(prev.scaleY ?? scale));
    const sy1 = e?.hasScaleY ? e.scaleY : (e?.hasScale ? e.scale : sy0);
    scaleY = lerpRange(sy0, sy1, t, rng);
  }

  let rotSpeed = scalarFromPrev(prev.rotSpeed, 0);
  if (s?.hasRotationSpeed || e?.hasRotationSpeed) {
    const r0 = s?.hasRotationSpeed ? s.rotationSpeed : rangeFromScalar(prev.rotSpeed ?? 0);
    const r1 = e?.hasRotationSpeed ? e.rotationSpeed : r0;
    rotSpeed = lerpRange(r0, r1, t, rng);
  }

  // Prefer this keyframe's texture, else preserve the particle's current one
  // (NFX spec: omitted textureID inherits). No smoke-'16' fallback — a particle
  // that truly never declares a texture is skipped at render time instead.
  const tex = pickTextureId(s, rng) || pickTextureId(e, rng);
  const textureId = tex?.raw ?? prev.textureId ?? null;

  let bright = prev.bright ?? false;
  if (s?.hasBright) bright = s.bright;
  else if (e?.hasBright) bright = e.bright;

  return { color, alpha, scale, scaleY, rotSpeed, textureId, bright };
}

function isLoopingDuration(d) {
  return d >= 999999 || d >= 9999999;
}

function buildKeyframeTimeline(keyframes) {
  if (!keyframes.length) {
    return [{
      duration: { min: 1, max: 1, isRange: false },
      particleStart: null,
      particleEnd: null,
      ray: null,
      circle: null,
    }];
  }
  return keyframes;
}

function spawnOffset(emitter, rng) {
  const o = emitter.offset;
  if (Array.isArray(o)) return vec3(o[0], o[1], o[2]);
  return vec3();
}

function normalizeDir(dir) {
  const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
  return { x: dir.x / len, y: dir.y / len, z: dir.z / len };
}

/** Emitter Ray.length — spawn offset along direction. */
function applyEmitterRayOffset(ray, rng) {
  if (!ray?.length) return vec3();
  const dir = sampleVec(ray.direction, rng);
  const nd = normalizeDir(dir);
  const dist = sampleRange(ray.length, rng);
  return { x: nd.x * dist, y: nd.y * dist, z: nd.z * dist };
}

/** Keyframe / motion Ray — initial or ongoing velocity. */
function applyRayVelocity(ray, rng) {
  if (!ray) return vec3(0, 0, 1);
  const dir = sampleVec(ray.direction, rng);
  const nd = normalizeDir(dir);
  const speed = ray.speed
    ? sampleRange(ray.speed, rng)
    : (ray.length ? sampleRange(ray.length, rng) : 0);
  return { x: nd.x * speed, y: nd.y * speed, z: nd.z * speed };
}

function applyCircleOffset(circle, rng) {
  if (!circle) return vec3();
  const r = sampleRange(circle.radius, rng);
  const axis = sampleVec(circle.axis, rng) || vec3(0, 1, 0);
  const ax = normalizeDir(axis);
  const angle = rng() * Math.PI * 2;
  let ux = 1; let uy = 0; let uz = 0;
  if (Math.abs(ax.y) > 0.99) { ux = 0; uy = 0; uz = 1; }
  const px = uy * ax.z - uz * ax.y;
  const py = uz * ax.x - ux * ax.z;
  const pz = ux * ax.y - uy * ax.x;
  const pl = Math.hypot(px, py, pz) || 1;
  const qx = (py * ax.z - pz * ax.y) / pl;
  const qy = (pz * ax.x - px * ax.z) / pl;
  const qz = (px * ax.y - py * ax.x) / pl;
  return {
    x: (px / pl * Math.cos(angle) + qx * Math.sin(angle)) * r,
    y: (py / pl * Math.cos(angle) + qy * Math.sin(angle)) * r,
    z: (pz / pl * Math.cos(angle) + qz * Math.sin(angle)) * r,
  };
}

/** First textureID declared anywhere in a timeline (used as the system default). */
function firstDeclaredTextureId(timeline) {
  for (const kf of timeline) {
    for (const info of [kf?.particleStart, kf?.particleEnd]) {
      if (info?.textureIDs?.length) return info.textureIDs[0].raw;
      if (info?.textureID?.raw) return info.textureID.raw;
    }
  }
  return null;
}

/** Parse a Decal heading string ("0,1,0" or "H0,1,0") into a surface normal. */
function headingNormal(heading) {
  if (!heading) return vec3(0, 1, 0);
  const stripped = String(heading).replace(/^H/i, '');
  const v = parseVectorRange(stripped)?.start;
  if (!v) return vec3(0, 1, 0);
  return normalizeDir(vec3(v[0], v[1], v[2]));
}

function buildSystemFromParticle(ch) {
  const em = ch.emitter;
  const timeline = buildKeyframeTimeline(ch.keyframes.length ? ch.keyframes : em.keyframes);
  const emitterRays = em.shapes?.filter((s) => s.tag === 'Ray') ?? [];
  const emitterCircles = em.shapes?.filter((s) => s.tag === 'Circle') ?? [];
  return {
    type: ch.type,
    bright: ch.bright,
    heading: ch.heading,
    decalNormal: ch.type === 'Decal' ? headingNormal(ch.heading) : null,
    defaultTextureId: firstDeclaredTextureId(timeline),
    emitter: em,
    timeline,
    emitterRays,
    emitterCircles,
    age: 0,
    emitAccumulator: 0,
    startDelay: em.startDelay?.min ?? 0,
    duration: em.duration?.min ?? 1,
    looping: isLoopingDuration(em.duration?.min ?? 0)
      || em.loopingKeyframes
      || em.continuousFire,
    particlesPerSecond: em.particlesPerSecond,
    numberPerEmission: em.numberPerEmission,
    offset: vec3(),
    particles: [],
  };
}

const DEFAULT_TRAIL_SPACING = 1.0;

function colorObj(c) {
  return c ? { r: c.r, g: c.g, b: c.b } : { r: 1, g: 1, b: 1 };
}

/** Two unit vectors perpendicular to `dir` (for jiggle / ribbon spread). */
function perpBasis(dir) {
  const n = normalizeDir(dir);
  let ref = vec3(0, 1, 0);
  if (Math.abs(n.y) > 0.99) ref = vec3(1, 0, 0);
  let ux = ref.y * n.z - ref.z * n.y;
  let uy = ref.z * n.x - ref.x * n.z;
  let uz = ref.x * n.y - ref.y * n.x;
  const ul = Math.hypot(ux, uy, uz) || 1;
  ux /= ul; uy /= ul; uz /= ul;
  const vx = n.y * uz - n.z * uy;
  const vy = n.z * ux - n.x * uz;
  const vz = n.x * uy - n.y * ux;
  return { u: vec3(ux, uy, uz), v: vec3(vx, vy, vz) };
}

/**
 * Build a static Trail ribbon. Trails follow a moving owner in-game; the preview
 * has no body motion, so we lay the ribbon out along a fixed axis as a readable
 * swatch showing its texture, colour gradient, taper and alpha falloff.
 */
function buildTrailSystem(node) {
  const links = Math.min(64, Math.max(2, node.numberOfLinks));
  const tex = node.textureIDs?.[0]?.raw ?? null;
  const c0 = colorObj(node.colorStart);
  const c1 = colorObj(node.colorEnd ?? node.colorStart);
  const segments = [];
  for (let i = 0; i < links - 1; i++) {
    const t0 = i / (links - 1);
    const t1 = (i + 1) / (links - 1);
    segments.push({
      x0: 0, y0: 0, z0: -i * DEFAULT_TRAIL_SPACING,
      x1: 0, y1: 0, z1: -(i + 1) * DEFAULT_TRAIL_SPACING,
      w0: node.scaleStart + (node.scaleEnd - node.scaleStart) * t0,
      w1: node.scaleStart + (node.scaleEnd - node.scaleStart) * t1,
      c0: lerpColor(c0, c1, t0),
      c1: lerpColor(c0, c1, t1),
      a0: (node.alphaStart + (node.alphaEnd - node.alphaStart) * t0) / 255,
      a1: (node.alphaStart + (node.alphaEnd - node.alphaStart) * t1) / 255,
      textureId: tex,
      bright: node.bright,
    });
  }
  return { kind: 'Trail', segments: tex ? segments : [] };
}

const DEFAULT_BOLT_TARGET = [0, 5, 0];

function buildLightningSystem(node) {
  return {
    kind: 'Lightning',
    cfg: node,
    age: 0,
    regenTimer: 0,
    segments: [],
  };
}

/** Regenerate a lightning bolt's jagged polyline (main bolt + optional forks). */
function generateBolt(sys, rng) {
  const cfg = sys.cfg;
  const start = cfg.startOffset
    ? vec3(cfg.startOffset[0], cfg.startOffset[1], cfg.startOffset[2])
    : vec3();
  const tv = cfg.targetVec ?? DEFAULT_BOLT_TARGET;
  const end = vec3(start.x + tv[0], start.y + tv[1], start.z + tv[2]);
  const dir = vec3(end.x - start.x, end.y - start.y, end.z - start.z);
  const length = Math.hypot(dir.x, dir.y, dir.z) || 1;
  const N = Math.min(48, Math.max(4, Math.round(cfg.linksPerMeter * length)));
  const { u, v } = perpBasis(dir);
  const width = Math.max(0.02, cfg.scale);
  const color = colorObj(cfg.color);
  const alpha = cfg.alpha / 255;

  const points = [];
  for (let k = 0; k <= N; k++) {
    const t = k / N;
    const bx = start.x + dir.x * t;
    const by = start.y + dir.y * t;
    const bz = start.z + dir.z * t;
    // no jiggle at the two endpoints
    const j = (k === 0 || k === N) ? 0 : sampleRange(cfg.jiggleRadius, rng);
    const ang = rng() * Math.PI * 2;
    const off = j * (k === 0 || k === N ? 0 : 1);
    points.push({
      x: bx + (u.x * Math.cos(ang) + v.x * Math.sin(ang)) * off,
      y: by + (u.y * Math.cos(ang) + v.y * Math.sin(ang)) * off,
      z: bz + (u.z * Math.cos(ang) + v.z * Math.sin(ang)) * off,
    });
  }

  const tex = cfg.textureID?.raw ?? null;
  const segments = [];
  const pushChain = (pts, w) => {
    for (let i = 0; i < pts.length - 1; i++) {
      segments.push({
        x0: pts[i].x, y0: pts[i].y, z0: pts[i].z,
        x1: pts[i + 1].x, y1: pts[i + 1].y, z1: pts[i + 1].z,
        w0: w, w1: w, c0: color, c1: color, a0: alpha, a1: alpha,
        textureId: tex, bright: cfg.bright,
      });
    }
  };
  pushChain(points, width);

  // Optional forks branching off interior points.
  if (cfg.forked && cfg.forkChance > 0) {
    for (let i = 1; i < points.length - 1; i++) {
      if (rng() < cfg.forkChance) {
        const forkLen = length * cfg.forkScale;
        const fdir = normalizeDir(vec3(
          dir.x + (rng() - 0.5) * length,
          dir.y + (rng() - 0.5) * length,
          dir.z + (rng() - 0.5) * length,
        ));
        const fpts = [points[i]];
        const steps = 3;
        for (let s = 1; s <= steps; s++) {
          const d = (forkLen * s) / steps;
          fpts.push(vec3(
            points[i].x + fdir.x * d,
            points[i].y + fdir.y * d,
            points[i].z + fdir.z * d,
          ));
        }
        pushChain(fpts, width * 0.6);
      }
    }
  }
  // Bolts frequently omit textureID (engine uses a built-in beam); render anyway.
  return segments;
}

/**
 * Create simulation state for one NDSpecialFX block.
 * @param {object} specialFx parsed block
 * @param {() => number} [rng]
 */
export function createVfxSimulation(specialFx, rng = Math.random) {
  const systems = collectParticleNodes(specialFx).map((ch) => {
    const sys = buildSystemFromParticle(ch);
    sys.offset = spawnOffset(sys.emitter, rng);
    return sys;
  });
  const trails = collectTrailNodes(specialFx).map(buildTrailSystem);
  const lightning = collectLightningNodes(specialFx).map(buildLightningSystem);
  return {
    systems: systems.slice(0, MAX_SYSTEMS),
    trails,
    lightning,
    time: 0,
    rng,
  };
}

function spawnParticle(system, rng) {
  const kf = system.timeline[0];
  const pos = vec3(system.offset.x, system.offset.y, system.offset.z);

  const circle = kf?.circle || system.emitterCircles[0];
  const emitterRay = system.emitterRays[0];
  const kfRay = kf?.ray;

  const cOff = applyCircleOffset(circle, rng);
  pos.x += cOff.x; pos.y += cOff.y; pos.z += cOff.z;

  const rayOff = applyEmitterRayOffset(emitterRay, rng);
  pos.x += rayOff.x; pos.y += rayOff.y; pos.z += rayOff.z;

  let vel = applyRayVelocity(kfRay, rng);
  if (!kfRay && emitterRay && !emitterRay.length) {
    vel = applyRayVelocity(emitterRay, rng);
  }
  if ((system.type === 'CenterBeam' || system.type === 'Beam')
      && Math.hypot(vel.x, vel.y, vel.z) < 0.01 && emitterRay) {
    vel = applyRayVelocity({ ...emitterRay, speed: { min: 1, max: 1, isRange: false } }, rng);
  }

  const state = interpParticleState(kf, 0, rng, { textureId: system.defaultTextureId });
  const rotRaw = kf?.particleStart?.rotationRaw;
  const rotation = rotRaw ? parseRotation(rotRaw, rng) : 0;
  const life = Math.max(0.05, sampleRange(kf.duration, rng));

  return {
    x: pos.x, y: pos.y, z: pos.z,
    vx: vel.x, vy: vel.y, vz: vel.z,
    age: 0,
    life,
    kfIndex: 0,
    kfT: 0,
    rotation,
    rotSpeed: state.rotSpeed,
    bright: state.bright || system.bright,
    ...state,
    alive: true,
  };
}

function advanceParticleKeyframes(p, system, dt, rng = Math.random) {
  p.age += dt;
  if (p.age >= p.life) {
    p.alive = false;
    return;
  }
  let remaining = dt;
  while (remaining > 0 && p.kfIndex < system.timeline.length) {
    const kf = system.timeline[p.kfIndex];
    const segDur = Math.max(0.001, sampleRange(kf.duration, () => 0.5));
    const need = segDur - p.kfT;
    const step = Math.min(remaining, need);
    p.kfT += step;
    remaining -= step;
    const t = Math.min(1, p.kfT / segDur);
    const st = interpParticleState(kf, t, rng, p);
    Object.assign(p, st);
    p.bright = st.bright || system.bright;

    const ray = kf.ray;
    if (ray?.acceleration?.start) {
      const acc = sampleVec(ray.acceleration, () => 0.5);
      p.vx += acc.x * step;
      p.vy += acc.y * step;
      p.vz += acc.z * step;
    }
    if (p.kfT >= segDur) {
      p.kfIndex++;
      p.kfT = 0;
      if (p.kfIndex >= system.timeline.length) {
        if (system.looping) p.kfIndex = 0;
        else p.alive = false;
      }
    }
  }
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.z += p.vz * dt;
  p.rotation += p.rotSpeed * dt;
}

/**
 * Advance simulation by dt seconds.
 * @param {ReturnType<typeof createVfxSimulation>} sim
 * @param {number} dt
 */
export function tickSimulation(sim, dt) {
  sim.time += dt;

  for (const lt of sim.lightning ?? []) {
    lt.age += dt;
    const cfg = lt.cfg;
    const active = lt.age >= cfg.startDelay && lt.age <= cfg.startDelay + cfg.duration;
    if (!active) { lt.segments = []; continue; }
    lt.regenTimer -= dt;
    if (lt.regenTimer <= 0 || lt.segments.length === 0) {
      lt.segments = generateBolt(lt, sim.rng);
      lt.regenTimer = Math.max(0.01, cfg.changeTime);
    }
  }

  for (const system of sim.systems) {
    system.age += dt;
    if (system.age < system.startDelay) continue;

    const elapsed = system.age - system.startDelay;
    if (!system.looping && elapsed > system.duration) continue;

    const rate = Math.max(0.001, sampleRange(system.particlesPerSecond, sim.rng));
    system.emitAccumulator += rate * dt;
    while (system.emitAccumulator >= 1) {
      const batch = Math.max(1, Math.round(sampleRange(system.numberPerEmission, sim.rng)));
      for (let i = 0; i < batch; i++) {
        if (system.particles.filter((p) => p.alive).length >= MAX_PARTICLES_PER_SYSTEM) break;
        system.particles.push(spawnParticle(system, sim.rng));
      }
      system.emitAccumulator -= 1;
    }

    for (const p of system.particles) {
      if (p.alive) advanceParticleKeyframes(p, system, dt, sim.rng);
    }
    if (system.particles.length > MAX_PARTICLES_PER_SYSTEM * 2) {
      system.particles = system.particles.filter((p) => p.alive).slice(-MAX_PARTICLES_PER_SYSTEM);
    }
  }
}

/** Flatten live particles for rendering. */
export function getLiveParticles(sim) {
  const out = [];
  for (let si = 0; si < sim.systems.length; si++) {
    const system = sim.systems[si];
    for (const p of system.particles) {
      if (!p.alive || p.alpha <= 0.01 || !p.textureId) continue;
      // orient: 0 = camera-facing (Billboard), 1 = velocity-aligned
      // (Kite/CenterBeam/Beam), 2 = fixed surface plane (Decal).
      let orient = 1;
      if (system.type === 'Billboard') orient = 0;
      else if (system.type === 'Decal') orient = 2;
      out.push({
        systemIndex: si,
        bright: p.bright ?? system.bright,
        heading: system.heading,
        type: system.type,
        orient,
        normal: system.decalNormal,
        x: p.x, y: p.y, z: p.z,
        vx: p.vx, vy: p.vy, vz: p.vz,
        scale: p.scale,
        scaleY: p.scaleY,
        rotation: p.rotation,
        alpha: p.alpha,
        color: p.color,
        textureId: p.textureId,
      });
    }
  }
  return out;
}

/** Flatten trail + lightning ribbon segments for rendering. */
export function getLiveStrips(sim) {
  const out = [];
  for (const t of sim.trails ?? []) {
    for (const seg of t.segments) out.push(seg);
  }
  for (const lt of sim.lightning ?? []) {
    for (const seg of lt.segments) out.push(seg);
  }
  return out;
}

export function resetSimulation(sim) {
  sim.time = 0;
  for (const system of sim.systems) {
    system.age = 0;
    system.emitAccumulator = 0;
    system.particles = [];
  }
  for (const lt of sim.lightning ?? []) {
    lt.age = 0;
    lt.regenTimer = 0;
    lt.segments = [];
  }
}
