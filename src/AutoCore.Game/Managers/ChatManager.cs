namespace AutoCore.Game.Managers;

using AutoCore.Game.Constants;
using AutoCore.Game.Entities;
using AutoCore.Game.Packets.Global;
using AutoCore.Game.Packets.Sector;
using AutoCore.Game.TNL;
using AutoCore.Utils;
using AutoCore.Utils.Memory;

public class ChatManager : Singleton<ChatManager>
{
    public void HandleChatPacket(TNLConnection connection, BinaryReader reader)
    {
        var packet = new ChatPacket();
        packet.Read(reader);

        if (packet.Message.StartsWith('/'))
        {
            HandleChatCommand(connection, packet.Message);
            return;
        }

        switch (packet.ChatType)
        {
            case ChatType.ConvoyMessage:
                ConvoyManager.Instance.BroadcastPacket(connection.CurrentCharacter, packet);
                break;

            case ChatType.ClanMessage:
                ClanManager.Instance.BroadcastPacket(connection.CurrentCharacter, packet);
                break;

            case ChatType.PrivateMessage:
                var target = ObjectManager.Instance.GetCharacterByName(packet.PrivateRecipientName);
                if (target == null)
                    break;

                connection.SendGamePacket(packet);
                target.OwningConnection.SendGamePacket(packet);
                break;

            default:
                Logger.WriteLog(LogType.Error, $"Unhandled ChatType {packet.ChatType} in HandleChat!");
                break;
        }

        // TODO: later: handle chat commands and send the chat packet to the proper recipient(s)
    }

    public void HandleBroadcastPacket(TNLConnection connection, BinaryReader reader)
    {
        var packet = new BroadcastPacket();
        packet.Read(reader);

        if (packet.Message.StartsWith('/'))
        {
            HandleChatCommand(connection, packet.Message);
            return;
        }

        connection.SendGamePacket(packet);

        // TODO: later: handle chat commands and send the chat packet to the proper recipient(s)
    }

    private void HandleChatCommand(TNLConnection connection, string command)
    {
        Logger.WriteLog(LogType.Debug, $"Conn {connection.Account.Name} sent chat command: {command}");

        var parts = command.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        var respPacket = new BroadcastPacket
        {
            IsGM = false,
            Sender = "System",
            ChatType = ChatType.SystemMessage,
            Message = ""
        };

        var character = connection.CurrentCharacter;

        switch (parts[0])
        {
            case "/loot":
                if (parts.Length < 2)
                {
                    respPacket.Message = $"Invalid loot command! Specify a cbid!";
                    break;
                }

                if (int.TryParse(parts[1], out var cbid))
                {
                    var item = ClonedObjectBase.AllocateNewObjectFromCBID(cbid);
                    if (item == null)
                    {
                        respPacket.Message = $"Unable to create item {cbid}!";
                        break;
                    }

                    item.SetCoid(character.Map.LocalCoidCounter++, false);
                    item.LoadCloneBase(cbid);
                    item.Faction = character.Faction;
                    item.Position = character.CurrentVehicle.Position;
                    item.Rotation = character.CurrentVehicle.Rotation;

                    CreateSimpleObjectPacket createPacket;
                    switch (item)
                    {
                        case WheelSet:
                            createPacket = new CreateWheelSetPacket();
                            break;

                        default:
                            createPacket = null;
                            break;
                    }

                    if (createPacket is not null)
                    {
                        item.WriteToPacket(createPacket);

                        connection.SendGamePacket(createPacket);
                    }
                }
                break;

            default:
                Logger.WriteLog(LogType.Debug, $"Unhandled chat command: {parts[0]}");
                break;
        }

        respPacket.MessageLength = (short)respPacket.Message.Length;

        connection.SendGamePacket(respPacket);
    }
}
