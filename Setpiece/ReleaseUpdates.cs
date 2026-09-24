using System.Diagnostics;
using System.Security.Cryptography;
using System.Text.Json.Nodes;

namespace Setpiece.Rebuild;

internal sealed record ReleaseUpdate(Version Version, string Tag, Uri Page, Uri Download, string Sha256);

internal static class ReleaseUpdates
{
    private static readonly HttpClient Client = new() { Timeout = TimeSpan.FromMinutes(3) };
    private static readonly Uri Latest = new("https://api.github.com/repos/rmarkegard/Setpiece/releases/latest");
    internal static Version Current => typeof(Program).Assembly.GetName().Version ?? new Version(0, 0);

    internal static ReleaseUpdate? Parse(JsonObject release)
    {
        if (release["draft"]?.GetValue<bool>() == true || release["prerelease"]?.GetValue<bool>() == true) return null;
        var tag = release["tag_name"]?.GetValue<string>() ?? "";
        if (!Version.TryParse(tag.TrimStart('v', 'V'), out var version) || version.Build < 0 || version.Revision >= 0) return null;
        var filename = $"Setpiece-{version.ToString(3)}-windows-x64-setup.exe";
        var asset = release["assets"]?.AsArray().OfType<JsonObject>().FirstOrDefault(a => a["name"]?.GetValue<string>() == filename);
        var digest = asset?["digest"]?.GetValue<string>() ?? "";
        if (digest.Length != 71 || !digest.StartsWith("sha256:", StringComparison.Ordinal) ||
            !digest[7..].All(Uri.IsHexDigit)) return null;
        if (!Uri.TryCreate(release["html_url"]?.GetValue<string>(), UriKind.Absolute, out var page) ||
            page.Scheme != Uri.UriSchemeHttps || page.Host != "github.com" ||
            !page.AbsolutePath.StartsWith("/rmarkegard/Setpiece/releases/tag/", StringComparison.Ordinal)) return null;
        if (!Uri.TryCreate(asset?["browser_download_url"]?.GetValue<string>(), UriKind.Absolute, out var download) ||
            download.Scheme != Uri.UriSchemeHttps || download.Host != "github.com" ||
            download.AbsolutePath != $"/rmarkegard/Setpiece/releases/download/{Uri.EscapeDataString(tag)}/{filename}") return null;
        return new ReleaseUpdate(version, tag, page, download, digest[7..].ToUpperInvariant());
    }

    internal static async Task<ReleaseUpdate?> Check(CancellationToken cancellationToken = default)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, Latest);
        request.Headers.UserAgent.ParseAdd("Setpiece/2.0");
        request.Headers.Accept.ParseAdd("application/vnd.github+json");
        using var response = await Client.SendAsync(request, cancellationToken);
        if (response.StatusCode == System.Net.HttpStatusCode.NotFound) return null;
        response.EnsureSuccessStatusCode();
        var release = JsonNode.Parse(await response.Content.ReadAsStringAsync(cancellationToken))?.AsObject();
        if (release is null) throw new InvalidDataException("GitHub returned an invalid release response.");
        var update = Parse(release);
        return update is not null && update.Version > Current ? update : null;
    }

    internal static async Task DownloadAndStart(ReleaseUpdate update, CancellationToken cancellationToken = default)
    {
        var folder = Path.Combine(Path.GetTempPath(), "SetpieceUpdates", update.Version.ToString(3));
        Directory.CreateDirectory(folder);
        var installer = Path.Combine(folder, Path.GetFileName(update.Download.AbsolutePath));
        var temporary = installer + ".download";
        try
        {
            using var response = await Client.GetAsync(update.Download, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            response.EnsureSuccessStatusCode();
            await using (var source = await response.Content.ReadAsStreamAsync(cancellationToken))
            await using (var target = new FileStream(temporary, FileMode.Create, FileAccess.Write, FileShare.None))
                await source.CopyToAsync(target, cancellationToken);
            string actual;
            await using (var downloaded = File.OpenRead(temporary))
                actual = Convert.ToHexString(await SHA256.HashDataAsync(downloaded, cancellationToken));
            if (!actual.Equals(update.Sha256, StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException("The downloaded installer did not match the GitHub release checksum.");
            File.Move(temporary, installer, true);
            using var process = Process.Start(new ProcessStartInfo(installer) { UseShellExecute = true })
                ?? throw new InvalidOperationException("Windows could not start the installer.");
        }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }
}
