# Vehicle Physics Port — Tier 2 ("Parameter-Faithful")

## Context

The retail client simulates vehicles with **Havok 2.3's vehicle SDK** (confirmed in
Ghidra: `hkVehicleComponent`, `hkVehicleFramework`, `hkHavokVehicle`, paths under
`C:\vog\1_code\havok230\include\hkdynamics2\...`, and a custom layer flagged in an
assert string as `"VehicleAction::havok code"`). Havok's vehicle SDK is the classic
**raycast vehicle** architecture: one rigid chassis body, wheels are raycasts (not
separate physics bodies) with spring/damper suspension, and the whole thing is driven
by pluggable *components* — engine, transmission, steering, brake, aerodynamics,
suspension, friction (tyre) — each configured from data.

The critical fact that makes this tractable: **every one of those component
parameters is per-vehicle DATA, not code**, stored in `clonebase.wad` and already
parsed by the server into `VehicleSpecific` (`src/AutoCore.Game/CloneBases/Specifics/VehicleSpecific.cs`).
The field names in that struct are near-1:1 matches for Havok 2.3's stock vehicle
component fields (confirmed via matching Ghidra strings: `resistanceFactorAtMaxRPM`,
`torqueFactorAtMaxRPM/MinRPM`, `wheelsMaxBrakingTorque`, `wheelsTorqueRatio`,
`reverseGearRatio`, `suspensionStrength`, `maxFrictionTorque`, `rlGearRatios0-4`,
`rlReverseGearRatio`, `rlMaximumTorqueFactor`, plus the AA-specific SQL view
`vPrefixVehicle` which adjusts these per equipped prefix/mod).

**Tier 2 goal**: reimplement Havok's default vehicle components in JS/three.js,
driven by the *real* extracted numbers for every vehicle CBID, on a modern physics
engine. This gets correct top speed, gearing, acceleration curve, steering limits,
suspension travel/stiffness, and per-vehicle handling character for all vehicle
variants — without reimplementing Havok's actual solver internals (that's Tier 3,
see the "Non-goals" section).

Estimated effort: **2–4 weeks** for one experienced person, most of it in step 3
(component math) and step 5 (tuning/validation), assuming steps 1–2 (data pipeline)
take a few days.

---

## What we already have (do not redo this work)

- **`docs/geo-format.md`** — full `.geo` model format, chunk-tree parser in both
  Python (`tools/geo_to_obj.py`) and JS (`tools/model-viewer/geo-parser.js`). The
  rendering half of a vehicle demo is solved: body + wheel meshes, materials,
  textures, vehicle paint tinting.
- **`tools/model-viewer/`** — three.js r165 viewer that already loads and textures
  any extracted vehicle model. Its `viewer.js` lighting/renderer/camera scaffold and
  `materials.js` tint shader are directly reusable for a physics demo page.
- **`bounty-hunter-physics.html`** (repo root) — an existing three.js + cannon-es
  demo of the dune buggy with a *hand-tuned, feel-alike* (not data-driven) vehicle
  controller: chassis raycast wheels, GTA-style chase cam, wheel-splitting from the
  baked body mesh, audio, HUD. This is the Tier-1 "feel-alike" baseline. Reusable
  parts: the camera rig, the wheel-mesh-splitting/instancing technique (for vehicles
  whose wheels are baked into the body OBJ rather than separate WheelSet models),
  the render scaffold. **Not reusable**: `VP` physics constants (hand-tuned, not
  from game data), the whole chassis/suspension/engine block — that's what this
  document replaces.
- **Server already parses ALL vehicle physics data.** `AssetManager.GetCloneBase<CloneBaseVehicle>(cbid)`
  (`src/AutoCore.Game/Managers/AssetManager.cs:85`) returns a fully-populated
  `CloneBaseVehicle` → `.SimpleObjectSpecific` / vehicle-specific block containing
  `VehicleSpecific` (see field dump below). No new client-file parser is needed —
  this is a read of data structures that already exist server-side.
