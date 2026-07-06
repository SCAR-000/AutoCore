namespace AutoCore.MapDump;

public static class ReactionDescriber
{
    public static ReactionDescriptionDto Describe(ReactionDto reaction, IReadOnlyDictionary<string, ObjectIndexEntryDto> index, IReadOnlyDictionary<int, VariableDto> variables)
    {
        var result = new ReactionDescriptionDto();
        var type = reaction.ReactionType;

        switch (type)
        {
            case "Activate":
            case "Deactivate":
            case "Create":
            case "Delete":
            case "Enable":
            case "Disable":
            case "Death":
                result.Summary = $"{type} {FormatTargetList(reaction.Objects, index)}";
                result.TargetCoids.AddRange(reaction.Objects);
                break;

            case "TransferMap":
                result.Summary = $"Transfer map ({reaction.MapTransfer ?? "Unknown"}) data={reaction.MapTransferData}";
                result.Details.Add($"MapTransferData: {reaction.MapTransferData}");
                break;

            case "Text":
            case "ClientText":
            case "OpenDialog":
                result.Summary = FormatTextReaction(reaction);
                if (reaction.Text != null)
                {
                    foreach (var choice in reaction.Text.Choices)
                    {
                        if (choice.TriggerCoid > 0)
                            result.NestedReactionCoids.Add(choice.TriggerCoid);
                    }
                }
                break;

            case "VariableSet":
            case "VariableAdd":
            case "VariableSub":
            case "VariableMul":
            case "VariableDiv":
            case "VariableSetRandom":
                result.Summary = $"{type} {FormatVariable(reaction.GenericVar1, variables)} = {FormatVariableOperand(reaction, variables)}";
                result.Details.Add($"GenericVar1 (var id): {reaction.GenericVar1}");
                result.Details.Add($"GenericVar2: {reaction.GenericVar2}");
                result.Details.Add($"GenericVar3: {reaction.GenericVar3}");
                break;

            case "SkillCast":
                result.Summary = $"Cast skill {reaction.GenericVar1}";
                break;

            case "GiveMission":
            case "CompleteObjective":
            case "FailMission":
            case "GiveMissionDialog":
                result.Summary = $"{type} mission={reaction.GenericVar1} objective={reaction.ObjectiveIDCheck}";
                if (reaction.Missions.Count > 0)
                    result.Details.Add($"Missions: {string.Join(", ", reaction.Missions)}");
                break;

            case "GiveItemNumCBID":
            case "GiveItemNumCBIDGen":
                result.Summary = $"{type} cbid={reaction.GenericVar1} count={reaction.GenericVar3}";
                break;

            case "AdjustCredits":
            case "AddSkillPoints":
            case "AddXP":
            case "AddPoints":
                result.Summary = $"{type} amount={reaction.GenericVar1}";
                break;

            case "SetPath":
            case "SetPatrolDistance":
            case "Path":
                result.Summary = $"{type} path/ref={reaction.GenericVar1}";
                if (!string.IsNullOrEmpty(reaction.MiscText))
                    result.Details.Add($"MiscText: {reaction.MiscText}");
                break;

            case "Teleport":
            case "SpawnCollide":
                result.Summary = $"{type} {FormatTargetList(reaction.Objects, index)}";
                result.TargetCoids.AddRange(reaction.Objects);
                break;

            case "TimerStart":
            case "TimerStop":
            case "TimerPause":
            case "PlayMusic":
                result.Summary = $"{type} \"{reaction.MiscText ?? reaction.Name}\"";
                break;

            case "OpenStore":
            case "OpenBodyShop":
            case "OpenRefinery":
            case "OpenGarage":
            case "OpenArena":
            case "OpenClanManager":
            case "OpenSkillTrainer":
            case "OpenMailBox":
            case "OpenAuctionHouse":
                result.Summary = type;
                break;

            case "ResetTrigger":
                result.Summary = $"Reset trigger COID {reaction.GenericVar1}";
                result.TargetCoids.Add(reaction.GenericVar1);
                break;

            case "SetFaction":
            case "ResetFaction":
            case "SetTeamFaction":
            case "ResetTeamFaction":
                result.Summary = $"{type} faction={reaction.GenericVar1}";
                break;

            case "SetHP":
            case "SetLevel":
                result.Summary = $"{type} value={reaction.GenericVar1}";
                result.TargetCoids.AddRange(reaction.Objects);
                break;

            case "AddWaypoint":
            case "DelWaypoint":
            case "SetStatusText":
            case "SetProgressBar":
                result.Summary = $"{type} ({reaction.WaypointType}) \"{reaction.WaypointText}\"";
                break;

            case "SetMapWaypoint":
            case "SetMapDynamicWaypoint":
            case "RemoveMapWaypoint":
            case "RemoveMapDynamicWaypoint":
                result.Summary = type;
                break;

            default:
                result.Summary = type;
                if (reaction.Objects.Count > 0)
                {
                    result.Details.Add($"Targets: {FormatTargetList(reaction.Objects, index)}");
                    result.TargetCoids.AddRange(reaction.Objects);
                }
                if (reaction.GenericVar1 != 0 || reaction.GenericVar2 != 0 || reaction.GenericVar3 != 0)
                    result.Details.Add($"Vars: {reaction.GenericVar1}, {reaction.GenericVar2}, {reaction.GenericVar3}");
                break;
        }

        if (reaction.ActOnActivator)
            result.Details.Add("Acts on activator");
        if (reaction.DoForAllPlayers)
            result.Details.Add("For all players");
        if (reaction.DoForConvoy)
            result.Details.Add("For convoy");

        result.NestedReactionCoids.AddRange(reaction.Reactions);
        return result;
    }

