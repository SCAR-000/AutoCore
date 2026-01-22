namespace AutoCore.Game.Entities;

using System.Collections.Generic;
using AutoCore.Game.Constants;
using AutoCore.Game.EntityTemplates;
using AutoCore.Game.Managers;
using AutoCore.Game.Packets.Sector;
using AutoCore.Game.Structures;
using AutoCore.Utils;

public enum ReactionType : byte
{
    Activate = 0,
    Deactivate = 1,
    Create = 2,
    Delete = 3,
    MakeFriend = 4,
    MakeEnemy = 5,
    MakeInvincible = 6,
    MakeNotInvincbile = 7,
    Death = 8,
    TakeArena = 9,
    TransferMap = 10,
    ClientText = 11,
    SkillCast = 12,
    VariableSet = 13,
    VariableAdd = 14,
    VariableSub = 15,
    Enable = 16,
    Disable = 17,
    Text = 18,
    ResetTrigger = 19,
    SetFaction = 20,
    ResetFaction = 21,
    SetFactionFromVar = 22,
    SetHP = 23,
    Boost = 24,
    RemoveFromInv = 25,
    AdjustCredits = 26,
    AddSkillPoints = 27,
    AddXP = 28,
    MarkRepairStation = 29,
    GiveMission = 30,
    CompleteObjective = 31,
    UnlockContObj = 32,
    AddMissionString = 33,
    DelMissionString = 34,
    AddWaypoint = 35,
    DelWaypoint = 36,
    GiveMissionDialog = 37,
    GiveItemNumCBID = 38,
    GiveItemNumCBIDGen = 39,
    OpenBodyShop = 40,
    OpenRefinery = 41,
    OpenGarage = 42,
    SetPath = 43,
    SetPatrolDistance = 44,
    Teleport = 45,
    TimerStart = 46,
    TimerStop = 47,
    VariableSetRandom = 48,
    VariableMul = 49,
    VariableDiv = 50,
    GiveMedal = 51,
    OpenStore = 52,
    SetTeamFaction = 53,
    ResetTeamFaction = 54,
    SetTeamFactionFromVar = 55,
    AddPoints = 56,
    ResetPoints = 57,
    OpenArena = 58,
    OpenClanManager = 59,
    SetActiveObjective = 60,
    ProgressBar = 61,
    SetMapWaypoint = 62,
    SetMapDynamicWaypoint = 63,
    SetStatusText = 64,
    SetProgressBar = 65,
    RemoveProgressBar = 66,
    RemoveText = 67,
    RemoveMapWaypoint = 68,
    RemoveMapDynamicWaypoint = 69,
    RelockContObj = 70,
    OpenSkillTrainer = 71,
    FailMission = 72,
    SpawnCollide = 73,
    FirstTimeEvent = 74,
    OpenDialog = 75,
    PlayMusic = 76,
    Path = 77,
    CaptureOutpost = 78,
    SetLevel = 79,
    GiveRespec = 80,
    RollFromLootTable = 81,
    TimerPause = 82,
    TaxiStops = 83,
    RaceWaypointReached = 84,
    StartRaceTimer = 85,
    OpenMailBox = 86,
    OpenAuctionHouse = 87
}

public enum ReactionWaypointType
{
    Kill = 0,
    Protect = 1,
    Interact = 2
}

public enum ReactionTextType
{
    ChoiceDialog = 0,
    OKDialog = 1,
    ScreenTop = 2,
    ChatQueue = 3
}

public enum ReactionTextParamType
{
    Variable = 0,
    PlayerName = 1,
    PlayerClass = 2,
    PlayerRace = 3,
    FactionName = 4,
    ObjectName = 5,
    ObjectClass = 6
}

public enum ReactionTextTargetType
{
    Client = 0,
    Convoy = 1,
    Global = 2
}

public class Reaction : ClonedObjectBase
{
    public ReactionTemplate Template { get; }

    public Reaction(ReactionTemplate template)
    {
        Template = template;
    }

