namespace LogManager.Server.Models;

public class WeekFile
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public required string Name { get; set; }
    public required string Content { get; set; }
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public User? User { get; set; }
}
