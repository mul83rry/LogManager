using System.IdentityModel.Tokens.Jwt;
using System.Net.Http.Headers;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using LogManager.Server;
using LogManager.Server.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<AppDbContext>(o =>
    o.UseSqlite(builder.Configuration.GetConnectionString("Default") ?? "Data Source=logmanager.db"));

builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod()));

builder.Services.AddHttpClient();

var app = builder.Build();

// ensure DB is created on first run
using (var scope = app.Services.CreateScope())
    scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.EnsureCreated();

app.UseCors();

// ── config ───────────────────────────────────────────────────────────────────
var cfg = app.Configuration;
var googleClientId     = cfg["Google:ClientId"]     ?? throw new Exception("Google:ClientId not set in appsettings.json");
var googleClientSecret = cfg["Google:ClientSecret"] ?? throw new Exception("Google:ClientSecret not set in appsettings.json");
var jwtSecret          = cfg["Jwt:Secret"]          ?? throw new Exception("Jwt:Secret not set in appsettings.json");
var serverBaseUrl      = cfg["ServerBaseUrl"]        ?? throw new Exception("ServerBaseUrl not set in appsettings.json");

var googleCallbackUrl = $"{serverBaseUrl.TrimEnd('/')}/auth/callback";
var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret));

// ── state: pending OAuth sessions (state → redirect_uri, expires) ─────────
var pendingStates = new System.Collections.Concurrent.ConcurrentDictionary<string, (string RedirectUri, DateTime Expires)>();

// ── helpers ──────────────────────────────────────────────────────────────────
string MakeJwt(int userId, string email)
{
    var token = new JwtSecurityToken(
        claims: [new Claim("sub", userId.ToString()), new Claim("email", email)],
        expires: DateTime.UtcNow.AddDays(90),
        signingCredentials: new SigningCredentials(signingKey, SecurityAlgorithms.HmacSha256));
    return new JwtSecurityTokenHandler().WriteToken(token);
}

ClaimsPrincipal? ValidateJwt(string token)
{
    try
    {
        return new JwtSecurityTokenHandler().ValidateToken(token, new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = signingKey,
            ValidateIssuer = false,
            ValidateAudience = false,
        }, out _);
    }
    catch { return null; }
}

int? GetUserId(HttpContext ctx)
{
    var auth = ctx.Request.Headers.Authorization.ToString();
    if (!auth.StartsWith("Bearer ")) return null;
    var principal = ValidateJwt(auth[7..]);
    var sub = principal?.FindFirst("sub")?.Value;
    return sub != null && int.TryParse(sub, out var id) ? id : null;
}

// ── auth: step 1 — extension lands here, we redirect to Google ───────────
app.MapGet("/auth/connect", (string redirect_uri) =>
{
    var state = Convert.ToBase64String(RandomNumberGenerator.GetBytes(24))
        .Replace("+", "-").Replace("/", "_").TrimEnd('=');

    // purge expired
    foreach (var kv in pendingStates.Where(kv => kv.Value.Expires < DateTime.UtcNow).ToList())
        pendingStates.TryRemove(kv.Key, out _);

    pendingStates[state] = (redirect_uri, DateTime.UtcNow.AddMinutes(10));

    var q = new Dictionary<string, string>
    {
        ["client_id"]     = googleClientId,
        ["redirect_uri"]  = googleCallbackUrl,
        ["response_type"] = "code",
        ["scope"]         = "openid email profile",
        ["state"]         = state,
        ["access_type"]   = "online",
        ["prompt"]        = "select_account",
    };
    var url = "https://accounts.google.com/o/oauth2/v2/auth?" +
              string.Join("&", q.Select(kv =>
                  Uri.EscapeDataString(kv.Key) + "=" + Uri.EscapeDataString(kv.Value)));

    return Results.Redirect(url);
});

