namespace AutoCore.Game.Managers;

using System;
using System.Collections.Generic;
using System.Linq;
using AutoCore.Game.CloneBases;
using AutoCore.Game.Entities;
using AutoCore.Game.Mission;
using AutoCore.Game.Packets.Sector;
using AutoCore.Game.Structures;
using AutoCore.Utils;
using AutoCore.Utils.Memory;

public class MissionManager : Singleton<MissionManager>
{
    private readonly Dictionary<long, Dictionary<int, PendingMission>> _pendingMissions = new();
    private readonly Dictionary<long, HashSet<int>> _activeMissions = new();

    public bool RequestMission(Character character, int missionId, TFID missionGiver, long[] possibleItems)
    {
        if (character?.OwningConnection == null)
        {
            Logger.WriteLog(LogType.Error, "MissionManager.RequestMission called without a valid character connection.");
            return false;
        }

        if (missionId <= 0)
        {
            Logger.WriteLog(LogType.Error, $"MissionManager.RequestMission received invalid missionId={missionId}.");
            return false;
        }

        var mission = AssetManager.Instance.GetMission(missionId);
        if (mission != null && mission.ReqClass > 0)
        {
            var characterClass = GetCharacterClass(character);
            var vehicleClass = GetVehicleClass(character);
            if (mission.ReqClass != characterClass && mission.ReqClass != vehicleClass)
            {
                // Logger.WriteLog(LogType.Debug,
                //     "MissionManager.RequestMission filtered mission {0} by ReqClass {1}. CharacterClass={2}, VehicleClass={3}.",
                //     missionId,
                //     mission.ReqClass,
                //     characterClass,
                //     vehicleClass);
                return false;
            }
        }
        else if (mission == null)
        {
            Logger.WriteLog(LogType.Debug, $"MissionManager.RequestMission could not find mission {missionId} in assets.");
        }

        var characterId = character.ObjectId.Coid;
        if (!_pendingMissions.TryGetValue(characterId, out var pendingForCharacter))
        {
            pendingForCharacter = new Dictionary<int, PendingMission>();
            _pendingMissions[characterId] = pendingForCharacter;
        }

        if (pendingForCharacter.ContainsKey(missionId))
            return false;

        var normalizedItems = NormalizePossibleItems(possibleItems);
        var pending = new PendingMission(missionId, missionGiver, normalizedItems);
        pendingForCharacter[missionId] = pending;

        var dialogPacket = new MissionDialogPacket
        {
            Creature = missionGiver
        };
        dialogPacket.AddMission(new MissionDialogPacket.MissionInfo
        {
            Id = missionId,
            PossibleItemCoids = normalizedItems
        });

        character.OwningConnection.SendGamePacket(dialogPacket);

        return true;
    }

    public void ClearPendingMission(Character character, int missionId)
    {
        if (character == null)
            return;

        var characterId = character.ObjectId.Coid;
        if (!_pendingMissions.TryGetValue(characterId, out var pendingForCharacter))
            return;

        pendingForCharacter.Remove(missionId);

        if (pendingForCharacter.Count == 0)
            _pendingMissions.Remove(characterId);
    }

    public IReadOnlyCollection<int> GetPendingMissionIds(Character character)
    {
        if (character == null)
            return Array.Empty<int>();

        var characterId = character.ObjectId.Coid;
        if (_pendingMissions.TryGetValue(characterId, out var pendingForCharacter))
            return pendingForCharacter.Keys.ToArray();

        return Array.Empty<int>();
    }

    public void AddActiveMission(Character character, int missionId)
    {
        if (character == null || missionId <= 0)
            return;

        var characterId = character.ObjectId.Coid;
        if (!_activeMissions.TryGetValue(characterId, out var activeForCharacter))
        {
            activeForCharacter = new HashSet<int>();
            _activeMissions[characterId] = activeForCharacter;
        }

        if (activeForCharacter.Add(missionId))
        {
            Logger.WriteLog(LogType.Debug,
                "MissionManager.AddActiveMission: character={0}, missionId={1}, activeCount={2}",
                characterId,
                missionId,
                activeForCharacter.Count);
        }
    }

    public void RemoveActiveMission(Character character, int missionId)
    {
        if (character == null)
            return;

        var characterId = character.ObjectId.Coid;
        if (!_activeMissions.TryGetValue(characterId, out var activeForCharacter))
            return;

        if (activeForCharacter.Remove(missionId))
        {
            Logger.WriteLog(LogType.Debug,
                "MissionManager.RemoveActiveMission: character={0}, missionId={1}, activeCount={2}",
                characterId,
                missionId,
                activeForCharacter.Count);
        }

        if (activeForCharacter.Count == 0)
            _activeMissions.Remove(characterId);
    }

    public IReadOnlyCollection<int> GetActiveMissionIds(Character character)
    {
        if (character == null)
            return Array.Empty<int>();

        var characterId = character.ObjectId.Coid;
        if (_activeMissions.TryGetValue(characterId, out var activeForCharacter))
            return activeForCharacter.ToArray();

        return Array.Empty<int>();
    }

    private static long[] NormalizePossibleItems(long[] possibleItems)
    {
        var normalized = new long[4];
        if (possibleItems == null)
            return normalized;

        for (var i = 0; i < normalized.Length && i < possibleItems.Length; ++i)
            normalized[i] = possibleItems[i];

        return normalized;
    }

    private static int GetCharacterClass(Character character)
    {
        var characterCloneBase = AssetManager.Instance.GetCloneBase<CloneBaseCharacter>(character.CBID);
        return characterCloneBase?.CharacterSpecific.Class ?? 0;
    }

    private static int GetVehicleClass(Character character)
    {
        if (character.CurrentVehicle == null)
            return 0;

        var vehicleCloneBase = AssetManager.Instance.GetCloneBase<CloneBaseVehicle>(character.CurrentVehicle.CBID);
        return vehicleCloneBase?.VehicleSpecific.ClassType ?? 0;
    }

    private sealed record PendingMission(int MissionId, TFID MissionGiver, long[] PossibleItemCoids);
}

