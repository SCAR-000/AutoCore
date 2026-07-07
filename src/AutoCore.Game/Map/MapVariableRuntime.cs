namespace AutoCore.Game.Map;

using AutoCore.Game.Structures;

/// <summary>
/// Mutable runtime values for map logic variables (FUN_005b05f0 / FUN_005afbc0 semantics).
/// </summary>
public sealed class MapVariableRuntime
{
    private readonly MapData _mapData;
    private readonly Dictionary<int, float> _overrides = new();

    public MapVariableRuntime(MapData mapData)
    {
        _mapData = mapData;
        ResetToInitial();
    }

    public void ResetToInitial()
    {
        _overrides.Clear();
        foreach (var (id, variable) in _mapData.Variables)
            _overrides[id] = variable.InitialValue;
    }

    public bool TryGetDefinition(int variableId, out Variable variable) =>
        _mapData.Variables.TryGetValue(variableId, out variable!);

    public float Get(int variableId)
    {
        if (_overrides.TryGetValue(variableId, out var value))
            return value;

        if (_mapData.Variables.TryGetValue(variableId, out var def))
            return def.Value;

        return 0f;
    }

    public void Set(int variableId, float value) => _overrides[variableId] = value;

    public void Add(int variableId, float delta) => Set(variableId, Get(variableId) + delta);

    public void Subtract(int variableId, float delta) => Add(variableId, -delta);

    public void Multiply(int variableId, float factor) => Set(variableId, Get(variableId) * factor);

    public void Divide(int variableId, float divisor)
    {
        if (Math.Abs(divisor) < 0.0001f)
            return;

        Set(variableId, Get(variableId) / divisor);
    }

    public void SetRandom(int variableId, float min, float max)
    {
        var lo = Math.Min(min, max);
        var hi = Math.Max(min, max);
        var value = lo + (float)Random.Shared.NextDouble() * (hi - lo);
        Set(variableId, value);
    }
}
