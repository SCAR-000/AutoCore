using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace AutoCore.Database.Char.Models;

[Table("character_quickbar_skills")]
public class CharacterQuickBarSkillData
{
    [Key]
    public long CharacterCoid { get; set; }

    [Key]
    public int SlotIndex { get; set; }

    public int SkillId { get; set; }

    [ForeignKey("CharacterCoid")]
    public CharacterData Character { get; set; }
}

