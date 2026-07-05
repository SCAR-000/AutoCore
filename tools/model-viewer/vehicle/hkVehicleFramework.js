// hkVehicleFramework.js — port of hkVehicleFramework (ctor 0x64cd30, vtable
// 0x9e4a40). Tick sequence per VehicleAction_tickSubsystems @ 0x636a60:
//   self pre-update (0x64cf20: wheel raycasts + wheel state prep)
//   → input → steering → collide → transmission → brake → suspension → aero
//   → self post-tick (0x64bc70: gravity/aero impulses, suspension impulses,
//     per-axle aggregation, extra components (AVD), steering yaw-assist,
//     friction solve, velocity writeback)
// Ground = terrain heightfield fn (stands in for hkVOGHeightFieldShape).

import { Vec3, Quat } from './hkMath.js';
import { AxleContact, solveFriction } from './hkFrictionSolver.js';

const GRAVITY = new Vec3(0, -9.81, 0); // InitPhysics @ 0x932060, const 0xC11CF5C3

const _v1 = new Vec3(), _v2 = new Vec3(), _v3 = new Vec3(), _v4 = new Vec3();
const _q1 = new Quat();

export class hkVehicleFramework {
  constructor({ body, wheels, driverInput, steering, transmission, brake, suspension, aerodynamics, damper, axes, extraTorqueFactor }) {
    this.body = body;                 // hkDefaultChassis stand-in (fw+0x30 → +0x3c)
    this.wheels = wheels;             // fw+0x0c
    this.driverInput = driverInput;   // fw+0x14
    this.steering = steering;         // fw+0x18
    this.transmission = transmission; // fw+0x20
    this.brake = brake;               // fw+0x24
    this.suspension = suspension;     // fw+0x28
    this.aerodynamics = aerodynamics; // fw+0x2c
    this.damper = damper;             // fw+0x330 extras array = [AVD]
    // axes object (fw+0x10, ctor 0x5d6640): local forward/up in the body frame
    this.axes = axes || { forward: new Vec3(0, 0, 1), up: new Vec3(0, 1, 0) };
    this.extraTorqueFactor = extraTorqueFactor || 0; // fw+0x348 — steering yaw assist
    this.timer = 0;                   // fw+0x8 (accumulated dt)
    this.terrainHeightFn = () => 0;
    this.axles = [new AxleContact(), new AxleContact()];
    this._steerTmp = new Vec3();
    // normal-clip threshold (fw+0x304, desc[0x10]) — raycast prep clip factor
    this.normalClipThreshold = 0.2; // TODO-verify exact desc value (setup DAT_00a0f710)
  }

  setTerrain(fn) { this.terrainHeightFn = fn; }

  // ---- raycast one wheel against the heightfield: march + bisect ----
  _castRay(start, dir, maxLen) {
    const STEPS = 8;
    let tPrev = 0;
    let prevAbove = start.y - this.terrainHeightFn(start.x, start.z) > 0;
    for (let s = 1; s <= STEPS; s++) {
      const t = (s / STEPS) * maxLen;
      const x = start.x + dir.x * t, y = start.y + dir.y * t, z = start.z + dir.z * t;
      const above = y - this.terrainHeightFn(x, z) > 0;
      if (prevAbove && !above) {
        // bisection refine between tPrev and t
        let lo = tPrev, hi = t;
        for (let i = 0; i < 12; i++) {
          const m = (lo + hi) * 0.5;
          const my = start.y + dir.y * m - this.terrainHeightFn(start.x + dir.x * m, start.z + dir.z * m);
          if (my > 0) lo = m; else hi = m;
        }
        const hitT = (lo + hi) * 0.5;
        // heightfield normal via central differences (matches bilinear surface)
        const hx = start.x + dir.x * hitT, hz = start.z + dir.z * hitT;
        const e = 0.25;
        const nx = this.terrainHeightFn(hx - e, hz) - this.terrainHeightFn(hx + e, hz);
        const nz = this.terrainHeightFn(hx, hz - e) - this.terrainHeightFn(hx, hz + e);
        const normal = new Vec3(nx, 2 * e, nz).normalize();
        return { fraction: hitT / maxLen, normal };
      }
      tPrev = t; prevAbove = above;
    }
    return null;
  }

