namespace AutoCore.AssetExtractor;

using System.Text.RegularExpressions;

/// <summary>
/// Filter helpers for AssetExtractor CLI and unit tests.
/// </summary>
public static class ExtractFilter
{
    /// <summary>
    /// UI/interface assets use the <c>i_</c> prefix on the entry basename
    /// (textures from textures_base.glm, layouts from interface.glm).
    /// </summary>
    public static bool IsUiAsset(string entryName)
    {
        var normalised = entryName.Replace('\\', '/').TrimStart('/');
        var baseName = Path.GetFileName(normalised);
        return baseName.StartsWith("i_", StringComparison.OrdinalIgnoreCase);
    }

    public static bool Matches(string entryName, string? filterPattern, bool uiOnly)
    {
        if (uiOnly && IsUiAsset(entryName))
            return true;

        if (filterPattern == null)
            return !uiOnly;

        return BuildRegex(filterPattern).IsMatch(entryName);
    }

    /// <summary>
    /// Converts a filter string to a case-insensitive regex.
    /// Patterns without * or ? are treated as substring matches (implicitly *pattern*).
    /// </summary>
    public static Regex BuildRegex(string pattern)
    {
        if (!pattern.Contains('*') && !pattern.Contains('?'))
            return new Regex(Regex.Escape(pattern), RegexOptions.IgnoreCase);

        var escaped = Regex.Escape(pattern)
            .Replace(@"\*", ".*")
            .Replace(@"\?", ".");
        return new Regex($"^{escaped}$", RegexOptions.IgnoreCase);
    }
}
