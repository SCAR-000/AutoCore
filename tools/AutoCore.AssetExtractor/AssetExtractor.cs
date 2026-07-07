namespace AutoCore.AssetExtractor;

public static class AssetExtractor
{
    public static int Run(string gamePath, string outputPath, string? filter = null, bool uiOnly = false)
    {
        if (!Directory.Exists(gamePath))
        {
            Console.Error.WriteLine($"Game path not found: {gamePath}");
            return 1;
        }

        var glmFiles = Directory.GetFiles(gamePath, "*.glm", SearchOption.TopDirectoryOnly);
        if (glmFiles.Length == 0)
        {
            Console.Error.WriteLine("No *.glm files found in the specified game directory.");
            return 1;
        }

        // misc.glm first (matches server lookup priority in GLMLoader.GetStream), then alphabetical.
        glmFiles = [.. glmFiles.OrderBy(f =>
        {
            var name = Path.GetFileName(f);
            return name.Equals("misc.glm", StringComparison.OrdinalIgnoreCase) ? "\0" : name;
        })];

        if (uiOnly)
            Console.WriteLine("Filter: --ui-only (i_* interface textures and layouts)");
        else if (filter != null)
            Console.WriteLine($"Filter: {filter}");

        Directory.CreateDirectory(outputPath);

        using var manifest = new ManifestWriter(Path.Combine(outputPath, "manifest.txt"));

        // Keys on dest-relative-path (OrdinalIgnoreCase) across all GLMs — first-seen wins.
        var seen = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        var totalExtracted = 0;
        var totalSkipped   = 0;
        var schemeTotals   = new Dictionary<(short Scheme, bool Compressed), int>();

        foreach (var glmPath in glmFiles)
        {
            var result = ExtractGlm(glmPath, outputPath, manifest, seen, filter, uiOnly);
            totalExtracted += result.Extracted;
            totalSkipped   += result.Skipped;
            foreach (var (key, count) in result.SchemeCounts)
                schemeTotals[key] = schemeTotals.GetValueOrDefault(key) + count;

            if (result.Extracted == 0 && result.Skipped == 0)
                continue;

            var cats = string.Join(", ", result.ByCategory
                .Where(kv => kv.Value > 0)
                .OrderByDescending(kv => kv.Value)
                .Select(kv => $"{kv.Key}={kv.Value}"));

            Console.WriteLine($"  {result.GlmName}: {result.Extracted} extracted" +
                              (result.Skipped > 0 ? $", {result.Skipped} skipped" : "") +
                              (cats.Length > 0 ? $" — {cats}" : ""));
        }

        Console.WriteLine();
        Console.WriteLine("Scheme audit (scheme value / storage, counted over every entry in every GLM):");
        foreach (var ((scheme, compressed), count) in schemeTotals.OrderBy(kv => kv.Key.Scheme).ThenBy(kv => kv.Key.Compressed))
            Console.WriteLine($"  scheme={scheme} {(compressed ? "compressed(zlib assumed)" : "stored")}: {count}");

        var compressedSchemes = schemeTotals.Keys.Where(k => k.Compressed).Select(k => k.Scheme).Distinct().ToList();
        if (compressedSchemes.Count > 1)
            Console.Error.WriteLine($"  [WARNING] Compressed entries carry {compressedSchemes.Count} distinct scheme values " +
                                    $"({string.Join(", ", compressedSchemes)}) — the blanket zlib assumption may be wrong for some.");

        Console.WriteLine();
        Console.WriteLine($"Done. {totalExtracted} files extracted, {totalSkipped} skipped.");
        Console.WriteLine($"Output: {Path.GetFullPath(outputPath)}");
        return 0;
    }

    private static ExtractionResult ExtractGlm(
        string glmPath, string outputRoot, ManifestWriter manifest,
        Dictionary<string, string> seen, string? filter, bool uiOnly)
    {
        var result = new ExtractionResult(Path.GetFileName(glmPath));

        using var glm = GlmReader.Open(glmPath);

        foreach (var entry in glm.Entries)
        {
            // Audit every entry, including filtered-out ones, so any run covers the whole archive.
            result.CountScheme(entry);

            if (!ExtractFilter.Matches(entry.Name, filter, uiOnly))
                continue;

            var category   = AssetCategory.GetCategory(entry.Name);
            var normalised = entry.Name.Replace('\\', '/').TrimStart('/');
            var destRel    = Path.Combine(category, normalised.Replace('/', Path.DirectorySeparatorChar));

            if (seen.TryGetValue(destRel, out var priorGlm))
            {
                result.IncrementSkipped();
                continue;
            }

            var destFull = Path.Combine(outputRoot, destRel);
            Directory.CreateDirectory(Path.GetDirectoryName(destFull)!);

            try
            {
                var data = CompressionHelper.GetData(glm, entry);
                File.WriteAllBytes(destFull, data);
                seen[destRel] = result.GlmName;
                result.IncrementExtracted(category);
                manifest.WriteLine(destRel, result.GlmName);
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"  [error] '{entry.Name}' from {result.GlmName}: {ex.Message}");
                result.IncrementSkipped();
            }
        }

        return result;
    }
}
