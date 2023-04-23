namespace AutoCore.Communicator.Packets;

using AutoCore.Utils.Packets;

public class LoginResponsePacket : IOpcodedPacket<CommunicatorOpcode>
{
    public CommunicatorOpcode Opcode { get; } = CommunicatorOpcode.LoginResponse;

    public bool Success { get; set; }

    public void Read(BinaryReader br)
    {
        Success = br.ReadByte() != 0;
    }

    public void Write(BinaryWriter bw)
    {
        bw.Write((byte)Opcode);
        bw.Write((byte)(Success ? 1 : 0));
    }

    public override string ToString() => $"LoginResponsePacket(Success: {Success})";
}
