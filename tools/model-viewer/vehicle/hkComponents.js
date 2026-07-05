// hkComponents.js — verbatim ports of the small Havok vehicle components
// recovered from autoassault.exe (see docs/vehicle-physics-port.md "RE v2").
// Every update() matches the decompiled vtable-slot+0x14 method of its class.
// Component tick order (VehicleAction_tickSubsystems @ 0x636a60):
//   input → steering → collide → transmission → brake → suspension → aero,
// then framework post-tick (force application + friction solve).

import { Vec3 } from './hkMath.js';

// ---------------------------------------------------------------------------
// driver input (fw+0x14): plain data holder written by the AA layer
// (VehicleAction_applyAction @ 0x598650 writes +0x1c throttle; steering via
// setter 0x636410; brake/handbrake/reverse fields read by brake/transmission).
export class hkDriverInput {
  constructor() {
    this.brakePedal = 0;      // +0x10
    this.steering = 0;        // +0x14 (−1..+1, already speed-factored + ramped)
    this.handbrake = false;   // +0x18
    this.reverse = false;     // +0x19
    this.throttle = 0;        // +0x1c (0..1)
  }
  update() {}
}

// ---------------------------------------------------------------------------
// @ 0x64f840 hkDefaultSteering::update
export class hkDefaultSteering {
  constructor(desc) {
    this.maxSteeringAngle = desc.maxSteeringAngle;                   // +0x24
    this.maxSpeedFullSteeringAngle = desc.maxSpeedFullSteeringAngle; // +0x28
    this.wheelsDoesSteer = desc.wheelsDoesSteer.slice();             // +0x2c[]
    this.mainSteeringAngle = 0;                                      // +0x10
    this.wheelsSteeringAngle = new Array(desc.wheelsDoesSteer.length).fill(0); // +0x14[]
  }
  update(dt, fw) {
    let angle = this.maxSteeringAngle * fw.driverInput.steering;
    const fwd = fw.body.R.rotate(fw.axes.forward, fw._steerTmp);
    const speed = fw.body.linearVelocity.dot(fwd);   // signed forward speed
    if (speed >= this.maxSpeedFullSteeringAngle) {
      const r = this.maxSpeedFullSteeringAngle / speed;
      angle *= r * r;                                // INVERSE-SQUARED falloff
    }
    this.mainSteeringAngle = angle;
    for (let i = 0; i < this.wheelsSteeringAngle.length; i++) {
      this.wheelsSteeringAngle[i] = this.wheelsDoesSteer[i] ? angle : 0;
    }
  }
}