- **Ghidra project `AA-decode`** (instance: project name `AA-decode`, TCP
  `127.0.0.1:8089`) has confirmed string evidence for the Havok vehicle component
  names above. Not yet decompiled: the actual `VehicleAction::havok` glue code that
  feeds `VehicleSpecific` into Havok's component setup functions — see step 3b.

---

## Full field inventory: `VehicleSpecific`

Source: `src/AutoCore.Game/CloneBases/Specifics/VehicleSpecific.cs` (already parsed
from `clonebase.wad`, binary layout documented in `ReadNew`). Supporting structs:
`FrontRear` (`{float Front, Rear}`, `src/AutoCore.Game/Structures/FrontRear.cs`) and
`RGB` (`{float R, G, B}`, `src/AutoCore.Game/Structures/RGB.cs`).

Grouped by the Havok vehicle component it almost certainly feeds:

**Chassis / mass**
- `HardPoints[3]` (Vector3) — weapon/attachment mount points
- `HardPointFacing` (int)
- `CenterOfMassModifier` (Vector3) — offset from geometric center, standard Havok
  `hkVehicleChassis` tuning knob for rollover resistance
- `RVInertiaRoll/Pitch/Yaw` (float) — per-axis moment-of-inertia scalars

**Suspension** (per Havok `hkVehicleSuspension`, one set of 6 = one per possible wheel)
- `WheelHardPoints[6]` (Vector3) — wheel attach positions relative to chassis
- `SuspensionLength` (FrontRear)
- `SuspensionStrength` (FrontRear) — spring constant
- `SuspensionDampeningCoefficientCompression` (FrontRear)
- `SuspensionDampeningCoefficientExtension` (FrontRear)
- `ShockAttachPoints[6]` (Vector3), `ShockScale[2]`, `ShockEffectThreshold` (float),
  `DrawShocks[2]` (byte, visual-only)
- `WheelRadius[6]` (float), `WheelWidth[6]` (float), `WheelAxle` (byte),
  `WheelExistance` (byte, bitmask of which of the 6 slots are populated),
  `AxleScale[2]` (float), `DrawAxles[2]` (byte, visual-only)
- `PushBottomUp` (float), `SkirtExtents` (Vector3), `bUseSkirt` (referenced in the
  SQL view string but not in this struct dump — check `vPrefixVehicle` columns
  again if hovercraft-type vehicles need it)

**Engine** (per Havok `hkVehicleDefaultEngine` — field names are near-verbatim
matches to the Ghidra strings `resistanceFactorAtMaxRPM`, `torqueFactorAtMaxRPM`,
`torqueFactorAtMinRPM`)
- `MinimumRPM`, `OptimumRPMMin`, `OptimumRPMMax`, `MaximumRPMMax` (float) — the
  4-point RPM breakpoints of the torque curve
- `MinTorqueFactor`, `MaxTorqueFactor` (float) — torque multiplier at those RPM
  breakpoints (interpolated between them — standard Havok default engine shape:
  flat-ish through the optimum band, falling off at both ends)
- `MinimumResistance`, `OptimumResistance`, `MaximumResistance` (float) — engine
  braking / resistance torque at the same breakpoints
  (`resistanceFactorAtMaxRPM` etc.)
- `TorqueMax` (short) — peak torque value the above factors scale
- `EngineType` (byte)

**Transmission** (per Havok `hkVehicleDefaultTransmission`)
- `NumberOfGears` (byte), `GearRatios[5]` (float) — matches `rlGearRatios0-4`
- `ReverseGearRation` (float, note the typo is in the original field name) —
  matches `reverseGearRatio` / `rlReverseGearRatio`
- `TransmissionRatio` (float) — final drive ratio
- `ClutchDelayTime` (float)
- `DownshiftRPM`, `UpshiftRPM` (short) — auto-shift thresholds
- `WheelTorqueRatios` (FrontRear) — front/rear torque split (AWD blend), matches
  `wheelsTorqueRatio`

