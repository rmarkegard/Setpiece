using Setpiece.Rebuild;
using System.Security.Cryptography;
using System.Text.Json.Nodes;

namespace Setpiece.Tests;

public class ProvidersTests
{
    [Fact] public async Task DamagedConnectionsDoNotStopLocalWidgets()
    {
        var root = TestData.Root(); File.WriteAllBytes(Path.Combine(root, "connections.dat"), RandomNumberGenerator.GetBytes(64));
        using var providers = new Providers(new Storage(root));
        Assert.Equal("ready", (await providers.Read("clock"))["status"]?.GetValue<string>());
    }
    [Fact] public async Task DamagedConnectionsGiveConnectedWidgetsReconnectState()
    {
        var root = TestData.Root(); File.WriteAllBytes(Path.Combine(root, "connections.dat"), RandomNumberGenerator.GetBytes(64));
        using var providers = new Providers(new Storage(root)); var state = await providers.Read("weather");
        Assert.Equal("disconnected", state["status"]?.GetValue<string>()); Assert.Contains("could not be decrypted", state["detail"]?.GetValue<string>());
    }
    [Fact] public void PrinterChangeReportsMergeIntoTheFullReport()
    {
        var full = JsonNode.Parse("""{"gcode_state":"RUNNING","mc_percent":10,"nozzle_temper":210,"ams":{"tray_now":"1","ams":[{"id":"0"}]}}""")!.AsObject();
        PrinterService.Merge(full, JsonNode.Parse("""{"mc_percent":11,"ams":{"tray_now":"2"},"layer_num":4}""")!.AsObject());
        Assert.Equal(11, full["mc_percent"]!.GetValue<int>()); Assert.Equal(210, full["nozzle_temper"]!.GetValue<int>()); Assert.Equal("RUNNING", full["gcode_state"]!.GetValue<string>());
        Assert.Equal("2", full["ams"]!["tray_now"]!.GetValue<string>()); Assert.Single(full["ams"]!["ams"]!.AsArray()); Assert.Equal(4, full["layer_num"]!.GetValue<int>());
    }
    [Theory]
    [InlineData("weather")] [InlineData("ruter")] [InlineData("google-calendar")] [InlineData("discord")] [InlineData("spotify")] [InlineData("bambu-lab")] [InlineData("email")]
    public async Task UnconfiguredServicesAreExplicitlyDisconnected(string service)
    {
        using var providers = new Providers(new Storage(TestData.Root()));
        Assert.Equal("disconnected", (await providers.Read(service))["status"]?.GetValue<string>());
    }
    [Fact] public void PublicSettingsExcludeCredentials()
    {
        using var providers = new Providers(new Storage(TestData.Root())); var settings = providers.PublicSettings();
        Assert.False(settings.ContainsKey("GoogleRefreshToken")); Assert.False(settings.ContainsKey("BambuAccessCode"));
    }
}
