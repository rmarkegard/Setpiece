using System.Text.Json.Nodes;

namespace Setpiece.Tests;

internal static class TestData
{
    public static JsonObject Profile() => new()
    {
        ["Name"] = "Verification", ["MonitorIndex"] = 0, ["CustomLegacyField"] = "retained",
        ["Zones"] = new JsonArray(
            new JsonObject { ["Id"] = "first", ["X"] = 0d, ["Y"] = 0d, ["Width"] = .5, ["Height"] = 1d, ["ContentKind"] = "Application", ["ConstrainFullscreenToTile"] = true },
            new JsonObject { ["Id"] = "second", ["X"] = .5, ["Y"] = 0d, ["Width"] = .5, ["Height"] = 1d, ["ContentKind"] = "Widget", ["WidgetId"] = "google-calendar", ["AssignedProcessName"] = "must-clear" })
    };

    public static string Root()
    {
        var root = Path.Combine(Path.GetTempPath(), "Setpiece.Tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        return root;
    }
}
