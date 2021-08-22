using System.IO;

namespace AutoCore.Game.CloneBases
{
    using Specifics;

    public class CloneBaseObject : CloneBase
    {
        public SimpleObjectSpecific SimpleObjectSpecific;

        public CloneBaseObject(BinaryReader reader)
            : base(reader)
        {
            SimpleObjectSpecific = SimpleObjectSpecific.ReadNew(reader);
        }
    }
}
