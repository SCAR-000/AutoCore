namespace AutoCore.Game.Entities;

using AutoCore.Database.Char;
using AutoCore.Database.Char.Models;
using AutoCore.Game.Packets.Sector;
using AutoCore.Game.TNL.Ghost;

public class SimpleObject : GraphicsObject
{
    #region Properties
    #region Database SimpleObject data
    private SimpleObjectData DBData { get; set; }
    #endregion

    protected int[] Prefixes { get; set; }
    protected int[] Gadgets { get; set; }
    protected short MaxGadgets { get; set; }
    protected int TeamFaction { get; set; }
    protected int Quantity { get; set; }
    protected int HP { get; set; }
    protected int MaxHP { get; set; }
    protected int ItemTemplateId { get; set; }
    protected byte InventoryPositionX { get; set; }
    protected byte InventoryPositionY { get; set; }
    protected byte SkillLevel1 { get; set; }
    protected byte SkillLevel2 { get; set; }
    protected byte SkillLevel3 { get; set; }
    protected bool AlreadyAssembled { get; set; }
    #endregion

    public override int GetCurrentHP() => HP;
    public override int GetMaximumHP() => MaxHP;
    public override int GetBareTeamFaction() => TeamFaction;

    /// <summary>
    /// Sets the current HP of this SimpleObject.
    /// </summary>
    /// <param name="hp">The new HP value to set</param>
    /// <param name="triggerGhostUpdate">If true, notifies clients of the HP change via ghost mask update</param>
    public void SetCurrentHP(int hp, bool triggerGhostUpdate = true)
    {
        // Clamp HP to valid range: between 0 and MaxHP (or 0 if MaxHP is negative)
        var newHp = Math.Clamp(hp, 0, Math.Max(MaxHP, 0));

        // Early return if HP hasn't changed to avoid unnecessary updates
        if (HP == newHp)
            return;

        HP = newHp;

        // Notify clients of HP change if requested
        if (triggerGhostUpdate)
            Ghost?.SetMaskBits(GhostObject.HealthMask);
    }

    /// <summary>
    /// Sets the maximum HP of this SimpleObject and adjusts current HP if necessary.
    /// </summary>
    /// <param name="maxHp">The new maximum HP value to set</param>
    /// <param name="triggerGhostUpdate">If true, notifies clients of HP changes via ghost mask updates</param>
    public void SetMaximumHP(int maxHp, bool triggerGhostUpdate = true)
    {
        // Ensure MaxHP is non-negative
        var newMax = Math.Max(maxHp, 0);
        
        // If MaxHP hasn't changed, only adjust current HP if it exceeds the maximum, then return early
        if (MaxHP == newMax)
        {
            if (HP > MaxHP)
                SetCurrentHP(MaxHP, triggerGhostUpdate);

            return;
        }

        MaxHP = newMax;

        // Clamp current HP if needed (in case MaxHP was reduced below current HP)
        var oldHp = HP;
        HP = Math.Clamp(HP, 0, MaxHP);

        // Skip ghost updates if not requested
        if (!triggerGhostUpdate)
            return;

        // Notify clients that MaxHP has changed
        Ghost?.SetMaskBits(GhostObject.HealthMaxMask);

        // If current HP was adjusted due to MaxHP change, notify clients of HP change too
        if (HP != oldHp)
            Ghost?.SetMaskBits(GhostObject.HealthMask);
    }

    public SimpleObject(GraphicsObjectType type)
        : base(type)
    {
        MaxGadgets = 0;
        TeamFaction = 0;
        HP = MaxHP = 500;
        InventoryPositionX = 0;
        InventoryPositionY = 0;
        AlreadyAssembled = false;
        Quantity = 1;
        ItemTemplateId = -1;
        SkillLevel1 = 1;
        SkillLevel2 = 1;
        SkillLevel3 = 1;
    }

    public virtual bool LoadFromDB(CharContext context, long coid, bool isInCharacterSelection = false)
    {
        SetCoid(coid, true);

        DBData = context.SimpleObjects.FirstOrDefault(so => so.Coid == coid);
        if (DBData == null)
            return false;

        LoadCloneBase(DBData.CBID);

        SetupCBFields();

        return true;
    }

    public void SetupCBFields()
    {
        HP = MaxHP = CloneBaseObject.SimpleObjectSpecific.MaxHitPoint;
        Faction = CloneBaseObject.SimpleObjectSpecific.Faction;
    }

    public override void CreateGhost()
    {
        if (Ghost != null)
            return;

        Ghost = new GhostObject();
        Ghost.SetParent(this);
    }

    public override void WriteToPacket(CreateSimpleObjectPacket packet)
    {
        packet.CBID = CBID;
        packet.ObjectId = ObjectId;
        packet.CurrentHealth = HP;
        packet.MaximumHealth = MaxHP;
        packet.Quantity = Quantity;
        packet.InventoryPositionX = InventoryPositionX;
        packet.InventoryPositionY = InventoryPositionY;
        packet.Value = CloneBaseObject.CloneBaseSpecific.BaseValue;
        packet.Faction = Faction;
        packet.TeamFaction = TeamFaction;
        packet.CoidStore = -1;
        packet.IsCorpse = false;
        packet.SkillLevel1 = SkillLevel1;
        packet.SkillLevel2 = SkillLevel2;
        packet.SkillLevel3 = SkillLevel3;
        packet.IsIdentified = true;
        packet.PossibleMissionItem = false;
        packet.TempItem = false;
        packet.WillEquip = false;
        packet.IsInInventory = false;
        packet.IsItemLink = false;
        packet.IsBound = true;
        packet.UsesLeft = CloneBaseObject.SimpleObjectSpecific.MaxUses;
        packet.CustomizedName = string.Empty;
        packet.MadeFromMemory = false;
        packet.IsMail = false;
        packet.CustomValue = CustomValue;
        packet.IsKit = false;
        packet.IsInfinite = false;

        for (var i = 0; i < 5; ++i)
        {
            packet.Prefixes[i] = -1;
            packet.PrefixLevels[i] = 0;

            packet.Gadgets[i] = -1;
            packet.GadgetLevels[i] = 0;
        }

        packet.MaxGadgets = MaxGadgets;
        packet.ItemTemplateId = ItemTemplateId;
        packet.RequiredLevel = CloneBaseObject.SimpleObjectSpecific.RequiredLevel;
        packet.RequiredCombat = CloneBaseObject.SimpleObjectSpecific.RequiredCombat;
        packet.RequiredPerception = CloneBaseObject.SimpleObjectSpecific.RequiredPerception;
        packet.RequiredTech = CloneBaseObject.SimpleObjectSpecific.RequiredTech;
        packet.RequiredTheory = CloneBaseObject.SimpleObjectSpecific.RequiredTheory;
        packet.Scale = Scale;
        packet.Position = Position;
        packet.Rotation = Rotation;
    }
}
