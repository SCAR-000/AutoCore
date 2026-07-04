namespace AutoCore.Sector.Config;

using AutoCore.Utils;

public class SectorConfig
{
    public GameConfig GameConfig { get; set; } = new();
    public string CharDatabaseConnectionString { get; set; } = string.Empty;
    public string WorldDatabaseConnectionString { get; set; } = string.Empty;
    public string GamePath { get; set; } = string.Empty;

    /// <summary>
    /// Loopback-only HTTP port for the debug admin API consumed by AutoCore.DebugTool. Zero disables it.
    /// </summary>
    public int DebugPort { get; set; }

    public Logger.LoggerConfig LoggerConfig { get; set; } = new();
}
