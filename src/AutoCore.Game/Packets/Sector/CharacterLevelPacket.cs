namespace AutoCore.Game.Packets.Sector;

using AutoCore.Game.Constants;
using AutoCore.Game.Extensions;
using AutoCore.Game.Structures;

/// <summary>
/// CharacterLevelPacket (0x2017)
/// </summary>
public class CharacterLevelPacket : BasePacket
{
    public override GameOpcode Opcode => GameOpcode.CharacterLevel;

    public int UnknownHeader { get; set; } = 0;
    public TFID CharacterId { get; set; }
    public byte Level { get; set; }
    public long Currency { get; set; } = 0;
    public int Experience { get; set; } = 0;
    public long Unknown_0x2C { get; set; } = 0;
    public short CurrentMana { get; set; } = 100;
    public short MaxMana { get; set; } = 100;
    public short AttributeTech { get; set; } = 0;
    public short AttributeCombat { get; set; } = 0;
    public short AttributeTheory { get; set; } = 0;
    public short AttributePerception { get; set; } = 0;
    public short AttributePoints { get; set; } = 0;
    public short SkillPoints { get; set; } = 0;
    public short Unknown7 { get; set; } = 0;
    public short ResearchPoints { get; set; } = 0;

    public override void Write(BinaryWriter writer)
    {
        writer.Write(UnknownHeader);
        writer.WriteTFID(CharacterId);
        writer.Write(Level);

        // Padding (7 bytes to align to 0x20)
        writer.BaseStream.Position += 7;

        // Currency/XP fields
        writer.Write(Currency);
        writer.Write(Experience);
        writer.Write(Unknown_0x2C);

        // Power (mana) fields
        writer.Write(CurrentMana);
        writer.Write(MaxMana);

        // Attribute fields
        writer.Write(AttributeTech);
        writer.Write(AttributeCombat);
        writer.Write(AttributeTheory);
        writer.Write(AttributePerception);
        writer.Write(AttributePoints);
        writer.Write(SkillPoints);
        writer.Write(Unknown7);
        writer.Write(ResearchPoints);
    }
}
