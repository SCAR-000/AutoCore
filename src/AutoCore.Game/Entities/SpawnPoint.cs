namespace AutoCore.Game.Entities;

using AutoCore.Game.Constants;
using AutoCore.Game.CloneBases;
using AutoCore.Game.EntityTemplates;
using AutoCore.Game.Managers;
using AutoCore.Utils;
using System.Diagnostics;

public class SpawnPoint : ClonedObjectBase
{
    // NOTE: Let's not duplicate this data, if we don't need to create new spawnpoints manually!
    public SpawnPointTemplate Template { get; }

    public override int GetBareTeamFaction() => Faction;
    public override int GetCurrentHP() => CloneBaseObject.SimpleObjectSpecific.MaxHitPoint;
    public override int GetMaximumHP() => CloneBaseObject.SimpleObjectSpecific.MaxHitPoint;

    public SpawnPoint(SpawnPointTemplate template)
    {
        Template = template;
    }

    public override void CreateGhost()
    {
        // NO GHOST!
    }

    public bool Spawn()
    {
        var spawnList = Template.GetSpawn();
        if (spawnList == null)
            return false;

        // TODO: load templates from wad.xml and use them?
        if (spawnList.IsTemplate)
            return false;

        var cloneBase = AssetManager.Instance.GetCloneBase(spawnList.SpawnType);
        if (cloneBase == null)
            return false;

        if (cloneBase.Type == CloneBaseObjectType.Creature)
        {
            var creature = SpawnCreature(cloneBase.CloneBaseSpecific.CloneBaseId);
            if (creature == null)
                return false;
        }
        else if (cloneBase.Type == CloneBaseObjectType.Vehicle)
        {
            var vehicle = SpawnVehicle(cloneBase.CloneBaseSpecific.CloneBaseId);
            if (vehicle == null)
                return false;

            // TODO: spawn driver also (driverid in templates)
        }
        else
            Logger.WriteLog(LogType.Error, $"SpawnPoint {Template.COID} wants to spawn object with type {cloneBase.Type}!");

        return true;
    }

    private Creature SpawnCreature(int cbid)
    {
        // TODO: faction of the creature should be the faction of the spawnpoint?

        var creature = new Creature();
        creature.SetCoid(Map.LocalCoidCounter++, false);
        creature.LoadCloneBase(cbid);
        creature.SetupCBFields();
        creature.Layer = Layer;
        creature.Position = Position;
        creature.Rotation = Rotation;
        creature.SpawnOwner = ObjectId.Coid;
        creature.SetMap(Map);
        creature.CreateGhost();

        return creature;
    }

    private Vehicle SpawnVehicle(int cbid)
    {
        var vehicle = new Vehicle();
        vehicle.SetCoid(Map.LocalCoidCounter++, false);
        vehicle.LoadCloneBase(cbid);
        vehicle.SetupCBFields();
        vehicle.Layer = Layer;
        vehicle.Position = Position;
        vehicle.Rotation = Rotation;
        vehicle.SetMap(Map);
        vehicle.CreateGhost();

        return vehicle;
    }
}