  // ---- self pre-update @ 0x64cf20: raycasts + wheel state ----
  preUpdate(dt) {
    const body = this.body;
    const susp = this.suspension;
    for (let i = 0; i < this.wheels.count; i++) {
      const w = this.wheels.wheel[i];
      const radius = this.wheels.radius[i];
      body.R.rotate(susp.directions[i], w.rayDirWorld);
      body.R.rotate(susp.hardpoints[i], w.hardpointWorld).add(body.position);
      const rayLen = susp.lengths[i] + radius;
      w.rayEndWorld.copy(w.hardpointWorld).addScaled(w.rayDirWorld, rayLen);

      const hit = this._castRay(w.hardpointWorld, w.rayDirWorld, rayLen);
      if (!hit) {
        w.inContact = false;
        w.currentLength = susp.lengths[i];   // full extension
        w.contactNormal.copy(w.rayDirWorld).scale(-1);
        w.contactPoint.copy(w.rayEndWorld);
        w.clipFactor = 1;
        w.suspensionVelocity = 0;
      } else {
        w.inContact = true;
        w.contactNormal.copy(hit.normal);
        w.currentLength = hit.fraction * rayLen - radius;
        w.contactPoint.copy(w.hardpointWorld).addScaled(w.rayDirWorld, hit.fraction * rayLen);
        const d = -w.contactNormal.dot(w.rayDirWorld);
        if (d <= this.normalClipThreshold) {
          w.suspensionVelocity = 0;
          w.clipFactor = 1 / this.normalClipThreshold;
        } else {
          w.clipFactor = 1 / d;
          // ground static → relative point velocity = chassis point velocity.
          // Compressing (body moving toward ground, pv·normal < 0) → negative,
          // so the compression damper (−c·v with v<0) pushes the body up.
          const pv = body.getPointVelocity(w.contactPoint, _v1);
          w.suspensionVelocity = pv.dot(w.contactNormal) * w.clipFactor;
        }
      }
      // kinematic wheel spin @ 0x64cf20 third loop: wheels roll with the ground
      if (this.brake.isFixed[i]) {
        w.spinVelocity = 0;
      } else {
        const fwd = body.R.rotate(this.axes.forward, _v2);
        const chassisFwdVel = body.linearVelocity.dot(fwd);
        w.spinVelocity = (w.forwardSlipVel + chassisFwdVel) / radius;
        w.spinAngle += w.spinVelocity * dt;
      }
      // wheel steering quaternion (small-angle, 0x64cf20 tail)
      const angle = this.steering.wheelsSteeringAngle[i] || 0;
      _q1.set(this.axes.up.x * angle * 0.5, this.axes.up.y * angle * 0.5, this.axes.up.z * angle * 0.5, 1).normalize();
      w.steerQuat.copy(_q1);
      // world forward dir after steering
      const localFwd = _v3.copy(this.axes.forward);
      const cosA = Math.cos(angle), sinA = Math.sin(angle);
      // rotate local forward about local up by angle
      const rgt = this.axes.forward.cross(this.axes.up, _v4).scale(-1); // right = up×fwd
      localFwd.scale(cosA).addScaled(rgt, sinA);
      body.R.rotate(localFwd, w.forwardDir);
    }
  }

  // ---- component tick @ 0x636a60 ----
  tickComponents(dt) {
    this.timer += dt;
    const invDt = dt > 0 ? 1 / dt : 0;
    this.driverInput.update(dt, this);
    this.steering.update(dt, this);
    // (collide component's raycast work happens in preUpdate)
    this.transmission.update(dt, this);
    this.brake.update(dt, this, invDt);
    this.suspension.update(dt, this);
    this.aerodynamics.update(dt, this);
  }

