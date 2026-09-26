import {Injectable,computed,inject,signal} from '@angular/core';
import {MatSnackBar} from '@angular/material/snack-bar';
import {Bridge} from '../../bridge';
import {Profile,Board,Tile,Display,AppWindow,History,assertLayout,newProfile,preset,splitTile,removeTile,vacantTile,widgets} from '../../domain';
import {Appearance,defaultAppearance,normalizeAppearance,applyAppearance} from '../../theme';

export type Route='Studio'|'Widgets'|'Browsers'|'Appearance'|'Settings';
export const routes:{name:Route;label:string;icon:string}[]=[
  {name:'Studio',label:'Studio',icon:'space_dashboard'},
  {name:'Widgets',label:'Widgets',icon:'widgets'},
  {name:'Browsers',label:'Browsers',icon:'language'},
  {name:'Appearance',label:'Appearance',icon:'palette'},
  {name:'Settings',label:'Settings',icon:'settings'}
];
/** Routes from older captures and links still land somewhere sensible. */
const routeAliases:Record<string,Route>={Connections:'Widgets',Apps:'Studio'};

export interface Bookmark {title:string;displayTitle:string;host:string;url:string;icon:string;folder:string;profile:string;}
export interface SharedBrowser {name:string;tabs:number;url:string;}

/**
 * Everything the Studio window knows: the active profile, its layout history, the host's
 * displays and connections, and every command that changes them. Surfaces read signals
 * from here; nothing else talks to the bridge about profiles.
 */
@Injectable({providedIn:'root'})
export class StudioStore {
  private readonly bridge=inject(Bridge);
  private readonly snackBar=inject(MatSnackBar);

  readonly query=new URLSearchParams(location.search);
  readonly widgetId=this.query.get('widget');
  readonly workspace=this.query.has('workspace');
  readonly gameSurface=this.query.has('game');
  readonly browserName=this.query.get('browser');
  readonly isStudio=!this.widgetId&&!this.workspace&&!this.gameSurface&&!this.browserName;

  readonly route=signal<Route>('Studio');
  readonly profile=signal<Profile>(newProfile('My workspace'));
  readonly profiles=signal<{key:string;profile?:Profile;error?:string}[]>([]);
  readonly displays=signal<Display[]>([]);
  readonly appearance=signal<Appearance>(defaultAppearance);
  readonly selected=signal('');
  readonly apps=signal<AppWindow[]>([]);
  readonly busy=signal(false);
  readonly error=signal('');
  readonly preview=signal<Tile[]|null>(null);
  readonly presetKind=signal('main-half');
  readonly presetCount=signal(3);
  readonly key=signal('');
  private readonly saved=signal('');
  readonly connections=signal<Record<string,any>>({});
  readonly executable=signal('');
  readonly dataRoot=signal('');
  readonly runtime=signal('');
  readonly sharedBrowsers=signal<SharedBrowser[]>([]);
  readonly bookmarks=signal<Bookmark[]>([]);
  readonly wallpaperViewport=signal<Record<string,string>>({});
  readonly ready=signal(false);

  readonly updateBusy=signal(false);
  readonly updateVersion=signal('');
  readonly updateStatus=signal('');

  private readonly history=new History<Profile>();
  private readonly historyVersion=signal(0);
  readonly canUndo=computed(()=>{this.historyVersion();return this.history.canUndo;});
  readonly canRedo=computed(()=>{this.historyVersion();return this.history.canRedo;});

  readonly dirty=computed(()=>JSON.stringify(this.profile())!==this.saved());
  readonly board=computed<Board>(()=>{const p=this.profile();return p.MonitorBoards.find(b=>b.MonitorIndex===p.MonitorIndex)??p.MonitorBoards[0];});
  readonly tile=computed(()=>this.board().Zones.find(t=>t.Id===this.selected()));
  readonly tiles=computed(()=>this.preview()??this.board().Zones);
  readonly monitor=computed(()=>this.displays().find(d=>d.index===this.board().MonitorIndex));
  readonly monitorSize=computed(()=>{const d=this.monitor();return {width:d?.width??1920,height:d?.height??1080};});
  readonly savedProfiles=computed(()=>this.profiles().filter(p=>p.profile));
  readonly profileErrors=computed(()=>this.profiles().filter(p=>p.error));

