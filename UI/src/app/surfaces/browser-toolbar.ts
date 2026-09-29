import {ChangeDetectionStrategy,Component,ElementRef,OnDestroy,computed,effect,inject,signal,viewChild} from '@angular/core';
import {NgStyle} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatTooltipModule} from '@angular/material/tooltip';
import {Bridge} from '../../bridge';
import {StudioStore} from '../state/studio-store';
import {IconComponent} from '../ui/icon';
import {WallpaperComponent} from '../ui/wallpaper';

interface BrowserState {selected?:string;tabs?:{id:string;title:string;url:string}[];url?:string;pinned?:boolean;constrain?:boolean;back?:boolean;forward?:boolean;error?:string;extension?:string;runtime?:string;}

/**
 * A shared browser wears the widget card: same tone, radius, Glass or Solid and Colorful or Plain.
 * This page is the whole card; the host lays the web page into the opening it reports, so the
 * card's toolbar sits above the page and its edge frames it.
 */
@Component({
  selector:'sp-browser-toolbar',
  changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[NgStyle,FormsModule,MatButtonModule,MatTooltipModule,IconComponent,WallpaperComponent],
  template:`
    @if(glass()){<div class="behind"><sp-wallpaper [id]="store.profile().WallpaperId" [ngStyle]="store.wallpaperViewport()"/></div>}
    <section class="sp wg br" [class.pinned]="pinned()" aria-label="Browser">
      <div class="top">
        <div class="row tabs">
          <span class="eyebrow name" (pointerdown)="action('drag')"><sp-icon name="language"/>{{store.browserName}}</span>
          @if(pinned()){
            <div class="strip" role="tablist">
              @for(tab of state().tabs??[];track tab.id){
                <div class="tab" role="tab" [attr.aria-selected]="state().selected===tab.id" [class.on]="state().selected===tab.id">
                  <button class="tab-title" [title]="tab.title" (click)="action('select',{id:tab.id})"><i></i><span>{{tab.title||'New tab'}}</span></button>
                  <button class="tab-close" [attr.aria-label]="'Close '+(tab.title||'tab')" (click)="action('close',{id:tab.id})"><sp-icon name="close"/></button>
                </div>
              }
              <button class="btn" aria-label="New tab" matTooltip="New tab" (click)="action('add')"><sp-icon name="add"/></button>
            </div>
          } @else {
            <span class="now clip">{{title()}}</span>
          }
          <span class="drag" (pointerdown)="action('drag')"></span>
          <button class="btn" [class.on]="state().constrain" [attr.aria-pressed]="!!state().constrain" [attr.aria-label]="state().constrain?'Fullscreen stays in the tile. Switch to the whole display':'Fullscreen fills the display. Switch to the tile'" [matTooltip]="state().constrain?'Fullscreen: inside the tile':'Fullscreen: whole display'" (click)="action('fullscreen-mode')"><sp-icon [name]="state().constrain?'fit_screen':'fullscreen'"/></button>
          <button class="btn" [attr.aria-label]="pinned()?'Collapse toolbar':'Show toolbar'" [matTooltip]="pinned()?'Collapse toolbar':'Show toolbar'" (click)="action('pin')"><sp-icon [name]="pinned()?'expand_less':'expand_more'"/></button>
        </div>
        @if(pinned()){
          <div class="row nav">
            <div class="seg">
              <button class="btn" aria-label="Back" [disabled]="!state().back" (click)="action('back')"><sp-icon name="arrow_back"/></button>
              <button class="btn" aria-label="Forward" [disabled]="!state().forward" (click)="action('forward')"><sp-icon name="arrow_forward"/></button>
              <button class="btn" aria-label="Reload" (click)="action('reload')"><sp-icon name="refresh"/></button>
            </div>
            <label class="field" [class.editing]="editing()">
              <sp-icon [name]="secure()?'lock':'search'"/>
              <span class="pretty" aria-hidden="true"><b>{{parts().host}}</b>{{parts().rest}}</span>
              <input aria-label="Search or enter address" [(ngModel)]="url" (keydown.enter)="go()" (focus)="editing.set(true);$any($event.target).select()" (blur)="editing.set(false)">
            </label>
            <button class="btn" aria-label="Open in your default browser" matTooltip="Open in default browser" (click)="action('external')"><sp-icon name="open_in_new"/></button>
            <button class="btn" aria-label="Browser information" matTooltip="Browser information" (click)="diagnostics(true)"><sp-icon name="info"/></button>
          </div>
          <div class="row marks">
            @for(bookmark of store.bookmarks();track $index){
              <button class="mark" [class.icon-only]="!bookmark.displayTitle" [attr.aria-label]="bookmark.displayTitle||bookmark.host" [title]="bookmark.displayTitle||bookmark.host" (click)="action('navigate',{url:bookmark.url})">
                @if(bookmark.icon){<img [src]="bookmark.icon" alt="">}@else{<sp-icon name="bookmark"/>}
                @if(bookmark.displayTitle){<span>{{bookmark.displayTitle}}</span>}
              </button>
            } @empty {<span class="hint">Import Brave bookmarks from Browsers in Setpiece.</span>}
          </div>
        }
        @if(state().error){<p class="error" role="alert"><sp-icon name="error"/>{{state().error}}</p>}
      </div>
      <div class="page" #page></div>
      @if(showDiagnostics()){
        <div class="diagnostics">
          <h2>Browser information</h2>
          <p>{{state().extension}}</p>
          <p>WebView2 {{state().runtime}}</p>
          <p class="muted">{{(state().tabs??[]).length}} open tabs. Web pages have no access to Setpiece.</p>
          <div class="actions"><button matButton (click)="action('devtools')">Developer tools</button><button matButton="filled" (click)="diagnostics(false)">Done</button></div>
        </div>
      }
    </section>`,
  styles:`
    :host{display:block;position:relative;isolation:isolate;height:100vh;overflow:hidden}
    .behind{position:absolute;inset:0;overflow:hidden;clip-path:inset(0 round calc(28px * var(--shape-scale,1)))}
    /* The card clips to its own shape (clip-path, not only overflow): the glass highlight otherwise kept the corner it was first drawn with. */
    .br{position:relative;height:100vh;flex-direction:column;border-radius:calc(28px * var(--shape-scale,1));clip-path:inset(0 round calc(28px * var(--shape-scale,1)));box-shadow:none;transition:background-color .8s var(--glide);
      --c:var(--t-accent);--on:var(--t-accent-on);--hi:var(--t-accent-hi);--v:var(--t-accent-v);
      --inner:max(4px,calc(28px * var(--shape-scale,1) - 8px))}
    .top{display:flex;flex-direction:column;flex:none;padding:6px 8px 0}
    .row{display:flex;align-items:center;gap:4px;min-width:0}
    .tabs{height:40px}
    .nav{height:42px;gap:6px}
    .marks{height:36px;gap:2px;overflow:hidden}
    .name{padding:0 10px 0 8px;height:32px;cursor:default;user-select:none;color:var(--on);font-weight:650}
    .name sp-icon{font-size:18px;color:var(--hi)}
    .drag{flex:1;align-self:stretch;min-width:24px}
    .now{min-width:0;font:550 12.5px/1 var(--font-brand);color:var(--faint)}
    .strip{display:flex;align-items:center;gap:3px;min-width:0;overflow:hidden}
    .tab{position:relative;display:flex;align-items:center;height:30px;max-width:210px;min-width:72px;border-radius:15px;color:var(--muted);transition:background-color .25s var(--glide),color .25s var(--glide)}
    .tab:hover{background:var(--inset)}
    .tab.on{background:var(--inset2);color:var(--on)}
    .tab-title{display:flex;align-items:center;gap:8px;flex:1;min-width:0;height:100%;padding:0 2px 0 12px;border:0;background:none;color:inherit;font:600 12.5px/1 var(--font-brand);cursor:pointer}
    .tab-title span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .tab-title i{flex:none;width:6px;height:6px;border-radius:50%;background:var(--track);transition:background-color .25s var(--glide),transform .35s var(--spring)}
    .tab.on .tab-title i{background:var(--hi);transform:scale(1.2)}
    .tab-close{display:grid;place-items:center;flex:none;width:22px;height:22px;margin-right:4px;border:0;border-radius:50%;background:none;color:inherit;cursor:pointer;opacity:0;transition:opacity .2s var(--glide)}
    .tab:hover .tab-close,.tab.on .tab-close,.tab-close:focus-visible{opacity:1}
    .tab-close:hover{background:var(--inset2)}
    .tab-close sp-icon{font-size:15px}
    .btn{display:grid;place-items:center;flex:none;width:32px;height:32px;border:0;border-radius:50%;background:none;color:var(--muted);cursor:pointer;transition:background-color .2s var(--glide),color .2s var(--glide)}
    .btn:hover:not(:disabled){background:var(--inset2);color:var(--on)}
    .btn:disabled{opacity:.35;cursor:default}
    .btn.on{background:var(--inset2);color:var(--hi)}
    .btn sp-icon{font-size:19px}
    .seg{display:flex;align-items:center;gap:0;padding:2px;border-radius:18px;background:var(--inset)}
    .field{position:relative;flex:1;display:flex;align-items:center;gap:8px;min-width:0;height:36px;padding:0 14px;border-radius:18px;background:var(--inset);color:var(--muted);cursor:text;transition:background-color .2s var(--glide),box-shadow .2s var(--glide)}
    .field:hover{background:var(--inset2)}
    .field.editing{background:var(--inset2);box-shadow:inset 0 0 0 1.5px var(--hi)}
    .field sp-icon{font-size:16px;flex:none}
    .field input{flex:1;min-width:0;border:0;outline:0;background:none;color:transparent;caret-color:var(--on);font:500 13px/1 var(--font-brand)}
    .field.editing input{color:var(--on)}
    .pretty{position:absolute;left:38px;right:14px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;pointer-events:none;font:500 13px/1 var(--font-brand);color:var(--faint)}
    .pretty b{font-weight:600;color:var(--on)}
    .field.editing .pretty{visibility:hidden}
    .mark{display:flex;align-items:center;gap:6px;flex:none;height:28px;max-width:170px;padding:0 10px;border:0;border-radius:14px;background:none;color:var(--muted);font:550 12px/1 var(--font-brand);cursor:pointer;transition:background-color .2s var(--glide),color .2s var(--glide)}
    .mark:hover{background:var(--inset2);color:var(--on)}
    .mark.icon-only{padding:0 6px}
    .mark img,.mark sp-icon{width:16px;height:16px;font-size:16px;flex:none;border-radius:4px}
    .mark span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .hint{padding:0 8px;font:500 12px/1 var(--font-brand);color:var(--faint)}
    .error{display:flex;align-items:center;gap:8px;margin:4px 0 2px;padding:8px 12px;border-radius:12px;background:color-mix(in oklab,var(--danger,#e5484d) 22%,transparent);font:550 12.5px/1.3 var(--font-brand)}
    .error sp-icon{font-size:16px}
    .page{flex:1;min-height:0;margin:6px 8px 8px;border-radius:var(--inner);background:var(--inset)}
    .br:not(.pinned) .page{margin-top:4px}
    .diagnostics{position:absolute;inset:8px;z-index:9;display:flex;flex-direction:column;gap:12px;padding:24px;border-radius:var(--inner);background:var(--c);font:500 14px/1.4 var(--font-brand)}
    .diagnostics h2{margin:0;font:650 20px/1.2 var(--font-brand)}
    .diagnostics p{margin:0}
    .diagnostics .muted{color:var(--muted)}
    .actions{display:flex;justify-content:flex-end;gap:8px;margin-top:auto}
  `
})
export class BrowserToolbar implements OnDestroy {
  readonly store=inject(StudioStore);
  private readonly bridge=inject(Bridge);
  readonly state=signal<BrowserState>({});
  readonly pinned=signal(true);
  readonly showDiagnostics=signal(false);
  readonly editing=signal(false);
  readonly glass=computed(()=>this.store.appearance().surface==='glass');
  readonly error=computed(()=>this.state().error);
  readonly title=computed(()=>{const s=this.state();return s.tabs?.find(t=>t.id===s.selected)?.title??'';});
  private readonly address=signal(this.store.query.get('url')??'https://www.youtube.com/');
  readonly secure=computed(()=>this.address().startsWith('https://'));
  /** The address reads as a place: the site stands out, the rest steps back. */
  readonly parts=computed(()=>{
    try{const u=new URL(this.address());return {host:u.host.replace(/^www\./,''),rest:(u.pathname==='/'?'':u.pathname)+u.search};}
    catch{return {host:this.address(),rest:''};}
  });
  url=this.address();
  private readonly page=viewChild.required<ElementRef<HTMLElement>>('page');
  private readonly unsubscribe=this.bridge.listen(e=>{if(e.event==='browser')this.receive(e.data);});
  private observer?:ResizeObserver;
  private reported='';

