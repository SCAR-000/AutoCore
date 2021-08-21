using System.IO;

namespace AutoCore.Game.TNL
{
    using Packets.Login;
    using Utils;

    public partial class TNLConnection
    {
        private void HandleLoginRequest(BinaryReader reader)
        {
            var packet = new LoginRequestPacket();
            packet.Read(reader);

            /*if (!LoginAccount(packet.AuthKey, packet.Username, packet.Password))
            {
                SendGamePacket(new LoginResponsePacket(1));
                Disconnect("Invalid Username or password!");
                return;
            }*/

            Logger.WriteLog(LogType.Network, "Client ({3} -> {1} | {2}) authenticated from {0}", GetNetAddressString(), AccountId, AccountName, _playerCOID);

            /*var list = DataAccess.Character.GetCharacters(AccountId);

            foreach (var character in from charData in list let character = new Character() where character.LoadFromDB(charData.Value, charData.Key) select character)
            {
                character.SetOwner(this);

                var pack = new Packet(Opcode.CreateCharacter);
                character.WriteToCreatePacket(pack);

                var vpack = new Packet(Opcode.CreateVehicle);
                character.GetVehicle().WriteToCreatePacket(vpack);

                SendPacket(pack, RPCGuaranteeType.RPCGuaranteedOrdered);
                SendPacket(vpack, RPCGuaranteeType.RPCGuaranteedOrdered);
            }*/

            // CharacterSelectionManager.SendCharacterList(this);

            SendGamePacket(new LoginResponsePacket(0x1000000));
        }
    }
}
