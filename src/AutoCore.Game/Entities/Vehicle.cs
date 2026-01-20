using Microsoft.EntityFrameworkCore;

namespace AutoCore.Game.Entities;

using AutoCore.Database.Char;
using AutoCore.Database.Char.Models;
using AutoCore.Game.Managers;
using AutoCore.Game.Map;
using AutoCore.Game.Packets.Sector;
using AutoCore.Game.Structures;
using AutoCore.Game.TNL.Ghost;

public class Vehicle : SimpleObject
{
    #region Properties
    #region Database Vehicle Data
    private VehicleData DBData { get; set; }
    public string Name => DBData.Name;
    public uint PrimaryColor => DBData.PrimaryColor;
    public uint SecondaryColor => DBData.SecondaryColor;
    public byte Trim => DBData.Trim;
    #endregion

    public Armor Armor { get; private set; }
    public PowerPlant PowerPlant { get; private set; }
    public SimpleObject Ornament { get; private set; }
    public SimpleObject RaceItem { get; private set; }
    public Weapon WeaponMelee { get; private set; }
    public Weapon WeaponFront { get; private set; }
    public Weapon WeaponTurret { get; private set; }
    public Weapon WeaponRear { get; private set; }
    public WheelSet WheelSet { get; private set; }
    public Vector3 Velocity { get; private set; }
    public Vector3 AngularVelocity { get; private set; }
    public Vector3 TargetPosition { get; private set; }
    public float Acceleration { get; set; }
    public float Steering { get; set; }
    public float WantedTurretDirection { get; set; }
    public byte Firing { get; set; }
    public VehicleMovedFlags VehicleFlags { get; set; }
    public int CurrentShield { get; private set; }
    public int MaxShield { get; private set; }
    public int ShieldRegenRate { get; private set; }

    /// <summary>
    /// Sets the current shield of this Vehicle.
    /// </summary>
    /// <param name="shield">The new shield value to set</param>
    /// <param name="triggerGhostUpdate">If true, notifies clients of the shield change via ghost mask update</param>
    public void SetCurrentShield(int shield, bool triggerGhostUpdate = true)
    {
        // Clamp shield to valid range: between 0 and MaxShield (or 0 if MaxShield is negative)
        var newShield = Math.Clamp(shield, 0, Math.Max(MaxShield, 0));

        // Early return if shield hasn't changed to avoid unnecessary updates
        if (CurrentShield == newShield)
            return;

        CurrentShield = newShield;

        // Notify clients of shield change if requested and ghost exists
        if (triggerGhostUpdate && Ghost != null)
            Ghost.SetMaskBits(GhostVehicle.ShieldMask);
    }

    /// <summary>
    /// Sets the maximum shield of this Vehicle and adjusts current shield if necessary.
    /// </summary>
    /// <param name="maxShield">The new maximum shield value to set</param>
    /// <param name="triggerGhostUpdate">If true, notifies clients of shield changes via ghost mask updates</param>
    public void SetMaximumShield(int maxShield, bool triggerGhostUpdate = true)
    {
        // Ensure MaxShield is non-negative
        var newMax = Math.Max(maxShield, 0);
        
        // If MaxShield hasn't changed, only adjust current shield if it exceeds the maximum
        if (MaxShield == newMax)
        {
            if (CurrentShield > MaxShield)
                SetCurrentShield(MaxShield, triggerGhostUpdate);

            return;
        }

        MaxShield = newMax;

        // Clamp current shield if needed (in case MaxShield was reduced below current shield)
        var oldShield = CurrentShield;
        CurrentShield = Math.Clamp(CurrentShield, 0, MaxShield);

        // Skip ghost updates if not requested
        if (!triggerGhostUpdate)
            return;

        // Notify clients that MaxShield has changed
        if (Ghost != null)
        {
            Ghost.SetMaskBits(GhostVehicle.ShieldMaxMask);

            // If current shield was adjusted due to MaxShield change, notify clients of shield change too
            if (CurrentShield != oldShield)
                Ghost.SetMaskBits(GhostVehicle.ShieldMask);
        }
    }

