import {ChangeDetectionStrategy,Component,OnDestroy,inject,signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatTooltipModule} from '@angular/material/tooltip';
import {Bridge} from '../../bridge';
import {StudioStore} from '../state/studio-store';
import {IconComponent} from '../ui/icon';

interface BrowserState {selected?:string;tabs?:{id:string;title:string;url:string}[];url?:string;pinned?:boolean;back?:boolean;forward?:boolean;error?:string;extension?:string;runtime?:string;}

/**
 * The toolbar window above a shared browser. The native host sizes it: 124px pinned
 * (tabs, address, bookmarks), 40px collapsed (tabs only), full height for diagnostics.
 */
@Component({
  selector:'sp-browser-toolbar',
  changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[FormsModule,MatButtonModule,MatTooltipModule,IconComponent],
  template:`
    <div class="bar tabs">
      <span class="name label-large" (pointerdown)="action('drag')"><sp-icon name="language" [filled]="true"/>{{store.browserName}}</span>
      @if(pinned()){
        <div class="tab-strip" role="tablist">
          @for(tab of state().tabs??[];track tab.id){
            <div class="tab" role="tab" [attr.aria-selected]="state().selected===tab.id" [class.active]="state().selected===tab.id">
              <button class="tab-title" [title]="tab.title" (click)="action('select',{id:tab.id})">{{tab.title||'New tab'}}</button>
              <button class="tab-close" [attr.aria-label]="'Close '+(tab.title||'tab')" (click)="action('close',{id:tab.id})"><sp-icon name="close"/></button>
            </div>
          }
          <button class="icon" aria-label="New tab" matTooltip="New tab" (click)="action('add')"><sp-icon name="add"/></button>
        </div>
      }
      <span class="drag" (pointerdown)="action('drag')"></span>
      <button class="icon" [attr.aria-label]="pinned()?'Collapse toolbar':'Show toolbar'" [matTooltip]="pinned()?'Collapse toolbar':'Show toolbar'" (click)="action('pin')"><sp-icon [name]="pinned()?'expand_less':'expand_more'"/></button>
      <button class="icon" aria-label="Hide browser" matTooltip="Hide browser" (click)="action('hide')"><sp-icon name="visibility_off"/></button>
    </div>
    @if(pinned()){
      <div class="bar address">
        <button class="icon" aria-label="Back" [disabled]="!state().back" (click)="action('back')"><sp-icon name="arrow_back"/></button>
        <button class="icon" aria-label="Forward" [disabled]="!state().forward" (click)="action('forward')"><sp-icon name="arrow_forward"/></button>
        <button class="icon" aria-label="Reload" (click)="action('reload')"><sp-icon name="refresh"/></button>
        <label class="field"><sp-icon name="search"/><input aria-label="Search or enter address" [(ngModel)]="url" (keydown.enter)="action('navigate',{url})" (focus)="$any($event.target).select()"></label>
        <button class="icon" aria-label="Open in your default browser" matTooltip="Open in default browser" (click)="action('external')"><sp-icon name="open_in_new"/></button>
        <button class="icon" aria-label="Browser information" matTooltip="Browser information" (click)="diagnostics(true)"><sp-icon name="info"/></button>
      </div>
      <div class="bar bookmarks">
        @for(bookmark of store.bookmarks();track $index){
          <button class="bookmark" [class.icon-only]="!bookmark.displayTitle" [attr.aria-label]="bookmark.displayTitle||bookmark.host" [title]="bookmark.displayTitle||bookmark.host" (click)="action('navigate',{url:bookmark.url})">
            @if(bookmark.icon){<img [src]="bookmark.icon" alt="">}@else{<sp-icon name="bookmark"/>}
            @if(bookmark.displayTitle){<span>{{bookmark.displayTitle}}</span>}
          </button>
        } @empty {<span class="body-small hint">Import Brave bookmarks from Browsers in Setpiece.</span>}
      </div>
    }
    @if(state().error){<p class="error body-small" role="alert">{{state().error}}</p>}
    @if(showDiagnostics()){
      <section class="diagnostics">
        <h2 class="title-large">Browser information</h2>
        <p class="body-medium">{{state().extension}}</p>
        <p class="body-medium">WebView2 {{state().runtime}}</p>
        <p class="body-medium on-surface-variant">{{(state().tabs??[]).length}} open tabs. Web pages have no access to Setpiece.</p>
        <div class="actions"><button matButton (click)="action('devtools')">Developer tools</button><button matButton="filled" (click)="diagnostics(false)">Done</button></div>
      </section>
    }`,
  styles:`
    :host{display:flex;flex-direction:column;height:100vh;background:var(--mat-sys-surface-container);color:var(--mat-sys-on-surface);overflow:hidden}
    .bar{display:flex;align-items:center;gap:4px;padding:0 6px;flex-shrink:0}
    .tabs{height:40px}
    .address{height:44px}
    .bookmarks{height:40px;gap:2px;overflow:hidden;border-bottom:1px solid var(--mat-sys-outline-variant)}
    .name{display:flex;align-items:center;gap:6px;padding:0 10px 0 6px;color:var(--mat-sys-primary);white-space:nowrap;cursor:default;user-select:none}
    .name sp-icon{font-size:18px}
    .drag{flex:1;align-self:stretch;min-width:24px}
    .tab-strip{display:flex;align-items:center;gap:2px;min-width:0;overflow:hidden}
    .tab{display:flex;align-items:center;height:32px;max-width:200px;min-width:64px;border-radius:var(--shape-full);color:var(--mat-sys-on-surface-variant);transition:background-color var(--motion-effects)}
    .tab:hover{background:color-mix(in srgb,var(--mat-sys-on-surface) 8%,transparent)}
    .tab.active{background:var(--mat-sys-secondary-container);color:var(--mat-sys-on-secondary-container)}
    .tab-title{flex:1;min-width:0;padding:0 4px 0 14px;border:0;background:none;color:inherit;font:var(--mat-sys-label-large);text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}
    .tab-close{display:grid;place-items:center;width:24px;height:24px;margin-right:4px;border:0;border-radius:50%;background:none;color:inherit;cursor:pointer}
    .tab-close:hover{background:color-mix(in srgb,currentColor 12%,transparent)}
    .tab-close sp-icon{font-size:16px}
    .icon{display:grid;place-items:center;flex-shrink:0;width:36px;height:36px;border:0;border-radius:50%;background:none;color:var(--mat-sys-on-surface-variant);cursor:pointer;transition:background-color var(--motion-effects)}
    .icon:hover:not(:disabled){background:color-mix(in srgb,var(--mat-sys-on-surface) 8%,transparent)}
    .icon:disabled{opacity:.38;cursor:default}
    .icon sp-icon{font-size:20px}
    .field{flex:1;display:flex;align-items:center;gap:8px;height:36px;padding:0 14px;border-radius:var(--shape-full);background:var(--mat-sys-surface-container-highest);color:var(--mat-sys-on-surface-variant)}
    .field:focus-within{outline:2px solid var(--mat-sys-primary)}
    .field sp-icon{font-size:18px}
    .field input{flex:1;min-width:0;border:0;outline:0;background:none;color:var(--mat-sys-on-surface);font:var(--mat-sys-body-medium)}
    .bookmark{display:flex;align-items:center;gap:6px;height:30px;max-width:160px;padding:0 10px;border:0;border-radius:var(--shape-sm);background:none;color:var(--mat-sys-on-surface-variant);font:var(--mat-sys-label-medium);cursor:pointer}
    .bookmark:hover{background:color-mix(in srgb,var(--mat-sys-on-surface) 8%,transparent)}
    .bookmark.icon-only{padding:0 7px}
    .bookmark img,.bookmark sp-icon{width:16px;height:16px;font-size:16px;flex-shrink:0}
    .bookmark span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .hint{padding:0 8px;color:var(--mat-sys-on-surface-variant)}
    .error{padding:6px 12px;background:var(--mat-sys-error-container);color:var(--mat-sys-on-error-container)}
    .diagnostics{display:flex;flex-direction:column;gap:var(--space-3);margin:var(--space-4);padding:var(--space-6);border-radius:var(--shape-xl);background:var(--mat-sys-surface-container-high)}
    .actions{display:flex;justify-content:flex-end;gap:var(--space-2);margin-top:var(--space-2)}
  `
})
export class BrowserToolbar implements OnDestroy {
  readonly store=inject(StudioStore);
  private readonly bridge=inject(Bridge);
  readonly state=signal<BrowserState>({});
  readonly pinned=signal(true);
  readonly showDiagnostics=signal(false);
  url=this.store.query.get('url')??'https://www.youtube.com/';
  private readonly unsubscribe=this.bridge.listen(e=>{if(e.event==='browser')this.receive(e.data);});

  constructor(){this.bridge.call('browser',{action:'state'}).then(data=>this.receive(data)).catch(e=>this.state.set({error:(e as Error).message}));}
  private receive(data:BrowserState){this.state.set(data);this.url=data.url??this.url;this.pinned.set(data.pinned??true);}
  async action(action:string,payload:Record<string,unknown>={}){
    try{const data=await this.bridge.call<BrowserState>('browser',{action,...payload});if(data)this.receive(data);}
    catch(e){this.state.update(s=>({...s,error:(e as Error).message}));}
  }
  async diagnostics(open:boolean){await this.action('diagnostics',{open});this.showDiagnostics.set(open);}
  ngOnDestroy(){this.unsubscribe();}
}
