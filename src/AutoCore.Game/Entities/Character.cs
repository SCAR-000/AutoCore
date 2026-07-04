using Microsoft.EntityFrameworkCore;

namespace AutoCore.Game.Entities;

using AutoCore.Database.Char;
using AutoCore.Database.Char.Models;
using AutoCore.Game.Map;
using AutoCore.Game.Packets.Sector;
using AutoCore.Game.Structures;
using AutoCore.Game.TNL;
using AutoCore.Game.TNL.Ghost;

public class Character : Creature
{
    #region Properties
    #region Database Character Data
    private CharacterData DBData { get; set; }
    public uint AccountId => DBData.AccountId;
    public string Name => DBData.Name;
    public long ActiveVehicleCoid => DBData.ActiveVehicleCoid;
    public int BodyId => DBData.BodyId;
    public int HeadId => DBData.HeadId;
    public int HeadDetail1 => DBData.HeadDetail1;
    public int HeadDetail2 => DBData.HeadDetail2;
    public int HairId => DBData.HairId;
    public int HelmetId => DBData.HelmetId;
    public int AccessoryId1 => DBData.HeadDetail1;
    public int AccessoryId2 => DBData.HeadDetail2;
    public int EyesId => DBData.EyesId;
    public int MouthId => DBData.MouthId;
    public uint PrimaryColor => DBData.PrimaryColor;
    public uint SecondaryColor => DBData.SecondaryColor;
    public uint EyesColor => DBData.EyesColor;
    public uint HairColor => DBData.HairColor;
    public uint SkinColor => DBData.SkinColor;
    public uint SpecialityColor => DBData.SpecialityColor;
    public float ScaleOffset => DBData.ScaleOffset;
    public int LastTownId => DBData.LastTownId;
    public int LastStationMapId => DBData.LastStationMapId;
    public int LastStationId => DBData.LastStationId;
    public byte Level => DBData.Level;
    #endregion

    #region Database Clan Data
    private ClanMember ClanMemberDBData { get; set; }
    public string ClanName => ClanMemberDBData?.Clan?.Name;
    public int ClanId => ClanMemberDBData?.ClanId ?? -1;
    public int ClanRank => ClanMemberDBData?.Rank ?? -1;
    #endregion

    public byte GMLevel { get; set; }
    public TNLConnection OwningConnection { get; private set; }
    public Vehicle CurrentVehicle { get; private set; }

    public const byte CargoInventorySize = 60;
    private const byte CargoInventoryWidth = 10;

    private readonly List<CargoInventoryEntry> _cargoInventory = [];
    #endregion

    private readonly record struct CargoInventoryEntry(long Coid, byte PositionX, byte PositionY);

    public Character()
    {
    }

    public void SetOwningConnection(TNLConnection owningConnection)
    {
        OwningConnection = owningConnection;
    }

    public override Character GetAsCharacter() => this;
    public override Character GetSuperCharacter(bool includeSummons) => this;

    public override bool LoadFromDB(CharContext context, long coid, bool isInCharacterSelection = false)
    {
        SetCoid(coid, true);

        DBData = context.Characters.Include(c => c.SimpleObjectBase).FirstOrDefault(c => c.Coid == coid);
        if (DBData == null)
            return false;

        LoadCloneBase(DBData.SimpleObjectBase.CBID);

        ClanMemberDBData = context.ClanMembers.Include(cm => cm.Clan).FirstOrDefault(cm => cm.CharacterCoid == coid);

        Position = new(DBData.PositionX, DBData.PositionY, DBData.PositionZ);
        Rotation = new(DBData.RotationX, DBData.RotationY, DBData.RotationZ, DBData.RotationW);

        HP = MaxHP = CloneBaseObject.SimpleObjectSpecific.MaxHitPoint;
        Faction = CloneBaseObject.SimpleObjectSpecific.Faction;
        TeamFaction = CloneBaseObject.SimpleObjectSpecific.Faction;

        // TODO: set up stuff, fields, baseclasses, etc

        return true;
    }

    public bool LoadCurrentVehicle(CharContext context, bool isInCharacterSelection = false)
    {
        CurrentVehicle = new();
        CurrentVehicle.SetOwner(this);

        return CurrentVehicle.LoadFromDB(context, ActiveVehicleCoid, isInCharacterSelection);
    }

    public override void CreateGhost()
    {
        if (Ghost != null)
            return;

        Ghost = new GhostCharacter();
        Ghost.SetParent(this);
    }