  /** Handlers the shell registers for flows that need a dialog. */
  dialogs:{closeUnsaved:()=>void;manage:(id:string)=>void;inspect:(id:string)=>void;guide:(service:string)=>void}={closeUnsaved:()=>{},manage:()=>{},inspect:()=>{},guide:()=>{}};

  constructor(){
    if(this.query.has('surface'))document.body.classList.add('widget-surface');
    applyAppearance(defaultAppearance);
    this.bridge.listen(e=>this.receive(e));
  }

  private receive(e:{event:string;data:any}){
    switch(e.event){
      case 'wallpaper-viewport':this.wallpaperViewport.set(e.data);break;
      case 'request-close':this.requestClose();break;
      case 'detached':this.detach(e.data);break;
      case 'notice':this.notify(e.data);break;
      case 'appearance':{const prefs=normalizeAppearance(e.data);this.appearance.set(prefs);applyAppearance(prefs);break;}
      case 'displays':this.displays.set(e.data);break;
      case 'browsers':this.sharedBrowsers.set(e.data??[]);break;
      case 'manage-widget':this.manageWidget(e.data);break;
      case 'inspect-widget':this.dialogs.inspect(e.data);break;
      case 'profile':this.profile.set(this.workspace?{...e.data,MonitorIndex:Number(this.query.get('workspace'))}:e.data);break;
    }
  }

  async initialize(){
    try{
      const data=await this.bridge.call('bootstrap');
      this.profiles.set(data.profiles);this.displays.set(data.displays);this.connections.set(data.connections??{});this.sharedBrowsers.set(data.browsers??[]);
      this.executable.set(data.executable??'');this.dataRoot.set(data.dataRoot??'');this.runtime.set(data.runtime??'');
      const preferences=normalizeAppearance(data.preferences);this.appearance.set(preferences);applyAppearance(preferences);
      if(data.profile&&!this.isStudio)this.profile.set(data.profile);
      else{
        const first=data.profiles.find((p:any)=>p.profile);
        if(first){this.key.set(first.key);this.profile.set(first.profile);this.saved.set(JSON.stringify(first.profile));}
        else this.saved.set(JSON.stringify(this.profile()));
      }
      if(this.workspace)this.profile.update(p=>({...p,MonitorIndex:Number(this.query.get('workspace'))}));
      this.selectFirst();
      if(this.isStudio)void this.refreshApps();
      if(this.isStudio||this.browserName)await this.loadBookmarks();
    }catch(e){this.error.set((e as Error).message);}
    this.ready.set(true);
    this.prepareCapture();
  }

  // Messages and errors.
  notify(text:string){this.snackBar.open(text,undefined,{duration:5000});}
  async execute<T=any>(command:string,payload:unknown={}):Promise<T|undefined>{try{return await this.bridge.call<T>(command,payload);}catch(e){this.error.set((e as Error).message);return undefined;}}

  // Profile editing with undo history.
  selectFirst(){this.selected.set(this.board().Zones[0]?.Id??'');}
  edit(mutate:(profile:Profile)=>void){
    try{
      const previous=this.profile(),next=structuredClone(previous);mutate(next);
      for(const board of next.MonitorBoards)assertLayout(board.Zones);
      this.commit(previous);this.profile.set(next);void this.execute('profile',{profile:next});
    }catch(e){this.error.set((e as Error).message);}
  }
  editBoard(mutate:(board:Board)=>void){this.edit(p=>mutate(p.MonitorBoards.find(b=>b.MonitorIndex===p.MonitorIndex)!));}
  /** Records a snapshot for undo. Used directly by pointer gestures that set the profile live. */
  commit(previous:Profile){this.history.commit(previous);this.historyVersion.update(v=>v+1);}
  undo(){this.profile.set(this.history.undo(this.profile()));this.historyVersion.update(v=>v+1);this.selectFirst();void this.execute('profile',{profile:this.profile(),restoreApplications:true});}
  redo(){this.profile.set(this.history.redo(this.profile()));this.historyVersion.update(v=>v+1);this.selectFirst();void this.execute('profile',{profile:this.profile(),restoreApplications:true});}
  private clearHistory(){this.history.clear();this.historyVersion.update(v=>v+1);}

  setProfileValue(key:'Gap'|'OuterMargin'|'SnapStep',value:number){this.edit(p=>{p[key]=Number(value);});}
  setSnap(value:string){this.edit(p=>{p.SmartSnap=value!=='off';if(value!=='off')p.SnapStep=Number(value);});}
  setScale(value:number){this.editBoard(b=>b.WidgetScale=value);}
  rename(name:string){if(name.trim())this.edit(p=>p.Name=name.trim());}

