// physicsdump — exports every vehicle CloneBase's VehicleSpecific + wheelset linkage to JSON.
//
// Usage:  physicsdump <gamePath> <outputJsonPath>
//   gamePath        = Auto Assault install root (must contain exe\autoassault.exe + clonebase.wad)
//   outputJsonPath  = where to write vehicle-physics.json (e.g. tools/model-viewer/vehicle-physics.json)
//
// Loads ONLY clonebase.wad (no MySQL, no GLMs) — safe to run without a server config.
// Mirrors the AssetManager init pattern from tools/AutoCore.MapDump/Program.cs.

using System.Text.Json;
using System.Text.Json.Serialization;
using AutoCore.Game.CloneBases;
using AutoCore.Game.CloneBases.Specifics;
using AutoCore.Game.Constants;
using AutoCore.Game.Managers;
using AutoCore.Game.Structures;

namespace AutoCore.PhysicsDump;

internal static class Program
{
    private static int Main(string[] args)
    {
        if (args.Length < 2)
        {
            Console.Error.WriteLine("Usage: physicsdump <gamePath> <outputJsonPath>");
            Console.Error.WriteLine("  gamePath        = Auto Assault install root (exe\\autoassault.exe + clonebase.wad)");
            Console.Error.WriteLine("  outputJsonPath  = output JSON file path (e.g. tools/model-viewer/vehicle-physics.json)");
            return 1;
        }

        var gamePath = args[0];
        var outputPath = args[1];

        if (!AssetManager.Instance.Initialize(gamePath, ServerType.Sector))
        {
            Console.Error.WriteLine($"Invalid game path (needs exe\\autoassault.exe): {gamePath}");
            return 1;
        }

        if (!AssetManager.Instance.LoadCloneBasesOnly())
        {
            Console.Error.WriteLine("Failed to load clonebase.wad");
            return 1;
        }

        var vehicles = AssetManager.Instance
            .GetCloneBasesByType(CloneBaseObjectType.Vehicle)
            .Cast<CloneBaseVehicle>()
            .OrderBy(v => v.CloneBaseSpecific.CloneBaseId)
            .ToList();

        Console.WriteLine($"Found {vehicles.Count} vehicle clonebases. Dumping...");

        var entries = new List<VehicleEntry>(vehicles.Count);
        var skipped = 0;

        foreach (var v in vehicles)
        {
            var cbid = v.CloneBaseSpecific.CloneBaseId;
            var uniqueName = Clean(v.CloneBaseSpecific.UniqueName);
            var shortDesc = Clean(v.CloneBaseSpecific.ShortDesc);
            var physicsName = Clean(v.SimpleObjectSpecific.PhysicsName);

            string? wheel0Name = null;
            string? wheel1Name = null;
            byte wheelSetType = 0;
            short[]? wheelFriction = null;

            if (v.VehicleSpecific.DefaultWheelset != 0)
            {
                var ws = AssetManager.Instance.GetCloneBase<CloneBaseWheelSet>(v.VehicleSpecific.DefaultWheelset);
                if (ws != null)
                {
                    wheel0Name = Clean(ws.WheelSetSpecific.Wheel0Name);
                    wheel1Name = Clean(ws.WheelSetSpecific.Wheel1Name);
                    wheelSetType = ws.WheelSetSpecific.WheelSetType;
                    wheelFriction = ws.WheelSetSpecific.Friction;
                }
                else
                {
                    Console.Error.WriteLine($"  CBID {cbid}: wheelset {v.VehicleSpecific.DefaultWheelset} not found");
                }
            }

            var vs = v.VehicleSpecific;
            var isExotic = IsExotic(vs);

            entries.Add(new VehicleEntry
            {
                Cbid = cbid,
                UniqueName = uniqueName,
                ShortDesc = shortDesc,
                PhysicsName = physicsName,
                Mass = v.SimpleObjectSpecific.Mass,
                Scale = v.SimpleObjectSpecific.Scale,
                Wheel0Name = wheel0Name,
                Wheel1Name = wheel1Name,
                WheelSetType = wheelSetType,
                WheelFriction = wheelFriction,
                IsExotic = isExotic,
                ExoticReason = isExotic ? GetExoticReason(vs) : null,
                VehicleSpecific = new VehicleSpecificDto
                {
                    VehicleType = vs.VehicleType,
                    ClassType = vs.ClassType,
                    WheelExistance = vs.WheelExistance,
                    WheelAxle = vs.WheelAxle,
                    WheelHardPoints = ToArray(vs.WheelHardPoints),
                    SuspensionLength = ToFrontRearDto(vs.SuspensionLength),
                    SuspensionStrength = ToFrontRearDto(vs.SuspensionStrength),
                    SuspensionDampeningCoefficientCompression = ToFrontRearDto(vs.SuspensionDampeningCoefficientCompression),
                    SuspensionDampeningCoefficientExtension = ToFrontRearDto(vs.SuspensionDampeningCoefficientExtension),
                    BrakesMaxTorque = ToFrontRearDto(vs.BrakesMaxTorque),
                    BrakesMinBlockTime = ToFrontRearDto(vs.BrakesMinBlockTime),
                    BrakesPedalInput = ToFrontRearDto(vs.BrakesPedalInput),
                    SteeringMaxAngle = vs.SteeringMaxAngle,
                    SteeringFullSpeedLimit = vs.SteeringFullSpeedLimit,
                    AerodynamicsFrontalArea = vs.AerodynamicsFrontalArea,
                    AerodynamicsDrag = vs.AerodynamicsDrag,
                    AerodynamicsLift = vs.AerodynamicsLift,
                    AerodynamicsAirDensity = vs.AerodynamicsAirDensity,
                    AerodynamicsExtraGravity = ToVec3Dto(vs.AerodynamicsExtraGravity),
                    AVDNormalSpinDamping = vs.AVDNormalSpinDamping,
                    AVDCollisionSpinDamping = vs.AVDCollisionSpinDamping,
                    AVDCollisionThreshold = vs.AVDCollisionThreshold,
                    RVFrictionEqualizer = vs.RVFrictionEqualizer,
                    RVSpinTorqueRoll = vs.RVSpinTorqueRoll,
                    RVSpinTorquePitch = vs.RVSpinTorquePitch,
                    RVSpinTorqueYaw = vs.RVSpinTorqueYaw,
                    RVExtraAngularImpulse = vs.RVExtraAngularImpulse,
                    RVExtraTorqueFactor = vs.RVExtraTorqueFactor,
                    RVInertiaRoll = vs.RVInertiaRoll,
                    RVInertiaPitch = vs.RVInertiaPitch,
                    RVInertiaYaw = vs.RVInertiaYaw,
                    WheelTorqueRatios = ToFrontRearDto(vs.WheelTorqueRatios),
                    VehicleFlags = vs.VehicleFlags,
                    HitchPoint = ToVec3Dto(vs.HitchPoint),
                    WheelRadius = vs.WheelRadius,
                    WheelWidth = vs.WheelWidth,
                    SpeedLimiter = vs.SpeedLimiter,
                    AbsoluteTopSpeed = vs.AbsoluteTopSpeed,
                    ShockAttachPoints = ToArray(vs.ShockAttachPoints),
                    DrawAxles = vs.DrawAxles,
                    DrawShocks = vs.DrawShocks,
                    AxleScale = vs.AxleScale,
                    ShockScale = vs.ShockScale,
                    ShockEffectThreshold = vs.ShockEffectThreshold,
                    EngineType = vs.EngineType,
                    NumberOfGears = vs.NumberOfGears,
                    TorqueMax = vs.TorqueMax,
                    DownshiftRPM = vs.DownshiftRPM,
                    UpshiftRPM = vs.UpshiftRPM,
                    MinTorqueFactor = vs.MinTorqueFactor,
                    MaxTorqueFactor = vs.MaxTorqueFactor,
                    MinimumRPM = vs.MinimumRPM,
                    OptimumRPMMin = vs.OptimumRPMMin,
                    OptimumRPMMax = vs.OptimumRPMMax,
                    MaximumRPMMax = vs.MaximumRPMMax,
                    MinimumResistance = vs.MinimumResistance,
                    OptimumResistance = vs.OptimumResistance,
                    MaximumResistance = vs.MaximumResistance,
                    TransmissionRatio = vs.TransmissionRatio,
                    ClutchDelayTime = vs.ClutchDelayTime,
                    ReverseGearRation = vs.ReverseGearRation,
                    GearRatios = vs.GearRatios,
                    ArmorAdd = vs.ArmorAdd,
                    PowerMaxAdd = vs.PowerMaxAdd,
                    HeatMaxAdd = vs.HeatMaxAdd,
                    CooldownAdd = vs.CooldownAdd,
                    DefaultWheelset = vs.DefaultWheelset,
                    DefaultDriver = vs.DefaultDriver,
                    MaxWtWeaponFront = vs.MaxWtWeaponFront,
                    MaxWtWeaponTurret = vs.MaxWtWeaponTurret,
                    MaxWtWeaponDrop = vs.MaxWtWeaponDrop,
                    MaxWtArmor = vs.MaxWtArmor,
                    MaxWtEngine = vs.MaxWtEngine,
                    DefensivePercent = vs.DefensivePercent,
                    TurretSize = vs.TurretSize,
                    NumberOfTrims = vs.NumberOfTrims,
                    NumberOfTricks = vs.NumberOfTricks,
                    MeleeScaler = vs.MeleeScaler,
                    InventorySlots = vs.InventorySlots,
                    SkirtExtents = ToVec3Dto(vs.SkirtExtents),
                    PushBottomUp = vs.PushBottomUp,
                    CenterOfMassModifier = ToVec3Dto(vs.CenterOfMassModifier),
                    RearWheelFrictionScalar = vs.RearWheelFrictionScalar,
                    DefaultColors = ToColorArray(vs.DefaultColors),
                }
            });
        }

        var outDir = Path.GetDirectoryName(outputPath);
        if (!string.IsNullOrEmpty(outDir) && !Directory.Exists(outDir))
            Directory.CreateDirectory(outDir);

        var options = new JsonSerializerOptions
        {
            WriteIndented = false,
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        };

        var json = JsonSerializer.Serialize(new { vehicles = entries }, options);
        File.WriteAllText(outputPath, json);

        var exoticCount = entries.Count(e => e.IsExotic);
        Console.WriteLine($"Wrote {entries.Count} vehicles ({exoticCount} flagged exotic) to {outputPath}");
        return 0;
    }

