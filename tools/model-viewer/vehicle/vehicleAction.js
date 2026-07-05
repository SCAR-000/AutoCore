// vehicleAction.js — AA's custom layer over the Havok vehicle framework.
// Port of VehicleAction (ctor 0x597f90, RTTI .?AVVehicleAction@@):
//   applyAction @ 0x598650  — input ramps, drives tickSubsystems
//   calcWheelTorque @ 0x598040 — engine torque per wheel (replaces hkDefaultEngine)
//   torque curve shape @ 0x4a9750 (4-breakpoint piecewise, RE-confirmed shape)
//   airStabilization @ 0x598320 — post-collision windowed damping + air stab
// Also the play.html-facing facade (same surface as the old VehicleController).

import { Vec3, Quat } from './hkMath.js';
import { hkRigidBody } from './hkRigidBody.js';
import { hkVehicleFramework } from './hkVehicleFramework.js';
import { hkDefaultWheels } from './hkDefaultWheels.js';
import {
  hkDriverInput, hkDefaultSteering, hkDefaultTransmission,
  hkDefaultBrake, hkDefaultSuspension, hkDefaultAerodynamics,
  hkAngularVelocityDamper,
} from './hkComponents.js';
import { buildDescriptors } from './vehicleData.js';

// AA constants (all read from the binary — addresses inline)
const THROTTLE_RAMP_RATE = 2.0;     // DAT_00a10e74
const THROTTLE_RAMP_SCALE = 2.857;  // VehicleAction+0x20 init (DAT_009d54e0)
const STEER_STEP_PER_TICK = 0.05;   // DAT_00a10e78 (fixed step per tick, not ×dt)
const STEER_SPEED_NORM = 20.0;      // DAT_00af3388 (CORRECTED: 20 m/s, not 0.6)
const SOFT_STEER_SCALE = 0.6;       // DAT_00af3384 (applyAction @ 0x598ac1) — A/D soft steer
const LOWSPEED_BOOST_THRESHOLD = 15.0; // DAT_00aaa7a4
const LOWSPEED_BOOST_FACTOR = 0.2;  // DAT_00a0f70c
const UPRIGHT_THRESHOLD = 0.8;      // DAT_00a0f698
const TORQUE_CLAMP = 1000.0;        // DAT_00a0f520
const COLLISION_DAMP_WINDOW = 6.4;  // 6400 ms (DAT_00b041cc = GetTickCount, CORRECTED units)
const COLLISION_DAMP_BASE = 10.0;   // DAT_00a110d8
const MAX_TILT = 30 * Math.PI / 180; // hard tilt cap — the player vehicle can
// never lean more than 30° from upright (grounded or airborne), so flipping is
// impossible. Retail-consistent: the friction solver already has near-zero
// roll/pitch authority (RVSpinTorque) and the client carries an upright-
// correction block (applyAction else-branch, thresholds 0.7/0.35 up-dot).

const _v1 = new Vec3(), _v2 = new Vec3();

// @ 0x4a9750 VehicleEngine::torqueCurve2D — ported as the continuous
// 4-breakpoint curve (the client quantises to a byte LUT; same shape).
class EngineCurve {
  constructor(d) { this.d = d; }
  torqueFactor(rpm) {
    const d = this.d;
    if (rpm <= d.minimumRPM) return d.minTorqueFactor;
    if (rpm < d.optimumRPMMin) {
      const t = (rpm - d.minimumRPM) / (d.optimumRPMMin - d.minimumRPM);
      return d.minTorqueFactor + (d.maxTorqueFactor - d.minTorqueFactor) * t;
    }
    if (rpm <= d.optimumRPMMax) return d.maxTorqueFactor;
    if (rpm < d.maximumRPMMax) {
      const t = (rpm - d.optimumRPMMax) / (d.maximumRPMMax - d.optimumRPMMax);
      return d.maxTorqueFactor + (d.minTorqueFactor - d.maxTorqueFactor) * t;
    }
    return 0; // past redline the engine produces nothing (rev limiter)
  }
  resistance(rpm) {
    const d = this.d;
    if (rpm <= d.minimumRPM) return d.minimumResistance;
    if (rpm <= d.optimumRPMMax) return d.optimumResistance;
    return d.maximumResistance;
  }
  torque(rpm, throttle) {
    if (throttle > 0) return this.torqueFactor(rpm) * this.d.torqueMax * throttle;
    return -this.resistance(rpm) * this.d.torqueMax * 0.1; // engine braking
  }
}

