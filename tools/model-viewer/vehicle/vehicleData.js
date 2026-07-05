// vehicleData.js — maps a vehicle-physics.json entry (VehicleSpecific DTO from
// tools/AutoCore.PhysicsDump) onto the recovered Havok component descriptors.
// Field ↔ client-struct mapping: docs/vehicle-physics-port.md
// "RE v2 — client vehicleData struct ↔ VehicleSpecific mapping".

import { Vec3 } from './hkMath.js';

const WHEEL_COUNT = 4; // this port: 4-wheel vehicles only

export function buildDescriptors(entry) {
  const vs = entry.VehicleSpecific;
  const frontCount = 2; // 4-wheel: 2 front, 2 rear (client: vehicleData+0x4cc from WheelAxle)
  const isFront = (i) => i < frontCount;

  // VehicleFlags bits (client vehicleData+0x5f0):
  // bit0 handbrake-front, bit1 handbrake-rear, bit2 steer-front, bit3 steer-rear
  const flags = vs.VehicleFlags | 0;
  const handbrakeF = (flags & 1) !== 0, handbrakeR = (flags & 2) !== 0;
  const steerF = (flags & 4) !== 0, steerR = (flags & 8) !== 0;

  // wheelset friction table (shorts, e.g. [3,2,3,3,3,2]) — used RAW as the
  // per-wheel base μ (FUN_004f5550 getter feeds both the wheels descriptor and
  // calcWheelTorque); rear wheels × RearWheelFrictionScalar (vehicleData+0x740).
  const rawFriction = (entry.WheelFriction && entry.WheelFriction.length)
    ? entry.WheelFriction : [1, 1, 1, 1, 1, 1];
  const friction = [];
  for (let i = 0; i < WHEEL_COUNT; i++) {
    let f = rawFriction[i];
    if (!isFront(i)) f *= vs.RearWheelFrictionScalar || 1;
    friction.push(f);
  }

  const perWheelFR = (front, rear) =>
    Array.from({ length: WHEEL_COUNT }, (_, i) => (isFront(i) ? front : rear));

  const gears = vs.GearRatios.slice(0, vs.NumberOfGears || vs.GearRatios.length);

  return {
    wheels: {
      radius: vs.WheelRadius.slice(0, WHEEL_COUNT),
      width: vs.WheelWidth.slice(0, WHEEL_COUNT),
      axle: Array.from({ length: WHEEL_COUNT }, (_, i) => (isFront(i) ? 0 : 1)),
      friction,
    },
    steering: {
      maxSteeringAngle: vs.SteeringMaxAngle,             // +0x594 (radians)
      maxSpeedFullSteeringAngle: vs.SteeringFullSpeedLimit, // +0x598
      wheelsDoesSteer: Array.from({ length: WHEEL_COUNT }, (_, i) => (isFront(i) ? steerF : steerR)),
    },
    transmission: {
      downshiftRPM: vs.DownshiftRPM,                     // +0x69c
      upshiftRPM: vs.UpshiftRPM,                         // +0x69e
      primaryTransmissionRatio: vs.TransmissionRatio,    // +0x6c4
      clutchDelayTime: vs.ClutchDelayTime,               // +0x6cc
      reverseGearRatio: vs.ReverseGearRation,            // +0x6c8 (sic)
      gearsRatio: gears,                                 // +0x6d0
      // WheelTorqueRatios split equally across each axle's wheels (FUN_005fc840)
      wheelsTorqueRatio: Array.from({ length: WHEEL_COUNT }, (_, i) =>
        (isFront(i) ? vs.WheelTorqueRatios.Front / frontCount
                    : vs.WheelTorqueRatios.Rear / (WHEEL_COUNT - frontCount))),
    },
    brake: {
      wheelsMaxBrakingTorque: perWheelFR(vs.BrakesMaxTorque.Front, vs.BrakesMaxTorque.Rear),
      wheelsMinPedalInputToBlock: perWheelFR(vs.BrakesPedalInput.Front, vs.BrakesPedalInput.Rear),
      wheelsIsConnectedToHandbrake: Array.from({ length: WHEEL_COUNT }, (_, i) => (isFront(i) ? handbrakeF : handbrakeR)),
      wheelsMinTimeToBlock: 0, // binary hard-sets 0 (FUN_005fcb00; BrakesMinBlockTime unused!)
    },
    suspension: {
      hardpoints: vs.WheelHardPoints.slice(0, WHEEL_COUNT).map(p => new Vec3(p.X, p.Y, p.Z)), // +0x514, RAW
      lengths: perWheelFR(vs.SuspensionLength.Front, vs.SuspensionLength.Rear),
      wheelsStrength: perWheelFR(vs.SuspensionStrength.Front, vs.SuspensionStrength.Rear),
      wheelsDampingCompression: perWheelFR(
        vs.SuspensionDampeningCoefficientCompression.Front,
        vs.SuspensionDampeningCoefficientCompression.Rear),
      wheelsDampingRelaxation: perWheelFR(
        vs.SuspensionDampeningCoefficientExtension.Front,
        vs.SuspensionDampeningCoefficientExtension.Rear),
    },
    aerodynamics: {
      airDensity: vs.AerodynamicsAirDensity,
      frontalArea: vs.AerodynamicsFrontalArea,
      dragCoefficient: vs.AerodynamicsDrag,
      liftCoefficient: vs.AerodynamicsLift,
      extraGravity: new Vec3(vs.AerodynamicsExtraGravity.X, vs.AerodynamicsExtraGravity.Y, vs.AerodynamicsExtraGravity.Z),
    },
    damper: {
      normalSpinDamping: vs.AVDNormalSpinDamping,
      collisionSpinDamping: vs.AVDCollisionSpinDamping,
      collisionThreshold: vs.AVDCollisionThreshold,
    },
    engine: { // AA layer (VehicleEngine_torqueCurve2D shape — 4-breakpoint curve)
      minimumRPM: vs.MinimumRPM,
      optimumRPMMin: vs.OptimumRPMMin,
      optimumRPMMax: vs.OptimumRPMMax,
      maximumRPMMax: vs.MaximumRPMMax,
      minTorqueFactor: vs.MinTorqueFactor,
      maxTorqueFactor: vs.MaxTorqueFactor,
      minimumResistance: vs.MinimumResistance,
      optimumResistance: vs.OptimumResistance,
      maximumResistance: vs.MaximumResistance,
      torqueMax: vs.TorqueMax,
    },
    chassis: {
      mass: entry.Mass,
      // RVInertia* = per-axis inertia scalar multipliers (0x64b2b0 confirmed).
      // Base inertia = solid box from wheel-hardpoint spread (v1 approach kept —
      // exact client base uses |R|·scalars·mass; see initFromDescriptor notes).
      inertiaScalars: { roll: vs.RVInertiaRoll, pitch: vs.RVInertiaPitch, yaw: vs.RVInertiaYaw },
      // RVSpinTorque* / RVInertia* = the SOLVER-facing angular response ratios
      // (fw+0x320..0x32c; framework desc[0xb..0xd]/[0x11..0x13] from
      // vehicleData +0x5c8..0x5d0 / +0x5dc..0x5e4) — the no-rollover mechanism.
      spinTorqueScalars: { roll: vs.RVSpinTorqueRoll, pitch: vs.RVSpinTorquePitch, yaw: vs.RVSpinTorqueYaw },
      centerOfMassModifier: new Vec3(vs.CenterOfMassModifier.X, vs.CenterOfMassModifier.Y, vs.CenterOfMassModifier.Z), // consumer still open
    },
    aa: { // AA VehicleAction layer values
      speedLimiter: vs.SpeedLimiter,
      absoluteTopSpeed: vs.AbsoluteTopSpeed,
      extraTorqueFactor: vs.RVExtraTorqueFactor || 0,   // fw+0x348 yaw-assist (desc[0xe])
      extraAngularImpulse: vs.RVExtraAngularImpulse || 0,
      rearWheelFrictionScalar: vs.RearWheelFrictionScalar,
      pushBottomUp: vs.PushBottomUp || 0,
    },
  };
}
