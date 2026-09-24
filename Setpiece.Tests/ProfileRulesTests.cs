using Setpiece.Rebuild;
using System.Text.Json.Nodes;

namespace Setpiece.Tests;

public class ProfileRulesTests
{
    [Fact] public void LegacyZonesBecomeFilledBoard()
    {
        var profile = Storage.Normalize(TestData.Profile());
        Assert.True(ProfileRules.IsLayout(profile["MonitorBoards"]![0]!["Zones"]!.AsArray().OfType<JsonObject>().ToArray()));
    }

    [Fact] public void FullscreenPreferenceSurvivesNormalization() => Assert.True(Storage.Normalize(TestData.Profile())["MonitorBoards"]![0]!["Zones"]![0]!["ConstrainFullscreenToTile"]!.GetValue<bool>());
    [Fact] public void WidgetIdentitySurvivesAndAppAssignmentClears()
    {
        var tile = Storage.Normalize(TestData.Profile())["MonitorBoards"]![0]!["Zones"]![1]!;
        Assert.Equal("google-calendar", tile["WidgetId"]!.GetValue<string>());
        Assert.Equal("", tile["AssignedProcessName"]!.GetValue<string>());
    }
    [Fact] public void UnknownLegacyPropertySurvives() => Assert.Equal("retained", Storage.Normalize(TestData.Profile())["CustomLegacyField"]!.GetValue<string>());
    [Fact] public void NormalizationIsIdempotent()
    {
        var profile = Storage.Normalize(TestData.Profile());
        Assert.True(JsonNode.DeepEquals(profile, Storage.Normalize(profile.DeepClone().AsObject())));
    }
    [Fact] public void FreePlacementSurvivesValidation()
    {
        var profile = TestData.Profile(); profile["Zones"]![0]!["Width"] = .2; profile["Zones"]![0]!["Y"] = .15; profile["Zones"]![0]!["Height"] = .3;
        var normalized = Storage.Normalize(profile, false); var tile = normalized["MonitorBoards"]![0]!["Zones"]![0]!;
        Assert.Equal(.2, tile["Width"]!.GetValue<double>()); Assert.Equal(.15, tile["Y"]!.GetValue<double>()); Assert.Null(normalized["NormalizationNotice"]);
    }
    [Fact] public void MalformedGeometryRetainsOriginalAndNotice()
    {
        var profile = TestData.Profile(); profile["Zones"]![0]!["Width"] = .7;
        var repaired = Storage.Normalize(profile);
        Assert.NotNull(repaired["MonitorBoards"]![0]!["OriginalGeometryV2"]); Assert.NotNull(repaired["NormalizationNotice"]);
    }
    [Fact] public void InvalidGeometryIsRejectedAtCommandBoundary()
    {
        var profile = TestData.Profile(); profile["Zones"]![0]!["Width"] = .7;
        Assert.Throws<InvalidDataException>(() => Storage.Normalize(profile, false));
    }
    [Fact] public void OverTwentyTilesAreRejectedWithoutTruncation()
    {
        var profile = TestData.Profile(); profile["Zones"] = new JsonArray(Enumerable.Range(0, 21).Select(_ => (JsonNode)new JsonObject()).ToArray());
        Assert.Throws<InvalidDataException>(() => Storage.Normalize(profile));
    }
    [Theory]
    [InlineData(0, false)] [InlineData(1, true)] [InlineData(2, false)] [InlineData(21, false)]
    public void LayoutRejectsInvalidTileCounts(int count, bool expected)
    {
        var tiles = Enumerable.Range(0, count).Select(_ => new JsonObject { ["X"] = 0d, ["Y"] = 0d, ["Width"] = 1d, ["Height"] = 1d }).ToArray();
        Assert.Equal(expected, ProfileRules.IsLayout(tiles));
    }
}
