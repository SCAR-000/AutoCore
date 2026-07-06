# Vehicle Physics Port — As-Built Record

This document originally set out a Tier-2 implementation plan. It has since been
**built** — this is now the as-built record of what exists, what the Ghidra
reverse-engineering actually found, and what remains open. If you're picking this
up cold, read this document, then `docs/geo-format.md` and `docs/level-renderer.md`
for the surrounding pipeline.

> **REWRITE IN PROGRESS (2026-07-05).** The JS port described below is being
> replaced by a verbatim port of the real Havok 2.3 vehicle kit recovered from
> the binary. Sections below marked "RE v2" are the new source of truth; older
> sections describe the v1 approximation and its hypotheses, which are being
> re-verified. See "RE v2 — recovered component architecture" first.

---

## RE v2 — recovered component architecture (2026-07-05)

The full Havok vehicle component set was identified by walking the constructor
chain from `VehicleAction`'s vtable (found via `.?AVVehicleAction@@` RTTI — AA's
own classes have MSVC RTTI; Havok's classes don't, but each Havok class has a
**reflection block** in `.rdata` 0x9e4a00–0x9e5300 laid out as
`[vtable][member table {namePtr,type,offset}][member-name strings][class-name string]`).

**Creation chain**: `Vehicle_createVehicleAction` (0x4fb660) →
`Vehicle_buildHavokVehicleFramework` (0x5fd390, sole caller of every component
ctor) → `VehicleAction_ctor` (0x597f90; framework passed in at this+0x40).

| Class | ctor | size | vtable | update (slot+0x14) | key reflected members |
|---|---|---|---|---|---|
| hkDefaultWheels | 0x64fee0 | 0x390 | 0x9e5010 | 0x64ff60 | wheelsFriction, wheelsViscosityFriction, wheelsMaxFriction, maxVelocityForPositionalFriction, frictionEqualizer (member table at 0x9e5040+, per-wheel 0xc0-byte structs at +0x80, axle array +0x58, count +0xc) |
| hkDefaultChassis | 0x64fdf0 | 0x40 | 0x9e4fd0 | 0x64fe80 | owns the hkRigidBody at +0x3c |
| hkDefaultSteering | 0x64fac0 | 0x38 | 0x9e4ee4 | 0x64f840 | maxSteeringAngle@+0x24, maxSpeedFullSteeringAngle@+0x28, wheelsDoesSteer bool-array@+0x2c |
| TankSteering (AA subclass) | 0x64fc80 | 0x38 | 0x9e4f1c | 0x64fb60 | chosen when vehicleData byte+0x4c0 == 4 |
| wheel-collide (name TBD) | 0x5d6640 | 0x3c | 0x9dad44 | TBD | 10-dword descriptor from FUN_005fc3d0 |
| hkDefaultTransmission | 0x64f610 | 0x60 | 0x9e4dac | 0x64f510 | downshiftRPM@4, upshiftRPM@8, primaryTransmissionRatio@0xc, clutchDelayTime@0x10, reverseGearRatio@0x14, gearsRatio[]@0x18, wheelsTorqueRatio[]@0x24 (offsets rel. +0x20 base); consts π and 9.549297=60/2π at 0x9e4da4 |
| hkDefaultBrake | 0x64ed40 | 0x54 | 0x9e4cb8 | 0x64e6f0 | wheelsMaxBrakingTorque[]@4, wheelsMinPedalInputToBlock[]@0x10, wheelsMinTimeToBlock@0x1c, wheelsIsConnectedToHandbrake bool[]@0x20 |
| hkDefaultSuspension | 0x64e510 | 0x68 | 0x9e4c00 | 0x64de50 | wheelsStrength[]@0x24, wheelsDampingCompression[]@0x30, wheelsDampingRelaxation[]@0x3c; also hardpoints +0x10, directions +0x1c, lengths +0x28 (raw) |
| hkDefaultAerodynamics | 0x64da90 | 0x50 | 0x9e4b20 | 0x64dae0 | airDensity@0, frontalArea@4, dragCoefficient@8, liftCoefficient@0xc, extraGravity vec4@0x10 (raw +0x30..0x4c) |
| hkAngularVelocityDamper | 0x64d900 | 0x14 | 0x9e4a68 | 0x64d810 | normalSpinDamping@0, collisionSpinDamping@4, collisionThreshold@8 (raw +0x8/+0xc/+0x10) |
| hkVehicleFramework | 0x64cd30 | 0x360 | 0x9e4a40 | 0x64cf20 (self) | post-tick finalize slot+0x18 = **0x64bc70** (friction-solve suspect); inverse inertia at +0x310..0x318; per-axle aggregate contact geometry at +0x1fc (two-contact-point friction model, precomputed in `initFromDescriptor` 0x64b2b0) |

**Major architectural findings:**

1. **There is NO hkDefaultEngine.** AA deleted Havok's engine component; engine
   torque comes from the AA layer (`VehicleAction_calcWheelTorque` 0x598040 +
   `VehicleEngine_torqueCurve2D` 0x4a9750) and is fed to the wheels directly.
2. **Steering has an AA subclass, `TankSteering`** (`.?AVTankSteering@@`),
   selected when vehicleData byte +0x4c0 == 4 (VehicleType check). 4-wheel
   vehicles use stock `hkDefaultSteering`.
3. **Tick order** (`VehicleAction_tickSubsystems` 0x636a60): framework
   `+0x14..+0x2c` slots ticked via vtable slot+0x14 in slot order, then
   framework self post-tick (slot+0x18 = 0x64bc70). Wheels (fw+0xc) and chassis
   (fw+0x30) are not in the ticked list. Slot→component assignment is being
   pinned by decompiling each update (fw slot map in
   `hkVehicleFramework_wireComponents` 0x636940 plate comment).
4. **RVInertia confirmed as scalar multipliers at the source**:
   `hkVehicleFramework_initFromDescriptor` (0x64b2b0) computes
   `invInertia = 1/((|R|·scalar)·mass)` per axis into fw+0x310..0x318.
5. **The two-contact-point friction geometry is real**: per-axle (front/rear)
   aggregated contact positions are precomputed at setup into fw+0x1fc.

*(Detailed per-component formulas land below as they are transcribed — Phase 2.)*

### RE v2 — framework slot map (final)

`hkVehicleFramework` fields (wired in `hkVehicleFramework_wireComponents` 0x636940,
confirmed by usage in every update):

| offset | component | key runtime fields |
|---|---|---|
| +0x0c | hkDefaultWheels | +0xc count, +0x10 radius[], +0x28 spinVel-related[], +0x58 axleIndex[], +0x64 axleCount, +0x68 perAxleWheelCount[], +0x80 per-wheel 0xc0 structs |
| +0x10 | driver-axes/config object (ctor 0x5d6640, 0x3c bytes) | forward vec4 @+0x10, up vec4 @+0x20 |
| +0x14 | driver input | brakePedal@+0x10, steering@+0x14, handbrake(byte)@+0x18, reverse(byte)@+0x19, throttle@+0x1c |
| +0x18 | hkDefaultSteering | mainAngle@+0x10, perWheelAngle[]@+0x14 |
| +0x1c | wheel-collide (raycasts; +0xc read by transmission as ratio factor — pin down in collide RE) |
| +0x20 | hkDefaultTransmission | perWheelOutTorque[]@+0x20 |
| +0x24 | hkDefaultBrake | brakeTorque[]@+0x10, isFixed(bool[])@+0x1c |
| +0x28 | hkDefaultSuspension | forces[]@+0x34 |
| +0x2c | hkDefaultAerodynamics | force vec4 @+0x10 (+ second vec4 @+0x20 — impulse split TBD) |
| +0x30 | hkDefaultChassis | hkRigidBody @+0x3c (body invMass @+0x2c, vel @+0x40, angVel @+0x50, R matrix @+0x80) |
| +0x34 | world/environment object | gravity accel vec4 @+0xe0 |
| +0x330/+0x334 | extra-components array = [hkAngularVelocityDamper] (ticked in postTick with (dt, framework)) |

