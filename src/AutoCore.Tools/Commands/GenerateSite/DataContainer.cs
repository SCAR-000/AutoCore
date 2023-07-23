namespace AutoCore.Tools.Commands.GenerateSite;

using AutoCore.Game.CloneBases.Prefixes;
using AutoCore.Game.Entities;
using AutoCore.Game.Mission;
using AutoCore.Game.Structures;

public class DataContainer
{
    public Dictionary<string, List<ClonedObjectBase>> Objects { get; } = new();
    public Dictionary<int, Mission> Missions { get; } = new();
    public Dictionary<int, Skill> Skills { get; } = new();
    public Dictionary<string, List<PrefixBase>> Prefixes { get; } = new();

    public void AddObject(ClonedObjectBase obj)
    {
        var type = obj.Type.ToString();

        if (!Objects.ContainsKey(type))
            Objects[type] = new();

        Objects[type].Add(obj);
    }

    public void AddMission(Mission mission) => Missions.Add(mission.Id, mission);
    public void AddSkill(Skill skill) => Skills.Add(skill.Id, skill);

    public void AddPrefix(PrefixBase prefix)
    {
        var type = prefix.GetType().Name[6..];

        if (!Prefixes.ContainsKey(type))
            Prefixes[type] = new();

        Prefixes[type].Add(prefix);
    }
}
