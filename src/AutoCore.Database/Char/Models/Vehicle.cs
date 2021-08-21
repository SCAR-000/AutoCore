using System.ComponentModel.DataAnnotations.Schema;

namespace AutoCore.Database.Char.Models
{
    [Table("vehicle")]
    public class Vehicle
    {
        public ulong Coid { get; set; }
        public ulong OwnerCoid { get; set; }
    }
}
