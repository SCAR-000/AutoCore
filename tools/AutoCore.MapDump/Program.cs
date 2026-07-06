using System.Text.Json;
using AutoCore.Game.Constants;
using AutoCore.Game.Managers;

namespace AutoCore.MapDump;

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
                var level = LevelExporter.DumpMap(fam, stem);
                File.WriteAllText(Path.Combine(outDir, stem + ".json"), JsonSerializer.Serialize(level, jsonOpts));
                index.Add(new
                {
                    name = stem,
                    objects = level.Objects.Count,
                    markers = level.Markers.Count,
                    paths = level.Paths.Count,
                    triggers = level.Triggers.Count,
                    reactions = level.Reactions.Count,
                    width = level.Terrain.Width,
                    height = level.Terrain.Height,
                });
                ok++;
                Console.WriteLine($"  {stem}: {level.Objects.Count} objects, {level.Triggers.Count} triggers, {level.Reactions.Count} reactions, {level.Markers.Count} markers");
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
}
