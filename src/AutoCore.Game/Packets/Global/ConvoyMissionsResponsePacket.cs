namespace AutoCore.Game.Packets.Global;

using System;
using System.Collections.Generic;
using System.IO;
using AutoCore.Game.Constants;
using AutoCore.Utils;

public class ConvoyMissionsResponsePacket : BasePacket
{
    public override GameOpcode Opcode => GameOpcode.ConvoyMissionsResponse;

    public long MemberCoid { get; set; }
    private List<uint> MissionIds { get; } = new();

    public void AddMissionId(uint missionId)
    {
        MissionIds.Add(missionId);
    }

    public IReadOnlyList<uint> GetMissionIds() => MissionIds;

    public override void Write(BinaryWriter writer)
    {
        // In client memory supposedly expects this based on Opus investigation
        // Doesn't seem to work yet however, client does not show the received missions in the mission viewer
        // Struct layout (Size=0x18 = 24 bytes fixed):
        // Offset 0x0: opcode (4 bytes) - written by caller
        // Offset 0x4: padding (4 bytes)
        // Offset 0x8: coidMember (8 bytes)
        // Offset 0x10: uiNumMissions (2 bytes) - Size=0x2 per struct
        // Offset 0x12: padding (2 bytes)
        // Offset 0x14: arruiMissionIDs (4 bytes) - inline mission IDs (2 bytes each based on Size=0x2 for mission IDs in other packets)

        // Offset 0x4: 4 bytes padding
        writer.Write(0);

        // Offset 0x8: coidMember (8 bytes)
        writer.Write(MemberCoid);

        // Offset 0x10: uiNumMissions (2 bytes)
        writer.Write((ushort)(MissionIds.Count & 0xFFFF));

        // Offset 0x12: 2 bytes padding
        writer.Write((ushort)0);

        // Offset 0x14: inline mission IDs in the 4-byte "pointer" field
        // Based on uiMissionID Size=0x2 in ConvoyActiveMission, mission IDs are 2 bytes
        // This allows up to 2 mission IDs to fit in the 4-byte field
        if (MissionIds.Count >= 1)
            writer.Write((ushort)(MissionIds[0] & 0xFFFF));
        else
            writer.Write((ushort)0);

        if (MissionIds.Count >= 2)
            writer.Write((ushort)(MissionIds[1] & 0xFFFF));
        else
            writer.Write((ushort)0);

        // Total: 4 + 8 + 2 + 2 + 4 = 20 bytes after opcode = 24 bytes total
    }
}

