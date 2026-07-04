namespace AutoCore.DebugTool.Memory;

/// <summary>
/// Static addresses/offsets recovered from autoassault.exe in Ghidra. Function/global addresses are
/// recorded as RVAs (VA - 0x00400000 image base) and rebased onto the live module at runtime.
///
/// The engine's main client object ("VOGClient", per VOGClient.cpp asserts) is a STATICALLY ALLOCATED
/// global object — its base IS a fixed address (VA 0x00D1A840), not a pointer to dereference. The
/// developer WinMain (FUN_0094ba40) passes &DAT_00d1a840 as `this` to the per-frame tick FUN_0094b520.
///
/// Chain to the local player and the item-spawn function (verified by disassembly):
///   vogClient   = module + VogClientBaseRva              // the object itself (no deref)
///   localPlayer = *(void**)(vogClient + LocalPlayerOffset)
///   CreateItemInInventory(this=localPlayer, int cbid, int quantity)  // __thiscall @ CreateItemInInventoryRva
/// </summary>
public static class GameOffsets
{
    public const long PreferredImageBase = 0x00400000;

    /// <summary>RVA of the statically-allocated VOGClient object (VA 0x00D1A840). NOT a pointer.</summary>
    public const int VogClientBaseRva = 0x0091A840;

    /// <summary>Offset of the local player object pointer inside the VOGClient object.</summary>
    public const int LocalPlayerOffset = 0x0E98;

    /// <summary>
    /// RVA of CreateItemInInventory(this, int cbid, int quantity) — __thiscall, RET 0x8 (VA 0x005310A0).
    /// Builds an item from a CBID, inserts it into the local cargo inventory + UI, then notifies the server.
    /// </summary>
    public const int CreateItemInInventoryRva = 0x001310A0;

    /// <summary>
    /// RVA of RefreshAllOpenUi(VOGClient) — stdcall, takes the VOGClient base address as a stack arg
    /// (VA 0x0093A940). Walks all open dialogs and refreshes them (incl. the cargo window).
    /// </summary>
    public const int RefreshAllOpenUiRva = 0x0053A940;
}