    public override void WriteToPacket(CreateSimpleObjectPacket packet)
    {
        base.WriteToPacket(packet);

        if (packet is CreateCharacterPacket charPacket)
        {
            charPacket.CurrentVehicleCoid = DBData.ActiveVehicleCoid;
            charPacket.CurrentTrailerCoid = -1L; // TODO
            charPacket.HeadId = HeadId;
            charPacket.BodyId = BodyId;
            charPacket.AccessoryId1 = DBData.HeadDetail1;
            charPacket.AccessoryId2 = DBData.HeadDetail2;
            charPacket.HairId = DBData.HairId;
            charPacket.MouthId = DBData.MouthId;
            charPacket.EyesId = DBData.EyesId;
            charPacket.HelmetId = DBData.HelmetId;
            charPacket.PrimaryColor = DBData.PrimaryColor;
            charPacket.SecondaryColor = DBData.SecondaryColor;
            charPacket.EyesColor = DBData.EyesColor;
            charPacket.HairColor = DBData.HairColor;
            charPacket.SkinColor = DBData.SkinColor;
            charPacket.SpecialityColor = DBData.SpecialityColor;
            charPacket.LastTownId = DBData.LastTownId;
            charPacket.LastStationMapId = DBData.LastStationMapId;
            charPacket.Level = DBData.Level;
            charPacket.UsingVehicle = Map != null && !Map.MapData.ContinentObject.IsTown;
            charPacket.UsingTrailer = false;
            charPacket.IsPosessingCreature = false;
            charPacket.GMLevel = GMLevel;
            charPacket.ServerTime = Environment.TickCount; // TODO
            charPacket.Name = Name;
            charPacket.ClanName = ClanMemberDBData?.Clan?.Name ?? "";
            charPacket.CharacterScaleOffset = DBData.ScaleOffset;
        }

        if (packet is CreateCharacterExtendedPacket extendedCharPacket)
        {
            extendedCharPacket.NumCompletedQuests = 0;
            extendedCharPacket.NumCurrentQuests = 0;
            extendedCharPacket.NumAchievements = 0;
            extendedCharPacket.NumDisciplines = 0;
            extendedCharPacket.NumSkills = 0;
        }
    }

    public (byte PositionX, byte PositionY)? AddInventoryItem(long coid)
    {
        if (_cargoInventory.Count >= CargoInventorySize)
            return null;

        var index = _cargoInventory.Count;
        var positionX = (byte)(index % CargoInventoryWidth);
        var positionY = (byte)(index / CargoInventoryWidth);

        _cargoInventory.Add(new CargoInventoryEntry(coid, positionX, positionY));

        return (positionX, positionY);
    }

    /// <summary>
    /// Read-only view of the server-side cargo list, used by the debug admin API so the debug tool
    /// can compare what the server believes is in cargo against what it reads from client memory.
    /// </summary>
    public IReadOnlyList<(long Coid, byte PositionX, byte PositionY)> GetCargoSnapshot()
    {
        return _cargoInventory.Select(e => (e.Coid, e.PositionX, e.PositionY)).ToList();
    }

    public void FillCargoInventoryPacket(InventoryCargoSendAllPacket packet)
    {
        // ucInventorySize is the number of populated entries the client reads from the fixed
        // m_vItems array (the grid capacity itself comes from the vehicle's NumInventorySlots).
        // Reporting the capacity here would make the client read empty/garbage trailing entries,
        // so this must be the actual item count.
        var itemCount = Math.Min(_cargoInventory.Count, InventoryCargoSendAllPacket.MaxItems);
        packet.InventorySize = (byte)itemCount;

        for (var i = 0; i < itemCount; ++i)
        {
            var entry = _cargoInventory[i];
            packet.ItemCoids[i] = entry.Coid;
            packet.ItemPositionX[i] = entry.PositionX;
            packet.ItemPositionY[i] = entry.PositionY;
        }
    }

    public void FillVehicleInventoryPacket(CreateVehicleExtendedPacket packet)
    {
        // The client sizes the cargo grid from NumInventorySlots (the bay capacity); without it
        // the client falls back to a small default grid. InventorySize is the count of populated
        // entries, and InventoryCoids is positionally indexed (slot index = Y * width + X).
        packet.NumInventorySlots = CargoInventorySize;
        packet.InventorySize = (ushort)Math.Min(_cargoInventory.Count, packet.InventoryCoids.Length);

        foreach (var entry in _cargoInventory)
        {
            var index = entry.PositionY * CargoInventoryWidth + entry.PositionX;
            if (index >= 0 && index < packet.InventoryCoids.Length)
                packet.InventoryCoids[index] = entry.Coid;
        }
    }

    public void EnterMap(SectorMap map, Vector3? position = null)
    {
        position ??= map.MapData.EntryPoint.ToVector3();

        DBData.LastTownId = map.ContinentId;

        Position = position.Value;
        Rotation = Quaternion.Default;

        DBData.PositionX = Position.X;
        DBData.PositionY = Position.Y;
        DBData.PositionZ = Position.Z;
        DBData.RotationX = Rotation.X;
        DBData.RotationY = Rotation.Y;
        DBData.RotationZ = Rotation.Z;
        DBData.RotationW = Rotation.W;

        CurrentVehicle.EnterMap(map, position);

        // TODO: save? new DB system? how to do it properly?
    }
}
