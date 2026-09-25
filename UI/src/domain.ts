export type TileKind = 'Application' | 'Widget' | 'Web';
export interface Tile {
  Id: string; Name: string; X: number; Y: number; Width: number; Height: number;
  ContentKind: TileKind; WidgetId: string; WidgetArg: string;
  AssignedProcessName: string; AssignedWindowTitle: string;
  SharedWebName: string; ConstrainFullscreenToTile: boolean;
  Web: { Tabs: {Id:string;Url:string;Title:string}[]; SelectedTabId:string; ToolbarPinned:boolean };
  [key: string]: unknown;
}
export interface Board { MonitorIndex: number; MonitorDeviceName?:string; WidgetScale: number; Zones: Tile[]; [key:string]:unknown; }
export interface Profile {
  Name: string; SchemaVersion:number; Gap:number; OuterMargin:number; MonitorIndex:number;
  MonitorIndices:number[]; MonitorBoards:Board[]; WallpaperId:string; AnimatedWallpaper:boolean;
  SmartSnap:boolean; SnapStep:number; [key:string]:unknown;
}
export interface Display { index:number; name:string; width:number; height:number; x:number; y:number; primary:boolean; }
export function fittingGap(gap:number,margin:number,tiles:Tile[],width:number,height:number):number {
  return Math.min(gap,...tiles.map(t=>Math.max(0,Math.min(t.Width*(width-2*margin),t.Height*(height-2*margin))-1)));
}
export interface AppWindow { handle:string; title:string; process:string; }
export interface ServiceState { status:'loading'|'ready'|'empty'|'disconnected'|'error'|'offline'; title:string; detail:string; updated?:string; data?:Record<string,unknown>; items?:{title:string;detail:string;url?:string}[]; }
export interface WidgetDefinition { id:string; name:string; icon:string; category:string; description:string; preview?:boolean; retired?:boolean; }
// Icons are Material Symbols ligature names.
export const widgets:WidgetDefinition[] = [
  {id:'clock',name:'Clock',icon:'schedule',category:'Daily',description:'Your time, around the world.'},
  {id:'system',name:'System',icon:'monitoring',category:'Device',description:'A clear view of your machine.'},
  {id:'google-calendar',name:'Calendar',icon:'calendar_month',category:'Daily',description:'Make room for what comes next.'},
  {id:'discord',name:'Discord',icon:'forum',category:'Connected',description:'Your community, at a glance.'},
  {id:'spotify',name:'Spotify',icon:'music_note',category:'Connected',description:'A little space for your soundtrack.'},
  {id:'codex',name:'AI Usage',icon:'data_usage',category:'Device',description:'Claude and Codex quotas, and OpenCode activity.'},
  {id:'weather',name:'Weather',icon:'partly_cloudy_day',category:'Daily',description:'A window onto the day outside.'},
  {id:'bambu-lab',name:'Bambu Lab',icon:'deployed_code',category:'Device',description:'Follow your next print on the A1 Mini.'},
  {id:'ruter',name:'Ruter',icon:'directions_bus',category:'Daily',description:'Your stop. Your next departure.'},
  {id:'news',name:'VG News',icon:'newspaper',category:'Connected',description:'A considered look at the headlines.'},
  {id:'notes',name:'Notes',icon:'edit_note',category:'Daily',description:'Keep a thought within reach.'},
  {id:'email',name:'Inbox',icon:'mail',category:'Connected',description:'Know what needs your attention.'},
  {id:'battery',name:'Battery',icon:'battery_full',category:'Device',description:'Power for the work ahead.'},
  {id:'volume',name:'Volume',icon:'volume_up',category:'Device',description:'Find the right level.'},
  {id:'reddit',name:'Reddit',icon:'dynamic_feed',category:'Connected',description:'Conversations worth a moment.'},
  {id:'idle-game',name:'Scrapbots',icon:'smart_toy',category:'Play',description:'Explore. Battle. Bring your salvage home.'},
  {id:'market',name:'Markets',icon:'show_chart',category:'Preview',description:'A watchlist concept.',preview:true},
  {id:'focus',name:'Focus',icon:'timer',category:'Preview',description:'A space to concentrate.',preview:true},
  {id:'github',name:'GitHub',icon:'commit',category:'Preview',description:'Your contributions, in view.',preview:true},
  {id:'twitter',name:'X / Twitter',icon:'block',category:'Retired',description:'This integration has been retired.',retired:true}
];
export function widgetDefinition(id:string):WidgetDefinition{return widgets.find(w=>w.id===id)??{id,name:'Unknown widget',icon:'widgets',category:'Retired',description:'This widget is no longer available.',retired:true};}
/** Layout presets offered by the Layouts menu. Each is built by preset() below. */
export const presetKinds=[
  {kind:'columns',name:'Columns',icon:'view_column'},
  {kind:'rows',name:'Rows',icon:'table_rows'},
  {kind:'balanced',name:'Grid',icon:'grid_view'},
  {kind:'main-half',name:'Main and side',icon:'vertical_split'},
  {kind:'main-two',name:'Wide main',icon:'splitscreen_left'},
  {kind:'main-third',name:'Narrow main',icon:'splitscreen_right'}
] as const;
export const wallpaperNames = ['ambient','fjord-glass','paper-horizon','moss-geometry','blue-hour','ember-grid','slate-dunes','orchard-mist','violet-current','quiet-coast','mono-bloom'];
export function newTile(x=0,y=0,w=1,h=1):Tile {
  return {Id:crypto.randomUUID(),Name:'Untitled tile',X:x,Y:y,Width:w,Height:h,ContentKind:'Application',WidgetId:'',WidgetArg:'',AssignedProcessName:'',AssignedWindowTitle:'',SharedWebName:'',ConstrainFullscreenToTile:false,Web:{Tabs:[],SelectedTabId:'',ToolbarPinned:true}};
}
export function newProfile(name:string,index=0):Profile {
  return {Name:name.trim(),SchemaVersion:18,Gap:12,OuterMargin:16,MonitorIndex:index,MonitorIndices:[index],MonitorBoards:[{MonitorIndex:index,WidgetScale:1,Zones:[newTile()]}],WallpaperId:'ambient',AnimatedWallpaper:true,SmartSnap:true,SnapStep:.05};
}
const eps=1e-7;
export function assertLayout(tiles:Tile[]):void {
  if(tiles.length<1||tiles.length>20) throw new Error('A board needs between 1 and 20 tiles.');
  for(let i=0;i<tiles.length;i++) {
    const a=tiles[i];
    if(![a.X,a.Y,a.Width,a.Height].every(Number.isFinite)||a.Width<.025-eps||a.Height<.025-eps||a.X < -eps||a.Y < -eps||a.X+a.Width>1+eps||a.Y+a.Height>1+eps) throw new Error('The layout extends outside this display or contains a tile that is too small.');
    for(let j=i+1;j<tiles.length;j++) {
      const b=tiles[j];
      if(Math.min(a.X+a.Width,b.X+b.Width)-Math.max(a.X,b.X)>eps && Math.min(a.Y+a.Height,b.Y+b.Height)-Math.max(a.Y,b.Y)>eps) throw new Error('Tiles cannot overlap.');
    }
  }
}
export function splitTile(tiles:Tile[],id:string,vertical:boolean,ratio=.5):Tile[] {
  const result=structuredClone(tiles);const t=result.find(t=>t.Id===id);
  if(!t) throw new Error('Select a tile to split.');
  const next=newTile(t.X,t.Y,t.Width,t.Height);
  if(vertical) { t.Width*=ratio;next.X+=t.Width;next.Width*=1-ratio; }
  else { t.Height*=ratio;next.Y+=t.Height;next.Height*=1-ratio; }
  result.splice(result.indexOf(t)+1,0,next);assertLayout(result);return result;
}
export function removeTile(tiles:Tile[],id:string):Tile[] {
  if(tiles.length===1)throw new Error('Keep at least one tile on this display.');
  if(!tiles.some(t=>t.Id===id))throw new Error('Select a tile to remove.');
  const result=structuredClone(tiles.filter(t=>t.Id!==id));assertLayout(result);return result;
}
export type ResizeHandle='n'|'s'|'e'|'w'|'nw'|'ne'|'sw'|'se';
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
// Sweep all four rectangle edges: even a fast pointer jump cannot cross a neighbor.
function sweepTile(tiles:Tile[],id:string,target:Tile):Tile[] {
  const original=tiles.find(t=>t.Id===id);if(!original)throw new Error('Select a tile first.');
  let fraction=1;
  for(const other of tiles.filter(t=>t.Id!==id)){
    const distances=(t:Tile)=>[t.X+t.Width-other.X,other.X+other.Width-t.X,t.Y+t.Height-other.Y,other.Y+other.Height-t.Y];
    const from=distances(original),to=distances(target);let enter=0,leave=1,possible=true;
    for(let i=0;i<4;i++){
      const delta=to[i]-from[i];
      if(Math.abs(delta)<1e-12){if(from[i]<=eps){possible=false;break;}}
      else if(delta>0)enter=Math.max(enter,-from[i]/delta);
      else leave=Math.min(leave,-from[i]/delta);
    }
    if(possible&&enter<leave-1e-12&&leave>0)fraction=Math.min(fraction,Math.max(0,enter));
  }
  const result=structuredClone(tiles),tile=result.find(t=>t.Id===id)!;
  for(const key of ['X','Y','Width','Height'] as const)tile[key]=original[key]+(target[key]-original[key])*fraction;
  assertLayout(result);return result;
}
export function moveTile(tiles:Tile[],id:string,dx:number,dy:number,snap=0):Tile[]{
  const t=tiles.find(t=>t.Id===id);if(!t)throw new Error('Select a tile first.');
  const quantize=(v:number)=>snap>0?Math.round(v/snap)*snap:v;
  return sweepTile(tiles,id,{...t,X:clamp(quantize(t.X+dx),0,1-t.Width),Y:clamp(quantize(t.Y+dy),0,1-t.Height)});
}
export function resizeTile(tiles:Tile[],id:string,handle:ResizeHandle,dx:number,dy:number,snap=0):Tile[]{
  const t=tiles.find(t=>t.Id===id);if(!t)throw new Error('Select a tile first.');
  const quantize=(v:number)=>snap>0?Math.round(v/snap)*snap:v;
  let left=t.X,right=t.X+t.Width,top=t.Y,bottom=t.Y+t.Height;
  if(handle.includes('w'))left=clamp(quantize(left+dx),0,right-.025);
  if(handle.includes('e'))right=clamp(quantize(right+dx),left+.025,1);
  if(handle.includes('n'))top=clamp(quantize(top+dy),0,bottom-.025);
  if(handle.includes('s'))bottom=clamp(quantize(bottom+dy),top+.025,1);
  return sweepTile(tiles,id,{...t,X:left,Y:top,Width:right-left,Height:bottom-top});
}
export function vacantTile(tiles:Tile[]):Tile|null {
  if(tiles.length>=20)return null;
  const xs=[...new Set([0,1,...tiles.flatMap(t=>[t.X,t.X+t.Width])])].sort((a,b)=>a-b);
  let best:Tile|null=null;
  for(let i=0;i<xs.length;i++)for(let j=i+1;j<xs.length;j++){
    const left=xs[i],right=xs[j];if(right-left<.025)continue;
    const blockers=tiles.filter(t=>t.X<right-eps&&t.X+t.Width>left+eps).sort((a,b)=>a.Y-b.Y);
    let top=0;
    for(const bottom of [...blockers,{Y:1,Height:0}]){
      const height=bottom.Y-top;
      if(height>=.025&&(!best||(right-left)*height>best.Width*best.Height))best=newTile(left,top,right-left,height);
      top=Math.max(top,bottom.Y+bottom.Height);
    }
  }
  return best?{...best,Width:Math.min(.3,best.Width),Height:Math.min(.35,best.Height)}:null;
}

