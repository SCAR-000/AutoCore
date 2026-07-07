using AutoCore.Database.World.Models;
using AutoCore.Game.Map;
using Xunit;

namespace AutoCore.Game.Tests;

public class MapVariableRuntimeTests
{
    private static MapData CreateMapData() =>
        new(new ContinentObject { MapFileName = "test.fam" });

    [Fact]
    public void Set_and_get_round_trip()
    {
        var runtime = new MapVariableRuntime(CreateMapData());

        runtime.Set(7, 3.5f);

        Assert.Equal(3.5f, runtime.Get(7));
    }

    [Fact]
    public void Add_subtract_mul_div_paths()
    {
        var runtime = new MapVariableRuntime(CreateMapData());
        runtime.Set(1, 10f);

        runtime.Add(1, 5);
        Assert.Equal(15f, runtime.Get(1));

        runtime.Subtract(1, 3);
        Assert.Equal(12f, runtime.Get(1));

        runtime.Multiply(1, 2);
        Assert.Equal(24f, runtime.Get(1));

        runtime.Divide(1, 4);
        Assert.Equal(6f, runtime.Get(1));
    }

    [Fact]
    public void SetRandom_clamps_to_range()
    {
        var runtime = new MapVariableRuntime(CreateMapData());

        runtime.SetRandom(2, 5f, 10f);
        var value = runtime.Get(2);

        Assert.InRange(value, 5f, 10f);
    }

    [Fact]
    public void Divide_by_zero_is_noop()
    {
        var runtime = new MapVariableRuntime(CreateMapData());
        runtime.Set(3, 8f);

        runtime.Divide(3, 0f);

        Assert.Equal(8f, runtime.Get(3));
    }
}
