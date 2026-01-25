namespace AutoCore.Game.Managers;

using System.Text;
using AutoCore.Game.Constants;
using AutoCore.Game.Entities;
using AutoCore.Game.Packets.Sector;
using AutoCore.Game.Structures;
using AutoCore.Utils.Memory;

public class SkillManager : Singleton<SkillManager>
{
    public SkillResponse CastSkill(
        ClonedObjectBase caster,
        TFID targetFid,
        int skillId,
        int skillLevel,
        Vector3? targetPosition = null)
    {
        if (caster == null)
            return SkillResponse.GenericFailed;

        if (skillLevel <= 0)
            skillLevel = 1;

        var skill = AssetManager.Instance.GetSkill(skillId);
        if (skill == null)
        {
            SendDebugToCaster(caster, $"Skill {skillId} not found.");
            SendSkillResponse(caster, skillId, SkillResponse.GenericFailed);
            return SkillResponse.GenericFailed;
        }

        var target = ResolveTarget(caster, targetFid);
        var rangeMin = GetElementValue(skill, SkillElementType.RangeMin, skillLevel);
        var range = GetElementValue(skill, SkillElementType.Range, skillLevel);

        if (target != null && (rangeMin > 0 || range > 0))
        {
            var distance = caster.Position.Dist(target.Position);
            if ((rangeMin > 0 && distance < rangeMin) || (range > 0 && distance > range))
            {
                SendDebugToCaster(caster, $"Cast failed (range). Target distance={distance:0.##}, range={rangeMin:0.##}-{range:0.##}.");
                SendSkillResponse(caster, skillId, SkillResponse.Range);
                return SkillResponse.Range;
            }
        }

        var effects = new List<string>();
        foreach (var element in skill.Elements)
        {
            var elementType = (SkillElementType)element.ElementType;
            var value = GetScaledValue(element, skillLevel);

            switch (elementType)
            {
                case SkillElementType.Physical:
                case SkillElementType.Fire:
                case SkillElementType.Ice:
                case SkillElementType.Corrosion:
                case SkillElementType.Spirit:
                case SkillElementType.Energy:
                    effects.Add($"Damage {elementType}: {value:0.##}");
                    break;
                case SkillElementType.Heal:
                    effects.Add($"Heal: {value:0.##}");
                    break;
                case SkillElementType.Range:
                case SkillElementType.RangeMin:
                    effects.Add($"Range: {value:0.##}");
                    break;
                case SkillElementType.Cost:
                    effects.Add($"Cost: {value:0.##}");
                    break;
                default:
                    break;
            }
        }

        var targetLabel = target != null ? $" target=0x{target.ObjectId.Coid:X}" : " target=none";
        var effectText = effects.Count > 0 ? string.Join(" | ", effects) : "no immediate effects";
        SendDebugToCaster(caster, $"Skill {skill.Name} ({skill.Id}) L{skillLevel}:{targetLabel} -> {effectText}");

        SendSkillHeartbeat(caster, targetFid, skill, skillLevel);
        // Pretty sure the server should only send this when the client requests to use the skill
        //SendSkillResponse(caster, skillId, SkillResponse.Ok);

        return SkillResponse.Ok;
    }

    private static ClonedObjectBase ResolveTarget(ClonedObjectBase caster, TFID targetFid)
    {
        if (targetFid.Coid != 0 && targetFid.Coid != -1)
        {
            var obj = ObjectManager.Instance.GetObject(targetFid);
            if (obj != null)
                return obj;
        }

        if (caster.Target != null)
            return caster.Target;

        return null;
    }

    private static float GetElementValue(Skill skill, SkillElementType elementType, int skillLevel)
    {
        foreach (var element in skill.Elements)
        {
            if (element.ElementType == (int)elementType)
                return GetScaledValue(element, skillLevel);
        }

        return 0f;
    }

    private static float GetScaledValue(SkillElement element, int skillLevel)
    {
        return element.ValueBase + element.ValuePerLevel * skillLevel;
    }

    private static void SendDebugToCaster(ClonedObjectBase caster, string message)
    {
        var connection = caster.GetSuperCharacter(true)?.OwningConnection;
        if (connection == null)
            return;

        var length = Encoding.UTF8.GetByteCount(message) + 1;
        var packet = new BroadcastPacket
        {
            ChatType = ChatType.SystemMessage,
            SenderCoid = 0,
            IsGM = true,
            MessageLength = (short)length,
            Sender = "System",
            Message = message
        };

        connection.SendGamePacket(packet);
    }

    private static void SendSkillHeartbeat(ClonedObjectBase caster, TFID targetFid, Skill skill, int skillLevel)
    {
        var connection = caster.GetSuperCharacter(true)?.OwningConnection;
        if (connection == null)
            return;

        var packet = new CreateSkillHeartbeat
        {
            LastTickCount = Environment.TickCount,
            DiceSeed = Random.Shared.Next(),
            SkillId = (ushort)skill.Id,
            SkillLevel = (short)skillLevel,
            Target = targetFid,
            ForceDeath = false,
            SkillType = skill.SkillType,
            DurationCountdown = 0,
            Caster = caster.ObjectId
        };

        connection.SendGamePacket(packet);
    }

    private static void SendSkillResponse(ClonedObjectBase caster, int skillId, SkillResponse response)
    {
        var connection = caster.GetSuperCharacter(true)?.OwningConnection;
        if (connection == null)
            return;

        var packet = new SkillResponsePacket
        {
            SkillId = skillId,
            Response = response
        };

        connection.SendGamePacket(packet);
    }
}

