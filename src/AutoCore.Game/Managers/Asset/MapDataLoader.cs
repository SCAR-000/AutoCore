using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace AutoCore.Game.Managers.Asset
{
    using Utils;

    public class MapDataLoader
    {
        public Dictionary<uint, string> MapData { get; } = new();

        public bool Load()
        {
            return true;
        }
    }
}
