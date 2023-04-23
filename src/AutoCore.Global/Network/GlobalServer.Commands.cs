namespace AutoCore.Global.Network;

using AutoCore.Utils;
using AutoCore.Utils.Commands;

public partial class GlobalServer
{
    private void RegisterCommands()
    {
        CommandProcessor.RegisterCommand("global.exit", ProcessExitCommand);
    }

    private void ProcessExitCommand(string[] parts)
    {
        var minutes = 0;

        if (parts.Length > 1)
            minutes = int.Parse(parts[1]);

        Timer.Add("exit", minutes * 60000, false, Shutdown);

        Logger.WriteLog(LogType.Command, $"Exiting the server in {minutes} minute(s).");
    }

    /*private void ProcessRestartCommand(string[] parts)
    {
        // TODO: delayed restart, with contacting globals, so they can warn players not to leave the server, or they won't be able to reconnect
    }

    private void ProcessShutdownCommand(string[] parts)
    {
        // TODO: delayed shutdown, with contacting globals, so they can warn players not to leave the server, or they won't be able to reconnect
        // TODO: add timer to report the remaining time until shutdown?
        // TODO: add timer to contact global servers to tell them periodically that we're getting shut down?
    }*/
}
