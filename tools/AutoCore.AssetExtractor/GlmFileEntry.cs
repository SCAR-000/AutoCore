namespace AutoCore.AssetExtractor;

public sealed record GlmFileEntry(
    string Name,
    int    Offset,
    int    Size,
    int    RealSize,
    int    ModifiedTime,
    short  Scheme)
{
    public bool IsCompressed => Size != RealSize;
}
