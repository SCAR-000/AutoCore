namespace AutoCore.Game.Managers;

using AutoCore.Game.Packets.Global;
using AutoCore.Game.Packets.Sector;
using AutoCore.Game.TNL;
using AutoCore.Utils.Memory;

public class ChatManager : Singleton<ChatManager>
{
    public void HandleChat(TNLConnection connection, BinaryReader reader)
    {
        // TODO: load packet then send it back to the sender
        // TODO: later: handle chat commands and send the chat packet to the proper recipient(s)
    }

    public void HandleBroadcast(TNLConnection connection, BinaryReader reader)
    {
        // TODO: load packet then send it back to the sender
        // TODO: later: handle chat commands and send the chat packet to the proper recipient(s)
    }
}
