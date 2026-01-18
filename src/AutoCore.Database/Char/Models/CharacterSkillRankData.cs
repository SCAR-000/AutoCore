using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace AutoCore.Database.Char.Models;

[Table("character_skill_rank")]
public class CharacterSkillRankData
{
    [Key]
    public long CharacterCoid { get; set; }

    [Key]
    public int SkillId { get; set; }

    public short Rank { get; set; }

    [ForeignKey("CharacterCoid")]
    public CharacterData Character { get; set; }
}

