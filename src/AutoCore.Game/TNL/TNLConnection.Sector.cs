namespace AutoCore.Game.TNL;

using AutoCore.Database.Char;
using AutoCore.Database.Char.Models;
using AutoCore.Game.Managers;
using AutoCore.Game.Packets.Sector;

public partial class TNLConnection
{
    private void HandleTransferFromGlobalPacket(BinaryReader reader)
    {
        var packet = new TransferFromGlobalPacket();
        packet.Read(reader);

        // TODO: validate security key with info received from communicator or DB value or something...
        using var context = new CharContext();

        CurrentCharacter = ObjectManager.Instance.GetOrLoadCharacter(packet.CharacterCoid, context);
        if (CurrentCharacter == null)
        {
            Disconnect("Invalid character");

            return;
        }

        if (!LoginManager.Instance.LoginToSector(this, CurrentCharacter.AccountId))
        {
            Disconnect("Invalid Username or password!");

            return;
        }

        var mapInfoPacket = new MapInfoPacket();

        var map = MapManager.Instance.GetMap(CurrentCharacter.LastTownId);

        CurrentCharacter.SetOwningConnection(this);
        CurrentCharacter.GMLevel = Account.Level;
        CurrentCharacter.SetMap(map);
        CurrentCharacter.CurrentVehicle.SetMap(map);

        map.Fill(mapInfoPacket);

        SendGamePacket(mapInfoPacket, skipOpcode: true);
    }

    private void HandleTransferFromGlobalStage2Packet(BinaryReader reader)
    {
        var packet = new TransferFromGlobalPacket();
        packet.Read(reader);

        var character = ObjectManager.Instance.GetCharacter(packet.CharacterCoid);
        if (character == null)
        {
            Disconnect("Invalid character");

            return;
        }

        SendGamePacket(new TransferFromGlobalStage3Packet
        {
            SecurityKey = packet.SecurityKey,
            CharacterCoid = packet.CharacterCoid,
            PositionX = character.Position.X,
            PositionY = character.Position.Y,
            PositionZ = character.Position.Z
        });
    }

    private void HandleTransferFromGlobalStage3Packet(BinaryReader reader)
    {
        var packet = new TransferFromGlobalStage3Packet();
        packet.Read(reader);

        var character = ObjectManager.Instance.GetCharacter(packet.CharacterCoid);
        if (character == null)
        {
            Disconnect("Invalid character");

            return;
        }

        if (!Ghosting)
            ActivateGhosting();

        character.CreateGhost();
        character.CurrentVehicle.CreateGhost();

        SetScopeObject(character.Ghost);

        ObjectLocalScopeAlways(character.Ghost);
        ObjectLocalScopeAlways(character.CurrentVehicle.Ghost);

        // Prime character stats cache before building packets
        CharacterStatManager.Instance.GetOrLoad(character.ObjectId.Coid);

        var charPacket = new CreateCharacterExtendedPacket();
        var vehiclePacket = new CreateVehicleExtendedPacket();

        character.WriteToPacket(charPacket);
        character.CurrentVehicle.WriteToPacket(vehiclePacket);

        SendGamePacket(vehiclePacket);
        SendGamePacket(charPacket);
        
        // Send character stats packet so client receives attribute points and other stats
        SendGamePacket(CharacterStatManager.Instance.BuildPacket(character));

        // Send QuickBarUpdate packets for each skill in quickbar
        List<CharacterQuickBarSkillData> quickBarSkills;
        try
        {
            using var quickBarContext = new CharContext();
            quickBarSkills = quickBarContext.Set<CharacterQuickBarSkillData>()
                .Where(qb => qb.CharacterCoid == character.ObjectId.Coid && qb.SkillId != 0)
                .OrderBy(qb => qb.SlotIndex)
                .ToList();
        }
        catch (Exception ex) when (ex.Message.Contains("character_quickbar_skills") && ex.Message.Contains("doesn't exist"))
        {
            // Existing DB may not have been bootstrapped yet. Ensure schema and retry once.
            CharContext.EnsureCreated();

            using var quickBarContext = new CharContext();
            quickBarSkills = quickBarContext.Set<CharacterQuickBarSkillData>()
                .Where(qb => qb.CharacterCoid == character.ObjectId.Coid && qb.SkillId != 0)
                .OrderBy(qb => qb.SlotIndex)
                .ToList();
        }

        foreach (var quickBarSkill in quickBarSkills)
        {
            var updatePacket = new QuickBarUpdatePacket
            {
                SlotIndex = quickBarSkill.SlotIndex,
                SkillId = quickBarSkill.SkillId,
                ItemCoid = 0
            };
            SendGamePacket(updatePacket);
        }
    }

    private void HandleCreatureMovedPacket(BinaryReader reader)
    {
        var packet = new CreatureMovedPacket();
        packet.Read(reader);

        CurrentCharacter.HandleMovement(packet);
    }

    private void HandleVehicleMovedPacket(BinaryReader reader)
    {
        var packet = new VehicleMovedPacket();
        packet.Read(reader);

        CurrentCharacter.CurrentVehicle.HandleMovement(packet);
    }

