using AutoCore.Game.Structures;

namespace AutoCore.Game.Reactions;

using AutoCore.Game.Entities;
using AutoCore.Game.Map;

public sealed class ReactionHandlerContext
{
    public required SectorMap Map { get; init; }
    public required Reaction Reaction { get; init; }
    public required ClonedObjectBase Activator { get; init; }
    public MapVariableRuntime Variables => Map.Variables;

    public IEnumerable<ClonedObjectBase> ResolveTargetObjects()
    {
        foreach (var coid in Reaction.Template.Objects)
        {
            var tfid = new TFID(coid, false);
            var obj = Map.GetObject(tfid);
            if (obj != null)
                yield return obj;
        }
    }

    public ClonedObjectBase? ResolveActivatorTarget()
    {
        if (!Reaction.Template.ActOnActivator)
            return null;

        return Activator;
    }

    public IEnumerable<ClonedObjectBase> ResolveAllTargets()
    {
        var activatorTarget = ResolveActivatorTarget();
        if (activatorTarget != null)
            yield return activatorTarget;

        foreach (var obj in ResolveTargetObjects())
            yield return obj;
    }
}
