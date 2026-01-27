namespace AutoCore.Game.Managers;

using System.Collections.Concurrent;
using AutoCore.Game.Entities;
using AutoCore.Game.Packets.Sector;
using AutoCore.Game.TNL.Ghost;
using AutoCore.Utils.Memory;

/// <summary>
/// Manages character level.
/// Note: Name is a bit misleading, as this technically will manager much more
/// than just level, such as mana(power), attribute stats, etc
/// </summary>
public class CharacterLevelManager : Singleton<CharacterLevelManager>
{
    private readonly ConcurrentDictionary<long, CharacterManaState> _cache = new();
    // Stores fractional part of mana regen for each character.
    // This is used to ensure that any mana regen under .5 mana is not lost.
    private readonly ConcurrentDictionary<long, float> _manaRegenRemainders = new();

    // Client reports about half as much regen from our item vs what is in the clonebase.wad.
    // This is a temporary fix until we figure out what the issue is
    private const int ManaRegenRateDivisor = 2;

    /// <summary>
    /// Gets or creates mana state for a character. In-memory only, no DB persistence.
    /// </summary>
    public CharacterManaState GetOrCreate(long characterCoid)
    {
        return _cache.GetOrAdd(characterCoid, _ => new CharacterManaState
        {
            CurrentMana = 10,
            MaxMana = 10
        });
    }

    /// <summary>
    /// Builds a CharacterLevelPacket from the cached mana state.
    /// </summary>
    public CharacterLevelPacket BuildPacket(Character character)
    {
        var state = GetOrCreate(character.ObjectId.Coid);

        lock (state)
        {
            return new CharacterLevelPacket
            {
                CharacterId = character.ObjectId,
                Level = character.Level,
                CurrentMana = state.CurrentMana,
                MaxMana = state.MaxMana
            };
        }
    }

    /// <summary>
    /// Calculates max mana from the character's power plant.
    /// Future iterations will also consider other sources, such as skills and attribute points
    /// </summary>
    public short CalculateMaxMana(Character character)
    {
        if (character?.CurrentVehicle?.PowerPlant == null)
            return 0;

        var powerPlantMax = character.CurrentVehicle.PowerPlant.CloneBasePowerPlant?.PowerPlantSpecific?.PowerMaximum ?? 0;

        return (short)Math.Clamp(powerPlantMax, 0, short.MaxValue);
    }

    /// <summary>
    /// Sets current mana safely and updates regen tracking.
    /// </summary>
    public void SetCurrentMana(Character character, short newCurrent, bool sendPacket = true)
    {
        var state = GetOrCreate(character.ObjectId.Coid);
        var coid = character.ObjectId.Coid;

        lock (state)
        {
            SetCurrentManaLocked(state, coid, newCurrent, resetRemainder: true);
        }

        if (sendPacket)
        {
            character.OwningConnection?.SendGamePacket(BuildPacket(character));
            character.CurrentVehicle?.Ghost?.SetMaskBits(GhostVehicle.PowerMask);
        }
    }

    /// <summary>
    /// Sets max mana safely and clamps current mana if needed, then updates regen tracking.
    /// </summary>
    public void SetMaxMana(Character character, short newMax, bool sendPacket = true)
    {
        var state = GetOrCreate(character.ObjectId.Coid);
        var coid = character.ObjectId.Coid;

        lock (state)
        {
            SetMaxManaLocked(state, coid, newMax, clampCurrent: true, resetRemainder: true);
        }

        if (sendPacket)
        {
            character.OwningConnection?.SendGamePacket(BuildPacket(character));
            character.CurrentVehicle?.Ghost?.SetMaskBits(GhostVehicle.PowerMask);
        }
    }

    private void SetCurrentManaLocked(CharacterManaState state, long coid, short newCurrent, bool resetRemainder)
    {
        var maxMana = Math.Max(state.MaxMana, (short)0);
        var clamped = Math.Clamp(newCurrent, (short)0, maxMana);
        if (state.CurrentMana == clamped)
        {
            UpdateManaRegenTracking(coid, state, resetRemainder);
            return;
        }

        state.CurrentMana = clamped;
        UpdateManaRegenTracking(coid, state, resetRemainder);
    }

    private void SetMaxManaLocked(CharacterManaState state, long coid, short newMax, bool clampCurrent, bool resetRemainder)
    {
        var clampedMax = Math.Max(newMax, (short)0);
        var changed = state.MaxMana != clampedMax;
        state.MaxMana = clampedMax;

        if (clampCurrent && state.CurrentMana > clampedMax)
            state.CurrentMana = clampedMax;

        if (changed || clampCurrent)
            UpdateManaRegenTracking(coid, state, resetRemainder);
    }

