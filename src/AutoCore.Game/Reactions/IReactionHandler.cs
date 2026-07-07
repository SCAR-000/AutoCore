namespace AutoCore.Game.Reactions;

using AutoCore.Game.Entities;

public interface IReactionHandler
{
    ReactionType Type { get; }

    /// <returns>true when the reaction should notify clients via LogicStateChangePacket.</returns>
    bool Execute(ReactionHandlerContext context);
}
