namespace AutoCore.Game.Packets.Sector;

using AutoCore.Game.Constants;

public class ChangeCombatModeRequestPacket : BasePacket
{
    public override GameOpcode Opcode => GameOpcode.ChangeCombatModeRequest;

    public long CharacterCoid { get; set; }
    public byte Mode { get; set; }

    public override void Read(BinaryReader reader)
    {
        reader.BaseStream.Position += 4;

        CharacterCoid = reader.ReadInt64();
        Mode = reader.ReadByte();

        reader.BaseStream.Position += 7;
    }
}