// ---------------------------------------------------------------------------
// @ 0x64f510 hkDefaultTransmission::update, @ 0x64efb0 calcRPM
const RADS_TO_RPM = 9.549297;   // DAT_009e4da8 = 60/2π
export class hkDefaultTransmission {
  constructor(desc) {
    this.downshiftRPM = desc.downshiftRPM;             // +0x2c
    this.upshiftRPM = desc.upshiftRPM;                 // +0x30
    this.primaryTransmissionRatio = desc.primaryTransmissionRatio; // +0x34
    this.clutchDelayTime = desc.clutchDelayTime;       // +0x38
    this.reverseGearRatio = desc.reverseGearRatio;     // +0x3c
    this.gearsRatio = desc.gearsRatio.slice();         // +0x40[]
    this.wheelsTorqueRatio = desc.wheelsTorqueRatio.slice(); // +0x4c[]
    this.currentGear = 0;                              // +0x10 (0-based)
    this.isReversing = false;                          // +0x14
    this.rpm = 0;                                      // +0x18
    this.totalRatio = 0;                               // +0x1c
    this.wheelsOutTorqueRatio = new Array(desc.wheelsTorqueRatio.length).fill(0); // +0x20[]
    this.clutchDelayActive = false;                    // +0x58
    this.shiftTime = 0;                                // +0x5c
  }
  calcRPM(fw) {
    // Σ_i torqueRatio[i] × wheelSpinVel[i] × 60/2π, × primary × gear ratio
    let s = 0;
    for (let i = 0; i < fw.wheels.count; i++) {
      s += fw.wheels.wheel[i].spinVelocity * RADS_TO_RPM * this.wheelsTorqueRatio[i];
    }
    const ratio = this.isReversing ? -this.reverseGearRatio : this.gearsRatio[this.currentGear];
    return s * this.primaryTransmissionRatio * ratio;
  }
  update(dt, fw) {
    this.isReversing = fw.driverInput.reverse && this.currentGear < 1;
    if (!this.clutchDelayActive) {
      const ratio = this.isReversing ? -this.reverseGearRatio : this.gearsRatio[this.currentGear];
      // NOTE: the client also multiplies *(fw+0x1c)+0xc here (collide-slot
      // member, observed ≈ constant; treated as 1.0 — flagged in doc).
      this.totalRatio = this.primaryTransmissionRatio * ratio;
    } else {
      this.totalRatio = 0;   // torque fully cut while the clutch is in
    }
    this.rpm = this.calcRPM(fw);
    for (let i = 0; i < this.wheelsOutTorqueRatio.length; i++) {
      this.wheelsOutTorqueRatio[i] = this.wheelsTorqueRatio[i] * this.totalRatio;
    }
    const now = fw.timer;
    if (this.clutchDelayActive && now - this.shiftTime > this.clutchDelayTime) {
      this.clutchDelayActive = false;
    }
    if (!this.isReversing && !this.clutchDelayActive) {
      if (this.rpm < this.downshiftRPM && this.currentGear > 0) {
        this.currentGear--; this.shiftTime = now; this.clutchDelayActive = true;
      }
      if (this.rpm > this.upshiftRPM && this.currentGear + 1 < this.gearsRatio.length) {
        this.currentGear++; this.shiftTime = now; this.clutchDelayActive = true;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// @ 0x64e6f0 hkDefaultBrake::update
export class hkDefaultBrake {
  constructor(desc) {
    this.wheelsMaxBrakingTorque = desc.wheelsMaxBrakingTorque.slice();     // +0x28[]
    this.wheelsMinPedalInputToBlock = desc.wheelsMinPedalInputToBlock.slice(); // +0x34[]
    this.wheelsIsConnectedToHandbrake = desc.wheelsIsConnectedToHandbrake.slice(); // +0x40[]
    this.wheelsMinTimeToBlock = desc.wheelsMinTimeToBlock;                 // +0x4c (binary sets 0!)
    this.blockTimer = 0;                                                   // +0x50
    const n = desc.wheelsMaxBrakingTorque.length;
    this.brakeTorque = new Array(n).fill(0);                               // +0x10[]
    this.isFixed = new Array(n).fill(false);                               // +0x1c[]
  }
  update(dt, fw, invDt) {
    const pedal = fw.driverInput.brakePedal;
    const handbrake = fw.driverInput.handbrake;
    let anyBlocking = false;
    for (let i = 0; i < this.brakeTorque.length; i++) {
      this.isFixed[i] = this.wheelsIsConnectedToHandbrake[i] && handbrake;
      if (this.wheelsMinPedalInputToBlock[i] <= pedal) anyBlocking = true;
      const w = fw.wheels.wheel[i];
      // torque that would stop the wheel this step, then pedal-clamped
      // (decompile: −(w.spinVel × w.invInertia-ish × invDt) × radius², clamped)
      const r = fw.wheels.radius[i];
      let t = -(w.spinVelocity * invDt) * r * r;
      const max = pedal * this.wheelsMaxBrakingTorque[i];
      if (Math.abs(t) > max) t = t > 0 ? max : -max;
      this.brakeTorque[i] = t;
    }
    if (anyBlocking) {
      if (this.blockTimer > 0) { this.blockTimer -= dt; return; }
      for (let i = 0; i < this.brakeTorque.length; i++) {
        if (this.wheelsMinPedalInputToBlock[i] <= pedal) this.isFixed[i] = true; // full lockup
      }
      return;
    }
    this.blockTimer = this.wheelsMinTimeToBlock;
  }
}

// ---------------------------------------------------------------------------
// @ 0x64de50 hkDefaultSuspension::update — v1 mass-scaling hypothesis CONFIRMED
export class hkDefaultSuspension {
  constructor(desc) {
    this.hardpoints = desc.hardpoints.map(p => p.clone());       // +0x10 (raw, local frame)
    this.directions = desc.hardpoints.map(() => new Vec3(0, -1, 0)); // +0x1c (client hardcodes (0,−1,0))
    this.lengths = desc.lengths.slice();                          // +0x28[]
    this.wheelsStrength = desc.wheelsStrength.slice();            // +0x44[]
    this.wheelsDampingCompression = desc.wheelsDampingCompression.slice(); // +0x50[]
    this.wheelsDampingRelaxation = desc.wheelsDampingRelaxation.slice();   // +0x5c[]
    this.forces = new Array(desc.lengths.length).fill(0);         // +0x34[]
  }
  update(dt, fw) {
    const mass = fw.body.invMass === 0 ? 0 : 1 / fw.body.invMass;
    for (let i = 0; i < this.forces.length; i++) {
      const w = fw.wheels.wheel[i];
      if (!w.inContact) { this.forces[i] = 0; continue; }
      const damping = (w.suspensionVelocity >= 0)
        ? this.wheelsDampingRelaxation[i]
        : this.wheelsDampingCompression[i];
      this.forces[i] = (
        this.wheelsStrength[i] * (this.lengths[i] - w.currentLength) * w.clipFactor
        - damping * w.suspensionVelocity
      ) * mass;
    }
  }
}

// ---------------------------------------------------------------------------
// @ 0x64dae0 hkDefaultAerodynamics::update — extraGravity applied ALWAYS
export class hkDefaultAerodynamics {
  constructor(desc) {
    this.airDensity = desc.airDensity;         // +0x30
    this.frontalArea = desc.frontalArea;       // +0x34
    this.dragCoefficient = desc.dragCoefficient;   // +0x38
    this.liftCoefficient = desc.liftCoefficient;   // +0x3c
    this.extraGravity = desc.extraGravity.clone(); // +0x40 (an acceleration)
    this.force = new Vec3();                   // +0x10 (world-space force)
    this._fwd = new Vec3(); this._up = new Vec3();
  }
  update(dt, fw) {
    const fwd = fw.body.R.rotate(fw.axes.forward, this._fwd);
    const up = fw.body.R.rotate(fw.axes.up, this._up);
    const v = fw.body.linearVelocity.dot(fwd);      // forward speed only
    const lift = this.liftCoefficient * this.frontalArea * this.airDensity * v * v * 0.5;  // DAT_00a0f298
    const drag = Math.abs(v) * this.dragCoefficient * this.frontalArea * this.airDensity * v * -0.5; // DAT_00aaa6cc
    this.force.set(0, 0, 0)
      .addScaled(fwd, drag)
      .addScaled(up, lift);
    const mass = fw.body.invMass === 0 ? 0 : 1 / fw.body.invMass;
    this.force.addScaled(this.extraGravity, mass);  // unconditional (v1 was wrong)
  }
}

// ---------------------------------------------------------------------------
// @ 0x64d810 hkAngularVelocityDamper::update — ticked from postTick with (dt, fw)
export class hkAngularVelocityDamper {
  constructor(desc) {
    this.normalSpinDamping = desc.normalSpinDamping;       // +0x8
    this.collisionSpinDamping = desc.collisionSpinDamping; // +0xc
    this.collisionThreshold = desc.collisionThreshold;     // +0x10
  }
  update(dt, fw) {
    const w = fw.body.angularVelocity;
    const k = (w.lengthSq() <= this.collisionThreshold * this.collisionThreshold)
      ? this.normalSpinDamping
      : this.collisionSpinDamping;   // selected by CURRENT |angVel|, not a timer
    let f = 1 - k * dt;
    if (f < 0) f = 0;
    w.scale(f);   // multiplicative, all 3 axes (setAngularVelocity path)
  }
}
