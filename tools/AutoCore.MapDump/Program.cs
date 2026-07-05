using System.Text.Json;
using AutoCore.Database.World.Models;
using AutoCore.Game.CloneBases;
using AutoCore.Game.Constants;
using AutoCore.Game.EntityTemplates;
using AutoCore.Game.Managers;
using AutoCore.Game.Map;

namespace AutoCore.MapDump;

// Parses extracted Auto Assault .fam maps into per-level JSON for the three.js level viewer.
// Emits every object placement (cbid + world transform + name candidates), positioned markers
// (spawn/enter/store/outpost), map-path polylines, and terrain header info (width/height/grid +
// the .tga heightfield path; height = alpha * 4.0, see docs/terrain-format-findings.md).
//
// Usage:
//   mapdump <game-path> <maps-dir> <output-dir>
//   e.g. mapdump "C:\Program Files (x86)\NetDevil\Auto Assault" assets/extracted/maps tools/model-viewer/levels
// game-path only needs to contain clonebase.wad + exe\autoassault.exe (no MySQL needed).
internal static class Program
{
    private static int Main(string[] args)
    {
        if (args.Length < 3)
        {
            Console.Error.WriteLine("usage: mapdump <game-path> <maps-dir> <output-dir>");
            return 1;
        }

        var gamePath = args[0];
        var mapsDir = args[1];
        var outDir = args[2];

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

        Directory.CreateDirectory(outDir);
        var famFiles = Directory.GetFiles(mapsDir, "*.fam").OrderBy(f => f).ToArray();
        Console.WriteLine($"Found {famFiles.Length} .fam files");

        var index = new List<object>();
        var jsonOpts = new JsonSerializerOptions { WriteIndented = false };
        var ok = 0;
        var failed = 0;

        foreach (var fam in famFiles)
        {
            var stem = Path.GetFileNameWithoutExtension(fam);
            try
            {
                var level = DumpMap(fam, stem);
                File.WriteAllText(Path.Combine(outDir, stem + ".json"), JsonSerializer.Serialize(level, jsonOpts));
                index.Add(new
                {
                    name = stem,
                    objects = level.Objects.Count,
                    markers = level.Markers.Count,
                    paths = level.Paths.Count,
                    width = level.Terrain.Width,
                    height = level.Terrain.Height,
                });
                ok++;
                Console.WriteLine($"  {stem}: {level.Objects.Count} objects, {level.Markers.Count} markers, {level.Paths.Count} paths");
            }
            catch (Exception e)
            {
                failed++;
                Console.Error.WriteLine($"  [fail] {stem}: {e.Message}");
            }
        }

        File.WriteAllText(Path.Combine(outDir, "levels-index.json"),
            JsonSerializer.Serialize(index.OrderBy(o => ((dynamic)o).name).ToList(), jsonOpts));
        Console.WriteLine($"Done. {ok} ok, {failed} failed. Output: {Path.GetFullPath(outDir)}");
        return 0;
    }

