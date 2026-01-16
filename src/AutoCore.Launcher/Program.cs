using System.Diagnostics;

using Microsoft.Extensions.Configuration;

namespace AutoCore.Sector;

using AutoCore.Auth.Config;
using AutoCore.Auth.Network;
using AutoCore.Database.Auth;
using AutoCore.Database.Char;
using AutoCore.Database.World;
using AutoCore.Game.Constants;
using AutoCore.Game.Managers;
using AutoCore.Global.Config;
using AutoCore.Global.Network;
using AutoCore.Sector.Config;
using AutoCore.Sector.Network;
using AutoCore.Utils;
using AutoCore.Utils.Server;

public class Program : ExitableProgram
{
    private static AuthServer AuthServer { get; } = new();
    private static GlobalServer GlobalServer { get; } = new();
    private static SectorServer SectorServer { get; } = new();

    public static void Main()
    {
        Initialize(ExitHandlerProc);

        var authConfig = GetAuthConfig();
        var globalConfig = GetGlobalConfig();
        var sectorConfig = GetSectorConfig();

        AuthContext.InitializeConnectionString(authConfig.AuthDatabaseConnectionString);
        CharContext.InitializeConnectionString(globalConfig.CharDatabaseConnectionString);
        WorldContext.InitializeConnectionString(globalConfig.WorldDatabaseConnectionString);

        if (!AssetManager.Instance.Initialize(globalConfig.GamePath, ServerType.Both))
            throw new Exception("Unable to load assets!");

        AssetManager.Instance.LoadAllData();

        // Initialize the loot manager (builds item index from CloneBase data)
        AutoCore.Game.Managers.LootManager.Instance.Initialize();

        if (!MapManager.Instance.Initialize())
            throw new Exception("Unable to load maps!");

        AuthServer.Setup(authConfig);
        if (!AuthServer.Start())
        {
            Logger.WriteLog(LogType.Error, "Unable to start the Auth server!");

            return;
        }

        GlobalServer.Setup(globalConfig);
        if (!GlobalServer.Start())
        {
            Logger.WriteLog(LogType.Error, "Unable to start the Global server!");

            return;
        }

        SectorServer.Setup(sectorConfig);
        if (!SectorServer.Start())
        {
            Logger.WriteLog(LogType.Error, "Unable to start the Sector server!");

            return;
        }

        AuthServer.ProcessCommands();

        GC.Collect();

        Process.GetCurrentProcess().WaitForExit();
    }

    private static AuthConfig GetAuthConfig()
    {
        var builder = new ConfigurationBuilder()
            .AddJsonFile("appsettings.auth.json")
            .AddJsonFile("appsettings.auth.env.json", true);

        var config = new AuthConfig();
        var configRoot = builder.Build();
        configRoot.Bind(config);

        return config;
    }

    private static GlobalConfig GetGlobalConfig()
    {
        var builder = new ConfigurationBuilder()
            .AddJsonFile("appsettings.global.json")
            .AddJsonFile("appsettings.global.env.json", true);

        var config = new GlobalConfig();
        var configRoot = builder.Build();
        configRoot.Bind(config);

        return config;
    }

    private static SectorConfig GetSectorConfig()
    {
        var builder = new ConfigurationBuilder()
            .AddJsonFile("appsettings.sector.json")
            .AddJsonFile("appsettings.sector.env.json", true);

        var config = new SectorConfig();
        var configRoot = builder.Build();
        configRoot.Bind(config);

        return config;
    }

    private static bool ExitHandlerProc(byte sig)
    {
        Logger.WriteLog(LogType.Error, "Shutting down the servers...");

        SectorServer.Shutdown();
        GlobalServer.Shutdown();
        AuthServer.Shutdown();

        Logger.WriteLog(LogType.Error, "Server shutdowns completed!");

        Logger.WriteLog(LogType.Error, "Press any key to exit...");

        return false;
    }
}
