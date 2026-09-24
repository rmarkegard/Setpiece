using Setpiece.Rebuild;
using System.Security.Cryptography;

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
