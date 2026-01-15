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

    private bool TrySetupMap(int continentId, out string error)
    {
        error = null;

        if (SectorMaps.ContainsKey(continentId))
            return true;

        var continentObject = AssetManager.Instance.GetContinentObject(continentId);
        if (continentObject == null)
        {
            var wadContinent = AssetManager.Instance.GetContinentObjectFromWad(continentId);
            if (wadContinent != null)
            {
                var mapFileName = $"{wadContinent.MapFileName}.fam";
                error = $"Map '{wadContinent.DisplayName}' (continent {continentId}) cannot be loaded - map file '{mapFileName}' not found in GLM archives";
            }
            else
            {
                error = $"Continent object {continentId} not found in database";
            }
            return false;
        }

        var famFileName = $"{continentObject.MapFileName}.fam";
        if (!AssetManager.Instance.HasFileInGLMs(famFileName))
        {
            error = $"Map file '{famFileName}' not found in GLM archives for continent {continentId} ({continentObject.DisplayName})";
            return false;
        }

        SectorMaps[continentId] = new SectorMap(continentId);
        Logger.WriteLog(LogType.Initialize, $"MapManager: Dynamically loaded map {continentId} ({continentObject.DisplayName})");
        return true;
    }

    public SectorMap GetMap(int continentId)
    {
        if (SectorMaps.TryGetValue(continentId, out var sectorMap))
            return sectorMap;

        if (TrySetupMap(continentId, out var error))
            return SectorMaps[continentId];

        throw new Exception($"Unknown map ({continentId}) requested!");
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
