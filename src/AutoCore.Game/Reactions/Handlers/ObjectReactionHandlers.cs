namespace AutoCore.Game.Reactions.Handlers;

using AutoCore.Game.Entities;
using AutoCore.Game.Map;
using AutoCore.Utils;

internal abstract class ObjectTargetsReactionHandler : IReactionHandler
{
    public abstract ReactionType Type { get; }

    protected abstract void ApplyToTarget(ReactionHandlerContext context, ClonedObjectBase target);

    public bool Execute(ReactionHandlerContext context)
    {
        var any = false;
        foreach (var target in context.ResolveAllTargets())
        {
            ApplyToTarget(context, target);
            any = true;
        }

        if (!any && context.Reaction.Template.Objects.Count == 0 && !context.Reaction.Template.ActOnActivator)
            Logger.WriteLog(LogType.Debug, $"{Type} reaction {context.Reaction.Template.COID} had no resolvable targets.");

        FireNested(context);
        return true;
    }

    protected static void FireNested(ReactionHandlerContext context)
    {
        if (context.Reaction.Template.Reactions.Count == 0)
            return;

        context.Map.TriggerReactions(context.Activator, context.Reaction.Template.Reactions);
    }
}

internal sealed class ActivateReactionHandler : ObjectTargetsReactionHandler
{
    public override ReactionType Type => ReactionType.Activate;

    protected override void ApplyToTarget(ReactionHandlerContext context, ClonedObjectBase target) =>
        target.SetLogicActive(true);
}

internal sealed class DeactivateReactionHandler : ObjectTargetsReactionHandler
{
    public override ReactionType Type => ReactionType.Deactivate;

    protected override void ApplyToTarget(ReactionHandlerContext context, ClonedObjectBase target) =>
        target.SetLogicActive(false);
}

internal sealed class EnableReactionHandler : ObjectTargetsReactionHandler
{
    public override ReactionType Type => ReactionType.Enable;

    protected override void ApplyToTarget(ReactionHandlerContext context, ClonedObjectBase target) =>
        target.SetEnabled(true);
}

internal sealed class DisableReactionHandler : ObjectTargetsReactionHandler
{
    public override ReactionType Type => ReactionType.Disable;

    protected override void ApplyToTarget(ReactionHandlerContext context, ClonedObjectBase target) =>
        target.SetEnabled(false);
}

internal sealed class CreateReactionHandler : IReactionHandler
{
    public ReactionType Type => ReactionType.Create;

    public bool Execute(ReactionHandlerContext context)
    {
        Logger.WriteLog(LogType.Debug, $"Create reaction {context.Reaction.Template.COID}: spawn not yet implemented for {context.Reaction.Template.Objects.Count} targets.");
        if (context.Reaction.Template.Reactions.Count > 0)
            context.Map.TriggerReactions(context.Activator, context.Reaction.Template.Reactions);
        return true;
    }
}

internal sealed class DeleteReactionHandler : ObjectTargetsReactionHandler
{
    public override ReactionType Type => ReactionType.Delete;

    protected override void ApplyToTarget(ReactionHandlerContext context, ClonedObjectBase target) =>
        context.Map.LeaveMap(target);
}

internal sealed class DeathReactionHandler : ObjectTargetsReactionHandler
{
    public override ReactionType Type => ReactionType.Death;

    protected override void ApplyToTarget(ReactionHandlerContext context, ClonedObjectBase target)
    {
        target.MarkDead();
        context.Map.LeaveMap(target);
    }
}

internal sealed class ResetTriggerReactionHandler : IReactionHandler
{
    public ReactionType Type => ReactionType.ResetTrigger;

    public bool Execute(ReactionHandlerContext context)
    {
        var coid = context.Reaction.Template.GenericVar1;
        var tfid = new Structures.TFID(coid, false);
        if (context.Map.Triggers.TryGetValue(tfid, out var trigger))
            trigger.ResetActivationState();

        return true;
    }
}

internal sealed class MarkRepairStationReactionHandler : IReactionHandler
{
    public ReactionType Type => ReactionType.MarkRepairStation;

    public bool Execute(ReactionHandlerContext context)
    {
        var stationId = context.Reaction.Template.GenericVar1;
        context.Map.SetPlayerRepairStation(context.Activator.ObjectId.Coid, stationId);
        return true;
    }
}

internal sealed class GiveMissionReactionHandler : IReactionHandler
{
    public ReactionType Type => ReactionType.GiveMission;

    public bool Execute(ReactionHandlerContext context)
    {
        Logger.WriteLog(LogType.Debug, $"GiveMission {context.Reaction.Template.GenericVar1} to {context.Activator.ObjectId.Coid} (mission grant pending full port).");
        return true;
    }
}

internal sealed class CompleteObjectiveReactionHandler : IReactionHandler
{
    public ReactionType Type => ReactionType.CompleteObjective;

    public bool Execute(ReactionHandlerContext context)
    {
        Logger.WriteLog(LogType.Debug, $"CompleteObjective mission={context.Reaction.Template.GenericVar1} objectiveGate={context.Reaction.Template.ObjectiveIDCheck}.");
        return true;
    }
}

internal sealed class FailMissionReactionHandler : IReactionHandler
{
    public ReactionType Type => ReactionType.FailMission;

    public bool Execute(ReactionHandlerContext context)
    {
        Logger.WriteLog(LogType.Debug, $"FailMission {context.Reaction.Template.GenericVar1} for {context.Activator.ObjectId.Coid}.");
        return true;
    }
}

internal sealed class TransferMapReactionHandler : IReactionHandler
{
    public ReactionType Type => ReactionType.TransferMap;

    public bool Execute(ReactionHandlerContext context)
    {
        var template = context.Reaction.Template;
        Logger.WriteLog(LogType.Debug,
            $"TransferMap type={template.MapTransfer} data={template.MapTransferData} for {context.Activator.ObjectId.Coid} (warp pending full port).");
        return true;
    }
}
