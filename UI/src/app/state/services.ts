// How each widget is set up. Widgets and connections share one vocabulary: a widget's
// settings open its service form, and its status reads from the host's public settings.
export type SetupStatus='connected'|'needs-setup'|'ready'|'optional';

export interface ServiceInfo {
  /** The service id the host's `connect` command expects. */
  service:string;
  /** One sentence shown above the form. */
  intro:string;
  /** Primary action label. */
  action:'Connect'|'Save'|'Enable sensors'|null;
  /** Whether the host can forget saved credentials for this service. */
  canDisconnect:boolean;
  status:(connections:Record<string,unknown>)=>SetupStatus;
}

const has=(value:unknown)=>Array.isArray(value)?value.length>0:!!value;

export const serviceInfo:Record<string,ServiceInfo>={
  clock:{service:'clock',intro:'Add up to four places. Setpiece works out each time zone for you.',action:'Save',canDisconnect:false,status:()=>'ready'},
  weather:{service:'weather',intro:'Choose a city or place for local conditions. No account needed.',action:'Save',canDisconnect:true,status:c=>has(c['WeatherLocation'])?'connected':'needs-setup'},
  ruter:{service:'ruter',intro:'Find the stop you leave from, and see its next departures.',action:'Save',canDisconnect:true,status:c=>has(c['RuterStopName'])?'connected':'needs-setup'},
  'google-calendar':{service:'calendar',intro:'Use a private calendar feed, or your connected Google account.',action:'Connect',canDisconnect:true,status:c=>c['CalendarFeedConnected']||c['GoogleConnected']?'connected':'needs-setup'},
  calendar:{service:'calendar',intro:'Use a private calendar feed, or your connected Google account.',action:'Connect',canDisconnect:true,status:c=>c['CalendarFeedConnected']||c['GoogleConnected']?'connected':'needs-setup'},
  google:{service:'google',intro:'Lets Calendar and Inbox read your events and mail. Read-only.',action:'Connect',canDisconnect:true,status:c=>c['GoogleConnected']?'connected':'needs-setup'},
  spotify:{service:'spotify',intro:'Shows what is playing, with playback controls.',action:'Connect',canDisconnect:true,status:c=>c['SpotifyConnected']?'connected':'needs-setup'},
  discord:{service:'discord',intro:'Follow a public server, or join your own voice calls.',action:'Connect',canDisconnect:true,status:c=>c['DiscordConnected']||c['DiscordCallConnected']?'connected':'needs-setup'},
  news:{service:'news',intro:'VG headlines, no account needed. Narrow them to the categories you like.',action:'Save',canDisconnect:false,status:()=>'ready'},
  reddit:{service:'reddit',intro:'Pick a community to follow.',action:'Save',canDisconnect:true,status:c=>has(c['RedditCommunity'])?'connected':'needs-setup'},
  email:{service:'email',intro:'Read unread mail from Gmail or the classic Outlook desktop app.',action:'Save',canDisconnect:true,status:c=>c['InboxProvider']==='outlook'||c['GoogleConnected']?'connected':'needs-setup'},
  'bambu-lab':{service:'bambu-lab',intro:'Connect your printer over your local network.',action:'Connect',canDisconnect:true,status:c=>has(c['BambuHost'])?'connected':'needs-setup'},
  codex:{service:'codex',intro:'Reads Claude limits with your Claude Code sign-in, Codex limits through its local app server, and OpenCode activity from its database.',action:'Save',canDisconnect:false,status:()=>'ready'},
  system:{service:'system',intro:'CPU and memory work right away. GPU and temperature sensors need a separate collector.',action:'Enable sensors',canDisconnect:false,status:()=>'optional'},
  volume:{service:'volume',intro:'Change output volume and mute right in the widget. Pick devices in Windows Sound settings.',action:null,canDisconnect:false,status:()=>'ready'},
  battery:{service:'battery',intro:'Uses live Windows power information. Nothing to set up.',action:null,canDisconnect:false,status:()=>'ready'},
  notes:{service:'notes',intro:'Notes save automatically to your Setpiece data folder on this PC.',action:null,canDisconnect:false,status:()=>'ready'},
  'idle-game':{service:'idle-game',intro:'Collect salvage in the scrapyard and spend it in your workshop.',action:null,canDisconnect:false,status:()=>'ready'}
};

export function infoFor(id:string):ServiceInfo|undefined{return serviceInfo[id];}

export const statusLabel:Record<SetupStatus,string>={connected:'Connected','needs-setup':'Needs setup',ready:'Ready',optional:'Optional setup'};
export const statusIcon:Record<SetupStatus,string>={connected:'check_circle','needs-setup':'error','ready':'check_circle',optional:'tune'};

/** Accounts that serve several widgets and have no widget of their own. */
export const accounts=[{id:'google',name:'Google account',icon:'account_circle',description:'Used by Calendar and Inbox.'}];