  constructor(){
    this.bridge.call('browser',{action:'state'}).then(data=>this.receive(data)).catch(e=>this.state.set({error:(e as Error).message}));
    // The host lays the web page into the opening; it hears again whenever the opening moves.
    effect(()=>{const el=this.page().nativeElement;this.observer?.disconnect();this.observer=new ResizeObserver(()=>this.report());this.observer.observe(el);this.observer.observe(document.documentElement);});
    // Only what moves the opening or recolours the card: the page's title and history changing must not.
    effect(()=>{this.pinned();this.error();this.store.appearance();requestAnimationFrame(()=>this.report());});
  }
  private report(){
    const el=this.page().nativeElement,r=el.getBoundingClientRect(),radius=parseFloat(getComputedStyle(el).borderTopLeftRadius)||0;
    // The look rides along so the host redraws its smooth page corners when the card's colours change.
    const frame={top:r.top,left:r.left,right:innerWidth-r.right,bottom:innerHeight-r.bottom,radius,look:JSON.stringify(this.store.appearance())};
    const key=JSON.stringify(frame);if(key===this.reported)return;this.reported=key;
    void this.bridge.call('browser',{action:'frame',...frame}).catch(()=>{this.reported='';});
  }
  private receive(data:BrowserState){
    this.state.set(data);if(data.url){this.address.set(data.url);if(!this.editing())this.url=data.url;}
    this.pinned.set(data.pinned??true);
  }
  go(){this.editing.set(false);void this.action('navigate',{url:this.url});(document.activeElement as HTMLElement|null)?.blur();}
  async action(action:string,payload:Record<string,unknown>={}){
    try{const data=await this.bridge.call<BrowserState>('browser',{action,...payload});if(data)this.receive(data);}
    catch(e){this.state.update(s=>({...s,error:(e as Error).message}));}
  }
  async diagnostics(open:boolean){await this.action('diagnostics',{open});this.showDiagnostics.set(open);}
  ngOnDestroy(){this.unsubscribe();this.observer?.disconnect();}
}
