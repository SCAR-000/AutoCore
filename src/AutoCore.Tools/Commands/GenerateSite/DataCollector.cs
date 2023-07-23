namespace AutoCore.Tools.Commands.GenerateSite;

using AutoCore.Database.World;
using AutoCore.Game.Constants;
using AutoCore.Game.Managers;

public class DataCollector
{
    public string GamePath { get; }

    public DataCollector(string gamePath) => GamePath = gamePath;

    public bool Collect(DataContainer container)
    {
        if (!AssetManager.Instance.Initialize(GamePath, ServerType.Both))
        {
            Console.WriteLine($"ERROR: Unable to initialize AssetManager with path {GamePath}!");
            return false;
        }

        WorldContext.InitializeConnectionString("Server=localhost;Port=3306;Database=autocore_world;User=root;Password=;Persist Security Info=False;Character Set=utf8;Connection Timeout=300");

        if (!AssetManager.Instance.LoadAllData())
        {
            Console.WriteLine($"Error wile loading data!");
            return false;
        }

        if (!CollectObjects(container))
        {
            Console.WriteLine($"Error while collecting objects!");
            return false;
        }

        if (!CollectMissions(container))
        {
            Console.WriteLine($"Error while collecting missions!");
            return false;
        }

        if (!CollectSkills(container))
        {
            Console.WriteLine($"Error while collecting skills!");
            return false;
        }

        if (!CollectPrefixes(container))
        {
            Console.WriteLine($"Error while collecting prefxes!");
            return false;
        }

        return true;
    }

    private bool CollectObjects(DataContainer container)
    {
        return true;
    }

    private static bool CollectMissions(DataContainer container)
    {
        foreach (var mission in AssetManager.Instance.GetMissions())
            container.AddMission(mission);

        return true;
    }

    private static bool CollectSkills(DataContainer container)
    {
        foreach (var skill in AssetManager.Instance.GetSkills())
            container.AddSkill(skill);

        return true;
    }

    private bool CollectPrefixes(DataContainer container)
    {
        return true;
    }
}