export class VehicleAction {
  constructor(entry) {
    this.entry = entry;
    const desc = buildDescriptors(entry);
    this.desc = desc;

    // chassis inertia: solid box from hardpoint spread × RVInertia scalars
    // (initFromDescriptor 0x64b2b0: invI = 1/((|R|·scalar)·mass), diag here)
    const hp = desc.suspension.hardpoints;
    let ex = 0.5, ey = 0.5, ez = 0.5;
    for (const p of hp) {
      ex = Math.max(ex, Math.abs(p.x));
      ez = Math.max(ez, Math.abs(p.z));
    }
    ey = Math.max(0.5, (ex + ez) * 0.25);
    const m = desc.chassis.mass;
    const s = desc.chassis.inertiaScalars;
    const Ix = (m / 12) * (4 * ey * ey + 4 * ez * ez) * (s.pitch || 1); // about X (pitch)
    const Iy = (m / 12) * (4 * ex * ex + 4 * ez * ez) * (s.yaw || 1);   // about Y (yaw)
    const Iz = (m / 12) * (4 * ex * ex + 4 * ey * ey) * (s.roll || 1);  // about Z (roll)
    // solver inertia (fw+0x320, initFromDescriptor 0x64b2b0): per-axis ratio
    // RVSpinTorque/RVInertia — the friction solver's angular authority. This is
    // the game's anti-rollover: SpinTorqueRoll/Pitch are tiny fleet-wide.
    const st = desc.chassis.spinTorqueScalars;
    const body = new hkRigidBody({
      mass: m,
      invInertiaLocal: new Vec3(1 / Ix, 1 / Iy, 1 / Iz),
      // solverInvI = boxInvI × (ST/I) = (s/Ix)(st/s) = st/Ix  per axis
      solverInvInertiaLocal: new Vec3(
        (st.pitch || 0) / Ix,
        (st.yaw || 0) / Iy,
        (st.roll || 0) / Iz,
      ),
    });

    const wheels = new hkDefaultWheels(desc.wheels);
    this.fw = new hkVehicleFramework({
      body,
      wheels,
      driverInput: new hkDriverInput(),
      steering: new hkDefaultSteering(desc.steering),
      transmission: new hkDefaultTransmission(desc.transmission),
      brake: new hkDefaultBrake(desc.brake),
      suspension: new hkDefaultSuspension(desc.suspension),
      aerodynamics: new hkDefaultAerodynamics(desc.aerodynamics),
      damper: new hkAngularVelocityDamper(desc.damper),
      extraTorqueFactor: desc.aa.extraTorqueFactor,
    });
    this.engine = new EngineCurve(desc.engine);

    // VehicleAction state. (No boost state: boost is server-driven in AA —
    // the applyAction timer block at this+0x30/0x34 is gated on entity flags
    // the server sets, never on a client control. Out of scope for the demo.)
    this.currentThrottle = 0;   // this+0x24 (ramped −1..+1 axis)
    this.currentSteer = 0;      // this+0x28
    this.collisionDampTimer = 0; // airStabilization window (seconds; was 6400 ms)

    // ---- play.html facade ----
    this.chassis = body;                     // .position/.orientation compatible
    this.suspension = { wheels: wheels.wheel.map((w, i) => ({
      _w: w, _i: i,
      hardPoint: desc.suspension.hardpoints[i],
      radius: desc.wheels.radius[i],
      width: desc.wheels.width[i],
      suspensionLength: desc.suspension.lengths[i],
      isFront: i < 2,
      get steerAngle() { return this._parent.fw.steering.wheelsSteeringAngle[this._i]; },
      get compression() { return this._parent.desc.suspension.lengths[this._i] - this._w.currentLength; },
      get wheelAngularVel() { return this._w.spinVelocity; },
      get isInContact() { return this._w.inContact; },
      get suspensionForce() { return this._parent.fw.suspension.forces[this._i]; },
    })) };
    for (const w of this.suspension.wheels) w._parent = this;
    Object.defineProperty(this.suspension, 'groundedCount', {
      get: () => wheels.wheel.reduce((n, w) => n + (w.inContact ? 1 : 0), 0),
    });
  }

