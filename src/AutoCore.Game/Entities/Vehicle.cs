using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

using Microsoft.EntityFrameworkCore;

namespace AutoCore.Game.Entities
{
    using Database.Char;
    using Database.Char.Models;
    using Packets.Sector;

    public class Vehicle : SimpleObject
    {
        #region Database Vehicle Data
        private VehicleData DBData { get; set; }
        #endregion

        public bool LoadFromDB(CharContext context, long coid)
        {
            DBData = context.Vehicles.Include(v => v.SimpleObjectBase).FirstOrDefault(v => v.Coid == coid);

            if (DBData == null)
                return false;

            LoadCloneBase(DBData.SimpleObjectBase.CBID);

            return true;
        }

        public override void WriteToPacket(CreateSimpleObjectPacket packet)
        {
            base.WriteToPacket(packet);

            if (packet is CreateVehiclePacket vehiclePacket)
            {
            }

            if (packet is CreateVehicleExtendedPacket extendedPacket)
            {
            }
        }
    }
}
