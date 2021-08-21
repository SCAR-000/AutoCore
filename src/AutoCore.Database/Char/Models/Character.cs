using System.ComponentModel.DataAnnotations.Schema;

namespace AutoCore.Database.Char.Models
{
    [Table("character")]
    public class Character
    {
        public ulong Coid { get; set; }
    }
}
