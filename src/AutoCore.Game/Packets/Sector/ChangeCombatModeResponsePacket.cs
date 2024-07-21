namespace AutoCore.Game.Packets.Sector;

using AutoCore.Game.Constants;

public class ChangeCombatModeResponsePacket : BasePacket
{
    public override GameOpcode Opcode => GameOpcode.ChangeCombatModeResponse;

    public long CharacterCoid { get; set; }
    public byte Mode { get; set; }
    public bool Success { get; set; }

    public override void Write(BinaryWriter writer)
    {
        writer.BaseStream.Position += 4;

        writer.Write(CharacterCoid);
        writer.Write(Mode);
        writer.Write(Success);

        writer.BaseStream.Position += 6;
    }
}
