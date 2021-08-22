using System.IO;

namespace AutoCore.Game.CloneBases
{
    using Specifics;

    public class CloneBaseWheelSet : CloneBaseObject
    {
        public WheelSetSpecific WheelSetSpecific;

        public CloneBaseWheelSet(BinaryReader reader)
            : base(reader)
        {
            WheelSetSpecific = WheelSetSpecific.ReadNew(reader);
        }
    }
}
