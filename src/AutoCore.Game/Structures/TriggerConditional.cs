namespace AutoCore.Game.Structures;

public class TriggerConditional
{
    public int LeftId { get; set; }
    public int RightId { get; set; }
    public byte Type { get; set; }

    public static TriggerConditional Read(BinaryReader reader)
    {
        var result = new TriggerConditional
        {
            LeftId = reader.ReadInt32(),
            RightId = reader.ReadInt32(),
            Type = reader.ReadByte()
        };

        reader.BaseStream.Position += 3;

        return result;
    }
}
