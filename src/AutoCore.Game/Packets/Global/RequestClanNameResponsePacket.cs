namespace AutoCore.Game.Packets.Global;

using AutoCore.Game.Constants;
using AutoCore.Utils.Extensions;

public class RequestClanNameResponsePacket : BasePacket
{
    public override GameOpcode Opcode => GameOpcode.RequestClanNameResponse;

    public long CharacterCoid { get; set; }
    public string ClanName { get; set; }

    public RequestClanNameResponsePacket(long characterCoid, string clanName)
    {
        CharacterCoid = characterCoid;
        ClanName = clanName;
    }

    public override void Read(BinaryReader reader)
    {
        throw new NotSupportedException();
    }

    public override void Write(BinaryWriter writer)
    {
        writer.BaseStream.Position += 4;

        writer.Write(CharacterCoid);
        writer.WriteUtf8StringOn(ClanName, 52);

        writer.BaseStream.Position += 4;
    }
}
