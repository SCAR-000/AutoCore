-- Ensure all characters have stats entries with Tech level >= 1
-- This script ensures that all existing characters in the database have
-- character_stats entries with AttributeTech >= 1 (defaults to 1 if missing)
--
-- HP Calculation: Base 100 HP at Tech level 1, +3 HP per Tech level above 1
-- Formula: 100 + (Tech - 1) * 3

-- Insert missing stats entries for characters that don't have them
INSERT IGNORE INTO character_stats (CharacterCoid, Currency, Experience, CurrentMana, MaxMana, AttributeTech, AttributeCombat, AttributeTheory, AttributePerception, AttributePoints, SkillPoints, ResearchPoints)
SELECT 
    c.Coid AS CharacterCoid,
    0 AS Currency,
    0 AS Experience,
    100 AS CurrentMana,
    100 AS MaxMana,
    1 AS AttributeTech,  -- Default to Tech level 1
    1 AS AttributeCombat,
    1 AS AttributeTheory,
    1 AS AttributePerception,
    0 AS AttributePoints,
    0 AS SkillPoints,
    0 AS ResearchPoints
FROM character c
WHERE NOT EXISTS (
    SELECT 1 FROM character_stats cs WHERE cs.CharacterCoid = c.Coid
);

-- Update any existing stats entries that have Tech < 1 to ensure Tech >= 1
UPDATE character_stats
SET AttributeTech = 1
WHERE AttributeTech < 1;

-- Also ensure other attributes are at least 1
UPDATE character_stats
SET 
    AttributeCombat = GREATEST(AttributeCombat, 1),
    AttributeTheory = GREATEST(AttributeTheory, 1),
    AttributePerception = GREATEST(AttributePerception, 1)
WHERE AttributeCombat < 1 OR AttributeTheory < 1 OR AttributePerception < 1;

