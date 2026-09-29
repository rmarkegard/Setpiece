using System.Globalization;
using System.Net;
using System.Text.Json.Nodes;
using System.Xml.Linq;

namespace Setpiece.Rebuild;

/// <summary>
/// Turns service responses into the fields the widgets draw: start dates, line types, scores and
/// ages. Pure functions of their input, so each one is tested without the network.
/// </summary>
internal static class WidgetData
{
    private static string Iso(DateTimeOffset value)=>value.ToString("O",CultureInfo.InvariantCulture);

    /// <summary>Open-Meteo forecast: now, today's high and low, and the next six hours with their temperatures.</summary>
    public static (string Title,JsonArray Hours,JsonObject Data) Weather(JsonNode data)
    {
        var current=data["current"]!.AsObject();var temp=current["temperature_2m"]!.GetValue<double>();var hours=data["hourly"]!;
        var locationNow=DateTime.UtcNow.AddSeconds(data["utc_offset_seconds"]?.GetValue<int>()??0);var items=new JsonArray();
        for(var i=0;i<hours["time"]!.AsArray().Count&&items.Count<6;i++)
        {
            var time=DateTime.Parse(hours["time"]![i]!.GetValue<string>(),CultureInfo.InvariantCulture);if(time<locationNow.AddMinutes(-locationNow.Minute))continue;
            var hourTemp=hours["temperature_2m"]![i]!.GetValue<double>();
            items.Add(new JsonObject{["title"]=time.ToString("HH:mm",CultureInfo.InvariantCulture),["detail"]=hourTemp.ToString("0.#",CultureInfo.InvariantCulture)+"° · "+hours["precipitation_probability"]![i]+"% rain",["temp"]=hourTemp});
        }
        var result=new JsonObject{["feelsLike"]=current["apparent_temperature"]!.DeepClone(),["wind"]=current["wind_speed_10m"]!.DeepClone(),["code"]=current["weather_code"]!.DeepClone(),["source"]="Open-Meteo"};
        if(data["daily"]?["temperature_2m_max"]?[0] is JsonValue high)result["high"]=high.DeepClone();
        if(data["daily"]?["temperature_2m_min"]?[0] is JsonValue low)result["low"]=low.DeepClone();
        return ($"{temp:0}°",items,result);
    }

    /// <summary>Entur departures: line, destination, transport mode, platform, minutes away and delay.</summary>
    public static JsonArray Departures(JsonNode place,DateTimeOffset now)
    {
        var items=new JsonArray();
        foreach(var call in place["estimatedCalls"]!.AsArray())
        {
            var expected=DateTimeOffset.Parse(call!["expectedDepartureTime"]!.GetValue<string>(),CultureInfo.InvariantCulture);
            var aimed=call["aimedDepartureTime"] is JsonValue a?DateTimeOffset.Parse(a.GetValue<string>(),CultureInfo.InvariantCulture):expected;
            var minutes=Math.Max(0,(int)Math.Ceiling((expected-now).TotalMinutes));var line=call["serviceJourney"]?["line"];
            var code=line?["publicCode"]?.GetValue<string>()??"";var destination=call["destinationDisplay"]?["frontText"]?.GetValue<string>()??"";
            items.Add(new JsonObject{
                ["title"]=code+" · "+destination,["detail"]=minutes==0?"Now":minutes+" min",["line"]=code,["destination"]=destination,
                ["mode"]=line?["transportMode"]?.GetValue<string>()??"bus",["platform"]=call["quay"]?["publicCode"]?.GetValue<string>()??"",
                ["minutes"]=minutes,["time"]=Iso(expected),["delay"]=Math.Max(0,(int)Math.Round((expected-aimed).TotalMinutes,MidpointRounding.AwayFromZero)),
                ["id"]=(call["serviceJourney"]?["id"]?.GetValue<string>()??code+destination)+"|"+Iso(aimed)});
        }
        return items;
    }

    /// <summary>VG's RSS feed: headline, section and publish time. No "updated just now" line: the age says it.</summary>
    public static JsonArray News(XDocument document,string[] filters)
    {
        var items=new JsonArray();
        foreach(var item in document.Descendants("item").Where(i=>filters.Length==0||i.Elements("category").Any(c=>filters.Contains(c.Value,StringComparer.OrdinalIgnoreCase))).Take(8))
        {
            var entry=new JsonObject{["title"]=item.Element("title")?.Value??"VG",["detail"]=System.Text.RegularExpressions.Regex.Replace(WebUtility.HtmlDecode(item.Element("description")?.Value??""),"<[^>]+>",""),["url"]=item.Element("link")?.Value??"https://www.vg.no",["category"]=item.Element("category")?.Value??""};
            if(DateTimeOffset.TryParse(item.Element("pubDate")?.Value,CultureInfo.InvariantCulture,DateTimeStyles.None,out var published))entry["published"]=Iso(published);
            items.Add(entry);
        }
        return items;
    }

