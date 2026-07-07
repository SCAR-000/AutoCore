namespace AutoCore.MapDump;

public sealed class LevelDto
{
    public string Name { get; set; } = "";
    public TerrainDto Terrain { get; set; } = new();
    public List<ObjectDto> Objects { get; } = new();
    public List<MarkerDto> Markers { get; } = new();
    public List<PathDto> Paths { get; } = new();
    public List<RoadNodeDto> Roads { get; } = new();
    public List<TriggerDto> Triggers { get; } = new();
    public List<ReactionDto> Reactions { get; } = new();
    public MapLogicDto MapLogic { get; set; } = new();
    public Dictionary<string, ObjectIndexEntryDto> ObjectIndex { get; } = new(StringComparer.Ordinal);
}

public sealed class TerrainDto
{
    public int Width { get; set; }
    public int Height { get; set; }
    public float GridSize { get; set; }
    public float HeightScale { get; set; }
    public byte TileSet { get; set; }
    public string? SkyBox { get; set; }
    public float[] Entry { get; set; } = Array.Empty<float>();
    public string Tga { get; set; } = "";
}

public sealed class ObjectDto
{
    public int Cbid { get; set; }
    public int Coid { get; set; }
    public float[] Pos { get; set; } = Array.Empty<float>();
    public float[] Rot { get; set; } = Array.Empty<float>();
    public float Scale { get; set; }
    public float CloneScale { get; set; }
    public float TerrainOffset { get; set; }
    public bool IsActive { get; set; } = true;
    public string? FxCreateExtraName { get; set; }
    public string? Physics { get; set; }
    public string? Unique { get; set; }
    public string? Short { get; set; }
    public string Type { get; set; } = "";
    /// <summary>Authoritative collidable flag from clonebase bitCollidable.
    /// When false, the object should NOT participate in vehicle collision.</summary>
    public bool Collidable { get; set; } = true;
    public long[]? TriggerEvents { get; set; }
}

public sealed class MarkerDto
{
    public string Kind { get; set; } = "";
    public int Cbid { get; set; }
    public int Coid { get; set; }
    public float[] Pos { get; set; } = Array.Empty<float>();
    public string? Label { get; set; }
}

public sealed class RoadNodeDto
{
    public int Id { get; set; }
    public string Type { get; set; } = "road"; // road | junction | river
    public float[] Pos { get; set; } = Array.Empty<float>();
    /// <summary>Road profile name, e.g. "road_2laneasphalt_20" — also the .dds texture
    /// stem; the trailing _NN is the road width in world units (VOGRoadNode.cpp).</summary>
    public string? Tex { get; set; }
    public List<int> Links { get; set; } = new();
    public float? Rotation { get; set; }        // junction only
    public List<float[]>? ArmPos { get; set; }  // junction only (6 arm attach points)
    public List<float[]>? ArmDir { get; set; }  // junction only (6 arm tangents)
    public float? WaterDepth { get; set; }      // river only
}

public sealed class PathDto
{
    public string? Name { get; set; }
    public int Coid { get; set; }
    public List<float[]> Points { get; set; } = new();
}

public sealed class TriggerDto
{
    public int Cbid { get; set; }
    public int Coid { get; set; }
    public float[] Pos { get; set; } = Array.Empty<float>();
    public float[] Rot { get; set; } = Array.Empty<float>();
    public float Scale { get; set; }
    public string? Name { get; set; }
    public float RetriggerDelay { get; set; }
    public float ActivateDelay { get; set; }
    public int ActivationCount { get; set; }
    public string TargetType { get; set; } = "";
    public bool DoCollision { get; set; }
    public bool DoConditionals { get; set; }
    public bool ShowMapTransitionDecals { get; set; }
    public bool DoOnActivate { get; set; }
    public bool AllConditionsNeeded { get; set; }
    public bool ApplyToAllColliders { get; set; }
    public List<long> Reactions { get; } = new();
    public List<TargetRefDto> TargetList { get; } = new();
    public List<ConditionalDto> Conditions { get; } = new();
    public uint Color { get; set; }
    public uint TriggerId { get; set; }
    public ResolvedGraphDto? Graph { get; set; }
}

