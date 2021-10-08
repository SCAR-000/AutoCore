using System;
using System.Collections.Generic;
using System.Linq;

namespace AutoCore.Game.Managers
{
    using CloneBases;
    using Constants;
    using Database.Char;
    using Database.Char.Models;
    using Database.World;
    using Database.World.Models;
    using Entities;
    using Packets.Login;
    using Packets.Sector;
    using TNL;
    using Utils.Memory;

    public class CharacterSelectionManager : Singleton<CharacterSelectionManager>
    {
        public static (bool, long) CreateNewCharacter(TNLConnection client, NewCharacterPacket packet)
        {
            using var context = new CharContext();

            if (context.Characters.Any(c => c.Name == packet.CharacterName))
                return (false, -1);

            if (context.Vehicles.Any(v => v.Name == packet.VehicleName))
                return (false, -1);

            var cloneBaseCharacter = AssetManager.Instance.GetCloneBase<CloneBaseCharacter>(packet.CBID);
            if (cloneBaseCharacter == null)
                return (false, -1);

            ConfigNewCharacter config;

            using (var worldContext = new WorldContext())
            {
                config = worldContext.ConfigNewCharacters.First(cnc => cnc.Race == cloneBaseCharacter.CharacterSpecific.Race && cnc.Class == cloneBaseCharacter.CharacterSpecific.Class);
            }

            var charObj = new SimpleObjectData
            {
                Type = (byte)CloneBaseObjectType.Character,
                CBID = packet.CBID
            };

            var vehObj = new SimpleObjectData
            {
                Type = (byte)CloneBaseObjectType.Vehicle,
                CBID = config.Vehicle
            };

            context.SimpleObjects.Add(charObj);
            context.SimpleObjects.Add(vehObj);
            context.SaveChanges();

            try
            {
                var character = new CharacterData
                {
                    Coid = charObj.Coid,
                    AccountId = client.Account.Id,
                    Name = packet.CharacterName,
                    HeadId = packet.HeadId,
                    BodyId = packet.BodyId,
                    HeadDetail1 = packet.HeadDetail1,
                    HeadDetail2 = packet.HeadDetail2,
                    HelmetId = packet.HelmetId,
                    EyesId = packet.EyesId,
                    MouthId = packet.MouthId,
                    HairId = packet.HairId,
                    PrimaryColor = packet.PrimaryColor,
                    SecondaryColor = packet.SecondaryColor,
                    EyesColor = packet.EyesColor,
                    HairColor = packet.HairColor,
                    SkinColor = packet.SkinColor,
                    SpecialityColor = packet.SpecialityColor,
                    ScaleOffset = packet.ScaleOffset,
                    Level = 1
                };
                context.Characters.Add(character);

                var vehicle = new VehicleData
                {
                    Coid = vehObj.Coid,
                    CharacterCoid = charObj.Coid,
                    Name = packet.VehicleName,
                    PositionX = 0.0f,
                    PositionY = 0.0f,
                    PositionZ = 0.0f,
                    Rotation1 = 0.0f,
                    Rotation2 = 0.0f,
                    Rotation3 = 0.0f,
                    Rotation4 = 0.0f,
                    PrimaryColor = packet.VehiclePrimaryColor,
                    SecondaryColor = packet.VehicleSecondaryColor,
                    Trim = packet.VehicleTrim
                };
                context.Vehicles.Add(vehicle);
                context.SaveChanges();

                character.ActiveVehicleCoid = vehObj.Coid;
                context.SaveChanges();
            }
            catch
            {
                context.SimpleObjects.Remove(charObj);
                context.SimpleObjects.Remove(vehObj);
                context.SaveChanges();
            }

            return (true, charObj.Coid);
        }

        public static void SendCharacterList(TNLConnection client)
        {
            using var context = new CharContext();

            var coids = context.Characters.Where(c => c.AccountId == client.Account.Id).Select(c => c.Coid).ToList();

            foreach (var coid in coids)
            {
                SendCharacter(client, context, coid);
            }
        }

        public static void ExtendCharacterList(TNLConnection client, long coid)
        {
            using var context = new CharContext();

            SendCharacter(client, context, coid);
        }

        private static void SendCharacter(TNLConnection client, CharContext context, long coid)
        {
            var character = new Character(client);
            if (!character.LoadFromDB(context, coid))
            {
                return;
            }

            var vehicle = new Vehicle();
            if (!vehicle.LoadFromDB(context, character.ActiveVehicleCoid))
            {
                return;
            }

            var createCharPacket = new CreateCharacterPacket();
            character.WriteToPacket(createCharPacket);

            var createVehiclePacket = new CreateVehiclePacket();
            vehicle.WriteToPacket(createVehiclePacket);

            client.SendGamePacket(createCharPacket);
            client.SendGamePacket(createVehiclePacket);
        }
    }
}
