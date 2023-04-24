namespace AutoCore.Game.Packets.Login;

using AutoCore.Game.Constants;

public class LoginNewCharacterResponsePacket : BasePacket
{
    public override GameOpcode Opcode => GameOpcode.LoginNewCharacterResponse;

    public uint Result { get; set; }
    public long NewCharCoid { get; set; }

    public LoginNewCharacterResponsePacket(uint result, long coid)
    {
        Result = result;
        NewCharCoid = coid;
    }

    public override void Read(BinaryReader reader)
    {
        throw new NotImplementedException();
    }

    public override void Write(BinaryWriter writer)
    {
        writer.Write(Result);
        writer.Write(NewCharCoid);
    }
}
