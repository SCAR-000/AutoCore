namespace AutoCore.AssetExtractor;

using System.Text;

public sealed class ManifestWriter : IDisposable
{
    private readonly StreamWriter _writer;

    public ManifestWriter(string path)
    {
        _writer = new StreamWriter(path, append: false, Encoding.UTF8) { AutoFlush = false };
        _writer.WriteLine("# AutoCore Asset Extractor manifest");
        _writer.WriteLine("# <dest-relative-path> | <source-glm>");
    }

    public void WriteLine(string destRelPath, string sourceGlm)
        => _writer.WriteLine($"{destRelPath} | {sourceGlm}");

    public void Dispose()
    {
        _writer.Flush();
        _writer.Dispose();
    }
}
