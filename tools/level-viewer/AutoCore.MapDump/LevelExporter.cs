using AutoCore.Database.World.Models;
using AutoCore.Game.CloneBases;
using AutoCore.Game.Constants;
using AutoCore.Game.Entities;
using AutoCore.Game.EntityTemplates;
using AutoCore.Game.Map;
using AutoCore.Game.Managers;
using AutoCore.Game.Structures;

namespace AutoCore.MapDump;

public static class LevelExporter
{
    public static LevelDto DumpMap(string famPath, string stem)
    {
        var bytes = File.ReadAllBytes(famPath);

        var version = BitConverter.ToInt32(bytes, 0);
        var whOffset = version >= 27 ? 8 : 4;
        var width = BitConverter.ToInt32(bytes, whOffset);
        var height = BitConverter.ToInt32(bytes, whOffset + 4);

        var continent = new ContinentObject { Id = 0, MapFileName = stem };
        var mapData = new MapData(continent);
        using (var reader = new BinaryReader(new MemoryStream(bytes)))
            mapData.Read(reader);

        var level = new LevelDto
        {
            Name = stem,
            Terrain = new TerrainDto
            {
                Width = width,
                Height = height,
                GridSize = mapData.GridSize,
                HeightScale = 4.0f,
                TileSet = mapData.TileSet,
                SkyBox = mapData.SkyBoxName,
                Entry = new[] { mapData.EntryPoint.X, mapData.EntryPoint.Y, mapData.EntryPoint.Z },
                Tga = $"assets/extracted/textures/{stem}.tga",
            },
            MapLogic = new MapLogicDto
            {
                PerPlayerLoadTrigger = mapData.PerPlayerLoadTrigger,
                CreatorLoadTrigger = mapData.CreatorLoadTrigger,
                OnKillTrigger = mapData.OnKillTrigger,
                LastTeamTrigger = mapData.LastTeamTrigger,
            },
        };

        foreach (var variable in mapData.Variables.Values)
        {
            level.MapLogic.Variables.Add(new VariableDto
            {
                Id = variable.Id,
                Type = variable.Type,
                Value = variable.Value,
                InitialValue = variable.InitialValue,
                Name = variable.Name,
            });
        }

        foreach (var template in mapData.Templates.Values)
        {
            switch (template)
            {
                case TriggerTemplate tt:
                    level.Triggers.Add(MapTrigger(tt));
                    break;

                case ReactionTemplate rt:
                    level.Reactions.Add(MapReaction(rt));
                    break;

                case SpawnPointTemplate sp:
                {
                    var marker = MakeMarker("spawn", sp.CBID, sp.COID, sp.Location.X, sp.Location.Y, sp.Location.Z);
                    level.Markers.Add(marker);
                    IndexMarker(level, marker);
                    break;
                }

                case EnterPointTemplate ep:
                {
                    var marker = MakeMarker("enter", ep.CBID, ep.COID, ep.Location.X, ep.Location.Y, ep.Location.Z);
                    level.Markers.Add(marker);
                    IndexMarker(level, marker);
                    break;
                }

                case StoreTemplate st:
                {
                    var marker = MakeMarker("store", st.CBID, st.COID, st.Location.X, st.Location.Y, st.Location.Z, st.Name);
                    level.Markers.Add(marker);
                    IndexMarker(level, marker);
                    break;
                }

                case OutpostTemplate op:
                {
                    var marker = MakeMarker("outpost", op.CBID, op.COID, op.Location.X, op.Location.Y, op.Location.Z, op.Name);
                    level.Markers.Add(marker);
                    IndexMarker(level, marker);
                    break;
                }

                case MapPathTemplate mp:
                {
                    var path = new PathDto
                    {
                        Name = mp.PathName,
                        Coid = mp.COID,
                        Points = mp.Points.Select(pt => new[] { pt.Position.X, pt.Position.Y, pt.Position.Z }).ToList(),
                    };
                    level.Paths.Add(path);
                    IndexEntry(level, mp.COID, "path", mp.PathName, null, mp.CBID);
                    break;
                }

                case GraphicsObjectTemplate go:
                {
                    var (physics, unique, shortDesc, typeName, cloneScale, collidable) = ResolveNames(go.CBID);
                    var obj = new ObjectDto
                    {
                        Cbid = go.CBID,
                        Coid = go.COID,
                        Pos = new[] { go.Location.X, go.Location.Y, go.Location.Z },
                        Rot = new[] { go.Rotation.X, go.Rotation.Y, go.Rotation.Z, go.Rotation.W },
                        Scale = go.Scale <= 0 ? 1f : go.Scale,
                        CloneScale = cloneScale,
                        TerrainOffset = go.TerrainOffset,
                        IsActive = go.IsActive,
                        FxCreateExtraName = Clean(go.FxCreateExtraName),
                        Physics = physics,
                        Unique = unique,
                        Short = shortDesc,
                        Type = typeName,
                        Collidable = collidable,
                        TriggerEvents = go.TriggerEvents?.Length > 0 ? go.TriggerEvents : null,
                    };
                    level.Objects.Add(obj);
                    IndexEntry(level, go.COID, "object", unique ?? shortDesc ?? physics ?? typeName, obj.Pos, go.CBID);
                    break;
                }
            }
        }

        foreach (var node in mapData.RoadNodes)
        {
            var dto = new RoadNodeDto
            {
                Id = node.UniqueId,
                Pos = new[] { node.Position.X, node.Position.Y, node.Position.Z },
                Tex = Clean(node.FileName),
                Links = node.NodeIds.ToList(),
            };
            switch (node)
            {
                case RoadNodeJunction j:
                    dto.Type = "junction";
                    dto.Rotation = j.Rotation;
                    dto.ArmPos = j.Positions.Select(p => new[] { p.X, p.Y, p.Z }).ToList();
                    dto.ArmDir = j.Directions.Select(d => new[] { d.X, d.Y, d.Z }).ToList();
                    break;
                case RiverNode r:
                    dto.Type = "river";
                    dto.WaterDepth = r.WaterDepth;
                    break;
            }
            level.Roads.Add(dto);
        }

        var reactionsByCoid = level.Reactions.ToDictionary(r => (long)r.Coid);
        var variables = level.MapLogic.Variables.ToDictionary(v => v.Id);

        foreach (var trigger in level.Triggers)
        {
            IndexEntry(level, trigger.Coid, "trigger", trigger.Name ?? "Trigger", trigger.Pos, trigger.Cbid);
            trigger.Graph = TriggerGraphResolver.ResolveTriggerGraph(trigger, reactionsByCoid, level.ObjectIndex, variables);
        }

        foreach (var reaction in level.Reactions)
        {
            IndexEntry(level, reaction.Coid, "reaction", reaction.Name ?? reaction.ReactionType, null, reaction.Cbid);
        }

        return level;
    }

