using Microsoft.Data.Sqlite;
using System.Diagnostics;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Setpiece.Rebuild;

internal static class AiUsage
{
    public static async Task<JsonObject> Read(HttpClient http,JsonObject settings)
    {
        var claudeTask=Claude(http);var codexTask=Codex(settings);var localTask=Task.Run(LocalOpenCode);var goTask=OpenCodeGo(http);
        await Task.WhenAll(claudeTask,codexTask,localTask,goTask);
        var claude=await claudeTask;var codex=await codexTask;var local=await localTask;var go=await goTask;
        var data=new JsonObject{["claude"]=claude,["codex"]=codex,["opencode"]=local,["go"]=go};
        var ready=claude["windows"]?.AsArray().Count>0||codex["windows"]?.AsArray().Count>0||local["available"]?.GetValue<bool>()==true||go["windows"]?.AsArray().Count>0;
        return Providers.State(ready?"ready":"disconnected","Room for your next idea","Claude and Codex limits, OpenCode activity",data:data);
    }
    private static async Task<JsonObject> Claude(HttpClient http)
    {
        var result=new JsonObject{["status"]="Sign in to Claude Code to show its limits.",["windows"]=new JsonArray()};
        var configured=Environment.GetEnvironmentVariable("CLAUDE_CONFIG_DIR");
        var directory=string.IsNullOrWhiteSpace(configured)?Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),".claude"):configured;
        var file=Path.Combine(directory,".credentials.json");if(!File.Exists(file))return result;
        try
        {
            using var stream=new FileStream(file,FileMode.Open,FileAccess.Read,FileShare.ReadWrite);var auth=(await JsonNode.ParseAsync(stream))?["claudeAiOauth"];
            var token=auth?["accessToken"]?.GetValue<string>();if(string.IsNullOrWhiteSpace(token))return result;
            if(auth?["expiresAt"] is JsonValue expires&&expires.TryGetValue<long>(out var expiresAt)&&expiresAt<DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()){result["status"]="Claude sign-in expired. Open Claude Code to refresh it.";return result;}
            using var request=new HttpRequestMessage(HttpMethod.Get,"https://api.anthropic.com/api/oauth/usage");request.Headers.Authorization=new AuthenticationHeaderValue("Bearer",token);request.Headers.Add("anthropic-beta","oauth-2025-04-20");
            using var response=await http.SendAsync(request);response.EnsureSuccessStatusCode();var data=JsonNode.Parse(await response.Content.ReadAsStringAsync());
            var windows=new JsonArray();
            foreach(var (key,minutes) in new[]{("five_hour",300),("seven_day",10080)})
                if(data?[key] is JsonObject window&&window["utilization"] is JsonValue utilization&&utilization.TryGetValue<double>(out var used))
                    windows.Add(new JsonObject{["name"]="claude",["used"]=Math.Clamp(used,0,100),["minutes"]=minutes,["resetText"]=window["resets_at"]?.DeepClone()});
            return new JsonObject{["status"]=windows.Count>0?"Connected through Claude Code":"No Claude quota windows returned.",["windows"]=windows};
        }
        catch(Exception error) when(error is IOException or JsonException or InvalidOperationException or HttpRequestException or OperationCanceledException){result["status"]="Claude limits are unavailable. Open Claude Code, sign in, and retry.";return result;}
    }
    private static string? FindCodex(JsonObject settings)
    {
        var configured=settings["CodexExecutable"]?.GetValue<string>();if(!string.IsNullOrWhiteSpace(configured)&&File.Exists(configured)&&Path.GetExtension(configured).Equals(".exe",StringComparison.OrdinalIgnoreCase))return configured;
        foreach(var directory in (Environment.GetEnvironmentVariable("PATH")??"").Split(Path.PathSeparator))
        {try{var path=Path.Combine(directory.Trim('"'),"codex.exe");if(File.Exists(path))return path;}catch(ArgumentException){}}
        var installed=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"OpenAI","Codex","bin");
        return Directory.Exists(installed)?Directory.EnumerateDirectories(installed).Select(d=>Path.Combine(d,"codex.exe")).Where(File.Exists).OrderByDescending(File.GetLastWriteTimeUtc).FirstOrDefault():null;
    }
    private static async Task<JsonObject> Codex(JsonObject settings)
    {
        var path=FindCodex(settings);if(path is null)return new JsonObject{["status"]="Install Codex, or choose where it is in the widget settings.", ["windows"]=new JsonArray()};
        using var process=new Process{StartInfo=new ProcessStartInfo(path){UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true}};
        process.StartInfo.ArgumentList.Add("app-server");using var timeout=new CancellationTokenSource(TimeSpan.FromSeconds(18));
        try
        {
            process.Start();process.ErrorDataReceived+=(_,_)=>{};process.BeginErrorReadLine();
            await Send(process,new JsonObject{["id"]=1,["method"]="initialize",["params"]=new JsonObject{["clientInfo"]=new JsonObject{["name"]="setpiece_workspace",["title"]="Setpiece",["version"]="2.0"}}},timeout.Token);
            await Response(process,1,timeout.Token);await Send(process,new JsonObject{["method"]="initialized"},timeout.Token);
            await Send(process,new JsonObject{["id"]=2,["method"]="account/rateLimits/read"},timeout.Token);
            var result=await Response(process,2,timeout.Token);var windows=new JsonArray();
            var buckets=result["rateLimitsByLimitId"] is JsonObject map?map.Select(pair=>pair.Value).OfType<JsonObject>():result["rateLimits"] is JsonObject single?[single]:Enumerable.Empty<JsonObject>();
            foreach(var bucket in buckets)foreach(var period in new[]{"primary","secondary"})
            {
                if(bucket[period] is not JsonObject window||window["usedPercent"] is not JsonValue used||!used.TryGetValue<double>(out var percentage))continue;
                windows.Add(new JsonObject{["name"]=bucket["limitName"]?.DeepClone()??bucket["limitId"]?.DeepClone()??JsonValue.Create("Codex"),["used"]=Math.Clamp(percentage,0,100),["minutes"]=window["windowDurationMins"]?.DeepClone(),["reset"]=window["resetsAt"]?.DeepClone()});
            }
            return new JsonObject{["status"]=windows.Count>0?"Connected through Codex":"No quota data returned. Sign in to Codex with ChatGPT.",["windows"]=windows};
        }
        catch(Exception error) when(error is IOException or JsonException or InvalidDataException or OperationCanceledException or System.ComponentModel.Win32Exception)
        {return new JsonObject{["status"]=error is OperationCanceledException?"Codex did not respond in time. Retry shortly.":"Codex quota is unavailable. Open Codex, sign in, and retry.",["windows"]=new JsonArray()};}
        finally{try{if(process.Id>0&&!process.HasExited)process.Kill(true);}catch(InvalidOperationException){}catch(System.ComponentModel.Win32Exception){}}
    }
    private static async Task Send(Process process,JsonObject message,CancellationToken token){await process.StandardInput.WriteLineAsync(message.ToJsonString().AsMemory(),token);await process.StandardInput.FlushAsync(token);}
    private static async Task<JsonObject> Response(Process process,int id,CancellationToken token)
    {
        while(true)
        {
            var line=await process.StandardOutput.ReadLineAsync(token)??throw new IOException("Codex closed its connection.");if(line.Length>2_000_000)throw new InvalidDataException("Unexpected Codex response size.");
            var message=JsonNode.Parse(line)?.AsObject();if(message?["id"] is not JsonValue value||!value.TryGetValue<int>(out var responseId)||responseId!=id)continue;
            if(message["error"] is not null)throw new InvalidDataException("Codex could not read the account limits.");return message["result"]!.AsObject();
        }
    }
    private static JsonObject LocalOpenCode()
    {
        var home=Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        var paths=new[]{Path.Combine(home,".local","share","opencode","opencode.db"),Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),"opencode","opencode.db"),Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"opencode","opencode.db")};
        var file=paths.FirstOrDefault(File.Exists);if(file is null)return new JsonObject{["available"]=false,["status"]="No local OpenCode sessions yet."};
        try
        {
            using var connection=new SqliteConnection(new SqliteConnectionStringBuilder{DataSource=file,Mode=SqliteOpenMode.ReadOnly,Pooling=false,DefaultTimeout=2}.ToString());connection.Open();
            using var schema=connection.CreateCommand();schema.CommandText="PRAGMA table_info(session)";var columns=new HashSet<string>();using(var reader=schema.ExecuteReader())while(reader.Read())columns.Add(reader.GetString(1));
            if(!columns.Contains("time_updated"))return new JsonObject{["available"]=false,["status"]="This OpenCode database version is not supported."};
            var since=DateTimeOffset.UtcNow.AddDays(-7).ToUnixTimeMilliseconds();using var count=connection.CreateCommand();count.CommandText="SELECT COUNT(*) FROM session WHERE time_updated >= $since";count.Parameters.AddWithValue("$since",since);var sessions=Convert.ToInt64(count.ExecuteScalar());
            double cost=0;long tokens=0;
            if(columns.Contains("cost"))
            {
                using var totals=connection.CreateCommand();var tokenColumns=new[]{"tokens_input","tokens_output","tokens_reasoning"}.Where(columns.Contains).Select(c=>"COALESCE("+c+",0)").ToArray();
                totals.CommandText="SELECT COALESCE(SUM(cost),0), COALESCE(SUM("+(tokenColumns.Length>0?string.Join("+",tokenColumns):"0")+"),0) FROM session WHERE time_updated >= $since";totals.Parameters.AddWithValue("$since",since);using var reader=totals.ExecuteReader();if(reader.Read()){cost=reader.GetDouble(0);tokens=reader.GetInt64(1);}
            }
            else
            {
                using var messages=connection.CreateCommand();messages.CommandText="SELECT data FROM message WHERE time_created >= $since LIMIT 10000";messages.Parameters.AddWithValue("$since",since);using var reader=messages.ExecuteReader();
                while(reader.Read()){var row=JsonNode.Parse(reader.GetString(0));cost+=row?["cost"]?.GetValue<double>()??0;foreach(var key in new[]{"input","output","reasoning"})tokens+=row?["tokens"]?[key]?.GetValue<long>()??0;}
            }
            return new JsonObject{["available"]=true,["status"]="Local activity · last 7 days",["sessions"]=sessions,["cost"]=cost,["tokens"]=tokens};
        }
        catch(Exception error) when(error is SqliteException or IOException or JsonException or InvalidOperationException){return new JsonObject{["available"]=false,["status"]="OpenCode activity could not be read. Close a busy database and retry."};}
    }
    private static async Task<JsonObject> OpenCodeGo(HttpClient http)
    {
        var result=new JsonObject{["status"]="Sign in to OpenCode Go to show its limits.",["windows"]=new JsonArray()};
        var file=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),".local","share","opencode","auth.json");if(!File.Exists(file))return result;
        try
        {
            using var stream=new FileStream(file,FileMode.Open,FileAccess.Read,FileShare.ReadWrite);var auth=await JsonNode.ParseAsync(stream);var key=auth?["opencode-go"]?["key"]?.GetValue<string>();if(string.IsNullOrWhiteSpace(key))return result;
            using var request=new HttpRequestMessage(HttpMethod.Get,"https://opencode.ai/zen/go/v1/usage");request.Headers.Authorization=new AuthenticationHeaderValue("Bearer",key);using var response=await http.SendAsync(request);response.EnsureSuccessStatusCode();var data=JsonNode.Parse(await response.Content.ReadAsStringAsync());
            var windows=new JsonArray();if(data?["usage"] is JsonObject usage)foreach(var pair in usage)if(pair.Value?["percent"] is JsonValue percent&&percent.TryGetValue<double>(out var used))windows.Add(new JsonObject{["name"]=pair.Key,["used"]=Math.Clamp(used,0,100),["resetText"]=pair.Value["resetsAt"]?.DeepClone()});
            return new JsonObject{["status"]=windows.Count>0?"OpenCode Go limits":"No Go quota windows returned.",["windows"]=windows};
        }
        catch(Exception error) when(error is IOException or JsonException or HttpRequestException or OperationCanceledException){result["status"]="Go limits are unavailable. Local activity remains available.";return result;}
    }
}