/** The largest empty rectangle under a pointer, ignoring the tile being moved. */
export function vacantRegionAt(tiles:Tile[],movingId:string,x:number,y:number):Tile|null {
  const others=tiles.filter(t=>t.Id!==movingId);
  const xs=[...new Set([0,1,...others.flatMap(t=>[t.X,t.X+t.Width])])].sort((a,b)=>a-b);
  const ys=[...new Set([0,1,...others.flatMap(t=>[t.Y,t.Y+t.Height])])].sort((a,b)=>a-b);
  let best:Tile|null=null;
  for(let leftIndex=0;leftIndex<xs.length;leftIndex++)for(let rightIndex=leftIndex+1;rightIndex<xs.length;rightIndex++){
    const left=xs[leftIndex],right=xs[rightIndex];if(x<left-eps||x>right+eps||right-left<.025)continue;
    for(let topIndex=0;topIndex<ys.length;topIndex++)for(let bottomIndex=topIndex+1;bottomIndex<ys.length;bottomIndex++){
      const top=ys[topIndex],bottom=ys[bottomIndex];if(y<top-eps||y>bottom+eps||bottom-top<.025)continue;
      if(others.some(t=>Math.min(right,t.X+t.Width)-Math.max(left,t.X)>eps&&Math.min(bottom,t.Y+t.Height)-Math.max(top,t.Y)>eps))continue;
      if(!best||(right-left)*(bottom-top)>best.Width*best.Height)best=newTile(left,top,right-left,bottom-top);
    }
  }
  return best;
}