  // ---- post-tick @ 0x64bc70 ----
  postTick(dt) {
    const body = this.body;
    const mass = body.invMass === 0 ? 0 : 1 / body.invMass;

    // 1. gravity + aero impulse
    const imp = _v1.set(0, 0, 0)
      .addScaled(GRAVITY, mass * dt)
      .addScaled(this.aerodynamics.force, dt);
    body.applyImpulse(imp);

    // 2. extra components (AVD) — ticked here with (dt, framework)
    this.damper.update(dt, this);

    // 3. suspension impulses along contact normals at contact points +
    //    per-axle aggregation into the two pseudo contact points
    for (const ax of this.axles) {
      ax.point.set(0, 0, 0); ax.forward.set(0, 0, 0); ax.side.set(0, 0, 0);
      ax.normalForce = 0; ax.driveForce = 0; ax.longForce = 0;
      ax.spinVelAvg = 0; ax.isFixed = false;
      ax.friction = 0; ax.viscosityFriction = 0; ax.maxFriction = 0;
      ax.wheelSpinInertia = 0; ax._n = 0;
    }
    for (let i = 0; i < this.wheels.count; i++) {
      const w = this.wheels.wheel[i];
      const a = this.wheels.axle[i];
      const ax = this.axles[a];
      const suspForce = this.suspension.forces[i];
      // suspension impulse (body vtbl+0x60 in the client)
      const sImp = _v2.copy(w.contactNormal).scale(suspForce * dt);
      body.applyImpulseAt(sImp, w.contactPoint);

      const invCount = 1 / this.wheels.perAxleWheelCount[a];
      ax.point.addScaled(w.contactPoint, invCount);
      // side = normalize(cross(contactNormal, wheelForward)); forward = cross(side, normal)
      const side = w.contactNormal.cross(w.forwardDir, _v3).normalize();
      const fwd = side.cross(w.contactNormal, _v4).normalize();
      ax.side.add(side);
      ax.forward.add(fwd);
      ax.normalForce += suspForce;
      const r = this.wheels.radius[i];
      // drive force = engine torque × per-wheel transmission ratio (signed —
      // reverse gear carries the sign) ÷ wheel radius
      ax.driveForce += w.engineTorque * this.transmission.wheelsOutTorqueRatio[i] / r;
      ax.longForce += this.brake.brakeTorque[i] / r;
      // rolling resistance opposing wheel travel — APPROXIMATION: the client's
      // engine-resistance path (Min/Opt/MaxResistance curve values) hasn't been
      // located in the binary yet (doc: open items). f = 0.015·N is the stand-in
      // that makes released-throttle coasting decay like the retail game.
      const surfSpeed = w.spinVelocity * r;
      if (Math.abs(surfSpeed) > 0.05) {
        ax.longForce += -Math.sign(surfSpeed) * 0.015 * Math.abs(suspForce);
      }
      ax.spinVelAvg += w.spinVelocity * r * invCount;
      ax.isFixed = ax.isFixed || this.brake.isFixed[i];
      ax.friction += this.wheels.friction[i] * invCount;
      ax.viscosityFriction += this.wheels.viscosityFriction[i] * invCount;
      ax.maxFriction += this.wheels.maxFriction[i] * invCount;
      // wheel spin inertia contribution (axleParams+0x54): m_wheel-less client
      // treats wheels kinematically; approximate ½·r²-scaled term ≈ 0 — TODO-verify
      ax._n++;
    }
    for (const ax of this.axles) {
      ax.forward.normalize();
      ax.side.normalize();
    }

    // 4. artificial steering yaw-assist (0x64bc70 step 5)
    if (this.extraTorqueFactor !== 0) {
      const up = body.R.rotate(this.axes.up, _v2);
      const angImp = up.scale(this.steering.mainSteeringAngle * this.extraTorqueFactor * dt);
      body.applyAngularImpulse(angImp);
    }

    // 5. friction solve (0x6c4450) — only with ground contact on that axle
    const active = this.axles.filter(ax => ax.normalForce !== 0);
    if (active.length === 2) {
      solveFriction(body, this.axles, dt);
    } else if (active.length === 1) {
      // single-axle contact: still solve (2nd axle contributes nothing)
      solveFriction(body, this.axles, dt);
    }

    // 6. write solver outputs back to wheels (slip/skid, +0x94..0xa0)
    for (let i = 0; i < this.wheels.count; i++) {
      const w = this.wheels.wheel[i];
      const ax = this.axles[this.wheels.axle[i]];
      if (w.inContact) {
        w.forwardSlipVel = ax.forwardSlipVel;
        w.sideSlipVel = ax.sideSlipVel;
        w.skid = ax.skid;
      } else {
        w.forwardSlipVel = 0; w.sideSlipVel = 0; w.skid = 0;
      }
    }
  }

  step(dt) {
    this.preUpdate(dt);
    this.tickComponents(dt);
    this.postTick(dt);
  }
}
