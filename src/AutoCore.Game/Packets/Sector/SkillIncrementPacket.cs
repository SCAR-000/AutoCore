namespace AutoCore.Game.Packets.Sector;

using AutoCore.Game.Constants;

/// <summary>
/// SkillIncrement (0x2059) - Notifies server of a skill rank increment request
/// 
/// Field Layout:
///   Offset 0x04: SkillID (4 bytes)
/// </summary>
public class SkillIncrementPacket : BasePacket
{
    public override GameOpcode Opcode => GameOpcode.SkillIncrement;

    public int SkillID { get; set; }

    public override void Read(BinaryReader reader)
    {
        // Total packet size is 0x8: opcode (4 bytes, already read) + SkillID (4 bytes)
        SkillID = reader.ReadInt32();
    }

    public override void Write(BinaryWriter writer)
    {
        writer.Write(SkillID);
    }
}