export type TileDrop={tiles:Tile[];kind:'fit'|'swap'};

/** Swap onto another tile, or shrink into a vacant region that cannot hold the tile as-is. */
export function dropTile(tiles:Tile[],movingId:string,x:number,y:number):TileDrop|null {
  const target=tiles.find(t=>t.Id!==movingId&&x>=t.X-eps&&x<=t.X+t.Width+eps&&y>=t.Y-eps&&y<=t.Y+t.Height+eps);
  if(target)return {tiles:swapTiles(tiles,movingId,target.Id),kind:'swap'};
  const region=vacantRegionAt(tiles,movingId,x,y);if(!region)return null;
  const result=structuredClone(tiles),moving=result.find(t=>t.Id===movingId);if(!moving)return null;
  if(region.Width>=moving.Width-eps&&region.Height>=moving.Height-eps)return null;
  moving.X=region.X;moving.Y=region.Y;moving.Width=region.Width;moving.Height=region.Height;assertLayout(result);return {tiles:result,kind:'fit'};
}
export function tilePercentBounds(tile:Tile,tiles:Tile[],width:number,height:number,margin:number,gap:number){
  margin=Math.min(margin,Math.max(0,(Math.min(width,height)-1)/2));
  gap=fittingGap(gap,margin,tiles,width,height)/2;
  const left=margin+tile.X*(width-2*margin)+(tile.X>1e-6?gap:0);
  const top=margin+tile.Y*(height-2*margin)+(tile.Y>1e-6?gap:0);
  const right=margin+(tile.X+tile.Width)*(width-2*margin)-(tile.X+tile.Width<.999999?gap:0);
  const bottom=margin+(tile.Y+tile.Height)*(height-2*margin)-(tile.Y+tile.Height<.999999?gap:0);
  return {left:left/width*100,top:top/height*100,width:(right-left)/width*100,height:(bottom-top)/height*100};
}