    /// <summary>
    /// Regenerates shield by the configured regeneration rate, up to the maximum shield.
    /// </summary>
    public void RegenerateShield()
    {
        // Early return if regeneration is disabled or vehicle has no shield capacity
        if (ShieldRegenRate <= 0 || MaxShield <= 0)
            return;

        // Early return if shield is already at maximum
        if (CurrentShield >= MaxShield)
            return;

        // Increase shield by regen rate, but don't exceed MaxShield
        var newShield = Math.Min(CurrentShield + ShieldRegenRate, MaxShield);
        SetCurrentShield(newShield);
    }
    #endregion

    public Vehicle()
        : base(GraphicsObjectType.GraphicsPhysics)
    {
    }

    public override Vehicle GetAsVehicle() => this;

    public override bool LoadFromDB(CharContext context, long coid, bool isInCharacterSelection = false)
    {
        SetCoid(coid, true);

        DBData = context.Vehicles.Include(v => v.SimpleObjectBase).FirstOrDefault(v => v.Coid == coid);

        if (DBData == null)
            return false;

        LoadCloneBase(DBData.SimpleObjectBase.CBID);

        Position = new(DBData.PositionX, DBData.PositionY, DBData.PositionZ);
        Rotation = new(DBData.RotationX, DBData.RotationY, DBData.RotationZ, DBData.RotationW);

        WheelSet = new WheelSet();
        if (!WheelSet.LoadFromDB(context, DBData.Wheelset))
        {
            return false;
        }

        if (DBData.MeleeWeapon != 0)
        {
            WeaponMelee = new Weapon();
            if (!WeaponMelee.LoadFromDB(context, DBData.MeleeWeapon))
            {
                return false;
            }
        }

        if (DBData.Front != 0)
        {
            WeaponFront = new Weapon();
            if (!WeaponFront.LoadFromDB(context, DBData.Front))
            {
                return false;
            }
        }

        if (DBData.Turret != 0)
        {
            WeaponTurret = new Weapon();
            if (!WeaponTurret.LoadFromDB(context, DBData.Turret))
            {
                return false;
            }
        }

        if (DBData.Rear != 0)
        {
            WeaponRear = new Weapon();
            if (!WeaponRear.LoadFromDB(context, DBData.Rear))
            {
                return false;
            }
        }

        // Skip loading other unnecessary stuff from the DB, if we are displaying this Vehicle in the character selection
        // TODO: or maybe just load/send everything always and no such workarounds are needed?
        if (isInCharacterSelection)
        {
            // Set HP from base MaxHitPoint when in character selection (Armor not loaded)
            HP = MaxHP = CloneBaseObject.SimpleObjectSpecific.MaxHitPoint;
            // Shield stays at 0 for character selection (RaceItem not loaded)
            ShieldRegenRate = 0;
            return true;
        }

        if (DBData.Armor != 0)
        {
            Armor = new Armor();
            if (!Armor.LoadFromDB(context, DBData.Armor))
            {
                return false;
            }
        }

        // Set HP and MaxHP from equipped Armor's ArmorFactor, or fall back to base MaxHitPoint
        if (Armor != null && Armor.CloneBaseArmor != null)
        {
            HP = MaxHP = Armor.CloneBaseArmor.ArmorSpecific.ArmorFactor;
        }
        else
        {
            HP = MaxHP = CloneBaseObject.SimpleObjectSpecific.MaxHitPoint;
        }

        if (DBData.Ornament != 0)
        {
            Ornament = new SimpleObject(GraphicsObjectType.Graphics);
            if (!Ornament.LoadFromDB(context, DBData.Ornament))
            {
                return false;
            }
        }

        if (DBData.RaceItem != 0)
        {
            RaceItem = new SimpleObject(GraphicsObjectType.Graphics);
            if (!RaceItem.LoadFromDB(context, DBData.RaceItem))
            {
                return false;
            }
        }

        // Set Shield and MaxShield from equipped Shielding (RaceItem)'s RaceShieldFactor, or fall back to 0
        if (RaceItem != null && RaceItem.CloneBaseObject != null)
        {
            MaxShield = RaceItem.CloneBaseObject.SimpleObjectSpecific.RaceShieldFactor;
            CurrentShield = MaxShield; // Start at full shield
            ShieldRegenRate = RaceItem.CloneBaseObject.SimpleObjectSpecific.RaceShieldRegenerate;
        }
        else
        {
            MaxShield = 0;
            CurrentShield = 0;
            ShieldRegenRate = 0;
        }

        if (DBData.PowerPlant != 0)
        {
            PowerPlant = new PowerPlant();
            if (!PowerPlant.LoadFromDB(context, DBData.PowerPlant))
            {
                return false;
            }
        }

        return true;
    }

