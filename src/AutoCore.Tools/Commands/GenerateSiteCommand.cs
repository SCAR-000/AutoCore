using AutoCore.Tools.Commands.GenerateSite;

namespace AutoCore.Tools.Commands;

public class GenerateSiteCommand : BaseCommand
{
    public string GamePath => Arguments?.Length >= 1 ? Arguments[0] : string.Empty;
    public string OutputPath => Arguments?.Length >= 2 ? Arguments[1] : string.Empty;

    public GenerateSiteCommand(string[] arguments)
        : base(arguments)
    {
        if (arguments.Length < 2)
            throw new Exception($"Not enough arguments! Expected: gen-site <game base path> <output path>");
    }

    public override bool Execute()
    {
        var container = new DataContainer();
        var collector = new DataCollector(GamePath);

        if (!collector.Collect(container))
        {
            Console.WriteLine();
            return false;
        }

        if (!SiteGenerator.Generate(OutputPath, container))
        {
            Console.WriteLine("Error while generating the site!");
            return false;
        }

        return true;
    }
}
