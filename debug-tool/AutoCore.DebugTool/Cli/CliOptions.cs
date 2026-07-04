namespace AutoCore.DebugTool.Cli;

/// <summary>
/// Minimal <c>--flag value</c> / <c>--flag</c> argument parser shared by the commands. Kept dependency-free
/// so the debug tool is a self-contained build.
/// </summary>
public sealed class CliOptions
{
    private readonly Dictionary<string, string?> _values = new(StringComparer.OrdinalIgnoreCase);

    public CliOptions(IEnumerable<string> args)
    {
        string? pendingFlag = null;

        foreach (var arg in args)
        {
            if (arg.StartsWith("--", StringComparison.Ordinal))
            {
                if (pendingFlag != null)
                    _values[pendingFlag] = null; // previous flag was a boolean switch

                pendingFlag = arg[2..];
            }
            else if (pendingFlag != null)
            {
                _values[pendingFlag] = arg;
                pendingFlag = null;
            }
        }

        if (pendingFlag != null)
            _values[pendingFlag] = null;
    }

    public bool Has(string name) => _values.ContainsKey(name);

    public string GetString(string name, string fallback)
        => _values.TryGetValue(name, out var v) && v != null ? v : fallback;

    public int GetInt(string name, int fallback)
        => _values.TryGetValue(name, out var v) && int.TryParse(v, out var parsed) ? parsed : fallback;

    public int? GetIntOrNull(string name)
        => _values.TryGetValue(name, out var v) && int.TryParse(v, out var parsed) ? parsed : null;
}
