using System.IO;

namespace AutoCore.Game.CloneBases.Prefixes
{
    using Structures;

    public class PrefixArmor : PrefixBase
    {
        public short ArmorFactorAdjust { get; set; }
        public float ArmorFactorPercent { get; set; }
        public DamageArray ResistAdjust { get; set; }

        public PrefixArmor(BinaryReader reader)
            : base(reader)
        {
            ArmorFactorPercent = reader.ReadSingle();
            ArmorFactorAdjust = reader.ReadInt16();
            ResistAdjust = DamageArray.ReadNew(reader);

            reader.BaseStream.Position += 2;
        }
    }
}