    private void HandleSkillIncrementPacket(BinaryReader reader)
    {
        var packet = new SkillIncrementPacket();
        packet.Read(reader);

        Console.WriteLine("SkillIncrement opcode received - SkillID: {0}", packet.SkillID);

        if (CurrentCharacter == null)
            return;

        // Validate skill exists and character meets level requirement
        var skill = AssetManager.Instance.GetSkill(packet.SkillID);
        if (skill == null)
        {
            Console.WriteLine("SkillIncrement failed: Skill {0} does not exist", packet.SkillID);
            return;
        }

        if (CurrentCharacter.Level < skill.MinimumLevel)
        {
            Console.WriteLine("SkillIncrement failed: Character level {0} does not meet skill {1} minimum level requirement of {2}", 
                CurrentCharacter.Level, packet.SkillID, skill.MinimumLevel);
            return;
        }

        // Persist learned skill / rank and optionally add to QuickBarSkills (first empty slot).
        // Note: Quickbar presence should NOT gate persistence of skill ranks.
        using var context = new CharContext();

        // Upsert skill rank (insert if new, otherwise increment).
        CharacterSkillRankData existingRank;
        try
        {
            existingRank = context.Set<CharacterSkillRankData>()
                .FirstOrDefault(sr => sr.CharacterCoid == CurrentCharacter.ObjectId.Coid && sr.SkillId == packet.SkillID);
        }
        catch (Exception ex) when (ex.Message.Contains("character_skill_rank") && ex.Message.Contains("doesn't exist"))
        {
            CharContext.EnsureCreated();
            existingRank = context.Set<CharacterSkillRankData>()
                .FirstOrDefault(sr => sr.CharacterCoid == CurrentCharacter.ObjectId.Coid && sr.SkillId == packet.SkillID);
        }

        if (existingRank == null)
        {
            context.Set<CharacterSkillRankData>().Add(new CharacterSkillRankData
            {
                CharacterCoid = CurrentCharacter.ObjectId.Coid,
                SkillId = packet.SkillID,
                Rank = 1
            });
        }
        else
        {
            existingRank.Rank++;
        }

        // Check if skill already exists in quickbar (only used to decide whether to add it)
        CharacterQuickBarSkillData existingQuickBarSkill;
        try
        {
            existingQuickBarSkill = context.Set<CharacterQuickBarSkillData>()
                .FirstOrDefault(qb => qb.CharacterCoid == CurrentCharacter.ObjectId.Coid && qb.SkillId == packet.SkillID);
        }
        catch (Exception ex) when (ex.Message.Contains("character_quickbar_skills") && ex.Message.Contains("doesn't exist"))
        {
            // Existing DB may not have been bootstrapped yet. Ensure schema and retry once.
            CharContext.EnsureCreated();

            existingQuickBarSkill = context.Set<CharacterQuickBarSkillData>()
                .FirstOrDefault(qb => qb.CharacterCoid == CurrentCharacter.ObjectId.Coid && qb.SkillId == packet.SkillID);
        }

        var insertedIntoQuickbar = false;
        var insertedQuickbarSlot = -1;
        if (existingQuickBarSkill == null)
        {
            // Load all existing quickbar slots
            HashSet<int> existingSlots;
            try
            {
                existingSlots = context.Set<CharacterQuickBarSkillData>()
                    .Where(qb => qb.CharacterCoid == CurrentCharacter.ObjectId.Coid)
                    .Select(qb => qb.SlotIndex)
                    .ToHashSet();
            }
            catch (Exception ex) when (ex.Message.Contains("character_quickbar_skills") && ex.Message.Contains("doesn't exist"))
            {
                CharContext.EnsureCreated();

                existingSlots = context.Set<CharacterQuickBarSkillData>()
                    .Where(qb => qb.CharacterCoid == CurrentCharacter.ObjectId.Coid)
                    .Select(qb => qb.SlotIndex)
                    .ToHashSet();
            }

            // Find first empty slot (0-99)
            int emptySlot = -1;
            for (int i = 0; i < 100; i++)
            {
                if (!existingSlots.Contains(i))
                {
                    emptySlot = i;
                    break;
                }
            }

            if (emptySlot >= 0)
            {
                context.Set<CharacterQuickBarSkillData>().Add(new CharacterQuickBarSkillData
                {
                    CharacterCoid = CurrentCharacter.ObjectId.Coid,
                    SlotIndex = emptySlot,
                    SkillId = packet.SkillID
                });
                insertedIntoQuickbar = true;
                insertedQuickbarSlot = emptySlot;
            }
        }

        // Save all DB changes in one go.
        // (If quickbar table was missing, EnsureCreated() above will have created it.)
        try
        {
            context.SaveChanges();
        }
        catch (Exception ex) when (
            (ex.Message.Contains("character_quickbar_skills") && ex.Message.Contains("doesn't exist")) ||
            (ex.Message.Contains("character_skill_rank") && ex.Message.Contains("doesn't exist")))
        {
            CharContext.EnsureCreated();
            context.SaveChanges();
        }

        // Send QuickBarUpdate to client only if we inserted it into the bar.
        if (insertedIntoQuickbar && insertedQuickbarSlot >= 0)
        {
            SendGamePacket(new QuickBarUpdatePacket
            {
                SlotIndex = insertedQuickbarSlot,
                SkillId = packet.SkillID,
                ItemCoid = 0
            });
        }
    }
}
