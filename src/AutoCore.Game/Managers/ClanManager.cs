namespace AutoCore.Game.Managers;

using AutoCore.Game.Entities;
using AutoCore.Game.Packets;
using AutoCore.Game.Packets.Global;
using AutoCore.Utils.Memory;

public class ClanManager : Singleton<ClanManager>
{
    public void BroadcastPacket(Character source, BasePacket packet)
    {
        // TODO: find clan of Character
        // Broadcast out the packet to each of clan member
    }

    public void HandleRequestClanNamePacket(Character source, BinaryReader reader)
    {
        // TODO: find the clan of the requested Character
        // Send back the name of the clan
        var packet = new RequestClanNamePacket();
        packet.Read(reader);

        source.OwningConnection.SendGamePacket(new RequestClanNameResponsePacket(packet.CharacterCoid, ""));
    }

    public void HandleClanUpdatePacket(Character source, BinaryReader reader)
    {
        // TODO: find clan of Character
        // Validate that this player can change the clan data
        // Update the clan data and save to DB

        var packet = new ClanUpdatePacket();
        packet.Read(reader);

        source.OwningConnection.SendGamePacket(new ClanUpdateResponsePacket(ClanUpdateResponse.Ok));
    }
}
