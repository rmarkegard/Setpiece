import {ChangeDetectionStrategy,Component,ElementRef,computed,effect,inject,input,viewChild} from '@angular/core';
import {NgStyle} from '@angular/common';
import {Tile,tilePercentBounds,widgetDefinition} from '../../domain';
import {StudioStore} from '../state/studio-store';
import {IconComponent} from '../ui/icon';
import {WallpaperComponent,wallpaperUrl} from '../ui/wallpaper';
import {WidgetFrame} from '../widgets/widget-frame';

/**
 * One widget in a window of its own, over the wallpaper: the design audits render widgets this way.
 * For design review, ?review&w=&h= instead lays the card on a plain board at an exact size.
 * (On a launched desk, widgets live in the workspace page below.)
 */
@Component({
  selector:'sp-widget-window',
  changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[WallpaperComponent,WidgetFrame],
  template:`
    @if(review;as size){
      <div class="sp review"><sp-widget [id]="store.widgetId!" [style.width.px]="size.w" [style.height.px]="size.h" [canExpand]="false" [canManage]="false"/></div>
    } @else {
      <sp-wallpaper [id]="store.profile().WallpaperId"/>
      <sp-widget [id]="store.widgetId!" [scale]="scale()" (expand)="store.expandWidget(store.widgetId!)" (manage)="store.manageWidget(store.widgetId!)"/>
    }`,
  styles:`
    :host{display:block;position:relative;isolation:isolate;height:100vh;overflow:hidden}
    sp-widget{position:relative;z-index:var(--z-content);height:100%}
    .review{box-sizing:border-box;height:100vh;padding:24px;background-color:var(--desk);background-image:radial-gradient(color-mix(in oklab,var(--ink) 10%,transparent) 1px,transparent 1.3px);background-size:18px 18px}
  `
})
export class WidgetWindow {
  readonly store=inject(StudioStore);
  readonly review=this.store.query.has('review')?{w:Number(this.store.query.get('w'))||303,h:Number(this.store.query.get('h'))||251}:null;
  readonly scale=computed(()=>this.store.profile().MonitorBoards.find(b=>b.MonitorIndex===Number(this.store.query.get('display')))?.WidgetScale??1);
}

/** How often looping ambient motion on the desk moves (see WorkspaceBackdrop). */
const deskFps=30;

/**
 * The wallpaper behind one card, blurred and saturated once into a small canvas: glass that costs
 * nothing per frame. It follows the wallpaper's cover fit and the middle of its drift, so it lines
 * up with the live wallpaper around the card. The ambient wallpaper is already soft and is shown as is.
 */
@Component({
  selector:'sp-frost',
  changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[NgStyle,WallpaperComponent],
  template:`@if(wallpaper()==='ambient'){<sp-wallpaper id="ambient" [ngStyle]="slice()"/>}@else{<canvas #canvas></canvas>}<i class="veil"></i>`,
  styles:`
    :host{position:absolute;inset:0;overflow:hidden;border-radius:calc(28px * var(--shape-scale,1));clip-path:inset(0 round calc(28px * var(--shape-scale,1)));pointer-events:none}
    canvas{position:absolute;inset:0;width:100%;height:100%}
    .veil{position:absolute;inset:0;background:var(--wallpaper-veil)}
  `
})
export class FrostComponent {
  readonly wallpaper=input.required<string>();
  /** The card's place on the display, in percent (tilePercentBounds). */
  readonly area=input.required<{left:number;top:number;width:number;height:number}>();
  readonly screen=input.required<{width:number;height:number}>();
  readonly zoom=input(1);
  private readonly canvas=viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  readonly slice=computed(()=>{const b=this.area();return {left:-100*b.left/b.width+'%',top:-100*b.top/b.height+'%',width:10000/b.width+'%',height:10000/b.height+'%',right:'auto',bottom:'auto'};});
  private drawn='';
  constructor(){
    effect(()=>{
      const canvas=this.canvas()?.nativeElement,id=this.wallpaper(),b=this.area(),s=this.screen(),zoom=this.zoom();
      const key=JSON.stringify([id,b,s,zoom]);if(!canvas||key===this.drawn)return;this.drawn=key;
      const image=new Image();image.src=wallpaperUrl(id);
      image.decode().then(()=>{
        if(this.drawn!==key)return;
        // Half resolution is plenty for a 26px blur, and keeps the eight or so canvases small.
        const x=b.left/100*s.width,y=b.top/100*s.height,w=b.width/100*s.width,h=b.height/100*s.height,k=.5;
        canvas.width=Math.max(1,Math.ceil(w*k));canvas.height=Math.max(1,Math.ceil(h*k));
        const g=canvas.getContext('2d')!;
        const fit=Math.max(s.width/image.naturalWidth,s.height/image.naturalHeight)*zoom,iw=image.naturalWidth*fit,ih=image.naturalHeight*fit;
        g.filter='blur('+26*k+'px) saturate(1.8)';
        g.drawImage(image,((s.width-iw)/2-x)*k,((s.height-ih)/2-y)*k,iw*k,ih*k);
      }).catch(()=>{this.drawn='';});
    });
  }
}

/**
 * The desk behind a launched workspace, one window per display, always below applications:
 * the wallpaper, every widget on its tile, and a quiet label on tiles still waiting for an app.
 * The widgets share this one page so the display composes them once per frame (a window per
 * widget made every animation a separate redraw, which starved video playback), and glass
 * cards frost the wallpaper under them.
 *
 * Glass here is a picture of the wallpaper behind each card, blurred once (sp-frost), rather than a live
 * backdrop blur: that is redone on every frame something in the card moves, and with the widgets'
 * ambient motion it starved video playback in the browser. Under the blur the picture matches.
 */
