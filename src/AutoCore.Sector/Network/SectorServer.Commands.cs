namespace AutoCore.Sector.Network;

using AutoCore.Utils;
using AutoCore.Utils.Commands;

public partial class SectorServer
{
    private void RegisterCommands()
    {
        CommandProcessor.RegisterCommand("sector.exit", ProcessExitCommand);
    }

    private void ProcessExitCommand(string[] parts)
    {
        var minutes = 0;

        if (parts.Length > 1)
            minutes = int.Parse(parts[1]);

        Timer.Add("exit", minutes * 60000, false, Shutdown);

        Logger.WriteLog(LogType.Command, $"Exiting the server in {minutes} minute(s).");
    }
}