export function swapTiles(tiles:Tile[],a:string,b:string):Tile[] {
  const result=structuredClone(tiles);const one=result.find(t=>t.Id===a),two=result.find(t=>t.Id===b);
  if(!one||!two)return result;
  for(const k of ['X','Y','Width','Height'] as const){const n=one[k];one[k]=two[k];two[k]=n;}
  assertLayout(result);return result;
}
export function preset(kind:string,count:number,existing:Tile[]=[]):Tile[] {
  const rectangles:Tile[]=[];count=Math.min(20,Math.max(1,count));
  if(kind.startsWith('main')&&count>1){const ratio=kind.includes('third')?1/3:kind.includes('two')?2/3:.5;rectangles.push(newTile(0,0,ratio,1));for(let i=0;i<count-1;i++)rectangles.push(newTile(ratio,i/(count-1),1-ratio,1/(count-1)));}
  else {const rows=kind==='rows'?count:kind==='columns'?1:Math.max(1,Math.floor(Math.sqrt(count)));let remaining=count;for(let row=0;row<rows;row++){const columns=Math.ceil(remaining/(rows-row));for(let col=0;col<columns;col++)rectangles.push(newTile(col/columns,row/rows,1/columns,1/rows));remaining-=columns;}}
  const result=rectangles.map((r,i)=>existing[i]?{...structuredClone(existing[i]),X:r.X,Y:r.Y,Width:r.Width,Height:r.Height}:r);assertLayout(result);return result;
}
export class History<T> {
  private past:T[]=[];private future:T[]=[];
  get canUndo(){return this.past.length>0;}get canRedo(){return this.future.length>0;}
  commit(previous:T){this.past.push(structuredClone(previous));if(this.past.length>60)this.past.shift();this.future=[];}
  undo(current:T):T {if(!this.canUndo)return current;this.future.push(structuredClone(current));return this.past.pop()!;}
  redo(current:T):T {if(!this.canRedo)return current;this.past.push(structuredClone(current));return this.future.pop()!;}
  clear(){this.past=[];this.future=[];}
}

