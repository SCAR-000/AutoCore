using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace AutoCore.Game.Entities
{
    using Database.Char.Models;
    using Packets.Sector;

    using CharacterData = Database.Char.Models.Character;

    public class Character : Creature
    {
        #region Properties
        #region Database Character Data
        public CharacterData CharacterDBData { get; private set; }
        public string Name => CharacterDBData.Name;
        public int BodyId => CharacterDBData.BodyId;
        public int HeadId => CharacterDBData.HeadId;
        public int HairId => CharacterDBData.HairId;
        public int HelmetId => CharacterDBData.HelmetId;
        public int AccessoryId1 => CharacterDBData.HeadDetail1;
        public int AccessoryId2 => CharacterDBData.HeadDetail2;
        public int EyesId => CharacterDBData.EyesId;
        public int MouthId => CharacterDBData.MouthId;
        public float ScaleOffset => CharacterDBData.ScaleOffset;
        #endregion

        #region Database Clan Data
        public ClanMember ClanMemberDBData { get; private set; }
        public string ClanName => ClanMemberDBData?.Clan?.Name;
        public int ClanId => ClanMemberDBData?.ClanId ?? -1;
        public int ClanRank => ClanMemberDBData?.Rank ?? -1;
        #endregion

        public byte GMLevel { get; }
        #endregion

        public Character()
        {
            CharacterDBData = new CharacterData();
            
            GMLevel = 0;
        }

        public bool LoadFromDB(long coid)
        {
            // TODO: load character data
            // TODO: load clan data
            return false;
        }

        public override void WriteToPacket(CreateSimpleObjectPacket packet)
        {
            base.WriteToPacket(packet);

            if (packet is CreateCharacterPacket charPacket)
            {
                charPacket.CurrentVehicleCoid = -1;
                charPacket.CurrentTrailerCoid = -1;
                charPacket.HeadId = HeadId;
                // TODO
            }

            if (packet is CreateCharacterExtendedPacket extendedCharPacket)
            {
                // TODO
            }
        }
    }
}
