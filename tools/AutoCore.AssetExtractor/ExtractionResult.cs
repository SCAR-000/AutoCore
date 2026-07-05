namespace AutoCore.AssetExtractor;

public sealed class ExtractionResult(string glmName)
{
    public string GlmName { get; } = glmName;
    public int Extracted  { get; private set; }
    public int Skipped    { get; private set; }

    public Dictionary<string, int> ByCategory { get; } = new(StringComparer.Ordinal);

    // Scheme audit: (Scheme value, compressed?) -> entry count. The Scheme field is
    // stored per entry but decompression only keys on Size != RealSize; this histogram
    // proves whether any entry carries a scheme we don't handle.
    public Dictionary<(short Scheme, bool Compressed), int> SchemeCounts { get; } = new();

    public void CountScheme(GlmFileEntry entry)
    {
        var key = (entry.Scheme, entry.IsCompressed);
        SchemeCounts[key] = SchemeCounts.GetValueOrDefault(key) + 1;
    }

    public void IncrementExtracted(string category)
    {
        Extracted++;
        ByCategory[category] = ByCategory.GetValueOrDefault(category) + 1;
    }

    public void IncrementSkipped() => Skipped++;
}