public sealed class ReactionDto
{
    public int Cbid { get; set; }
    public int Coid { get; set; }
    public string? Name { get; set; }
    public string ReactionType { get; set; } = "";
    public bool ActOnActivator { get; set; }
    public int ObjectiveIDCheck { get; set; }
    public bool DoForConvoy { get; set; }
    public int GenericVar1 { get; set; }
    public float GenericVar2 { get; set; }
    public int GenericVar3 { get; set; }
    public string? MapTransfer { get; set; }
    public int MapTransferData { get; set; }
    public List<long> Objects { get; } = new();
    public List<long> Reactions { get; } = new();
    public ReactionTextDto? Text { get; set; }
    public bool AllConditionsNeeded { get; set; }
    public bool DoForAllPlayers { get; set; }
    public List<ConditionalDto> Conditions { get; } = new();
    public string? MiscText { get; set; }
    public string? WaypointType { get; set; }
    public string? WaypointText { get; set; }
    public List<int> MissionTypes { get; } = new();
    public List<int> Missions { get; } = new();
}

public sealed class ReactionTextDto
{
    public string Type { get; set; } = "";
    public string TargetType { get; set; } = "";
    public string? Main { get; set; }
    public List<ReactionTextParamDto> Params { get; } = new();
    public List<ReactionTextChoiceDto> Choices { get; } = new();
}

public sealed class ReactionTextParamDto
{
    public string Type { get; set; } = "";
    public int Id { get; set; }
    public float CachedValue { get; set; }
}

public sealed class ReactionTextChoiceDto
{
    public long TriggerCoid { get; set; }
    public string? Text { get; set; }
}

public sealed class TargetRefDto
{
    public bool Global { get; set; }
    public long Coid { get; set; }
}

public sealed class ConditionalDto
{
    public int LeftId { get; set; }
    public int RightId { get; set; }
    public string Type { get; set; } = "";
}

public sealed class MapLogicDto
{
    public long PerPlayerLoadTrigger { get; set; }
    public long CreatorLoadTrigger { get; set; }
    public long OnKillTrigger { get; set; }
    public long LastTeamTrigger { get; set; }
    public List<VariableDto> Variables { get; } = new();
}

public sealed class VariableDto
{
    public int Id { get; set; }
    public byte Type { get; set; }
    public float Value { get; set; }
    public float InitialValue { get; set; }
    public bool UniqueForImport { get; set; }
    public string? Name { get; set; }
}

public sealed class ObjectIndexEntryDto
{
    public string Kind { get; set; } = "";
    public string? Label { get; set; }
    public float[]? Pos { get; set; }
    public int? Cbid { get; set; }
}

public sealed class ResolvedGraphDto
{
    public List<ResolvedGraphNodeDto> Nodes { get; } = new();
}

public sealed class ResolvedGraphNodeDto
{
    public long Coid { get; set; }
    public string ReactionType { get; set; } = "";
    public string Summary { get; set; } = "";
    public List<string> Details { get; } = new();
    public List<long> TargetCoids { get; } = new();
    public List<long> LinkedTriggerCoids { get; } = new();
    public ReactionSemanticsDto? Semantics { get; set; }
    public bool IsCycle { get; set; }
    public List<ResolvedGraphNodeDto> Children { get; } = new();
}

public sealed class ReactionSemanticsDto
{
    public string? SummaryLong { get; set; }
    public string Realm { get; set; } = "";
    public string? GhidraHandler { get; set; }
    public string? ImplementationStatus { get; set; }
    public List<string> FieldLabels { get; } = new();
    public List<GhidraCalleeDto> Callees { get; } = new();
}

public sealed class GhidraCalleeDto
{
    public string Address { get; set; } = "";
    public string Symbol { get; set; } = "";
    public string LegacyName { get; set; } = "";
    public string DecompiledSignature { get; set; } = "";
}

public sealed class ReactionDescriptionDto
{
    public string Summary { get; set; } = "";
    public List<string> Details { get; } = new();
    public List<long> TargetCoids { get; } = new();
    public List<long> NestedReactionCoids { get; } = new();
    public List<long> LinkedTriggerCoids { get; } = new();
    public ReactionSemanticsDto? Semantics { get; set; }
}