  setTerrain(fn) { this.fw.setTerrain(fn); }

  reset(pos, quat) {
    const b = this.fw.body;
    b.position.set(pos.x, pos.y, pos.z);
    b.orientation.set(quat?.x || 0, quat?.y || 0, quat?.z || 0, quat?.w ?? 1);
    b.linearVelocity.set(0, 0, 0);
    b.angularVelocity.set(0, 0, 0);
    b.syncRotation();
    this.currentThrottle = 0;
    this.currentSteer = 0;
    this.fw.transmission.currentGear = 0;
    this.fw.transmission.clutchDelayActive = false;
    for (const w of this.fw.wheels.wheel) { w.spinVelocity = 0; w.forwardSlipVel = 0; }
  }

  // @ 0x598650 mode-0x02 input processing
  _processInput(dt, input) {
    const di = this.fw.driverInput;
    // throttle axis target: +1 forward, −1 reverse/brake
    let target = 0;
    if (input.forward) target = 1;
    else if (input.backward) target = -1;
    // ramp (this+0x20 × dt × rate; rate 2.0 when moving toward the target range)
    const diff = target - this.currentThrottle;
    if (diff !== 0) {
      let step = THROTTLE_RAMP_SCALE * dt * THROTTLE_RAMP_RATE;
      if (Math.abs(diff) < step) step = Math.abs(diff);
      this.currentThrottle += Math.sign(diff) * step;
      this.currentThrottle = Math.max(-1, Math.min(1, this.currentThrottle));
    }

    const speed = this.fw.body.linearVelocity.length();
    const fwd = this.fw.body.R.rotate(this.fw.axes.forward, _v1);
    const fwdSpeed = this.fw.body.linearVelocity.dot(fwd);

    // throttle / brake / reverse split (AA: S brakes while rolling forward)
    if (this.currentThrottle >= 0) {
      di.throttle = this.currentThrottle;
      di.brakePedal = 0;
      di.reverse = false;
    } else if (fwdSpeed > 0.5) {
      di.throttle = 0;
      di.brakePedal = -this.currentThrottle;
      di.reverse = false;
    } else {
      di.throttle = -this.currentThrottle;
      di.brakePedal = 0;
      di.reverse = true;
    }
    di.handbrake = !!input.handbrake;
    if (input.handbrake) di.brakePedal = Math.max(di.brakePedal, 1);

    // Two steering states (binding names "Steer Left/Right Soft" @ 0xa853c4 and
    // "Steer Left/Right" @ 0xa853e8):
    //   A/D  = soft: final steering × 0.6 (DAT_00af3384 @ applyAction 0x598ac1)
    //   Q/E  = sharp: full deflection + input byte entity+0x61c set, which cuts
    //          rear traction ×0.5 in calcWheelTorque (drift-assist tight turn)
    let steerAxis = 0;
    let sharp = false;
    if (input.sharpLeft) { steerAxis = 1; sharp = true; }
    else if (input.sharpRight) { steerAxis = -1; sharp = true; }
    else if (input.left) steerAxis = 1;
    else if (input.right) steerAxis = -1;
    this.sharpTurn = sharp;                       // → entity+0x61c equivalent
    const speedFactor = Math.min(speed / STEER_SPEED_NORM, 1.0);
    const steerTarget = Math.max(-1, Math.min(1, steerAxis * Math.max(speedFactor, 0.35)));
    if (steerTarget !== this.currentSteer) {
      this.currentSteer += Math.sign(steerTarget - this.currentSteer) * STEER_STEP_PER_TICK;
      if (Math.abs(steerTarget - this.currentSteer) < STEER_STEP_PER_TICK) {
        this.currentSteer = steerTarget;
      }
      this.currentSteer = Math.max(-1, Math.min(1, this.currentSteer));
    }
    di.steering = this.currentSteer * (sharp ? 1.0 : SOFT_STEER_SCALE);
  }

