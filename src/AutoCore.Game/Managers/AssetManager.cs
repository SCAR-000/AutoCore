namespace AutoCore.Game.Managers;

using AutoCore.Database.World.Models;
using AutoCore.Game.CloneBases;
using AutoCore.Game.Constants;
using AutoCore.Game.Managers.Asset;
using AutoCore.Game.Map;
using AutoCore.Utils;
using AutoCore.Utils.Memory;

public class AssetManager : Singleton<AssetManager>
{
    private bool DataLoaded { get; set; }
    private WADLoader WADLoader { get; } = new();
    private GLMLoader GLMLoader { get; } = new();
    private MapDataLoader MapDataLoader { get; } = new();
    private WorldDBLoader WorldDBLoader { get; } = new();

    public string GamePath { get; private set; }
    public ServerType ServerType { get; private set; }

    #region Initialize
    public bool Initialize(string gamePath, ServerType serverType)
    {
        Logger.WriteLog(LogType.Initialize, $"Initializing Asset Manager for {serverType}...");

        GamePath = gamePath;
        ServerType = serverType;

        if (!Directory.Exists(GamePath) || !File.Exists(Path.Combine(GamePath, "exe", "autoassault.exe")))
        {
            Logger.WriteLog(LogType.Error, "Invalid GamePath is set in the config!");
            return false;
        }

        return true;
    }

    public bool LoadAllData()
    {
        if (DataLoaded)
            return false;

        var loadWadTask = Task<bool>.Factory.StartNew(() =>
        {
            return WADLoader.Load(Path.Combine(GamePath, "clonebase.wad"));
        });

        var loadGLMTask = Task<bool>.Factory.StartNew(() =>
        {
            return GLMLoader.Load(GamePath);
        });

        var loadWorldDBTask = loadGLMTask.ContinueWith((prevTask) =>
        {
            if (!prevTask.Result)
                return false;

            return WorldDBLoader.Load();
        });

        var loadMapDataTask = Task.WhenAll(loadGLMTask, loadWorldDBTask).ContinueWith((previousValues) =>
        {
            if (previousValues.Result.Any(r => !r))
                return false;

            return MapDataLoader.Load();
        });

        Task.WaitAll(loadWadTask, loadGLMTask, loadWorldDBTask, loadMapDataTask);

        if (!loadWadTask.Result || !loadGLMTask.Result || !loadWorldDBTask.Result || !loadMapDataTask.Result)
            return false;

        DataLoaded = true;

        Logger.WriteLog(LogType.Initialize, "Asset Manager has loaded all data!");

        return true;
    }

    /// <summary>
    /// Loads only `clonebase.wad` and all `.glm` archives, without requiring any DB connections.
    /// Intended for offline tooling / reports.
    /// </summary>
    public bool LoadWadAndGlmOnly()
    {
        var loadWadTask = Task<bool>.Factory.StartNew(() =>
        {
            return WADLoader.Load(Path.Combine(GamePath, "clonebase.wad"));
        });

        var loadGLMTask = Task<bool>.Factory.StartNew(() =>
        {
            return GLMLoader.Load(GamePath);
        });

        Task.WaitAll(loadWadTask, loadGLMTask);

        return loadWadTask.Result && loadGLMTask.Result;
    }
    #endregion

    #region WAD
    public CloneBase GetCloneBase(int CBID)
    {
        if (WADLoader.CloneBases.TryGetValue(CBID, out CloneBase value))
            return value;

        return null;
    }

    public T GetCloneBase<T>(int CBID) where T : CloneBase
    {
        return GetCloneBase(CBID) as T;
    }

    // Used by LootManager to build the generatable-item index.
    public IReadOnlyDictionary<int, CloneBase> GetAllCloneBases()
        => WADLoader.CloneBases;
    #endregion

    #region GLM
    public BinaryReader GetFileReaderFromGLMs(string fileName) => GLMLoader.GetReader(fileName);
    public MemoryStream GetFileStreamFromGLMs(string fileName) => GLMLoader.GetStream(fileName);
    public bool HasFileInGLMs(string fileName) => GLMLoader.CanGetReader(fileName);
    public IReadOnlyCollection<string> ListGlmFiles() => GLMLoader.ListFileNames();
    #endregion

    #region WorldDB

    public ContinentObject GetContinentObject(int continentObjectId)
    {
        if (WorldDBLoader.ContinentObjects.TryGetValue(continentObjectId, out var result))
            return result;

        return null;
    }

    public IEnumerable<ContinentObject> GetContinentObjects()
    {
        return WorldDBLoader.ContinentObjects.Values;
    }

    /// <summary>
    /// Looks up a continent object directly from wad.xml, bypassing the filter.
    /// Used for error messages when a map transfer fails because the map file is missing.
    /// </summary>
    public ContinentObject GetContinentObjectFromWad(int continentObjectId)
    {
        try
        {
            var wadXmlPath = Path.Combine(GamePath, "wad.xml");
            if (!File.Exists(wadXmlPath))
                return null;

            var allContinents = WadXmlWorldDataLoader.LoadContinentObjects(wadXmlPath);
            if (allContinents.TryGetValue(continentObjectId, out var result))
                return result;
        }
        catch
        {
            // Ignore errors - this is just for diagnostics
        }
        return null;
    }

    public MapData GetMapData(int mapId)
    {
        if (MapDataLoader.MapDatas.TryGetValue(mapId, out var result))
            return result;

        return null;
    }

    public ConfigNewCharacter GetConfigNewCharacterFor(byte characterRace, byte characterClass)
    {
        if (ServerType != ServerType.Global && ServerType != ServerType.Both)
            throw new Exception("Invalid server type!");

        if (WorldDBLoader.ConfigNewCharacters.TryGetValue(Tuple.Create(characterRace, characterClass), out var result))
            return result;

        return null;
    }

    public LootTable GetLootTable(int lootTableId)
    {
        if (WorldDBLoader.LootTables == null)
            return null;

        if (WorldDBLoader.LootTables.TryGetValue(lootTableId, out var result))
            return result;

        return null;
    }

    public IEnumerable<LootTable> GetAllLootTables()
    {
        if (WorldDBLoader.LootTables == null)
            return Enumerable.Empty<LootTable>();

        return WorldDBLoader.LootTables.Values;
    }

    public ExperienceLevel GetExperienceLevel(byte level)
    {
        if (WorldDBLoader.ExperienceLevels == null)
            return null;

        if (WorldDBLoader.ExperienceLevels.TryGetValue(level, out var result))
            return result;

        return null;
    }

    /// <summary>
    /// Gets the XP awarded for killing a creature of the specified level.
    /// Returns 0 if the creature level is not found in the table.
    /// </summary>
    public uint GetCreatureKillXP(byte creatureLevel)
    {
        if (WorldDBLoader.CreatureExperienceLevels == null)
            return 0;

        if (WorldDBLoader.CreatureExperienceLevels.TryGetValue(creatureLevel, out var xp))
            return xp;

        return 0;
    }
    #endregion
}