**Brakes**
- `BrakesMaxTorque` (FrontRear) — matches `wheelsMaxBrakingTorque`
- `BrakesMinBlockTime` (FrontRear) — minimum time wheel stays locked (ABS-adjacent)
- `BrakesPedalInput` (FrontRear) — pedal response curve scalar

**Steering**
- `SteeringMaxAngle` (float) — max wheel angle at zero speed
- `SteeringFullSpeedLimit` (float) — speed at which steering angle is clamped down
  (standard Havok speed-sensitive steering)

**Aerodynamics**
- `AerodynamicsFrontalArea`, `AerodynamicsDrag`, `AerodynamicsLift`,
  `AerodynamicsAirDensity` (float) — standard drag/lift equation inputs
- `AerodynamicsExtraGravity` (Vector3) — extra downforce/gravity vector

**Anti-roll / spin damping** (`hkVehicleAerodynamics`-adjacent or a custom AA
component — `AVD` likely = "Angular Velocity Damper")
- `AVDNormalSpinDamping` (float)
- `AVDCollisionSpinDamping` (float)
- `AVDCollisionThreshold` (float)

**"RV" block — unclear exact Havok mapping, likely a custom rollover/impact-response layer**
- `RVFrictionEqualizer` (float)
- `RVSpinTorqueRoll/Pitch/Yaw` (float)
- `RVExtraAngularImpulse` (float)
- `RVExtraTorqueFactor` (float)

**Speed governors (AA-specific, layered on top of Havok)**
- `SpeedLimiter` (float)
- `AbsoluteTopSpeed` (float)
- `RearWheelFrictionScalar` (float)

**Non-physics (skip for the physics port, needed for full fidelity later)**
- `DefaultColors[3]` (RGB), `DefaultWheelset`/`DefaultDriver` (int, CBID refs),
  `NumberOfTrims`/`NumberOfTricks` (byte), `Tricks[]`, `ArmorAdd`/`CooldownAdd`/
  `HeatMaxAdd`/`PowerMaxAdd` (short/int, RPG stat modifiers), `MaxWtWeapon*`/
  `MaxWtArmor`/`MaxWtEngine` (float, loadout weight caps), `DefensivePercent`,
  `MeleeScaler`, `InventorySlots`, `TurretSize`, `VehicleFlags`, `VehicleType`,
  `ClassType`, `HitchPoint` (trailer hitch, Vector3).