Tick order per frame (`tickSubsystems` 0x636a60 → slots in order, then postTick):
input → steering → collide → transmission → brake → suspension → aero →
`postTickApplyForces` (0x64bc70: gravity+aero impulses → suspension impulses →
per-axle aggregation → extra components (AVD) → steering yaw-assist torque →
friction solve → velocity write-back).

### RE v2 — verbatim component formulas (all confirmed from decompiled code)

**hkDefaultSteering_update (0x64f840)** — CORRECTS the v1 port:
```
input      = framework.driverInput.steering          // fw+0x14 → +0x14
angle      = maxSteeringAngle × input
fwdWorld   = R · axes.forward                        // body rot matrix × fw+0x10.forward
speed      = dot(body.linearVelocity, fwdWorld)      // signed forward speed
if (speed >= maxSpeedFullSteeringAngle)
    angle ×= (maxSpeedFullSteeringAngle / speed)²    // INVERSE-SQUARED falloff (v1 used 1/x!)
mainAngle  = angle
perWheel[i] = wheelsDoesSteer[i] ? mainAngle : 0
```

**hkDefaultTransmission_update (0x64f510)**:
```
isReversing = input.reverse && currentGear < 1
if (clutchDelayActive): totalRatio = 0                       // torque fully cut during shift!
else:
    ratio      = isReversing ? -reverseGearRatio : gearsRatio[currentGear]
    totalRatio = primaryTransmissionRatio × ratio × collide.+0xc   // 3rd factor TBD (≈1?)
rpm = calcRPM()   // Σ_i wheelsTorqueRatio[i] × wheelSpinVel[i] (rad/s, wheel struct +0x8c)
                  //   × 9.549297 (=60/2π, DAT_009e4da8) × primaryRatio × ratio
perWheelOutTorque[i] = wheelsTorqueRatio[i] × totalRatio     // engine torque enters later (AA layer)
now = framework.timer (accumulated dt, fw+0x8)
if (clutchDelayActive && now − shiftTime > clutchDelayTime): clutchDelayActive = false
if (!isReversing):
    if (rpm < downshiftRPM && gear > 0):          gear--, shiftTime=now, clutch=active
    if (rpm > upshiftRPM  && gear+1 < numGears):  gear++, shiftTime=now, clutch=active
```

**hkDefaultBrake_update (0x64e6f0)**:
```
pedal = input.brakePedal; handbrake = input.handbrake
for each wheel i:
    isFixed[i] = wheelsIsConnectedToHandbrake[i] && handbrake      // instant lock
    // torque that would stop the wheel this step (spinVel × ?(+0x8c) × param[1]) × radius, clamped:
    t = −(wheel.spinVel(+0x84?) × wheel.+0x8c × invDt?) × radius[i] × radius[i]??  ← exact member
    max = pedal × wheelsMaxBrakingTorque[i]                          //   semantics pinned in port
    brakeTorque[i] = clamp(t, −max, +max)
if any wheel with pedal ≥ wheelsMinPedalInputToBlock[i]:
    blockTimer −= dt; when ≤0 → isFixed[i] = true for those wheels  // full lockup after hold
else: blockTimer = wheelsMinTimeToBlock
```

**hkDefaultSuspension_update (0x64de50)** — v1 hypothesis CONFIRMED:
```
mass = 1 / body.invMass       // body+0x2c IS inverse mass
for each wheel i (0xc0-stride struct w at wheels+0x80):
    if (!w.inContact(+0x80)): force[i] = 0
    else:
        c = (w.suspVel(+0xb4) >= 0) ? wheelsDampingRelaxation[i] : wheelsDampingCompression[i]
        force[i] = ( wheelsStrength[i] × (restLength[i](this+0x28) − w.currentLength(+0xb0)) × w.+0xac
                     − c × w.suspVel ) × mass          // ← mass-scaled, exactly as v1 found
// w.+0xac ≈ clipped 1/dot(contactNormal, suspDir) factor — pinned in collide RE
```

**hkDefaultAerodynamics_update (0x64dae0)** — CORRECTS the v1 port:
```
fwdW = R·axes.forward;  upW = R·axes.up
v    = dot(body.linearVelocity, fwdW)                  // forward speed only, not full |v|
lift = liftCoeff × frontalArea × airDensity × v² × 0.5           (DAT_00a0f298=0.5)
drag = |v| × dragCoeff × frontalArea × airDensity × v × (−0.5)   (DAT_00aaa6cc=−0.5)
force = fwdW × drag + upW × lift
force += extraGravity × mass          // ← applied UNCONDITIONALLY (v1's airborne-only was wrong;
                                      //   works because the real suspension force is not capped)
// force applied as impulse in postTick: impulse = force × dt
```

**hkAngularVelocityDamper_update (0x64d810)** — CORRECTS the v1 port:
```
w = body.angularVelocity (+0x50..0x58)
k = (|w|² <= collisionThreshold²) ? normalSpinDamping : collisionSpinDamping
factor = max(0, 1 − k×dt)
body.setAngularVelocity(w × factor)   // all 3 axes, multiplicative
// NOT a collision-impact-triggered 6400-tick window (that's AA's separate
// VehicleAction_airStabilization layered on top) — selection is by CURRENT |angVel|.
```

**hkVehicleFramework_postTickApplyForces (0x64bc70)** — per tick, after components:
```
1. impulse  = (world.gravity × mass + aero.force) × dt  → body.applyImpulse-ish (vtbl +0x6c/0x5c/0x64)
2. for each extra component (AVD): update(dt, framework)
3. per wheel: suspension impulse = contactNormal × suspForce[i] × dt applied AT contact point
   (body vtbl+0x60); equal-opposite impulse into dynamic ground bodies; longitudinal
   force[i] = (brakeTorque[i] + transmissionOutTorque[i]) / radius[i]
4. per-AXLE aggregation into two pseudo contact points (0x50-byte structs):
   avg contact pos, normalized forward/side dirs (cross products of contact normal ×
   wheel axis), Σ spinVel×radius/count, Σ suspension force, Σ longitudinal force,
   axleIsFixed = any wheel isFixed
5. artificial yaw-assist: angularImpulse += invInertia · upAxis × (steering.mainAngle
   × fw+0x348 × dt)      ← arcade handling term, fw+0x348 = extraTorqueFactor from setup desc[0xe]
6. hkVehicleFrictionSolver_solve (0x6c4450) on {chassis pseudo-body, 2 axle contact
   points, optional dynamic ground body per axle} → per-axle impulse results (fw+0x2cc, 0x1c stride)
7. NaN guards (_finite), write velocities back to body (vtbl +0x54/+0x50), also to
   dynamic ground bodies; write per-axle results back into per-wheel structs
   (+0x94/+0x98/+0x9c/+0xa0 — slip/skid outputs, gated by contact flags)
```

**hkVehicleFrictionSolver_solve (0x6c4450)** — Havok's 2-contact-point friction, structure fully recovered:
```
inputs: param_1 = {dt, dt2?}, param_2 = axle params (stride 0x64: +0x54 wheel-spin
        inertia contribution, friction coeffs), param_3 = solver body state
        (chassis: invMass@+0xec, world inv-inertia 3x4 @+0x100..0x128, COM@+0xf0,
        vel accumulators lin@+0xc0 ang@+0xd0, vel@+0x140/+0x150; ground body block
        @+0x30 stride 0x50: invMass@+0x3c, inv-inertia@+0x50..0x7c, COM@+0x40,
        vel accum @+0x10/+0x20), param_4 = per-axle in/out (stride 7 floats:
        [4] input drive impulse, [5,6] side impulse, [8..] outputs)
per axle (2):
  r1 = contactPos − chassisCOM;  r2 = contactPos − groundBodyCOM
  J angular parts = I⁻¹·cross(r, dir) for forward AND side dirs, both bodies
  effMassFwd  = Σ J·I⁻¹·J + invMass₁ + invMass₂ + ε        (ε = DAT_00a0d2f4)
  effMassFwdWithWheel = effMassFwd + wheelSpinInertiaContrib   (axleParams+0x54)
  relVel along fwd/side computed from both bodies' velocities
crossCoupling = J_frontSide·I⁻¹·J_rearSide  → 2x2 matrix {a,b;b,c} inverted
  (the front/rear side constraints are solved COUPLED — frictionEqualizer domain)
per axle friction limit:  μ = base(wheelsFriction);  if viscosity ≠ 0:
  μ = clamp(base + slipSpeed×wheelsViscosityFriction, 0, wheelsMaxFriction)
  maxImpulse = μ × |normalImpulse| × dt
longitudinal: driveImpulse from (brake+transmission)/radius forces; target =
  −relVelFwd; friction-clamped to ±maxImpulse; residual slip stored
lateral: solve coupled 2x2 → side impulses; if (impulse/limit)² > 1 → scale down
  + alternating per-axle re-solve via FUN_006c3f90 (friction circle projection)
positional-friction gate: if |v| ≥ maxVelocityForPositionalFriction (param_3+0xa0):
  side impulses zeroed (no static "sticky" friction at speed)
apply: impulses → chassis lin/ang velocity accumulators + ground body; outputs
  per axle: residual slip velocities (skid), final impulses → written back to
  wheel structs (+0x94..0xa0) by postTick
```