    /// <summary>A subreddit listing: title, score and age. Comment counts are left out on purpose.</summary>
    public static JsonArray Reddit(JsonNode data)
    {
        var items=new JsonArray();
        foreach(var child in data["data"]!["children"]!.AsArray())
        {
            var post=child!["data"]!;if(post["stickied"]?.GetValue<bool>()==true)continue;
            items.Add(new JsonObject{["title"]=post["title"]!.DeepClone(),["detail"]=post["score"]+" points",["score"]=post["score"]?.DeepClone(),["created"]=post["created_utc"]?.DeepClone(),["url"]="https://www.reddit.com"+post["permalink"]});
        }
        return items;
    }

    private static JsonObject Event(string id,string title,DateTimeOffset start,string place)=>new(){["id"]=id,["title"]=title,["detail"]=start.ToLocalTime().ToString("ddd HH:mm",CultureInfo.GetCultureInfo("en-GB"))+(place.Length>0?" · "+place:""),["start"]=Iso(start.ToLocalTime()),["place"]=place};

    /// <summary>
    /// Upcoming one-off events from an iCalendar feed, soonest first. Recurring series (and their
    /// edited instances) are left out: the widget is for what is coming up, not the routine.
    /// </summary>
    public static JsonArray CalendarFeed(string text,string[] excluded,DateTime utcNow)
    {
        var calendar=Ical.Net.Calendar.Load(text)??throw new InvalidDataException("Empty calendar.");var items=new JsonArray();
        foreach(var occurrence in calendar.GetOccurrences(new Ical.Net.DataTypes.CalDateTime(utcNow)).TakeWhile(o=>o.Period.StartTime.AsUtc<utcNow.AddMonths(6)))
        {
            if(occurrence.Source is not Ical.Net.CalendarComponents.CalendarEvent entry||excluded.Any(t=>(entry.Summary??"").Contains(t,StringComparison.OrdinalIgnoreCase)))continue;
            if(entry.RecurrenceRule is not null||entry.RecurrenceIdentifier is not null)continue;
            items.Add(Event(entry.Uid??"",entry.Summary??"Untitled event",new DateTimeOffset(DateTime.SpecifyKind(occurrence.Period.StartTime.AsUtc,DateTimeKind.Utc)),entry.Location??""));if(items.Count>=50)break;
        }
        return items;
    }

    /// <summary>Google Calendar events (expanded with singleEvents=true); instances of recurring series are left out.</summary>
    public static JsonArray GoogleEvents(JsonNode data,string[] excluded)
    {
        var items=new JsonArray();
        foreach(var item in data["items"]!.AsArray())
        {
            var title=item!["summary"]?.GetValue<string>()??"Untitled event";
            if(item["recurringEventId"] is not null||item["recurrence"] is not null||excluded.Any(t=>title.Contains(t,StringComparison.OrdinalIgnoreCase)))continue;
            var when=item["start"]?["dateTime"]?.GetValue<string>()??item["start"]?["date"]?.GetValue<string>();
            if(!DateTimeOffset.TryParse(when,CultureInfo.InvariantCulture,DateTimeStyles.AssumeLocal,out var start))continue;
            items.Add(Event(item["id"]?.GetValue<string>()??"",title,start,item["location"]?.GetValue<string>()??""));if(items.Count>=50)break;
        }
        return items;
    }

    /// <summary>The first participant-worthy name of an email sender: "Sara Lie &lt;sara@x.no&gt;" → "Sara Lie".</summary>
    public static string SenderName(string from)
    {
        var name=System.Text.RegularExpressions.Regex.Replace(from,@"\s*<[^>]*>\s*$","").Trim().Trim('"');
        return name.Length>0?name:from.Trim('<','>',' ');
    }

    /// <summary>The processor's marketing name, as Windows records it.</summary>
    public static string ProcessorName()
    {
        try{using var key=Microsoft.Win32.Registry.LocalMachine.OpenSubKey(@"HARDWARE\DESCRIPTION\System\CentralProcessor\0");return (key?.GetValue("ProcessorNameString") as string)?.Trim()??"";}
        catch(Exception error) when(error is System.Security.SecurityException or UnauthorizedAccessException or IOException){return "";}
    }
}
