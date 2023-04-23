namespace AutoCore.Sector.Config;

using AutoCore.Utils;

public class SectorConfig
{
    public GameConfig GameConfig { get; set; } = new();
    public string CharDatabaseConnectionString { get; set; } = string.Empty;
    public string WorldDatabaseConnectionString { get; set; } = string.Empty;
    public string GamePath { get; set; } = string.Empty;
    public Logger.LoggerConfig LoggerConfig { get; set; } = new();
}