// ── auth: step 2 — Google redirects back here with code ──────────────────
app.MapGet("/auth/callback", async (string? code, string? state, string? error,
    AppDbContext db, IHttpClientFactory httpFactory) =>
{
    const string failHtml = "<html><body style='font-family:sans-serif;padding:2rem'>" +
                            "<h2>Login failed</h2><p>{0}</p></body></html>";

    if (error != null || code == null || state == null)
        return Results.Text(string.Format(failHtml, error ?? "Missing parameters"), "text/html", 400);

    if (!pendingStates.TryRemove(state, out var pending) || pending.Expires < DateTime.UtcNow)
        return Results.Text(string.Format(failHtml, "Session expired. Please try again."), "text/html", 400);

    // exchange code → access_token
    var http = httpFactory.CreateClient();
    var tokenRes = await http.PostAsync("https://oauth2.googleapis.com/token",
        new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["code"]          = code,
            ["client_id"]     = googleClientId,
            ["client_secret"] = googleClientSecret,
            ["redirect_uri"]  = googleCallbackUrl,
            ["grant_type"]    = "authorization_code",
        }));

    if (!tokenRes.IsSuccessStatusCode)
    {
        var body = await tokenRes.Content.ReadAsStringAsync();
        return Results.Text(string.Format(failHtml, $"Google token error: {body}"), "text/html", 500);
    }

    var tokenJson = JsonDocument.Parse(await tokenRes.Content.ReadAsStringAsync());
    var accessToken = tokenJson.RootElement.GetProperty("access_token").GetString()!;

    // fetch user info
    var infoReq = new HttpRequestMessage(HttpMethod.Get,
        "https://www.googleapis.com/oauth2/v2/userinfo");
    infoReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
    var infoJson = JsonDocument.Parse(await (await http.SendAsync(infoReq)).Content.ReadAsStringAsync());
    var root = infoJson.RootElement;

    var googleId = root.GetProperty("id").GetString()!;
    var email    = root.GetProperty("email").GetString()!;
    var name     = root.TryGetProperty("name", out var n) ? n.GetString() : null;

    // upsert user
    var user = await db.Users.FirstOrDefaultAsync(u => u.GoogleId == googleId);
    if (user == null)
    {
        user = new User { GoogleId = googleId, Email = email, Name = name };
        db.Users.Add(user);
    }
    else
    {
        user.Email = email;
        user.Name  = name;
    }
    await db.SaveChangesAsync();

    var jwt = MakeJwt(user.Id, email);
    // redirect back to the Chrome extension with the token
    return Results.Redirect(pending.RedirectUri.TrimEnd('/') + "?token=" + Uri.EscapeDataString(jwt));
});

// ── files API ────────────────────────────────────────────────────────────────

app.MapGet("/api/files", async (HttpContext ctx, AppDbContext db) =>
{
    var userId = GetUserId(ctx);
    if (userId == null) return Results.Unauthorized();
    var names = await db.WeekFiles
        .Where(f => f.UserId == userId)
        .Select(f => f.Name)
        .ToListAsync();
    return Results.Ok(names);
});

app.MapGet("/api/files/{name}", async (string name, HttpContext ctx, AppDbContext db) =>
{
    var userId = GetUserId(ctx);
    if (userId == null) return Results.Unauthorized();
    var file = await db.WeekFiles.FirstOrDefaultAsync(f => f.UserId == userId && f.Name == name);
    if (file == null) return Results.NotFound();
    return Results.Text(file.Content, "application/json");
});

app.MapPut("/api/files/{name}", async (string name, HttpContext ctx, AppDbContext db) =>
{
    var userId = GetUserId(ctx);
    if (userId == null) return Results.Unauthorized();

    using var reader = new StreamReader(ctx.Request.Body);
    var content = await reader.ReadToEndAsync();

    var file = await db.WeekFiles.FirstOrDefaultAsync(f => f.UserId == userId && f.Name == name);
    if (file == null)
        db.WeekFiles.Add(new WeekFile { UserId = userId.Value, Name = name, Content = content });
    else
    {
        file.Content   = content;
        file.UpdatedAt = DateTime.UtcNow;
    }
    await db.SaveChangesAsync();
    return Results.Ok();
});

app.MapDelete("/api/files/{name}", async (string name, HttpContext ctx, AppDbContext db) =>
{
    var userId = GetUserId(ctx);
    if (userId == null) return Results.Unauthorized();
    var file = await db.WeekFiles.FirstOrDefaultAsync(f => f.UserId == userId && f.Name == name);
    if (file != null)
    {
        db.WeekFiles.Remove(file);
        await db.SaveChangesAsync();
    }
    return Results.Ok();
});

app.Run();
