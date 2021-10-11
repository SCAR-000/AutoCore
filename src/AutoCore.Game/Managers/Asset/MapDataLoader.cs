using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace AutoCore.Game.Managers.Asset
{
    using Map;
    using Utils;

    public class MapDataLoader
    {
        public Dictionary<int, MapData> MapDatas { get; } = new();

        public bool Load()
        {
            foreach (var id in AssetManager.Instance.GetContinetObjectIds())
            {
                var continentObject = AssetManager.Instance.GetContinentObject(id);
                if (continentObject == null)
                    return false;

                var reader = AssetManager.Instance.GetFileReader($"{continentObject.MapFileName}.fam");

                var mapData = new MapData(continentObject);
                mapData.Read(reader);

                MapDatas.Add(continentObject.Id, mapData);
            }

            return true;
        }
    }
}
