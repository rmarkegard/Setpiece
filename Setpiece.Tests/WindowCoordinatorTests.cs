using Setpiece.Rebuild;
using System.ComponentModel;
using System.Drawing;
using System.Text.Json.Nodes;

namespace Setpiece.Tests;

public class WindowCoordinatorTests
{
    private static readonly HashSet<string> None = new(StringComparer.OrdinalIgnoreCase);
    private static JsonArray Distinct() => new(new JsonObject { ["handle"] = "21", ["process"] = "editor", ["title"] = "Notes.md - Editor" }, new JsonObject { ["handle"] = "22", ["process"] = "editor", ["title"] = "Plan.md - Editor" });

    [Fact] public void ProcessNameReadReturnsAvailableName() => Assert.Equal("editor", Setpiece.Rebuild.Windows.TryReadProcessName(() => "editor"));
    [Fact] public void ExitedProcessIsSkippedDuringNameRead() => Assert.Null(Setpiece.Rebuild.Windows.TryReadProcessName(() => throw new InvalidOperationException()));
    [Fact] public void InaccessibleProcessIsSkippedDuringNameRead() => Assert.Null(Setpiece.Rebuild.Windows.TryReadProcessName(() => throw new Win32Exception()));
    [Fact] public void UnexpectedProcessNameFailuresRemainVisible() => Assert.Throws<IOException>(() => Setpiece.Rebuild.Windows.TryReadProcessName(() => throw new IOException()));

    [Fact] public void LargeGapsKeepNarrowTilesPositiveAndEven()
    {
        var profile = Storage.Normalize(new JsonObject { ["Name"] = "Narrow tiles", ["Gap"] = 40d, ["OuterMargin"] = 16d, ["Zones"] = new JsonArray(
            new JsonObject { ["X"] = 0d, ["Y"] = 0d, ["Width"] = .475, ["Height"] = 1d },
            new JsonObject { ["X"] = .475, ["Y"] = 0d, ["Width"] = .025, ["Height"] = 1d },
            new JsonObject { ["X"] = .5, ["Y"] = 0d, ["Width"] = .5, ["Height"] = 1d }) });
        var board = profile["MonitorBoards"]![0]!.AsObject();
        var bounds = board["Zones"]!.AsArray().OfType<JsonObject>().Select(tile => WindowCoordinator.TileBounds(new Rectangle(-960, 0, 960, 600), profile, board, tile)).ToArray();
        Assert.All(bounds, b => Assert.True(b.Width > 0 && b.Height > 0 && b.Left >= -944 && b.Right <= -16));
        Assert.Equal(bounds[1].Left - bounds[0].Right, bounds[2].Left - bounds[1].Right);
    }
    [Fact] public void DuplicateSameTitleWindowsAreAmbiguous()
    {
        var windows = new JsonArray(new JsonObject { ["handle"] = "11", ["process"] = "notepad", ["title"] = "Untitled - Notepad" }, new JsonObject { ["handle"] = "12", ["process"] = "notepad", ["title"] = "Untitled - Notepad" });
        Assert.Null(WindowCoordinator.RestoreCandidate(windows, "notepad", "Untitled - Notepad", None));
    }
    [Fact] public void UniqueSavedTitleSelectsMatchingWindow() => Assert.Equal("22", WindowCoordinator.RestoreCandidate(Distinct(), "EDITOR", "Plan.md - Editor", None)?["handle"]?.GetValue<string>());
    [Fact] public void ReservedWindowCannotBeStolen() => Assert.Null(WindowCoordinator.RestoreCandidate(Distinct(), "editor", "Notes.md - Editor", new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "21" }));
    [Fact] public void UniqueWindowCanRestoreAfterRename()
    {
        var windows = new JsonArray(new JsonObject { ["handle"] = "31", ["process"] = "editor", ["title"] = "Renamed.md - Editor" });
        Assert.Equal("31", WindowCoordinator.RestoreCandidate(windows, "editor", "Old name.md - Editor", None)?["handle"]?.GetValue<string>());
    }
    [Fact] public void LiveEditDoesNotBindRenamedWindow()
    {
        var windows = new JsonArray(new JsonObject { ["handle"] = "31", ["process"] = "editor", ["title"] = "Renamed.md - Editor" });
        Assert.Null(WindowCoordinator.RestoreCandidate(windows, "editor", "Old name.md - Editor", None, allowTitleFallback: false));
    }
    [Fact] public void ChangedTitleCannotChooseAmongMultipleWindows() => Assert.Null(WindowCoordinator.RestoreCandidate(Distinct(), "editor", "Closed.md - Editor", None));
}
