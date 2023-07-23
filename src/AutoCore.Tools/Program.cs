using AutoCore.Tools.Commands;

if (args.Length < 1)
{
    Console.WriteLine("Not enouh arguments!");
    return;
}

BaseCommand? command = null;

switch (args[0])
{
    case "gen-site":
        command = new GenerateSiteCommand(args[1..]);
        break;

    default:
        Console.WriteLine($"Unknown command: {args[0]}");
        break;
}

if (command is null)
    return;

if (!command.Execute())
    Console.WriteLine("Executing the command failed!");
