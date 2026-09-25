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
  return {Name:'Setpiece Reveal',SchemaVersion:18,Gap:12,OuterMargin:16,MonitorIndex:0,MonitorIndices:[0,1],WallpaperId:'fjord-glass',AnimatedWallpaper:false,SmartSnap:true,SnapStep:.05,
    MonitorBoards:[
      {MonitorIndex:0,WidgetScale:1,Zones:[
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
  return {Name:'Deep focus',SchemaVersion:18,Gap:16,OuterMargin:24,MonitorIndex:0,MonitorIndices:[0],WallpaperId:'moss-geometry',AnimatedWallpaper:false,SmartSnap:true,SnapStep:.05,
    MonitorBoards:[{MonitorIndex:0,WidgetScale:1,Zones:[tile(0,0,.7,1),tile(.7,0,.3,.5,{ContentKind:'Widget',WidgetId:'notes'}),tile(.7,.5,.3,.5,{ContentKind:'Widget',WidgetId:'google-calendar'})]}]};
}

export const connections:Record<string,unknown>={
  WeatherLocation:'Oslo',RuterStopName:'Kjelsås stasjon',RuterStopId:'NSR:StopPlace:59516',NewsCategories:[],CalendarExcludedTitles:['Blocked'],
  ClockTimeZones:['Europe/Oslo','America/New_York','Asia/Tokyo'],ClockLocationLabels:['Oslo','New York','Tokyo'],
  DiscordServerId:'1234567890',RedditCommunity:'technology',InboxProvider:'google',CodexExecutable:'',
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

const calendarItems=[{title:'Design review with the team',detail:'10:30 · 45 min'},{title:'Lunch with Sara',detail:'12:00 · City centre'},{title:'Focus time',detail:'14:00 · 2 hours'},{title:'Setpiece release planning',detail:'16:00 · 30 min'},{title:'Climbing',detail:'18:30 · Oslo Klatresenter'}];

export const services:Record<string,ServiceState>={
  clock:{status:'ready',title:'Clock',detail:'Your places',data:{zones:connections['ClockTimeZones'],labels:connections['ClockLocationLabels']}},
  system:{status:'ready',title:'System',detail:'15.1 / 31.9 GB memory',data:{cpu:18,memory:47,gpu:48,temperature:46,download:254000,upload:7800}},
  weather:{status:'ready',title:'16°',detail:'Oslo',data:{feelsLike:14.5,wind:24.8,code:61},items:[{title:'19:00',detail:'16.8° · 100% rain'},{title:'20:00',detail:'16.7° · 100% rain'},{title:'21:00',detail:'16.7° · 91% rain'},{title:'22:00',detail:'16.8° · 77% rain'},{title:'23:00',detail:'16.9° · 63% rain'}]},
  'bambu-lab':{status:'ready',title:'Benchy, 0.2 mm',detail:'A1 Mini',data:{stage:'Layer by layer',progress:68,minutes:24,layer:198,layers:291,nozzle:219.578,bed:59.783}},
  'google-calendar':{status:'ready',title:'Today',detail:'Your upcoming events',items:calendarItems},
  ruter:{status:'ready',title:'Kjelsås stasjon',detail:'Departures nearby',items:[{title:'54 · Tåsen',detail:'2 min'},{title:'54 · Kværnerbyen',detail:'5 min'},{title:'12 · Majorstuen',detail:'7 min'},{title:'54 · Ekeberg hageby',detail:'11 min'},{title:'R10 · Drammen',detail:'14 min'}]},
  discord:{status:'ready',title:'Setpiece Makers',detail:'4 members online',items:[{title:'Sam',detail:'online'},{title:'Mira',detail:'online'},{title:'Tess',detail:'idle'},{title:'Jon',detail:'online'},{title:'Ada',detail:'dnd'}]},
  spotify:{status:'ready',title:'Night Drive',detail:'Chromatics · Kill for Love',data:{progress:119000,duration:280000,playing:true}},
  email:{status:'ready',title:'6 messages need attention',detail:'Unread in the last 24 hours',items:[{title:'Quarterly update',detail:'Alex · 10 min ago',url:'https://mail.google.com/'},{title:'Design review',detail:'Mira · 25 min ago',url:'https://mail.google.com/'},{title:'Invoice 2841',detail:'Finance · 1 h ago',url:'https://mail.google.com/'},{title:'Weekend plans',detail:'Tess · 2 h ago',url:'https://mail.google.com/'}]},
  news:{status:'ready',title:'A quieter web is taking shape',detail:'The latest from VG',items:[{title:'A quieter web is taking shape',detail:'New tools change the daily rhythm.',url:'https://www.vg.no/'},{title:'The city prepares for a warm weekend',detail:'A forecast worth planning around.',url:'https://www.vg.no/'},{title:'Researchers map the next generation of chips',detail:'The work continues across the field.',url:'https://www.vg.no/'},{title:'Local teams meet in a close final',detail:'A late goal changed the match.',url:'https://www.vg.no/'}]},
  reddit:{status:'ready',title:'r/technology',detail:'A conversation worth a moment',items:[{title:'A new approach to local-first software',detail:'1.2k points · 318 comments',url:'https://reddit.com/'},{title:'What are you building this week?',detail:'642 points · 129 comments',url:'https://reddit.com/'},{title:'An open standard gets a new release',detail:'529 points · 84 comments',url:'https://reddit.com/'}]},
  battery:{status:'ready',title:'81%',detail:'About 4 h 20 min remaining',data:{level:81,charging:false}},
  volume:{status:'ready',title:'System volume',detail:'Windows output device',data:{level:42,peak:28,muted:false}},
  codex:{status:'ready',title:'AI Usage',detail:'Account limits',data:{claude:{windows:[{name:'claude',minutes:300,used:34},{name:'claude',minutes:10080,used:61}]},codex:{windows:[{name:'codex',minutes:300,used:8,reset:1790000000},{name:'codex',minutes:10080,used:78,reset:1790200000}]},opencode:{available:true,sessions:51,tokens:15236247,cost:9.29},go:{windows:[{name:'rolling',used:0},{name:'weekly',used:12},{name:'monthly',used:49}]}}}
};

/** Non-ready states, used when the page is opened with ?mockState=<status>. */
export function stateFor(service:string,status:string):ServiceState{
  if(status==='loading')return {status:'loading',title:'',detail:''};
  if(status==='disconnected')return {status:'disconnected',title:'Connect to get started',detail:'Set this up once and it works in every workspace.'};
  if(status==='offline')return {status:'offline',title:'You are offline',detail:'Setpiece will refresh when the connection returns.'};
  if(status==='empty')return {status:'empty',title:'Nothing here right now',detail:'New items will show up on their own.'};
  if(status==='error')return {status:'error',title:'Could not refresh',detail:'The service did not respond. Try again in a moment.'};
  return services[service]??{status:'disconnected',title:'Connect a service',detail:'Design review'};
}
