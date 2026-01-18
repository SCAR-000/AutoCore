-- Migration script to rename Mana columns to Power columns
-- Run this script against your database to update the schema
-- 
-- Note: If you get an error saying a column doesn't exist, it may already be renamed.
-- You can safely ignore those errors and continue.

-- Rename CurrentMana to CurrentPower (if it exists)
-- If the column doesn't exist, you'll get an error - that's okay, it may already be renamed
ALTER TABLE `character_stats` 
CHANGE COLUMN `CurrentMana` `CurrentPower` SMALLINT NOT NULL DEFAULT 100;

-- Rename MaxMana to MaxPower (if it exists)
-- If the column doesn't exist, you'll get an error - that's okay, it may already be renamed
ALTER TABLE `character_stats` 
CHANGE COLUMN `MaxMana` `MaxPower` SMALLINT NOT NULL DEFAULT 100;

