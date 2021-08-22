using System.IO;

namespace AutoCore.Game.CloneBases
{
    using Structures;
    using Specifics;

    public class CloneBaseVehicle : CloneBaseObject
    {
        public VehicleSpecific VehicleSpecific;

        public CloneBaseVehicle(BinaryReader reader)
            : base(reader)
        {
            VehicleSpecific = VehicleSpecific.ReadNew(reader);

            VehicleSpecific.Tricks = new VehicleTrick[VehicleSpecific.NumberOfTricks];
            for (var i = 0; i < VehicleSpecific.NumberOfTricks; ++i)
                VehicleSpecific.Tricks[i] = VehicleTrick.ReadNew(reader);
        }
    }
}
