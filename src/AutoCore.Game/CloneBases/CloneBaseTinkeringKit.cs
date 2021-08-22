using System.IO;

namespace AutoCore.Game.CloneBases
{
    using Specifics;

    public class CloneBaseTinkeringKit : CloneBaseObject
    {
        public TinkeringKitSpecific TinkeringKitSpecific;

        public CloneBaseTinkeringKit(BinaryReader reader)
            : base(reader)
        {
            TinkeringKitSpecific = TinkeringKitSpecific.ReadNew(reader);
        }
    }
}
