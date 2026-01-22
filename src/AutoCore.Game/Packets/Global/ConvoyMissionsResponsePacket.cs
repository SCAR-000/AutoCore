namespace AutoCore.Game.Packets.Global;

using System.Collections.Generic;
using AutoCore.Game.Constants;

public class ConvoyMissionsResponsePacket : BasePacket
{
    public override GameOpcode Opcode => GameOpcode.ConvoyMissionsResponse;

    public long MemberCoid { get; set; }
    private List<uint> MissionIds { get; } = new();

    public void AddMissionId(uint missionId)
    {
        MissionIds.Add(missionId);
    }

    public override void Write(BinaryWriter writer)
    {
        writer.BaseStream.Position += 4;

        writer.Write(MemberCoid);
        writer.Write((ushort)(MissionIds.Count & 0xFFFF));

        writer.BaseStream.Position += 2;

        foreach (var missionId in MissionIds)
            writer.Write(missionId);
    }
}

