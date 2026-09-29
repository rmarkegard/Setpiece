// Development-only stand-in for the WebView2 host, enabled with ?mock=1 under `pnpm start`.
// Production builds replace this file with mock.prod.ts (see angular.json), so none of this ships.
import {defaultAppearance} from '../theme';
import type {Profile} from '../domain';
import * as fixtures from './fixtures';

type Listener=(event:MessageEvent)=>void;

export function installMock(){
  const query=new URLSearchParams(location.search);
  // ?mock takes over even inside WebView2, so dev captures can run without the native host.
  if(!query.has('mock'))return;
  (window as unknown as {setpieceAssetBase:string}).setpieceAssetBase='/dev-assets/';
  // ?mockTime=10:24 starts the clock at that time of day, for repeatable screenshots.
  const time=/^(\d{1,2}):(\d{2})$/.exec(query.get('mockTime')??'');
  if(time){
    const RealDate=Date,start=new RealDate();start.setHours(Number(time[1]),Number(time[2]),0,0);
    const offset=start.getTime()-RealDate.now();
    class ShiftedDate extends RealDate{constructor(...args:unknown[]){if(args.length)super(...(args as [number]));else super(RealDate.now()+offset);}static override now(){return RealDate.now()+offset;}}
    window.Date=ShiftedDate as DateConstructor;
  }

  const listeners=new Set<Listener>();
  const emit=(message:unknown)=>setTimeout(()=>{for(const listener of listeners)listener({data:message} as MessageEvent);},0);
  const event=(name:string,data:unknown)=>emit({event:name,data});

  const forced=query.get('mockState');
  const saved:{key:string;profile:Profile}[]=[{key:'setpiece-reveal',profile:fixtures.sampleProfile()},{key:'deep-focus',profile:fixtures.focusProfile()}];
  let active=structuredClone(saved[0].profile);
  const accent=query.get('accent');
  let preferences={...defaultAppearance,mode:query.get('mode')==='light'?'light':'dark',accent:accent&&/^[0-9a-f]{6}$/i.test(accent)?'#'+accent:defaultAppearance.accent,surface:query.get('surface')==='glass'?'glass':'solid',palette:query.get('palette')==='plain'?'plain':'colorful'};
  let note='Widget redesign\n• Motion only when something happens\n• Numbers roll, lists make room';
  const browserState={name:query.get('browser')??'Media',selected:'t1',tabs:[{id:'t1',title:'Blue hour over the fjord, live - YouTube',url:'https://www.youtube.com/watch?v=blue-hour'},{id:'t2',title:'Material Design 3',url:'https://m3.material.io/'}],url:'https://www.youtube.com/watch?v=blue-hour',pinned:true,constrain:false,back:true,forward:false,extension:'uBlock Origin Lite 2025.1',runtime:'140.0.3485.54'};
  const services=fixtures.services(query.get('mockCamera')??undefined);
  const systemBase={...services['system'].data};

  const handlers:Record<string,(payload:any)=>unknown>={
    bootstrap:()=>({profiles:structuredClone(saved),displays:fixtures.displays,preferences,connections:fixtures.connections,browsers:fixtures.browsers,executable:'C:\\Users\\you\\AppData\\Local\\Programs\\Setpiece\\Setpiece.exe',dataRoot:'C:\\Users\\you\\AppData\\Roaming\\Setpiece',runtime:'140.0.3485.54',profile:structuredClone(active)}),
    windows:()=>fixtures.apps,
    service:({service}:{service:string})=>{
      if(forced)return fixtures.stateFor(service,forced);
      // Live readings wander around their sample values, the way a real machine's do.
      if(service==='system'){const data=services['system'].data!;for(const [key,spread] of [['cpu',9],['gpu',9],['memory',1.2],['temperature',2]] as const)data[key]=Math.max(1,Math.min(99,Number(systemBase[key])+(Math.random()-.5)*spread*2));data['download']=Number(systemBase['download'])*(.6+Math.random()*.8);data['upload']=Number(systemBase['upload'])*(.6+Math.random()*.8);}
      return structuredClone(services[service]??fixtures.stateFor(service,''));
    },
    save:({key,profile}:{key:string;profile:Profile})=>{const id=key||profile.Name.toLowerCase().replace(/\W+/g,'-');const existing=saved.find(s=>s.key===id);if(existing)existing.profile=structuredClone(profile);else saved.push({key:id,profile:structuredClone(profile)});active=structuredClone(profile);return id;},
    launch:(payload:{key:string;profile:Profile})=>handlers['save'](payload),
    profile:({profile}:{profile:Profile})=>{active=structuredClone(profile);return null;},
    'switch-profile':({profile}:{profile:Profile})=>{active=structuredClone(profile);return null;},
    delete:({key}:{key:string})=>{const index=saved.findIndex(s=>s.key===key);if(index>=0)saved.splice(index,1);return null;},
    preferences:(value:typeof preferences)=>{preferences=value;event('appearance',value);return null;},
    assign:({profile}:{profile:Profile})=>profile,
    release:()=>null,stop:()=>null,external:()=>null,window:()=>null,'stop-search':({query}:{query:string})=>[{id:'1',name:query+' stasjon',label:query+' stasjon · Oslo'},{id:'2',name:query+' skole',label:query+' skole · Oslo'}],
    'timezone-search':({query}:{query:string})=>[{name:query,timezone:'Asia/Shanghai',label:query+', China'},{name:query+' Heights',timezone:'America/Chicago',label:query+' Heights, USA'}],
    'check-update':()=>({current:'2.0.0',latest:'2.1.0'}),'install-update':()=>null,
    connect:({service}:{service:string})=>({title:'Connected',detail:service+' is ready to use'}),disconnect:()=>null,
    'claude-sign-in':()=>null,'note-read':()=>({text:note}),'note-save':({text}:{text:string})=>{note=text;event('note',{text});return null;},
    volume:(change:{level?:number;muted?:boolean})=>{Object.assign(services['volume'].data!,change);return structuredClone(services['volume']);},
    'discord-voice':()=>services['discord'],
    'spotify-playback':({action}:{action:string})=>{const data=services['spotify'].data!;if(action==='play'||action==='pause')data['playing']=action==='play';return structuredClone(services['spotify']);},
    'spotify-like':({liked}:{liked:boolean})=>{services['spotify'].data!['liked']=liked;return structuredClone(services['spotify']);},
    'manage-widget':({id}:{id:string})=>{event('manage-widget',id);return null;},
    'inspect-widget':({id}:{id:string})=>{event('inspect-widget',id);return null;},
    browser:({action,...rest}:{action:string;[key:string]:unknown})=>{
      if(action==='select')browserState.selected=String(rest['id']);
      if(action==='pin')browserState.pinned=!browserState.pinned;
      if(action==='fullscreen-mode')browserState.constrain=!browserState.constrain;
      if(action==='navigate')browserState.url=String(rest['url']);
      if(action==='add'){const id='t'+(browserState.tabs.length+1);browserState.tabs.push({id,title:'New tab',url:'about:blank'});browserState.selected=id;}
      if(action==='close')browserState.tabs=browserState.tabs.filter(t=>t.id!==rest['id']);
      return structuredClone(browserState);
    },
    'browser-open':()=>null,'browser-list':()=>fixtures.browsers,
    'brave-bookmarks':()=>({count:fixtures.bookmarks.length,items:fixtures.bookmarks}),'brave-bookmarks-read':()=>({items:fixtures.bookmarks})
  };

  // Development hooks: change a service's state and announce it, so a widget plays its event now.
  // setpieceMock.update('email',s=>{s.items!.unshift({...});}) or setpieceMock.set('bambu-lab',{...}).
  (window as unknown as {setpieceMock:unknown}).setpieceMock={
    state:(service:string)=>structuredClone(services[service]),
    set:(service:string,state:typeof services[string])=>{services[service]=structuredClone(state);event('service',service);},
    update:(service:string,change:(state:typeof services[string])=>void)=>{change(services[service]);if(service==='system')Object.assign(systemBase,services['system'].data);event('service',service);}
  };

  window.chrome={...window.chrome,webview:{
    addEventListener:(_name:string,callback:Listener)=>listeners.add(callback),
    postMessage:(message:unknown)=>{
      const {id,command,payload}=message as {id:number;command:string;payload:any};
      const handler=handlers[command];
      // A short delay keeps loading states honest without slowing previews down.
      setTimeout(()=>{
        try{emit(handler?{id,result:handler(payload??{})}:{id,error:`The mock bridge does not handle "${command}".`});}
        catch(error){emit({id,error:(error as Error).message});}
      },command!=='service'?20:forced==='loading'?1e9:120);
    }
  }};
}