    public override void CreateGhost()
    {
        if (Ghost != null)
            return;

        Ghost = new GhostVehicle();
        Ghost.SetParent(this);
    }

    public override void WriteToPacket(CreateSimpleObjectPacket packet)
    {
        base.WriteToPacket(packet);

        if (packet is CreateVehiclePacket vehiclePacket)
        {
            vehiclePacket.CoidCurrentOwner = DBData.CharacterCoid;
            vehiclePacket.CoidSpawnOwner = -1;

            for (var i = 0; i < 8; ++i)
                vehiclePacket.Tricks[i] = -1;

            vehiclePacket.PrimaryColor = DBData.PrimaryColor;
            vehiclePacket.SecondaryColor = DBData.SecondaryColor;
            vehiclePacket.ArmorAdd = 0;
            vehiclePacket.PowerMaxAdd = 0;
            vehiclePacket.HeatMaxAdd = 0;
            vehiclePacket.CooldownAdd = 0;
            vehiclePacket.InventorySlots = 0;
            vehiclePacket.MaxWeightWeaponFront = 0.0f;
            vehiclePacket.MaxWeightWeaponTurret = 0.0f;
            vehiclePacket.MaxWeightWeaponRear = 0.0f;
            vehiclePacket.MaxWeightArmor = 0.0f;
            vehiclePacket.MaxWeightPowerPlant = 0.0f;
            vehiclePacket.SpeedAdd = 1.0f;
            vehiclePacket.BrakesMaxTorqueFrontMultiplier = 1.0f;
            vehiclePacket.BrakesMaxTorqueRearAdjustMultiplier = 1.0f;
            vehiclePacket.SteeringMaxAngleMultiplier = 1.0f;
            vehiclePacket.SteeringFullSpeedLimitMultiplier = 1.0f;
            vehiclePacket.AVDNormalSpinDampeningMultiplier = 1.0f;
            vehiclePacket.AVDCollisionSpinDampeningMultiplier = 1.0f;
            vehiclePacket.KMTravelled = 0.0f;
            vehiclePacket.IsTrailer = false;
            vehiclePacket.IsInventory = false;
            vehiclePacket.IsActive = Map != null && !Map.MapData.ContinentObject.IsTown;
            vehiclePacket.Trim = DBData.Trim;

            if (Ornament != null)
            {
                vehiclePacket.CreateOrnament = new CreateSimpleObjectPacket();
                Ornament.WriteToPacket(vehiclePacket.CreateOrnament);
            }

            if (RaceItem != null)
            {
                vehiclePacket.CreateRaceItem = new CreateSimpleObjectPacket();
                RaceItem.WriteToPacket(vehiclePacket.CreateRaceItem);
            }

            if (PowerPlant != null)
            {
                vehiclePacket.CreatePowerPlant = new CreatePowerPlantPacket();
                PowerPlant.WriteToPacket(vehiclePacket.CreatePowerPlant);
            }

            vehiclePacket.CreateWheelSet = new CreateWheelSetPacket();
            WheelSet.WriteToPacket(vehiclePacket.CreateWheelSet);

            if (Armor != null)
            {
                vehiclePacket.CreateArmor = new CreateArmorPacket();
                Armor.WriteToPacket(vehiclePacket.CreateArmor);
            }

            if (WeaponMelee != null)
            {
                vehiclePacket.CreateWeaponMelee = new CreateWeaponPacket();
                WeaponMelee.WriteToPacket(vehiclePacket.CreateWeaponMelee);
            }

            if (WeaponFront != null)
            {
                vehiclePacket.CreateWeapons[0] = new CreateWeaponPacket();
                WeaponFront.WriteToPacket(vehiclePacket.CreateWeapons[0]);
            }

            if (WeaponTurret != null)
            {
                vehiclePacket.CreateWeapons[1] = new CreateWeaponPacket();
                WeaponTurret.WriteToPacket(vehiclePacket.CreateWeapons[1]);
            }

            if (WeaponRear != null)
            {
                vehiclePacket.CreateWeapons[2] = new CreateWeaponPacket();
                WeaponRear.WriteToPacket(vehiclePacket.CreateWeapons[2]);
            }

            vehiclePacket.CurrentPathId = -1;
            vehiclePacket.ExtraPathId = 0;
            vehiclePacket.PatrolDistance = 0.0f;
            vehiclePacket.PathReversing = false;
            vehiclePacket.PathIsRoad = false;
            vehiclePacket.TemplateId = -1;
            vehiclePacket.MurdererCoid = -1L;
            vehiclePacket.WeaponsCBID[0] = WeaponFront?.CBID ?? -1;
            vehiclePacket.WeaponsCBID[1] = WeaponTurret?.CBID ?? -1;
            vehiclePacket.WeaponsCBID[2] = WeaponRear?.CBID ?? -1;
            vehiclePacket.Name = DBData.Name;
        }

        if (packet is CreateVehicleExtendedPacket extendedPacket)
        {
            // TODO
        }
    }