    private static TriggerDto MapTrigger(TriggerTemplate tt)
    {
        var dto = new TriggerDto
        {
            Cbid = tt.CBID,
            Coid = tt.COID,
            Pos = new[] { tt.Location.X, tt.Location.Y, tt.Location.Z },
            Rot = new[] { tt.Rotation.X, tt.Rotation.Y, tt.Rotation.Z, tt.Rotation.W },
            Scale = tt.Scale <= 0 ? 1f : tt.Scale,
            Name = Clean(tt.Name),
            RetriggerDelay = tt.RetriggerDelay,
            ActivateDelay = tt.ActivateDelay,
            ActivationCount = tt.ActivationCount,
            TargetType = tt.TargetType.ToString(),
            DoCollision = tt.DoCollision,
            DoConditionals = tt.DoConditionals,
            ShowMapTransitionDecals = tt.ShowMapTransitionDecals,
            DoOnActivate = tt.DoOnActivate,
            AllConditionsNeeded = tt.AllConditionsNeeded,
            ApplyToAllColliders = tt.ApplyToAllColliders,
            Color = tt.Color,
            TriggerId = tt.TriggerId,
        };

        dto.Reactions.AddRange(tt.Reactions);
        foreach (var target in tt.TargetList)
            dto.TargetList.Add(new TargetRefDto { Global = target.Global, Coid = target.Coid });

        foreach (var cond in tt.Conditions)
        {
            dto.Conditions.Add(new ConditionalDto
            {
                LeftId = cond.LeftId,
                RightId = cond.RightId,
                Type = cond.Type.ToString(),
            });
        }

        return dto;
    }

