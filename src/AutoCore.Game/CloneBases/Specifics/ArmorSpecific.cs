using System.IO;

namespace AutoCore.Game.CloneBases.Specifics
{
    using Structures;

    public struct ArmorSpecific
    {
        public short ArmorFactor;
        public short DefenseBonus;
        public float DeflectionModifier;
        public DamageArray Resistances;

        public static ArmorSpecific ReadNew(BinaryReader reader)
        {
            return new ArmorSpecific
            {
                DeflectionModifier = reader.ReadSingle(),
                ArmorFactor = reader.ReadInt16(),
                Resistances = DamageArray.ReadNew(reader),
                DefenseBonus = reader.ReadInt16()
            };
        }

        public void Read(BinaryReader reader)
        {
            DeflectionModifier = reader.ReadSingle();
            ArmorFactor = reader.ReadInt16();

            Resistances.Read(reader);

            DefenseBonus = reader.ReadInt16();
        }

        public void Write(BinaryWriter writer)
        {
            writer.Write(DeflectionModifier);
            writer.Write(ArmorFactor);

            Resistances.Write(writer);

            writer.Write(DefenseBonus);
        }
    }
}
