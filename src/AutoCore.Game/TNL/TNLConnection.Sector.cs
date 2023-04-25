namespace AutoCore.Game.TNL;

using AutoCore.Database.Char;
using AutoCore.Game.Entities;
using AutoCore.Game.Managers;
using AutoCore.Game.Packets.Sector;

public partial class TNLConnection
{
    private void HandleTransferFromGlobal(BinaryReader reader)
    {
        var packet = new TransferFromGlobalPacket();
        packet.Read(reader);

        // TODO: validate security key with info received from communicator or DB value or something...

        using var context = new CharContext();

        var character = new Character(this);
        if (!character.LoadFromDB(context, packet.CharacterCoid))
        {
            Disconnect("Invalid character!");
            return;
        }

        character.LoadCurrentVehicle(context);

        var mapInfoPacket = new MapInfoPacket();

        var map = MapManager.Instance.GetMap(708);
        map.Fill(mapInfoPacket);

        SendGamePacket(mapInfoPacket, skipOpcode: true);
    }

    private void HandleTransferFromGlobalStage2(BinaryReader reader)
    {
        var packet = new TransferFromGlobalPacket();
        packet.Read(reader);

        SendGamePacket(new TransferFromGlobalStage3Packet());
    }

    private void HandleTransferFromGlobalStage3(BinaryReader reader)
    {
        var packet = new TransferFromGlobalStage3Packet();
        packet.Read(reader);

        SendGamePacket(new CreateVehicleExtendedPacket());
        SendGamePacket(new CreateCharacterExtendedPacket());
    }
}
