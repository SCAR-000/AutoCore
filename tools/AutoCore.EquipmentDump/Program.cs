using System.Text.Json;
using System.Text.Json.Serialization;
using AutoCore.Game.CloneBases;
using AutoCore.Game.CloneBases.Specifics;
using AutoCore.Game.Constants;
using AutoCore.Game.Managers;
using AutoCore.Game.Structures;

namespace AutoCore.EquipmentDump;

internal static class Program
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        WriteIndented = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        PropertyNamingPolicy = null,
    };

    public static int Main(string[] args)
    {
        if (args.Length < 2)
        {
            Console.WriteLine("AutoCore.EquipmentDump — vehicle equipment catalog for model-viewer");
            Console.WriteLine();
            Console.WriteLine("Usage:");
            Console.WriteLine("  equipmentdump <game-path> <output-json-path>");
            Console.WriteLine();
            Console.WriteLine("Example:");
            Console.WriteLine(@"  equipmentdump ""C:\Program Files (x86)\NetDevil\Auto Assault"" tools/model-viewer/equipment-catalog.json");
            return 1;
        }

        var gamePath = args[0];
        var outputPath = args[1];

        if (!AssetManager.Instance.Initialize(gamePath, ServerType.Global))
        {
            Console.Error.WriteLine("Failed to initialize AssetManager — check game path.");
            return 1;
        }

        if (!AssetManager.Instance.LoadCloneBasesOnly())
        {
            Console.Error.WriteLine("Failed to load clonebase.wad");
            return 1;
        }

        var catalog = BuildCatalog();
        var dir = Path.GetDirectoryName(Path.GetFullPath(outputPath));
        if (!string.IsNullOrEmpty(dir))
            Directory.CreateDirectory(dir);

        File.WriteAllText(outputPath, JsonSerializer.Serialize(catalog, JsonOpts));
        Console.WriteLine(
            $"Wrote {catalog.Vehicles.Count} vehicles, {catalog.Weapons.Count} weapons, " +
            $"{catalog.WheelSets.Count} wheelsets, {catalog.Ornaments.Count} ornaments, " +
            $"{catalog.Armors.Count} armors → {outputPath}");
        return 0;
    }

    private static EquipmentCatalog BuildCatalog()
    {
        var catalog = new EquipmentCatalog();

        foreach (var cb in AssetManager.Instance.GetCloneBasesByType(CloneBaseObjectType.Vehicle))
        {
            if (cb is not CloneBaseVehicle veh)
                continue;

            var vs = veh.VehicleSpecific;
            var sos = veh.SimpleObjectSpecific;
            catalog.Vehicles.Add(new VehicleEquipmentEntry
            {
                Cbid = cb.CloneBaseSpecific.CloneBaseId,
                UniqueName = cb.CloneBaseSpecific.UniqueName,
                ShortDesc = cb.CloneBaseSpecific.ShortDesc,
                ClassType = vs.ClassType,
                VehicleType = vs.VehicleType,
                VehicleFlags = vs.VehicleFlags,
                HardPoints = Vec3Array(vs.HardPoints),
                HardPointFacing = vs.HardPointFacing,
                TurretSize = vs.TurretSize,
                DefaultWheelset = vs.DefaultWheelset,
                MaxWtWeaponFront = vs.MaxWtWeaponFront,
                MaxWtWeaponTurret = vs.MaxWtWeaponTurret,
                MaxWtWeaponDrop = vs.MaxWtWeaponDrop,
                MaxWtArmor = vs.MaxWtArmor,
                WheelAxle = vs.WheelAxle,
            });
        }

        foreach (var cb in AssetManager.Instance.GetCloneBasesByType(CloneBaseObjectType.Weapon))
        {
            if (cb is not CloneBaseWeapon wpn)
                continue;

            var ws = wpn.WeaponSpecific;
            var sos = wpn.SimpleObjectSpecific;
            catalog.Weapons.Add(new WeaponEntry
            {
                Cbid = cb.CloneBaseSpecific.CloneBaseId,
                UniqueName = cb.CloneBaseSpecific.UniqueName,
                ShortDesc = cb.CloneBaseSpecific.ShortDesc,
                PhysicsName = sos.PhysicsName,
                Mass = sos.Mass,
                Scale = sos.Scale,
                RequiredClass = sos.RequiredClass,
                FirePoint = Vec3Dto(ws.FirePoint),
                Flags = ws.Flags,
                TurretSize = ws.TurretSize,
                CanBeFront = (ws.Flags & 1) != 0,
                CanBeBack = (ws.Flags & 2) != 0 || (ws.Flags & 4) != 0,
                CanBeTurret = (ws.Flags & 0x10) != 0,
            });
        }

        foreach (var cb in AssetManager.Instance.GetCloneBasesByType(CloneBaseObjectType.WheelSet))
        {
            if (cb is not CloneBaseWheelSet ws)
                continue;

            var wss = ws.WheelSetSpecific;
            catalog.WheelSets.Add(new WheelSetEntry
            {
                Cbid = cb.CloneBaseSpecific.CloneBaseId,
                UniqueName = cb.CloneBaseSpecific.UniqueName,
                ShortDesc = cb.CloneBaseSpecific.ShortDesc,
                Wheel0Name = wss.Wheel0Name,
                Wheel1Name = wss.Wheel1Name,
                WheelSetType = wss.WheelSetType,
                Friction = wss.Friction,
            });
        }

        foreach (var cb in AssetManager.Instance.GetCloneBasesByType(CloneBaseObjectType.Item))
        {
            if (cb is not CloneBaseObject obj)
                continue;

            if (obj.SimpleObjectSpecific.SubType != 10)
                continue;

            var sos = obj.SimpleObjectSpecific;
            catalog.Ornaments.Add(new OrnamentEntry
            {
                Cbid = cb.CloneBaseSpecific.CloneBaseId,
                UniqueName = cb.CloneBaseSpecific.UniqueName,
                ShortDesc = cb.CloneBaseSpecific.ShortDesc,
                PhysicsName = sos.PhysicsName,
                Mass = sos.Mass,
                Scale = sos.Scale,
                SubType = sos.SubType,
                RequiredClass = sos.RequiredClass,
            });
        }

        foreach (var cb in AssetManager.Instance.GetCloneBasesByType(CloneBaseObjectType.Armor))
        {
            if (cb is not CloneBaseArmor armor)
                continue;

            var sos = armor.SimpleObjectSpecific;
            catalog.Armors.Add(new ArmorEntry
            {
                Cbid = cb.CloneBaseSpecific.CloneBaseId,
                UniqueName = cb.CloneBaseSpecific.UniqueName,
                ShortDesc = cb.CloneBaseSpecific.ShortDesc,
                PhysicsName = sos.PhysicsName,
                Mass = sos.Mass,
                Scale = sos.Scale,
                RequiredClass = sos.RequiredClass,
            });
        }

        catalog.Vehicles.Sort((a, b) => a.Cbid.CompareTo(b.Cbid));
        catalog.Weapons.Sort((a, b) => a.Cbid.CompareTo(b.Cbid));
        catalog.WheelSets.Sort((a, b) => a.Cbid.CompareTo(b.Cbid));
        catalog.Ornaments.Sort((a, b) => a.Cbid.CompareTo(b.Cbid));
        catalog.Armors.Sort((a, b) => a.Cbid.CompareTo(b.Cbid));

        return catalog;
    }

    private static Vec3Dto[] Vec3Array(Vector3[]? pts)
    {
        if (pts == null || pts.Length == 0)
            return Array.Empty<Vec3Dto>();

        return pts.Select(Vec3Dto).ToArray();
    }

    private static Vec3Dto Vec3Dto(Vector3 v) => new() { X = v.X, Y = v.Y, Z = v.Z };
}