### RE v2 — client vehicleData struct ↔ VehicleSpecific mapping (from descriptor builders)

Recovered from `FUN_005fc710` (steering desc), `FUN_005fc840` (transmission),
`FUN_005fcce0` (wheels), `FUN_005fcff0` (suspension), `FUN_005fcb00` (brake),
`FUN_005fc4f0` (aero). Client struct = `vehicleData` (entity→+0x3c); offsets:

| offset | VehicleSpecific field | consumed by |
|---|---|---|
| +0x4c0 | VehicleType (byte; ==4 → TankSteering) | setup |
| +0x4cc | front wheel count (byte, from WheelAxle) | all per-axle splits |
| +0x4ce | movement mode byte (0x02 = analog) | VehicleAction |
| +0x514 | WheelHardPoints[6] (stride 0xc) | suspension (used RAW; direction fixed (0,−1,0)) |
| +0x55c/+0x560 | SuspensionLength F/R | suspension restLength |
| +0x564/+0x568 | SuspensionStrength F/R | suspension |
| +0x56c/+0x570 | SuspDampeningCompression F/R | suspension |
| +0x574/+0x578 | SuspDampeningExtension F/R | suspension (relaxation) |
| +0x57c/+0x580 | BrakesMaxTorque F/R | × vehicle+0x200/+0x204 (per-instance mults) |
| +0x58c/+0x590 | BrakesPedalInput F/R | wheelsMinPedalInputToBlock |
| +0x594 | SteeringMaxAngle | × vehicle+0x208 |
| +0x598 | SteeringFullSpeedLimit | × vehicle+0x20c |
| +0x59c/+0x5a0/+0x5a4/+0x5a8 | AeroFrontalArea/Drag/Lift/AirDensity | aero |
| +0x5ac..+0x5b4 | AerodynamicsExtraGravity xyz | aero (constant accel) |
| +0x5b8/+0x5bc/+0x5c0 | AVDNormal/AVDCollision/AVDThreshold | × vehicle+0x210 (first two) |
| +0x5e8/+0x5ec | WheelTorqueRatios F/R | transmission (÷ per-axle wheel count), RPM weights |
| +0x5f0 | VehicleFlags (bit0/1 = handbrake F/R, bit2/3 = steer F/R) | brake, steering |
| +0x600 | WheelRadius[6] | wheels desc, force/torque conversion |
| +0x618 | WheelWidth[6] | wheels desc |
| +0x699 | NumberOfGears (byte) | transmission |
| +0x69c/+0x69e | Down/UpshiftRPM (shorts) | × vehicle+0x1fc (per-instance mult) |
| +0x6b4 | max RPM (MaximumRPMMax?) | top-speed precompute: v = rpm×(2π/60=DAT_009dd348)/(transRatio×topGearRatio) × Σ torqueRatio-weighted radius → vehicle+0x110 |
| +0x6c4/+0x6c8/+0x6cc | TransmissionRatio / ReverseGearRation / ClutchDelayTime | transmission |
| +0x6d0 | GearRatios[5] | transmission |
| +0x740 | RearWheelFrictionScalar | × wheelset friction for REAR wheels |

**Wheelset `Friction[6]` table IS consumed** (v1 never used it): per-wheel base
friction μᵢ = wheelsetFriction[i] (via getter 0x4f5550), rear wheels × RearWheelFrictionScalar.
Then: wheelsViscosityFriction[i] = μᵢ × 1.5 (DAT_00aaa68c); per-wheel constants:
15.0 (DAT_00aaa7a4), 0.01 (DAT_00a0f718), 0.001 (DAT_00a0f72c) fill the remaining
wheels-desc arrays (exact member assignment pinned during port via ctor copy-order).

**Per-instance multipliers on the Vehicle entity** (set from CreateVehiclePacket):
+0x1fc shiftRPM, +0x200 brakeF, +0x204 brakeR, +0x208 steerMaxAngle,
+0x20c steerFullSpeedLimit, +0x210 AVD. The JS port should default all to 1.0.

**Anomaly**: brake descriptor sets wheelsMinTimeToBlock = 0 (BrakesMinBlockTime
+0x584/+0x588 not seen consumed) → wheels lock as soon as pedal ≥ threshold.

**hkVehicleFramework self pre-update (0x64cf20)** — runs FIRST each tick, before
the components; this is the wheel raycast + wheel state prep:
```
per wheel: worldDir = R·suspDirection (fixed (0,−1,0) local); worldHardpoint =
  R·hardpoint + pos; rayEnd = hardpoint + dir×(suspLength + wheelRadius)
batch raycast via a Havok phantom (created lazily, 0x581220)
per wheel result:
  no hit → inContact=0, currentLength=suspLength (full extension), normal=−dir,
           clipFactor(+0xac)=1.0, suspVel=0
  hit    → currentLength = hitFraction×(suspLength+radius) − radius
           contactNormal from cast; contact body ptr stored (+0xa4)
           d = −dot(normal, rayDir); if d ≤ threshold(fw+0x304): suspVel=0,
             clipFactor = 1/threshold   else clipFactor = 1/d
           suspVel(+0xb4) = relative point velocity of body vs ground · normal × clipFactor
per wheel spin: if brake.isFixed[i]: spinVel(+0x8c)=0
  else spinVel = (solverForwardVelOut(+0x9c) + chassisFwdVel)/radius[i];
  spinAngle(+0x90) += spinVel×dt        // wheels always roll to match ground speed —
                                        // NO independent wheel spin integration from torque!
per wheel steering quaternion (small-angle): q ≈ {axis×θ/2, 1} normalized,
  composed with base wheel orientation (axes object fw+0x10, quat @+0x30) →
  wheel world orientation (+0x40..0x4c) and forward dir (+0x60..0x68, feeds postTick)
```
NOTE: wheel spin is *kinematic* (follows ground speed) — engine torque affects the
chassis through the friction solver's drive impulse, not through slow wheel spin-up.

### RE v2 — AA engine layer (calcWheelTorque, corrected)

`VehicleAction_calcWheelTorque` (0x598040) writes per-wheel drive torque into
**hkDefaultWheels+0x28[i]**, which postTick aggregates per axle as the friction
solver's drive impulse. Per wheel (0 if not in contact):
```
t = torqueCurve2D(rpm-ish, throttle)          // 0x4a9750 2D LUT (4-breakpoint shape)
optional driver-stat modifier (entity..+0x118; default 0 → no-op; port: omit)
upright = 1 unless |dot(bodyUp, worldUp)| < 0.8 → pow() falloff
μ = wheelsetFriction[i];  if |v| < 15: μ ×= (15−|v|)×0.2 + 1   // low-speed boost
torque = μ × upright × t
if (entityFlag+0x61c && rear): torque ×= 0.5     // rear traction cut (handbrake/burnout
                                                 //  suspect) — NOT RearWheelFrictionScalar
                                                 //  (that scales the friction table at setup —
                                                 //  prior doc claim CORRECTED)
clamp [0, 1000] → wheels.engineTorque[i]
```

