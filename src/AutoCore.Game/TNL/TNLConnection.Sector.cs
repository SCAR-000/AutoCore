namespace AutoCore.Game.TNL;

using AutoCore.Database.Char;
using AutoCore.Game.Managers;
using AutoCore.Game.Packets.Sector;
using AutoCore.Utils;

public partial class TNLConnection
{
    private void HandleTransferFromGlobalPacket(BinaryReader reader)
    {
        var packet = new TransferFromGlobalPacket();
        packet.Read(reader);

        // TODO: validate security key with info received from communicator or DB value or something...
        using var context = new CharContext();

        CurrentCharacter = ObjectManager.Instance.GetOrLoadCharacter(packet.CharacterCoid, context);
        if (CurrentCharacter == null)
        {
            Disconnect("Invalid character");

            return;
        }

        if (!LoginManager.Instance.LoginToSector(this, CurrentCharacter.AccountId))
        {
            Disconnect("Invalid Username or password!");

            return;
        }

        var mapInfoPacket = new MapInfoPacket();

        var map = MapManager.Instance.GetMap(CurrentCharacter.LastTownId);

        CurrentCharacter.SetOwningConnection(this);
        CurrentCharacter.GMLevel = Account.Level;
        CurrentCharacter.SetMap(map);
        CurrentCharacter.CurrentVehicle.SetMap(map);

        map.Fill(mapInfoPacket);

        SendGamePacket(mapInfoPacket, skipOpcode: true);
    }

    private void HandleTransferFromGlobalStage2Packet(BinaryReader reader)
    {
        var packet = new TransferFromGlobalPacket();
        packet.Read(reader);

        var character = ObjectManager.Instance.GetCharacter(packet.CharacterCoid);
        if (character == null)
        {
            Disconnect("Invalid character");

            return;
        }

        SendGamePacket(new TransferFromGlobalStage3Packet
        {
            SecurityKey = packet.SecurityKey,
            CharacterCoid = packet.CharacterCoid,
            PositionX = character.Position.X,
            PositionY = character.Position.Y,
            PositionZ = character.Position.Z
        });
    }

    private void HandleTransferFromGlobalStage3Packet(BinaryReader reader)
    {
        var packet = new TransferFromGlobalStage3Packet();
        packet.Read(reader);

        var character = ObjectManager.Instance.GetCharacter(packet.CharacterCoid);
        if (character == null)
        {
            Disconnect("Invalid character");

            return;
        }

        if (!Ghosting)
            ActivateGhosting();

        character.CreateGhost();
        character.CurrentVehicle.CreateGhost();

        SetScopeObject(character.Ghost);

        ObjectLocalScopeAlways(character.Ghost);
        ObjectLocalScopeAlways(character.CurrentVehicle.Ghost);

        var charPacket = new CreateCharacterExtendedPacket();
        var vehiclePacket = new CreateVehicleExtendedPacket();

        character.WriteToPacket(charPacket);
        character.CurrentVehicle.WriteToPacket(vehiclePacket);

        SendGamePacket(vehiclePacket);
        SendGamePacket(charPacket);

        var cargoPacket = new InventoryCargoSendAllPacket();
        character.FillCargoInventoryPacket(cargoPacket);
        SendGamePacket(cargoPacket);
    }

    private void HandleCreatureMovedPacket(BinaryReader reader)
    {
        var packet = new CreatureMovedPacket();
        packet.Read(reader);

        CurrentCharacter.HandleMovement(packet);
    }

    private void HandleVehicleMovedPacket(BinaryReader reader)
    {
        var packet = new VehicleMovedPacket();
        packet.Read(reader);

        CurrentCharacter.CurrentVehicle.HandleMovement(packet);
    }

    private void HandleItemPickupPacket(BinaryReader reader)
    {
        var packet = new ItemPickupPacket();
        packet.Read(reader);

        Logger.WriteLog(LogType.Debug, "ItemPickup requested for coid {0} (global={1})", packet.ItemId.Coid, packet.ItemId.Global);

        // Resolve the coid to an object: first items spawned via /loot, then any object on the map.
        var map = CurrentCharacter.Map;
        var item = map?.TakeWorldItem(packet.ItemId.Coid)
                   ?? map?.GetObject(packet.ItemId);
        if (item == null)
        {
            Logger.WriteLog(LogType.Network, "ItemPickup: no object found with coid {0}; ignoring.", packet.ItemId.Coid);
            return;
        }

        if (!AssetManager.Instance.IsInventoryItem(item.CBID))
        {
            Logger.WriteLog(LogType.Network, "ItemPickup: coid {0} (CBID {1}) is not an inventory item; ignoring.", packet.ItemId.Coid, item.CBID);
            return;
        }

        if (!ChatManager.Instance.GiveItemToCargo(this, CurrentCharacter, item, out var error))
        {
            // Could not be placed (e.g. cargo full); keep it in the world so it can be retried.
            map.RegisterWorldItem(item);
            Logger.WriteLog(LogType.Network, "ItemPickup: failed to add coid {0} to cargo: {1}", packet.ItemId.Coid, error);
        }
    }
}