internal sealed class EquipmentCatalog
{
    public List<VehicleEquipmentEntry> Vehicles { get; set; } = new();
    public List<WeaponEntry> Weapons { get; set; } = new();
    public List<WheelSetEntry> WheelSets { get; set; } = new();
    public List<OrnamentEntry> Ornaments { get; set; } = new();
    public List<ArmorEntry> Armors { get; set; } = new();
}

internal sealed class VehicleEquipmentEntry
{
    public int Cbid { get; set; }
    public string UniqueName { get; set; } = "";
    public string ShortDesc { get; set; } = "";
    public byte ClassType { get; set; }
    public byte VehicleType { get; set; }
    public short VehicleFlags { get; set; }
    public Vec3Dto[] HardPoints { get; set; } = Array.Empty<Vec3Dto>();
    public int HardPointFacing { get; set; }
    public byte TurretSize { get; set; }
    public int DefaultWheelset { get; set; }
    public float MaxWtWeaponFront { get; set; }
    public float MaxWtWeaponTurret { get; set; }
    public float MaxWtWeaponDrop { get; set; }
    public float MaxWtArmor { get; set; }
    public byte WheelAxle { get; set; }
}

internal sealed class WeaponEntry
{
    public int Cbid { get; set; }
    public string UniqueName { get; set; } = "";
    public string ShortDesc { get; set; } = "";
    public string PhysicsName { get; set; } = "";
    public float Mass { get; set; }
    public float Scale { get; set; }
    public int RequiredClass { get; set; }
    public Vec3Dto FirePoint { get; set; } = new();
    public byte Flags { get; set; }
    public byte TurretSize { get; set; }
    public bool CanBeFront { get; set; }
    public bool CanBeBack { get; set; }
    public bool CanBeTurret { get; set; }
}

internal sealed class WheelSetEntry
{
    public int Cbid { get; set; }
    public string UniqueName { get; set; } = "";
    public string ShortDesc { get; set; } = "";
    public string Wheel0Name { get; set; } = "";
    public string Wheel1Name { get; set; } = "";
    public byte WheelSetType { get; set; }
    public short[] Friction { get; set; } = Array.Empty<short>();
}

internal sealed class OrnamentEntry
{
    public int Cbid { get; set; }
    public string UniqueName { get; set; } = "";
    public string ShortDesc { get; set; } = "";
    public string PhysicsName { get; set; } = "";
    public float Mass { get; set; }
    public float Scale { get; set; }
    public short SubType { get; set; }
    public int RequiredClass { get; set; }
}

internal sealed class ArmorEntry
{
    public int Cbid { get; set; }
    public string UniqueName { get; set; } = "";
    public string ShortDesc { get; set; } = "";
    public string PhysicsName { get; set; } = "";
    public float Mass { get; set; }
    public float Scale { get; set; }
    public int RequiredClass { get; set; }
}

internal sealed class Vec3Dto
{
    public float X { get; set; }
    public float Y { get; set; }
    public float Z { get; set; }
}