  // @ 0x598040 calcWheelTorque — engine torque per wheel into wheels+0x28
  _calcWheelTorque(input) {
    const fw = this.fw;
    const up = fw.body.R.rotate(fw.axes.up, _v1);
    const uprightDot = Math.abs(up.y);
    let upright = 1.0;
    if (uprightDot < UPRIGHT_THRESHOLD) upright = Math.pow(uprightDot / UPRIGHT_THRESHOLD, 2);
    const speed = fw.body.linearVelocity.length();
    const rpm = Math.max(fw.transmission.rpm, this.desc.engine.minimumRPM);
    let allAirborne = true;
    for (let i = 0; i < fw.wheels.count; i++) {
      const w = fw.wheels.wheel[i];
      if (!w.inContact) { w.engineTorque = 0; continue; }
      allAirborne = false;
      // curve factor × TorqueMax × throttle (reverse sign comes from the
      // transmission's negative reverse ratio, matching the client's [0,1000] clamp)
      const throttle = fw.driverInput.throttle;
      let mu = fw.wheels.friction[i];
      if (speed < LOWSPEED_BOOST_THRESHOLD) {
        mu *= (LOWSPEED_BOOST_THRESHOLD - speed) * LOWSPEED_BOOST_FACTOR + 1;
      }
      let torque = mu * upright * this.engine.torqueFactor(rpm) * this.desc.engine.torqueMax * throttle;
      if (this.sharpTurn && i >= 2) torque *= 0.5; // entity+0x61c: sharp-turn rear traction cut
      torque = Math.max(0, Math.min(TORQUE_CLAMP, torque));  // client clamp [0, 1000]
      w.engineTorque = torque;
    }
    this.allWheelsAirborne = allAirborne;
  }

  // @ 0x598320 airStabilization — AA extra damping layered over the hk AVD
  _airStabilization(dt) {
    const fw = this.fw;
    const w = fw.body.angularVelocity;
    const speed2 = fw.body.linearVelocity.lengthSq();
    // post-collision window: strong additive damping for 6.4 s after a hard hit
    if (this._lastSpeed !== undefined) {
      const dv = Math.abs(Math.sqrt(speed2) - this._lastSpeed);
      if (dv > (this.desc.damper.collisionThreshold || 5) && dv / dt > 20) {
        this.collisionDampTimer = COLLISION_DAMP_WINDOW;
      }
    }
    this._lastSpeed = Math.sqrt(speed2);
    if (this.collisionDampTimer > 0) {
      this.collisionDampTimer -= dt;
      const k = COLLISION_DAMP_BASE + (this.desc.damper.collisionSpinDamping || 0);
      const f = Math.max(0, 1 - k * dt);
      w.scale(f);
    }
    // airborne stabilization (RVExtraAngularImpulse — old-RE inference, flagged)
    if (this.allWheelsAirborne && this.desc.aa.extraAngularImpulse) {
      const k = this.desc.aa.extraAngularImpulse * dt;
      w.x *= Math.max(0, 1 - 15 * k);
      w.z *= Math.max(0, 1 - 15 * k);
      w.y *= Math.max(0, 1 - 6 * k);
    }
  }

