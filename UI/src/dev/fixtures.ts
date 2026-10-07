// Sample data for the development mock bridge. Service states mirror the native
// design-review fixtures in Setpiece/VisualAudit.cs so browser previews match captures.
import type {Display,Profile,ServiceState,Tile} from '../domain';

const tile=(x:number,y:number,w:number,h:number,extra:Partial<Tile>={}):Tile=>({
  Id:crypto.randomUUID(),Name:'Untitled tile',X:x,Y:y,Width:w,Height:h,ContentKind:'Application',WidgetId:'',WidgetArg:'',
  AssignedProcessName:'',AssignedWindowTitle:'',SharedWebName:'',ConstrainFullscreenToTile:false,Web:{Tabs:[],SelectedTabId:'',ToolbarPinned:true},...extra
});

export const displays:Display[]=[
  {index:0,name:'\\\\.\\DISPLAY1',width:2560,height:1440,x:0,y:0,primary:true},
  {index:1,name:'\\\\.\\DISPLAY2',width:1920,height:1080,x:2560,y:0,primary:false},
  {index:2,name:'\\\\.\\DISPLAY3',width:1080,height:1920,x:-1080,y:0,primary:false}
];

export function sampleProfile():Profile{
  return {Name:'Setpiece Reveal',SchemaVersion:18,Gap:12,OuterMargin:16,MonitorIndex:0,MonitorIndices:[0,1],WallpaperId:'jade-synthesis',SmartSnap:true,SnapStep:.05,
    MonitorBoards:[
      {MonitorIndex:0,WidgetScale:1.6,Zones:[
        tile(0,0,.5,1,{AssignedProcessName:'Code',AssignedWindowTitle:'setpiece — Visual Studio Code'}),
        tile(.5,0,.25,.5,{ContentKind:'Widget',WidgetId:'clock'}),
        tile(.75,0,.25,.5,{ContentKind:'Widget',WidgetId:'weather'}),
        tile(.5,.5,.25,.5,{ContentKind:'Widget',WidgetId:'spotify'}),
        tile(.75,.5,.25,.5,{ContentKind:'Widget',WidgetId:'system'})
      ]},
      {MonitorIndex:1,WidgetScale:1,Zones:[
        tile(0,0,.65,1,{ContentKind:'Web',SharedWebName:'Media',Web:{Tabs:[{Id:'t1',Title:'YouTube',Url:'https://www.youtube.com/'}],SelectedTabId:'t1',ToolbarPinned:true}}),
        tile(.65,0,.35,1)
      ]}
    ]};
}

export function focusProfile():Profile{
  return {Name:'Deep focus',SchemaVersion:18,Gap:16,OuterMargin:24,MonitorIndex:0,MonitorIndices:[0],WallpaperId:'moss-geometry',SmartSnap:true,SnapStep:.05,
    MonitorBoards:[{MonitorIndex:0,WidgetScale:1,Zones:[tile(0,0,.7,1),tile(.7,0,.3,.5,{ContentKind:'Widget',WidgetId:'notes'}),tile(.7,.5,.3,.5,{ContentKind:'Widget',WidgetId:'google-calendar'})]}]};
}

export const connections:Record<string,unknown>={
  WeatherLocation:'Oslo',RuterStopName:'Kjelsås stasjon',RuterStopId:'NSR:StopPlace:59516',NewsCategories:[],CalendarExcludedTitles:['Blocked'],
  ClockTimeZones:['America/New_York','Asia/Tokyo','Australia/Sydney'],ClockLocationLabels:['New York','Tokyo','Sydney'],
  DiscordServerId:'1234567890',RedditCommunity:'technology',TwitchChannel:'setpiece',InboxProvider:'google',CodexExecutable:'',
  GoogleConnected:true,SpotifyConnected:true,DiscordConnected:true,RedditConnected:false,CalendarFeedConnected:true,DiscordCallConnected:false
};

export const apps=[
  {handle:'101',title:'setpiece — Visual Studio Code',process:'Code'},
  {handle:'102',title:'Inbox — Outlook',process:'OUTLOOK'},
  {handle:'103',title:'Figma',process:'Figma'},
  {handle:'104',title:'Windows Terminal',process:'WindowsTerminal'},
  {handle:'105',title:'Spotify Premium',process:'Spotify'}
];

