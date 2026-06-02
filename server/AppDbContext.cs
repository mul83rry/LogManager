using Microsoft.EntityFrameworkCore;
using LogManager.Server.Models;

namespace LogManager.Server;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<WeekFile> WeekFiles => Set<WeekFile>();

    protected override void OnModelCreating(ModelBuilder m)
    {
        m.Entity<User>().HasIndex(u => u.GoogleId).IsUnique();
        m.Entity<WeekFile>().HasIndex(f => new { f.UserId, f.Name }).IsUnique();
    }
}