### RE v2 — world step, gravity, timing (Phase 3)

- **Gravity = (0, −9.81, 0)** — `InitPhysics` (0x932060) passes float 0xC11CF5C3
  (−9.81) into world creation; stored in the world object (fw+0x34 → +0xe0) and
  applied by postTick as impulse `g × mass × dt` each tick.
- **Timing**: the global counter `DAT_00b041cc` is `GetTickCount()` —
  **milliseconds**, not frames. CORRECTIONS: the AVD/airStabilization
  "6,400-tick window" = **6.4 seconds**; applyAction's 0x77a1 idle check = 30.6 s.
  Physics receives frame dt (with a debug time-scale multiplier — console cmd).
  All recovered formulas are dt-parameterized → a fixed 1/60 JS loop is faithful.
- **Integration**: the chassis is a plain hkRigidBody integrated by hkWorld
  (semi-implicit: velocity, then position). The vehicle framework only applies
  impulses and sets velocities — there is no vehicle-specific integrator to port.
  Angular damping on the chassis comes from hkAngularVelocityDamper (above), not
  from generic body damping.

Rolled into the port phase (Phase 4): member-level friction-solver transcription
(model shape confirmed above), hkDefaultWheels ctor field-order (assign friction
params to reflected names), torqueCurve2D re-verify, driver-input/fw+0x1c
component internals, boost (entity flag +0x61c / timers this+0x30/0x34 in
applyAction — 6.4 s / cooldown semantics), SpeedLimiter vs AbsoluteTopSpeed
(anchor: top-speed precompute → vehicle+0x110 in setup tail), CenterOfMassModifier
consumer. Per-surface friction: contact-body material (+0x4c) read in the raycast
step is the entry point — **DEFERRED** (single surface in port).

---

## RE v2 — JS port as-built (2026-07-05)

The old ten modules were deleted and replaced with a port mirroring the recovered
architecture (every class/method carries its binary address):

```
vehicle/hkMath.js            Vec3/Quat/Mat3 (client frame: X=right Y=up Z=forward)
vehicle/hkRigidBody.js       chassis body (invMass@+0x2c semantics, world I⁻¹, impulses)
vehicle/hkDefaultWheels.js   per-wheel 0xc0-struct state + friction param arrays
vehicle/hkComponents.js      hkDriverInput, hkDefaultSteering (0x64f840),
                             hkDefaultTransmission (0x64f510/0x64efb0),
                             hkDefaultBrake (0x64e6f0), hkDefaultSuspension (0x64de50),
                             hkDefaultAerodynamics (0x64dae0), hkAngularVelocityDamper (0x64d810)
vehicle/hkFrictionSolver.js  two-contact-point solve (0x6c4450) + circle projection (0x6c3f90)
vehicle/hkVehicleFramework.js  preUpdate raycasts (0x64cf20), tick order (0x636a60),
                             postTick force application + aggregation (0x64bc70)
vehicle/vehicleData.js       vehicle-physics.json → recovered descriptor mapping
vehicle/vehicleAction.js     AA layer (0x598650/0x598040/0x598320) + play.html facade
```

**Verified by simulation** (Node smoke + 126-vehicle sweep, flat terrain):
- Cars settle to exact rest on 4 wheels; suspension force balances gravity +
  constant extraGravity precisely (the v1 "sinks through floor with constant
  extraGravity" was an artifact of v1's wrong suspension model).
- Dune buggy: 0→85 mph through 4 gears, top speed lands exactly on
  `AbsoluteTopSpeed` (38.0 m/s) via governor + rev-limit; full brake locks
  wheels, 38→2 m/s in ~1.2 s; full-lock turn at speed is a coordinated drift
  (velocity heading tracks car heading).
- Sweep: 120/126 stable (fails: 2 walker/6-wheel data-degenerates, 2 mass-50
  driver-character entries, 2 marginal 0.5 m/s rest-creep). 3 top-heavy
  vehicles roll over in a full-lock max-speed turn (plausible; feel-test).

### RE v2 addendum (2026-07-05, round 2): anti-rollover + dual steering

**Anti-rollover (CONFIRMED, data + code).** `hkVehicleFramework_initFromDescriptor`
(0x64b2b0) builds a SECOND inverse-inertia set (fw+0x320..0x32c) from per-axis
ratios **RVSpinTorque\*/RVInertia\*** (framework desc[0xb..0xd]/[0x11..0x13] ←
vehicleData +0x5c8..0x5d0 / +0x5dc..0x5e4, builder FUN_005fc620). postTick hands
THIS set to the friction solver as the chassis angular response — the solver
never sees real inertia. Fleet data: RVSpinTorqueRoll avg 0.21, Pitch avg 0.05
(min 0), Yaw avg 0.37 → tire forces have almost no roll/pitch authority; cars
cannot be rolled by cornering. Ported as `hkRigidBody.solverInvInertiaLocal`
(= RVSpinTorque_axis / I_axis) used by all solver Jacobians + impulse
application. Verified: 0 rollovers in the 126-vehicle sweep (was 3), max tilt
4.4° in a full-lock top-speed turn. Also: **RVExtraTorqueFactor and
RVExtraAngularImpulse are 0 for all 1,751 vehicles** — the yaw-assist term and
the old doc's "airborne stabilization ×15/×6" inference never fire in retail.

**Two steering states (CONFIRMED bindings, composer partially inferred).**
Key bindings "Steer Left/Right **Soft**" (0xa853c4/d8) and "Steer Left/Right"
(0xa853e8/f4) — A/D vs Q/E. Recovered input path: vehicle input entry
FUN_00504c70 writes entity **+0x614 = throttle, +0x618 = steer axis, +0x61c =
sharp-turn byte**; applyAction ramps +0x618 (rate 2.857×2.0×dt), applies
speedFactor min(|v|/20, 1), steps ±0.05/tick, then multiplies by **0.6
(DAT_00af3384)** before writing the hkDefaultSteering input (setter 0x636410,
input object at VehicleAction+0x3c, fw+0x14 = that object+0x3c). The +0x61c
byte is what `calcWheelTorque` checks for the **rear-traction ×0.5 cut** (not
handbrake as previously suspected). Port: A/D → steering ×0.6 (soft/limited);
Q/E → full deflection + rear-grip cut (drift-assist tight turn). The exact
soft-vs-full axis composition upstream of +0x618 was not located — flagged
inferred; 0.6 constant and the +0x61c mechanism are confirmed.

**Hard 30° tilt cap (by design decision, 2026-07-05).** On top of the solver
mechanism, `vehicleAction._clampTilt()` runs after integration every step:
if the body-up deviates more than 30° from world-up, the orientation is rotated
back to the 30° cone boundary (about axis = up × worldUp) and the
tilt-increasing angular-velocity component is stripped. Applies grounded AND
airborne — flipping is impossible by construction (verified: violent 8 rad/s
airborne tumble peaks at 22° and lands upright). The retail client's equivalent
upright handling (applyAction else-branch, up-dot thresholds 0.7/0.35, righting
impulse via 0x5994e0) exists but its exact activation path is mode-gated; the
explicit cap matches observed retail behavior per feel-test.

**Boost: server-driven only (user-confirmed).** There is no client boost
control. The applyAction timer block (this+0x30/0x34) is gated on entity flags
(+0x103 / effects+0x7e) that the server sets. Shift binding and boost state
removed from play.html/vehicleAction.js; do not re-add a client boost.

**Longitudinal solve relaxation (CONFIRMED).** The 0x6c4450 longitudinal
target uses `(drive×0.5 + relVel)×0.5` — the ×0.5 relaxation is required:
both axle constraints see ~the full body effective mass (solver inertia makes
the angular term negligible), so an unrelaxed zero-slip solve double-corrects
and ping-pongs velocity at rest. Ported; also fixed braking (38→0 m/s in ~1 s
with locked wheels).

**Known approximations (each flagged inline with TODO-verify):**
1. Friction-param slot assignment: base μ = wheelset table (raw shorts, rear ×
   RearWheelFrictionScalar); maxFriction = μ×1.5; viscosity = 0.01;
   maxVelocityForPositionalFriction = 2.0 (client value not yet extracted).
2. Positional-friction anchor implemented as low-speed zero-slip constraint on
   linear velocity; client's exact positional mechanism not transcribed.
3. Friction-circle projection is radial + residual; client iterates a ≤16-step
   relaxation table (table address not yet extracted from the 0x6c3f90 callsite).
4. Rolling resistance 0.015·N stand-in for the unlocated engine-resistance path
   (Min/Opt/MaxResistance curve values are parsed but their consumer is unknown).
5. Engine curve: continuous 4-breakpoint shape (client quantises via 2D byte LUT);
   rev limiter returns 0 past MaximumRPMMax.
6. Governors: soft/hard AbsoluteTopSpeed clamp (both directions); SpeedLimiter
   formula still open. Boost (shift) not implemented pending RE of the
   entity+0x61c flag and applyAction jump-assist block semantics.
7. No chassis collision shape: flipped vehicles rest on the safety net.
   Retail flip recovery (hkSelfOrientatorAction / PushBottomUp) not ported.
8. CenterOfMassModifier parsed but unapplied (consumer not located).

**Live demo**: `tools/model-viewer/play.html` (serve the repo root over HTTP, open
`/tools/model-viewer/play.html`). Pick any of 1,751 vehicles and any of 104 maps
from the sidebar tabs; drive with WASD, space=handbrake, shift=boost, R=reset.

---

## Architecture

The retail client simulates vehicles with **Havok 2.3's vehicle SDK** sitting under
a **custom AA layer called `VehicleAction`** (confirmed via the string
`"VehicleAction::havok code"` at `0x9d5534` and `"VehicleAction::applyAction"` at
`0x9d5550`, both in `autoassault.exe`). `VehicleAction::applyAction` is the per-tick
driver; it is a raycast-vehicle controller (one chassis rigid body, wheels are
raycasts, not separate physics bodies) that reads `VehicleSpecific` data and drives
Havok's internal solver.

Every physics parameter is **per-vehicle DATA**, not code, stored in `clonebase.wad`
and already parsed server-side into
`VehicleSpecific` (`src/AutoCore.Game/CloneBases/Specifics/VehicleSpecific.cs`). This
is what makes a faithful port tractable: the JS port reads the same numbers the
retail client reads, for all 1,751 vehicle clonebases.

### Pipeline

```
clonebase.wad
   │  (AssetManager.LoadCloneBasesOnly — no MySQL, no GLMs)
   ▼
tools/AutoCore.PhysicsDump  →  tools/model-viewer/vehicle-physics.json
tools/AutoCore.EquipmentDump → tools/model-viewer/equipment-catalog.json
   │
   ▼
tools/model-viewer/vehicle/*.js  (Engine, Transmission, Suspension, Brakes,
   Steering, Friction, Aerodynamics, SpinDamper, RigidBody, VehicleController)
   │
   ▼
tools/model-viewer/play.html  (three.js render + input + chase cam + HUD)
```

Terrain and object placement are shared with the level renderer
(`docs/level-renderer.md`) — `play.html` loads the same per-map JSON and the same
`.tga`-alpha heightfield, and additionally uses it as the vehicle's **collision**
surface (see "Terrain collision" below).

---

## `tools/AutoCore.PhysicsDump/` — the data dump tool

```
physicsdump.exe <gamePath> <outputJsonPath>
  e.g. physicsdump.exe "C:\Program Files (x86)\NetDevil\Auto Assault" tools/model-viewer/vehicle-physics.json
```

C# console tool, references `AutoCore.Game`. Loads only `clonebase.wad` via
`AssetManager.Instance.LoadCloneBasesOnly()` (added to `AssetManager.cs` for exactly
this kind of tooling — no MySQL, no GLM archives needed). Enumerates every
CloneBase via the new `AssetManager.GetCloneBasesByType(CloneBaseObjectType.Vehicle)`
helper, and for each vehicle:

- Dumps the full `VehicleSpecific` struct (every field — see the inventory below) to
  a flat DTO.
- Resolves `DefaultWheelset` → the linked `CloneBaseWheelSet` → `Wheel0Name`,
  `Wheel1Name`, `WheelSetType`, and the wheelset's own `Friction[6]` (int16 array —
  a Havok friction-material table not yet consumed by the JS port; `friction.js`
  currently uses a single tuned `baseFriction` constant instead).