  // speed governors — STILL-OPEN formula (doc: open items); v1 approximation,
  // symmetric so reverse cannot run away either (reverse is naturally slower
  // via the rev limiter and reverse gear ratio).
  _governors() {
    const b = this.fw.body;
    const limit = this.desc.aa.absoluteTopSpeed || 0;
    if (limit > 0) {
      const fwd = b.R.rotate(this.fw.axes.forward, _v2);
      const fs = b.linearVelocity.dot(fwd);
      if (fs > limit) b.linearVelocity.addScaled(fwd, limit - fs);
      else if (fs < -limit) b.linearVelocity.addScaled(fwd, -limit - fs);
    }
  }

  // Hard 30° tilt cap: rotate the body back to the cone boundary and remove
  // the tilt-increasing part of the angular velocity. Runs every step,
  // grounded or airborne — flipping is impossible by construction.
  _clampTilt() {
    const b = this.fw.body;
    const up = b.R.rotate(this.fw.axes.up, _v1);
    const cosTilt = Math.max(-1, Math.min(1, up.y));
    const tilt = Math.acos(cosTilt);
    if (tilt <= MAX_TILT) return;
    // rotation about axis = up × worldUp reduces tilt
    const axis = _v2.set(-up.z, 0, up.x); // = cross(up, (0,1,0))
    const len = axis.length();
    if (len < 1e-6) return; // fully inverted degenerate — cannot happen once capped
    axis.scale(1 / len);
    const q = new Quat().setFromAxisAngle(axis, tilt - MAX_TILT);
    q.multiply(b.orientation, b.orientation);
    b.orientation.normalize();
    b.syncRotation();
    // strip the angular-velocity component that keeps increasing tilt
    const a = b.angularVelocity.dot(axis);
    if (a < 0) b.angularVelocity.addScaled(axis, -a);
  }

  step(dt, input) {
    this._processInput(dt, input);
    this.fw.preUpdate(dt);
    this._calcWheelTorque(input);
    this.fw.tickComponents(dt);
    this.fw.postTick(dt);
    this._airStabilization(dt);
    this._governors();
    this.fw.body.integrate(dt);
    this._clampTilt();

    // anti-tunnel safety net (kept behind a flag; should stay silent — if it
    // fires, integration/suspension is wrong: see plan)
    if (VehicleAction.SAFETY_NET) {
      let deepest = 0;
      for (const w of this.fw.wheels.wheel) {
        const h = this.fw.terrainHeightFn(w.hardpointWorld.x, w.hardpointWorld.z);
        const depth = h - w.hardpointWorld.y;
        if (depth > deepest) deepest = depth;
      }
      if (deepest > 0) {
        this.safetyNetFired = (this.safetyNetFired || 0) + 1;
        this.fw.body.position.y += deepest;
        if (this.fw.body.linearVelocity.y < 0) this.fw.body.linearVelocity.y = 0;
      }
    }
  }

  getTelemetry() {
    const t = this.fw.transmission;
    const fwd = this.fw.body.R.rotate(this.fw.axes.forward, _v1);
    const speed = this.fw.body.linearVelocity.length();
    const rpm = Math.round(Math.max(t.rpm, this.desc.engine.minimumRPM));
    const maxRPM = this.desc.engine.maximumRPMMax || 6000;
    return {
      speed,
      speedMPH: Math.round(speed * 2.23694),
      forwardSpeed: this.fw.body.linearVelocity.dot(fwd),
      rpm,
      normalizedRPM: Math.min(1, rpm / maxRPM),
      gear: t.isReversing ? 'R' : t.currentGear + 1,
      reversing: t.isReversing,
      throttlePct: Math.round(this.currentThrottle * 100),
      steerDeg: Math.round(this.fw.steering.mainSteeringAngle * 180 / Math.PI),
      airborne: this.suspension.groundedCount === 0,
      grounded: this.suspension.groundedCount,
      pos: this.fw.body.position,
      safetyNetFired: this.safetyNetFired || 0,
    };
  }
}
VehicleAction.SAFETY_NET = true; // debug flag — expected to stay silent
