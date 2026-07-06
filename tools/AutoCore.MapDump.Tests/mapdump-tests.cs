using AutoCore.Game.Managers;
using AutoCore.MapDump;
using Xunit;

namespace AutoCore.MapDump.Tests;

public class ReactionDescriberTests
{
    [Fact]
    public void Describe_Activate_lists_target_coids()
    {
        var index = new Dictionary<string, ObjectIndexEntryDto>
        {
            ["100"] = new() { Kind = "object", Label = "Wall", Pos = new[] { 1f, 2f, 3f } },
        };
        var reaction = new ReactionDto
        {
            Coid = 50,
            ReactionType = "Activate",
        };
        reaction.Objects.Add(100);

        var desc = ReactionDescriber.Describe(reaction, index, new Dictionary<int, VariableDto>());

        Assert.Contains("Wall", desc.Summary);
        Assert.Contains(100L, desc.TargetCoids);
    }

    [Fact]
    public void Describe_TransferMap_includes_map_transfer_type()
    {
        var reaction = new ReactionDto
        {
            ReactionType = "TransferMap",
            MapTransfer = "ContinentObject",
            MapTransferData = 42,
        };

        var desc = ReactionDescriber.Describe(reaction, new Dictionary<string, ObjectIndexEntryDto>(), new Dictionary<int, VariableDto>());

        Assert.Contains("ContinentObject", desc.Summary);
        Assert.Contains("42", desc.Summary);
    }

    [Fact]
    public void Describe_VariableSet_uses_variable_name()
    {
        var variables = new Dictionary<int, VariableDto>
        {
            [7] = new() { Id = 7, Name = "gate_open" },
        };
        var reaction = new ReactionDto
        {
            ReactionType = "VariableSet",
            GenericVar1 = 7,
            GenericVar3 = 1,
        };

        var desc = ReactionDescriber.Describe(reaction, new Dictionary<string, ObjectIndexEntryDto>(), variables);

        Assert.Contains("gate_open", desc.Summary);
    }
}

public class TriggerGraphResolverTests
{
    [Fact]
    public void ResolveTriggerGraph_detects_cycles()
    {
        var trigger = new TriggerDto { Coid = 1 };
        trigger.Reactions.Add(10);

        var reactions = new Dictionary<long, ReactionDto>
        {
            [10] = new()
            {
                Coid = 10,
                ReactionType = "Activate",
            },
        };
        reactions[10].Reactions.Add(10);

        var graph = TriggerGraphResolver.ResolveTriggerGraph(
            trigger,
            reactions,
            new Dictionary<string, ObjectIndexEntryDto>(),
            new Dictionary<int, VariableDto>());

        Assert.Single(graph.Nodes);
        Assert.True(graph.Nodes[0].Children[0].IsCycle);
    }

    [Fact]
    public void ResolveTriggerGraph_follows_nested_reactions()
    {
        var trigger = new TriggerDto { Coid = 1 };
        trigger.Reactions.Add(10);

        var reactions = new Dictionary<long, ReactionDto>
        {
            [10] = new() { Coid = 10, ReactionType = "Activate" },
            [20] = new() { Coid = 20, ReactionType = "Text", Name = "Hello" },
        };
        reactions[10].Reactions.Add(20);

        var graph = TriggerGraphResolver.ResolveTriggerGraph(
            trigger,
            reactions,
            new Dictionary<string, ObjectIndexEntryDto>(),
            new Dictionary<int, VariableDto>());

        Assert.Single(graph.Nodes);
        Assert.Equal("Activate", graph.Nodes[0].ReactionType);
        Assert.Single(graph.Nodes[0].Children);
        Assert.Equal(20, graph.Nodes[0].Children[0].Coid);
    }

    [Fact]
    public void ResolveTriggerGraph_missing_reaction_reports_not_found()
    {
        var trigger = new TriggerDto { Coid = 1 };
        trigger.Reactions.Add(999);

        var graph = TriggerGraphResolver.ResolveTriggerGraph(
            trigger,
            new Dictionary<long, ReactionDto>(),
            new Dictionary<string, ObjectIndexEntryDto>(),
            new Dictionary<int, VariableDto>());

        Assert.Contains("not found", graph.Nodes[0].Summary, StringComparison.OrdinalIgnoreCase);
    }
}

public class LevelExporterIntegrationTests
{
    private static readonly string GamePath = @"C:\Program Files (x86)\NetDevil\Auto Assault";
    private static readonly string FixtureMap = Path.Combine(AppContext.BaseDirectory, "Fixtures", "fort-logan-tavern.fam");
    private static readonly string ExtractedMap = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "assets", "extracted", "maps", "sec_f_b_map_interior_a1_1_fort-logan-tavern.fam"));

    [Fact]
    public void DumpMap_fort_logan_tavern_has_triggers_and_resolvable_graph()
    {
        var famPath = File.Exists(FixtureMap) ? FixtureMap : ExtractedMap;
        if (!File.Exists(famPath))
        {
            // Skip when game assets not present in CI.
            return;
        }

        if (!AssetManager.Instance.Initialize(GamePath, AutoCore.Game.Constants.ServerType.Sector))
            return;
        if (!AssetManager.Instance.LoadCloneBasesOnly())
            return;

        var level = LevelExporter.DumpMap(famPath, "sec_f_b_map_interior_a1_1_fort-logan-tavern");

        Assert.Equal(12, level.Triggers.Count);
        Assert.True(level.Reactions.Count > 0);
        Assert.DoesNotContain(level.Objects, o => o.Type == "Trigger");

        var reactionCoids = level.Reactions.Select(r => (long)r.Coid).ToHashSet();
        foreach (var trigger in level.Triggers)
        {
            Assert.NotNull(trigger.Graph);
            foreach (var coid in trigger.Reactions)
                Assert.True(reactionCoids.Contains(coid), $"Trigger {trigger.Coid} references missing reaction {coid}");
        }

        Assert.True(level.ObjectIndex.Count > level.Objects.Count);
    }
}
