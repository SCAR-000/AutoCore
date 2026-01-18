namespace AutoCore.Game.Managers;

using AutoCore.Database.Char;
using AutoCore.Database.Char.Models;
using AutoCore.Utils.Memory;

public class HotBarManager : Singleton<HotBarManager>
{
    // The client encodes the raw SlotIndex as a ushort; we normalize it into 0..99.
    private const int TotalSlots = 100;
    private const int Pages = 10;
    private const int SlotsPerPage = 10;

    public int NormalizeSlotIndex(ushort rawSlotIndex)
    {
        // Some clients send direct 0..99.
        if (rawSlotIndex < TotalSlots)
            return rawSlotIndex;

        // Observed pattern: rawSlotIndex looks like (page << 8) | slotWithinPage
        // Example: 0x0004 => page 0 slot 4
        //          0x0104 => page 1 slot 4  (raw 260) => normalized 14
        var slotWithinPage = rawSlotIndex & 0x00FF;
        var page = (rawSlotIndex >> 8) & 0x00FF;

        if (page >= Pages || slotWithinPage >= SlotsPerPage)
            return -1;

        return page * SlotsPerPage + slotWithinPage;
    }

    public ushort EncodeSlotIndex(int normalizedSlotIndex)
    {
        if (normalizedSlotIndex < 0 || normalizedSlotIndex >= TotalSlots)
            return 0;

        var page = normalizedSlotIndex / SlotsPerPage;
        var slotWithinPage = normalizedSlotIndex % SlotsPerPage;

        return (ushort)((page << 8) | slotWithinPage);
    }

    public int NormalizeSkillId(ushort rawSkillId)
    {
        // Observed: 0xFFFF used as "clear slot".
        if (rawSkillId == ushort.MaxValue)
            return 0;

        return rawSkillId;
    }

    public bool ApplySkillSlotUpdate(long characterCoid, ushort rawSlotIndex, ushort rawSkillId)
    {
        var normalizedSlotIndex = NormalizeSlotIndex(rawSlotIndex);
        if (normalizedSlotIndex < 0 || normalizedSlotIndex >= TotalSlots)
        {
            return false;
        }

        var skillId = NormalizeSkillId(rawSkillId);

        // If setting a skill, validate it exists and the character owns it.
        if (skillId != 0)
        {
            var skill = AssetManager.Instance.GetSkill(skillId);
            if (skill == null)
                return false;
        }

        using var context = new CharContext();

        if (skillId != 0)
        {
            CharacterSkillRankData skillRank;
            try
            {
                skillRank = context.Set<CharacterSkillRankData>()
                    .FirstOrDefault(sr => sr.CharacterCoid == characterCoid && sr.SkillId == skillId);
            }
            catch (Exception ex) when (ex.Message.Contains("character_skill_rank") && ex.Message.Contains("doesn't exist"))
            {
                CharContext.EnsureCreated();
                skillRank = context.Set<CharacterSkillRankData>()
                    .FirstOrDefault(sr => sr.CharacterCoid == characterCoid && sr.SkillId == skillId);
            }

            if (skillRank == null)
                return false;
        }

        CharacterQuickBarSkillData existingSlot;
        try
        {
            existingSlot = context.Set<CharacterQuickBarSkillData>()
                .FirstOrDefault(qb => qb.CharacterCoid == characterCoid && qb.SlotIndex == normalizedSlotIndex);
        }
        catch (Exception ex) when (ex.Message.Contains("character_quickbar_skills") && ex.Message.Contains("doesn't exist"))
        {
            CharContext.EnsureCreated();
            existingSlot = context.Set<CharacterQuickBarSkillData>()
                .FirstOrDefault(qb => qb.CharacterCoid == characterCoid && qb.SlotIndex == normalizedSlotIndex);
        }

        if (skillId == 0)
        {
            // Clearing the slot
            if (existingSlot != null)
                context.Set<CharacterQuickBarSkillData>().Remove(existingSlot);
        }
        else
        {
            // Enforce uniqueness: one skill can only exist in one hotbar slot for this character.
            List<CharacterQuickBarSkillData> duplicates;
            try
            {
                duplicates = context.Set<CharacterQuickBarSkillData>()
                    .Where(qb => qb.CharacterCoid == characterCoid && qb.SkillId == skillId && qb.SlotIndex != normalizedSlotIndex)
                    .ToList();
            }
            catch (Exception ex) when (ex.Message.Contains("character_quickbar_skills") && ex.Message.Contains("doesn't exist"))
            {
                CharContext.EnsureCreated();
                duplicates = context.Set<CharacterQuickBarSkillData>()
                    .Where(qb => qb.CharacterCoid == characterCoid && qb.SkillId == skillId && qb.SlotIndex != normalizedSlotIndex)
                    .ToList();
            }

            if (duplicates.Count > 0)
                context.Set<CharacterQuickBarSkillData>().RemoveRange(duplicates);

            if (existingSlot == null)
            {
                context.Set<CharacterQuickBarSkillData>().Add(new CharacterQuickBarSkillData
                {
                    CharacterCoid = characterCoid,
                    SlotIndex = normalizedSlotIndex,
                    SkillId = skillId
                });
            }
            else
            {
                existingSlot.SkillId = skillId;
            }
        }

        try
        {
            context.SaveChanges();
        }
        catch (Exception ex) when (ex.Message.Contains("character_quickbar_skills") && ex.Message.Contains("doesn't exist"))
        {
            CharContext.EnsureCreated();
            context.SaveChanges();
        }

        return true;
    }
}