  // Displays.
  display(index:number){if(!this.profile().MonitorIndices.includes(index)){this.notify('This display is not in the workspace. Include it first.');return;}this.edit(p=>p.MonitorIndex=index);this.selectFirst();}
  includeDisplay(index:number){
    const info=this.displays().find(d=>d.index===index);
    this.edit(p=>{
      if(!p.MonitorIndices.includes(index))p.MonitorIndices.push(index);
      let board=p.MonitorBoards.find(b=>b.MonitorIndex===index);
      if(!board){board={MonitorIndex:index,MonitorDeviceName:info?.name,WidgetScale:1,Zones:preset('columns',1)};p.MonitorBoards.push(board);}
      else board.MonitorDeviceName=info?.name;
      p.MonitorIndex=index;
    });
    this.selectFirst();
  }
  excludeDisplay(index:number){
    if(this.profile().MonitorIndices.length===1){this.notify('Keep at least one display in this workspace.');return;}
    this.edit(p=>{p.MonitorIndices=p.MonitorIndices.filter(i=>i!==index);if(p.MonitorIndex===index)p.MonitorIndex=p.MonitorIndices[0];});
    this.selectFirst();
  }

  // Profiles.
  private stampDisplays(profile:Profile){for(const board of profile.MonitorBoards){const display=this.displays().find(d=>d.index===board.MonitorIndex);if(display)board.MonitorDeviceName=display.name;}}
  async save(){
    this.busy.set(true);
    const snapshot=structuredClone(this.profile());this.stampDisplays(snapshot);this.profile.set(snapshot);
    const key=await this.execute<string>('save',{key:this.key(),profile:snapshot});
    if(key){this.key.set(key);this.saved.set(JSON.stringify(snapshot));await this.reloadProfiles();this.notify('Workspace saved');}
    this.busy.set(false);
  }
  async launch(){
    this.busy.set(true);
    const snapshot=structuredClone(this.profile());this.stampDisplays(snapshot);this.profile.set(snapshot);
    const key=await this.execute<string>('launch',{key:this.key(),profile:snapshot});
    if(key){this.key.set(key);this.saved.set(JSON.stringify(snapshot));this.notify('Workspace launched');await this.reloadProfiles();}
    this.busy.set(false);
  }
  async reloadProfiles(){const data=await this.execute('bootstrap');if(data)this.profiles.set(data.profiles);}
  async createProfile(name:string){
    if(!name.trim())return false;
    if(this.dirty()){await this.save();if(this.dirty())return false;}
    const next=newProfile(name,this.profile().MonitorIndex);
    try{await this.bridge.call('switch-profile',{profile:next});}catch(e){this.error.set((e as Error).message);return false;}
    this.profile.set(next);this.key.set('');this.saved.set('');this.clearHistory();this.selectFirst();this.route.set('Studio');
    return true;
  }
  async loadProfile(key:string){
    const chosen=this.profiles().find(p=>p.key===key);if(!chosen?.profile)return;
    await this.execute('switch-profile',{profile:chosen.profile});
    this.key.set(key);this.profile.set(structuredClone(chosen.profile));this.saved.set(JSON.stringify(this.profile()));this.clearHistory();this.selectFirst();
  }
  async saveAndSwitch(key:string){await this.save();if(!this.dirty())await this.loadProfile(key);}
  async deleteProfile(){
    if(!this.key())return;
    await this.execute('delete',{key:this.key()});await this.reloadProfiles();
    const remaining=this.profiles().find(p=>p.profile);
    if(remaining)await this.loadProfile(remaining.key);
    else{this.profile.set(newProfile('My workspace'));this.key.set('');this.saved.set('');this.selectFirst();}
  }
  requestClose(){if(this.dirty())this.dialogs.closeUnsaved();else void this.execute('window',{action:'close-confirmed'});}
  async saveAndClose(){await this.save();if(!this.dirty())void this.execute('window',{action:'close-confirmed'});}
  windowAction(action:string){void this.execute('window',{action});}

