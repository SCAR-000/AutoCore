namespace AutoCore.Game.Packets.Sector;

using AutoCore.Game.Constants;

/// <summary>
/// QuickBarUpdate (0x2062) - Updates a single quickbar slot with a skill or item.
/// 
/// Field Layout:
///   Offset 0x04: SlotIndex (4 bytes)
///   Offset 0x08: SkillId (4 bytes) - 0 if clearing slot or setting item
///   Offset 0x0C: ItemCoid (8 bytes) - 0 if setting skill
/// </summary>
public class QuickBarUpdatePacket : BasePacket
{
    public override GameOpcode Opcode => GameOpcode.QuickBarUpdate;

    public int SlotIndex { get; set; }
    public int SkillId { get; set; }
    public long ItemCoid { get; set; }

    public override void Read(BinaryReader reader)
    {
        SlotIndex = reader.ReadInt32();
        SkillId = reader.ReadInt32();
        ItemCoid = reader.ReadInt64();
    }

    public override void Write(BinaryWriter writer)
    {
        writer.Write(SlotIndex);
        writer.Write(SkillId);
        writer.Write(ItemCoid);
    }
}

