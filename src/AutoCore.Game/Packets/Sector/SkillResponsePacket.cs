namespace AutoCore.Game.Packets.Sector;

using AutoCore.Game.Constants;

public class SkillResponsePacket : BasePacket
{
    public override GameOpcode Opcode => GameOpcode.SkillStatusEffect;

    public int SkillId { get; set; }
    public SkillResponse Response { get; set; }

    public override void Write(BinaryWriter writer)
    {
        writer.Write(SkillId);
        writer.Write((int)Response);
    }
}