    private static ReactionDto MapReaction(ReactionTemplate rt)
    {
        var dto = new ReactionDto
        {
            Cbid = rt.CBID,
            Coid = rt.COID,
            Name = Clean(rt.Name),
            ReactionType = rt.ReactionType.ToString(),
            ActOnActivator = rt.ActOnActivator,
            ObjectiveIDCheck = rt.ObjectiveIDCheck,
            DoForConvoy = rt.DoForConvoy,
            GenericVar1 = rt.GenericVar1,
            GenericVar2 = rt.GenericVar2,
            GenericVar3 = rt.GenericVar3,
            AllConditionsNeeded = rt.AllConditionsNeeded,
            DoForAllPlayers = rt.DoForAllPlayers,
            MiscText = Clean(rt.MiscText),
            WaypointType = rt.WaypointType.ToString(),
            WaypointText = Clean(rt.WaypointText),
        };

        if (rt.ReactionType == ReactionType.TransferMap)
        {
            dto.MapTransfer = rt.MapTransfer.ToString();
            dto.MapTransferData = rt.MapTransferData;
        }

        dto.Objects.AddRange(rt.Objects);
        dto.Reactions.AddRange(rt.Reactions);
        dto.MissionTypes.AddRange(rt.MissionTypes);
        dto.Missions.AddRange(rt.Missions);

        foreach (var cond in rt.Conditions)
        {
            dto.Conditions.Add(new ConditionalDto
            {
                LeftId = cond.LeftId,
                RightId = cond.RightId,
                Type = cond.Type.ToString(),
            });
        }

        if (rt.Text != null)
        {
            dto.Text = new ReactionTextDto
            {
                Type = rt.Text.Type.ToString(),
                TargetType = rt.Text.TargetType.ToString(),
                Main = Clean(rt.Text.Main),
            };
            foreach (var choice in rt.Text.Choices)
            {
                dto.Text.Choices.Add(new ReactionTextChoiceDto
                {
                    TriggerCoid = choice.TriggerCoid,
                    Text = Clean(choice.Text),
                });
            }

            foreach (var param in rt.Text.Params)
            {
                dto.Text.Params.Add(new ReactionTextParamDto
                {
                    Type = param.Type.ToString(),
                    Id = param.Id,
                    CachedValue = param.CachedValue,
                });
            }
        }

        return dto;
    }

    private static MarkerDto MakeMarker(string kind, int cbid, int coid, float x, float y, float z, string? label = null)
    {
        var (_, unique, shortDesc, _, _, _) = ResolveNames(cbid);
        return new MarkerDto
        {
            Kind = kind,
            Cbid = cbid,
            Coid = coid,
            Pos = new[] { x, y, z },
            Label = label ?? unique ?? shortDesc,
        };
    }

    private static void IndexMarker(LevelDto level, MarkerDto marker)
    {
        IndexEntry(level, marker.Coid, marker.Kind, marker.Label ?? marker.Kind, marker.Pos, marker.Cbid);
    }

    private static void IndexEntry(LevelDto level, int coid, string kind, string? label, float[]? pos, int cbid)
    {
        level.ObjectIndex[coid.ToString()] = new ObjectIndexEntryDto
        {
            Kind = kind,
            Label = label,
            Pos = pos,
            Cbid = cbid,
        };
    }

    /// <summary>Bit 0 of SimpleObjectSpecific.Flags = bitCollidable from tSimpleObject.</summary>
    private const short FlagCollidable = 0x0001;

    private static (string? physics, string? unique, string? shortDesc, string type, float cloneScale, bool collidable) ResolveNames(int cbid)
    {
        var cb = AssetManager.Instance.GetCloneBase(cbid);
        if (cb == null)
            return (null, null, null, "Unknown", 1f, true);

        string? physics = null;
        var cloneScale = 1f;
        var collidable = true;

        // Graphics-only objects (CloneBaseObjectType.Object = 1) never have physics.
        if (cb.Type == CloneBaseObjectType.Object)
            collidable = false;

        if (cb is CloneBaseObject obj)
        {
            physics = Clean(obj.SimpleObjectSpecific.PhysicsName);
            cloneScale = obj.SimpleObjectSpecific.Scale;

            // For ObjectGraphicsPhysics, check the authoritative bitCollidable flag.
            if (cb.Type == CloneBaseObjectType.ObjectGraphicsPhysics)
                collidable = (obj.SimpleObjectSpecific.Flags & FlagCollidable) != 0;
        }

        return (physics, Clean(cb.CloneBaseSpecific.UniqueName), Clean(cb.CloneBaseSpecific.ShortDesc), cb.Type.ToString(), cloneScale, collidable);
    }

    private static string? Clean(string? s)
    {
        if (string.IsNullOrWhiteSpace(s))
            return null;
        s = s.Trim().TrimEnd('\0').Trim();
        return s.Length == 0 ? null : s;
    }
}