**Prefix/mod adjustments** (from the `vPrefixVehicle` SQL view string found in
Ghidra) apply *percentage or flat adjustments* on top of the base CBID values for
things like `rlTorqueMaxAdjustPercent`, `rlBrakesMaxTorque{Front,Rear}AdjustPercent`,
`rlSteeringMaxAngleAdjust`, `rlSteeringFullSpeedLimitAdjust`,
`rlAVD{Normal,CollisionSpin}DampeningAdjust`, `rlSpeedAdjustPercent`,
`rlMaxWtWeapon*AdjustPercent`. These are equipment/prefix modifiers (from
`Prefixes/PrefixVehicle.cs` if it exists — check `src/AutoCore.Game/CloneBases/Prefixes/`)
layered on the base vehicle stats. **Defer this to a v2 of the port** — get the
base vehicle simulation right first, then layer prefix adjustments as a second pass
(the math is "adjust the base VehicleSpecific field by the prefix's adjust
percent/flat value before feeding it to the physics controller").

---

## Step-by-step plan

### Step 1 — Data dump tool (few days)

Build a small, one-shot export tool (C#, reuse `AssetManager`) that writes every
vehicle CBID's `VehicleSpecific` (plus display name and wheelset/driver refs) to
JSON, so the JS physics code never has to talk to the server or parse `clonebase.wad`
itself.

- New project or a mode in an existing tool, e.g. `tools/AutoCore.PhysicsDump/` (C#
  console, references `AutoCore.Game`).
- Call `AssetManager.Instance.Initialize(gamePath, ...)` (same pattern as
  `AutoCore.Sector/Program.cs:36`), then iterate all clonebases where
  `Type == CloneBaseObjectType.Vehicle` (see `GetItemCloneBases()` in
  `AssetManager.cs:100` for the filtering pattern — vehicles aren't inventory items
  so you'll enumerate `WADLoader.CloneBases` directly and filter by type instead),
  and for each, serialize `((CloneBaseVehicle)cloneBase).VehicleSpecific` to JSON
  keyed by CBID.
- Output: `tools/model-viewer/vehicle-physics.json` (or a separate `assets/physics/`
  dir) — same repo-root-relative serving convention as `index.json` from the model
  viewer, so the physics demo page can `fetch()` it directly.
- Validate the dump against the known dune buggy CBID by spot-checking a few fields
  against what "feels right" from playing the demo (top speed, gear count).

### Step 2 — Model ↔ CBID ↔ WheelSet linkage (few days, partially done)

To spawn a *drivable* vehicle you need: body model name, wheelset CBID →
`CloneBaseWheelSet.Wheel0Name/Wheel1Name` (wheel model names), and wheel
hardpoints/radius (already in `VehicleSpecific`). This is the same linkage problem
noted in memory (`aa-inventory-re`) for inventory items — for vehicles it's easier
because `VehicleSpecific.DefaultWheelset` gives you the CBID directly, and
`WheelSet.LoadFromDB`/`CloneBaseWheelSet` (`src/AutoCore.Game/CloneBases/CloneBaseWheelSet.cs`)
already parses wheel model names.

- Extend the Step 1 dump to also resolve `DefaultWheelset` → wheel model filenames,
  and the vehicle's own body `.geo` filename (server has no direct filename field —
  use the established naming convention: the clonebase's internal name usually
  matches the `.geo` stem, e.g. CBID for "dune-buggy" → `veh_p_h_r_cha_02_dune-buggy.geo`
  / `obj_veh_p_h_r_cha_02_dune-buggy.geo` for the full assembly — confirm per-vehicle
  by grepping `UniqueName`/`ShortDesc` against extracted `.geo` filenames).
- This step can start from the dune buggy alone (CBID already known from prior
  sessions) and generalize later; don't block Step 3 on solving this for all
  vehicles.

### Step 3 — Havok-equivalent vehicle controller in JS (the core work, 1–2 weeks)

**Physics engine choice: Rapier (`@dimforge/rapier3d`), not cannon-es.** Cannon-es
is unmaintained and its built-in `RaycastVehicle` is a much cruder approximation
than what's needed here; Rapier is actively maintained, has better raycast/collider
primitives to build a custom vehicle on top of, and has a WASM build that runs fine
via CDN/ESM import consistent with the project's existing "esm.sh, no build step"
convention (see `bounty-hunter-physics.html`'s import map). Keep the chassis as a
single rigid body; wheels are **not** separate rigid bodies — they're raycasts
against the world, exactly like Havok's raycast vehicle, driven by your own JS
components rather than Rapier's (Rapier doesn't ship a vehicle controller;
architecture reference: Bullet's `btRaycastVehicle`, RapierJS community 
`raycast-vehicle-controller`, and Rapier's own vehicle-controller example are all
structurally the same raycast-vehicle pattern Havok uses).

Build these as independent, testable modules (`tools/model-viewer/vehicle/` or a new
`tools/vehicle-physics/` directory), each taking the relevant `VehicleSpecific`
slice as config:

1. **`suspension.js`** — per-wheel raycast down the local -Y (or configured) axis
   from `WheelHardPoints[i]` out to `SuspensionLength`, spring force
   `F = SuspensionStrength * compression - damping * compressionVelocity`
   (compression vs. extension dampening are different coefficients — apply
   whichever direction the wheel is currently moving). This is the standard
   raycast-vehicle suspension model.
2. **`engine.js`** — 4-point piecewise-linear torque curve from
   `{MinimumRPM: MinTorqueFactor-ish-resistance, OptimumRPMMin: MaxTorqueFactor,
   OptimumRPMMax: MaxTorqueFactor, MaximumRPMMax: falls to Resistance}` scaled by
   `TorqueMax`. Interpolate torque factor between breakpoints by current RPM; below
   `MinimumRPM` or above `MaximumRPMMax`, apply resistance instead of drive torque
   (engine braking). This matches Havok's `hkVehicleDefaultEngine::calcEngineTorque`
   shape (documented in the public Havok SDK docs / countless vehicle-physics
   writeups — the shape is a standard "flat torque band with rolloff at both ends").
3. **`transmission.js`** — gear state machine: current gear × `GearRatios[gear]` ×
   `TransmissionRatio` converts engine RPM ↔ wheel angular velocity; auto-shift up
   at `UpshiftRPM`, down at `DownshiftRPM`; `ClutchDelayTime` gates how fast torque
   re-engages after a shift; `ReverseGearRation` for reverse; split output torque
   front/rear by `WheelTorqueRatios`.
4. **`brakes.js`** — apply `BrakesMaxTorque.{Front,Rear}` scaled by pedal input
   (`BrakesPedalInput` shapes the input curve, not the pedal position itself),
   respecting `BrakesMinBlockTime` if implementing a simple ABS-like release.
5. **`steering.js`** — target wheel angle = `input * SteeringMaxAngle *
   speedFactor(currentSpeed, SteeringFullSpeedLimit)`, where `speedFactor` reduces
   max angle as speed approaches `SteeringFullSpeedLimit` (typical Havok
   speed-sensitive steering — confirm the exact falloff curve shape once the
   `VehicleAction::havok` glue is decompiled in step 3b; a linear or
   inverse-speed falloff are both plausible starting points).
6. **`friction.js`** — tyre force model. **This is the hardest, least-certain
   piece.** Start with a standard slip-based Pacejka-lite or simplified
   longitudinal/lateral friction circle (slip ratio for accel/brake, slip angle for
   cornering), scaled by `RearWheelFrictionScalar` for the rear axle and clamped by
   a friction-circle magnitude. Havok's actual `hkVehicleFrictionSolver` is a more
   sophisticated paired-axle solver that isn't practical to bit-replicate — accept
   this as the biggest source of "close but not identical" handling feel, and plan
   to tune it empirically against captured reference data (step 5).
7. **`aerodynamics.js`** — drag force `0.5 * AerodynamicsAirDensity *
   AerodynamicsFrontalArea * AerodynamicsDrag * speed²` opposing velocity; lift
   force similarly using `AerodynamicsLift`, applied as vertical force (likely
   downforce given typical sign conventions — verify against `AerodynamicsExtraGravity`).
8. **`spinDamper.js`** — apply `AVDNormalSpinDamping` continuously to angular
   velocity (an artificial damping torque opposing spin, standard for arcade-y
   vehicle stability), and `AVDCollisionSpinDamping` specifically after collision
   events (`AVDCollisionThreshold` gates when a collision counts).
9. **`vehicleController.js`** — orchestrates the above every fixed physics tick:
   read input → steering angle → engine RPM from current wheel speed → transmission
   → wheel torque → suspension forces + friction forces at each wheel contact →
   sum into chassis force/torque → step Rapier → apply spin damping → advance gear
   state.
10. **Governors**: clamp final chassis speed to `AbsoluteTopSpeed`; apply
    `SpeedLimiter` as a softer earlier cap (exact interaction between the two is
    unconfirmed — check if `SpeedLimiter < AbsoluteTopSpeed` always holds across the
    dataset once Step 1's dump exists, which would suggest `SpeedLimiter` is a
    soft/AI cap and `AbsoluteTopSpeed` a hard one).

**Step 3b — decompile `VehicleAction::havok` (recommended, not strictly required):**
Before finalizing the friction/steering/governor math, spend a Ghidra session on the
code that actually wires `VehicleSpecific` fields into Havok component setup calls
(search near the `"VehicleAction::havok code"` string at `0x9d5534` in Ghidra
project `AA-decode`, and xref the Havok vehicle component vtables/constructors).
This resolves the open questions above (steering falloff curve shape, lift sign
convention, SpeedLimiter-vs-AbsoluteTopSpeed interaction, AVD damping application
point) with certainty instead of guesswork. Rename/comment findings in Ghidra per
the existing convention (see `docs/geo-format.md`'s function list for the pattern:
rename `FUN_xxx` → descriptive name, add a plate comment with the source path and
field semantics, save the program) so this knowledge persists for later sessions.

### Step 4 — Rendering integration (short, mostly reuses existing work)

- Reuse `tools/model-viewer/geo-parser.js` + `materials.js` to load the body model
  and wheel models (from Step 2's linkage) instead of `bounty-hunter-physics.html`'s
  hardcoded OBJ/PNG loading.
- Reuse the wheel-mesh-splitting technique from `bounty-hunter-physics.html`
  **only** for vehicles whose wheels are baked into the body mesh; vehicles with a
  separate WheelSet model (the more common case, confirmed for the dune buggy) just
  instance the wheel `.geo` at each `WheelHardPoints[i]`, oriented/scaled by
  `WheelRadius[i]`/`WheelWidth[i]`, mirrored on the left side — no splitting needed.
- Reuse `bounty-hunter-physics.html`'s chase camera; drop its physics/HUD/audio
  code (out of scope here, could be layered back on after).

### Step 5 — Validation against the live game (ongoing, the real cost center)

Parameter fidelity alone doesn't guarantee matching feel if any interpolation
curve, unit convention (radians vs degrees, m/s vs some game-specific unit), or
sign convention is wrong. Validate empirically:

- Use the existing `debug-tool/` (`debugtool` — see memory `debug-tool-location`)
  or extend it to log live telemetry from a real, controlled drive: speed, RPM,
  gear, wheel angular velocity, steering angle, over time, for a fixed input
  sequence (e.g. floor throttle from a stop to top speed in a straight line).
- Reproduce the same input sequence in the JS port and diff the curves (0-60
  time, top speed, gear shift points, steering response). This is the single most
  valuable validation step and should be built early, even with rough physics —
  it turns "feels about right" into a measurable target.
- Iterate on friction.js and the steering falloff curve using this data, since
  those are the two components without a confirmed exact formula.

---

## Non-goals (Tier 3, explicitly out of scope here)

- Reimplementing Havok 2.3's actual constraint solver, integration scheme, or fixed
  timestep semantics.
- Bit-identical collision response — Rapier's collision shapes and solver will
  never match Havok's exactly, even with identical input data.
- Parsing `physics.glm`'s `.cache` collision shapes (7,510 files) for terrain/prop
  collision — Tier 2 can run on a simple ground plane / heightmap for validation
  purposes; full world collision is a separate, large undertaking.
- Prefix/mod stat adjustments (`vPrefixVehicle` percent/flat adjustments) — noted
  above as a deferred v2 layer once base-vehicle simulation is validated.
- Multiplayer/server-authoritative physics reconciliation — this is a standalone
  client-side demo, not a replacement for the server's movement validation.

---

## Summary of open unknowns (resolve via Step 3b Ghidra work)

1. Exact steering-speed-falloff curve shape (linear? inverse? Havok default formula?).
2. Sign/application of `AerodynamicsLift` (downforce vs. lift).
3. Interaction between `SpeedLimiter` and `AbsoluteTopSpeed`.
4. Whether `AVDNormalSpinDamping` applies continuously or only above some
   threshold, and whether it acts on all three axes or just yaw.
5. Whether `bUseSkirt`/`SkirtExtents`/`PushBottomUp` (hovercraft-style vehicles)
   need a separate lift-based suspension model instead of the standard raycast
   suspension — check if `WheelExistance == 0` correlates with hover-type vehicles
   in the dataset.
6. Exact tyre friction/slip formula (biggest unknown, biggest impact on feel).
