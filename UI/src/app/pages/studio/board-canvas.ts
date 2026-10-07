import {AfterViewInit,ChangeDetectionStrategy,Component,ElementRef,HostListener,OnDestroy,computed,inject,signal,viewChild} from '@angular/core';
import {NgStyle} from '@angular/common';
import {MatButtonModule} from '@angular/material/button';
import {MatMenuModule} from '@angular/material/menu';
import {Profile,ResizeHandle,Tile,TileDrop,dropTile,moveTile,resizeTile,tilePercentBounds,widgetDefinition} from '../../../domain';
import {StudioStore} from '../../state/studio-store';
import {IconComponent} from '../../ui/icon';
import {WallpaperComponent} from '../../ui/wallpaper';
import {WidgetFrame} from '../../widgets/widget-frame';
import {FrostComponent} from '../../surfaces/surfaces';

interface Drag {id:string;handle:ResizeHandle|null;x:number;y:number;originX:number;originY:number;width:number;height:number;before:Profile;source:Tile[];pointerId:number;moved:boolean;}
/** Where a moved tile will land: a swap, a shrink into a gap, or a plain move. */
type Landing=(TileDrop|{tiles:Tile[];kind:'move'});

/**
 * The live board: a true miniature of the display. Tiles and widgets lay out at the display's own size
 * (its resolution over its Windows scale) and the whole board is scaled down, so every widget looks exactly
 * as it will on the desk. Handles and outlines sit on an unscaled layer above, so they stay easy to grab.
 *
 * Dragging never touches the saved profile until you let go: the tile follows the pointer, the landing is
 * previewed, and the change is applied once, on release. Resizing redraws at most once per frame.
 *
 * Glass cards frost a still, pre-blurred copy of the wallpaper, as on the desk (sp-frost): a live backdrop blur
 * was redone on every frame anything in a card moved.
 */
@Component({
  selector:'sp-board-canvas',
  changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[NgStyle,MatButtonModule,MatMenuModule,IconComponent,WallpaperComponent,WidgetFrame,FrostComponent],
  templateUrl:'./board-canvas.html',
  styleUrl:'./board-canvas.scss'
})
export class BoardCanvas implements AfterViewInit,OnDestroy {
  readonly store=inject(StudioStore);
  readonly handles:ResizeHandle[]=['n','s','e','w','nw','ne','sw','se'];
  private readonly board=viewChild.required<ElementRef<HTMLElement>>('board');
  /** The board's width on screen, in CSS pixels. */
  private readonly shown=signal(0);
  /** Tiles while a resize is in progress; the saved profile changes only on release. */
  readonly live=signal<Tile[]|null>(null);
  /** The dragged tile's offset from its place, in board pixels, while it follows the pointer. */
  readonly offset=signal<{x:number;y:number}|null>(null);
  readonly landing=signal<Landing|null>(null);
  readonly dragging=signal('');
  private drag:Drag|null=null;
  private frame=0;
  private pending:PointerEvent|null=null;
  private observer?:ResizeObserver;

  readonly zones=computed(()=>this.live()??this.store.tiles());
  readonly boardStyle=computed(()=>{const {width,height}=this.store.monitorSize();return {'aspect-ratio':width+' / '+height,'--ratio':String(width/height)};});
  /** The desk's own size and how far it is scaled down to fit the panel. */
  readonly surface=computed(()=>{const desk=this.store.deskSize(),scale=this.shown()>0?this.shown()/desk.width:.4;return {width:desk.width,height:desk.height,scale};});
  readonly surfaceStyle=computed(()=>{const s=this.surface();return {width:s.width+'px',height:s.height+'px',transform:'scale('+s.scale+')','--k':String(s.scale)};});
  readonly selectedTile=computed(()=>this.zones().find(t=>t.Id===this.store.selected())??null);
  readonly landingTile=computed(()=>{const l=this.landing();return l?l.tiles.find(t=>t.Id===this.dragging())??null:null;});
  readonly glass=computed(()=>this.store.appearance().surface==='glass');
  /** The board shows the display scaled down, so its frosted copies need no more pixels than it draws. */
  readonly frostDetail=computed(()=>Math.min(.5,Math.ceil(this.surface().scale*devicePixelRatio*20)/20));

  ngAfterViewInit(){
    const el=this.board().nativeElement;
    this.observer=new ResizeObserver(()=>this.shown.set(el.clientWidth));this.observer.observe(el);this.shown.set(el.clientWidth);
  }
  ngOnDestroy(){this.observer?.disconnect();cancelAnimationFrame(this.frame);}

