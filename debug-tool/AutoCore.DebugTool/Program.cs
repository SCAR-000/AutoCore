using AutoCore.DebugTool.Cli;
using AutoCore.DebugTool.Commands;

// AutoCore.DebugTool — CLIENT-ONLY debug harness for autoassault.exe.
// It attaches to the live game process and calls the client's own routines / reads its memory so we
// can verify client behaviour in isolation. It does NOT talk to the server in any way.

if (args.Length == 0)
{
    PrintUsage();
    return 1;
}

var command = args[0].ToLowerInvariant();

switch (command)
{
    case "createitem":
        return CreateItemCommand.Run(new CliOptions(args.Skip(1)));

    case "scancoid":
        return ScanCoidCommand.Run(new CliOptions(args.Skip(1)));

    case "refreshui":
        return RefreshUiCommand.Run(new CliOptions(args.Skip(1)));

    case "-h":
    case "--help":
    case "help":
        PrintUsage();
        return 0;

    default:
        Console.Error.WriteLine($"Unknown command '{command}'.");
        PrintUsage();
        return 1;
}

static void PrintUsage()
{
    Console.WriteLine("AutoCore.DebugTool — client-only harness (attaches to autoassault.exe, never the server)");
    Console.WriteLine();
    Console.WriteLine("Commands:");
    Console.WriteLine("  createitem --cbid <id> [--qty N] [--dry-run]");
    Console.WriteLine("        Call the client's own item-spawn routine in-process to add an item to cargo.");
    Console.WriteLine("        --dry-run resolves the player pointer chain without injecting/calling.");
    Console.WriteLine("  scancoid --coid <value>");
    Console.WriteLine("        Scan client memory for a coid (the value the server logs on /addItem) to");
    Console.WriteLine("        find where the client stored the item.");
    Console.WriteLine();
    Console.WriteLine("Common options:");
    Console.WriteLine("  --pid <pid>        Target a specific autoassault.exe PID (default: first match)");
    Console.WriteLine("  --timeout-ms <ms>  Remote-call timeout (default 5000)");
    Console.WriteLine();
    Console.WriteLine("Run from an elevated (Administrator) terminal so it can open the game process.");
}
