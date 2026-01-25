namespace AutoCore.Game.Packets.Sector;

using AutoCore.Game.Constants;
using AutoCore.Game.Extensions;
using AutoCore.Game.Structures;

public class RequestCastSkillPacket : BasePacket
{
    public override GameOpcode Opcode => GameOpcode.RequestCastSkill;

    public TFID Target { get; set; }
    public int SkillId { get; set; }
    public Vector3 TargetPosition { get; set; }

    public override void Read(BinaryReader reader)
    {
        Target = reader.ReadTFID();
        SkillId = reader.ReadInt32();
        TargetPosition = Vector3.ReadNew(reader);
    }

    public override void Write(BinaryWriter writer)
    {
        writer.WriteTFID(Target);
        writer.Write(SkillId);
        writer.Write(TargetPosition.X);
        writer.Write(TargetPosition.Y);
        writer.Write(TargetPosition.Z);
    }
}