export const browsers=[{name:'Media',tabs:2,url:'https://www.youtube.com/'},{name:'Research',tabs:5,url:'https://scholar.google.com/'}];

export const bookmarks=[
  {title:'GitHub',host:'github.com',url:'https://github.com/',icon:'',folder:'Bar',profile:'Default'},
  {title:'Material Design',host:'m3.material.io',url:'https://m3.material.io/',icon:'',folder:'Bar',profile:'Default'},
  {title:'https://www.yr.no/',host:'www.yr.no',url:'https://www.yr.no/',icon:'',folder:'Bar',profile:'Default'},
  {title:'Hacker News',host:'news.ycombinator.com',url:'https://news.ycombinator.com/',icon:'',folder:'Bar',profile:'Default'}
];

const iso=(d:Date)=>d.toISOString();
/** A day relative to today, at a time of day. */
const at=(days:number,hm:string)=>{const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()+days);const [h,m]=hm.split(':').map(Number);d.setHours(h,m);return d;};
const minutesFromNow=(n:number)=>new Date(Date.now()+n*60000);
const lastSunday=(hm:string)=>{const d=at(0,hm);d.setDate(d.getDate()-(d.getDay()||7));return d;};
/** A stand-in camera frame (16:9) for previews; the real one comes from the printer. */
export const sampleCamera='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><defs><linearGradient id="w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9d4cb"/><stop offset="1" stop-color="#9a958c"/></linearGradient><linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6e6558"/><stop offset="1" stop-color="#3c362f"/></linearGradient></defs><rect width="1280" height="720" fill="url(#w)"/><path d="M180 720 330 420h640l150 300z" fill="url(#b)"/><path d="M330 420h640l18 36H312z" fill="#827867"/><rect x="560" y="110" width="170" height="150" rx="16" fill="#e9e6e0"/><rect x="620" y="260" width="50" height="60" rx="8" fill="#c9c4bb"/><rect x="640" y="320" width="10" height="26" fill="#55504a"/><rect x="0" y="120" width="1280" height="26" fill="#bdb8af"/><path d="M596 470h120l20-38h-40l-8-40h-60l-6 40h-36z" fill="#e8743b"/></svg>');

