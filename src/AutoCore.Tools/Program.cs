using System.Text;
using System.Text.Json;

namespace AutoCore.Tools;

using AutoCore.Database.World.Models;
using AutoCore.Game.CloneBases;
using AutoCore.Game.Constants;
using AutoCore.Game.EntityTemplates;
using AutoCore.Game.Managers;
using AutoCore.Game.Map;
using AutoCore.Utils;

public static class Program
{
    private sealed record WeaponCapacityHints(
        float MaxWtWeaponFront,
        float MaxWtWeaponTurret,
        float MaxWtWeaponDrop,
        byte TurretSize
    );

    private sealed record ResolvedSpawn(
        int? BaseCBID,
        string? BaseType,
        int? DriverCBID,
        int? WeaponFrontCBID,
        int? WeaponTurretCBID,
        int? WeaponRearCBID,
        int? WeaponMeleeCBID,
        string? Source
    );

    private sealed record SpawnReportRow(
        string MapFile,
        int MapVersion,
        long SpawnPointCoid,
        int SpawnIndex,
        bool IsTemplate,
        int SpawnTypeRaw,
        string? SpawnCloneBaseType,
        ResolvedSpawn? Resolved,
        WeaponCapacityHints? VehicleCapacityHints
    );

    private sealed record TemplateLoadoutRow(
        string MapFile,
        int MapVersion,
        string? MiniCatalogSource,
        int TemplateId,
        int? BaseCBID,
        string? BaseType,
        int? DriverCBID,
        int? WeaponFrontCBID,
        int? WeaponTurretCBID,
        int? WeaponRearCBID,
        int? WeaponMeleeCBID,
        int Score,
        int MatchOffset
    );

