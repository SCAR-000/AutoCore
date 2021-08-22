using System.IO;

namespace AutoCore.Game.CloneBases
{
    using Constants;
    using Specifics;

    public class CloneBase
    {
        public CloneBaseSpecific CloneBaseSpecific { get; set; }

        public CloneBase(BinaryReader reader)
        {
            CloneBaseSpecific = CloneBaseSpecific.ReadNew(reader);
        }

        public CloneBaseObjectType Type => (CloneBaseObjectType)CloneBaseSpecific.Type;
    }
}
