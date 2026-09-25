import {AfterViewInit,ChangeDetectionStrategy,Component,ElementRef,OnDestroy,OnInit,computed,effect,inject,input,output,signal,viewChild} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {MatTooltipModule} from '@angular/material/tooltip';
import {Bridge} from '../../bridge';
import {ServiceState,widgetDefinition} from '../../domain';
import {widgetContentLimit} from '../../widget-layout';
import {categoryRole,categoryShape} from '../../theme';
import {IconComponent} from '../ui/icon';
import {WIDGET_BODIES} from './bodies';
import {WidgetContext} from './context';

// How often each live widget refreshes, in seconds.
const refreshSeconds=(id:string)=>['system','volume','battery'].includes(id)?2:id==='codex'?60:id==='bambu-lab'?10:['discord','spotify'].includes(id)?5:30;
// Widgets whose body is always shown: they own their data or have nothing to wait for.
const selfContained=['clock','notes','idle-game'];

/**
 * The shell every widget shares. It owns the Expressive card (category color and shape),
 * sizing (compact, regular, spacious and fit-to-tile zoom), polling, and the loading,
 * empty, disconnected and error states. Widget bodies inject it to read state.
 */
@Component({
  selector:'sp-widget',
  changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[IconComponent,MatButtonModule,MatProgressSpinnerModule,MatTooltipModule,...WIDGET_BODIES],
  template:`
    <section class="widget" [attr.aria-label]="definition().name" [attr.data-widget]="id()" [attr.data-category]="definition().category" [attr.data-state]="state().status"
      [class.compact]="compact()" [class.short]="short()" [class.narrow]="narrow()" [class.spacious]="spacious()" [style.border-radius]="radius()"
      [style.--w-container]="'var(--mat-sys-'+role().container+')'" [style.--w-on]="'var(--mat-sys-'+role().onContainer+')'">
      <span class="state-label sr-only" aria-live="polite">{{statusLabel()}}</span>
      <div class="fit-container" #container>
        <div class="fit-content" #content [style.zoom]="fit()" [style.--body-height]="bodyHeight()+'px'">
          @if(definition().retired){
            <div class="widget-state">
              <span class="blob"><sp-icon name="block"/></span>
              <h3 class="title-large">This widget has retired</h3>
              <p class="body-medium">{{definition().name}} is no longer available. The tile keeps its place.</p>
              <button matButton="filled" (click)="manage.emit()">Choose another</button>
            </div>
          } @else if(definition().preview||bodyReady()){
            @switch(id()){
              @case('clock'){<sp-clock-body/>}
              @case('google-calendar'){<sp-calendar-body/>}
              @case('weather'){<sp-weather-body/>}
              @case('system'){<sp-system-body/>}
              @case('battery'){<sp-battery-body/>}
              @case('volume'){<sp-volume-body/>}
              @case('codex'){<sp-usage-body/>}
              @case('bambu-lab'){<sp-printer-body/>}
              @case('spotify'){<sp-spotify-body/>}
              @case('ruter'){<sp-departures-body/>}
              @case('news'){<sp-news-body/>}
              @case('reddit'){<sp-reddit-body/>}
              @case('email'){<sp-inbox-body/>}
              @case('discord'){<sp-discord-body/>}
              @case('notes'){<sp-notes-body/>}
              @case('idle-game'){<sp-scrapbots-body (play)="play.emit()"/>}
              @default{<sp-preview-body/>}
            }
          } @else if(state().status==='loading'){
            <div class="widget-state loading"><mat-spinner diameter="40" strokeWidth="4" aria-label="Loading"/><p class="body-medium">Finding the latest for you…</p></div>
          } @else {
            <div class="widget-state">
              <span class="blob"><sp-icon [name]="stateIcon()"/></span>
              <h3 class="title-large">{{state().title}}</h3>
              @if(state().detail){<p class="body-medium">{{state().detail}}</p>}
              @if(state().status==='disconnected'){<button matButton="filled" (click)="manage.emit()"><sp-icon name="link"/>Set up</button>}
              @else if(state().status!=='empty'){<button matButton="tonal" (click)="refresh()"><sp-icon name="refresh"/>Try again</button>}
            </div>
          }
          @if(controlError()){<p class="control-error body-small" role="alert">{{controlError()}}</p>}
        </div>
      </div>
      <div class="actions">
        @if(hasSettings()){<button matIconButton [matTooltip]="definition().name+' settings'" [attr.aria-label]="definition().name+' settings'" (click)="manage.emit()"><sp-icon name="tune"/></button>}
        @if(canExpand()){<button matIconButton [matTooltip]="'Expand '+definition().name" [attr.aria-label]="'Expand '+definition().name" (click)="expand.emit()"><sp-icon name="open_in_full"/></button>}
      </div>
    </section>`,
  styleUrl:'./widget-frame.scss',
  providers:[{provide:WidgetContext,useExisting:WidgetFrame}]
})
export class WidgetFrame extends WidgetContext implements OnInit,AfterViewInit,OnDestroy {
  readonly id=input('clock');
  readonly scale=input(1);
  readonly canExpand=input(true);
  readonly canManage=input(true);
  readonly manage=output<void>();
  readonly play=output<void>();
  readonly expand=output<void>();

