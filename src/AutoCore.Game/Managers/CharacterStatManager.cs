namespace AutoCore.Game.Managers;

using System.Collections.Concurrent;
using AutoCore.Database.Char;
using AutoCore.Database.Char.Models;
using AutoCore.Game.CloneBases;
using AutoCore.Game.Entities;
using AutoCore.Game.Packets.Sector;
using AutoCore.Game.TNL.Ghost;
using AutoCore.Utils;
using AutoCore.Utils.Memory;

public class CharacterStatManager : Singleton<CharacterStatManager>
{
    private readonly ConcurrentDictionary<long, CharacterStatsState> _cache = new();
    private readonly ConcurrentDictionary<long, float> _manaRegenRemainders = new();
    // Client reports about half as much regen from our item vs what is in the clonebase.wad. 
    // This is a temporary fix until we figure out what the issue is
    private const int PowerRegenRateDivisor = 2; 

    /// <summary>
    /// Gets or loads character stats from database. Creates default entry if missing.
    /// </summary>
    public CharacterStatsState GetOrLoad(long characterCoid)
    {
        if (_cache.TryGetValue(characterCoid, out var cached))
            return cached;

        CharacterStatsData dbStats;
        try
        {
            using var context = new CharContext();
            dbStats = context.CharacterStats.FirstOrDefault(s => s.CharacterCoid == characterCoid);
        }
        catch (Exception ex) when (ex.Message.Contains("character_stats") && ex.Message.Contains("doesn't exist"))
        {
            // Existing DB may not have been bootstrapped yet. Ensure schema and retry once.
            CharContext.EnsureCreated();

            using var context = new CharContext();
            dbStats = context.CharacterStats.FirstOrDefault(s => s.CharacterCoid == characterCoid);
        }

        if (dbStats == null)
        {
            // Create default stats entry
            dbStats = new CharacterStatsData
            {
                CharacterCoid = characterCoid,
                Currency = 0,
                Experience = 0,
                CurrentPower = 100,
                MaxPower = 100,
                AttributeTech = 1,
                AttributeCombat = 1,
                AttributeTheory = 1,
                AttributePerception = 1,
                AttributePoints = 0,
                SkillPoints = 0,
                ResearchPoints = 0
            };

            using var context = new CharContext();
            context.CharacterStats.Add(dbStats);
            context.SaveChanges();
        }

        var state = new CharacterStatsState(dbStats);
        _cache.TryAdd(characterCoid, state);
        return state;
    }

    /// <summary>
    /// Updates character stats using the provided mutator action, then persists to database.
    /// </summary>
    public CharacterStatsState Update(long characterCoid, Action<CharacterStatsState> mutator)
    {
        var state = GetOrLoad(characterCoid);

        lock (state)
        {
            mutator(state);

            // Persist to database
            using var context = new CharContext();
            var dbStats = context.CharacterStats.FirstOrDefault(s => s.CharacterCoid == characterCoid);
            
            if (dbStats == null)
            {
                dbStats = new CharacterStatsData { CharacterCoid = characterCoid };
                context.CharacterStats.Add(dbStats);
            }

            // Update DB entity from state
            dbStats.Currency = state.Currency;
            dbStats.Experience = state.Experience;
            dbStats.CurrentPower = state.CurrentPower;
            dbStats.MaxPower = state.MaxPower;
            dbStats.AttributeTech = state.AttributeTech;
            dbStats.AttributeCombat = state.AttributeCombat;
            dbStats.AttributeTheory = state.AttributeTheory;
            dbStats.AttributePerception = state.AttributePerception;
            dbStats.AttributePoints = state.AttributePoints;
            dbStats.SkillPoints = state.SkillPoints;
            dbStats.ResearchPoints = state.ResearchPoints;

            context.SaveChanges();
        }

        return state;
    }

    /// <summary>
    /// Builds a CharacterStatsPacket from the cached stats and character level.
    /// </summary>
    public CharacterStatsPacket BuildPacket(Character character)
    {
        var stats = GetOrLoad(character.ObjectId.Coid);
        
        lock (stats)
        {
            return new CharacterStatsPacket
            {
                CharacterId = character.ObjectId,
                Level = character.Level,
                Currency = stats.Currency,
                Experience = stats.Experience,
                CurrentPower = stats.CurrentPower,
                MaxPower = stats.MaxPower,
                AttributeTech = stats.AttributeTech,
                AttributeCombat = stats.AttributeCombat,
                AttributeTheory = stats.AttributeTheory,
                AttributePerception = stats.AttributePerception,
                AttributePoints = stats.AttributePoints,
                SkillPoints = stats.SkillPoints,
                ResearchPoints = stats.ResearchPoints
            };
        }
    }

    /// <summary>
    /// Calculates the maximum mana (power) for the character's current vehicle and theory.
    /// </summary>
    public short CalculateMaxPower(Character character)
    {
        if (character?.CurrentVehicle == null)
            return 0;

        var powerPlantMax =
            character.CurrentVehicle.PowerPlant?.CloneBasePowerPlant?.PowerPlantSpecific?.PowerMaximum ?? 0;
        var cloneVehicle = character.CurrentVehicle.CloneBaseObject as CloneBaseVehicle;
        var chassisBonus = cloneVehicle?.VehicleSpecific.PowerMaxAdd ?? 0;

        short theory = 0;
        var stats = GetOrLoad(character.ObjectId.Coid);
        lock (stats)
        {
            theory = stats.AttributeTheory;
        }

        var total = powerPlantMax + chassisBonus + (theory * 2);
        return (short)Math.Clamp(total, 0, short.MaxValue);
    }

