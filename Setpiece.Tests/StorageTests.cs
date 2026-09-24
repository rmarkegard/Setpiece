using Setpiece.Rebuild;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;

namespace Setpiece.Tests;

public class StorageTests
{
    [Fact] public void ExceptionLogKeepsMessageAndStackTrace()
    {
        var store = new Storage(TestData.Root());
        try { throw new InvalidOperationException("synthetic diagnostic"); }
        catch (InvalidOperationException error) { store.Log("Failure", error); }
        var log = File.ReadAllText(Path.Combine(store.Root, "rebuild.log"));
        Assert.Contains("synthetic diagnostic", log); Assert.Contains("at Setpiece.Tests.StorageTests", log);
    }
    [Fact] public void RebuildLogIsBounded()
    {
        var store = new Storage(TestData.Root());
        for (var i = 0; i < 300; i++) store.Log($"entry {i}: " + new string('x', 1024));
        Assert.True(new FileInfo(Path.Combine(store.Root, "rebuild.log")).Length <= 256 * 1024);
        Assert.Contains("entry 299", File.ReadAllText(Path.Combine(store.Root, "rebuild.log")));
    }
    [Fact] public void FreePlacementSurvivesSaveAndReload()
    {
        var store = new Storage(TestData.Root()); var profile = TestData.Profile(); profile["Zones"]![0]!["Width"] = .2; profile["Zones"]![0]!["Y"] = .15; profile["Zones"]![0]!["Height"] = .3;
        var normalized = Storage.Normalize(profile, false); var key = store.SaveProfile(null, normalized);
        Assert.True(JsonNode.DeepEquals(normalized, store.Profiles().OfType<JsonObject>().Single(p => p["key"]!.GetValue<string>() == key)["profile"]));
    }
    [Fact] public void AtomicProfileSavePreservesDocument()
    {
        var store = new Storage(TestData.Root()); var profile = Storage.Normalize(TestData.Profile()); var key = store.SaveProfile(null, profile); var loaded = store.Profiles().OfType<JsonObject>().Single();
        Assert.Equal(key, loaded["key"]!.GetValue<string>()); Assert.True(JsonNode.DeepEquals(profile, loaded["profile"]));
    }
    [Theory] [InlineData("../outside")] [InlineData("..\\outside")] [InlineData("..")]
    public void ProfileKeysCannotEscapeDirectory(string key) => Assert.Throws<InvalidDataException>(() => new Storage(TestData.Root()).SaveProfile(key, Storage.Normalize(TestData.Profile())));
    [Fact] public void AppearanceScalesPersist()
    {
        var store = new Storage(TestData.Root()); store.SaveDocument("appearance-v2.json", new JsonObject { ["mode"] = "dark", ["radius"] = 24d, ["uiScale"] = 1.35d, ["fontScale"] = 1.15d, ["UnknownFutureAppearance"] = "preserved" });
        var p = store.Preferences(); Assert.Equal(1.35, p["uiScale"]?.GetValue<double>()); Assert.Equal(1.15, p["fontScale"]?.GetValue<double>());
    }
    [Fact] public void AppearanceKeepsUnknownFields()
    {
        var store = new Storage(TestData.Root()); store.SaveDocument("appearance-v2.json", new JsonObject { ["mode"] = "dark", ["radius"] = 24d, ["uiScale"] = 1.35d, ["fontScale"] = 1.15d, ["UnknownFutureAppearance"] = "preserved" });
        var p = store.Preferences(); Assert.Equal(5, p.Count); Assert.Equal("preserved", p["UnknownFutureAppearance"]?.GetValue<string>()); Assert.Equal("dark", p["mode"]?.GetValue<string>());
    }
    [Fact] public void LegacyAppearanceStaysVerbatim()
    {
        var store = new Storage(TestData.Root()); store.SaveDocument("appearance-v2.json", new JsonObject { ["mode"] = "dark", ["radius"] = 24d, ["LegacyAppearanceField"] = "kept" });
        var p = store.Preferences(); Assert.Equal(3, p.Count); Assert.Equal("kept", p["LegacyAppearanceField"]?.GetValue<string>()); Assert.Null(p["uiScale"]); Assert.Null(p["fontScale"]);
    }
    [Fact] public void SecretsAreAbsentFromCiphertext()
    {
        const string secret = "synthetic-secret-not-a-real-token"; var store = new Storage(TestData.Root()); store.UpdateConnections(new JsonObject { ["GoogleRefreshToken"] = secret });
        Assert.DoesNotContain(secret, Encoding.UTF8.GetString(File.ReadAllBytes(Path.Combine(store.Root, "connections.dat"))), StringComparison.Ordinal);
    }
    [Fact] public void DpapiUsesLegacyEntropyAndRawUtf8Json()
    {
        const string secret = "synthetic-secret-not-a-real-token"; var store = new Storage(TestData.Root()); store.UpdateConnections(new JsonObject { ["GoogleRefreshToken"] = secret });
        var cipher = File.ReadAllBytes(Path.Combine(store.Root, "connections.dat")); var plain = ProtectedData.Unprotect(cipher, Encoding.UTF8.GetBytes("Setpiece.WidgetConnections.v1"), DataProtectionScope.CurrentUser);
        Assert.Equal(secret, JsonNode.Parse(plain)?["GoogleRefreshToken"]?.GetValue<string>());
    }
    [Fact] public async Task ConcurrentConnectionsMergeWithoutLosingUnknownFields()
    {
        var store = new Storage(TestData.Root()); store.UpdateConnections(new JsonObject { ["UnknownFutureSetting"] = "preserved" });
        await Task.WhenAll(Enumerable.Range(0, 8).Select(i => Task.Run(() => store.UpdateConnections(new JsonObject { ["Parallel" + i] = i }))));
        var merged = store.Connections(); Assert.True(Enumerable.Range(0, 8).All(i => merged["Parallel" + i]?.GetValue<int>() == i)); Assert.Equal("preserved", merged["UnknownFutureSetting"]?.GetValue<string>());
    }
    [Fact] public void AtomicWritesLeaveNoTemporaryFiles()
    {
        var store = new Storage(TestData.Root()); store.SaveProfile(null, Storage.Normalize(TestData.Profile())); store.SaveDocument("appearance-v2.json", new JsonObject { ["mode"] = "dark" }); store.UpdateConnections(new JsonObject { ["WeatherLocation"] = "Oslo" });
        Assert.Empty(Directory.EnumerateFiles(store.Root, "*.tmp", SearchOption.AllDirectories));
    }
    [Fact] public void ReconnectBacksUpUnreadableCiphertext()
    {
        var root = TestData.Root(); var damaged = RandomNumberGenerator.GetBytes(64); File.WriteAllBytes(Path.Combine(root, "connections.dat"), damaged); var store = new Storage(root);
        store.UpdateConnections(new JsonObject { ["WeatherLocation"] = "Oslo" });
        var backup = Directory.EnumerateFiles(root, "connections.unreadable-*.dat").Single(); Assert.Equal(damaged, File.ReadAllBytes(backup)); Assert.Equal("Oslo", store.Connections()["WeatherLocation"]?.GetValue<string>());
    }
}
