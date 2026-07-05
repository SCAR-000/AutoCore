namespace AutoCore.AssetExtractor;

using System.Text;

public sealed class GlmReader : IDisposable
{
    private readonly FileStream _fs;
    private readonly BinaryReader _reader;

    public string GlmName { get; }
    public IReadOnlyList<GlmFileEntry> Entries { get; }

    private GlmReader(string filePath)
    {
        GlmName = Path.GetFileName(filePath);
        _fs = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.Read);
        _reader = new BinaryReader(_fs, Encoding.UTF8, leaveOpen: true);
        Entries = ReadEntries();
    }

    public static GlmReader Open(string filePath) => new(filePath);

    public byte[] ReadRawBytes(GlmFileEntry entry)
    {
        var buf = new byte[entry.Size];
        _fs.Seek(entry.Offset, SeekOrigin.Begin);
        _fs.ReadExactly(buf, 0, entry.Size);
        return buf;
    }

    private IReadOnlyList<GlmFileEntry> ReadEntries()
    {
        // GLM layout (from GLMLoader.cs): last 4 bytes are the int32 offset to the CHNK header.
        _reader.BaseStream.Seek(-4, SeekOrigin.End);
        var headerOff = _reader.ReadInt32();
        _reader.BaseStream.Seek(headerOff, SeekOrigin.Begin);

        var magic = Encoding.UTF8.GetString(_reader.ReadBytes(4));
        if (magic != "CHNK")
            throw new InvalidDataException($"{GlmName}: expected CHNK header, got '{magic}'");

        var opts = _reader.ReadBytes(4);
        if (opts[0] != 66) throw new InvalidDataException($"{GlmName}: unsupported non-binary GLM format");
        if (opts[1] != 76) throw new InvalidDataException($"{GlmName}: only little-endian GLM is supported");

        var strTableOff  = _reader.ReadInt32();
        var strTableSize = _reader.ReadInt32();
        var entryCount   = _reader.ReadInt32();

        // Entry structs sit immediately after the header — save position before jumping to string table.
        var entryBlockPos = _reader.BaseStream.Position;

        _reader.BaseStream.Seek(strTableOff, SeekOrigin.Begin);
        var names = ParseStringTable(_reader.ReadBytes(strTableSize));

        if (names.Count != entryCount)
            throw new InvalidDataException(
                $"{GlmName}: string table has {names.Count} names but entryCount={entryCount}");

        _reader.BaseStream.Position = entryBlockPos;
        var entries = new List<GlmFileEntry>(entryCount);
        for (var i = 0; i < entryCount; i++)
        {
            var offset       = _reader.ReadInt32();
            var size         = _reader.ReadInt32();
            var realSize     = _reader.ReadInt32();
            var modifiedTime = _reader.ReadInt32();
            var scheme       = _reader.ReadInt16();
            _reader.ReadInt32(); // reserved (matches `_ = reader.ReadInt32()` in server GLMLoader)
            entries.Add(new GlmFileEntry(names[i], offset, size, realSize, modifiedTime, scheme));
        }

        return entries;
    }

    private static List<string> ParseStringTable(byte[] data)
    {
        var result = new List<string>();
        var sb = new StringBuilder();
        foreach (var b in data)
        {
            if (b != 0) { sb.Append((char)b); }
            else        { result.Add(sb.ToString()); sb.Clear(); }
        }
        return result;
    }

    public void Dispose()
    {
        _reader.Dispose();
        _fs.Dispose();
    }
}
