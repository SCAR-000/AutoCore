using System.IO;

namespace AutoCore.Game.CloneBases
{
    using Specifics;

    public class CloneBaseArmor : CloneBaseObject
    {
        public ArmorSpecific ArmorSpecific { get; set; }

        public CloneBaseArmor(BinaryReader reader)
            : base(reader)
        {
            ArmorSpecific = ArmorSpecific.ReadNew(reader);
        }
    }
}
