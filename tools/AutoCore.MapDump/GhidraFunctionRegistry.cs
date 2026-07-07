using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace AutoCore.MapDump;

public sealed class GhidraFunctionRegistry
{
    private static GhidraFunctionRegistry? _instance;
    private readonly Dictionary<string, GhidraFunctionEntry> _byAddress;

    private GhidraFunctionRegistry(Dictionary<string, GhidraFunctionEntry> byAddress)
    {
        _byAddress = byAddress;
    }

    public static GhidraFunctionRegistry? TryLoad()
    {
        if (_instance != null)
            return _instance;

        var path = Path.Combine(AppContext.BaseDirectory, "ghidra-functions.json");
        if (!File.Exists(path))
        {
            path = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "model-viewer", "ghidra-functions.json"));
        }

        if (!File.Exists(path))
            return null;

        var json = File.ReadAllText(path);
        var root = JsonSerializer.Deserialize<GhidraFunctionRoot>(json, JsonOptions);
        if (root?.Functions == null)
            return null;

        var map = new Dictionary<string, GhidraFunctionEntry>(StringComparer.OrdinalIgnoreCase);
        foreach (var (key, entry) in root.Functions)
        {
            var addr = (entry.Address ?? key).ToLowerInvariant();
            entry.Address = addr;
            map[addr] = entry;
        }

        _instance = new GhidraFunctionRegistry(map);
        return _instance;
    }

    public bool TryGet(string addressOrLegacy, out GhidraFunctionEntry entry)
    {
        entry = null!;
        if (string.IsNullOrWhiteSpace(addressOrLegacy))
            return false;

        var addrMatch = Regex.Match(addressOrLegacy, @"0x[0-9a-fA-F]+");
        if (addrMatch.Success && _byAddress.TryGetValue(addrMatch.Value.ToLowerInvariant(), out entry!))
            return true;

        var funMatch = Regex.Match(addressOrLegacy, @"FUN_[0-9a-fA-F]+", RegexOptions.IgnoreCase);
        if (!funMatch.Success)
            return false;

        var legacy = funMatch.Value.ToLowerInvariant();
        entry = _byAddress.Values.FirstOrDefault(e =>
            string.Equals(e.LegacyName, legacy, StringComparison.OrdinalIgnoreCase))!;
        return entry != null;
    }

    public IEnumerable<GhidraFunctionEntry> ResolveCallees(IEnumerable<string>? calleeRefs)
    {
        if (calleeRefs == null)
            yield break;

        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var reference in calleeRefs)
        {
            if (string.IsNullOrWhiteSpace(reference) || reference.StartsWith("vtable", StringComparison.Ordinal))
                continue;
            if (!TryGet(reference, out var entry))
                continue;
            if (!seen.Add(entry.Address))
                continue;
            yield return entry;
        }
    }

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true,
    };
}

public sealed class GhidraFunctionRoot
{
    [JsonPropertyName("functions")]
    public Dictionary<string, GhidraFunctionEntry> Functions { get; set; } = new();
}

public sealed class GhidraFunctionEntry
{
    [JsonPropertyName("address")]
    public string Address { get; set; } = "";

    [JsonPropertyName("legacyName")]
    public string LegacyName { get; set; } = "";

    [JsonPropertyName("symbol")]
    public string Symbol { get; set; } = "";

    [JsonPropertyName("decompiledSignature")]
    public string DecompiledSignature { get; set; } = "";
}
