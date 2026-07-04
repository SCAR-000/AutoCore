namespace AutoCore.Game.Packets.Sector;

using AutoCore.Game.Constants;
using AutoCore.Game.Extensions;
using AutoCore.Game.Structures;

public class ItemPickupPacket : BasePacket
{
    public override GameOpcode Opcode => GameOpcode.ItemPickup;

    public TFID ItemId { get; set; }

    public override void Read(BinaryReader reader)
    {
        // The 4-byte opcode is already consumed before Read; skip the base padding so the
        // 8-byte-aligned TFID lands at struct offset 0x8 (same layout as the InventoryGrab family).
        reader.BaseStream.Position += 4;

        ItemId = reader.ReadTFID();
    }
}
