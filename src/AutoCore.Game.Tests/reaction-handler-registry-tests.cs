using AutoCore.Game.Entities;
using AutoCore.Game.Reactions;
using Xunit;

namespace AutoCore.Game.Tests;

public class ReactionHandlerRegistryTests
{
    [Theory]
    [InlineData(ReactionType.Activate)]
    [InlineData(ReactionType.Delete)]
    [InlineData(ReactionType.Death)]
    [InlineData(ReactionType.VariableSet)]
    [InlineData(ReactionType.VariableSetRandom)]
    [InlineData(ReactionType.MarkRepairStation)]
    [InlineData(ReactionType.CompleteObjective)]
    [InlineData(ReactionType.FailMission)]
    [InlineData(ReactionType.TransferMap)]
    public void TierA_handlers_are_registered(ReactionType type)
    {
        Assert.True(ReactionHandlerRegistry.IsImplemented(type));
    }

    [Fact]
    public void Unimplemented_retail_only_types_are_not_registered()
    {
        Assert.False(ReactionHandlerRegistry.IsImplemented(ReactionType.MakeFriend));
        Assert.False(ReactionHandlerRegistry.IsImplemented(ReactionType.ClientText));
    }
}