- Flags **exotic** vehicles: `WheelExistance` (a wheel *count*, not a bitmask) other
  than 4. Of 1,751 vehicles: **1,505 are standard 4-wheel**, **126 are 6-wheel**
  (tanks/trikes — paired-axle steering/torque not modeled), **120 are 2-wheel**
  (motorcycles — no balancing model). Exotic vehicles still get a controller and
  can be "driven" in the demo (with an on-screen warning), but the suspension/wheel
  arrays are built for 4 wheels, so handling is wrong for the other 246.

Output: `tools/model-viewer/vehicle-physics.json` — `{ vehicles: [...] }`, one entry
per vehicle CBID with `Cbid`, `UniqueName`, `ShortDesc`, `PhysicsName`, `Mass`,
`Scale`, `Wheel0Name`, `Wheel1Name`, `WheelSetType`, `WheelFriction`, `IsExotic`,
`ExoticReason`, and the full `VehicleSpecific` nested object.

---

## `tools/AutoCore.EquipmentDump/` — equipment catalog dump

```
equipmentdump.exe <gamePath> <outputJsonPath>
  e.g. equipmentdump.exe "C:\Program Files (x86)\NetDevil\Auto Assault" tools/model-viewer/equipment-catalog.json
```

C# console tool (same `AssetManager.LoadCloneBasesOnly()` pattern as PhysicsDump).
Enumerates clonebases by type and writes `tools/model-viewer/equipment-catalog.json`:

| Collection | Source type | Key fields |
|---|---|---|
| `Vehicles` | `CloneBaseObjectType.Vehicle` | `HardPoints[3]`, `HardPointFacing`, `VehicleFlags`, weight limits, `TurretSize`, `DefaultWheelset`, `WheelAxle` |
| `Weapons` | `Weapon` | `FirePoint`, `Flags`, `CanBeFront/Back/Turret`, `TurretSize`, `Mass`, `PhysicsName` |
| `WheelSets` | `WheelSet` | `Wheel0Name`, `Wheel1Name`, `WheelSetType`, `Friction[6]` |
| `Ornaments` | `Item` subtype 10 | `PhysicsName`, `Mass`, `Scale` |
| `Armors` | `Armor` | `PhysicsName`, `Mass`, `Scale` |

Weapon `Flags` bits (from `tWeapon` schema): `0x1` front, `0x2`/`0x4` rear/drop,
`0x10` turret. The play.html loadout panel reads this file via `vehicle-equipment-lib.js`
(compatibility) and `vehicle-equipment-mesh.js` (hardpoint mounting).

---

## `VehicleSpecific` field inventory

Source: `src/AutoCore.Game/CloneBases/Specifics/VehicleSpecific.cs`. Grouped by the
component each field feeds, with **confirmed** semantics from simulating the full
1,751-vehicle dataset (marked ✅) vs. fields not yet consumed by the JS port.

**Chassis / mass**
- `HardPoints[3]` (Vector3) — weapon/attachment mounts (not physics-relevant)
- `CenterOfMassModifier` (Vector3) ✅ — offset from geometric center, applied as
  `comOffset` in `controller.js` (stored, not yet fed into the inertia tensor —
  see "Open items")
- **`RVInertiaRoll/Pitch/Yaw` (float) ✅ CONFIRMED: per-axis moment-of-inertia
  *scalar multipliers* (~1–5, median ~3), NOT absolute kg·m².** This was the first
  major bug found: treating them as raw inverse-inertia values spins a car to
  millions of rad/s and flips it on first wheel contact. Correct approach
  (`controller.js` constructor): compute a solid-box base inertia tensor from mass
  + an approximate body size derived from the wheel-hardpoint spread, then multiply
  each axis by its `RVInertia*` scalar. Axis mapping (local space, X=right, Y=up,
  Z=forward): `RVInertiaPitch`→about X, `RVInertiaYaw`→about Y, `RVInertiaRoll`→about Z.

