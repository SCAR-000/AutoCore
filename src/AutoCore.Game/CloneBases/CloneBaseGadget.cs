using System.IO;

namespace AutoCore.Game.CloneBases
{
    using Specifics;

    public class CloneBaseGadget : CloneBaseObject
    {
        public GadgetSpecific GadgetSpecific;

        public CloneBaseGadget(BinaryReader reader)
            : base(reader)
        {
            GadgetSpecific = GadgetSpecific.ReadNew(reader);
        }
    }
}
