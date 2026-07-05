// hkMath.js — minimal Vec3/Quat/Mat3 for the Havok 2.3 vehicle port.
// Pure math, no addresses to trace; conventions match the x86 client:
// local frame X=right, Y=up, Z=forward (see axes object @ fw+0x10, ctor 0x5d6640).

export class Vec3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new Vec3(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  scale(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  addScaled(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
  dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
  cross(v, out = new Vec3()) {
    const x = this.y * v.z - this.z * v.y;
    const y = this.z * v.x - this.x * v.z;
    const z = this.x * v.y - this.y * v.x;
    return out.set(x, y, z);
  }
  lengthSq() { return this.dot(this); }
  length() { return Math.sqrt(this.lengthSq()); }
  normalize() {
    // client convention (e.g. 0x64bc70): 1/sqrt with zero guard, not epsilon
    const l2 = this.lengthSq();
    if (l2 === 0) return this.set(0, 0, 0);
    return this.scale(1 / Math.sqrt(l2));
  }
}

export class Quat {
  constructor(x = 0, y = 0, z = 0, w = 1) { this.x = x; this.y = y; this.z = z; this.w = w; }
  set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; return this; }
  copy(q) { this.x = q.x; this.y = q.y; this.z = q.z; this.w = q.w; return this; }
  clone() { return new Quat(this.x, this.y, this.z, this.w); }
  normalize() {
    const l = Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w);
    if (l === 0) return this.set(0, 0, 0, 1);
    const s = 1 / l;
    this.x *= s; this.y *= s; this.z *= s; this.w *= s;
    return this;
  }
  multiply(q, out = new Quat()) { // this * q
    const ax = this.x, ay = this.y, az = this.z, aw = this.w;
    const bx = q.x, by = q.y, bz = q.z, bw = q.w;
    return out.set(
      aw * bx + ax * bw + ay * bz - az * by,
      aw * by - ax * bz + ay * bw + az * bx,
      aw * bz + ax * by - ay * bx + az * bw,
      aw * bw - ax * bx - ay * by - az * bz,
    );
  }
  setFromAxisAngle(axis, angle) {
    const h = angle * 0.5, s = Math.sin(h);
    return this.set(axis.x * s, axis.y * s, axis.z * s, Math.cos(h));
  }
  // rotate a vector by this quaternion (play.html compat: q.vmult(v, out))
  vmult(v, out = new Vec3()) {
    const { x, y, z, w } = this;
    // t = 2 * cross(q.xyz, v)
    const tx = 2 * (y * v.z - z * v.y);
    const ty = 2 * (z * v.x - x * v.z);
    const tz = 2 * (x * v.y - y * v.x);
    return out.set(
      v.x + w * tx + (y * tz - z * ty),
      v.y + w * ty + (z * tx - x * tz),
      v.z + w * tz + (x * ty - y * tx),
    );
  }
}

// 3x3 rotation matrix stored as row vectors (matches the client body matrix at
// rigidBody+0x80..0xa8 used column-wise in 0x64dae0 / 0x64b2b0).
export class Mat3 {
  constructor() {
    // identity
    this.m = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  }
  setFromQuat(q) {
    const { x, y, z, w } = q;
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2;
    const yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;
    const m = this.m;
    m[0] = 1 - (yy + zz); m[1] = xy - wz; m[2] = xz + wy;
    m[3] = xy + wz; m[4] = 1 - (xx + zz); m[5] = yz - wx;
    m[6] = xz - wy; m[7] = yz + wx; m[8] = 1 - (xx + yy);
    return this;
  }
  // world = R · local  (client FUN_005d6ae0 — rotate vector by body matrix)
  rotate(v, out = new Vec3()) {
    const m = this.m;
    return out.set(
      m[0] * v.x + m[1] * v.y + m[2] * v.z,
      m[3] * v.x + m[4] * v.y + m[5] * v.z,
      m[6] * v.x + m[7] * v.y + m[8] * v.z,
    );
  }
  // local = Rᵀ · world
  rotateInverse(v, out = new Vec3()) {
    const m = this.m;
    return out.set(
      m[0] * v.x + m[3] * v.y + m[6] * v.z,
      m[1] * v.x + m[4] * v.y + m[7] * v.z,
      m[2] * v.x + m[5] * v.y + m[8] * v.z,
    );
  }
}
