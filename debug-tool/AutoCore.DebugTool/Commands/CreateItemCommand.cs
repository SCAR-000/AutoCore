namespace AutoCore.DebugTool.Commands;

using AutoCore.DebugTool.Cli;
using AutoCore.DebugTool.Memory;

/// <summary>
/// Adds an item to the local player's inventory by calling the client's own CreateItemInInventory
/// routine inside the live autoassault.exe process — no server involved. This is the isolated
/// client-side verification: if the item renders in the cargo grid, the client handles item data
/// correctly on its own.
/// </summary>
public static class CreateItemCommand
{
    public static int Run(CliOptions options)
    {
        var cbid = options.GetIntOrNull("cbid");
        if (cbid is null)
        {
            Console.Error.WriteLine("Missing required --cbid <id>.");
            return 1;
        }

        var quantity = options.GetInt("qty", 1);
        var pid = options.GetIntOrNull("pid");
        var timeoutMs = (uint)options.GetInt("timeout-ms", 5000);
        var dryRun = options.Has("dry-run");

        using var game = GameProcess.Open("autoassault", pid, out var error);
        if (game is null)
        {
            Console.Error.WriteLine($"Could not open the game: {error}");
            return 1;
        }

        Console.WriteLine($"Attached to {game.ProcessName} (pid {game.ProcessId}, base 0x{game.ModuleBase.ToInt64():X}).");

        // VOGClient is a static object embedded at this address — no first dereference.
        var vogClient = game.Rebase(GameOffsets.VogClientBaseRva);
        game.TryReadPointer(vogClient + GameOffsets.LocalPlayerOffset, out var player);

        Console.WriteLine($"  vogClient = 0x{vogClient.ToInt64():X}");
        Console.WriteLine($"  player    = 0x{player.ToInt64():X}");

        if (player != IntPtr.Zero && game.TryReadPointer(player, out var vtable))
            Console.WriteLine($"  player.vtable = 0x{vtable.ToInt64():X}");

        if (dryRun)
        {
            Console.WriteLine();
            Console.WriteLine(player == IntPtr.Zero
                ? "Dry run: player is null — make sure a character is fully in-world, then retry."
                : "Dry run: player resolved. Re-run without --dry-run to create the item.");
            return 0;
        }

        if (player == IntPtr.Zero)
        {
            Console.Error.WriteLine("Local player is null — make sure a character is fully in-world (not at a menu/loading/char-select), then retry.");
            return 1;
        }

        var func = game.Rebase(GameOffsets.CreateItemInInventoryRva);
        Console.WriteLine($"  calling CreateItemInInventory(player, cbid={cbid}, qty={quantity}) @ 0x{func.ToInt64():X}...");

        var ok = game.TryCallThiscall(func, player, new[] { cbid.Value, quantity }, timeoutMs, out var ret, out var callError);
        if (!ok)
        {
            Console.Error.WriteLine($"Remote call failed: {callError}");
            return 1;
        }

        var success = (ret & 0xFF) != 0;
        Console.WriteLine($"  returned 0x{ret:X} ({(success ? "success" : "failure/again")}).");
        Console.WriteLine(success
            ? "Call completed. Check the game's cargo/inventory window for the item."
            : "Call completed but the routine reported failure — the CBID may be invalid or not an inventory item.");
        return 0;
    }
}