    private static string Clean(string? s)
    {
        if (string.IsNullOrEmpty(s)) return string.Empty;
        return s.TrimEnd('\0').Trim();
    }

    private static bool IsExotic(VehicleSpecific vs) => GetExoticReason(vs) != null;

    private static string? GetExoticReason(VehicleSpecific vs)
    {
        // WheelExistance is a wheel COUNT (2=motorcycle, 4=standard, 6=tank/trike).
        // Only 4-wheel is fully modeled in the v1 physics controller.
        if (vs.WheelExistance == 6)
            return "6-wheel layout (paired-axle steering/torque not yet modeled — needs more RE)";
        if (vs.WheelExistance == 2)
            return "2-wheel (motorcycle balancing model not yet implemented — needs more RE)";
        if (vs.WheelExistance != 4)
            return $"non-standard wheel count {vs.WheelExistance}";
        return null;
    }

    private static Vec3Dto[] ToArray(Vector3[] arr) =>
        arr.Select(ToVec3Dto).ToArray();

    private static Vec3Dto ToVec3Dto(Vector3 v) => new() { X = v.X, Y = v.Y, Z = v.Z };

    private static FrontRearDto ToFrontRearDto(FrontRear fr) => new() { Front = fr.Front, Rear = fr.Rear };

    private static ColorDto[] ToColorArray(RGB[] arr) =>
        arr.Select(c => new ColorDto { R = c.R, G = c.G, B = c.B }).ToArray();
}

