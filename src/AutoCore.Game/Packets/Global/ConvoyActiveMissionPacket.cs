namespace AutoCore.Game.Packets.Global;

using System;
using System.IO;
using AutoCore.Game.Constants;
using AutoCore.Utils;

/// <summary>
/// SMSG_Global_ConvoyActiveMission - Notifies client about an active mission
/// Size=0x18 (Id=15523)
/// </summary>
public class ConvoyActiveMissionPacket : BasePacket
{
    public override GameOpcode Opcode => GameOpcode.ConvoyActiveMission;

    /// <summary>
    /// The character COID who has this mission active
    /// Offset=0x8 Size=0x8
    /// </summary>
    public long CoidChanger { get; set; }

    /// <summary>
    /// The mission ID
    /// Offset=0x10 Size=0x2
    /// </summary>
    public uint MissionId { get; set; }

    public override void Write(BinaryWriter writer)
    {
        // Offset 0x4: 4 bytes padding (SMSG_Base = opcode + padding)
        writer.Write(0);

        // Offset 0x8: coidChanger (8 bytes)
        writer.Write(CoidChanger);

        // Offset 0x10: uiMissionID (2 bytes according to struct)
        writer.Write((ushort)(MissionId & 0xFFFF));

        // Offset 0x12: padding to reach 0x18 (6 bytes)
        writer.Write((ushort)0);
        writer.Write(0);
    }
}

