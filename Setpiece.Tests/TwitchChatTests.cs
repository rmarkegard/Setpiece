using Setpiece.Rebuild;
using System.Text.Json.Nodes;
using Xunit;

namespace Setpiece.Tests;

public class TwitchChatTests
{
    [Fact]
    public void A_chat_line_becomes_a_message_with_its_emotes_in_place()
    {
        var line=TwitchChat.Parse("@badges=moderator/1;color=#9146FF;display-name=Nova;emotes=25:6-10;id=abc :nova!nova@nova.tmi.twitch.tv PRIVMSG #setpiece :hello Kappa friend")!.Value;
        var item=TwitchChat.Item(line)!;
        Assert.Equal("Nova",item["title"]!.GetValue<string>());
        Assert.Equal("#9146FF",item["color"]!.GetValue<string>());
        Assert.Equal("moderator",item["badges"]![0]!.GetValue<string>());
        var parts=item["parts"]!.AsArray();
        Assert.Equal(["hello ","Kappa"," friend"],parts.Select(p=>p!["t"]!.GetValue<string>()));
        Assert.Contains("/emoticons/v2/25/",parts[1]!["e"]!.GetValue<string>());
        Assert.Null(parts[0]!["e"]);
    }

    [Fact]
    public void Emote_positions_count_characters_not_utf16_units()
    {
        var parts=TwitchChat.Parts("😀 Kappa",  "25:2-6");
        Assert.Equal(["😀 ","Kappa"],parts.Select(p=>p!["t"]!.GetValue<string>()));
    }

    [Fact]
    public void Bad_emote_ranges_and_colours_are_ignored()
    {
        var parts=TwitchChat.Parts("hi","25:5-9/../x:0-1");
        Assert.Single(parts);
        var line=TwitchChat.Parse("@color=red;display-name=A :a!a@a PRIVMSG #c :hi")!.Value;
        Assert.Equal("",TwitchChat.Item(line)!["color"]!.GetValue<string>());
    }

    [Fact]
    public void An_action_message_is_marked_and_stripped()
    {
        var line=TwitchChat.Parse(":a!a@a PRIVMSG #c :\u0001ACTION waves\u0001")!.Value;
        var item=TwitchChat.Item(line)!;
        Assert.True(item["action"]!.GetValue<bool>());
        Assert.Equal("waves",item["detail"]!.GetValue<string>());
        Assert.Equal("a",item["title"]!.GetValue<string>());
    }
    [Fact]
    public void Seven_tv_emotes_replace_whole_words_only()
    {
        var extra=new Dictionary<string,string>{["Clap"]="https://cdn.7tv.app/emote/a/2x_static.webp"};
        var parts=TwitchChat.Parts("nice Clap Clapping Clap","",extra);
        Assert.Equal(["nice ","Clap"," Clapping ","Clap"],parts.Select(p=>p!["t"]!.GetValue<string>()));
        Assert.NotNull(parts[1]!["e"]);Assert.Null(parts[2]!["e"]);Assert.NotNull(parts[3]!["e"]);
    }

    [Fact]
    public void A_seven_tv_set_maps_names_to_images_on_7tv_only()
    {
        var set=System.Text.Json.Nodes.JsonNode.Parse("""{"emotes":[{"name":"Clap","data":{"host":{"url":"//cdn.7tv.app/emote/01ABC"}}},{"name":"bad","data":{"host":{"url":"//evil.example/emote/x"}}},{"name":"two words","data":{"host":{"url":"//cdn.7tv.app/emote/z"}}}]}""");
        var map=TwitchChat.SevenTvSet(set);
        Assert.Single(map);
        Assert.Equal("https://cdn.7tv.app/emote/01ABC/2x.webp",map["Clap"]);
    }
    [Theory]
    [InlineData("https://www.twitch.tv/xQc","xqc")]
    [InlineData("https://twitch.tv/marlon?referrer=raid","marlon")]
    [InlineData("https://m.twitch.tv/clix/","clix")]
    [InlineData("https://www.twitch.tv/directory/following",null)]
    [InlineData("https://www.twitch.tv/videos/123",null)]
    [InlineData("https://www.twitch.tv/clix/clip/abc",null)]
    [InlineData("https://www.twitch.tv/settings",null)]
    [InlineData("https://www.youtube.com/xqc",null)]
    [InlineData("not a url",null)]
    public void A_browser_page_names_the_stream_it_shows(string url,string? channel)=>Assert.Equal(channel,TwitchChat.ChannelFromUrl(url));
}
