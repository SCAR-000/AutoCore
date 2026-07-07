namespace AutoCore.Game.Reactions;

using AutoCore.Game.Entities;
using AutoCore.Game.Reactions.Handlers;
using AutoCore.Utils;

public static class ReactionHandlerRegistry
{
    private static readonly Dictionary<ReactionType, IReactionHandler> Handlers = BuildHandlers();

    public static bool TryExecute(ReactionHandlerContext context)
    {
        if (!Handlers.TryGetValue(context.Reaction.Template.ReactionType, out var handler))
        {
            Logger.WriteLog(LogType.Error,
                $"Unhandled reaction type: {context.Reaction.Template.ReactionType} for reaction {context.Reaction.Template.COID}!");
            return true;
        }

        return handler.Execute(context);
    }

    public static bool IsImplemented(ReactionType type) => Handlers.ContainsKey(type);

    private static Dictionary<ReactionType, IReactionHandler> BuildHandlers()
    {
        IReactionHandler[] all =
        [
            new ActivateReactionHandler(),
            new DeactivateReactionHandler(),
            new CreateReactionHandler(),
            new DeleteReactionHandler(),
            new EnableReactionHandler(),
            new DisableReactionHandler(),
            new DeathReactionHandler(),
            new VariableSetReactionHandler(),
            new VariableAddReactionHandler(),
            new VariableSubReactionHandler(),
            new VariableMulReactionHandler(),
            new VariableDivReactionHandler(),
            new VariableSetRandomReactionHandler(),
            new ResetTriggerReactionHandler(),
            new MarkRepairStationReactionHandler(),
            new GiveMissionReactionHandler(),
            new CompleteObjectiveReactionHandler(),
            new FailMissionReactionHandler(),
            new TransferMapReactionHandler(),
        ];

        return all.ToDictionary(h => h.Type);
    }
}