@Component({
  selector:'sp-workspace-backdrop',
  changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[NgStyle,IconComponent,WallpaperComponent,WidgetFrame,FrostComponent],
  template:`
    <sp-wallpaper [id]="store.profile().WallpaperId" [moving]="store.profile().AnimatedWallpaper&&!store.appearance().reducedMotion"/>
    @for(tile of store.board().Zones;track tile.Id){
      <div class="tile" [attr.data-kind]="tile.ContentKind" [class.waiting]="tile.ContentKind==='Application'&&!tile.AssignedProcessName" [ngStyle]="bounds(tile)">
        @if(tile.ContentKind==='Widget'){
          @if(glass()){<sp-frost [wallpaper]="store.profile().WallpaperId" [area]="percent(tile)" [screen]="screen()" [zoom]="drifting()?1.045:1"/>}
          <sp-widget [id]="tile.WidgetId" [scale]="store.board().WidgetScale||1" (expand)="store.expandWidget(tile.WidgetId)" (manage)="store.manageWidget(tile.WidgetId)"/>
        } @else if(tile.ContentKind==='Web'||tile.ContentKind==='Application'&&!tile.AssignedProcessName){
          <span class="label label-large"><sp-icon [name]="icon(tile)"/>{{label(tile,$index)}}</span>
        }
      </div>
    }`,
  styles:`
    :host{display:block;position:relative;isolation:isolate;height:100vh;overflow:hidden}
    .tile{position:absolute;z-index:var(--z-content);border-radius:var(--shape-xl)}
    .tile sp-widget{position:relative;z-index:1;height:100%}

    .tile.waiting{border:2px dashed color-mix(in srgb,var(--mat-sys-on-surface) 28%,transparent);background:color-mix(in srgb,var(--mat-sys-surface) 18%,transparent)}
    .label{position:absolute;top:var(--space-3);left:var(--space-3);display:inline-flex;align-items:center;gap:var(--space-2);padding:var(--space-1-5) var(--space-3) var(--space-1-5) var(--space-2);border-radius:var(--shape-full);background:var(--mat-sys-surface-container-high);color:var(--mat-sys-on-surface);box-shadow:var(--elevation-1)}
    .label sp-icon{font-size:18px;color:var(--mat-sys-primary)}
  `
})
export class WorkspaceBackdrop {
  readonly store=inject(StudioStore);
  constructor(){
    // Ambient motion on the desk advances 30 times a second, keeping its curve: looping animations (the
    // colon, the seconds bar, breathing dots, the wallpaper drift) and the longer transitions that data
    // updates restart every second (Spotify's progress and record, System's charts and digits). At the
    // display's full rate (240 Hz here) the desk redrew so often that video in the browser above it could
    // not keep decoding. One-off event motion and quick hover feedback stay at full rate.
    const paced=new WeakSet<Animation>();
    const pace=(animation:Animation)=>{
      const effect=animation.effect as KeyframeEffect|null,timing=effect?.getTiming();
      if(!effect||paced.has(animation)||typeof timing?.duration!=='number'||timing.duration<=0)return;
      const loop=timing.iterations===Infinity,transition=animation instanceof CSSTransition;
      if(!loop&&!(transition&&timing.duration>=300))return;
      paced.add(animation);
      // A transition's curve lives on the effect; move it onto the keyframes so the steps can take its place.
      if(transition&&timing.easing&&timing.easing!=='linear'){const frames=effect.getKeyframes();frames[0]={...frames[0],easing:timing.easing};effect.setKeyframes(frames);}
      effect.updateTiming({easing:'steps('+Math.max(2,Math.round(timing.duration/1000*deskFps))+', jump-none)'});
    };
    const paceTarget=(event:Event)=>{for(const animation of (event.target as Element).getAnimations())pace(animation);};
    document.addEventListener('animationstart',paceTarget,true);
    document.addEventListener('transitionrun',paceTarget,true);
    // Transitions replaced mid-flight (a chart retargeting every second) can start without an event in time.
    queueMicrotask(()=>document.getAnimations().forEach(pace));setInterval(()=>document.getAnimations().forEach(pace),200);
  }
  readonly glass=computed(()=>this.store.appearance().surface==='glass');
  /** The live wallpaper drifts between 1.025× and 1.065×; the frosted copies hold the middle of that. */
  readonly drifting=computed(()=>this.store.profile().AnimatedWallpaper&&!this.store.appearance().reducedMotion);
  readonly screen=computed(()=>{const d=this.store.displays().find(d=>d.index===this.store.board().MonitorIndex);return {width:d?.width??1920,height:d?.height??1080};});
  percent(tile:Tile){const s=this.screen(),p=this.store.profile();return tilePercentBounds(tile,this.store.board().Zones,s.width,s.height,p.OuterMargin,p.Gap);}
  bounds(tile:Tile){const b=this.percent(tile);return {left:b.left+'%',top:b.top+'%',width:b.width+'%',height:b.height+'%'};}
  label(tile:Tile,index:number){return tile.ContentKind==='Widget'?widgetDefinition(tile.WidgetId).name:tile.ContentKind==='Web'?(tile.SharedWebName||'Browser'):'Tile '+(index+1)+' · waiting for an app';}
  icon(tile:Tile){return tile.ContentKind==='Widget'?widgetDefinition(tile.WidgetId).icon:tile.ContentKind==='Web'?'language':'web_asset';}
}
