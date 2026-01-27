namespace AutoCore.Game.Managers;

using AutoCore.Game.Entities;
using AutoCore.Game.Map;
using AutoCore.Game.Packets.Sector;
using AutoCore.Game.Structures;
using AutoCore.Utils;
using AutoCore.Utils.Memory;

public class MapManager : Singleton<MapManager>
{
    private Dictionary<int, SectorMap> SectorMaps { get; } = new();

    public bool Initialize()
    {
        foreach (var continentObject in AssetManager.Instance.GetContinentObjects()) // TODO: only load IsPersistent maps (the others are instanceable?)
        {
            // TODO: preload only persistent maps?
            SetupMap(continentObject.Id);
        }

        return true;
    }

    private void SetupMap(int continentId)
    {
        if (SectorMaps.ContainsKey(continentId))
            throw new Exception($"Map {continentId} is already setup!");

        SectorMaps[continentId] = new SectorMap(continentId);
    }

    public SectorMap GetMap(int continentId)
    {
        if (SectorMaps.TryGetValue(continentId, out var sectorMap))
            return sectorMap;

        throw new Exception($"Unknown map ({continentId}) requested!");
    }

    public void HandleTransferMapRequest(Character character, int mapId) 
    {
        var map = GetMap(mapId);
        if (map == null)
        {
            Logger.WriteLog(LogType.Error, $"Failed to get map: {mapId}!");
            return;
        }

        var mapInfoPacket = new MapInfoPacket();
        map.Fill(mapInfoPacket);

        character.OwningConnection.ResetGhosting();
        character.OwningConnection.SendGamePacket(mapInfoPacket, skipOpcode: true);

        if (map.MapData.ContinentObject.IsTown)
        {
            character.SetMap(map);
            character.Position = map.MapData.EntryPoint.ToVector3();
            character.Rotation = Quaternion.Default;
        }
        else
        {
            character.CurrentVehicle.SetMap(map);
            character.CurrentVehicle.Position = map.MapData.EntryPoint.ToVector3();
            character.CurrentVehicle.Rotation = Quaternion.Default;
        }
    }

    public void HandleTransferRequestPacket(Character character, BinaryReader reader)
    {
        var packet = new MapTransferRequestPacket();
        packet.Read(reader);

        if (packet.Type != MapTransferType.ContinentObject && packet.Type != MapTransferType.Warp)
        {
            Logger.WriteLog(LogType.Error, $"Not implemented map transfer type: {packet.Type}!");
            return;
        }

        HandleTransferMapRequest(character, packet.Data);
    }

    public void HandleChangeCombatModeRequest(Character character, BinaryReader reader)
    {
        var packet = new ChangeCombatModeRequestPacket();
        packet.Read(reader);

        // TODO: Update the Character

        // Always send true as success, false isn't implemented correctly and the client doesn't update, keeping the previous values, but updates the UI
        var response = new ChangeCombatModeResponsePacket
        {
            CharacterCoid = packet.CharacterCoid,
            Mode = packet.Mode,
            Success = true
        };

        character.OwningConnection.SendGamePacket(response);
    }
}
