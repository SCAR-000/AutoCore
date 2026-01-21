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
    /// Builds a CharacterStatsPacket from the cached mana state.
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
    /// Recalculates max mana from the character's power plant and updates current mana if needed.
    /// </summary>
    public CharacterManaState UpdatePowerFromCharacter(Character character, bool setCurrentToMax = false)
    {
        var newMax = CalculateMaxMana(character);
        var state = GetOrCreate(character.ObjectId.Coid);

        lock (state)
        {
            state.MaxMana = newMax;

            if (setCurrentToMax)
            {
                state.CurrentMana = newMax;
            }
            else if (state.CurrentMana > newMax)
            {
                state.CurrentMana = newMax;
            }
        }

        return state;
    }

    /// <summary>
    /// Regenerates mana for all characters based on their power plant's regen rate.
    /// </summary>
    public void RegenerateMana(long deltaMs)
    {
        if (deltaMs <= 0)
            return;

        var characters = ObjectManager.Instance.GetCharacters();
        var deltaSeconds = deltaMs / 1000f;

        foreach (var character in characters)
        {
            if (character?.CurrentVehicle?.PowerPlant == null)
                continue;

            var powerPlantSpecific = character.CurrentVehicle.PowerPlant.CloneBasePowerPlant?.PowerPlantSpecific;
            if (powerPlantSpecific == null)
                continue;

            var rawRegenRate = powerPlantSpecific.PowerRegenRate;
            var regenRate = rawRegenRate / ManaRegenRateDivisor;
            if (regenRate <= 0)
                continue;

            var state = GetOrCreate(character.ObjectId.Coid);
            short currentMana;
            short maxMana;

            lock (state)
            {
                currentMana = state.CurrentMana;
                maxMana = state.MaxMana;
            }

            if (currentMana >= maxMana)
            {
                _manaRegenRemainders.TryRemove(character.ObjectId.Coid, out _);
                continue;
            }

            var remainder = _manaRegenRemainders.GetOrAdd(character.ObjectId.Coid, 0f);
            var total = remainder + (regenRate * deltaSeconds);
            var gain = (short)Math.Floor(total);

            if (gain <= 0)
            {
                _manaRegenRemainders[character.ObjectId.Coid] = total;
                continue;
            }

            var newCurrent = (short)Math.Min(maxMana, currentMana + gain);
            _manaRegenRemainders[character.ObjectId.Coid] = total - gain;

            if (newCurrent == currentMana)
                continue;

            lock (state)
            {
                state.CurrentMana = newCurrent;
            }

            character.OwningConnection?.SendGamePacket(BuildPacket(character));
            character.CurrentVehicle.Ghost?.SetMaskBits(GhostVehicle.PowerMask);
        }
    }

    /// <summary>
    /// Removes character mana state from cache (e.g., on logout).
    /// </summary>
    public void RemoveFromCache(long characterCoid)
    {
        _cache.TryRemove(characterCoid, out _);
        _manaRegenRemainders.TryRemove(characterCoid, out _);
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
