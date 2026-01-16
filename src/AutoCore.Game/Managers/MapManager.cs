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

    /// <summary>
    /// Server-side helper used by GM chat commands (e.g. /warp) to transfer a character to another map.
    /// Mirrors the behavior of <see cref="HandleTransferRequestPacket"/> but returns success/failure.
    /// </summary>
    public bool TransferCharacterToMap(Character character, int continentId)
    {
        try
        {
            if (character == null || character.OwningConnection == null)
                return false;

            if (!TrySetupMap(continentId, out _))
                return false;

            var map = GetMap(continentId);
            if (map == null)
                return false;

            var mapInfoPacket = new MapInfoPacket();
            map.Fill(mapInfoPacket);

            character.OwningConnection.ResetGhosting();
            character.OwningConnection.SendGamePacket(mapInfoPacket, skipOpcode: true);

            character.SetMap(map);
            character.Position = map.MapData.EntryPoint.ToVector3();
            character.Rotation = Quaternion.Default;

            if (character.CurrentVehicle != null)
            {
                character.CurrentVehicle.SetMap(map);
                character.CurrentVehicle.Position = character.Position;
                character.CurrentVehicle.Rotation = character.Rotation;
            }

            return true;
        }
        catch (Exception ex)
        {
            Logger.WriteLog(LogType.Error, $"TransferCharacterToMap failed: {ex.Message}");
            return false;
        }
    }

    public void HandleTransferRequestPacket(Character character, BinaryReader reader)
    {
        var packet = new MapTransferRequestPacket();
        packet.Read(reader);

        if (packet.Type != MapTransferType.ContinentObject)
        {
            Logger.WriteLog(LogType.Error, $"Not implemented map transfer type: {packet.Type}!");
            return;
        }

        var map = GetMap(packet.Data);
        if (map == null)
        {
            Logger.WriteLog(LogType.Error, $"Trying to transfer to non-existant map: {packet.Data}!");
            return;
        }

        var mapInfoPacket = new MapInfoPacket();
        map.Fill(mapInfoPacket);

        character.OwningConnection.ResetGhosting();
        character.OwningConnection.SendGamePacket(mapInfoPacket, skipOpcode: true);

        character.SetMap(map);
        character.Position = map.MapData.EntryPoint.ToVector3();
        character.Rotation = Quaternion.Default;

        character.CurrentVehicle.SetMap(map);
        character.CurrentVehicle.Position = character.Position;
        character.CurrentVehicle.Rotation = character.Rotation;
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
