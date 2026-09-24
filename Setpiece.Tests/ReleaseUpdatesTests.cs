using System.Text.Json.Nodes;
using Setpiece.Rebuild;

namespace Setpiece.Tests;

public class ReleaseUpdatesTests
{
    private const string Hash = "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    private static JsonObject Release(string tag = "v2.1.0", string? digest = Hash) => new()
    {
        ["tag_name"] = tag,
        ["draft"] = false,
        ["prerelease"] = false,
        ["html_url"] = $"https://github.com/rmarkegard/Setpiece/releases/tag/{tag}",
        ["assets"] = new JsonArray(new JsonObject
        {
            ["name"] = "Setpiece-2.1.0-windows-x64-setup.exe",
            ["browser_download_url"] = $"https://github.com/rmarkegard/Setpiece/releases/download/{tag}/Setpiece-2.1.0-windows-x64-setup.exe",
            ["digest"] = digest
        })
    };

    [Fact] public void AcceptsMatchingStableInstallerWithChecksum()
    {
        var update = ReleaseUpdates.Parse(Release());
        Assert.NotNull(update);
        Assert.Equal(new Version(2, 1, 0), update.Version);
        Assert.Equal(Hash[7..].ToUpperInvariant(), update.Sha256);
    }

    [Fact] public void RejectsPrereleaseAndDraft()
    {
        var prerelease = Release(); prerelease["prerelease"] = true;
        var draft = Release(); draft["draft"] = true;
        Assert.Null(ReleaseUpdates.Parse(prerelease));
        Assert.Null(ReleaseUpdates.Parse(draft));
    }

    [Fact] public void RejectsMissingDigestAndUnexpectedDownloadHost()
    {
        Assert.Null(ReleaseUpdates.Parse(Release(digest: null)));
        var release = Release();
        release["assets"]![0]!["browser_download_url"] = "https://example.com/Setpiece-2.1.0-windows-x64-setup.exe";
        Assert.Null(ReleaseUpdates.Parse(release));
    }

    [Fact] public void RejectsMismatchedInstallerName()
    {
        var release = Release();
        release["assets"]![0]!["name"] = "Setpiece-other.exe";
        Assert.Null(ReleaseUpdates.Parse(release));
    }
}