**Suspension** (per-wheel raycast, `suspension.js`)
- `WheelHardPoints[6]` (Vector3) — suspension top-mount positions in the **visual
  vehicle frame** (same coordinate system as `obj_<UniqueName>` geos). `play.html`
  places animated `Wheel0Name` meshes at these raw `(X, Y, Z)` values after loading
  the visual body via `geo-mesh.js` (see "Vehicle ↔ model linkage" below).
- `SuspensionLength` (FrontRear) — max travel in meters
- **`SuspensionStrength` (FrontRear, ~28–30) ✅ CONFIRMED: a per-unit-MASS spring
  constant.** Force = `strength · compression_meters · mass − damping · suspVel ·
  mass` (both terms scaled by mass, not just the spring term). `compression` is
  travel in **meters** (0..SuspensionLength), not a 0–1 ratio — an earlier attempt
  to treat it as normalized produced comically soft/stiff suspensions depending on
  `SuspensionLength`. With mass-scaling, resting compression settles at
  `gravity/(4·strength)` regardless of vehicle mass, landing at a sane fraction of
  the ~0.3 m typical travel.
- `SuspensionDampeningCoefficientCompression/Extension` (FrontRear) — different
  damping per travel direction, applied by sign of compression velocity.
- `ShockAttachPoints[6]`, `ShockScale[2]`, `ShockEffectThreshold`, `DrawShocks[2]`,
  `AxleScale[2]`, `DrawAxles[2]` — visual-only (shock/axle rod rendering), not
  consumed by the physics.
- `WheelRadius[6]`, `WheelWidth[6]` — used for raycast length and wheel mesh scale.
- `WheelAxle`, `WheelExistance` — `WheelExistance` is a wheel **count** (2/4/6), see
  "exotic" handling above.

**Engine** (`engine.js`, ✅ RE-confirmed against `VehicleEngine_torqueCurve2D`)
- `MinimumRPM`, `OptimumRPMMin`, `OptimumRPMMax`, `MaximumRPMMax` (float) — 4-point
  RPM breakpoints.
- `MinTorqueFactor`, `MaxTorqueFactor` (float) — torque multiplier at those
  breakpoints.
- `MinimumResistance`, `OptimumResistance`, `MaximumResistance` (float) — engine
  braking torque multiplier at the same breakpoints.
- `TorqueMax` (short) — peak torque the above factors scale.
- The client's actual implementation (`VehicleEngine_torqueCurve2D` @ `0x4a9750`) is
  a **2D byte-indexed lookup table** (RPM bin × throttle bin → one of 8 discrete
  factor levels via `& 7`), not a continuous curve — but this is an AA-specific
  quantization detail that doesn't change the curve *shape*. `engine.js` uses a
  smooth piecewise-linear interpolation between the 4 breakpoints, which reproduces
  the same shape (flat torque band through the optimum RPM range, ramping down at
  both ends) without replicating the 8-level quantization.

**Transmission** (`transmission.js`)
- `NumberOfGears`, `GearRatios[5]`, `TransmissionRatio`, `ReverseGearRation` (sic —
  typo is in the original field), `ClutchDelayTime`, `DownshiftRPM`, `UpshiftRPM`.
- `WheelTorqueRatios` (FrontRear) — front/rear drive-torque split (AWD blend).
- RE confirmation (`VehicleAction_applyAction`'s mode-0x02 path): RPM = wheel RPM ×
  gear ratio × transmission ratio; upshift when `RPM > UpshiftRPM` and gear < max;
  downshift when `RPM < DownshiftRPM` and gear > 1. `transmission.js` implements
  exactly this state machine.

**Brakes** (`brakes.js`)
- `BrakesMaxTorque`, `BrakesMinBlockTime`, `BrakesPedalInput` (all FrontRear).
- RE note (`VehicleAction_calcWheelTorque`): handbrake locks rear wheels only;
  front wheels roll free — implemented as-is.

**Steering** (`steering.js`) ✅ CONFIRMED
- `SteeringMaxAngle`, `SteeringFullSpeedLimit`.
- Two steering behaviors were found layered in the client: AA's own mode-0x02 input
  ramp (`steering = throttle_value × speedFactor`, `speedFactor = min(speed/0.6,
  1.0)`, a **linear** ramp saturating at 0.6 m/s — this governs how fast the
  *input* reaches full deflection) and Havok's own `hkVehicleSteering` component
  underneath, which applies the standard **inverse-speed falloff** to the actual
  wheel angle: `angle = maxAngle · clamp(fullSpeedLimit / max(speed,
  fullSpeedLimit), 0, 1)`. `steering.js` implements the inverse-speed formula
  (the one that actually determines wheel angle vs. speed).

**Aerodynamics** (`aerodynamics.js`)
- `AerodynamicsFrontalArea`, `AerodynamicsDrag`, `AerodynamicsLift`,
  `AerodynamicsAirDensity` — standard `0.5·ρ·A·Cd·v²` drag/lift.
- **`AerodynamicsExtraGravity` (Vector3, Y ≈ −10) ✅ CONFIRMED: must be applied only
  while AIRBORNE, not as constant weight.** All 1,505 non-exotic vehicles'
  suspensions can support standard gravity (9.81); roughly 150 of them **cannot**
  support `9.81 + |ExtraGravity|` — applying it constantly sinks those vehicles
  through the floor. Read as a downforce/"land faster" term active only during
  jumps. (The exact sign/intended use is still not verified against a decompiled
  Havok aerodynamics call — flagged open below.)

**Anti-roll / spin damping** ✅ CONFIRMED via `VehicleAction_airStabilization`
(`0x598320`), "AVD" = Angular Velocity Damper:
- `AVDNormalSpinDamping` — applied **continuously** as the chassis's angular
  damping coefficient.
- `AVDCollisionSpinDamping` — applied **only within a 6,400-tick (~1.07s @ 60Hz)
  window after a collision** whose impact velocity exceeds `AVDCollisionThreshold`,
  as an *additive* on top of a fixed engine constant (`10.0`).
- Acts on **all three angular velocity axes** (roll, pitch, yaw), not just yaw.
- `spinDamper.js` implements both the continuous and windowed behavior, plus a
  separate air-stabilization torque (`RVExtraAngularImpulse` scaled 15× for
  roll/pitch, 6× for yaw) that only applies while airborne — this second
  mechanism is inferred by analogy with the collision damper, not itself traced to
  a specific decompiled formula.

**"RV" block**
- `RVFrictionEqualizer`, `RVSpinTorqueRoll/Pitch/Yaw`, `RVExtraAngularImpulse`,
  `RVExtraTorqueFactor` — `RVExtraAngularImpulse` is used (air stabilization,
  above); the others are not yet consumed by any module.

**Speed governors (AA-specific, layered on Havok)** — **PARTIALLY OPEN**, see below.
- `SpeedLimiter`, `AbsoluteTopSpeed`, `RearWheelFrictionScalar` (the last one ✅
  confirmed via `VehicleAction_calcWheelTorque` — rear-axle-only traction scalar,
  default base `0.5` in the client, overridden per-vehicle).

**Not consumed by physics** (RPG/loadout stats): `DefaultColors[3]`,
`DefaultWheelset`/`DefaultDriver` (used for model linkage, not physics),
`NumberOfTrims`/`NumberOfTricks`/`Tricks[]`, `ArmorAdd`/`CooldownAdd`/
`HeatMaxAdd`/`PowerMaxAdd`, `MaxWtWeapon*`/`MaxWtArmor`/`MaxWtEngine`,
`DefensivePercent`, `MeleeScaler`, `InventorySlots`, `TurretSize`, `VehicleFlags`,
`VehicleType`, `ClassType`, `HitchPoint`.

**Prefix/mod adjustments** — deferred entirely. The `vPrefixVehicle` SQL view
(referenced in a Ghidra string) layers percent/flat adjustments on top of base
stats for equipped prefixes; not implemented in the JS port.

---

## Ghidra reverse-engineering (project `AA-decode`, saved)

All of the following are renamed with detailed plate comments in Ghidra —
`docs/geo-format.md`'s convention (rename `FUN_xxx` → descriptive name, plate
comment with source-string evidence and field semantics, then save the program)
was followed throughout.

