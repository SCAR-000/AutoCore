// hkFrictionSolver.js — port of hkVehicleFrictionSolver_solve @ 0x6c4450 and the
// friction-circle projection @ 0x6c3f90, specialised for a STATIC ground body
// (terrain heightfield; dynamic ground-body coupling not ported — play.html has
// no dynamic props). Model recovered from the decompile:
//
//   • exactly TWO pseudo contact points (front/rear axle aggregates)
//   • per-axle Jacobians vs the chassis: effMass = invMass + (r×d)·I⁻¹·(r×d) + ε,
//     forward direction additionally includes a wheel-spin inertia contribution
//   • the two axle SIDE constraints are solved as a coupled 2×2 system
//     (off-diagonal = J_frontSide · I⁻¹-weighted · J_rearSide)
//   • friction coefficient μ = clamp(base + slipSpeed×viscosity, 0, max)
//   • longitudinal impulse = drive impulse, friction-clamped to ±μ·N·dt
//   • friction circle: if (long/limit)² + (side/limit)² > 1 → iterative
//     relaxation projection (0x6c3f90, ≤16 steps) producing residual slip (skid)
//   • positional-friction gate: |v| ≥ maxVelocityForPositionalFriction disables
//     the "sticky" side impulse zeroing at rest
//
// Member-level constants marked TODO-verify are refined during feel-test
// (docs/vehicle-physics-port.md → open items).

import { Vec3 } from './hkMath.js';

const EPS = 1e-6; // DAT_00a0d2f4 role: effective-mass regulariser

export class AxleContact {
  constructor() {
    this.point = new Vec3();       // aggregated contact position (world)
    this.forward = new Vec3();     // aggregated forward dir (world, ground plane)
    this.side = new Vec3();        // aggregated side dir (world)
    this.normalForce = 0;          // Σ suspension force (N)
    this.driveForce = 0;           // Σ engineTorque/radius (AA layer input)
    this.longForce = 0;            // Σ (brakeTorque + transmissionRatioTorque)/radius
    this.spinVelAvg = 0;           // Σ spinVel×radius / count
    this.isFixed = false;          // any wheel locked (handbrake/block)
    this.friction = 0;             // μ base (axle-averaged)
    this.viscosityFriction = 0;
    this.maxFriction = 15.0;
    this.maxVelPositional = 2.0;   // maxVelocityForPositionalFriction — TODO-verify value
    this.wheelSpinInertia = 0;     // axleParams+0x54 — forward effMass extra term
    // outputs
    this.forwardImpulse = 0;
    this.sideImpulse = 0;
    this.forwardSlipVel = 0;
    this.sideSlipVel = 0;
    this.skid = 0;
  }
}

// κ = inverse effective mass along direction d at offset r
// (0x6c4450: Σ J·I⁻¹·J + invMass₁ + invMass₂ + ε; static ground contributes 0).
// Uses the SOLVER inverse inertia (fw+0x320 = RVSpinTorque/RVInertia ratios) —
// the friction solver never sees the body's real inertia.
function invEffMass(body, r, d, tmpA, tmpB) {
  const rxd = r.cross(d, tmpA);
  const iw = body.applyInvInertiaSolver(rxd, tmpB);
  return body.invMass + rxd.dot(iw) + EPS;
}

function relVelAlong(body, r, d, tmp) {
  // (v + w × r) · d
  const pv = body.angularVelocity.cross(r, tmp).add(body.linearVelocity);
  return pv.dot(d);
}

// @ 0x6c3f90 — friction-circle projection with relaxation; returns residual slip.
function frictionCircle(axle, dt) {
  const limF = Math.max(axle.forwardLimit, EPS);
  const limS = Math.max(axle.sideLimit, EPS);
  let nf = axle.forwardImpulse / limF;
  let ns = axle.sideImpulse / limS;
  const mag2 = nf * nf + ns * ns;
  if (mag2 < 1) { axle.skid = 0; return; }
  // client: iterative shrink (≤16 steps, coefficient table) then secant blend
  // back to the circle edge; analytically that converges to radial projection —
  // ported as radial projection + residual (TODO-verify vs table @ solve ESI).
  const mag = Math.sqrt(mag2);
  const scale = 1 / mag;
  const newF = axle.forwardImpulse * scale;
  const newS = axle.sideImpulse * scale;
  axle.forwardSlipVel += (axle.forwardImpulse - newF) * axle.kappaForward;
  axle.sideSlipVel += (axle.sideImpulse - newS) * axle.kappaSide;
  axle.forwardImpulse = newF;
  axle.sideImpulse = newS;
  axle.skid = Math.min(1, mag - 1);
}

const _r = [new Vec3(), new Vec3()];
const _tA = new Vec3(), _tB = new Vec3(), _tC = new Vec3();

