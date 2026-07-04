namespace AutoCore.Game.Structures;

using AutoCore.Game.Constants;

public readonly record struct ItemCloneBaseEntry(int Cbid, string Name, CloneBaseObjectType Type, byte InvSizeX, byte InvSizeY);