    public bool CanTrigger(ClonedObjectBase activator)
    {
        if (activator is null || activator.Map is null)
            return false;

        if (Template.Conditions.Count > 0)
        {
            foreach (var condition in Template.Conditions)
            {
                var conditionSatisfied = condition.Check(activator);
                if (conditionSatisfied && !Template.AllConditionsNeeded)
                    break;

                if (!conditionSatisfied && Template.AllConditionsNeeded)
                    return false;
            }
        }

        return true;
    }

    public bool TriggerIfPossible(ClonedObjectBase activator)
    {
        if (!CanTrigger(activator))
            return false;

        switch (Template.ReactionType)
        {
            case ReactionType.GiveMission:
                return HandleGiveMission(activator);

            //case ReactionType.TransferMap:
            //    return false;

            default:
                Logger.WriteLog(LogType.Error, $"Unhandled reaction type: {Template.ReactionType} for reaction {Template.COID}!");
                return true;
        }
    }

    public override int GetCurrentHP() => 1; 
    public override int GetMaximumHP() => 1;
    public override int GetBareTeamFaction() => Faction;

    private bool HandleGiveMission(ClonedObjectBase activator)
    {
        var character = activator.GetAsCharacter() ?? activator.GetSuperCharacter(false);
        if (character?.OwningConnection == null)
        {
            Logger.WriteLog(LogType.Error, "GiveMission reaction triggered without a valid character connection.");
            return false;
        }

        // Resolve mission ID from multiple possible sources
        var missionId = 0;
        if (Template.Missions.Count > 0 && Template.Missions[0] > 0)
        {
            missionId = Template.Missions[0];
            Logger.WriteLog(LogType.Debug, $"GiveMission: Mission ID {missionId} resolved from Template.Missions[0]");
        }
        else if (Template.GenericVar1 > 0) // From testing, GenericVar1 is likely the mission ID
        {
            missionId = Template.GenericVar1;
            Logger.WriteLog(LogType.Debug, $"GiveMission: Mission ID {missionId} resolved from Template.GenericVar1");
        }
        else if (Template.GenericVar3 > 0)
        {
            missionId = Template.GenericVar3;
            Logger.WriteLog(LogType.Debug, $"GiveMission: Mission ID {missionId} resolved from Template.GenericVar3");
        }
        else if (Template.ObjectiveIDCheck > 0)
        {
            missionId = Template.ObjectiveIDCheck;
            Logger.WriteLog(LogType.Debug, $"GiveMission: Mission ID {missionId} resolved from Template.ObjectiveIDCheck");
        }

        if (missionId <= 0)
        {
            Logger.WriteLog(LogType.Error, $"GiveMission reaction {Template.COID} has no valid mission ID.");
            return false;
        }

        var missionGiver = ResolveMissionGiver(activator, out _);
        var possibleItems = new long[4];
        for (var i = 0; i < possibleItems.Length && i < Template.Objects.Count; ++i)
            possibleItems[i] = Template.Objects[i];

        Logger.WriteLog(LogType.Debug, $"GiveMission: Requesting mission ID {missionId} for character {character.ObjectId.Coid}.");
        var requested = MissionManager.Instance.RequestMission(character, missionId, missionGiver.ObjectId, possibleItems);

        return requested;
    }

    private ClonedObjectBase ResolveMissionGiver(ClonedObjectBase activator, out string source)
    {
        source = "activator";

        if (Template.Objects.Count > 0 && activator.Map != null)
        {
            for (var i = 0; i < Template.Objects.Count; ++i)
            {
                var candidate = activator.Map.GetLocalObject(Template.Objects[i]);
                if (candidate == null)
                    continue;

                if (candidate.GetAsCreature() != null || candidate.GetAsCharacter() != null)
                {
                    source = $"objects[{i}]";
                    return candidate;
                }
            }
        }

        return activator;
    }

    private void SendSystemMessage(TNL.TNLConnection connection, string message)
    {
        if (connection == null)
            return;

        var packet = new BroadcastPacket
        {
            ChatType = ChatType.SystemMessage,
            SenderCoid = 0,
            IsGM = false,
            Sender = "System",
            Message = message,
            MessageLength = (short)message.Length
        };

        connection.SendGamePacket(packet);
    }
}
