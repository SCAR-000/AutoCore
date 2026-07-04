namespace AutoCore.DebugTool.Commands;

using AutoCore.DebugTool.Cli;
using AutoCore.DebugTool.Memory;

/// <summary>
/// Scans the live client's memory for a specific coid (8-byte value). After the server adds an item,
/// this reveals where (if anywhere) the client actually stored it — which pinpoints whether the
/// CreateSimpleObject registered the object and whether CargoSendAll placed it in the cargo grid.
/// </summary>
public static class ScanCoidCommand
{
    public static int Run(CliOptions options)
    {
        var coid = options.GetIntOrNull("coid") is { } c ? (long)c : ParseLong(options.GetString("coid", ""));
        if (coid is null)
        {
            Console.Error.WriteLine("Missing/invalid --coid <value> (decimal coid the server logged).");
            return 1;
        }

        var pid = options.GetIntOrNull("pid");

        using var game = GameProcess.Open("autoassault", pid, out var error);
        if (game is null)
        {
            Console.Error.WriteLine($"Could not open the game: {error}");
            return 1;
        }

        Console.WriteLine($"Attached to {game.ProcessName} (pid {game.ProcessId}, base 0x{game.ModuleBase.ToInt64():X}).");
        Console.WriteLine($"Scanning for coid {coid} (0x{coid:X})...");

        var hits = game.ScanForInt64(coid.Value);

        if (hits.Count == 0)
        {
            Console.WriteLine("No occurrences found. The client never stored this coid → the server's");
            Console.WriteLine("CreateSimpleObject/CargoSendAll did not register the item at all (delivery/scoping issue).");
            return 0;
        }

        Console.WriteLine($"Found {hits.Count} occurrence(s):");
        const long textLo = 0x00400000, textHi = 0x00B00000; // module .text/.rdata range (vtables/code)

        foreach (var hit in hits)
        {
            Console.WriteLine($"  0x{hit.ToInt64():X}");

            // Hypothesis A: hit is an object's coid field (+0x160). Then base = hit-0x160 and [base] is a vtable.
            if (game.TryReadPointer((IntPtr)(hit.ToInt64() - 0x160), out var maybeVtable)
                && maybeVtable.ToInt64() is var vt && vt >= textLo && vt < textHi)
            {
                Console.WriteLine($"      -> looks like an OBJECT (base 0x{hit.ToInt64() - 0x160:X}, vtable 0x{vt:X})");
            }

            // Dump surrounding dwords so structure (grid width/capacity, neighbouring coids) is visible.
            if (game.TryReadBytes((IntPtr)(hit.ToInt64() - 0x10), 0x30, out var ctx))
            {
                var sb = new System.Text.StringBuilder("      ctx[-0x10..+0x20]:");
                for (var i = 0; i < ctx.Length; i += 4)
                    sb.Append(' ').Append(BitConverter.ToUInt32(ctx, i).ToString("X8"));
                Console.WriteLine(sb.ToString());
            }
        }

        Console.WriteLine();
        Console.WriteLine("OBJECT = the item exists. A grid container shows small width/capacity dwords nearby.");
        return 0;
    }

    private static long? ParseLong(string s) => long.TryParse(s, out var v) ? v : null;
}
