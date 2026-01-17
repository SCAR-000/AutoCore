namespace AutoCore.Game.Map;

using AutoCore.Game.Constants;
using AutoCore.Game.Managers;

public static class MiniCatalogParser
{
    public static Dictionary<int, MiniCatalogTemplate> ResolveTemplateLoadouts(
        IReadOnlyCollection<int> templateIds,
        byte[]? catalogBytes)
    {
        var result = new Dictionary<int, MiniCatalogTemplate>();
        if (templateIds.Count == 0 || catalogBytes == null || catalogBytes.Length < 16)
            return result;

        foreach (var templateId in templateIds)
        {
            var best = TryFindBestCandidate(templateId, catalogBytes);
            if (best != null)
                result[templateId] = best;
        }

        return result;
    }

    private static MiniCatalogTemplate? TryFindBestCandidate(int templateId, byte[] bytes)
    {
        // Scan for little-endian int32 occurrences of templateId, then attempt to interpret a fixed
        // int32 layout after it:
        //   [templateId][baseCbid][driverCbid][frontWeapon][turretWeapon][rearWeapon][meleeWeapon]...
        //
        // This is a heuristic (the true layout may contain padding/extra fields), but works well
        // when the catalog contains a clean record with these fields near each other.

        var pat = BitConverter.GetBytes(templateId);
        var bestScore = 0;
        var bestOffset = -1;
        int? bestBase = null, bestDriver = null, bestFront = null, bestTurret = null, bestRear = null, bestMelee = null;
        string? bestBaseType = null;

        for (var off = 0; off <= bytes.Length - 4; off += 4)
        {
            if (bytes[off] != pat[0] || bytes[off + 1] != pat[1] || bytes[off + 2] != pat[2] || bytes[off + 3] != pat[3])
                continue;

            var candidate = ScoreCandidate(bytes, off);
            if (candidate.score > bestScore)
            {
                bestScore = candidate.score;
                bestOffset = off;
                bestBase = candidate.baseCbid;
                bestBaseType = candidate.baseType;
                bestDriver = candidate.driverCbid;
                bestFront = candidate.frontWeapon;
                bestTurret = candidate.turretWeapon;
                bestRear = candidate.rearWeapon;
                bestMelee = candidate.meleeWeapon;
            }
        }

        if (bestScore <= 0)
            return null;

        return new MiniCatalogTemplate
        {
            TemplateId = templateId,
            BaseCBID = bestBase,
            BaseType = bestBaseType,
            DriverCBID = bestDriver,
            WeaponFrontCBID = bestFront,
            WeaponTurretCBID = bestTurret,
            WeaponRearCBID = bestRear,
            WeaponMeleeCBID = bestMelee,
            Score = bestScore,
            MatchOffset = bestOffset
        };
    }

    private static (int score, int? baseCbid, string? baseType, int? driverCbid, int? frontWeapon, int? turretWeapon, int? rearWeapon, int? meleeWeapon)
        ScoreCandidate(byte[] bytes, int templateOffset)
    {
        // Parse a window of int32s after templateId and pick likely fields by CloneBase type.
        // This is intentionally tolerant of padding/extra fields in the true record layout.
        var windowStart = templateOffset + 4;
        if (windowStart + 4 > bytes.Length)
            return (0, null, null, null, null, null, null, null);

        var maxBytes = Math.Min(256, bytes.Length - windowStart);
        var intCount = maxBytes / 4;
        if (intCount <= 0)
            return (0, null, null, null, null, null, null, null);

        var ints = new int[intCount];
        for (var i = 0; i < intCount; i++)
            ints[i] = BitConverter.ToInt32(bytes, windowStart + i * 4);

        int? baseCbid = null;
        string? baseType = null;
        CloneBaseObjectType? baseObjType = null;

        // Prefer a base within the first few ints.
        for (var i = 0; i < Math.Min(12, ints.Length); i++)
        {
            var v = ints[i];
            if (v <= 0)
                continue;
            var cb = AssetManager.Instance.GetCloneBase(v);
            if (cb == null)
                continue;
            if (cb.Type == CloneBaseObjectType.Vehicle || cb.Type == CloneBaseObjectType.Creature)
            {
                baseCbid = v;
                baseType = cb.Type.ToString();
                baseObjType = cb.Type;
                break;
            }
        }

        // Collect weapons found in window (unique, in-order).
        var weapons = new List<int>(capacity: 4);
        for (var i = 0; i < ints.Length; i++)
        {
            var v = ints[i];
            if (v <= 0 || weapons.Contains(v))
                continue;
            if (IsWeapon(v))
                weapons.Add(v);
            if (weapons.Count >= 4)
                break;
        }

        // Driver: first character/creature not equal to base.
        int? driverCbid = null;
        for (var i = 0; i < Math.Min(24, ints.Length); i++)
        {
            var v = ints[i];
            if (v <= 0 || (baseCbid.HasValue && v == baseCbid.Value))
                continue;
            var cb = AssetManager.Instance.GetCloneBase(v);
            if (cb == null)
                continue;
            if (cb.Type == CloneBaseObjectType.Character || cb.Type == CloneBaseObjectType.Creature)
            {
                driverCbid = v;
                break;
            }
        }

        var score = 0;
        if (baseObjType.HasValue)
        {
            score += baseObjType.Value switch
            {
                CloneBaseObjectType.Vehicle => 60,
                CloneBaseObjectType.Creature => 50,
                _ => 0
            };
        }

        if (driverCbid.HasValue)
            score += 10;

        // Assign likely slots by order.
        int? frontWeapon = weapons.Count > 0 ? weapons[0] : null;
        int? turretWeapon = weapons.Count > 1 ? weapons[1] : null;
        int? rearWeapon = weapons.Count > 2 ? weapons[2] : null;
        int? meleeWeapon = weapons.Count > 3 ? weapons[3] : null;

        score += frontWeapon.HasValue ? 25 : 0;
        score += turretWeapon.HasValue ? 25 : 0;
        score += rearWeapon.HasValue ? 12 : 0;
        score += meleeWeapon.HasValue ? 12 : 0;

        if (baseObjType == CloneBaseObjectType.Vehicle && weapons.Count > 0)
            score += 10;

        // Strongly discourage matches without a base.
        if (!baseCbid.HasValue)
            score = 0;

        return (score, baseCbid, baseType, driverCbid, frontWeapon, turretWeapon, rearWeapon, meleeWeapon);
    }

    private static int WeaponScore(int cbid, int weight)
        => IsWeapon(cbid) ? weight : 0;

    private static bool IsWeapon(int cbid)
    {
        if (cbid <= 0)
            return false;
        var cb = AssetManager.Instance.GetCloneBase(cbid);
        return cb != null && (cb.Type == CloneBaseObjectType.Weapon || cb.Type == CloneBaseObjectType.Bullet);
    }

    public static bool LooksLikePrintablePath(string s)
    {
        if (string.IsNullOrWhiteSpace(s))
            return false;

        foreach (var ch in s)
        {
            if (ch == '\0')
                return false;
            if (ch < 0x20 && ch != '\t')
                return false;
        }

        return true;
    }

    public static string NormalizeFileName(string s)
    {
        s = s.Trim();
        s = s.Replace('\\', '/');
        var idx = s.LastIndexOf('/');
        return idx >= 0 ? s[(idx + 1)..] : s;
    }
}