    /// <summary>
    /// Recalculates max mana from the character's vehicle and theory, and updates current mana if needed.
    /// </summary>
    public CharacterStatsState UpdatePowerFromCharacter(Character character, bool setCurrentToMax = false)
    {
        var newMax = CalculateMaxPower(character);

        return Update(character.ObjectId.Coid, stats =>
        {
            stats.MaxPower = newMax;
            if (setCurrentToMax)
            {
                stats.CurrentPower = newMax;
            }
            else if (stats.CurrentPower > newMax)
            {
                stats.CurrentPower = newMax;
            }
        });
    }

    /// <summary>
    /// Regenerates mana based on the equipped power plant's regen rate.
    /// </summary>
    public void RegenerateMana(long deltaMs)
    {
        if (deltaMs <= 0)
            return;

        var characters = ObjectManager.Instance.GetCharacters();
        var deltaSeconds = deltaMs / 1000f;

        foreach (var character in characters)
        {
            if (character?.CurrentVehicle == null)
                continue;

            var powerPlantSpecific = character.CurrentVehicle.PowerPlant?.CloneBasePowerPlant?.PowerPlantSpecific;
            if (powerPlantSpecific == null)
                continue;

            var rawRegenRate = powerPlantSpecific.PowerRegenRate;
            var regenRate = rawRegenRate / PowerRegenRateDivisor;
            if (regenRate <= 0)
                continue;

            var stats = GetOrLoad(character.ObjectId.Coid);
            short currentPower;
            short maxPower;
            lock (stats)
            {
                currentPower = stats.CurrentPower;
                maxPower = stats.MaxPower;
            }

            if (currentPower >= maxPower)
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

            var newCurrent = (short)Math.Min(maxPower, currentPower + gain);
            _manaRegenRemainders[character.ObjectId.Coid] = total - gain;

            if (newCurrent == currentPower)
                continue;

            Update(character.ObjectId.Coid, s => s.CurrentPower = newCurrent);
            character.OwningConnection?.SendGamePacket(BuildPacket(character));
            character.CurrentVehicle.Ghost?.SetMaskBits(GhostVehicle.PowerMask);
        }
    }

    /// <summary>
    /// Applies level-up rewards for the specified number of levels gained.
    /// Per level: +1 combat, +1 tech, +1 theory, +1 perception, +2 attribute points, +2 skill points.
    /// </summary>
    public void ApplyLevelUpRewards(long characterCoid, int levelsGained)
    {
        if (levelsGained <= 0)
            return;

        var wasAtMaxMana = false;

        Update(characterCoid, stats =>
        {
            wasAtMaxMana = stats.CurrentPower >= stats.MaxPower;

            // Apply rewards for each level gained
            stats.AttributeCombat += (short)levelsGained;
            stats.AttributeTech += (short)levelsGained;
            stats.AttributeTheory += (short)levelsGained;
            stats.AttributePerception += (short)levelsGained;
            stats.AttributePoints += (short)(levelsGained * 2);
            stats.SkillPoints += (short)(levelsGained * 2); // 2 skill points per level

            // Note: ResearchPoints are NOT modified on level up - they remain unchanged
        });

        var character = ObjectManager.Instance.GetCharacter(characterCoid);
        if (character != null)
            UpdatePowerFromCharacter(character, setCurrentToMax: wasAtMaxMana);
        
        // Note: HP update is handled by the caller if they have access to the Character object
        // This method doesn't have access to the Character, so HP update must be done elsewhere
    }

    /// <summary>
    /// Removes character stats from cache (e.g., on logout).
    /// </summary>
    public void RemoveFromCache(long characterCoid)
    {
        _cache.TryRemove(characterCoid, out _);
    }
}

/// <summary>
/// Thread-safe in-memory representation of character stats.
/// </summary>
public class CharacterStatsState
{
    public long Currency { get; set; }
    public int Experience { get; set; }
    public short CurrentPower { get; set; }
    public short MaxPower { get; set; }
    public short AttributeTech { get; set; }
    public short AttributeCombat { get; set; }
    public short AttributeTheory { get; set; }
    public short AttributePerception { get; set; }
    public short AttributePoints { get; set; }
    public short SkillPoints { get; set; }
    public short ResearchPoints { get; set; }

    public CharacterStatsState(CharacterStatsData dbData)
    {
        Currency = dbData.Currency;
        Experience = dbData.Experience;
        CurrentPower = dbData.CurrentPower;
        MaxPower = dbData.MaxPower;
        AttributeTech = dbData.AttributeTech;
        AttributeCombat = dbData.AttributeCombat;
        AttributeTheory = dbData.AttributeTheory;
        AttributePerception = dbData.AttributePerception;
        AttributePoints = dbData.AttributePoints;
        SkillPoints = dbData.SkillPoints;
        ResearchPoints = dbData.ResearchPoints;
    }
}


