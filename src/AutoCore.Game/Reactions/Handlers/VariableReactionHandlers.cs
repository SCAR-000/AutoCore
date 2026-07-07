namespace AutoCore.Game.Reactions.Handlers;

using AutoCore.Game.Entities;

internal static class VariableReactionMath
{
    public static float ResolveOperand(ReactionHandlerContext context, int genericVar3, float genericVar2)
    {
        if (genericVar3 != 0)
            return genericVar3;

        if (Math.Abs(genericVar2) > 0.0001f)
        {
            var asInt = (int)genericVar2;
            if (asInt != 0)
                return context.Variables.Get(asInt);

            return genericVar2;
        }

        return 0f;
    }
}

internal sealed class VariableSetReactionHandler : IReactionHandler
{
    public ReactionType Type => ReactionType.VariableSet;

    public bool Execute(ReactionHandlerContext context)
    {
        var template = context.Reaction.Template;
        var value = VariableReactionMath.ResolveOperand(context, template.GenericVar3, template.GenericVar2);
        context.Variables.Set(template.GenericVar1, value);
        return true;
    }
}

internal sealed class VariableAddReactionHandler : IReactionHandler
{
    public ReactionType Type => ReactionType.VariableAdd;

    public bool Execute(ReactionHandlerContext context)
    {
        var template = context.Reaction.Template;
        var addend = context.Variables.Get(template.GenericVar3);
        context.Variables.Add(template.GenericVar1, addend);
        return true;
    }
}

internal sealed class VariableSubReactionHandler : IReactionHandler
{
    public ReactionType Type => ReactionType.VariableSub;

    public bool Execute(ReactionHandlerContext context)
    {
        var template = context.Reaction.Template;
        var subtrahend = context.Variables.Get(template.GenericVar3);
        context.Variables.Subtract(template.GenericVar1, subtrahend);
        return true;
    }
}

internal sealed class VariableMulReactionHandler : IReactionHandler
{
    public ReactionType Type => ReactionType.VariableMul;

    public bool Execute(ReactionHandlerContext context)
    {
        var template = context.Reaction.Template;
        var factor = context.Variables.Get(template.GenericVar3);
        context.Variables.Multiply(template.GenericVar1, factor);
        return true;
    }
}

internal sealed class VariableDivReactionHandler : IReactionHandler
{
    public ReactionType Type => ReactionType.VariableDiv;

    public bool Execute(ReactionHandlerContext context)
    {
        var template = context.Reaction.Template;
        var divisor = context.Variables.Get(template.GenericVar3);
        context.Variables.Divide(template.GenericVar1, divisor);
        return true;
    }
}

internal sealed class VariableSetRandomReactionHandler : IReactionHandler
{
    public ReactionType Type => ReactionType.VariableSetRandom;

    public bool Execute(ReactionHandlerContext context)
    {
        var template = context.Reaction.Template;
        var range = Math.Abs(template.GenericVar2);
        if (range < 0.0001f)
            range = Math.Abs(template.GenericVar3);

        var value = (float)Random.Shared.NextDouble() * range;
        context.Variables.Set(template.GenericVar1, value);
        return true;
    }
}