    public static int Main(string[] args)
    {
        try
        {
            var gamePath = GetArg(args, "--gamePath") ?? GetArg(args, "-g");
            var outDir = GetArg(args, "--outDir") ?? GetArg(args, "-o") ?? Path.Combine(Environment.CurrentDirectory, "reports");

            if (string.IsNullOrWhiteSpace(gamePath) || !Directory.Exists(gamePath))
            {
                PrintUsage();
                return 2;
            }

            Directory.CreateDirectory(outDir);

            if (!AssetManager.Instance.Initialize(gamePath, ServerType.Both))
                return 3;

            if (!AssetManager.Instance.LoadWadAndGlmOnly())
                return 4;

            var famFiles = AssetManager.Instance
                .ListGlmFiles()
                .Where(f => f.EndsWith(".fam", StringComparison.OrdinalIgnoreCase))
                .OrderBy(f => f, StringComparer.OrdinalIgnoreCase)
                .ToList();

            Logger.WriteLog(LogType.Initialize, $"AutoCore.Tools: Found {famFiles.Count} .fam files in GLMs.");

            var spawnRows = new List<SpawnReportRow>(capacity: 1024);
            var templateRows = new List<TemplateLoadoutRow>(capacity: 1024);

            foreach (var fam in famFiles)
            {
                try
                {
                    using var reader = AssetManager.Instance.GetFileReaderFromGLMs(fam);
                    if (reader == null)
                        continue;

                    var continent = new ContinentObject
                    {
                        MapFileName = Path.GetFileNameWithoutExtension(fam),
                        DisplayName = Path.GetFileNameWithoutExtension(fam)
                    };

                    var map = new MapData(continent);
                    map.Read(reader);

                    foreach (var kvp in map.MiniCatalogTemplates)
                    {
                        var t = kvp.Value;
                        templateRows.Add(new TemplateLoadoutRow(
                            MapFile: fam,
                            MapVersion: map.MapVersion,
                            MiniCatalogSource: map.MiniCatalogSource,
                            TemplateId: t.TemplateId,
                            BaseCBID: t.BaseCBID,
                            BaseType: t.BaseType,
                            DriverCBID: t.DriverCBID,
                            WeaponFrontCBID: t.WeaponFrontCBID,
                            WeaponTurretCBID: t.WeaponTurretCBID,
                            WeaponRearCBID: t.WeaponRearCBID,
                            WeaponMeleeCBID: t.WeaponMeleeCBID,
                            Score: t.Score,
                            MatchOffset: t.MatchOffset
                        ));
                    }

                    foreach (var obj in map.Templates.Values)
                    {
                        if (obj is not SpawnPointTemplate sp)
                            continue;

                        for (var i = 0; i < sp.Spawns.Count; i++)
                        {
                            var s = sp.Spawns[i];
                            if (s.SpawnType == -1)
                                continue;

                            string? rawType = null;
                            if (!s.IsTemplate)
                            {
                                var cb = AssetManager.Instance.GetCloneBase(s.SpawnType);
                                rawType = cb?.Type.ToString();
                            }

                            ResolvedSpawn? resolved = null;
                            WeaponCapacityHints? hints = null;

                            if (!s.IsTemplate)
                            {
                                var cb = AssetManager.Instance.GetCloneBase(s.SpawnType);
                                if (cb != null)
                                {
                                    resolved = new ResolvedSpawn(
                                        BaseCBID: s.SpawnType,
                                        BaseType: cb.Type.ToString(),
                                        DriverCBID: null,
                                        WeaponFrontCBID: null,
                                        WeaponTurretCBID: null,
                                        WeaponRearCBID: null,
                                        WeaponMeleeCBID: null,
                                        Source: "clonebase.wad"
                                    );

                                    if (cb.Type == CloneBaseObjectType.Vehicle && cb is CloneBaseVehicle veh)
                                    {
                                        hints = new WeaponCapacityHints(
                                            MaxWtWeaponFront: veh.VehicleSpecific.MaxWtWeaponFront,
                                            MaxWtWeaponTurret: veh.VehicleSpecific.MaxWtWeaponTurret,
                                            MaxWtWeaponDrop: veh.VehicleSpecific.MaxWtWeaponDrop,
                                            TurretSize: veh.VehicleSpecific.TurretSize
                                        );
                                    }
                                }
                            }
                            else
                            {
                                if (map.MiniCatalogTemplates.TryGetValue(s.SpawnType, out var t))
                                {
                                    resolved = new ResolvedSpawn(
                                        BaseCBID: t.BaseCBID,
                                        BaseType: t.BaseType,
                                        DriverCBID: t.DriverCBID,
                                        WeaponFrontCBID: t.WeaponFrontCBID,
                                        WeaponTurretCBID: t.WeaponTurretCBID,
                                        WeaponRearCBID: t.WeaponRearCBID,
                                        WeaponMeleeCBID: t.WeaponMeleeCBID,
                                        Source: map.MiniCatalogSource
                                    );

                                    if (t.BaseCBID is int baseCbid)
                                    {
                                        var cb = AssetManager.Instance.GetCloneBase(baseCbid);
                                        if (cb is CloneBaseVehicle veh)
                                        {
                                            hints = new WeaponCapacityHints(
                                                MaxWtWeaponFront: veh.VehicleSpecific.MaxWtWeaponFront,
                                                MaxWtWeaponTurret: veh.VehicleSpecific.MaxWtWeaponTurret,
                                                MaxWtWeaponDrop: veh.VehicleSpecific.MaxWtWeaponDrop,
                                                TurretSize: veh.VehicleSpecific.TurretSize
                                            );
                                        }
                                    }
                                }
                            }

                            spawnRows.Add(new SpawnReportRow(
                                MapFile: fam,
                                MapVersion: map.MapVersion,
                                SpawnPointCoid: sp.COID,
                                SpawnIndex: i,
                                IsTemplate: s.IsTemplate,
                                SpawnTypeRaw: s.SpawnType,
                                SpawnCloneBaseType: rawType,
                                Resolved: resolved,
                                VehicleCapacityHints: hints
                            ));
                        }
                    }
                }
                catch (Exception ex)
                {
                    Logger.WriteLog(LogType.Error, $"AutoCore.Tools: Failed reading '{fam}': {ex.Message}");
                }
            }

            var jsonOptions = new JsonSerializerOptions { WriteIndented = true };

            var reportPath = Path.Combine(outDir, "npc_spawns_report.json");
            File.WriteAllText(reportPath, JsonSerializer.Serialize(spawnRows, jsonOptions), Encoding.UTF8);
            Logger.WriteLog(LogType.Initialize, $"Wrote {spawnRows.Count} rows to '{reportPath}'.");

            var templatesPath = Path.Combine(outDir, "template_vehicle_loadouts.json");
            File.WriteAllText(templatesPath, JsonSerializer.Serialize(templateRows, jsonOptions), Encoding.UTF8);
            Logger.WriteLog(LogType.Initialize, $"Wrote {templateRows.Count} rows to '{templatesPath}'.");

            var csvPath = Path.Combine(outDir, "npc_spawns_report.csv");
            File.WriteAllText(csvPath, ToCsv(spawnRows), Encoding.UTF8);
            Logger.WriteLog(LogType.Initialize, $"Wrote '{csvPath}'.");

            return 0;
        }
        catch (Exception ex)
        {
            Logger.WriteLog(LogType.Error, $"AutoCore.Tools: Unhandled exception: {ex}");
            return 1;
        }
    }

