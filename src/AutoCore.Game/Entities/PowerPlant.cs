using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace AutoCore.Game.Entities
{
    using CloneBases;
    using Database.Char;
    using Database.Char.Models;
    using Packets.Sector;

    public class PowerPlant : SimpleObject
    {
        #region Properties
        #region Database PowerPlant properties
        private SimpleObjectData DBData { get; set; }
        #endregion

        public CloneBasePowerPlant CloneBasePowerPlant => CloneBaseObject as CloneBasePowerPlant;
        #endregion

        public PowerPlant()
        {
        }

        public override bool LoadFromDB(CharContext context, long coid)
        {
            SetCoid(coid, true);

            DBData = context.SimpleObjects.FirstOrDefault(so => so.Coid == coid);
            if (DBData == null)
                return false;

            LoadCloneBase(DBData.CBID);

            return true;
        }

        public override void WriteToPacket(CreateSimpleObjectPacket packet)
        {
            base.WriteToPacket(packet);

            if (packet is CreatePowerPlantPacket powerPlantPacket)
            {
                powerPlantPacket.PowerPlantSpecific = CloneBasePowerPlant.PowerPlantSpecific;
                powerPlantPacket.Mass = CloneBaseObject.SimpleObjectSpecific.Mass;
                powerPlantPacket.Name = "";
                powerPlantPacket.SkillCooldown = 0.0f;
            }
        }
    }
}
