using System.IO;

namespace AutoCore.Game.CloneBases
{
    using Specifics;

    public class CloneBasePowerPlant : CloneBaseObject
    {
        public PowerPlantSpecific PowerPlantSpecific;

        public CloneBasePowerPlant(BinaryReader reader)
            : base(reader)
        {
            PowerPlantSpecific = PowerPlantSpecific.ReadNew(reader);
        }
    }
}
