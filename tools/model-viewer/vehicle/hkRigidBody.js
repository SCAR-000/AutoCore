// hkRigidBody.js — the chassis rigid body, matching what the recovered vehicle
// code actually touches on the client's hkRigidBody:
//   +0x2c invMass  (confirmed: 0x64de50 suspension, 0x64dae0 aero divide by it)
//   +0x40 linearVelocity, +0x50 angularVelocity (0x64d810 AVD, 0x64f840 steering)
//   +0x80..0xa8 rotation matrix (row-major R, world = R·local)
//   world inverse inertia (fw+0x310..0x318 diag in local · rotated) — 0x64b2b0
// The client integrates this body inside hkWorld (semi-implicit: velocity then
// position); the vehicle framework only applies impulses / sets velocities
// (docs/vehicle-physics-port.md "RE v2 — world step, gravity, timing").

import { Vec3, Quat, Mat3 } from './hkMath.js';

export class hkRigidBody {
  constructor({ mass, invInertiaLocal, solverInvInertiaLocal }) {
    this.mass = mass;
    this.invMass = mass > 0 ? 1 / mass : 0;              // body+0x2c
    // local-space diagonal inverse inertia (fw+0x310/0x314/0x318, from
    // hkVehicleFramework_initFromDescriptor @ 0x64b2b0: 1/((|R|·scalar)·mass))
    this.invInertiaLocal = invInertiaLocal.clone();
    // SOLVER-facing inverse inertia (fw+0x320..0x32c, initFromDescriptor):
    // per-axis ratio RVSpinTorque/RVInertia instead of the real inertia — the
    // friction solver's angular authority is data-limited per axis. This is
    // the game's NO-ROLLOVER mechanism: RVSpinTorqueRoll ~0.2 / Pitch ~0.05
    // give tire forces almost no roll/pitch authority while yaw stays free.
    this.solverInvInertiaLocal = (solverInvInertiaLocal || invInertiaLocal).clone();

    this.position = new Vec3();
    this.orientation = new Quat();
    this.linearVelocity = new Vec3();                    // body+0x40
    this.angularVelocity = new Vec3();                   // body+0x50
    this.R = new Mat3();                                 // body+0x80

    this._tmp = new Vec3();
    this._tmp2 = new Vec3();
  }

  syncRotation() { this.R.setFromQuat(this.orientation); }

  // world-space inverse-inertia multiply: I⁻¹w = R · diag(I⁻¹l) · Rᵀ · v
  applyInvInertia(v, out = new Vec3()) {
    const l = this.R.rotateInverse(v, this._tmp);
    l.x *= this.invInertiaLocal.x;
    l.y *= this.invInertiaLocal.y;
    l.z *= this.invInertiaLocal.z;
    return this.R.rotate(l, out);
  }

  // solver-facing variant (fw+0x320 set — used by the friction solver only)
  applyInvInertiaSolver(v, out = new Vec3()) {
    const l = this.R.rotateInverse(v, this._tmp);
    l.x *= this.solverInvInertiaLocal.x;
    l.y *= this.solverInvInertiaLocal.y;
    l.z *= this.solverInvInertiaLocal.z;
    return this.R.rotate(l, out);
  }

  // impulse at world point using the SOLVER inertia for the angular response
  applyImpulseAtSolver(imp, worldPoint) {
    this.linearVelocity.addScaled(imp, this.invMass);
    const r = this._tmp.copy(worldPoint).sub(this.position);
    const dL = r.cross(imp, this._tmp2);
    const dw = this.applyInvInertiaSolver(dL, dL);
    this.angularVelocity.add(dw);
  }

  // impulse at center of mass (body vtbl+0x6c path in 0x64bc70)
  applyImpulse(imp) {
    this.linearVelocity.addScaled(imp, this.invMass);
  }

  // impulse at world point (body vtbl+0x60 path — suspension impulses)
  applyImpulseAt(imp, worldPoint) {
    this.linearVelocity.addScaled(imp, this.invMass);
    const r = this._tmp.copy(worldPoint).sub(this.position);
    const dL = r.cross(imp, this._tmp2);                 // angular impulse
    const dw = this.applyInvInertia(dL, dL);
    this.angularVelocity.add(dw);
  }

  applyAngularImpulse(angImp) {
    const dw = this.applyInvInertia(angImp, this._tmp);
    this.angularVelocity.add(dw);
  }

  // body vtbl+0x58 (used by raycast prep 0x64cf20 for suspension velocity)
  getPointVelocity(worldPoint, out = new Vec3()) {
    const r = this._tmp.copy(worldPoint).sub(this.position);
    this.angularVelocity.cross(r, out);
    return out.add(this.linearVelocity);
  }

  // hkWorld-style semi-implicit step: impulses already folded into velocities,
  // so integration is position/orientation only.
  integrate(dt) {
    this.position.addScaled(this.linearVelocity, dt);
    const w = this.angularVelocity;
    // dq = 0.5 * (w quaternion) * q * dt
    const q = this.orientation;
    const dq = new Quat(w.x, w.y, w.z, 0).multiply(q);
    q.x += dq.x * 0.5 * dt;
    q.y += dq.y * 0.5 * dt;
    q.z += dq.z * 0.5 * dt;
    q.w += dq.w * 0.5 * dt;
    q.normalize();
    this.syncRotation();
  }
}
