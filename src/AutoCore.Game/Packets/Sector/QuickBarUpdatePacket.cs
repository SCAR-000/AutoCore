namespace AutoCore.Game.Packets.Sector;

using AutoCore.Game.Constants;

/// <summary>
/// QuickBarUpdate (0x2062) - Updates a single quickbar slot with a skill or item.
/// 
/// Field Layout (Client-to-Server, 12 bytes total):
///   Offset 0x00-0x01: SlotIndex (ushort, 2 bytes)
///   Offset 0x02-0x03: OpOrFlags (ushort, 2 bytes) - unknown/opcode/flags
///   Offset 0x04-0x05: SkillId (ushort, 2 bytes) - 0 if clearing slot or setting item
///   Offset 0x06-0x0B: Reserved/Padding (6 bytes)
/// </summary>
public class QuickBarUpdatePacket : BasePacket
{
    public override GameOpcode Opcode => GameOpcode.QuickBarUpdate;

    public ushort SlotIndex { get; set; }
    public ushort OpOrFlags { get; set; }
    public ushort SkillId { get; set; }
    // NOTE: Client packets we’ve observed are 12 bytes payload (no ItemCoid).
    // Keep this property for potential future item support, but we do not serialize it today.
    public long ItemCoid { get; set; }

    public override void Read(BinaryReader reader)
    {
        SlotIndex = reader.ReadUInt16();
        OpOrFlags = reader.ReadUInt16();
        SkillId = reader.ReadUInt16();
        
        // Skip 6 bytes of padding/reserved
        reader.BaseStream.Position += 6;
        
        // ItemCoid is only present in server-to-client packets
        // Client-to-server packets are 12 bytes total (after opcode)
        // Try to read ItemCoid, but if the stream ends, default to 0
        try
        {
            ItemCoid = reader.ReadInt64();
        }
        catch (EndOfStreamException)
        {
            // Client request doesn't include ItemCoid
            ItemCoid = 0;
        }
    }

    public override void Write(BinaryWriter writer)
    {
        writer.Write(SlotIndex);
        writer.Write(OpOrFlags);
        writer.Write(SkillId);
        
        // Write 6 bytes of padding
        writer.Write(new byte[6]);
    }
}