  percent(tile:Tile,tiles=this.zones()){const {width,height}=this.store.monitorSize(),p=this.store.profile();return tilePercentBounds(tile,tiles,width,height,p.OuterMargin,p.Gap);}
  bounds(tile:Tile,tiles=this.zones()){const b=this.percent(tile,tiles);return {left:b.left+'%',top:b.top+'%',width:b.width+'%',height:b.height+'%'};}
  /** The dragged tile follows the pointer; in the scaled layer its offset is divided by the scale. */
  shift(tile:Tile,scaled=true){
    const o=this.offset();if(!o||tile.Id!==this.dragging())return null;
    const k=scaled?this.surface().scale:1;return 'translate('+o.x/k+'px,'+o.y/k+'px)';
  }
  label(tile:Tile,index:number){return tile.ContentKind==='Widget'?widgetDefinition(tile.WidgetId).name:tile.ContentKind==='Web'?(tile.SharedWebName||'Browser'):(tile.AssignedProcessName||'Tile '+(index+1));}
  landingLabel(){const kind=this.landing()?.kind;return kind==='fit'?'Drop to fit':kind==='swap'?'Swap tiles':'Move here';}

  start(event:PointerEvent,id:string,handle:ResizeHandle|null=null){
    if(event.button!==0||this.store.preview())return;
    const target=event.target as HTMLElement;
    if(!handle&&target.closest('button,input,select,textarea,a,[role=menu]'))return;
    const canvas=this.board().nativeElement.getBoundingClientRect();
    const {width,height}=this.store.monitorSize(),margin=this.store.profile().OuterMargin;
    const usableWidth=canvas.width*(1-2*margin/width),usableHeight=canvas.height*(1-2*margin/height);
    this.store.selected.set(id);
    const before=structuredClone(this.store.profile());
    this.drag={id,handle,x:event.clientX,y:event.clientY,originX:canvas.left+(canvas.width-usableWidth)/2,originY:canvas.top+(canvas.height-usableHeight)/2,width:usableWidth,height:usableHeight,before,source:structuredClone(this.store.tiles()),pointerId:event.pointerId,moved:false};
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    event.preventDefault();event.stopPropagation();
  }

  // Pointer moves arrive faster than the display draws; only the latest one per frame is worked out.
  @HostListener('window:pointermove',['$event'])
  move(event:PointerEvent){
    const d=this.drag;if(!d||d.pointerId!==event.pointerId)return;
    this.pending=event;if(!this.frame)this.frame=requestAnimationFrame(()=>{this.frame=0;if(this.pending)this.apply(this.pending);});
  }
  private apply(event:PointerEvent){
    const d=this.drag;if(!d)return;
    const p=this.store.profile(),snap=p.SmartSnap&&!event.altKey?p.SnapStep:0;
    const dx=(event.clientX-d.x)/d.width,dy=(event.clientY-d.y)/d.height;
    if(d.handle){this.live.set(resizeTile(d.source,d.id,d.handle,dx,dy,snap));return;}
    if(!d.moved&&Math.hypot(event.clientX-d.x,event.clientY-d.y)<6)return;
    d.moved=true;this.dragging.set(d.id);
    this.offset.set({x:event.clientX-d.x,y:event.clientY-d.y});
    // Over another tile: swap; over a gap too small for it: fit; otherwise move as far as the neighbours allow.
    const px=Math.max(0,Math.min(1,(event.clientX-d.originX)/d.width)),py=Math.max(0,Math.min(1,(event.clientY-d.originY)/d.height));
    const drop=dropTile(d.source,d.id,px,py);
    if(drop){this.landing.set(drop);return;}
    const moved=moveTile(d.source,d.id,dx,dy,snap),was=d.source.find(t=>t.Id===d.id)!,now=moved.find(t=>t.Id===d.id)!;
    this.landing.set(Math.abs(now.X-was.X)+Math.abs(now.Y-was.Y)>1e-4?{tiles:moved,kind:'move'}:null);
  }

  @HostListener('window:pointerup',['$event'])
  end(event:PointerEvent){
    const d=this.drag;if(!d||d.pointerId!==event.pointerId)return;
    cancelAnimationFrame(this.frame);this.frame=0;if(this.pending){this.apply(this.pending);this.pending=null;}
    const result=d.handle?this.live():this.landing()?.tiles??null;
    this.reset();
    if(!result||JSON.stringify(result)===JSON.stringify(d.source))return;
    const next=structuredClone(this.store.profile());next.MonitorBoards.find(b=>b.MonitorIndex===next.MonitorIndex)!.Zones=result;
    this.store.commit(d.before);this.store.profile.set(next);void this.store.execute('profile',{profile:next});
  }

  @HostListener('window:pointercancel')
  @HostListener('window:keydown.escape')
  cancel(){this.reset();}
  private reset(){cancelAnimationFrame(this.frame);this.frame=0;this.pending=null;this.drag=null;this.live.set(null);this.offset.set(null);this.landing.set(null);this.dragging.set('');}

  key(event:KeyboardEvent,id:string,handle:ResizeHandle|null=null){
    if((event.target!==event.currentTarget&&!handle)||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)||this.store.preview())return;
    event.preventDefault();event.stopPropagation();
    const p=this.store.profile(),step=p.SmartSnap&&!event.altKey?p.SnapStep:.001;
    const dx=event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0,dy=event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0;
    this.store.editBoard(b=>b.Zones=handle?resizeTile(b.Zones,id,handle,dx,dy):moveTile(b.Zones,id,dx,dy));
  }
}