    private static Level DumpMap(string famPath, string stem)
    {
        var bytes = File.ReadAllBytes(famPath);

        // Terrain header: width/height aren't kept by MapData (it skips them), so read directly.
        // Layout: version(i32) [+ iterVersion(i32) if version>=27] then width(i32), height(i32).
        var version = BitConverter.ToInt32(bytes, 0);
        var whOffset = version >= 27 ? 8 : 4;
        var width = BitConverter.ToInt32(bytes, whOffset);
        var height = BitConverter.ToInt32(bytes, whOffset + 4);

        var continent = new ContinentObject { Id = 0, MapFileName = stem };
        var mapData = new MapData(continent);
        using (var reader = new BinaryReader(new MemoryStream(bytes)))
            mapData.Read(reader);

        var level = new Level
        {
            Name = stem,
            Terrain = new Terrain
            {
                Width = width,
                Height = height,
                GridSize = mapData.GridSize,
                HeightScale = 4.0f, // world units per alpha level (docs/terrain-format-findings.md)
                TileSet = mapData.TileSet,
                SkyBox = mapData.SkyBoxName,
                Entry = new[] { mapData.EntryPoint.X, mapData.EntryPoint.Y, mapData.EntryPoint.Z },
                Tga = $"assets/extracted/textures/{stem}.tga",
            },
        };

        foreach (var template in mapData.Templates.Values)
        {
            switch (template)
            {
                case SpawnPointTemplate sp:
                    level.Markers.Add(MakeMarker("spawn", sp.CBID, sp.Location.X, sp.Location.Y, sp.Location.Z));
                    break;
                case EnterPointTemplate ep:
                    level.Markers.Add(MakeMarker("enter", ep.CBID, ep.Location.X, ep.Location.Y, ep.Location.Z));
                    break;
                case StoreTemplate st:
                    level.Markers.Add(MakeMarker("store", st.CBID, st.Location.X, st.Location.Y, st.Location.Z, st.Name));
                    break;
                case OutpostTemplate op:
                    level.Markers.Add(MakeMarker("outpost", op.CBID, op.Location.X, op.Location.Y, op.Location.Z, op.Name));
                    break;
                case MapPathTemplate mp:
                    level.Paths.Add(new PathDto
                    {
                        Name = mp.PathName,
                        Points = mp.Points.Select(pt => new[] { pt.Position.X, pt.Position.Y, pt.Position.Z }).ToList(),
                    });
                    break;
                case GraphicsObjectTemplate go:
                    // Renderable prop/building. QuestObjectTemplate is also a GraphicsObjectTemplate.
                    var (physics, unique, shortDesc, typeName, cloneScale) = ResolveNames(go.CBID);
                    level.Objects.Add(new ObjectDto
                    {
                        Cbid = go.CBID,
                        Coid = go.COID,
                        Pos = new[] { go.Location.X, go.Location.Y, go.Location.Z },
                        Rot = new[] { go.Rotation.X, go.Rotation.Y, go.Rotation.Z, go.Rotation.W },
                        Scale = go.Scale <= 0 ? 1f : go.Scale,
                        CloneScale = cloneScale,
                        Physics = physics,
                        Unique = unique,
                        Short = shortDesc,
                        Type = typeName,
                    });
                    break;
            }
        }

        return level;
    }

    private static MarkerDto MakeMarker(string kind, int cbid, float x, float y, float z, string? label = null)
    {
        var (_, unique, shortDesc, _, _) = ResolveNames(cbid);
        return new MarkerDto { Kind = kind, Cbid = cbid, Pos = new[] { x, y, z }, Label = label ?? unique ?? shortDesc };
    }

    private static (string? physics, string? unique, string? shortDesc, string type, float cloneScale) ResolveNames(int cbid)
    {
        var cb = AssetManager.Instance.GetCloneBase(cbid);
        if (cb == null)
            return (null, null, null, "Unknown", 1f);

        string? physics = null;
        var cloneScale = 1f;
        if (cb is CloneBaseObject obj)
        {
            physics = Clean(obj.SimpleObjectSpecific.PhysicsName);
            cloneScale = obj.SimpleObjectSpecific.Scale;
        }

        return (physics, Clean(cb.CloneBaseSpecific.UniqueName), Clean(cb.CloneBaseSpecific.ShortDesc), cb.Type.ToString(), cloneScale);
    }

    private static string? Clean(string? s)
    {
        if (string.IsNullOrWhiteSpace(s)) return null;
        s = s.Trim().TrimEnd('\0').Trim();
        return s.Length == 0 ? null : s;
    }

    // --- DTOs (System.Text.Json serializes public properties) ---
    private sealed class Level
    {
        public string Name { get; set; } = "";
        public Terrain Terrain { get; set; } = new();
        public List<ObjectDto> Objects { get; } = new();
        public List<MarkerDto> Markers { get; } = new();
        public List<PathDto> Paths { get; } = new();
    }

    private sealed class Terrain
    {
        public int Width { get; set; }
        public int Height { get; set; }
        public float GridSize { get; set; }
        public float HeightScale { get; set; }
        public byte TileSet { get; set; }
        public string? SkyBox { get; set; }
        public float[] Entry { get; set; } = System.Array.Empty<float>();
        public string Tga { get; set; } = "";
    }

    private sealed class ObjectDto
    {
        public int Cbid { get; set; }
        public int Coid { get; set; }
        public float[] Pos { get; set; } = System.Array.Empty<float>();
        public float[] Rot { get; set; } = System.Array.Empty<float>();
        public float Scale { get; set; }
        public float CloneScale { get; set; }
        public string? Physics { get; set; }
        public string? Unique { get; set; }
        public string? Short { get; set; }
        public string Type { get; set; } = "";
    }

    private sealed class MarkerDto
    {
        public string Kind { get; set; } = "";
        public int Cbid { get; set; }
        public float[] Pos { get; set; } = System.Array.Empty<float>();
        public string? Label { get; set; }
    }

    private sealed class PathDto
    {
        public string? Name { get; set; }
        public List<float[]> Points { get; set; } = new();
    }
}
