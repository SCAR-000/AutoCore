namespace AutoCore.Game.Packets.Sector;

using AutoCore.Game.Constants;

/// <summary>
/// Wire layout for the <c>InventoryAddItem</c> message (opcode 0x2047), a 0x20-byte struct.
/// </summary>
/// <remarks>
/// In the retail client this is a <b>client to server</b> request (the client builds and sends it,
/// e.g. when the player drags an item into a cargo slot); the client has no receive handler for it.
/// Do NOT push this from the server to populate cargo — use <see cref="CreateSimpleObjectPacket"/>
/// with <c>IsInInventory = true</c> plus <see cref="InventoryCargoSendAllPacket"/> instead. This
/// type is retained for parsing the inbound client request.
/// </remarks>
public class InventoryAddItemPacket : BasePacket
{
    public override GameOpcode Opcode => GameOpcode.InventoryAddItem;

    public long CoidItem { get; set; }
    public byte InventoryPositionX { get; set; }
    public byte InventoryPositionY { get; set; }
    public bool AddToExistingItem { get; set; }
    public int Quantity { get; set; }
    public bool WasAdded { get; set; }

    public override void Write(BinaryWriter writer)
    {
        writer.BaseStream.Position += 4;

        writer.Write(CoidItem);
        writer.Write(InventoryPositionX);
        writer.Write(InventoryPositionY);
        writer.Write(AddToExistingItem);

        writer.BaseStream.Position += 1;

        writer.Write(Quantity);
        writer.Write(WasAdded);

        writer.BaseStream.Position += 7;
    }
}
