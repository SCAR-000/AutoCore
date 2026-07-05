namespace AutoCore.Game.Managers;

using AutoCore.Database.World.Models;
using AutoCore.Game.CloneBases;
using AutoCore.Game.Constants;
using AutoCore.Game.Managers.Asset;
using AutoCore.Game.Map;
using AutoCore.Game.Structures;
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

    // Loads ONLY clonebase.wad (no GLMs, no world DB, no map data). Lets standalone
    // tooling resolve CBID -> CloneBase without a MySQL connection.
    public bool LoadCloneBasesOnly()
    {
        return WADLoader.Load(Path.Combine(GamePath, "clonebase.wad"));
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

    private List<ItemCloneBaseEntry> _sortedItemCloneBases;

    public IReadOnlyList<ItemCloneBaseEntry> GetItemCloneBases()
    {
        _sortedItemCloneBases ??= WADLoader.CloneBases.Values
            .Where(IsInventoryItemCloneBase)
            .Select(cb =>
            {
                var cloneBaseObject = (CloneBaseObject)cb;
                var inventory = cloneBaseObject.SimpleObjectSpecific;
                return new ItemCloneBaseEntry(
                    cb.CloneBaseSpecific.CloneBaseId,
                    GetItemDisplayName(cb),
                    cb.Type,
                    inventory.InvSizeX,
                    inventory.InvSizeY);
            })
            .OrderBy(entry => entry.Cbid)
            .ToList();

        return _sortedItemCloneBases;
    }

    public bool IsInventoryItem(int cbid)
    {
        var cloneBase = GetCloneBase(cbid);
        return cloneBase != null && IsInventoryItemCloneBase(cloneBase);
    }

    private static bool IsInventoryItemCloneBase(CloneBase cloneBase)
    {
        if (cloneBase is not CloneBaseObject cloneBaseObject)
            return false;

        var inventory = cloneBaseObject.SimpleObjectSpecific;
        if (inventory.InvSizeX == 0 || inventory.InvSizeY == 0)
            return false;

        return cloneBase.Type switch
        {
            CloneBaseObjectType.Item or
            CloneBaseObjectType.Gadget or
            CloneBaseObjectType.PowerPlant or
            CloneBaseObjectType.Weapon or
            CloneBaseObjectType.WheelSet or
            CloneBaseObjectType.Commodity or
            CloneBaseObjectType.Armor or
            CloneBaseObjectType.TinkeringKit => true,
            _ => false
        };
    }

    private static string GetItemDisplayName(CloneBase cloneBase)
    {
        var name = cloneBase.CloneBaseSpecific.UniqueName;
        if (!string.IsNullOrWhiteSpace(name))
            return name.Trim();

        name = cloneBase.CloneBaseSpecific.ShortDesc;
        if (!string.IsNullOrWhiteSpace(name))
            return name.Trim();

        return cloneBase.Type.ToString();
    }
    #endregion

    #region GLM
    public BinaryReader GetFileReaderFromGLMs(string fileName) => GLMLoader.GetReader(fileName);
    public MemoryStream GetFileStreamFromGLMs(string fileName) => GLMLoader.GetStream(fileName);
    public bool HasFileInGLMs(string fileName) => GLMLoader.CanGetReader(fileName);
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

    public IEnumerable<CloneBase> GetCloneBasesByType(CloneBaseObjectType type)
    {
        return WADLoader.CloneBases.Values.Where(cb => cb.Type == type);
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
    #endregion
}