/** Service states for the development bridge, relative to the (possibly shifted) clock. */
export function services(camera=sampleCamera):Record<string,ServiceState>{
  const soon=new Date(Date.now()+2*3600000);soon.setMinutes(soon.getMinutes()<30?30:60,0,0);
  const hour=new Date().getHours(),hh=(i:number)=>String((hour+i)%24).padStart(2,'0')+':00';
  const departure=(minutes:number,line:string,destination:string,mode:string,platform:string)=>({title:line+' · '+destination,detail:minutes===0?'Now':minutes+' min',line,destination,mode,platform,delay:0,minutes,time:iso(minutesFromNow(minutes)),id:line+'-'+destination+'-'+minutes});
  const events:[Date,string,string][]=[
    [soon,'Dinner with Sara','Mathallen'],[at(2,'17:30'),'Verity','Odeon Kino'],[at(4,'20:45'),'Digger','Rockefeller'],[at(11,'09:00'),'Setpiece 2.0 launch','Release day'],
    [at(19,'08:00'),'Bygdøyløpet','10 km'],[at(46,'19:00'),'Fotball','Ullevaal Stadion'],[at(54,'12:30'),'Flight to London','OSL → LHR'],[at(57,'14:15'),'Flight to Oslo','LHR → OSL'],[at(81,'18:00'),'Julebord','Grand Hotel']
  ];
  return {
    clock:{status:'ready',title:'Clock',detail:'Your places',data:{zones:connections['ClockTimeZones'],labels:connections['ClockLocationLabels']}},
    system:{status:'ready',title:'18% CPU',detail:'15.1 / 31.9 GB memory',data:{cpu:18,memory:47,gpu:31,temperature:46,download:254000,upload:7800,usedGb:15.1,totalGb:31.9,cpuName:'AMD Ryzen 7 7800X3D 8-Core Processor',gpuName:'NVIDIA GeForce RTX 4070'}},
    weather:{status:'ready',title:'16°',detail:'Oslo',updated:iso(new Date()),data:{feelsLike:14.5,wind:12,code:2,high:18,low:11},items:[16,17,17,16,14,12].map((temp,i)=>({title:hh(i),detail:temp+'° · 10% rain',temp}))},
    'bambu-lab':{status:'ready',title:'Making something good',detail:'Bambu Lab A1 Mini',data:{stage:'RUNNING',progress:68,minutes:24,layer:198,layers:291,nozzle:220,bed:65,job:'Benchy',filament:'PLA Matte',image:camera}},
    'google-calendar':{status:'ready',title:'Your next 6 months',detail:'Upcoming events',items:events.map(([start,title,place],i)=>({id:'event-'+i,title,detail:start.toLocaleString('en-GB',{weekday:'short',hour:'2-digit',minute:'2-digit'})+' · '+place,start:iso(start),place}))},
    ruter:{status:'ready',title:'Kjelsås stasjon',detail:'Live departures · Entur',items:[departure(2,'54','Tåsen','bus','A'),departure(5,'54','Kværnerbyen','bus','A'),departure(7,'12','Majorstuen','tram','B'),departure(11,'54','Ekeberg hageby','bus','A'),departure(14,'R10','Drammen','rail','1'),departure(19,'25','Majorstuen','bus','C')]},
    discord:{status:'ready',title:'Lounge',detail:'4 participants · Discord desktop',items:[{title:'You',detail:'In call',id:'you'},{title:'Sara',detail:'Muted',id:'sara'},{title:'Jonas',detail:'In call',id:'jonas'},{title:'Ingrid',detail:'Deafened',id:'ingrid'}],data:{voice:true,server:'Setpiece Crew',muted:false,deafened:false}},
    spotify:{status:'ready',title:'Night Drive',detail:'Chromatics',data:{album:'Night Drive',track:'2Z8WuEywRWYTKe1NybPQEW',device:'Studio PC',progress:119000,duration:280000,playing:true,liked:false}},
    email:{status:'ready',title:'Unread, within reach',detail:'Google inbox · latest unread messages',data:{count:4,source:'Gmail · Primary'},items:[
      {title:'Re: Widget review notes',detail:'Sara Lie',from:'Sara Lie',time:iso(at(0,'09:12')),url:'https://mail.google.com/#1'},
      {title:'[setpiece] PR #8 is ready for review',detail:'GitHub',from:'GitHub',time:iso(at(0,'08:47')),url:'https://mail.google.com/#2'},
      {title:'Your filament order has shipped',detail:'Bambu Lab',from:'Bambu Lab',time:iso(at(0,'08:03')),url:'https://mail.google.com/#3'},
      {title:'Your monthly pass renews on Friday',detail:'Ruter',from:'Ruter',time:iso(lastSunday('18:20')),url:'https://mail.google.com/#4'}
    ]},
    news:{status:'ready',title:'The latest from VG',detail:'Headlines from Norway',items:[
      {title:'Rekordvarm september: Oslo slo 100 år gammel rekord',detail:'',category:'Nyheter',published:iso(minutesFromNow(-12)),url:'https://www.vg.no/#1'},
      {title:'Nordlyset kan bli synlig over hele Sør-Norge i natt',detail:'',category:'Vær',published:iso(minutesFromNow(-48)),url:'https://www.vg.no/#2'},
      {title:'Ny T-banelinje til Fornebu åpner tidligere enn planlagt',detail:'',category:'Nyheter',published:iso(minutesFromNow(-120)),url:'https://www.vg.no/#3'},
      {title:'Bodø/Glimt snudde kampen på overtid – full jubel på Aspmyra',detail:'',category:'Sport',published:iso(minutesFromNow(-180)),url:'https://www.vg.no/#4'}
    ]},
    reddit:{status:'ready',title:'r/technology',detail:'Hot conversations',items:[
      {title:'Researchers demo a laptop battery that charges in under five minutes',detail:'4210 points',score:4210,created:(Date.now()-5*3600000)/1000,url:'https://www.reddit.com/r/technology/1'},
      {title:'The quiet comeback of the dedicated music player',detail:'2870 points',score:2870,created:(Date.now()-3*3600000)/1000,url:'https://www.reddit.com/r/technology/2'},
      {title:'Open-source printer firmware adds live layer previews',detail:'1940 points',score:1940,created:(Date.now()-2*3600000)/1000,url:'https://www.reddit.com/r/technology/3'},
      {title:'A tiny e-ink dashboard that shows your whole day at a glance',detail:'860 points',score:860,created:(Date.now()-40*60000)/1000,url:'https://www.reddit.com/r/technology/4'}
    ]},
    twitch:{status:'ready',title:'@setpiece',detail:'Live chat',data:{channel:'setpiece',connected:true,login:'rubster',canSend:true},items:[
      {title:'Nova_Flux',detail:'just got here, what did I miss?',id:'c1',color:'#9146FF',action:false,badges:['moderator'],parts:[{t:'just got here, what did I miss?'}]},
      {title:'kettleDrum',detail:'the new layout looks so clean',id:'c2',color:'#1E90FF',action:false,badges:['subscriber'],parts:[{t:'the new layout looks so clean'}]},
      {title:'ping_pong',detail:'same, those rounded corners 👌',id:'c3',color:'#FF7F50',action:false,badges:[],parts:[{t:'same, those rounded corners 👌'}]},
      {title:'Marit',detail:'we are so back',id:'c4',color:'#2E8B57',action:false,badges:['vip'],parts:[{t:'we are so back'}]},
      {title:'jonasdev',detail:'anyone know what song this is?',id:'c5',color:'',action:false,badges:[],parts:[{t:'anyone know what song this is?'}]},
      {title:'Streamer',detail:'thanks for the follow, welcome in!',id:'c6',color:'#E91E63',action:false,badges:['broadcaster'],parts:[{t:'thanks for the follow, welcome in!'}]}
    ]},
    battery:{status:'ready',title:'76%',detail:'3h 18m remaining',data:{level:76,charging:false,plugged:false,saver:false,remaining:11880}},
    volume:{status:'ready',title:'42%',detail:'Speakers (Realtek Audio)',data:{level:42,peak:28,muted:false}},
    codex:{status:'ready',title:'Room for your next idea',detail:'Claude and Codex limits, OpenCode activity',data:{
      claude:{windows:[{name:'claude',minutes:300,used:34,resetText:iso(minutesFromNow(134.5))},{name:'claude',minutes:10080,used:61}]},
      codex:{windows:[{name:'codex',minutes:300,used:8,reset:Math.floor(Date.now()/1000)+4*3600},{name:'codex',minutes:10080,used:78}]},
      opencode:{available:true,sessions:51,tokens:15236247,cost:9.29},
      go:{windows:[{name:'rolling',used:3},{name:'weekly',used:12},{name:'monthly',used:49}]}
    }}
  };
}

/** Non-ready states, used when the page is opened with ?mockState=<status>. The copy matches the States board. */
export function stateFor(service:string,status:string):ServiceState{
  if(status==='loading')return {status:'loading',title:'',detail:''};
  if(status==='disconnected')return service==='bambu-lab'?{status:'disconnected',title:'Connect your printer',detail:'Add your access code once to follow every print.'}:{status:'disconnected',title:'Connect to get started',detail:'Set this up once and it works in every workspace.'};
  if(status==='offline')return service==='weather'?{status:'offline',title:'Waiting for the network',detail:'The forecast refreshes the moment you are back online.'}:{status:'offline',title:'You are offline',detail:'Setpiece will refresh when the connection returns.'};
  if(status==='empty')return service==='google-calendar'?{status:'empty',title:'Nothing else today',detail:'Enjoy the room.'}:{status:'empty',title:'Nothing here right now',detail:'New items will show up on their own.'};
  if(status==='error')return {status:'error',title:'Could not refresh',detail:'The service did not respond. Try again in a moment.'};
  return services()[service]??{status:'disconnected',title:'Connect a service',detail:'Design review'};
}
