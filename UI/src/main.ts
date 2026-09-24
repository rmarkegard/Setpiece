import { Component,ChangeDetectorRef,HostListener,inject,signal } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { A11yModule } from '@angular/cdk/a11y';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatSliderModule } from '@angular/material/slider';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Bridge } from './bridge';
import { IconComponent } from './icon';
import { WidgetComponent } from './widget';
import { GameComponent } from './scrapbots';
import { WallpaperComponent } from './wallpaper';
import { Profile,Board,Tile,TileDrop,Display,AppWindow,widgets,wallpaperNames,newProfile,preset,splitTile,removeTile,transform,History,assertLayout,moveTile,resizeTile,ResizeHandle,vacantTile,dropTile,tilePercentBounds } from './domain';
import { Appearance,accentColors,defaultAccent,defaultAppearance,normalizeAppearance,applyAppearance,colorRoles } from './theme';
@Component({selector:'setpiece-app',standalone:true,imports:[IconComponent,A11yModule,CommonModule,FormsModule,MatButtonModule,MatSliderModule,MatSlideToggleModule,MatProgressBarModule,WidgetComponent,GameComponent,WallpaperComponent],templateUrl:'./app.html'})
class App {
  changeDetector=inject(ChangeDetectorRef);bridge=inject(Bridge);route=signal('Studio');profile=signal<Profile>(newProfile('My workspace'));profiles=signal<{key:string;profile?:Profile;error?:string}[]>([]);displays=signal<Display[]>([]);appearance=signal<Appearance>(defaultAppearance);selected=signal('');apps=signal<AppWindow[]>([]);busy=signal(false);error=signal('');message=signal('');modal=signal('');filter=signal('All');preview=signal<Tile[]|null>(null);dropPreview=signal<TileDrop|null>(null);key='';saved='';history=new History<Profile>();nameInput='';search='';presetCount=3;presetKind='main-half';connections:Record<string,any>={};form:Record<string,any>={};stopResults:{id:string;name:string;label:string}[]=[];timezoneResults:{name:string;timezone:string;label:string}[]=[];connecting=signal(false);connectionResult=signal('');executable='';dataRoot='';runtime='';catalog=widgets;wallpapers=wallpaperNames;accentColors=accentColors;defaultAccent=defaultAccent;Math=Math;query=new URLSearchParams(location.search);widgetId=this.query.get('widget');workspace=this.query.has('workspace');gameSurface=this.query.has('game');browserName=this.query.get('browser');browserUrl=this.query.get('url')??'https://www.youtube.com/';browserTabs:{id:string;title:string;url:string}[]=[];browserBookmarks:{title:string;displayTitle:string;host:string;url:string;icon:string;folder:string;profile:string}[]=[];sharedBrowsers:{name:string;tabs:number;url:string}[]=[];browserPinned=true;browserState:any={};sharedName='Media';sharedUrl='https://www.youtube.com/';
  navigation=[{name:'Studio',icon:'▦'},{name:'Widgets',icon:'◈'},{name:'Connections',icon:'⌁'},{name:'Appearance',icon:'◐'},{name:'Browsers',icon:'▱'},{name:'Settings',icon:'⚙'}];
  constructor(){if(this.query.has('surface'))document.body.classList.add('widget-surface');applyAppearance(defaultAppearance);this.bridge.onEvent=e=>{if(e.event==='wallpaper-viewport'){this.wallpaperViewport=e.data;this.changeDetector.markForCheck();}if(e.event==='request-close')this.requestClose();if(e.event==='detached')this.detach(e.data);if(e.event==='notice')this.notify(e.data);if(e.event==='appearance'){const prefs=normalizeAppearance(e.data);this.appearance.set(prefs);applyAppearance(prefs);}if(e.event==='displays')this.displays.set(e.data);if(e.event==='browser')this.receiveBrowser(e.data);if(e.event==='browsers'){this.sharedBrowsers=e.data??[];this.changeDetector.markForCheck();}if(e.event==='manage-widget')this.manageWidget(e.data);if(e.event==='inspect-widget')this.inspect(e.data);if(e.event==='profile'){this.profile.set(e.data);if(this.workspace)this.profile.update(p=>({...p,MonitorIndex:Number(this.query.get('workspace'))}));}};void this.initialize();}
  async initialize(){try{const data=await this.bridge.call('bootstrap');this.profiles.set(data.profiles);this.displays.set(data.displays);this.connections=data.connections;this.sharedBrowsers=data.browsers??[];this.executable=data.executable;this.dataRoot=data.dataRoot;this.runtime=data.runtime;const preferences=normalizeAppearance(data.preferences);this.appearance.set(preferences);applyAppearance(preferences);if(data.profile&&(this.workspace||this.widgetId||this.gameSurface)){this.profile.set(data.profile);}else{const first=data.profiles.find((p:any)=>p.profile);if(first){this.key=first.key;this.profile.set(first.profile);this.saved=JSON.stringify(first.profile);}else this.saved=JSON.stringify(this.profile());}if(this.workspace)this.profile.update(p=>({...p,MonitorIndex:Number(this.query.get('workspace'))}));this.selectFirst();if(this.browserName)this.receiveBrowser(await this.bridge.call('browser',{action:'state'}));if(!this.workspace&&!this.widgetId&&!this.gameSurface&&!this.browserName)void this.refreshApps();if(this.browserName||(!this.workspace&&!this.widgetId&&!this.gameSurface))await this.loadBraveBookmarks();this.prepareCapture();}catch(e){this.error.set((e as Error).message);}}
  board():Board{return this.profile().MonitorBoards.find(b=>b.MonitorIndex===this.profile().MonitorIndex)??this.profile().MonitorBoards[0];}
  tile(){return this.board().Zones.find(t=>t.Id===this.selected());}
  dirty(){return JSON.stringify(this.profile())!==this.saved;}
  selectFirst(){this.selected.set(this.board().Zones[0]?.Id??'');}
  notify(text:string){this.message.set(text);setTimeout(()=>this.message.set(''),5000);}
  async execute<T=any>(command:string,payload:unknown={}):Promise<T|undefined>{try{return await this.bridge.call<T>(command,payload);}catch(e){this.error.set((e as Error).message);return undefined;}}
  edit(mutate:(profile:Profile)=>void){try{const previous=this.profile();const next=structuredClone(previous);mutate(next);for(const board of next.MonitorBoards)assertLayout(board.Zones);this.history.commit(previous);this.profile.set(next);void this.execute('profile',{profile:next});}catch(e){this.error.set((e as Error).message);}}
  editBoard(mutate:(board:Board)=>void){this.edit(p=>mutate(p.MonitorBoards.find(b=>b.MonitorIndex===p.MonitorIndex)!));}
  setProfileValue(key:'Gap'|'OuterMargin'|'SnapStep',value:number){this.edit(p=>{p[key]=Number(value);});}
  setSnap(value:string){this.edit(p=>{p.SmartSnap=value!=='off';if(value!=='off')p.SnapStep=Number(value);});}
  setScale(value:number){this.editBoard(b=>b.WidgetScale=value);}
  excludeDisplay(index:number){if(this.profile().MonitorIndices.length===1){this.notify('Keep at least one display in this profile.');return;}this.edit(p=>{p.MonitorIndices=p.MonitorIndices.filter(i=>i!==index);if(p.MonitorIndex===index)p.MonitorIndex=p.MonitorIndices[0];});this.selectFirst();}
  display(index:number){if(!this.profile().MonitorIndices.includes(index)){this.notify('This display is not linked. Use Include display to add it.');return;}this.edit(p=>p.MonitorIndex=index);this.selectFirst();}
  includeDisplay(index:number){const info=this.displays().find(d=>d.index===index);this.edit(p=>{if(!p.MonitorIndices.includes(index))p.MonitorIndices.push(index);let board=p.MonitorBoards.find(b=>b.MonitorIndex===index);if(!board){board={MonitorIndex:index,MonitorDeviceName:info?.name,WidgetScale:1,Zones:preset('columns',1)};p.MonitorBoards.push(board);}else board.MonitorDeviceName=info?.name;p.MonitorIndex=index;});this.selectFirst();}
  create(){this.nameInput='';this.modal.set('create');}
  async createCommit(){if(!this.nameInput.trim())return;if(this.dirty()){await this.save();if(this.dirty())return;}const next=newProfile(this.nameInput,this.profile().MonitorIndex);try{await this.bridge.call('switch-profile',{profile:next});}catch(e){this.error.set((e as Error).message);return;}this.profile.set(next);this.key='';this.saved='';this.history.clear();this.selectFirst();this.modal.set('');this.route.set('Studio');}
  rename(){this.nameInput=this.profile().Name;this.modal.set('rename');}
  renameCommit(){if(!this.nameInput.trim())return;this.edit(p=>p.Name=this.nameInput.trim());this.modal.set('');}
  private stampDisplays(profile:Profile){for(const board of profile.MonitorBoards){const display=this.displays().find(d=>d.index===board.MonitorIndex);if(display)board.MonitorDeviceName=display.name;}}
  async save(){this.busy.set(true);const snapshot=structuredClone(this.profile());this.stampDisplays(snapshot);this.profile.set(snapshot);const key=await this.execute<string>('save',{key:this.key,profile:snapshot});if(key){this.key=key;this.saved=JSON.stringify(snapshot);await this.reloadProfiles();this.notify('Workspace saved');}this.busy.set(false);}
  async reloadProfiles(){const data=await this.execute('bootstrap');if(data)this.profiles.set(data.profiles);}
  switchKey='';
  switchProfile(key:string){if(key===this.key)return;if(this.dirty()){this.switchKey=key;this.modal.set('unsaved');return;}void this.loadProfile(key);}
  async loadProfile(key:string){const chosen=this.profiles().find(p=>p.key===key);if(!chosen?.profile)return;await this.execute('switch-profile',{profile:chosen.profile});this.key=key;this.profile.set(structuredClone(chosen.profile));this.saved=JSON.stringify(this.profile());this.history.clear();this.selectFirst();this.modal.set('');}
  async saveAndSwitch(){await this.save();if(!this.dirty())await this.loadProfile(this.switchKey);}
  async deleteProfile(){if(!this.key){this.create();return;}await this.execute('delete',{key:this.key});await this.reloadProfiles();const remaining=this.profiles().find(p=>p.profile);if(remaining)await this.loadProfile(remaining.key);else{this.profile.set(newProfile('My workspace'));this.key='';this.saved='';this.selectFirst();}this.modal.set('');}
  undo(){this.profile.set(this.history.undo(this.profile()));this.selectFirst();void this.execute('profile',{profile:this.profile(),restoreApplications:true});}
  redo(){this.profile.set(this.history.redo(this.profile()));this.selectFirst();void this.execute('profile',{profile:this.profile(),restoreApplications:true});}
  showPreset(kind:string){this.presetKind=kind;this.preview.set(preset(kind,Number(this.presetCount),this.board().Zones));}
  commitPreset(){const candidate=this.preview();if(!candidate)return;this.editBoard(b=>b.Zones=candidate);this.preview.set(null);this.selectFirst();}
  split(vertical:boolean,ratio=.5){this.editBoard(b=>b.Zones=splitTile(b.Zones,this.selected(),vertical,ratio));}
  remove(){const id=this.selected();this.editBoard(b=>b.Zones=removeTile(b.Zones,id));void this.execute('release',{id});this.selectFirst();}
  flip(kind:'flip-x'|'flip-y'|'rotate'){this.editBoard(b=>b.Zones=transform(b.Zones,kind));}
  async refreshApps(){const windows=await this.execute<AppWindow[]>('windows');if(windows)this.apps.set(windows);}
  async appPicker(){if(this.tile()?.ContentKind!=='Application'){this.notify('Select an application tile to assign a window.');return;}await this.refreshApps();this.modal.set('apps');}
  async assign(window:AppWindow){const tile=this.tile();if(!tile||tile.ContentKind!=='Application')return;const next=structuredClone(this.profile());const target=next.MonitorBoards.find(b=>b.MonitorIndex===next.MonitorIndex)!.Zones.find(t=>t.Id===tile.Id)!;target.AssignedProcessName=window.process;target.AssignedWindowTitle=window.title;
    try{const assigned=await this.bridge.call<Profile>('assign',{id:tile.Id,handle:window.handle,profile:next});this.history.commit(this.profile());this.profile.set(assigned);this.modal.set('');this.notify('Application assigned');}catch(e){this.error.set((e as Error).message);}}
  assignByHandle(handle:string){const app=this.apps().find(a=>a.handle===handle);if(app)void this.assign(app);}
  detach(id:string){this.profile.update(p=>{const next=structuredClone(p);for(const board of next.MonitorBoards){const tile=board.Zones.find(t=>t.Id===id);if(tile){tile.AssignedProcessName='';tile.AssignedWindowTitle='';}}return next;});this.notify('Application detached. Tile geometry is unchanged.');}
  release(){const id=this.selected();void this.execute('release',{id});this.detach(id);}
  addWidget(id:string){const free=vacantTile(this.board().Zones);if(free){free.ContentKind='Widget';free.WidgetId=id;this.editBoard(b=>b.Zones.push(free));this.selected.set(free.Id);this.route.set('Studio');this.modal.set('');return;}const selected=this.tile();if(selected?.ContentKind==='Application'&&!selected.AssignedProcessName){this.editBoard(b=>{const t=b.Zones.find(t=>t.Id===this.selected())!;t.ContentKind='Widget';t.WidgetId=id;});}else{let added='';this.editBoard(b=>{b.Zones=splitTile(b.Zones,this.selected(),selected?selected.Width>=selected.Height:true);const t=b.Zones[b.Zones.findIndex(t=>t.Id===this.selected())+1];t.ContentKind='Widget';t.WidgetId=id;added=t.Id;});if(added)this.selected.set(added);}this.route.set('Studio');this.modal.set('');}
  addBrowser(){const name=this.sharedName.trim();if(name&&this.profile().MonitorBoards.some(b=>b.Zones.some(t=>t.ContentKind==='Web'&&t.SharedWebName.toLowerCase()===name.toLowerCase()))){this.error.set('This browser is already linked to a tile in this profile. Choose a different name.');return;}if(this.tile()?.ContentKind!=='Application'||this.tile()?.AssignedProcessName){this.notify('Choose an empty application tile first.');return;}this.editBoard(b=>{const t=b.Zones.find(t=>t.Id===this.selected())!;t.ContentKind='Web';t.SharedWebName=name;t.Web.Tabs=[{Id:crypto.randomUUID(),Title:name,Url:this.sharedUrl}];});}
  setTileFullscreen(value:boolean){this.editBoard(b=>{const tile=b.Zones.find(t=>t.Id===this.selected());if(tile)tile.ConstrainFullscreenToTile=value;});}
  clearTile(){const id=this.selected();void this.execute('release',{id});this.editBoard(b=>{const tile=b.Zones.find(t=>t.Id===id);if(!tile)return;tile.ContentKind='Application';tile.WidgetId='';tile.WidgetArg='';tile.AssignedProcessName='';tile.AssignedWindowTitle='';tile.SharedWebName='';tile.ConstrainFullscreenToTile=false;tile.Web={Tabs:[],SelectedTabId:'',ToolbarPinned:true};});}
  tiles(){return this.preview()??this.board().Zones;}
  monitor(){return this.displays().find(d=>d.index===this.board().MonitorIndex);}
  monitorSize(){const d=this.monitor();return {width:d?.width??1920,height:d?.height??1080};}
  boardStyle(){const {width,height}=this.monitorSize();return {'aspect-ratio':width+' / '+height,'max-width':'calc(var(--board-cap) * '+(width/height)+')'};}
  tileStyle(tile:Tile){const {width,height}=this.monitorSize();const b=tilePercentBounds(tile,this.tiles(),width,height,this.profile().OuterMargin,this.profile().Gap);return {left:b.left+'%',top:b.top+'%',width:b.width+'%',height:b.height+'%'};}
  resizeHandles:ResizeHandle[]=['n','s','e','w','nw','ne','sw','se'];
  private tileDrag:{id:string;handle:ResizeHandle|null;x:number;y:number;originX:number;originY:number;width:number;height:number;before:Profile;pointerId:number}|null=null;
  startTile(event:PointerEvent,id:string,handle:ResizeHandle|null=null){
    if(event.button!==0||this.preview())return;
    const canvas=(event.currentTarget as HTMLElement).closest('.board')!.getBoundingClientRect();
    const {width,height}=this.monitorSize(),margin=this.profile().OuterMargin;
    const target=event.target as HTMLElement;if(!handle&&target.closest('button,input,select,textarea,a'))return;
    const usableWidth=canvas.width*(1-2*margin/width),usableHeight=canvas.height*(1-2*margin/height);
    this.selected.set(id);this.tileDrag={id,handle,x:event.clientX,y:event.clientY,originX:canvas.left+(canvas.width-usableWidth)/2,originY:canvas.top+(canvas.height-usableHeight)/2,width:usableWidth,height:usableHeight,before:structuredClone(this.profile()),pointerId:event.pointerId};
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);event.preventDefault();event.stopPropagation();
  }
  moveFreeTile(event:PointerEvent){
    const d=this.tileDrag;if(!d||d.pointerId!==event.pointerId)return;
    const next=structuredClone(d.handle?d.before:this.profile()),b=next.MonitorBoards.find(b=>b.MonitorIndex===next.MonitorIndex)!;
    const dx=(event.clientX-d.x)/d.width,dy=(event.clientY-d.y)/d.height,snap=next.SmartSnap&&!event.altKey?next.SnapStep:0;
    const original=d.before.MonitorBoards.find(b=>b.MonitorIndex===next.MonitorIndex)!.Zones.find(t=>t.Id===d.id)!,current=b.Zones.find(t=>t.Id===d.id)!;
    b.Zones=d.handle?resizeTile(b.Zones,d.id,d.handle,dx,dy,snap):moveTile(b.Zones,d.id,original.X+dx-current.X,original.Y+dy-current.Y,snap);this.profile.set(next);
    if(!d.handle&&Math.hypot(event.clientX-d.x,event.clientY-d.y)>8){const source=d.before.MonitorBoards.find(board=>board.MonitorIndex===d.before.MonitorIndex)!;const px=Math.max(0,Math.min(1,(event.clientX-d.originX)/d.width)),py=Math.max(0,Math.min(1,(event.clientY-d.originY)/d.height));this.dropPreview.set(dropTile(source.Zones,d.id,px,py));}else this.dropPreview.set(null);
  }
  tileKey(event:KeyboardEvent,id:string,handle:ResizeHandle|null=null){
    if((event.target!==event.currentTarget&&!handle)||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)||this.preview())return;
    event.preventDefault();event.stopPropagation();const step=this.profile().SmartSnap&&!event.altKey?this.profile().SnapStep:.001;
    const dx=event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0,dy=event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0;
    this.editBoard(b=>b.Zones=handle?resizeTile(b.Zones,id,handle,dx,dy):moveTile(b.Zones,id,dx,dy));
  }
  addTile(){const tile=vacantTile(this.board().Zones);if(!tile){this.notify('Make some space by resizing or removing a tile first.');return;}this.editBoard(b=>b.Zones.push(tile));this.selected.set(tile.Id);}
  dropPreviewTile(){return this.dropPreview()?.tiles.find(t=>t.Id===this.tileDrag?.id);}
  dropPreviewStyle(){const tile=this.dropPreviewTile(),candidate=this.dropPreview();if(!tile||!candidate)return {};const {width,height}=this.monitorSize();const bounds=tilePercentBounds(tile,candidate.tiles,width,height,this.profile().OuterMargin,this.profile().Gap);return {left:bounds.left+'%',top:bounds.top+'%',width:bounds.width+'%',height:bounds.height+'%'};}
  @HostListener('window:pointercancel') cancelMove(){if(this.tileDrag){this.profile.set(this.tileDrag.before);this.tileDrag=null;}this.dropPreview.set(null);}

  @HostListener('window:pointermove',['$event']) move(event:PointerEvent){if(this.tileDrag)this.moveFreeTile(event);}
  @HostListener('window:pointerup',['$event']) endMove(event:PointerEvent){if(!this.tileDrag||this.tileDrag.pointerId!==event.pointerId)return;const before=this.tileDrag.before,candidate=this.dropPreview();if(candidate&&!this.tileDrag.handle)this.profile.update(p=>{const next=structuredClone(p);next.MonitorBoards.find(b=>b.MonitorIndex===next.MonitorIndex)!.Zones=candidate.tiles;return next;});this.tileDrag=null;this.dropPreview.set(null);if(JSON.stringify(before)!==JSON.stringify(this.profile())){this.history.commit(before);void this.execute('profile',{profile:this.profile()});}}
  @HostListener('window:keydown',['$event']) keyboard(event:KeyboardEvent){const input=event.target instanceof HTMLInputElement||event.target instanceof HTMLTextAreaElement||event.target instanceof HTMLSelectElement;if(event.key==='Escape'){this.cancelMove();this.preview.set(null);this.closeModal();}if(input)return;if(event.ctrlKey&&event.key.toLowerCase()==='z'){event.preventDefault();event.shiftKey?this.redo():this.undo();}if(event.ctrlKey&&event.key.toLowerCase()==='s'){event.preventDefault();void this.save();}}
  async launch(){this.busy.set(true);const snapshot=structuredClone(this.profile());this.stampDisplays(snapshot);this.profile.set(snapshot);const key=await this.execute<string>('launch',{key:this.key,profile:snapshot});if(key){this.key=key;this.saved=JSON.stringify(snapshot);this.notify('Workspace launched');await this.reloadProfiles();}this.busy.set(false);}
  appearanceChange(key:keyof Appearance,value:any){const next=normalizeAppearance({...this.appearance(),[key]:value});this.appearance.set(next);applyAppearance(next);void this.execute('preferences',next);}
  colors(seed:string,dark:boolean){const roles=colorRoles(seed,dark);return {background:roles['surface-container'],color:roles['on-surface'],'--swatch':roles['primary'],'--swatch-container':roles['primary-container'],'--swatch-on':roles['on-primary'],'--preview-card':roles['surface-container-lowest']};}
  wallpaper(id:string){this.edit(p=>p.WallpaperId=id);}
  editAnimated(value:boolean){this.edit(p=>p.AnimatedWallpaper=value);}
  wallpaperBackground(id:string){return id==='ambient'?'':`url("https://assets.setpiece.local/Wallpapers/${id}.png")`;}
  pretty(name:string){return name.split('-').map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' ');}
  filteredWidgets(){return widgets.filter(w=>(this.filter()==='All'||w.category===this.filter())&&(w.name+' '+w.description).toLowerCase().includes(this.search.toLowerCase()));}
  widgetCount(id:string){return this.board().Zones.filter(t=>t.ContentKind==='Widget'&&t.WidgetId===id).length;}
  inspectWidget='clock';inspect(id:string){this.inspectWidget=id;this.modal.set('widget');}
  manageWidget(id:string){if(this.widgetId){void this.execute('manage-widget',{id});return;}if(['twitter','market','focus','github'].includes(id)){this.route.set('Widgets');this.modal.set('');return;}this.connect(id);}
  widgetScale(){return this.profile().MonitorBoards.find(b=>b.MonitorIndex===Number(this.query.get('display')))?.WidgetScale??1;}
  playGame(){if(this.widgetId)void this.execute('open-game');else this.modal.set('game');}
  expandWidget(id:string){if(this.widgetId)void this.execute('inspect-widget',{id});else this.inspect(id);}
  async disconnect(){await this.execute('disconnect',{service:this.form['service']});const data=await this.execute('bootstrap');if(data)this.connections=data.connections;this.connectionResult.set('Disconnected. Your other connections are preserved.');}
  connect(service:string){if(service==='google-calendar')service='calendar';const zones=structuredClone(this.connections['ClockTimeZones']??['Europe/Oslo','America/New_York']);const savedLabels=structuredClone(this.connections['ClockLocationLabels']??[]);this.form={service,zones,zoneLabels:zones.map((z:string,i:number)=>savedLabels[i]??this.zoneFallback(z)),zoneQuery:'',discordMode:this.connections['DiscordCallConnected']?'call':'server',location:this.connections['WeatherLocation']??'',serverId:this.connections['DiscordServerId']??'',clientId:this.connections[service==='google'?'GoogleClientId':service==='reddit'?'RedditClientId':service==='discord'?'DiscordClientId':'SpotifyClientId']??'',exclusions:(this.connections['CalendarExcludedTitles']??[]).join('\n'),community:this.connections['RedditCommunity']??'technology',host:this.connections['BambuHost']??'',serial:this.connections['BambuSerial']??'',provider:this.connections['InboxProvider']??'google',executable:this.connections['CodexExecutable']??'',categoriesText:(this.connections['NewsCategories']??[]).join(', ')};this.connectionResult.set('');this.stopResults=[];this.timezoneResults=[];this.modal.set('connect');}
  zoneFallback(zone:string){return zone.split('/').pop()?.replaceAll('_',' ')??zone;}
  async searchTimezones(){const results=await this.execute<{name:string;timezone:string;label:string}[]>('timezone-search',{query:this.form['zoneQuery']});if(results)this.timezoneResults=results;}
  chooseTimezone(place:{name:string;timezone:string}){if(this.form['zones'].length>=4)return;this.form['zones'].push(place.timezone);this.form['zoneLabels'].push(place.name);this.form['zoneQuery']='';this.timezoneResults=[];}
  removeClockZone(index:number){this.form['zones'].splice(index,1);this.form['zoneLabels'].splice(index,1);}
  async searchStops(){const results=await this.execute('stop-search',{query:this.form['query']});if(results)this.stopResults=results;}
  async connectCommit(){this.form['categories']=(this.form['categoriesText']??'').split(',').map((s:string)=>s.trim()).filter(Boolean);this.connecting.set(true);try{const result=await this.bridge.call('connect',this.form);this.connectionResult.set(result.title+' · '+result.detail);const data=await this.bridge.call('bootstrap');this.connections=data.connections;}catch(e){this.connectionResult.set((e as Error).message);}finally{this.connecting.set(false);}}
  receiveBrowser(data:any){this.browserState=data;this.browserTabs=data.tabs??[];this.browserUrl=data.url??this.browserUrl;this.browserPinned=data.pinned??true;this.changeDetector.markForCheck();}
  async browserAction(action:string,payload:any={}){const data=await this.execute('browser',{action,...payload});if(data)this.receiveBrowser(data);}
  normalizeBookmarks(items:any[]){return items.map(item=>{let host=item.host??'';try{host||=new URL(item.url).hostname;}catch{}const title=String(item.title??'').trim();const normalized=title.toLowerCase().replace(/^https?:\/\//,'').replace(/\/$/,'');const domain=host.toLowerCase();const isAddress=/^(https?:\/\/|www\.)/i.test(title)||normalized===domain||normalized===domain.replace(/^www\./,'');return {...item,host,displayTitle:isAddress?'':title};});}
  async loadBraveBookmarks(){try{const data=await this.bridge.call<any>('brave-bookmarks-read');this.browserBookmarks=this.normalizeBookmarks(data.items??[]);}catch{}this.changeDetector.markForCheck();}
  async importBraveBookmarks(){this.busy.set(true);try{const data=await this.bridge.call<any>('brave-bookmarks');this.browserBookmarks=this.normalizeBookmarks(data.items??[]);this.notify(`${data.count} Brave bookmarks imported`);}catch(e){this.error.set((e as Error).message);}finally{this.busy.set(false);this.changeDetector.markForCheck();}}
  async openShared(name=this.sharedName,url=this.sharedUrl){if(!name.trim()){this.error.set('Give this browser a name first.');return;}this.sharedName=name;this.sharedUrl=url||'https://www.google.com/';await this.execute('browser-open',{name:this.sharedName,url:this.sharedUrl});this.sharedBrowsers=await this.execute<any[]>('browser-list')??this.sharedBrowsers;}
  chooseBrowser(browser:{name:string;url:string}){this.sharedName=browser.name;this.sharedUrl=browser.url||'https://www.google.com/';}
  newSharedBrowser(){this.sharedName='';this.sharedUrl='https://www.google.com/';}
  prepareCapture(){if(!this.query.has('capture'))return;const prefs={...this.appearance(),mode:this.query.get('mode')==='light'||this.query.get('theme')==='luna'?'light' as const:'dark' as const,reducedMotion:true};this.appearance.set(prefs);applyAppearance(prefs);const route=this.query.get('route');if(route)this.route.set(route);if(route==='Apps')void this.refreshApps();const guide=this.query.get('guide');if(guide)this.connect(guide);document.body.dataset['captureReady']='true';}
  async browserDiagnostics(open:boolean){await this.browserAction('diagnostics',{open});this.modal.set(open?'browser-diagnostics':'');}
  closeModal(){if(this.modal()==='browser-diagnostics')void this.browserDiagnostics(false);else this.modal.set('');}
  wallpaperViewport:Record<string,string>={};
  requestClose(){if(this.dirty())this.modal.set('close-unsaved');else void this.execute('window',{action:'close-confirmed'});}
  async saveAndClose(){await this.save();if(!this.dirty())void this.execute('window',{action:'close-confirmed'});}
  windowAction(action:string){void this.execute('window',{action});}
}
bootstrapApplication(App).catch(error=>{document.body.textContent='Setpiece could not initialize: '+error.message;});

