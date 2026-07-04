namespace AutoCore.DebugTool.Memory;

/// <summary>One cargo slot as read out of the live client's memory.</summary>
public readonly record struct ClientInventoryItem(int Index, long Coid, byte PositionX, byte PositionY);

public sealed class ClientInventoryResult
{
    public bool OffsetsConfigured { get; init; }
    public bool Success { get; init; }
    public string? Error { get; init; }
    public int Count { get; init; }
    public IReadOnlyList<ClientInventoryItem> Items { get; init; } = Array.Empty<ClientInventoryItem>();
}

/// <summary>
/// Reads the local player's cargo inventory out of autoassault.exe memory.
///
/// The offsets below are discovered by reverse-engineering the client in Ghidra (see the
/// InventoryCargoSendAll handler, opcode 0x2040, and the CreateSimpleObject inventory branch). They
/// are intentionally centralized here so that, once confirmed, only this file changes. Until they are
/// filled in, <see cref="OffsetsConfigured"/> is false and the tool reports the server view only.
///
/// Pointer chain (x86, 4-byte pointers):
///   [ModuleBase + LocalPlayerPointer]            -> player object
///   [player      + PlayerVehiclePointer]         -> vehicle object that owns the cargo bay
///   [vehicle     + CargoArrayPointer]            -> base of the item entry array
///   [vehicle     + CargoCountOffset]  (int)      -> number of populated entries
/// Each entry is <see cref="CargoEntryStride"/> bytes:
///   +CargoEntryCoidOffset  (int64) coid
///   +CargoEntryXOffset     (byte)  grid X
///   +CargoEntryYOffset     (byte)  grid Y
/// </summary>
public sealed class InventoryReader
{
    // ---- Offsets to be filled from Ghidra (Phase 1). Zero == not yet known. ----
    public const int LocalPlayerPointer = 0x0;   // RVA of the global local-player pointer
    public const int PlayerVehiclePointer = 0x0; // offset of vehicle ptr inside the player object
    public const int CargoArrayPointer = 0x0;    // offset of cargo array ptr inside the vehicle object
    public const int CargoCountOffset = 0x0;     // offset of the cargo item count inside the vehicle object
    public const int CargoEntryStride = 0x0;     // size of one cargo entry
    public const int CargoEntryCoidOffset = 0x0;
    public const int CargoEntryXOffset = 0x0;
    public const int CargoEntryYOffset = 0x0;

    private const int MaxReasonableItems = 312; // matches InventoryCargoSendAllPacket.MaxItems

    private static bool AreOffsetsConfigured =>
        LocalPlayerPointer != 0 && CargoArrayPointer != 0 && CargoEntryStride != 0;

    public ClientInventoryResult Read(GameProcess game)
    {
        if (!AreOffsetsConfigured)
        {
            return new ClientInventoryResult
            {
                OffsetsConfigured = false,
                Success = false,
                Error = "Client memory offsets are not configured yet (pending Ghidra analysis)."
            };
        }

        if (!game.TryReadPointer(game.ModuleBase + LocalPlayerPointer, out var player) || player == IntPtr.Zero)
            return Fail("Could not read the local player pointer (is a character in-world?).");

        if (!game.TryReadPointer(player + PlayerVehiclePointer, out var vehicle) || vehicle == IntPtr.Zero)
            return Fail("Could not read the player's vehicle pointer.");

        if (!game.TryReadPointer(vehicle + CargoArrayPointer, out var array) || array == IntPtr.Zero)
            return Fail("Could not read the cargo array pointer.");

        if (!game.TryReadInt32(vehicle + CargoCountOffset, out var count))
            return Fail("Could not read the cargo item count.");

        if (count < 0 || count > MaxReasonableItems)
            return Fail($"Cargo count {count} is out of range; offsets are probably wrong.");

        var items = new List<ClientInventoryItem>(count);
        for (var i = 0; i < count; ++i)
        {
            var entry = array + i * CargoEntryStride;

            game.TryReadInt64(entry + CargoEntryCoidOffset, out var coid);
            game.TryReadByte(entry + CargoEntryXOffset, out var x);
            game.TryReadByte(entry + CargoEntryYOffset, out var y);

            items.Add(new ClientInventoryItem(i, coid, x, y));
        }

        return new ClientInventoryResult
        {
            OffsetsConfigured = true,
            Success = true,
            Count = count,
            Items = items
        };
    }

    private static ClientInventoryResult Fail(string error) => new()
    {
        OffsetsConfigured = true,
        Success = false,
        Error = error
    };
}
