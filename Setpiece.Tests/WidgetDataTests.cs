using Setpiece.Rebuild;
using System.Text.Json.Nodes;
using System.Xml.Linq;

namespace Setpiece.Tests;

public class WidgetDataTests
{
    private static string Ics(params string[] events)=>"BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Setpiece//Tests//EN\r\n"+string.Concat(events)+"END:VCALENDAR\r\n";
    private static string Event(string uid,string summary,DateTime start,string extra="")=>$"BEGIN:VEVENT\r\nUID:{uid}\r\nDTSTAMP:20260101T000000Z\r\nSUMMARY:{summary}\r\nDTSTART:{start:yyyyMMdd'T'HHmmss'Z'}\r\nDTEND:{start.AddHours(1):yyyyMMdd'T'HHmmss'Z'}\r\nLOCATION:Mathallen\r\n{extra}END:VEVENT\r\n";

    [Fact] public void CalendarFeedKeepsOneOffEventsWithTheirDateAndPlace()
    {
        var now=new DateTime(2026,9,28,12,0,0,DateTimeKind.Utc);
        var items=WidgetData.CalendarFeed(Ics(Event("a","Dinner with Sara",now.AddDays(2))),[],now);
        var item=Assert.Single(items)!;
        Assert.Equal("Dinner with Sara",item["title"]!.GetValue<string>());
        Assert.Equal("Mathallen",item["place"]!.GetValue<string>());Assert.Equal("a",item["id"]!.GetValue<string>());
        Assert.Equal(now.AddDays(2),DateTimeOffset.Parse(item["start"]!.GetValue<string>()).UtcDateTime);
    }
    [Fact] public void CalendarFeedLeavesOutRecurringSeriesAndTheirEditedInstances()
    {
        var now=new DateTime(2026,9,28,12,0,0,DateTimeKind.Utc);var series=now.AddDays(1);
        var ics=Ics(Event("weekly","Standup",series,"RRULE:FREQ=WEEKLY;COUNT=10\r\n"),Event("weekly","Standup (moved)",series.AddDays(7).AddHours(2),$"RECURRENCE-ID:{series.AddDays(7):yyyyMMdd'T'HHmmss'Z'}\r\n"),Event("once","Dentist",now.AddDays(3)));
        var titles=WidgetData.CalendarFeed(ics,[],now).Select(i=>i!["title"]!.GetValue<string>()).ToArray();
        Assert.Equal(["Dentist"],titles);
    }
    [Fact] public void CalendarFeedHonoursExcludedTitles()
    {
        var now=new DateTime(2026,9,28,12,0,0,DateTimeKind.Utc);
        Assert.Empty(WidgetData.CalendarFeed(Ics(Event("b","Blocked: focus",now.AddDays(1))),["blocked"],now));
    }
    [Fact] public void GoogleEventsLeaveOutInstancesOfRecurringEvents()
    {
        var data=JsonNode.Parse("""{"items":[{"summary":"Standup","recurringEventId":"x","start":{"dateTime":"2026-09-29T09:00:00+02:00"}},{"summary":"Verity","location":"Odeon Kino","start":{"dateTime":"2026-09-30T17:30:00+02:00"}},{"summary":"Holiday","start":{"date":"2026-10-02"}}]}""")!;
        var items=WidgetData.GoogleEvents(data,[]);
        Assert.Equal(["Verity","Holiday"],items.Select(i=>i!["title"]!.GetValue<string>()));
        Assert.Equal("Odeon Kino",items[0]!["place"]!.GetValue<string>());
        Assert.Equal(new DateTimeOffset(2026,9,30,15,30,0,TimeSpan.Zero),DateTimeOffset.Parse(items[0]!["start"]!.GetValue<string>()));
    }
    [Fact] public void DeparturesCarryModePlatformMinutesAndDelay()
    {
        var now=new DateTimeOffset(2026,9,28,20,0,0,TimeSpan.FromHours(2));
        var place=JsonNode.Parse("""{"estimatedCalls":[{"expectedDepartureTime":"2026-09-28T20:05:30+02:00","aimedDepartureTime":"2026-09-28T20:01:00+02:00","destinationDisplay":{"frontText":"Majorstuen"},"quay":{"publicCode":"B"},"serviceJourney":{"id":"RUT:ServiceJourney:12-1","line":{"publicCode":"12","transportMode":"tram"}}}]}""")!;
        var item=Assert.Single(WidgetData.Departures(place,now))!;
        Assert.Equal("12 · Majorstuen",item["title"]!.GetValue<string>());
        Assert.Equal("tram",item["mode"]!.GetValue<string>());Assert.Equal("B",item["platform"]!.GetValue<string>());
        Assert.Equal(6,item["minutes"]!.GetValue<int>());Assert.Equal(5,item["delay"]!.GetValue<int>());
        Assert.StartsWith("RUT:ServiceJourney:12-1|",item["id"]!.GetValue<string>());
    }
    [Fact] public void RedditPostsCarryScoreAndAgeButNoCommentCount()
    {
        var data=JsonNode.Parse("""{"data":{"children":[{"data":{"stickied":true,"title":"Rules","score":1,"created_utc":1,"permalink":"/r/x/1"}},{"data":{"title":"A tiny e-ink dashboard","score":860,"num_comments":97,"created_utc":1790000000,"permalink":"/r/x/2"}}]}}""")!;
        var item=Assert.Single(WidgetData.Reddit(data))!;
        Assert.Equal(860,item["score"]!.GetValue<int>());Assert.Equal(1790000000,item["created"]!.GetValue<long>());
        Assert.DoesNotContain("comment",item["detail"]!.GetValue<string>());
    }
    [Fact] public void NewsCarriesSectionAndPublishTime()
    {
        var feed=XDocument.Parse("""<rss><channel><item><title>Rekordvarm september</title><link>https://www.vg.no/1</link><category>Nyheter</category><pubDate>Mon, 28 Sep 2026 18:48:00 +0200</pubDate><description>&lt;p&gt;Oslo slo rekord&lt;/p&gt;</description></item></channel></rss>""");
        var item=Assert.Single(WidgetData.News(feed,[]))!;
        Assert.Equal("Nyheter",item["category"]!.GetValue<string>());Assert.Equal("Oslo slo rekord",item["detail"]!.GetValue<string>());
        Assert.Equal(new DateTimeOffset(2026,9,28,16,48,0,TimeSpan.Zero),DateTimeOffset.Parse(item["published"]!.GetValue<string>()));
    }
    [Fact] public void WeatherGivesSixHoursAndTodaysRange()
    {
        var start=DateTime.UtcNow.AddHours(1);var times=new JsonArray();var temps=new JsonArray();var rain=new JsonArray();
        for(var i=0;i<10;i++){times.Add(start.AddHours(i).ToString("yyyy-MM-dd'T'HH:00"));temps.Add(10.0+i);rain.Add(5);}
        var data=new JsonObject{["utc_offset_seconds"]=0,["current"]=new JsonObject{["temperature_2m"]=15.6,["apparent_temperature"]=14.0,["weather_code"]=61,["wind_speed_10m"]=19.0},
            ["hourly"]=new JsonObject{["time"]=times,["temperature_2m"]=temps,["precipitation_probability"]=rain},["daily"]=new JsonObject{["temperature_2m_max"]=new JsonArray(18.2),["temperature_2m_min"]=new JsonArray(9.1)}};
        var (title,hours,values)=WidgetData.Weather(data);
        Assert.Equal("16°",title);Assert.Equal(6,hours.Count);Assert.Equal(10.0,hours[0]!["temp"]!.GetValue<double>());
        Assert.Equal(18.2,values["high"]!.GetValue<double>());Assert.Equal(9.1,values["low"]!.GetValue<double>());
    }
    [Theory]
    [InlineData("\"Sara Lie\" <sara@example.com>","Sara Lie")]
    [InlineData("GitHub <noreply@github.com>","GitHub")]
    [InlineData("<alerts@example.com>","alerts@example.com")]
    [InlineData("Ruter","Ruter")]
    public void SenderNamesDropTheAddress(string from,string name)=>Assert.Equal(name,WidgetData.SenderName(from));
    [Fact] public void FilamentComesFromTheActiveAmsSlotOrTheExternalSpool()
    {
        var ams=JsonNode.Parse("""{"ams":{"tray_now":"1","ams":[{"id":"0","tray":[{"id":"0","tray_type":"PETG"},{"id":"1","tray_type":"PLA","tray_sub_brands":"PLA Matte"}]}]}}""")!.AsObject();
        Assert.Equal("PLA Matte",PrinterService.Filament(ams));
        Assert.Equal("TPU",PrinterService.Filament(JsonNode.Parse("""{"vt_tray":{"tray_type":"TPU"}}""")!.AsObject()));
    }
    [Theory]
    [InlineData("system")] [InlineData("weather")] [InlineData("bambu-lab")] [InlineData("google-calendar")] [InlineData("ruter")] [InlineData("discord")] [InlineData("spotify")] [InlineData("email")] [InlineData("news")] [InlineData("reddit")] [InlineData("battery")] [InlineData("volume")] [InlineData("codex")]
    public void DesignReviewFixturesAreReadyStates(string service)
    {
        var fixture=(JsonNode)typeof(Providers).Assembly.GetType("Setpiece.Rebuild.VisualAudit")!.GetMethod("DesignFixture",System.Reflection.BindingFlags.NonPublic|System.Reflection.BindingFlags.Static)!.Invoke(null,[service])!;
        Assert.Equal("ready",fixture["status"]!.GetValue<string>());
    }
}
