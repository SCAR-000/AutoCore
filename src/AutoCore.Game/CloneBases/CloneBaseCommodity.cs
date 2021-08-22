using System.IO;

namespace AutoCore.Game.CloneBases
{
    using Specifics;

    public class CloneBaseCommodity : CloneBaseObject
    {
        public CommoditySpecific CommoditySpecific;

        public CloneBaseCommodity(BinaryReader reader)
            : base(reader)
        {
            CommoditySpecific = CommoditySpecific.ReadNew(reader);
        }
    }
}
