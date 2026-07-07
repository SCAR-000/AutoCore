using AutoCore.AssetExtractor;
using Xunit;

namespace AutoCore.AssetExtractor.Tests;

public class ExtractFilterTests
{
    [Theory]
    [InlineData("i_g_2d_wnd_frame_bevel_solid_light.dds", true)]
    [InlineData("textures/i_d_npc_2d_btn_response_up.dds", true)]
    [InlineData("i_d_npc.xml", true)]
    [InlineData("i_d_npc_2d_wnd_frame_dialogue.xml", true)]
    [InlineData("sec_f_h_map_tut_j2_arkbaytutorial.tga", false)]
    [InlineData("veh_p_h_r_cha_00_dune-buggy-newuser.geo", false)]
    [InlineData("mini_map_overlay.dds", false)]
    public void IsUiAsset_matches_i_prefix_basenames_only(string entryName, bool expected)
    {
        Assert.Equal(expected, ExtractFilter.IsUiAsset(entryName));
    }

    [Theory]
    [InlineData("i_g_2d_wnd_frame_bevel_solid_light.dds", "i_*", false, true)]
    [InlineData("sec_urb_01.dds", "i_*", false, false)]
    [InlineData("veh_p_h_r_cha_00_dune-buggy-newuser.geo", "dune-buggy", false, true)]
    [InlineData("textures/i_g_2d_wnd_frame.dds", null, true, true)]
    [InlineData("textures/sec_urb_01.dds", null, true, false)]
    [InlineData("i_d_npc.xml", null, true, true)]
    public void Matches_respects_filter_and_ui_only(string entryName, string? filter, bool uiOnly, bool expected)
    {
        Assert.Equal(expected, ExtractFilter.Matches(entryName, filter, uiOnly));
    }

    [Theory]
    [InlineData("dune-buggy", "veh_p_h_r_cha_00_dune-buggy-newuser.geo", true)]
    [InlineData("dune-buggy", "sec_f_h_map_tut_j2_arkbaytutorial.tga", false)]
    [InlineData("*dune-buggy*", "veh_p_h_r_cha_00_dune-buggy-newuser.geo", true)]
    [InlineData("*dune-buggy*", "sec_f_h_map_tut_j2_arkbaytutorial.tga", false)]
    [InlineData("i_*", "i_g_2d_wnd_frame_bevel_solid_light.dds", true)]
    [InlineData("i_*", "textures/i_g_2d_wnd_frame_bevel_solid_light.dds", false)]
    public void BuildRegex_substring_vs_wildcard(string pattern, string entryName, bool expected)
    {
        var regex = ExtractFilter.BuildRegex(pattern);
        Assert.Equal(expected, regex.IsMatch(entryName));
    }
}