    private static string FormatTextReaction(ReactionDto reaction)
    {
        if (reaction.Text == null)
            return $"{reaction.ReactionType} (no text payload)";

        var main = Truncate(reaction.Text.Main, 120);
        var choices = reaction.Text.Choices.Count;
        return $"{reaction.ReactionType} [{reaction.Text.Type}]: \"{main}\"" + (choices > 0 ? $" (+{choices} choices)" : "");
    }

    private static string FormatTargetList(IEnumerable<long> coids, IReadOnlyDictionary<string, ObjectIndexEntryDto> index)
    {
        var parts = coids.Select(c => FormatCoid(c, index)).ToList();
        return parts.Count == 0 ? "(no targets)" : string.Join(", ", parts);
    }

    private static string FormatCoid(long coid, IReadOnlyDictionary<string, ObjectIndexEntryDto> index)
    {
        if (index.TryGetValue(coid.ToString(), out var entry))
            return $"{entry.Label ?? entry.Kind} (#{coid})";
        return $"#{coid}";
    }

    private static string FormatVariable(int id, IReadOnlyDictionary<int, VariableDto> variables)
    {
        if (variables.TryGetValue(id, out var v) && !string.IsNullOrWhiteSpace(v.Name))
            return v.Name!;
        return $"var:{id}";
    }

    private static string FormatVariableOperand(ReactionDto reaction, IReadOnlyDictionary<int, VariableDto> variables)
    {
        if (reaction.GenericVar3 != 0)
            return reaction.GenericVar3.ToString();
        if (Math.Abs(reaction.GenericVar2) > 0.0001f)
            return reaction.GenericVar2.ToString("G");
        return FormatVariable(reaction.GenericVar2 == 0 ? reaction.GenericVar3 : (int)reaction.GenericVar2, variables);
    }

    private static string Truncate(string? s, int max)
    {
        if (string.IsNullOrEmpty(s))
            return "";
        s = s.Replace('\n', ' ').Replace('\r', ' ');
        return s.Length <= max ? s : s[..(max - 1)] + "…";
    }
}
