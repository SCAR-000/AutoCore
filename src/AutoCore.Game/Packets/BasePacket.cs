using System.IO;

namespace AutoCore.Game.Packets
{
    using Constants;
    using Utils.Packets;

    public abstract class BasePacket : IOpcodedPacket<GameOpcode>
    {
        public abstract GameOpcode Opcode { get; }

        public abstract void Read(BinaryReader reader);
        public abstract void Write(BinaryWriter writer);
    }
}
