using AutoCore.AssetExtractor;
using Xunit;

namespace AutoCore.AssetExtractor.Tests;

public class AssetCategoryTests
{
    [Theory]
    [InlineData("i_g_2d_wnd_frame_bevel_solid_light.dds", "textures")]
    [InlineData("textures/i_d_npc_2d_btn_response_up.dds", "textures")]
    [InlineData("sec_f_h_map_tut_j2_arkbaytutorial.tga", "textures")]
    [InlineData("veh_p_h_r_cha_00_dune-buggy-newuser.geo", "models")]
    public void GetCategory_maps_known_extensions(string entryName, string expected)
    {
        Assert.Equal(expected, AssetCategory.GetCategory(entryName));
    }

    [Theory]
    [InlineData("i_d_npc.xml", "data")]
    [InlineData("i_d_npc_2d_wnd_frame_dialogue.xml", "data")]
    public void GetCategory_maps_ui_layout_xml_to_data(string entryName, string expected)
    {
        Assert.Equal(expected, AssetCategory.GetCategory(entryName));
    }

    [Fact]
    public void GetCategory_unknown_extension_falls_back_to_other()
    {
        Assert.Equal("other", AssetCategory.GetCategory("readme.xyz"));
    }
}