    private static void PrintUsage()
    {
        Console.WriteLine("Usage:");
        Console.WriteLine("  dotnet run --project src/AutoCore.Tools -c Release -- --gamePath <path> [--outDir <dir>]");
    }

    private static string? GetArg(string[] args, string name)
    {
        for (var i = 0; i < args.Length; i++)
        {
            if (!string.Equals(args[i], name, StringComparison.OrdinalIgnoreCase))
                continue;

            if (i + 1 >= args.Length)
                return null;

            return args[i + 1];
        }
        return null;
    }

    private static string ToCsv(IEnumerable<SpawnReportRow> rows)
    {
        static string Esc(string? s)
        {
            s ??= "";
            if (s.Contains('"') || s.Contains(',') || s.Contains('\n') || s.Contains('\r'))
                return "\"" + s.Replace("\"", "\"\"") + "\"";
            return s;
        }

        var sb = new StringBuilder();
        sb.AppendLine(string.Join(',',
            "MapFile",
            "MapVersion",
            "SpawnPointCoid",
            "SpawnIndex",
            "IsTemplate",
            "SpawnTypeRaw",
            "SpawnCloneBaseType",
            "ResolvedBaseCBID",
            "ResolvedBaseType",
            "ResolvedDriverCBID",
            "ResolvedWeaponFrontCBID",
            "ResolvedWeaponTurretCBID",
            "ResolvedWeaponRearCBID",
            "ResolvedWeaponMeleeCBID",
            "ResolvedSource",
            "MaxWtWeaponFront",
            "MaxWtWeaponTurret",
            "MaxWtWeaponDrop",
            "TurretSize"
        ));

        foreach (var r in rows)
        {
            sb.AppendLine(string.Join(',',
                Esc(r.MapFile),
                r.MapVersion.ToString(),
                r.SpawnPointCoid.ToString(),
                r.SpawnIndex.ToString(),
                r.IsTemplate ? "1" : "0",
                r.SpawnTypeRaw.ToString(),
                Esc(r.SpawnCloneBaseType),
                r.Resolved?.BaseCBID?.ToString() ?? "",
                Esc(r.Resolved?.BaseType),
                r.Resolved?.DriverCBID?.ToString() ?? "",
                r.Resolved?.WeaponFrontCBID?.ToString() ?? "",
                r.Resolved?.WeaponTurretCBID?.ToString() ?? "",
                r.Resolved?.WeaponRearCBID?.ToString() ?? "",
                r.Resolved?.WeaponMeleeCBID?.ToString() ?? "",
                Esc(r.Resolved?.Source),
                r.VehicleCapacityHints?.MaxWtWeaponFront.ToString() ?? "",
                r.VehicleCapacityHints?.MaxWtWeaponTurret.ToString() ?? "",
                r.VehicleCapacityHints?.MaxWtWeaponDrop.ToString() ?? "",
                r.VehicleCapacityHints?.TurretSize.ToString() ?? ""
            ));
        }

        return sb.ToString();
    }
}


