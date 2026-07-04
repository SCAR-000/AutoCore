namespace AutoCore.Sector.Network;

using AutoCore.Game.Constants;
using AutoCore.Game.Managers;
using AutoCore.Game.TNL;
using AutoCore.Sector.Config;
using AutoCore.Utils;
using AutoCore.Utils.Server;
using AutoCore.Utils.Threading;
using AutoCore.Utils.Timer;
using System.Collections.Concurrent;
using System.Net;

public partial class SectorServer : BaseServer, ILoopable
{
    public const int MainLoopTime = 100; // Milliseconds

    public SectorConfig Config { get; private set; } = new();
    public IPAddress PublicAddress { get; private set; }
    public MainLoop Loop { get; }
    public Timer Timer { get; } = new();
    public override bool IsRunning => Loop != null && Loop.Running;
    public TNLInterface Interface { get; private set; }
    private readonly object _interfaceLock = new();

    private DebugApiServer _debugApi;

    private readonly ConcurrentQueue<Action> _mainThreadActions = new();

    /// <summary>
    /// Queues an action to run on the game loop thread. Used by the debug admin API (which runs on its
    /// own HTTP thread) so that touching game state and sending packets never races the main loop.
    /// </summary>
    public void EnqueueOnMainLoop(Action action) => _mainThreadActions.Enqueue(action);

    public SectorServer()
        : base("Sector")
    {
        Loop = new MainLoop(this, MainLoopTime);

        RegisterCommands();
    }

    public void Setup(SectorConfig config)
    {
        Logger.WriteLog(LogType.Initialize, "Setting up the Sector server...");

        if (config != null)
            Config = config;

        Logger.WriteLog(LogType.Initialize, "Initializing the TNL interface...");
        Interface = new TNLInterface(Config.GameConfig.Port, true);

        Logger.WriteLog(LogType.Initialize, "Initializing the network...");
        PublicAddress = IPAddress.Parse(Config.GameConfig.PublicAddress);

        Logger.WriteLog(LogType.Initialize, "The Sector server has been setup!");
    }

    public void MainLoop(long delta)
    {
        Timer.Update(delta);

        while (_mainThreadActions.TryDequeue(out var action))
        {
            try
            {
                action();
            }
            catch (Exception ex)
            {
                Logger.WriteLog(LogType.Error, "Queued main-loop action threw: {0}", ex);
            }
        }

        if (Interface == null)
            return;

        lock (_interfaceLock)
        {
            if (Interface == null)
                return;

            Interface.Pulse();
        }
    }

    public bool Start()
    {
        // If no config file has been found, these values are 0 by default
        if (Config.GameConfig.Port == 0)
        {
            Logger.WriteLog(LogType.Error, "Invalid config values!");
            return false;
        }

        Loop.Start();

        Logger.WriteLog(LogType.Network, "*** Listening for clients on port {0}", Config.GameConfig.Port);

        if (Config.DebugPort > 0)
        {
            _debugApi = new DebugApiServer(this, Config.DebugPort);
            _debugApi.Start();
        }

        return true;
    }

    public void Shutdown()
    {
        Logger.WriteLog(LogType.None, "Shutting down the server...");

        _debugApi?.Stop();
        _debugApi = null;

        lock (_interfaceLock)
        {
            Interface.Close();
            Interface = null;
        }

        Loop.Stop();

        Logger.WriteLog(LogType.None, "The server was shut down!");
    }
}
