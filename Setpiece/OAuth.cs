using System.Diagnostics;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;

namespace Setpiece.Rebuild;

internal static class OAuth
{
    private static string Encode(byte[] value)=>Convert.ToBase64String(value).TrimEnd('=').Replace('+','-').Replace('/','_');
    private static string Query(Dictionary<string,string> values)=>string.Join("&",values.Select(p=>Uri.EscapeDataString(p.Key)+"="+Uri.EscapeDataString(p.Value)));
    public static async Task<JsonObject> Connect(HttpClient http,Storage storage,string provider,string client,string secret)
    {
        if(string.IsNullOrWhiteSpace(client))throw new InvalidDataException("Enter your application's client ID first.");
        var verifier=Encode(RandomNumberGenerator.GetBytes(48));var state=Encode(RandomNumberGenerator.GetBytes(24));const string redirect="http://127.0.0.1:43827/callback/";
        using var listener=new HttpListener();listener.Prefixes.Add(redirect);listener.Start();using var timeout=new CancellationTokenSource(TimeSpan.FromMinutes(2));
        var parameters=new Dictionary<string,string>{["client_id"]=client,["redirect_uri"]=redirect,["response_type"]="code",["state"]=state,["code_challenge"]=Encode(SHA256.HashData(Encoding.ASCII.GetBytes(verifier))),["code_challenge_method"]="S256",["scope"]=provider=="Google"?"https://www.googleapis.com/auth/calendar.events.readonly https://www.googleapis.com/auth/gmail.readonly":"user-read-playback-state user-read-currently-playing user-modify-playback-state"};
        if(provider=="Google"){parameters["access_type"]="offline";parameters["prompt"]="consent";}
        if(provider=="Reddit"){parameters["scope"]="read";parameters["duration"]="permanent";parameters.Remove("code_challenge");parameters.Remove("code_challenge_method");}
        if(provider=="Discord"){if(string.IsNullOrWhiteSpace(secret))throw new InvalidDataException("Enter the client secret of your Discord application.");parameters["scope"]="identify rpc rpc.voice.read rpc.voice.write";parameters["prompt"]="consent";parameters.Remove("code_challenge");parameters.Remove("code_challenge_method");}
        Host.OpenExternal(AuthorizeUrl(provider)+Query(parameters));
        var context=await listener.GetContextAsync().WaitAsync(timeout.Token);var valid=context.Request.QueryString["state"]==state;var code=context.Request.QueryString["code"];
        var bytes=Encoding.UTF8.GetBytes("<!doctype html><title>Setpiece</title><p>You can return to Setpiece. This window may be closed.</p>");context.Response.ContentType="text/html; charset=utf-8";await context.Response.OutputStream.WriteAsync(bytes,timeout.Token);context.Response.Close();
        if(!valid||string.IsNullOrWhiteSpace(code))throw new InvalidDataException("Authorization was canceled or could not be verified. Your previous connection is preserved.");
        var form=new Dictionary<string,string>{["client_id"]=client,["grant_type"]="authorization_code",["code"]=code,["redirect_uri"]=redirect,["code_verifier"]=verifier};if(provider is "Google" or "Discord"&&secret.Length>0)form["client_secret"]=secret;
        using var response=await Exchange(http,provider,client,form,timeout.Token);response.EnsureSuccessStatusCode();var token=JsonNode.Parse(await response.Content.ReadAsStringAsync(timeout.Token))!.AsObject();var changes=TokenFields(provider,token);changes[provider+"ClientId"]=client;if(provider is "Google" or "Discord")changes[provider+"ClientSecret"]=secret;if(provider=="Spotify")changes["SpotifyPlaybackPermission"]=true;storage.UpdateConnections(changes);return Providers.State("ready","Connected",provider+" is ready to use.");
    }
    public static async Task<string> Token(HttpClient http,Storage storage,string provider,JsonObject settings)
    {
        if(DateTimeOffset.TryParse(settings[provider+"ExpiresAt"]?.GetValue<string>(),out var expires)&&expires>DateTimeOffset.UtcNow.AddMinutes(2))return settings[provider+"AccessToken"]!.GetValue<string>();
        var form=new Dictionary<string,string>{["client_id"]=settings[provider+"ClientId"]?.GetValue<string>()??"",["grant_type"]="refresh_token",["refresh_token"]=settings[provider+"RefreshToken"]?.GetValue<string>()??""};
        if(provider is "Google" or "Discord")form["client_secret"]=settings[provider+"ClientSecret"]?.GetValue<string>()??"";
        using var response=await Exchange(http,provider,form["client_id"],form,CancellationToken.None);response.EnsureSuccessStatusCode();var token=JsonNode.Parse(await response.Content.ReadAsStringAsync())!.AsObject();storage.UpdateConnections(TokenFields(provider,token));return token["access_token"]!.GetValue<string>();
    }
    private static string Endpoint(string provider)=>provider switch{"Google"=>"https://oauth2.googleapis.com/token","Reddit"=>"https://www.reddit.com/api/v1/access_token","Discord"=>"https://discord.com/api/oauth2/token",_=>"https://accounts.spotify.com/api/token"};
    private static string AuthorizeUrl(string provider)=>provider switch{"Google"=>"https://accounts.google.com/o/oauth2/v2/auth?","Reddit"=>"https://www.reddit.com/api/v1/authorize?","Discord"=>"https://discord.com/oauth2/authorize?",_=>"https://accounts.spotify.com/authorize?"};
    private static async Task<HttpResponseMessage> Exchange(HttpClient http,string provider,string client,Dictionary<string,string> form,CancellationToken token)
    {
        using var request=new HttpRequestMessage(HttpMethod.Post,Endpoint(provider)){Content=new FormUrlEncodedContent(form)};
        if(provider=="Reddit")request.Headers.Authorization=new System.Net.Http.Headers.AuthenticationHeaderValue("Basic",Convert.ToBase64String(Encoding.UTF8.GetBytes(client+":")));
        return await http.SendAsync(request,token);
    }
    private static JsonObject TokenFields(string provider,JsonObject token)
    {
        var result=new JsonObject{[provider+"AccessToken"]=token["access_token"]!.DeepClone(),[provider+"ExpiresAt"]=DateTimeOffset.UtcNow.AddSeconds(token["expires_in"]?.GetValue<int>()??3600).ToString("O")};if(provider=="Discord")result["DiscordCallToken"]=token["access_token"]!.DeepClone();if(token["refresh_token"] is not null)result[provider+"RefreshToken"]=token["refresh_token"]!.DeepClone();return result;
    }
}
