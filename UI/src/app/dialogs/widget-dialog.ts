import {ChangeDetectionStrategy,Component,computed,inject,signal} from '@angular/core';
import {MAT_DIALOG_DATA,MatDialogModule,MatDialogRef} from '@angular/material/dialog';
import {MatButtonModule} from '@angular/material/button';
import {MatTooltipModule} from '@angular/material/tooltip';
import {widgetDefinition} from '../../domain';
import {accounts} from '../state/services';
import {StudioStore} from '../state/studio-store';
import {ConnectionFormComponent} from '../connections/connection-form';
import {GameComponent} from '../game/game';
import {IconComponent} from '../ui/icon';
import {WidgetFrame} from '../widgets/widget-frame';

export interface WidgetDialogData {id:string;play?:boolean;}

/**
 * One place for a widget: a live preview, its settings and connection, and adding it to
 * the board. Accounts (no widget of their own) show the form alone. Scrapbots swaps the
 * preview for the game itself.
 */
@Component({
  selector:'sp-widget-dialog',
  changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[MatDialogModule,MatButtonModule,MatTooltipModule,ConnectionFormComponent,GameComponent,IconComponent,WidgetFrame],
  template:`
    <div class="detail" [class.account]="!!account()" [class.playing]="playing()">
      <header>
        <span class="mark" [attr.data-category]="definition().category"><sp-icon [name]="account()?.icon??definition().icon" [filled]="true"/></span>
        <div class="copy">
          <h2 class="headline-small emphasized">{{account()?.name??definition().name}}</h2>
          <p class="body-medium on-surface-variant">{{account()?.description??definition().description}}</p>
        </div>
        <button matIconButton mat-dialog-close aria-label="Close" matTooltip="Close"><sp-icon name="close"/></button>
      </header>
      @if(playing()){
        <div class="game"><sp-game/></div>
      } @else {
        <div class="body">
          @if(!account()){
            <div class="preview" aria-label="Live preview">
              <sp-widget [id]="data.id" [canExpand]="false" [canManage]="false" (play)="playing.set(true)"/>
            </div>
          }
          <div class="settings">
            <h3 class="title-medium">{{account()?'Connection':'Settings'}}</h3>
            @if(definition().preview){
              <p class="body-medium on-surface-variant">This widget is a preview of something on the way. It works on the board, but has nothing to set up yet.</p>
            } @else if(definition().retired&&!account()){
              <p class="body-medium on-surface-variant">This integration has retired and can't be set up any more.</p>
            } @else {
              <sp-connection-form [id]="data.id" (openGame)="playing.set(true)" (openAccount)="openGoogle()"/>
            }
          </div>
        </div>
      }
      @if(!account()&&!definition().retired){
        <footer>
          @if(count()){<span class="body-medium on-surface-variant">{{count()}} on this display</span>}
          <span class="grow"></span>
          <button matButton="tonal" (click)="add()"><sp-icon name="add"/>{{count()?'Add another':'Add to board'}}</button>
        </footer>
      }
    </div>`,
  styles:`
    .detail{display:flex;flex-direction:column;max-height:88vh;width:min(calc(920px * var(--ui-scale)),92vw)}
    .detail.account{width:min(calc(560px * var(--ui-scale)),92vw)}
    header{display:flex;align-items:center;gap:var(--space-4);padding:var(--space-6) var(--space-4) var(--space-4) var(--space-6)}
    .copy{flex:1;min-width:0}
    .mark{display:grid;place-items:center;width:56px;height:56px;border-radius:var(--shape-lg);flex-shrink:0;background:var(--mat-sys-primary-container);color:var(--mat-sys-on-primary-container)}
    .mark[data-category=Connected]{background:var(--mat-sys-secondary-container);color:var(--mat-sys-on-secondary-container);border-bottom-left-radius:var(--shape-xs)}
    .mark[data-category=Device]{background:var(--mat-sys-tertiary-container);color:var(--mat-sys-on-tertiary-container);border-top-right-radius:var(--shape-xs)}
    .mark[data-category=Play]{background:var(--mat-sys-play-container);color:var(--mat-sys-on-play-container);border-radius:var(--shape-xl)}
    .mark[data-category=Preview],.mark[data-category=Retired]{background:var(--mat-sys-surface-container-highest);color:var(--mat-sys-on-surface-variant)}
    .body{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:var(--space-6);padding:0 var(--space-6) var(--space-6);overflow:auto;min-height:0}
    .account .body{grid-template-columns:1fr}
    .preview{position:relative;align-self:start;aspect-ratio:1;max-height:calc(420px * var(--ui-scale));border-radius:var(--shape-xl);background:var(--mat-sys-surface-container-lowest);padding:var(--space-4)}
    .preview sp-widget{height:100%}
    .settings{display:flex;flex-direction:column;gap:var(--space-4);min-width:0}
    .game{padding:0 var(--space-6) var(--space-6);overflow:auto}
    footer{display:flex;align-items:center;gap:var(--space-2);padding:var(--space-4) var(--space-6);border-top:1px solid var(--mat-sys-outline-variant)}
    .grow{flex:1}
    @media (max-width:760px){.body{grid-template-columns:1fr}.preview{aspect-ratio:auto;height:280px}}
  `
})
export class WidgetDialog {
  readonly data=inject<WidgetDialogData>(MAT_DIALOG_DATA);
  private readonly ref=inject(MatDialogRef<WidgetDialog>);
  private readonly store=inject(StudioStore);
  readonly definition=computed(()=>widgetDefinition(this.data.id));
  readonly account=computed(()=>accounts.find(a=>a.id===this.data.id));
  readonly count=computed(()=>this.store.widgetCount(this.data.id));
  readonly playing=signal(!!this.data.play);
  /** Set by the opener, so the Inbox form can hand off to the Google account. */
  openAccount:(id:string)=>void=()=>{};
  add(){this.store.addWidget(this.data.id);this.ref.close();}
  openGoogle(){this.ref.close();this.openAccount('google');}
}
