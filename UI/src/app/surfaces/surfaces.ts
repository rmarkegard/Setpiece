import {ChangeDetectionStrategy,Component,computed,inject} from '@angular/core';
import {NgStyle} from '@angular/common';
import {MatButtonModule} from '@angular/material/button';
import {Tile,tilePercentBounds,widgetDefinition} from '../../domain';
import {StudioStore} from '../state/studio-store';
import {GameComponent} from '../game/game';
import {IconComponent} from '../ui/icon';
import {WallpaperComponent} from '../ui/wallpaper';
import {WidgetFrame} from '../widgets/widget-frame';

/** A launched widget: its own transparent window, so the card is the only visible shape. */
@Component({
  selector:'sp-widget-window',
  changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[NgStyle,WallpaperComponent,WidgetFrame],
  template:`
    <sp-wallpaper [id]="store.profile().WallpaperId" [moving]="store.profile().AnimatedWallpaper&&!store.appearance().reducedMotion" [ngStyle]="store.wallpaperViewport()"/>
    <sp-widget [id]="store.widgetId!" [scale]="scale()" (expand)="store.expandWidget(store.widgetId!)" (manage)="store.manageWidget(store.widgetId!)" (play)="store.playGame()"/>`,
  styles:`
    :host{display:block;position:relative;isolation:isolate;height:100vh;overflow:hidden}
    :host-context(.widget-surface) sp-wallpaper{display:none}
    sp-widget{position:relative;z-index:var(--z-content);height:100%}
  `
})
export class WidgetWindow {
  readonly store=inject(StudioStore);
  readonly scale=computed(()=>this.store.profile().MonitorBoards.find(b=>b.MonitorIndex===Number(this.store.query.get('display')))?.WidgetScale??1);
}

/**
 * The click-through backdrop behind a launched workspace: wallpaper, plus a quiet label
 * on tiles still waiting for an app.
 */
@Component({
  selector:'sp-workspace-backdrop',
  changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[NgStyle,IconComponent,WallpaperComponent],
  template:`
    <sp-wallpaper [id]="store.profile().WallpaperId" [moving]="store.profile().AnimatedWallpaper&&!store.appearance().reducedMotion"/>
    @for(tile of store.board().Zones;track tile.Id){
      <div class="tile" [attr.data-kind]="tile.ContentKind" [class.waiting]="tile.ContentKind==='Application'&&!tile.AssignedProcessName" [ngStyle]="bounds(tile)">
        @if(tile.ContentKind!=='Application'||!tile.AssignedProcessName){
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

/** Scrapbots in its own window. */
@Component({
  selector:'sp-game-window',
  changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[MatButtonModule,IconComponent,GameComponent],
  template:`
    <div class="top"><button matButton (click)="store.execute('manage-widget',{id:'idle-game'})"><sp-icon name="space_dashboard"/>Open Setpiece</button></div>
    <sp-game/>`,
  styles:`
    :host{display:block;height:100vh;overflow:auto;padding:var(--space-4) var(--space-6) var(--space-6);background:var(--mat-sys-surface-container-low)}
    .top{display:flex;justify-content:flex-end}
  `
})
export class GameWindow {readonly store=inject(StudioStore);}