    private void UpdateManaRegenTracking(long coid, CharacterManaState state, bool resetRemainder)
    {
        if (state.MaxMana <= 0 || state.CurrentMana >= state.MaxMana)
        {
            _manaRegenRemainders.TryRemove(coid, out _);
            ObjectManager.Instance.ClearManaRegenNeeded(coid);
            return;
        }

        if (resetRemainder)
            _manaRegenRemainders.TryRemove(coid, out _);

        ObjectManager.Instance.MarkNeedsManaRegen(coid);
    }

    /// <summary>
    /// Recalculates max mana from the character's power plant and updates current mana if needed.
    /// Also updates the regeneration tracking based on whether the character needs mana regen.
    /// </summary>
    public CharacterManaState UpdateManaFromCharacter(Character character, bool setCurrentToMax = false)
    {
        var newMax = CalculateMaxMana(character);
        var state = GetOrCreate(character.ObjectId.Coid);
        var coid = character.ObjectId.Coid;

        lock (state)
        {
            SetMaxManaLocked(state, coid, newMax, clampCurrent: true, resetRemainder: false);

            if (setCurrentToMax)
                SetCurrentManaLocked(state, coid, newMax, resetRemainder: true);
        }

        return state;
    }

    /// <summary>
    /// Consumes mana from a character. Returns true if successful, false if not enough mana.
    /// </summary>
    public bool ConsumeMana(Character character, short amount)
    {
        if (amount <= 0)
            return true;

        var state = GetOrCreate(character.ObjectId.Coid);
        var coid = character.ObjectId.Coid;

        lock (state)
        {
            if (state.CurrentMana < amount)
                return false;

            var newCurrent = (short)(state.CurrentMana - amount);
            SetCurrentManaLocked(state, coid, newCurrent, resetRemainder: false);
        }

        character.OwningConnection?.SendGamePacket(BuildPacket(character));
        character.CurrentVehicle?.Ghost?.SetMaskBits(GhostVehicle.PowerMask);

        return true;
    }

    /// <summary>
    /// Regenerates mana only for characters that are in the active regeneration set.
    /// </summary>
    public void RegenerateManaForActiveCharacters(long deltaMs)
    {
        if (deltaMs <= 0)
            return;

        var characters = ObjectManager.Instance.GetCharactersNeedingManaRegen();
        var deltaSeconds = deltaMs / 1000f;

        foreach (var character in characters)
        {
            RegenerateManaForCharacter(character, deltaSeconds);
        }
    }

    /// <summary>
    /// Regenerates mana for a single character based on their power plant's regen rate.
    /// </summary>
    private void RegenerateManaForCharacter(Character character, float deltaSeconds)
    {
        if (character?.CurrentVehicle?.PowerPlant == null)
            return;

        var powerPlantSpecific = character.CurrentVehicle.PowerPlant.CloneBasePowerPlant?.PowerPlantSpecific;
        if (powerPlantSpecific == null)
            return;

        var rawRegenRate = powerPlantSpecific.PowerRegenRate;
        var regenRate = rawRegenRate / ManaRegenRateDivisor;
        if (regenRate <= 0)
        {
            // No regen rate, remove from active set
            ObjectManager.Instance.ClearManaRegenNeeded(character.ObjectId.Coid);
            return;
        }

        var state = GetOrCreate(character.ObjectId.Coid);
        var coid = character.ObjectId.Coid;
        short currentMana;
        short maxMana;

        lock (state)
        {
            currentMana = state.CurrentMana;
            maxMana = state.MaxMana;
        }

        if (currentMana >= maxMana)
        {
            UpdateManaRegenTracking(coid, state, resetRemainder: false);
            return;
        }

        var remainder = _manaRegenRemainders.GetOrAdd(coid, 0f);
        var total = remainder + (regenRate * deltaSeconds);
        var gain = (short)Math.Floor(total);

        if (gain <= 0)
        {
            _manaRegenRemainders[coid] = total;
            return;
        }

        var newCurrent = (short)Math.Min(maxMana, currentMana + gain);
        _manaRegenRemainders[coid] = total - gain;

        if (newCurrent == currentMana)
            return;

        lock (state)
        {
            SetCurrentManaLocked(state, coid, newCurrent, resetRemainder: false);
        }

        character.OwningConnection?.SendGamePacket(BuildPacket(character));
        character.CurrentVehicle.Ghost?.SetMaskBits(GhostVehicle.PowerMask);
    }

    /// <summary>
    /// Removes character mana state from cache (e.g., on logout).
    /// </summary>
    public void RemoveFromCache(long characterCoid)
    {
        _cache.TryRemove(characterCoid, out _);
        _manaRegenRemainders.TryRemove(characterCoid, out _);
        ObjectManager.Instance.ClearManaRegenNeeded(characterCoid);
    }
}

/// <summary>
/// In-memory representation of character mana state.
/// </summary>
public class CharacterManaState
{
    public short CurrentMana { get; set; }
    public short MaxMana { get; set; }
}
