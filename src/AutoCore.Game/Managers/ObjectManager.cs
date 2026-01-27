namespace AutoCore.Game.Managers;

using AutoCore.Database.Char;
using AutoCore.Game.Entities;
using AutoCore.Game.Structures;
using AutoCore.Utils.Memory;

public class ObjectManager : Singleton<ObjectManager>
{
    #region Object Storage
    private Dictionary<long, ClonedObjectBase> Objects { get; } = new();
    private Dictionary<long, Vehicle> Vehicles { get; } = new();
    private Dictionary<long, Character> Characters { get; } = new();
    #endregion

    #region Regeneration Tracking
    private HashSet<long> VehiclesNeedingShieldRegen { get; } = new();
    private HashSet<long> CharactersNeedingManaRegen { get; } = new();
    #endregion

    #region Add/Remove
    public bool Add(ClonedObjectBase obj)
    {
        if (!obj.ObjectId.Global)
            throw new Exception("Not sure how global/local TFID works, use only global!");

        if (Objects.ContainsKey(obj.ObjectId.Coid))
            return false;

        Objects.Add(obj.ObjectId.Coid, obj);

        // Index by type for O(1) access
        if (obj is Vehicle vehicle)
            Vehicles.Add(obj.ObjectId.Coid, vehicle);
        else if (obj is Character character)
            Characters.Add(obj.ObjectId.Coid, character);

        return true;
    }

    public bool Remove(long coid)
    {
        if (!Objects.TryGetValue(coid, out var obj))
            return false;

        Objects.Remove(coid);

        // Remove from type-indexed collections
        if (obj is Vehicle)
        {
            Vehicles.Remove(coid);
            VehiclesNeedingShieldRegen.Remove(coid);
        }
        else if (obj is Character)
        {
            Characters.Remove(coid);
            CharactersNeedingManaRegen.Remove(coid);
        }

        return true;
    }
    #endregion

    #region Object Lookup
    public Character GetOrLoadCharacter(long coid, CharContext context)
    {
        var character = GetCharacter(coid);
        if (character != null)
            return character;

        context ??= new CharContext();

        character = new Character();
        if (!character.LoadFromDB(context, coid))
            return null;

        if (!character.LoadCurrentVehicle(context))
            return null;

        Add(character);
        Add(character.CurrentVehicle);

        return character;
    }

    public static Character LoadCharacterForSelection(long coid, CharContext context)
    {
        var character = new Character();
        if (!character.LoadFromDB(context, coid, true))
            return null;

        if (!character.LoadCurrentVehicle(context, true))
            return null;

        return character;
    }

    public ClonedObjectBase? GetObject(TFID fid) => GetObject(fid.Coid, fid.Global);

    public ClonedObjectBase? GetObject(long coid, bool global)
    {
        if (Objects.TryGetValue(coid, out var obj))
            return obj;

        return null;
    }

    public Character? GetCharacter(long coid)
    {
        if (Characters.TryGetValue(coid, out var character))
            return character;

        return null;
    }

    public Character? GetCharacterByName(string name)
    {
        return Characters.Values.FirstOrDefault(c => c.Name == name);
    }

    public Vehicle? GetVehicle(long coid)
    {
        if (Vehicles.TryGetValue(coid, out var vehicle))
            return vehicle;

        return null;
    }

    public IEnumerable<Vehicle> GetAllVehicles() => Vehicles.Values;

    public IEnumerable<Character> GetCharacters() => Characters.Values;
    #endregion

    #region Regeneration Tracking
    /// <summary>
    /// Marks a vehicle as needing shield regeneration.
    /// </summary>
    public void MarkNeedsShieldRegen(long vehicleCoid)
    {
        VehiclesNeedingShieldRegen.Add(vehicleCoid);
    }

    /// <summary>
    /// Clears the shield regeneration flag for a vehicle (e.g., when shield reaches max).
    /// </summary>
    public void ClearShieldRegenNeeded(long vehicleCoid)
    {
        VehiclesNeedingShieldRegen.Remove(vehicleCoid);
    }

    /// <summary>
    /// Marks a character as needing mana regeneration.
    /// </summary>
    public void MarkNeedsManaRegen(long characterCoid)
    {
        CharactersNeedingManaRegen.Add(characterCoid);
    }

    /// <summary>
    /// Clears the mana regeneration flag for a character (ie, when mana reaches max).
    /// </summary>
    public void ClearManaRegenNeeded(long characterCoid)
    {
        CharactersNeedingManaRegen.Remove(characterCoid);
    }

    /// <summary>
    /// Returns vehicles that need shield regeneration. Only iterates entities that actually need regen.
    /// </summary>
    public IEnumerable<Vehicle> GetVehiclesNeedingShieldRegen()
    {
        foreach (var coid in VehiclesNeedingShieldRegen)
        {
            if (Vehicles.TryGetValue(coid, out var vehicle))
                yield return vehicle;
        }
    }

    /// <summary>
    /// Returns characters that need mana regeneration. Only iterates entities that actually need regen.
    /// </summary>
    public IEnumerable<Character> GetCharactersNeedingManaRegen()
    {
        foreach (var coid in CharactersNeedingManaRegen)
        {
            if (Characters.TryGetValue(coid, out var character))
                yield return character;
        }
    }
    #endregion
}
