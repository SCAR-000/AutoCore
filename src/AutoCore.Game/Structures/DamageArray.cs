using System.IO;

namespace AutoCore.Game.Structures
{
    using Utils.Extensions;

    public struct DamageArray
    {
        public short[] Damage { get; set; }

        public void Read(BinaryReader reader)
        {
            Damage = reader.ReadConstArray(6, reader.ReadInt16);
        }

        public void Write(BinaryWriter writer)
        {
            writer.WriteConstArray(Damage, 6, writer.Write);
        }

        public static DamageArray ReadNew(BinaryReader reader)
        {
            return new DamageArray { Damage = reader.ReadConstArray(6, reader.ReadInt16) };
        }
    }
}