| Address | Name | What it does |
|---|---|---|
| `0x598650` | `VehicleAction_applyAction` | Per-tick driver. Reads movement mode (byte @ entity+0x4ce); mode `0x02` = analog throttle ramp (rate `DAT_00a10e74`=2.0/s), linear speed-factor steering (`min(speed/0.6, 1.0)`, `DAT_00af3388`=0.6). |
| `0x598040` | `VehicleAction_calcWheelTorque` | Per-wheel traction: `torqueCurve(rpm,throttle) × upright_dot × lowSpeedBoost × rearScalar`, clamped to `[0, 1000]` (`DAT_00a0f520`). Low-speed boost: `speed<15 → ×((15−speed)·0.2+1)` (`DAT_00aaa7a4`, `DAT_00a0f70c`). Rear scalar base `0.5` (`DAT_00a0f298`). Upright threshold `0.8` (`DAT_00a0f698`). |
| `0x4a9750` | `VehicleEngine_torqueCurve2D` | 2D byte-indexed torque table (RPM bin × throttle bin → 1-of-8 factor level via `&7`). Confirms the engine curve *shape*; the 8-level quantization is AA-specific and not replicated in JS. |
| `0x598320` | `VehicleAction_airStabilization` | AVD damping. Continuous `AVDNormalSpinDamping`; `AVDCollisionSpinDamping` additive (`DAT_00a110d8`=10.0) for 6,400 ticks (`DAT_00b041cc` global tick counter) after a collision, on all 3 angular axes. |
| `0x636a60` | `VehicleAction_tickSubsystems` | Generic per-component tick dispatcher (calls a shared vtable slot on self + 7 sub-objects). **Not** gearbox/speed-limiter logic — see correction below. |
| `0x636410` | *(unnamed)* | Trivial `*(this+0x50) = param` setter. Purpose unconfirmed. |

**Correction made this pass**: `VehicleAction_applyAction`'s plate comment
previously claimed `SpeedLimiter`/`AbsoluteTopSpeed` were handled in
`FUN_00636410`/`FUN_00636a60`. Decompiling both showed that claim was wrong —
`0x636a60` is a generic tick dispatcher with no speed-limiter math visible, and
`0x636410` is a one-line float setter. The claim has been removed from the plate
comment and replaced with an explicit "still open" note (both in Ghidra and in this
doc) rather than left as an uncorrected guess.

---

## `tools/model-viewer/vehicle/*.js` — the ten modules

Each takes the relevant `VehicleSpecific` slice and stays independently readable;
`controller.js` orchestrates all of them once per fixed 60 Hz tick.

- **`rigidBody.js`** — minimal `RigidBody`/`Vec3`/`Quat` (no external physics
  engine). Semi-implicit Euler integration. Chosen over Rapier/cannon-es because
  Havok's vehicle model needs a raycast vehicle (wheels are not separate bodies)
  and a purpose-built body gives full control over the inertia tensor and AVD
  damping without external dependencies or WASM-loading concerns.
- **`engine.js`** — 4-point piecewise-linear torque curve (see above).
- **`transmission.js`** — gear state machine, RPM↔wheel-speed conversion.
- **`suspension.js`** — per-wheel raycast against the terrain height function;
  spring/damper force scaled by chassis mass (see `SuspensionStrength` above).
  Distance-to-ground uses the actual terrain function everywhere (no fixed-length
  "catch ray"), which avoids tunnelling on fast landings.
- **`brakes.js`** — per-axle brake torque, handbrake locks rear only.
- **`steering.js`** — inverse-speed-falloff wheel angle (see above).
- **`friction.js`** — simplified slip-based Pacejka-lite (longitudinal + lateral,
  friction-circle clamped). This remains the least-certain component — Havok's
  actual `hkVehicleFrictionSolver` is not replicated, only approximated. Two bugs
  fixed here during driving validation:
  - Slip was gated to zero below 0.5 m/s reference speed, so a stopped car under
    throttle got no traction until wheels spun up and then lurched violently past
    the threshold. Fixed by flooring the reference speed (`vRef = max(|vForward|,
    2.0)`) so traction is continuous through a standstill.
  - `normalLoad` was computed as `suspensionForce × mass × 0.01` (double-counting
    mass on top of the already-mass-scaled suspension force, ~18× too large),
    producing tyre forces large enough to flip vehicles. Fixed to
    `normalLoad = suspensionForce` (already in Newtons).
- **`aerodynamics.js`** — drag/lift + airborne-only `ExtraGravity` (see above).
- **`spinDamper.js`** — AVD continuous + collision-windowed damping, plus air
  stabilization torque (see above).
- **`controller.js`** — `VehicleAction::applyAction` equivalent. Orchestrates:
  input → throttle ramp → steering → suspension raycasts → engine RPM →
  transmission → per-wheel torque + traction → wheel-speed integration →
  suspension force application → tyre friction → aerodynamics → spin damping →
  speed governors → rigid-body integration → anti-tunnel safety net. One
  additional bug fixed here during validation: suspension force was originally
  applied along the **chassis** up-axis, so a tumbled/flipped car pushed itself
  sideways or downward and sank through the terrain permanently once rolled over.
  Fixed to apply along the **contact normal** (world up for this heightfield),
  matching the standard raycast-vehicle convention (cf. Bullet `btRaycastVehicle`)
  — the wheels can now always recover the chassis regardless of orientation.

### Anti-tunnel safety net (`controller.js`, end of `step()`)

Spring suspension alone cannot absorb a fast landing within its short travel: the
chassis bottoms out, sinks meters into the terrain, and the capped spring pumps
that back as a bigger bounce — a porpoising runaway that was observed reaching
178 mph before tunnelling through the ground entirely. Fix: after integration,
check every wheel hardpoint's world position against the terrain height function;
if any hardpoint is below ground, push the whole chassis up by the deepest
violation and zero the downward velocity component (an inelastic landing). This is
a position/velocity projection, not a stiff force, so it stays stable at 60 Hz
regardless of impact speed. Note that the `AbsoluteTopSpeed` governor only clamps
the *forward* velocity component — it does not, by itself, stop a tumbling or
purely-vertical runaway.

---

## Terrain collision (`play.html`)

`play.html` reuses the exact same `.tga`-alpha heightfield as the level renderer
(`docs/terrain-format-findings.md` / `docs/level-renderer.md`), decimated to the
same ≤400-segment grid the *visual* mesh uses. Two fixes were needed to make this
usable as a **collision** surface, not just a picture:

- **Decimation must match exactly.** The rendered mesh only samples every
  `step`-th heightfield cell; if the collision function samples the *full*
  (undecimated) heightfield, the physics collides against a finer, invisible
  surface up to ~165 world units off the drawn terrain on `scrapvalley` — the car
  visibly drives through solid-looking ground. Fix: derive the collision height
  function from the **same** decimated grid, with **bilinear interpolation** across
  the same triangle split the render mesh's index buffer uses (matching the
  `(a, d2, b, b, d2, e2)` diagonal), so collision height equals drawn height
  everywhere with no seams between cells.
- **Nearest-cell height was too coarse for driving speed.** An earlier version
  used nearest-cell (not bilinear) sampling; since alpha×4 has up to ~24 m of
  vertical step between adjacent cells, a car would hit what amounted to an
  invisible cliff at speed. Bilinear interpolation (matching the smooth visual
  mesh) fixed this.
- Out-of-range queries clamp to the nearest edge cell (not 0), so a vehicle
  approaching the map edge doesn't get pitched into a cliff at the boundary.

**Prop collision is not implemented.** `play.html` ships a visible in-app notice
(`#cache-info` panel) explaining this: static props/buildings from the level are
rendered but have no collider, so vehicles pass through them. Real collision
shapes exist in `physics.glm`'s `.cache` files (7,510 Havok-serialized shapes,
`assets/extracted/physics/*.cache`) but the format hasn't been reverse-engineered.
This is Tier 3 scope.

---

