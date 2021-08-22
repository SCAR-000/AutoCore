using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace AutoCore.Game.Managers
{
    using Asset;
    using CloneBases;
    using CloneBases.Prefixes;
    using Structures;
    using Utils;
    using Utils.Memory;

    public class AssetManager : Singleton<AssetManager>
    {
        private bool DataLoaded { get; set; }
        private WADLoader WADLoader { get; set; }

        public string GamePath { get; private set; }

        public void Initialize(string gamePath)
        {
            Logger.WriteLog(LogType.Initialize, "Initializing Asset Manager...");

            GamePath = gamePath;
        }

        public bool LoadAllData()
        {
            if (DataLoaded)
                return false;

            if (!LoadWADData())
                return false;

            DataLoaded = true;

            Logger.WriteLog(LogType.Initialize, "Asset Manager has loaded all data!");
            return true;
        }

        private bool LoadWADData()
        {
            var WADLoader = new WADLoader();
            if (!WADLoader.LoadCloneBases(Path.Combine(GamePath, "clonebase.wad")))
                return false;

            return true;
        }

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
    }
}
