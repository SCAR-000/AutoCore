namespace AutoCore.AssetExtractor;

using System.IO.Compression;

public static class CompressionHelper
{
    public static byte[] GetData(GlmReader glm, GlmFileEntry entry)
    {
        var raw = glm.ReadRawBytes(entry);
        return entry.IsCompressed ? Decompress(raw, entry.RealSize) : raw;
    }

    // Auto Assault uses zlib-wrapped deflate: 2-byte zlib header + raw deflate payload.
    // DeflateStream handles the deflate block; we skip the 2-byte header before handing it over.
    private static byte[] Decompress(byte[] data, int realSize)
    {
        const int zlibHeaderSize = 2;
        using var input   = new MemoryStream(data, zlibHeaderSize, data.Length - zlibHeaderSize);
        using var deflate = new DeflateStream(input, CompressionMode.Decompress);
        using var output  = new MemoryStream(realSize);
        deflate.CopyTo(output);
        var result = output.ToArray();
        if (result.Length != realSize)
            throw new InvalidDataException(
                $"Decompressed {result.Length} bytes but expected {realSize}");
        return result;
    }
}
