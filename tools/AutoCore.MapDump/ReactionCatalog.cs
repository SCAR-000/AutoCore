using System.Text.Json;
using System.Text.Json.Serialization;

namespace AutoCore.MapDump;

public sealed class ReactionCatalog
{
    private static ReactionCatalog? _instance;
    private readonly Dictionary<string, ReactionCatalogEntry> _byName;

    private ReactionCatalog(ReactionCatalogRoot root)
    {
        _byName = root.Types.ToDictionary(t => t.Name, StringComparer.Ordinal);
        Ghidra = root.Ghidra;
    }

    public ReactionCatalogGhidra Ghidra { get; }

    public static ReactionCatalog Load()
    {
        if (_instance != null)
            return _instance;

        var path = Path.Combine(AppContext.BaseDirectory, "reaction-catalog.json");
        if (!File.Exists(path))
        {
            path = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "model-viewer", "reaction-catalog.json"));
        }

        if (!File.Exists(path))
            throw new FileNotFoundException("reaction-catalog.json not found", path);

        var json = File.ReadAllText(path);
        var root = JsonSerializer.Deserialize<ReactionCatalogRoot>(json, JsonOptions)
            ?? throw new InvalidDataException("reaction-catalog.json is empty");

        _instance = new ReactionCatalog(root);
        return _instance;
    }

    public static ReactionCatalog Instance => Load();

    public bool TryGet(string reactionType, out ReactionCatalogEntry entry) =>
        _byName.TryGetValue(reactionType, out entry!);

    public ReactionCatalogEntry? Get(string reactionType) =>
        _byName.TryGetValue(reactionType, out var entry) ? entry : null;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true,
    };
}

public sealed class ReactionCatalogRoot
{
    [JsonPropertyName("version")]
    public int Version { get; set; }

    [JsonPropertyName("ghidra")]
    public ReactionCatalogGhidra Ghidra { get; set; } = new();

    [JsonPropertyName("types")]
    public List<ReactionCatalogEntry> Types { get; set; } = new();
}

public sealed class ReactionCatalogGhidra
{
    [JsonPropertyName("dispatch")]
    public string Dispatch { get; set; } = "";

    [JsonPropertyName("dispatchSymbol")]
    public string DispatchSymbol { get; set; } = "";

    [JsonPropertyName("variableLookup")]
    public string VariableLookup { get; set; } = "";
}

public sealed class ReactionCatalogEntry
{
    [JsonPropertyName("id")]
    public int Id { get; set; }

    [JsonPropertyName("name")]
    public string Name { get; set; } = "";

    [JsonPropertyName("realm")]
    public string Realm { get; set; } = "";

    [JsonPropertyName("summary")]
    public string Summary { get; set; } = "";

    [JsonPropertyName("description")]
    public string? Description { get; set; }

    [JsonPropertyName("fields")]
    public Dictionary<string, ReactionFieldRole>? Fields { get; set; }

    [JsonPropertyName("implementationStatus")]
    public string? ImplementationStatus { get; set; }

    [JsonPropertyName("confidence")]
    public string? Confidence { get; set; }

    [JsonPropertyName("ghidra")]
    public ReactionEntryGhidra? Ghidra { get; set; }

    [JsonPropertyName("callees")]
    public List<string>? Callees { get; set; }
}

public sealed class ReactionFieldRole
{
    [JsonPropertyName("role")]
    public string Role { get; set; } = "";

    [JsonPropertyName("label")]
    public string Label { get; set; } = "";
}

public sealed class ReactionEntryGhidra
{
    [JsonPropertyName("dispatchCase")]
    public int DispatchCase { get; set; }

    [JsonPropertyName("handler")]
    public string Handler { get; set; } = "";
}
