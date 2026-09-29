import {ChangeDetectionStrategy,Component,computed,inject} from '@angular/core';
import {NgStyle} from '@angular/common';
import {Tile,tilePercentBounds,widgetDefinition} from '../../domain';
import {StudioStore} from '../state/studio-store';
import {IconComponent} from '../ui/icon';
import {WallpaperComponent} from '../ui/wallpaper';
import {WidgetFrame} from '../widgets/widget-frame';

/**
 * A launched widget: its own transparent window, so the card is the only visible shape.
 * A glass card needs something to frost, so under Glass the window also paints its slice of
 * the wallpaper, clipped to the card, for the card's backdrop blur to work on.
 * For design review, ?review&w=&h= instead lays the card on a plain board at an exact size.
 */
@Component({
  selector:'sp-widget-window',
  changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[NgStyle,WallpaperComponent,WidgetFrame],
  template:`
    @if(review;as size){
      <div class="sp review"><sp-widget [id]="store.widgetId!" [style.width.px]="size.w" [style.height.px]="size.h" [canExpand]="false" [canManage]="false"/></div>
    } @else {
      <div class="behind" [class.glass]="store.appearance().surface==='glass'"><sp-wallpaper [id]="store.profile().WallpaperId" [moving]="store.profile().AnimatedWallpaper&&!store.appearance().reducedMotion" [ngStyle]="store.wallpaperViewport()"/></div>
      <sp-widget [id]="store.widgetId!" [scale]="scale()" (expand)="store.expandWidget(store.widgetId!)" (manage)="store.manageWidget(store.widgetId!)"/>
    }`,
  styles:`
    :host{display:block;position:relative;isolation:isolate;height:100vh;overflow:hidden}
    .behind{position:absolute;inset:0;overflow:hidden;clip-path:inset(0 round calc(28px * var(--shape-scale,1)))}
    :host-context(.widget-surface) .behind:not(.glass){display:none}
    sp-widget{position:relative;z-index:var(--z-content);height:100%}
    .review{box-sizing:border-box;height:100vh;padding:24px;background-color:var(--desk);background-image:radial-gradient(color-mix(in oklab,var(--ink) 10%,transparent) 1px,transparent 1.3px);background-size:18px 18px}
  `
})
export class WidgetWindow {
  readonly store=inject(StudioStore);
  readonly review=this.store.query.has('review')?{w:Number(this.store.query.get('w'))||303,h:Number(this.store.query.get('h'))||251}:null;
  readonly scale=computed(()=>this.store.profile().MonitorBoards.find(b=>b.MonitorIndex===Number(this.store.query.get('display')))?.WidgetScale??1);
}

/**
 * The click-through backdrop behind a launched workspace: wallpaper, plus a quiet label
 * on tiles still waiting for an app. Widget tiles get none: their own window covers the
 * tile, and a glass card would show the label through it.
 */
@Component({
  selector:'sp-workspace-backdrop',
  changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[NgStyle,IconComponent,WallpaperComponent],
  template:`
    <sp-wallpaper [id]="store.profile().WallpaperId" [moving]="store.profile().AnimatedWallpaper&&!store.appearance().reducedMotion"/>
    @for(tile of store.board().Zones;track tile.Id){
      <div class="tile" [attr.data-kind]="tile.ContentKind" [class.waiting]="tile.ContentKind==='Application'&&!tile.AssignedProcessName" [ngStyle]="bounds(tile)">
        @if(tile.ContentKind==='Web'||tile.ContentKind==='Application'&&!tile.AssignedProcessName){
          <span class="label label-large"><sp-icon [name]="icon(tile)"/>{{label(tile,$index)}}</span>
        }
      </div>
    }`,
  styles:`
    :host{display:block;position:relative;isolation:isolate;height:100vh;overflow:hidden}
    .tile{position:absolute;z-index:var(--z-content);border-radius:var(--shape-xl)}
    .tile.waiting{border:2px dashed color-mix(in srgb,var(--mat-sys-on-surface) 28%,transparent);background:color-mix(in srgb,var(--mat-sys-surface) 18%,transparent)}
    .label{position:absolute;top:var(--space-3);left:var(--space-3);display:inline-flex;align-items:center;gap:var(--space-2);padding:var(--space-1-5) var(--space-3) var(--space-1-5) var(--space-2);border-radius:var(--shape-full);background:var(--mat-sys-surface-container-high);color:var(--mat-sys-on-surface);box-shadow:var(--elevation-1)}
    .label sp-icon{font-size:18px;color:var(--mat-sys-primary)}
  `
})
export class WorkspaceBackdrop {
  readonly store=inject(StudioStore);
  bounds(tile:Tile){
    const d=this.store.displays().find(d=>d.index===this.store.board().MonitorIndex),width=d?.width??1920,height=d?.height??1080,p=this.store.profile();
    const b=tilePercentBounds(tile,this.store.board().Zones,width,height,p.OuterMargin,p.Gap);
    return {left:b.left+'%',top:b.top+'%',width:b.width+'%',height:b.height+'%'};
  }
  label(tile:Tile,index:number){return tile.ContentKind==='Widget'?widgetDefinition(tile.WidgetId).name:tile.ContentKind==='Web'?(tile.SharedWebName||'Browser'):'Tile '+(index+1)+' · waiting for an app';}
  icon(tile:Tile){return tile.ContentKind==='Widget'?widgetDefinition(tile.WidgetId).icon:tile.ContentKind==='Web'?'language':'web_asset';}
}
