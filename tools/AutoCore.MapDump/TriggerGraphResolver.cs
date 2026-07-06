namespace AutoCore.MapDump;

public static class TriggerGraphResolver
{
    public const int DefaultMaxDepth = 32;

    public static ResolvedGraphDto ResolveTriggerGraph(
        TriggerDto trigger,
        IReadOnlyDictionary<long, ReactionDto> reactionsByCoid,
        IReadOnlyDictionary<string, ObjectIndexEntryDto> index,
        IReadOnlyDictionary<int, VariableDto> variables,
        int maxDepth = DefaultMaxDepth)
    {
        var graph = new ResolvedGraphDto();
        var visited = new HashSet<long>();

        foreach (var reactionCoid in trigger.Reactions)
        {
            var node = ResolveReactionNode(reactionCoid, reactionsByCoid, index, variables, visited, maxDepth, 0);
            if (node != null)
                graph.Nodes.Add(node);
        }

        return graph;
    }

    private static ResolvedGraphNodeDto? ResolveReactionNode(
        long coid,
        IReadOnlyDictionary<long, ReactionDto> reactionsByCoid,
        IReadOnlyDictionary<string, ObjectIndexEntryDto> index,
        IReadOnlyDictionary<int, VariableDto> variables,
        HashSet<long> visited,
        int maxDepth,
        int depth)
    {
        if (!reactionsByCoid.TryGetValue(coid, out var reaction))
        {
            return new ResolvedGraphNodeDto
            {
                Coid = coid,
                ReactionType = "Missing",
                Summary = $"Reaction #{coid} not found on map"
            };
        }

        var desc = ReactionDescriber.Describe(reaction, index, variables);
        var node = new ResolvedGraphNodeDto
        {
            Coid = coid,
            ReactionType = reaction.ReactionType,
            Summary = desc.Summary
        };
        node.Details.AddRange(desc.Details);
        node.TargetCoids.AddRange(desc.TargetCoids);

        if (visited.Contains(coid))
        {
            node.IsCycle = true;
            node.Summary += " (cycle)";
            return node;
        }

        if (depth >= maxDepth)
        {
            node.Summary += " (max depth)";
            return node;
        }

        visited.Add(coid);

        foreach (var nested in desc.NestedReactionCoids.Distinct())
        {
            if (nested <= 0)
                continue;

            var child = ResolveReactionNode(nested, reactionsByCoid, index, variables, visited, maxDepth, depth + 1);
            if (child != null)
                node.Children.Add(child);
        }

        visited.Remove(coid);
        return node;
    }
}
