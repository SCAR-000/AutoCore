namespace AutoCore.DebugTool.Commands;

using AutoCore.DebugTool.Cli;
using AutoCore.DebugTool.Memory;

/// <summary>
/// Calls the client's "refresh all open UI" routine (FUN_0093a940) in-process. Used to test whether a
/// cargo item that is already in the client's data (confirmed via scancoid) but not shown is simply a
/// missing UI refresh.
/// </summary>
public static class RefreshUiCommand
{
    public static int Run(CliOptions options)
    {
        var pid = options.GetIntOrNull("pid");
        var timeoutMs = (uint)options.GetInt("timeout-ms", 5000);

        using var game = GameProcess.Open("autoassault", pid, out var error);
        if (game is null)
        {
            Console.Error.WriteLine($"Could not open the game: {error}");
            return 1;
        }

        Console.WriteLine($"Attached to {game.ProcessName} (pid {game.ProcessId}, base 0x{game.ModuleBase.ToInt64():X}).");

        var vogClient = game.Rebase(GameOffsets.VogClientBaseRva);
        var func = game.Rebase(GameOffsets.RefreshAllOpenUiRva);

        Console.WriteLine($"  calling RefreshAllOpenUi(VOGClient=0x{vogClient.ToInt64():X}) @ 0x{func.ToInt64():X}...");

        // stdcall: single stack arg (the VOGClient base address), no `this`. The callee cleans the arg,
        // so the thiscall stub (which doesn't clean) is correct; ECX is set but ignored.
        var arg = (int)vogClient.ToInt64();
        var ok = game.TryCallThiscall(func, IntPtr.Zero, new[] { arg }, timeoutMs, out var ret, out var callError);
        if (!ok)
        {
            Console.Error.WriteLine($"Remote call failed: {callError}");
            return 1;
        }

        Console.WriteLine($"  returned 0x{ret:X}. Check the cargo window — if the item now shows, the bug is a missing UI refresh.");
        return 0;
    }
}
