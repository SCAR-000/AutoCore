namespace AutoCore.Game.Managers;

using AutoCore.Game.Constants;
using AutoCore.Game.Entities;
using AutoCore.Game.Packets.Global;
using AutoCore.Game.Packets.Sector;
using AutoCore.Game.TNL;
using AutoCore.Utils;
using AutoCore.Utils.Memory;
using System.Text;

public class ChatManager : Singleton<ChatManager>
{
    private const int ItemsPageSize = 20;
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

                    var createPacket = CreateItemPacket(item);
                    if (createPacket is not null)
                    {
                        item.WriteToPacket(createPacket);

                        connection.SendGamePacket(createPacket);

                        // Track the spawned world item so an incoming ItemPickup can resolve the
                        // coid back to this object and move it into the player's cargo.
                        character.Map.RegisterWorldItem(item);
                    }
                }
                break;

            case "/addItem":
                if (parts.Length < 2)
                {
                    respPacket.Message = "Invalid addItem command! Specify a cbid!";
                    break;
                }

                if (!int.TryParse(parts[1], out var addItemCbid))
                {
                    respPacket.Message = "Invalid addItem command! CBID must be a number.";
                    break;
                }

                if (!TryGiveItemByCbid(connection, character, addItemCbid, out var addItemError))
                {
                    respPacket.Message = addItemError;
                    break;
                }
                break;

            case "/items":
                var itemsPage = 1;
                if (parts.Length >= 2)
                {
                    if (!int.TryParse(parts[1], out itemsPage))
                    {
                        respPacket.Message = "Invalid items command! Page must be a number.";
                        break;
                    }
                }

                if (itemsPage < 1)
                {
                    respPacket.Message = "Invalid items command! Page must be at least 1.";
                    break;
                }

                respPacket.Message = BuildItemsPageMessage(itemsPage);
                break;

            default:
                Logger.WriteLog(LogType.Debug, $"Unhandled chat command: {parts[0]}");
                break;
        }

        respPacket.MessageLength = (short)respPacket.Message.Length;

        connection.SendGamePacket(respPacket);
    }

    private static CreateSimpleObjectPacket CreateItemPacket(ClonedObjectBase item)
    {
        return item switch
        {
            Weapon => new CreateWeaponPacket(),
            Armor => new CreateArmorPacket(),
            PowerPlant => new CreatePowerPlantPacket(),
            WheelSet => new CreateWheelSetPacket(),
            SimpleObject => new CreateSimpleObjectPacket(),
            _ => null
        };
    }

    /// <summary>
    /// Validates a CBID, allocates the matching item object and places it into the character's cargo.
    /// Shared by the <c>/addItem</c> chat command and the debug admin API so both paths behave identically.
    /// </summary>
    public bool TryGiveItemByCbid(TNLConnection connection, Character character, int cbid, out string error)
    {
        error = null;

        if (AssetManager.Instance.GetCloneBase(cbid) == null)
        {
            error = $"CBID {cbid} does not exist in the clonebase data.";
            return false;
        }

        if (!AssetManager.Instance.IsInventoryItem(cbid))
        {
            error = $"CBID {cbid} is not an inventory item (likely a world/creature/vehicle object). Use /items to list valid item CBIDs.";
            return false;
        }

        var item = ClonedObjectBase.AllocateNewObjectFromCBID(cbid);
        if (item == null)
        {
            error = $"Unable to create item {cbid}!";
            return false;
        }

        // Cargo items use a GLOBAL coid: the client's cargo list (SVOGInventoryItem.m_coidItem) carries
        // only the 8-byte coid with no global flag, and the character/vehicle are global objects, so a
        // local-coid item likely fails to resolve in the client's object table -> no icon shown.
        item.SetCoid(character.Map.LocalCoidCounter++, true);
        item.LoadCloneBase(cbid);
        item.Faction = character.Faction;

        return GiveItemToCargo(connection, character, item, out error);
    }

    /// <summary>
    /// Places an item object into the character's cargo and notifies the client.
    /// </summary>
    /// <remarks>
    /// The client populates the cargo grid from two server-pushed messages, confirmed by reverse
    /// engineering the retail client (autoassault.exe):
    /// <list type="number">
    /// <item><see cref="CreateSimpleObjectPacket"/> with <c>IsInInventory = true</c> defines the
    /// object and its grid slot. The client's create-object handler reads the inventory flag at
    /// wire offset 0xA2 and skips the 3D world placement, registering the object as an inventory
    /// item instead.</item>
    /// <item><see cref="InventoryCargoSendAllPacket"/> is the bulk slot snapshot that maps each
    /// occupied <c>(X, Y)</c> slot to a coid.</item>
    /// </list>
    /// <para><b>InventoryAddItem (opcode 0x2047) is intentionally NOT sent.</b> In the retail
    /// client that opcode is constructed and sent <i>client to server</i> as a request (e.g. when
    /// the player drags an item into a slot); the client has no receive handler for it and the
    /// matching response opcode (0x2048) is never processed, so pushing it from the server is a
    /// no-op.</para>
    /// </remarks>
    public bool GiveItemToCargo(TNLConnection connection, Character character, ClonedObjectBase item, out string error)
    {
        error = null;

        var slot = character.AddInventoryItem(item.ObjectId.Coid);
        if (slot == null)
        {
            error = "Cargo inventory is full!";
            return false;
        }

        // The item object must exist client-side for the cargo coid to resolve (confirmed: with no
        // CreateSimpleObject the client has no object and CargoSendAll shows nothing, and the client
        // does NOT auto-request item data). So we DO send CreateSimpleObject to create the object — the
        // remaining bug is that it world-places the item instead of marking it as cargo. The IsInInventory
        // bool we write at wire 0xA2 is not routing it to inventory (proved by memory scan: the object
        // gets a 3D world position + spatial-grid entries). Pending the official CreateSimpleObject struct
        // to set the correct inventory field/flag.
        var createPacket = CreateItemPacket(item);
        if (createPacket is null)
        {
            error = $"Unable to create packet for item {item.CBID}!";
            return false;
        }

        item.WriteToPacket(createPacket);
        createPacket.IsInInventory = true;
        createPacket.InventoryPositionX = slot.Value.PositionX;
        createPacket.InventoryPositionY = slot.Value.PositionY;

        Logger.WriteLog(LogType.Debug,
            "GiveItemToCargo: CBID={0} coid={1} (global={2}) slot=({3},{4}) packet={5} IsInInventory={6}",
            item.CBID, item.ObjectId.Coid, item.ObjectId.Global, slot.Value.PositionX, slot.Value.PositionY,
            createPacket.GetType().Name, createPacket.IsInInventory);

        connection.SendGamePacket(createPacket);

        var cargoPacket = new InventoryCargoSendAllPacket();
        character.FillCargoInventoryPacket(cargoPacket);
        connection.SendGamePacket(cargoPacket);
        Logger.WriteLog(LogType.Debug, "GiveItemToCargo: sent {0} + InventoryCargoSendAll (InventorySize={1})", createPacket.GetType().Name, cargoPacket.InventorySize);

        return true;
    }

    private static string BuildItemsPageMessage(int page)
    {
        var items = AssetManager.Instance.GetItemCloneBases();
        if (items.Count == 0)
            return "No items loaded from clonebase.wad.";

        var totalPages = (items.Count + ItemsPageSize - 1) / ItemsPageSize;
        if (page > totalPages)
            page = totalPages;

        var start = (page - 1) * ItemsPageSize;
        var end = Math.Min(start + ItemsPageSize, items.Count);

        var message = new StringBuilder();
        message.Append($"Items page {page}/{totalPages} ({items.Count} total):");
        for (var i = start; i < end; ++i)
        {
            var item = items[i];
            message.Append('\n');
            message.Append(item.Cbid);
            message.Append(' ');
            message.Append(item.InvSizeX);
            message.Append('x');
            message.Append(item.InvSizeY);
            message.Append(' ');
            message.Append(item.Name);
        }

        return message.ToString();
    }
}