// ── DTOs ──────────────────────────────────────────────────────────────────────

public sealed class VehicleEntry
{
    public int Cbid { get; set; }
    public string UniqueName { get; set; } = "";
    public string ShortDesc { get; set; } = "";
    public string? PhysicsName { get; set; }
    public float Mass { get; set; }
    public float Scale { get; set; }
    public string? Wheel0Name { get; set; }
    public string? Wheel1Name { get; set; }
    public byte WheelSetType { get; set; }
    public short[]? WheelFriction { get; set; }
    public bool IsExotic { get; set; }
    public string? ExoticReason { get; set; }
    public VehicleSpecificDto VehicleSpecific { get; set; } = new();
}

public sealed class VehicleSpecificDto
{
    public byte VehicleType { get; set; }
    public byte ClassType { get; set; }
    public byte WheelExistance { get; set; }
    public byte WheelAxle { get; set; }
    public Vec3Dto[] WheelHardPoints { get; set; } = Array.Empty<Vec3Dto>();
    public FrontRearDto SuspensionLength { get; set; } = new();
    public FrontRearDto SuspensionStrength { get; set; } = new();
    public FrontRearDto SuspensionDampeningCoefficientCompression { get; set; } = new();
    public FrontRearDto SuspensionDampeningCoefficientExtension { get; set; } = new();
    public FrontRearDto BrakesMaxTorque { get; set; } = new();
    public FrontRearDto BrakesMinBlockTime { get; set; } = new();
    public FrontRearDto BrakesPedalInput { get; set; } = new();
    public float SteeringMaxAngle { get; set; }
    public float SteeringFullSpeedLimit { get; set; }
    public float AerodynamicsFrontalArea { get; set; }
    public float AerodynamicsDrag { get; set; }
    public float AerodynamicsLift { get; set; }
    public float AerodynamicsAirDensity { get; set; }
    public Vec3Dto AerodynamicsExtraGravity { get; set; } = new();
    public float AVDNormalSpinDamping { get; set; }
    public float AVDCollisionSpinDamping { get; set; }
    public float AVDCollisionThreshold { get; set; }
    public float RVFrictionEqualizer { get; set; }
    public float RVSpinTorqueRoll { get; set; }
    public float RVSpinTorquePitch { get; set; }
    public float RVSpinTorqueYaw { get; set; }
    public float RVExtraAngularImpulse { get; set; }
    public float RVExtraTorqueFactor { get; set; }
    public float RVInertiaRoll { get; set; }
    public float RVInertiaPitch { get; set; }
    public float RVInertiaYaw { get; set; }
    public FrontRearDto WheelTorqueRatios { get; set; } = new();
    public short VehicleFlags { get; set; }
    public Vec3Dto HitchPoint { get; set; } = new();
    public float[]? WheelRadius { get; set; }
    public float[]? WheelWidth { get; set; }
    public float SpeedLimiter { get; set; }
    public float AbsoluteTopSpeed { get; set; }
    public Vec3Dto[] ShockAttachPoints { get; set; } = Array.Empty<Vec3Dto>();
    public byte[]? DrawAxles { get; set; }
    public byte[]? DrawShocks { get; set; }
    public float[]? AxleScale { get; set; }
    public float[]? ShockScale { get; set; }
    public float ShockEffectThreshold { get; set; }
    public byte EngineType { get; set; }
    public byte NumberOfGears { get; set; }
    public short TorqueMax { get; set; }
    public short DownshiftRPM { get; set; }
    public short UpshiftRPM { get; set; }
    public float MinTorqueFactor { get; set; }
    public float MaxTorqueFactor { get; set; }
    public float MinimumRPM { get; set; }
    public float OptimumRPMMin { get; set; }
    public float OptimumRPMMax { get; set; }
    public float MaximumRPMMax { get; set; }
    public float MinimumResistance { get; set; }
    public float OptimumResistance { get; set; }
    public float MaximumResistance { get; set; }
    public float TransmissionRatio { get; set; }
    public float ClutchDelayTime { get; set; }
    public float ReverseGearRation { get; set; }
    public float[]? GearRatios { get; set; }
    public short ArmorAdd { get; set; }
    public int PowerMaxAdd { get; set; }
    public int HeatMaxAdd { get; set; }
    public short CooldownAdd { get; set; }
    public int DefaultWheelset { get; set; }
    public int DefaultDriver { get; set; }
    public float MaxWtWeaponFront { get; set; }
    public float MaxWtWeaponTurret { get; set; }
    public float MaxWtWeaponDrop { get; set; }
    public float MaxWtArmor { get; set; }
    public float MaxWtEngine { get; set; }
    public float DefensivePercent { get; set; }
    public byte TurretSize { get; set; }
    public byte NumberOfTrims { get; set; }
    public byte NumberOfTricks { get; set; }
    public float MeleeScaler { get; set; }
    public short InventorySlots { get; set; }
    public Vec3Dto SkirtExtents { get; set; } = new();
    public float PushBottomUp { get; set; }
    public Vec3Dto CenterOfMassModifier { get; set; } = new();
    public float RearWheelFrictionScalar { get; set; }
    public ColorDto[]? DefaultColors { get; set; }
}

public sealed class Vec3Dto
{
    public float X { get; set; }
    public float Y { get; set; }
    public float Z { get; set; }
}

public sealed class FrontRearDto
{
    public float Front { get; set; }
    public float Rear { get; set; }
}

public sealed class ColorDto
{
    public float R { get; set; }
    public float G { get; set; }
    public float B { get; set; }
}
