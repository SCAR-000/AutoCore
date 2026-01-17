namespace AutoCore.Game.Map;

public sealed class MiniCatalogTemplate
{
    public required int TemplateId { get; init; }

    public int? BaseCBID { get; init; }
    public string? BaseType { get; init; }

    public int? DriverCBID { get; init; }

    public int? WeaponFrontCBID { get; init; }
    public int? WeaponTurretCBID { get; init; }
    public int? WeaponRearCBID { get; init; }
    public int? WeaponMeleeCBID { get; init; }

    // Heuristic decode metadata (useful to validate/iterate on the parser)
    public int Score { get; init; }
    public int MatchOffset { get; init; }
}