  private readonly bridge=inject(Bridge);
  private readonly container=viewChild.required<ElementRef<HTMLElement>>('container');

  readonly definition=computed(()=>widgetDefinition(this.id()));
  readonly role=computed(()=>categoryRole(this.definition().category));
  readonly radius=computed(()=>categoryShape(this.definition().category).map(m=>`calc(var(--shape-xl-increased) * ${m})`).join(' '));
  readonly state=signal<ServiceState>({status:'loading',title:'',detail:''});
  readonly now=signal(new Date());
  readonly fit=signal(1);
  readonly layoutWidth=signal(240);
  readonly capacityHeight=signal(240);
  readonly bodyHeight=signal(240);
  readonly compact=signal(false);
  readonly short=signal(false);
  readonly narrow=signal(false);
  readonly spacious=signal(false);
  readonly controlError=signal('');
  readonly live=computed(()=>!this.definition().preview&&!this.definition().retired&&!['notes','idle-game'].includes(this.id()));
  readonly bodyReady=computed(()=>selfContained.includes(this.id())||this.state().status==='ready');
  readonly hasSettings=computed(()=>this.canManage()&&!this.definition().preview&&!this.definition().retired);
  readonly statusLabel=computed(()=>this.definition().preview?'Preview':this.definition().retired?'Retired':this.state().status==='ready'?'Live':this.state().status==='loading'&&!selfContained.includes(this.id())?'loading':this.state().status);
  readonly stateIcon=computed(()=>({disconnected:'link_off',offline:'cloud_off',error:'error',empty:this.definition().icon} as Record<string,string>)[this.state().status]??this.definition().icon);

  private timer?:ReturnType<typeof setInterval>;
  private observer?:ResizeObserver;
  private ticks=0;
  private measureVersion=0;
  private readonly unsubscribe=this.bridge.listen(e=>{if(e.event==='connections'&&this.live())void this.refresh();});

  constructor(){super();effect(()=>{this.scale();requestAnimationFrame(()=>this.measure());});}

  ngOnInit(){
    if(this.live())void this.refresh();
    else if(!this.definition().retired&&!this.definition().preview)this.state.set({status:'ready',title:this.definition().name,detail:'Saved on this PC'});
    this.timer=setInterval(()=>{
      this.now.set(new Date());this.ticks++;
      if(this.live()&&this.id()!=='clock'&&this.ticks%refreshSeconds(this.id())===0)void this.refresh();
    },1000);
  }
  ngAfterViewInit(){this.observer=new ResizeObserver(()=>this.measure());this.observer.observe(this.container().nativeElement);}
  ngOnDestroy(){this.unsubscribe();clearInterval(this.timer);this.observer?.disconnect();}

  async refresh(){
    try{this.state.set(await this.bridge.call<ServiceState>('service',{service:this.id()}));}
    catch(e){this.state.set({status:'error',title:'Could not refresh',detail:(e as Error).message});}
    requestAnimationFrame(()=>this.measure());
  }

  /**
   * Content lays out at the user's widget scale. If the tile is too small for that, only
   * the rendered content shrinks (down to 55%), so a widget never scrolls or clips.
   */
  private measure(){
    const container=this.container()?.nativeElement;if(!container)return;
    const scale=Math.max(.75,Math.min(3,this.scale()));
    const pixelWidth=container.clientWidth,pixelHeight=container.clientHeight;
    if(pixelWidth<=0||pixelHeight<=0)return;
    const version=++this.measureVersion,width=pixelWidth/scale,height=pixelHeight/scale;
    this.fit.set(scale);this.layoutWidth.set(width);this.capacityHeight.set(height);this.bodyHeight.set(height);
    this.short.set(height<220);this.narrow.set(width<220);
    this.compact.set(height<220||width<220);
    this.spacious.set(height>=420&&width>=440);
    requestAnimationFrame(()=>{
      if(version!==this.measureVersion||!container.isConnected||container.clientWidth!==pixelWidth||container.clientHeight!==pixelHeight)return;
      this.fitOverflow(container,pixelWidth,pixelHeight);
    });
  }
  private fitOverflow(container:HTMLElement,pixelWidth:number,pixelHeight:number){
    const currentScale=this.fit();if(currentScale<=0)return;
    const ratio=Math.min(1,pixelWidth/Math.max(pixelWidth,container.scrollWidth),pixelHeight/Math.max(pixelHeight,container.scrollHeight));
    const effective=ratio<.995?Math.max(.55,currentScale*ratio*.99):currentScale;
    if(effective>=currentScale-.005)return;
    this.fit.set(effective);this.bodyHeight.set(pixelHeight/effective);
  }

  // Shared helpers for bodies.
  contentLimit(id=this.id()){return widgetContentLimit(id,this.layoutWidth(),this.capacityHeight());}
  metric(key:string){return Number(this.state().data?.[key]??0);}
  items(limit=this.contentLimit()){return this.state().items?.slice(0,limit)??[];}
  external(url?:string){if(url)void this.bridge.call('external',{url});}
  async control(command:string,payload:unknown){
    this.controlError.set('');
    try{this.state.set(await this.bridge.call<ServiceState>(command,payload));}
    catch(e){this.controlError.set((e as Error).message);}
  }
}