    public void EnterMap(SectorMap map, Vector3? position = null)
    {
        Position = position.Value;
        Rotation = Quaternion.Default;

        DBData.PositionX = Position.X;
        DBData.PositionY = Position.Y;
        DBData.PositionZ = Position.Z;
        DBData.RotationX = Rotation.X;
        DBData.RotationY = Rotation.Y;
        DBData.RotationZ = Rotation.Z;
        DBData.RotationW = Rotation.W;
    }

    public void HandleMovement(VehicleMovedPacket packet)
    {
        if (Ghost == null)
            return;

        if (packet.ObjectId != ObjectId)
            throw new Exception("WTF? Someone else moves me?");

        // Update position
        Position = packet.Location;
        Rotation = packet.Rotation;
        Velocity = packet.Velocity;
        AngularVelocity = packet.AngularVelocity;
        TargetPosition = packet.TargetPosition;
        Acceleration = packet.Acceleration;
        Steering = packet.Steering;
        WantedTurretDirection = packet.TurretDirection;
        VehicleFlags = packet.VehicleFlags;
        Firing = packet.Firing;

        Ghost.SetMaskBits(GhostObject.PositionMask);

        // Update target
        if (Target != null)
        {
            if (packet.Target.Coid == -1)
            {
                Target = null;

                Ghost.SetMaskBits(GhostObject.TargetMask);
            }
            else if (packet.Target != Target.ObjectId)
            {
                Target = ObjectManager.Instance.GetObject(packet.Target);

                Ghost.SetMaskBits(GhostObject.TargetMask);
            }
        }
        else if (packet.Target.Coid != -1)
        {
            Target = ObjectManager.Instance.GetObject(packet.Target);

            Ghost.SetMaskBits(GhostObject.TargetMask);
        }
    }
}
