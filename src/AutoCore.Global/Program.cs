using System.Diagnostics;

namespace AutoCore.Global;

using AutoCore.Database.Char;
using AutoCore.Database.World;
using AutoCore.Game.Constants;
using AutoCore.Game.Managers;
using AutoCore.Global.Config;
using AutoCore.Global.Network;
using AutoCore.Utils;
using Microsoft.Extensions.Configuration;

public class Program : ExitableProgram
{
    private static GlobalServer Server { get; } = new();

    public static void Main()
    {
        Initialize(ExitHandlerProc);

        var builder = new ConfigurationBuilder()
            .AddJsonFile("appsettings.global.json")
            .AddJsonFile("appsettings.global.env.json", true);

        var config = new GlobalConfig();
        var configRoot = builder.Build();
        configRoot.Bind(config);

        CharContext.InitializeConnectionString(config.CharDatabaseConnectionString);
        WorldContext.InitializeConnectionString(config.WorldDatabaseConnectionString);

        Server.InitConsole();
        Server.Setup(config);

        if (!AssetManager.Instance.Initialize(config.GamePath, ServerType.Global))
            throw new Exception("Unable to load assets!");

        if (!MapManager.Instance.Initialize())
            throw new Exception("Unable to load maps!");

        AssetManager.Instance.LoadAllData();

        if (!Server.Start())
        {
            Logger.WriteLog(LogType.Error, "Unable to start the server!");

            return;
        }

        Server.ProcessCommands();

        GC.Collect();

        Process.GetCurrentProcess().WaitForExit();
    }

    private static bool ExitHandlerProc(byte sig)
    {
        Logger.WriteLog(LogType.Error, "Shutting down the server...");

        Server.Shutdown();

        Logger.WriteLog(LogType.Error, "Server shutdown completed!");

        Logger.WriteLog(LogType.Error, "Press any key to exit...");

        return false;
    }
}
