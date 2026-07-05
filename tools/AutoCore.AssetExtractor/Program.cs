using AutoCore.AssetExtractor;

string? gamePath   = null;
string? outputPath = null;
string? filter     = null;

for (var i = 0; i < args.Length; i++)
{
    if (args[i] == "--filter" && i + 1 < args.Length)
        filter = args[++i];
    else if (gamePath == null)
        gamePath = args[i];
    else if (outputPath == null)
        outputPath = args[i];
}

if (gamePath == null || outputPath == null)
{
    Console.WriteLine("AutoCore.AssetExtractor — extracts assets from Auto Assault GLM archives");
    Console.WriteLine();
    Console.WriteLine("Usage:");
    Console.WriteLine("  assetextractor <game-path> <output-path> [--filter <pattern>]");
    Console.WriteLine();
    Console.WriteLine("Arguments:");
    Console.WriteLine("  game-path    Path to the Auto Assault install directory (contains *.glm files)");
    Console.WriteLine("  output-path  Directory where assets will be written");
    Console.WriteLine("  --filter     Only extract entries whose name contains <pattern> (case-insensitive).");
    Console.WriteLine("               Supports * and ? wildcards. Without wildcards, acts as substring match.");
    Console.WriteLine();
    Console.WriteLine("Examples:");
    Console.WriteLine(@"  assetextractor ""C:\Program Files (x86)\NetDevil\Auto Assault"" assets");
    Console.WriteLine(@"  assetextractor ""C:\Program Files (x86)\NetDevil\Auto Assault"" assets/buggy --filter ""veh_p_h_r_cha_02_dune-buggy""");
    Console.WriteLine(@"  assetextractor ""C:\Program Files (x86)\NetDevil\Auto Assault"" assets/buggy --filter ""*dune-buggy*""");
    return 1;
}

return AssetExtractor.Run(gamePath: gamePath, outputPath: outputPath, filter: filter);