export function solveFriction(body, axles, dt) {
  const n = axles.length; // always 2
  // --- per-axle setup ---
  for (let a = 0; a < n; a++) {
    const ax = axles[a];
    const r = _r[a].copy(ax.point).sub(body.position);
    ax._r = r;
    // κ (inverse effective mass); forward adds the wheel-spin inertia term
    ax.kappaForward = invEffMass(body, r, ax.forward, _tA, _tB) + ax.wheelSpinInertia;
    ax.kappaSide = invEffMass(body, r, ax.side, _tA, _tB);
    ax.effMassForward = 1 / ax.kappaForward;
    ax.effMassSide = 1 / ax.kappaSide;
    // longitudinal constraint acts on SLIP velocity: contact-point velocity
    // minus wheel surface speed (spinVel×radius aggregate). Rolling wheel → ~0;
    // locked wheel (spinVel 0) → full chassis speed → braking via friction clamp.
    ax.relVelForward = relVelAlong(body, r, ax.forward, _tA) - ax.spinVelAvg;
    ax.relVelSide = relVelAlong(body, r, ax.side, _tA);
    // POSITIONAL friction (0x6c4450: the positional terms are zeroed when
    // |v| ≥ maxVelocityForPositionalFriction — i.e. they only act at low speed):
    // below the threshold and without drive, the contact anchors to the ground
    // instead of rolling freely, so a resting car doesn't creep. Uses the plain
    // linear velocity (no angular lever arm) to avoid a rocking limit cycle.
    if (body.linearVelocity.length() < ax.maxVelPositional && ax.driveForce === 0) {
      ax.relVelForward = body.linearVelocity.dot(ax.forward);
    }

    // μ = clamp(base + slipSpeed×viscosity, 0, max)   (0x6c4450 mid-loop)
    let mu = ax.friction;
    if (ax.viscosityFriction !== 0) {
      const slipSpeed = Math.sqrt(ax.relVelForward * ax.relVelForward + ax.relVelSide * ax.relVelSide);
      mu = ax.friction + slipSpeed * ax.viscosityFriction;
      if (mu > ax.maxFriction) mu = ax.maxFriction;
      if (mu < 0) mu = 0;
    }
    const maxImpulse = mu * Math.abs(ax.normalForce) * dt;
    ax.forwardLimit = maxImpulse;
    ax.sideLimit = maxImpulse;
  }

  // --- coupled 2×2 side solve (front/rear share the chassis) ---
  const f = axles[0], r2 = axles[1];
  // off-diagonal: J_frontSide coupled through the chassis to J_rearSide
  const rxdF = f._r.cross(f.side, _tA);
  const iwF = body.applyInvInertiaSolver(rxdF, _tB);
  const rxdR = r2._r.cross(r2.side, _tC);
  const c = body.invMass * f.side.dot(r2.side) + iwF.dot(rxdR);
  // solve [κF c; c κR]·[jF; jR] = −[vF; vR]  (impulses zeroing both side vels)
  const det = f.kappaForward !== undefined
    ? f.kappaSide * r2.kappaSide - c * c
    : 0;
  if (Math.abs(det) > EPS * EPS) {
    const inv = 1 / det;
    f.sideImpulse = -(r2.kappaSide * f.relVelSide - c * r2.relVelSide) * inv;
    r2.sideImpulse = -(f.kappaSide * r2.relVelSide - c * f.relVelSide) * inv;
  } else {
    f.sideImpulse = -f.relVelSide * f.effMassSide;
    r2.sideImpulse = -r2.relVelSide * r2.effMassSide;
  }

  // --- longitudinal per axle ---
  for (let a = 0; a < n; a++) {
    const ax = axles[a];
    ax.forwardSlipVel = 0;
    ax.sideSlipVel = 0;
    // The zero-slip term carries a ×0.5 relaxation (0x6c4450 loop 3:
    // "(drive×0.5 + relVel)×0.5") — both axles see ~the full body effective
    // mass, so an unrelaxed solve double-corrects and ping-pongs at rest.
    if (ax.isFixed) {
      // locked wheels: no drive; zero-slip constraint, friction-clamped → skid
      ax.forwardImpulse = -ax.relVelForward * ax.effMassForward * 0.5;
    } else {
      // zero-slip constraint + drive impulse from the AA engine layer
      const driveImpulse = (ax.driveForce + ax.longForce) * dt;
      ax.forwardImpulse = -ax.relVelForward * ax.effMassForward * 0.5 + driveImpulse;
    }
    // friction clamp
    if (ax.forwardImpulse > ax.forwardLimit) {
      ax.forwardSlipVel = (ax.forwardImpulse - ax.forwardLimit) * ax.kappaForward;
      ax.forwardImpulse = ax.forwardLimit;
    } else if (ax.forwardImpulse < -ax.forwardLimit) {
      ax.forwardSlipVel = (ax.forwardImpulse + ax.forwardLimit) * ax.kappaForward;
      ax.forwardImpulse = -ax.forwardLimit;
    }
    frictionCircle(ax, dt);
  }

  // --- apply impulses to the chassis ---
  for (let a = 0; a < n; a++) {
    const ax = axles[a];
    const imp = _tA.set(0, 0, 0)
      .addScaled(ax.forward, ax.forwardImpulse)
      .addScaled(ax.side, ax.sideImpulse);
    body.applyImpulseAtSolver(imp, ax.point); // tire impulses use solver inertia
    ax.sideSlipVel += ax.relVelSide + ax.sideImpulse * ax.kappaSide; // residual after clamp
  }
}
