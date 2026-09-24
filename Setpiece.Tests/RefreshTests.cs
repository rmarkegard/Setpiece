using Setpiece.Rebuild;

namespace Setpiece.Tests;

public class RefreshTests
{
    [Fact] public void ProductionStartupWithoutMarkerReturnsImmediately()
    {
        var root = TestData.Root();
        Assert.False(Refresh.IsDue([], root, null));
    }
    [Fact] public void FreshDevMarkerRequestsRebuild()
    {
        var root = TestData.Root(); var stamp = Path.Combine(root, "production.stamp"); var marker = Path.Combine(root, "setpiece.dev");
        File.WriteAllText(stamp, ""); File.WriteAllText(marker, ""); File.SetLastWriteTimeUtc(stamp, DateTime.UtcNow.AddMinutes(-2)); File.SetLastWriteTimeUtc(marker, DateTime.UtcNow.AddMinutes(-1));
        Assert.True(Refresh.IsDue([], root, null));
    }
    [Fact] public void OldDevMarkerDoesNotRequestRebuild()
    {
        var root = TestData.Root(); var stamp = Path.Combine(root, "production.stamp"); var marker = Path.Combine(root, "setpiece.dev");
        File.WriteAllText(stamp, ""); File.WriteAllText(marker, ""); File.SetLastWriteTimeUtc(marker, DateTime.UtcNow.AddMinutes(-2)); File.SetLastWriteTimeUtc(stamp, DateTime.UtcNow.AddMinutes(-1));
        Assert.False(Refresh.IsDue([], root, null));
    }
    [Fact] public void DevEnvironmentRequestsRebuild() => Assert.True(Refresh.IsDue([], TestData.Root(), "1"));
    [Fact] public void SkipFlagWinsOverDevEnvironment() => Assert.False(Refresh.IsDue(["--skip-production-refresh"], TestData.Root(), "1"));
}
