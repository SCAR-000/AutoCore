using System;

namespace AutoCore.Game.Managers.Login
{
    internal class GlobalLoginEntry
    {
        public DateTime ExpireTime { get; set; }
        public string Username { get; set; }
        public uint AuthKey { get; set; }
    }
}