  // Layout.
  showPreset(kind=this.presetKind(),count=this.presetCount()){
    this.presetKind.set(kind);this.presetCount.set(Math.max(1,Math.min(20,count)));
    try{this.preview.set(preset(kind,this.presetCount(),this.board().Zones));}catch(e){this.error.set((e as Error).message);}
  }
  commitPreset(){const candidate=this.preview();if(!candidate)return;this.editBoard(b=>b.Zones=candidate);this.preview.set(null);this.selectFirst();}
  split(vertical:boolean,ratio=.5){this.editBoard(b=>b.Zones=splitTile(b.Zones,this.selected(),vertical,ratio));}
  remove(){const id=this.selected();this.editBoard(b=>b.Zones=removeTile(b.Zones,id));void this.execute('release',{id});this.selectFirst();}
  addTile(){const tile=vacantTile(this.board().Zones);if(!tile){this.notify('Make some room first: resize or remove a tile.');return;}this.editBoard(b=>b.Zones.push(tile));this.selected.set(tile.Id);}
  setTileFullscreen(value:boolean){this.editBoard(b=>{const tile=b.Zones.find(t=>t.Id===this.selected());if(tile)tile.ConstrainFullscreenToTile=value;});}
  clearTile(){
    const id=this.selected();void this.execute('release',{id});
    this.editBoard(b=>{const tile=b.Zones.find(t=>t.Id===id);if(!tile)return;Object.assign(tile,{ContentKind:'Application',WidgetId:'',WidgetArg:'',AssignedProcessName:'',AssignedWindowTitle:'',SharedWebName:'',ConstrainFullscreenToTile:false,Web:{Tabs:[],SelectedTabId:'',ToolbarPinned:true}});});
  }
  widgetCount(id:string){return this.board().Zones.filter(t=>t.ContentKind==='Widget'&&t.WidgetId===id).length;}

  // Applications.
  async refreshApps(){const windows=await this.execute<AppWindow[]>('windows');if(windows)this.apps.set(windows);}
  async assign(window:AppWindow,tileId=this.selected()){
    const tile=this.board().Zones.find(t=>t.Id===tileId);if(!tile||tile.ContentKind!=='Application')return;
    const next=structuredClone(this.profile());
    const target=next.MonitorBoards.find(b=>b.MonitorIndex===next.MonitorIndex)!.Zones.find(t=>t.Id===tile.Id)!;
    target.AssignedProcessName=window.process;target.AssignedWindowTitle=window.title;
    try{const assigned=await this.bridge.call<Profile>('assign',{id:tile.Id,handle:window.handle,profile:next});this.commit(this.profile());this.profile.set(assigned);this.notify('Application assigned');}
    catch(e){this.error.set((e as Error).message);}
  }
  assignByHandle(handle:string,tileId=this.selected()){const app=this.apps().find(a=>a.handle===handle);if(app)void this.assign(app,tileId);}
  detach(id:string){
    this.profile.update(p=>{const next=structuredClone(p);for(const board of next.MonitorBoards){const tile=board.Zones.find(t=>t.Id===id);if(tile){tile.AssignedProcessName='';tile.AssignedWindowTitle='';}}return next;});
    this.notify('Application detached. The tile keeps its place.');
  }
  release(){const id=this.selected();void this.execute('release',{id});this.detach(id);}

  // Widgets.
  addWidget(id:string){
    const free=vacantTile(this.board().Zones);
    if(free){free.ContentKind='Widget';free.WidgetId=id;this.editBoard(b=>b.Zones.push(free));this.selected.set(free.Id);this.route.set('Studio');return;}
    const selected=this.tile();
    if(selected?.ContentKind==='Application'&&!selected.AssignedProcessName){this.editBoard(b=>{const t=b.Zones.find(t=>t.Id===this.selected())!;t.ContentKind='Widget';t.WidgetId=id;});}
    else{
      let added='';
      this.editBoard(b=>{b.Zones=splitTile(b.Zones,this.selected(),selected?selected.Width>=selected.Height:true);const t=b.Zones[b.Zones.findIndex(t=>t.Id===this.selected())+1];t.ContentKind='Widget';t.WidgetId=id;added=t.Id;});
      if(added)this.selected.set(added);
    }
    this.route.set('Studio');
  }
  manageWidget(id:string){
    if(this.widgetId){void this.execute('manage-widget',{id});return;}
    if(widgets.find(w=>w.id===id)?.preview||id==='twitter'){this.route.set('Widgets');return;}
    this.dialogs.manage(id);
  }
  expandWidget(id:string){if(this.widgetId)void this.execute('inspect-widget',{id});else this.dialogs.inspect(id);}
  playGame(){if(this.widgetId)void this.execute('open-game');else this.dialogs.manage('idle-game');}
  async refreshConnections(){try{const data=await this.bridge.call('bootstrap');this.connections.set(data.connections??{});}catch{}}

