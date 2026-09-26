using Setpiece.Rebuild;
using System.Text.Json.Nodes;

if (!args.Contains("--live") && !args.Contains("--brave"))
{
    Console.WriteLine("Specify --live or --brave to run opt-in integration checks.");
    return;
}
var root = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../artifacts/integration", DateTimeOffset.UtcNow.ToString("yyyyMMdd-HHmmss")));
Directory.CreateDirectory(root);
var store = new Storage(root);
using var providers = new Providers(store);
var passed = 0;
void Check(bool condition, string name) { if (!condition) throw new InvalidOperationException("FAIL: " + name); Console.WriteLine("PASS: " + name); passed++; }

if (args.Contains("--brave"))
{
    var imported = BraveBookmarks.Import(store); var bookmarks = imported["items"]!.AsArray();
    Check(bookmarks.Count > 0 && bookmarks.All(b => b?["url"] is not null), "Brave bookmark trees import from local profiles");
    Check(bookmarks.All(b => b?["icon"]?.GetValue<string>().StartsWith("data:image/", StringComparison.Ordinal) == true), "Every imported Brave bookmark has a local thumbnail");
}
if (args.Contains("--live"))
{
    Console.WriteLine("Live public-service checks (test data only):");
    var weather = await providers.Connect(new JsonObject { ["service"] = "weather", ["location"] = "Oslo" });
    Check(weather["status"]?.GetValue<string>() == "ready" && weather["data"]?["feelsLike"] is not null, "Open-Meteo location search and live forecast");
    var stops = await providers.SearchStops("Oslo S"); Check(stops.Count > 0, "Entur stop search returns real stops");
    var stop = stops[0]!; var departures = await providers.Connect(new JsonObject { ["service"] = "ruter", ["stopId"] = stop["id"]!.DeepClone(), ["stopName"] = stop["name"]!.DeepClone() });
    Check(departures["status"]?.GetValue<string>() is "ready" or "empty", "Entur live departures return a valid state");
    foreach (var service in new[] { "news", "reddit", "volume", "battery", "codex" }) { var state = await providers.Read(service); Console.WriteLine("OBSERVED: " + service + " -> " + state["status"] + " · " + state["title"]); if (service == "codex") Console.WriteLine("OBSERVED: Claude windows=" + (state["data"]?["claude"]?["windows"]?.AsArray().Count ?? 0) + ", Codex windows=" + (state["data"]?["codex"]?["windows"]?.AsArray().Count ?? 0) + ", OpenCode available=" + state["data"]?["opencode"]?["available"]); }
}
Console.WriteLine($"{passed} opt-in integration checks passed. Test files: {root}");