## Vehicle ↔ model linkage (`play.html buildVehicleMesh`)

Shared mesh assembly lives in `tools/model-viewer/geo-mesh.js` (pure helpers in
`geo-mesh-lib.js`; tests in `geo-mesh.test.js`). Same LOD0 / no-shadow section
filter and `buildMaterial` path as `index.html` / `viewer.js`.

- **Body model**: resolved via `resolveModelStem()` — tries `obj_<UniqueName>`,
  then `UniqueName`, then `obj_<PhysicsName>`, then `PhysicsName` against the
  model-viewer geo index. Prefers the full visual `obj_veh_*` geo (wheels baked
  in at correct positions) over the stripped physics-only `veh_*` body proxy.
- **Body mesh**: `filterBodySections()` (`pickLod0Sections` + baked-wheel cull).
  When `Wheel0Name` is present, separate low wheel sections in `obj_veh_*` geos are
  omitted (vertex Y at the body XOBB floor and confined below center + 0.75 m).
  If culling would remove every section, all LOD0 sections are kept so the body
  never disappears on monolithic `veh_*` fallbacks.
- **Wheel model**: `Wheel0Name` from the linked `CloneBaseWheelSet`, instanced at
  each raw `WheelHardPoints[i]`. Per-wheel scale comes from `WheelRadius[i]` and
  `WheelWidth[i]` (world meters) divided by the wheel geo's authored
  `bodyBBox.radius` and X extent (`geoAuthoredWheelMetrics` /
  `wheelMeshScaleFromPhysics` in `geo-mesh-lib.js`). Radius scales Y and Z
  (roll axis is X); width scales X, negated on the left side for mirroring.
  Example: Callisto X rear wheels use radius 0.83 m vs front 0.7 m on
  `whl_h_4_01_rivits` (authored radius ~0.528 m).
- **Wheel animation** each frame: `steerPivot` (rotates Y for steering, front wheels
  only) → `dropGroup` (translates Y by live suspension compression) → `wheelMesh`
  (rotates X for rolling, driven by `wheel.wheelAngularVel`).
- Missing body/wheel models fall back to a plain box (body) or are omitted (wheels).

---

## Vehicle equipment linkage (Ghidra RE + `play.html` loadout panel)

Data: `tools/model-viewer/equipment-catalog.json` (from `tools/AutoCore.EquipmentDump`).
Compatibility: `vehicle-equipment-lib.js`; mesh mounting: `vehicle-equipment-mesh.js`.

### Client equip path (`FUN_00502e90`)

Inventory drag/drop calls a switch on equipped item clonebase type:

| Type enum | Item | Stored on `CVOGVehicle` |
|---|---|---|
| 12 (`Weapon`) | Weapon | `weapons[3]` @ instance `+0x260` (slots 0=front, 1=turret, 2=rear) |
| 16 (`WheelSet`) | Wheelset | `wheelset` @ `+0x600` |
| 6 (`Item`, subtype 10) | Ornament kit | `ornament` @ `+0x26c` |
| 28 (`Armor`) | Armor | `armor` @ `+0x254` |

Weapon slot routing reads **chassis** `VehicleSpecific.VehicleFlags` (clonebase offset used at
equip time matches the dumped short field):

| Bit | Slot |
|---|---|
| `0x2` | Front weapon |
| `0x4` | Rear weapon (`MaxWtWeaponDrop` weight limit) |
| `0x10` | Turret |

Observed values: `6` = front+rear, `22` = front+rear+turret (`0x2 \| 0x4 \| 0x10`).

### Per-frame graphics (`CVOGVehicle::UpdateGraphics` @ `0x500560`)

1. Wheels: child graphics `[0 .. wheelCount-1]` at `WheelHardPoints[i]` (same as physics port).
2. Weapons: child index `wheelCount + slotIndex`; transform from `FUN_005fb6a0`:
   chassis matrix × `HardPoints[slotIndex]` basis × weapon `FirePoint` local offset.
3. If `WheelAxle > 2` and slot index is even, apply 180° yaw (mirror).

`HardPoints[3]` and `HardPointFacing` live in `VehicleSpecific` ([`VehicleSpecific.cs`](src/AutoCore.Game/CloneBases/Specifics/VehicleSpecific.cs))
but were omitted from the physics-only dump; the equipment catalog includes them.

### Compatibility checks (replicated in `vehicle-equipment-lib.js`)

| Check | Source |
|---|---|
| Slot exists | `VehicleFlags` bits above |
| Weapon allowed on slot | `WeaponSpecific.Flags` → `CanBeFront/Back/Turret` |
| Weight | `Mass <= MaxWtWeaponFront/Turret/Drop` or `MaxWtArmor` |
| Turret size | `weapon.TurretSize <= vehicle.TurretSize` |
| Class | `RequiredClass` is a **character** prerequisite; skipped in `play.html` (no avatar) |

Weapon flag bits (from `tWeapon` schema): bit0=front (`0x1`), bit1/2=rear/drop
(`0x2`/`0x4`), bit4=turret (`0x10`).

### `play.html` loadout UI

Toggleable **Loadout** sidebar tab (HUD button or **L** key; **Escape** closes):
front / turret / rear weapons, wheelset, ornament, armor.
Lists filtered by `listCompatibleParts()`; mesh rebuild via `buildVehicleMesh(vehicle, loadout)`.
Loadout choices persist per vehicle CBID in `sessionStorage`.

### `play.html` equipment mesh transforms (`vehicle-equipment-mesh.js`)

Simplified port of `FUN_005fb6a0` (full 4×4 hardpoint basis not yet dumped):

- **Weapons:** translate to `HardPoints[slot]`; yaw = 180° on rear slot; extra 180° on
  even slots when `WheelAxle > 2`. Local offset seats geo min-Z/min-Y on the hardpoint
  (`weaponMeshLocalOffset`). `HardPointFacing` is **not** a degrees field — do not
  apply it as yaw. `FirePoint` is a muzzle offset for projectiles, not mesh placement.
- **Ornaments / armor:** additive mount on `bodyContainer`; `alignKitToBodyOffset`
  shifts kit min-Y (and X/Z) to match the loaded body geo floor so kits authored in
  `obj_veh` space align with `veh_*` / `obj_veh_*` bodies.

---

## Non-goals (Tier 3, still out of scope)

- Havok 2.3's actual constraint solver, integration scheme, or fixed-timestep
  semantics — the JS `RigidBody` is a from-scratch approximation, not a port.
- Bit-identical collision response.
- `.cache` prop collision (see "Terrain collision" above).
- Prefix/mod stat adjustments (`vPrefixVehicle`).
- 6-wheel and 2-wheel vehicle models (246 of 1,751 vehicles — flagged `IsExotic`
  and drivable-but-wrong rather than blocked).
- Multiplayer/server-authoritative reconciliation.

---

## Open items (resolve with more Ghidra RE if picked back up)

1. **`SpeedLimiter` vs `AbsoluteTopSpeed` interaction — genuinely unresolved**
   (corrected this pass; the previous doc's answer was based on functions that
   turned out not to contain this logic). `controller.js` currently uses its own
   reasonable-but-unverified approximation: a soft linear taper of drive torque
   between the two, then a hard velocity clamp at `AbsoluteTopSpeed`.
2. **Exact tyre friction/slip formula** — Havok's `hkVehicleFrictionSolver` internals
   were never located; `friction.js`'s Pacejka-lite is a deliberate approximation.
3. **`AerodynamicsLift` sign convention** — assumed standard (+up = lift) by
   analogy with Havok's public API shape, not confirmed against a decompiled call.
4. **`CenterOfMassModifier`** is parsed and stored (`comOffset` in
   `controller.js`) but not yet applied to the inertia tensor or force application
   point — a no-op today.
5. **`WheelSetSpecific.Friction[6]`** (per-wheelset Havok friction-material table)
   is dumped by `PhysicsDump` but not consumed; `friction.js` uses one tuned
   constant for all vehicles instead.
6. **6-wheel and 2-wheel physics models** are simply not built (see "exotic"
   above) — would need paired-axle steering/torque (6-wheel) and a balance
   controller (2-wheel, motorcycle-style).
