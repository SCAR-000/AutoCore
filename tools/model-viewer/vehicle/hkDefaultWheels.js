// hkDefaultWheels.js — per-wheel state container (client class hkDefaultWheels,
// ctor @ 0x64fee0, 0x390 bytes, vtable 0x9e5010). Holds the per-wheel 0xc0-byte
// structs (client wheels+0x80) and the friction parameter arrays from the
// reflection block at 0x9e5040 (wheelsFriction / wheelsViscosityFriction /
// wheelsMaxFriction / maxVelocityForPositionalFriction / frictionEqualizer).
//
// Wheel struct fields (client offsets within each 0xc0 block):
//   +0x00 hardpointWorld  +0x10 rayEndWorld      +0x20 contactPointWorld
//   +0x30 contactNormal   +0x40 wheelOrientation +0x60 wheelForwardDir
//   +0x70 steeringQuat    +0x80 inContact(byte)  +0x84/0x8c spin velocity
//   +0x90 spinAngle       +0x94..0xa0 solver slip outputs  +0xa4 contactBody
//   +0xac clipFactor      +0xb0 currentLength    +0xb4 suspensionVelocity

import { Vec3, Quat } from './hkMath.js';

class Wheel {
  constructor() {
    this.hardpointWorld = new Vec3();
    this.rayDirWorld = new Vec3();
    this.rayEndWorld = new Vec3();
    this.contactPoint = new Vec3();
    this.contactNormal = new Vec3(0, 1, 0);
    this.inContact = false;
    this.currentLength = 0;       // +0xb0
    this.clipFactor = 1;          // +0xac = clipped 1/dot(normal, −rayDir)
    this.suspensionVelocity = 0;  // +0xb4
    this.spinVelocity = 0;        // +0x8c (kinematic — follows ground speed)
    this.spinAngle = 0;           // +0x90
    this.steerQuat = new Quat();  // +0x70
    this.forwardDir = new Vec3(0, 0, 1); // +0x60 (world, after steering)
    this.engineTorque = 0;        // wheels+0x28[i] — written by the AA layer
    this.forwardSlipVel = 0;      // solver writeback (+0x9c)
    this.sideSlipVel = 0;         // solver writeback
    this.skid = 0;                // solver writeback
  }
}

export class hkDefaultWheels {
  constructor(desc) {
    const n = desc.radius.length;
    this.count = n;
    this.radius = desc.radius.slice();                 // +0x10[] (vehicleData+0x600)
    this.width = desc.width.slice();                   // (vehicleData+0x618)
    this.axle = desc.axle.slice();                     // +0x58[] (0=front, 1=rear)
    this.axleCount = 2;                                // +0x64
    this.perAxleWheelCount = [0, 0];                   // +0x68[]
    for (const a of this.axle) this.perAxleWheelCount[a]++;
    // friction params (wheels descriptor, FUN_005fcce0). Constant→member
    // assignment (values from binary; slot mapping TODO-verify vs ctor copy order):
    //   base μ = wheelset table (rear × RearWheelFrictionScalar)
    //   ×1.5 (DAT_00aaa68c) → wheelsMaxFriction (μ cap under slip)
    //   0.01 (DAT_00a0f718) → wheelsViscosityFriction (μ growth per m/s slip)
    //   15.0 (DAT_00aaa7a4), 0.001 (DAT_00a0f72c) → remaining wheels-desc slots
    this.friction = desc.friction.slice();
    this.viscosityFriction = new Array(n).fill(0.01);
    this.maxFriction = desc.friction.map(f => f * 1.5);
    this.maxVelocityForPositionalFriction = 0.5;       // param_3+0xa0 gate — TODO-verify value source
    this.wheel = Array.from({ length: n }, () => new Wheel());
  }
}
