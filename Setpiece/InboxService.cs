using System.Net;
using System.Net.Http.Headers;
using System.Runtime.InteropServices;
using System.Text.Json.Nodes;

namespace Setpiece.Rebuild;

internal static class InboxService
{
    public static async Task<JsonObject> Read(HttpClient http,Storage storage,JsonObject settings)
    {
        var provider=settings["InboxProvider"]?.GetValue<string>()??"";
        if(provider=="outlook")return await Outlook();
        if(provider!="google"||string.IsNullOrWhiteSpace(settings["GoogleRefreshToken"]?.GetValue<string>()))return Providers.State("disconnected","A quieter view of your inbox","Choose Google or Outlook desktop in Connections.");
        var token=await OAuth.Token(http,storage,"Google",settings);
        async Task<JsonNode> Get(string path)
        {
            using var request=new HttpRequestMessage(HttpMethod.Get,"https://gmail.googleapis.com/gmail/v1/users/me/"+path);request.Headers.Authorization=new AuthenticationHeaderValue("Bearer",token);
            using var response=await http.SendAsync(request);if(response.StatusCode==HttpStatusCode.Forbidden)throw new InvalidDataException("Reconnect Google and allow inbox read access.");response.EnsureSuccessStatusCode();return JsonNode.Parse(await response.Content.ReadAsStringAsync())!;
        }
        var list=await Get("messages?maxResults=8&q=in%3Ainbox%20is%3Aunread");var items=new JsonArray();
        foreach(var message in list["messages"]?.AsArray()??new JsonArray())
        {
            var id=message!["id"]!.GetValue<string>();var metadata=await Get("messages/"+Uri.EscapeDataString(id)+"?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date");
            var headers=metadata["payload"]?["headers"]?.AsArray();string Header(string name)=>headers?.FirstOrDefault(h=>h?["name"]?.GetValue<string>().Equals(name,StringComparison.OrdinalIgnoreCase)==true)?["value"]?.GetValue<string>()??"";
            items.Add(new JsonObject{["title"]=Header("Subject"),["detail"]=Header("From"),["url"]="https://mail.google.com/mail/u/0/#inbox/"+Uri.EscapeDataString(id)});
        }
        return Providers.State(items.Count>0?"ready":"empty",items.Count>0?"Unread, within reach":"You're all caught up",items.Count>0?"Google inbox · latest unread messages":"No unread messages in your inbox.",items);
    }
    private static async Task<JsonObject> Outlook()
    {
        var completion=new TaskCompletionSource<JsonObject>(TaskCreationOptions.RunContinuationsAsynchronously);
        var thread=new Thread(()=>
        {
            var objects=new Stack<object>();
            T Keep<T>(T item) where T:class {objects.Push(item);return item;}
            try
            {
                var type=Type.GetTypeFromProgID("Outlook.Application");if(type is null){completion.SetResult(Providers.State("disconnected","Open Outlook to connect","Install classic Outlook and sign in, or choose Google in Connections."));return;}
                dynamic application=Keep(Activator.CreateInstance(type)!);dynamic session=Keep((object)application.GetNamespace("MAPI"));dynamic inbox=Keep((object)session.GetDefaultFolder(6));dynamic collection=Keep((object)inbox.Items);dynamic unread=Keep((object)collection.Restrict("[UnRead] = true"));unread.Sort("[ReceivedTime]",true);
                var count=(int)unread.Count;var items=new JsonArray();
                for(var i=1;i<=Math.Min(count,8);i++)
                {
                    dynamic item=unread.Item(i);
                    try{items.Add(new JsonObject{["title"]=(string)item.Subject,["detail"]=(string)item.SenderName+" · "+((DateTime)item.ReceivedTime).ToString("ddd HH:mm"),["url"]="https://outlook.office.com/mail/inbox"});}
                    catch(COMException){}
                    finally{if(Marshal.IsComObject(item))Marshal.ReleaseComObject(item);}
                }
                completion.SetResult(Providers.State(count>0?"ready":"empty",count>0?$"{count} unread messages":"You're all caught up","Outlook desktop",items));
            }
            catch(Exception error){completion.TrySetResult(Providers.State("error","Outlook could not be read",error is COMException?"Open classic Outlook and allow read access when it asks. New Outlook can be opened in a browser tile.":"Outlook is busy or unavailable. Open it and retry."));}
            finally{while(objects.TryPop(out var value))if(Marshal.IsComObject(value))Marshal.ReleaseComObject(value);}
        }){IsBackground=true,Name="Setpiece inbox reader"};thread.SetApartmentState(ApartmentState.STA);thread.Start();
        try{return await completion.Task.WaitAsync(TimeSpan.FromSeconds(12));}catch(TimeoutException){return Providers.State("error","Outlook is waiting","Check Outlook for an access request, then refresh this widget.");}
    }
}
