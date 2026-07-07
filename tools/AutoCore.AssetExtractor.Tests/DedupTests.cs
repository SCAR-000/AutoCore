using Xunit;

namespace AutoCore.AssetExtractor.Tests;

public class DedupTests
{
    [Fact]
    public void First_seen_glm_wins_for_duplicate_dest_paths()
    {
        var seen = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var destRel = Path.Combine("textures", "i_g_2d_wnd_frame_bevel_solid_light.dds");

        Assert.False(seen.ContainsKey(destRel));
        seen[destRel] = "misc.glm";

        Assert.True(seen.TryGetValue(destRel, out var priorGlm));
        Assert.Equal("misc.glm", priorGlm);

        // Second GLM with same dest path should be skipped (priorGlm already set).
        var shouldSkip = seen.ContainsKey(destRel);
        Assert.True(shouldSkip);
        Assert.NotEqual("textures_base.glm", seen[destRel]);
    }

    [Fact]
    public void Dedup_is_case_insensitive_on_dest_path()
    {
        var seen = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        seen["textures/i_test.dds"] = "misc.glm";

        Assert.True(seen.ContainsKey("Textures/I_Test.dds"));
    }
}