  // Appearance and wallpaper.
  appearanceChange<K extends keyof Appearance>(key:K,value:Appearance[K]){const next=normalizeAppearance({...this.appearance(),[key]:value});this.appearance.set(next);applyAppearance(next);void this.execute('preferences',next);}
  wallpaper(id:string){this.edit(p=>p.WallpaperId=id);}
  editAnimated(value:boolean){this.edit(p=>p.AnimatedWallpaper=value);}

  // Browsers.
  normalizeBookmarks(items:any[]):Bookmark[]{
    return items.map(item=>{
      let host=item.host??'';try{host||=new URL(item.url).hostname;}catch{}
      const title=String(item.title??'').trim(),normalized=title.toLowerCase().replace(/^https?:\/\//,'').replace(/\/$/,''),domain=host.toLowerCase();
      const isAddress=/^(https?:\/\/|www\.)/i.test(title)||normalized===domain||normalized===domain.replace(/^www\./,'');
      return {...item,host,displayTitle:isAddress?'':title};
    });
  }
  async loadBookmarks(){try{const data=await this.bridge.call<any>('brave-bookmarks-read');this.bookmarks.set(this.normalizeBookmarks(data.items??[]));}catch{}}
  async importBookmarks(){
    this.busy.set(true);
    try{const data=await this.bridge.call<any>('brave-bookmarks');this.bookmarks.set(this.normalizeBookmarks(data.items??[]));this.notify(`${data.count} Brave bookmarks imported`);}
    catch(e){this.error.set((e as Error).message);}
    finally{this.busy.set(false);}
  }
  async openBrowser(name:string,url:string){
    if(!name.trim()){this.error.set('Give this browser a name first.');return;}
    await this.execute('browser-open',{name,url:url||'https://www.google.com/'});
    this.sharedBrowsers.set(await this.execute<SharedBrowser[]>('browser-list')??this.sharedBrowsers());
  }
  linkBrowser(name:string,url:string){
    name=name.trim();
    if(name&&this.profile().MonitorBoards.some(b=>b.Zones.some(t=>t.ContentKind==='Web'&&t.SharedWebName.toLowerCase()===name.toLowerCase()))){this.error.set('This browser is already linked to a tile in this workspace. Choose a different name.');return;}
    if(this.tile()?.ContentKind!=='Application'||this.tile()?.AssignedProcessName){this.notify('Select an empty application tile in Studio first.');return;}
    this.editBoard(b=>{const t=b.Zones.find(t=>t.Id===this.selected())!;t.ContentKind='Web';t.SharedWebName=name;t.Web.Tabs=[{Id:crypto.randomUUID(),Title:name,Url:url}];});
    this.notify(`${name} linked to the selected tile`);
  }

  // Updates.
  async checkUpdate(){
    this.updateBusy.set(true);this.updateVersion.set('');this.updateStatus.set('Checking GitHub Releases…');
    try{const result=await this.bridge.call<{current:string;latest:string|null}>('check-update');this.updateVersion.set(result.latest??'');this.updateStatus.set(result.latest?`Version ${result.latest} is available. You have ${result.current}.`:`You're up to date on version ${result.current}.`);}
    catch(e){this.updateStatus.set((e as Error).message);}
    finally{this.updateBusy.set(false);}
  }
  async installUpdate(){
    this.updateBusy.set(true);this.updateStatus.set('Downloading and verifying the installer…');
    try{await this.bridge.call('install-update');this.updateVersion.set('');this.updateStatus.set('Installer started.');}
    catch(e){this.updateStatus.set((e as Error).message);this.updateVersion.set('');}
    finally{this.updateBusy.set(false);}
  }

  /** VisualAudit loads ?capture=1 with a route, theme and guide; the page then reports ready. */
  private prepareCapture(){
    if(!this.query.has('capture'))return;
    const prefs={...this.appearance(),mode:this.query.get('mode')==='light'||this.query.get('theme')==='luna'?'light' as const:'dark' as const,reducedMotion:true};
    this.appearance.set(prefs);applyAppearance(prefs);
    const route=this.query.get('route');
    if(route)this.route.set(routeAliases[route]??(routes.some(r=>r.name===route)?route as Route:'Studio'));
    const guide=this.query.get('guide');if(guide)this.dialogs.guide(guide);
    document.body.dataset['captureReady']='true';
  }
}
