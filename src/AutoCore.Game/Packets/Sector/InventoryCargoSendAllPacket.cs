namespace AutoCore.Game.Packets.Sector;

using AutoCore.Game.Constants;

public class InventoryCargoSendAllPacket : BasePacket
{
    public const int MaxItems = 312;

    public override GameOpcode Opcode => GameOpcode.InventoryCargoSendAll;

    public byte InventorySize { get; set; }
    public long[] ItemCoids { get; } = new long[MaxItems];
    public byte[] ItemPositionX { get; } = new byte[MaxItems];
    public byte[] ItemPositionY { get; } = new byte[MaxItems];

    public override void Write(BinaryWriter writer)
    {
        writer.Write(InventorySize);

        writer.BaseStream.Position += 3;

        // The client's SMSG_Sector_InventoryCargoSendAll is variable-length (it exposes GetSize()):
        // the real message is header + ucInventorySize * sizeof(SVOGInventoryItem), NOT the full fixed
        // m_vItems[312] capacity. Writing all 312 entries makes a ~5000-byte packet (which then gets
        // fragmented) when the client expects only InventorySize entries, so the framed size won't match
        // what it unpacks. Emit exactly InventorySize entries.
        for (var i = 0; i < InventorySize; ++i)
        {
            writer.Write(ItemCoids[i]);
            writer.Write(ItemPositionX[i]);
            writer.Write(ItemPositionY[i]);

            writer.BaseStream.Position += 6;
        }
    }
}
