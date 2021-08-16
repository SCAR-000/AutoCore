using System;
using System.IO;

namespace AutoCore.Communicator.Packets
{
    using Utils.Packets;

    public class ServerInfoRequestPacket : IOpcodedPacket<CommunicatorOpcode>
    {
        public CommunicatorOpcode Opcode { get; } = CommunicatorOpcode.ServerInfoRequest;

        public void Read(BinaryReader br)
        {
        }

        public void Write(BinaryWriter bw)
        {
            bw.Write((byte)Opcode);
        }
    }
}
