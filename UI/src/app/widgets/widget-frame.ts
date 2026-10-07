import {AfterViewInit,ChangeDetectionStrategy,Component,ElementRef,OnDestroy,OnInit,computed,effect,inject,input,output,signal,untracked,viewChild} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatTooltipModule} from '@angular/material/tooltip';
import {Bridge} from '../../bridge';
import {ServiceState,widgetDefinition} from '../../domain';
import {widgetContentLimit} from '../../widget-layout';
import {widgetFamily,widgetTone} from '../../theme';
import {IconComponent} from '../ui/icon';
import {everySecond,pageShown} from '../state/presence';
import {WIDGET_BODIES} from './bodies';
import {WidgetContext} from './context';

// How often each live widget refreshes, in seconds.
const refreshSeconds=(id:string)=>['system','volume','battery'].includes(id)?2:id==='codex'?60:id==='bambu-lab'?10:['discord','spotify'].includes(id)?5:id==='twitch'?2:30;
// Widgets whose body is always shown: they own their data or have nothing to wait for.
const selfContained=['clock','notes'];
// Widgets whose body is its own empty state (the inbox celebrates zero instead of saying so).
const bodyWhenEmpty=['email'];
// Bodies that count time from each reading (a history sample per reading, minutes since one arrived) take every
// reading; the others skip one that changes nothing.
const timedBodies=['system','ruter','bambu-lab','weather'];
// The offline card counts down to its next attempt.
const retrySeconds=12;

/** The loading shape morphs through these outlines (clip-path polygons), one step at a time. */
const loaderShapes=[
  (t:number)=>.43+.07*Math.cos(4*t),
  (t:number)=>.46+.04*Math.cos(9*t),
  (t:number)=>.5*Math.pow(Math.pow(Math.abs(Math.cos(t)),2.2)+Math.pow(Math.abs(Math.sin(t))*1.35,2.2),-1/2.2),
  (t:number)=>.41+.09*Math.cos(5*t),
  (t:number)=>.47+.03*Math.cos(12*t)
].map(radius=>{
  const points:string[]=[];
  for(let k=0;k<60;k++){const t=k/60*Math.PI*2,r=Math.min(.5,radius(t));points.push((50+100*r*Math.cos(t)).toFixed(2)+'% '+(50+100*r*Math.sin(t)).toFixed(2)+'%');}
  return 'polygon('+points.join(', ')+')';
});

/**
 * How much of the laid-out content fits the card (1 when all of it does). Only content in the flow
 * counts: decorative layers (ripples, rain, event rings) and slotted rows are meant to run past the
 * edge and are clipped by the card.
 */
function contentRatio(container:HTMLElement,zoom:number){
  const inner=container.querySelector<HTMLElement>('.in');if(!inner)return 1;
  const box=inner.getBoundingClientRect(),style=getComputedStyle(inner);let right=box.left,bottom=box.top;
  // Walks the content in the flow. A box that clips (overflow hidden) keeps its content to itself, and
  // slotted lists run under a fade on purpose, so neither is looked into.
  const walk=(el:Element,depth:number)=>{
    for(const child of el.children){
      const css=getComputedStyle(child);
      if(css.display==='none'||css.position==='absolute'||css.position==='fixed')continue;
      if(css.display!=='contents'){const r=child.getBoundingClientRect();if(r.width>0&&r.height>0){right=Math.max(right,r.right);bottom=Math.max(bottom,r.bottom);}}
      if(depth<8&&css.overflow==='visible'&&!child.classList.contains('slots')&&!(child instanceof SVGElement))walk(child,depth+1);
    }
  };
  walk(inner,0);if(bottom<=box.top)return 1;
  // Sideways, parts may bleed into the padding by design (the notes paper does); downwards they may not.
  bottom+=parseFloat(style.paddingBottom)*zoom-.5;
  return Math.min(box.width/Math.max(1,right-box.left),box.height/Math.max(1,bottom-box.top));
}

/**
 * The shell every widget shares. It owns the card (the widget's tone from the accent, the event
 * ring), sizing (fit-to-tile zoom), polling, and the loading, setup, offline, empty and error
 * states. Widget bodies inject it to read state and to play events.
 */
@Component({
  selector:'sp-widget',
  changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[IconComponent,MatButtonModule,MatTooltipModule,...WIDGET_BODIES],
  template:`
    <section [class]="cardClasses()" [attr.aria-label]="definition().name" [attr.data-widget]="id()" [attr.data-category]="definition().category" [attr.data-state]="state().status"
      [class.compact]="compact()" [class.short]="short()" [class.narrow]="narrow()" [class.spacious]="spacious()" [class.resting]="resting()">
      <span class="state-label sr-only" aria-live="polite">{{statusLabel()}}</span>
      <div class="fit-container" #container>
        <div class="fit-content" [style.zoom]="fit()" [style.--body-height]="bodyHeight()+'px'">
          @if(view()==='body'){
            <div class="in">
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
                @case('twitch'){<sp-twitch-body/>}
                @case('notes'){<sp-notes-body/>}
                @default{<sp-preview-body/>}
              }
            </div>
          } @else if(view()==='loading'){
            <div class="in st" style="align-items: center; text-align: center">
              <span class="st-load" [style.clip-path]="loader()" role="img" aria-label="Loading"></span>
              <p style="margin-top: 6px">Finding the latest for you…</p>
              <div class="st-skel" aria-hidden="true"><i></i><i></i><i></i></div>
            </div>
          } @else if(view()==='empty'){
            <div class="in st" style="align-items: center; text-align: center">
              <svg class="st-hz" viewBox="0 0 120 60" aria-hidden="true"><circle class="sun" cx="60" cy="44" r="20"></circle><line x1="10" y1="46" x2="110" y2="46"></line><line x1="30" y1="54" x2="90" y2="54"></line></svg>
              <h3>{{state().title}}</h3>
              @if(state().detail){<p>{{state().detail}}</p>}
            </div>
          } @else {
            <div class="in st">
              <span class="st-blob">
                @switch(view()){
                  @case('setup'){<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 14.5l5-5M8 11 6 13a3.5 3.5 0 0 0 5 5l2-2M16 13l2-2a3.5 3.5 0 0 0-5-5l-2 2M4 4l16 16"></path></svg>}
                  @case('offline'){<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18h10.5a3.5 3.5 0 0 0 .6-6.95A5.5 5.5 0 0 0 8 9.5a4.25 4.25 0 0 0-1 8.5zM4 4l16 16"></path></svg>}
                  @case('retired'){<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"></circle><path d="M6 6l12 12"></path></svg>}
                  @default{<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 21 19.5H3zM12 10v4.5M12 17.2v.3"></path></svg>}
                }
              </span>
              @if(view()==='retired'){
                <h3>This widget has retired</h3>
                <p>{{definition().name}} is no longer available. The tile keeps its place.</p>
                <div><button class="btn filled" type="button" (click)="manage.emit()">Choose another</button></div>
              } @else {
                <h3>{{state().title}}</h3>
                @if(state().detail){<p>{{state().detail}}</p>}
                @switch(view()){
                  @case('setup'){<div><button class="btn filled" type="button" (click)="manage.emit()"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1 1M14 10a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1-1"></path></svg>Set up</button></div>}
                  @case('offline'){
                    <div class="st-retry">
                      <svg class="st-ring" viewBox="0 0 28 28" aria-hidden="true"><circle class="tr" cx="14" cy="14" r="11"></circle><circle class="v" cx="14" cy="14" r="11" pathLength="100" [style.stroke-dasharray]="100" [style.stroke-dashoffset]="retry()/retrySeconds*100"></circle></svg>
                      <span class="eyebrow" style="color: inherit">Retrying in {{retry()}} s</span>
                      <button class="btn tonal" type="button" style="height: 40px; margin-left: auto" (click)="refresh()">Try now</button>
                    </div>
                  }
                  @default{<div><button class="btn tonal" type="button" (click)="refresh()">Try again</button></div>}
                }
              }
            </div>
          }
          @if(controlError()){<p class="control-error" role="alert">{{controlError()}}</p>}
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
  /** On a desk, the host reports the widget covered by an application: it rests until it shows again. */
  readonly resting=input(false);
  readonly manage=output<void>();
  readonly expand=output<void>();

  private readonly bridge=inject(Bridge);
  private readonly container=viewChild.required<ElementRef<HTMLElement>>('container');

  readonly retrySeconds=retrySeconds;
  readonly definition=computed(()=>widgetDefinition(this.id()));
  readonly state=signal<ServiceState>({status:'loading',title:'',detail:''});
  readonly now=signal(new Date());
  readonly receivedAt=signal(Date.now());
  readonly fit=signal(1);
  readonly layoutWidth=signal(240);
  readonly capacityHeight=signal(240);
  readonly bodyHeight=signal(240);
  readonly compact=signal(false);
  readonly short=signal(false);
  readonly narrow=signal(false);
  readonly spacious=signal(false);
  readonly controlError=signal('');
  readonly cardClass=signal('');
  readonly fx=signal('');
  readonly retry=signal(retrySeconds);
  private readonly loaderStep=signal(0);
  readonly loader=computed(()=>loaderShapes[this.loaderStep()%loaderShapes.length]);
  readonly live=computed(()=>!this.definition().preview&&!this.definition().retired&&this.id()!=='notes');
  readonly bodyReady=computed(()=>selfContained.includes(this.id())||this.state().status==='ready'||(this.state().status==='empty'&&bodyWhenEmpty.includes(this.id())));
  readonly view=computed(()=>{
    if(this.definition().retired)return 'retired';
    if(this.definition().preview||this.bodyReady())return 'body';
    const status=this.state().status;
    return status==='loading'?'loading':status==='disconnected'?'setup':status==='offline'?'offline':status==='empty'?'empty':'error';
  });
  /** A live body wears its own tone; every other state wears its family's tone, as on the States board. */
  readonly cardClasses=computed(()=>{
    const body=this.view()==='body',tone=widgetTone(this.id());
    return ['widget sp wg',widgetFamily(this.definition().category),body?tone:'',body?this.cardClass():'',this.fx()?'hit fx-'+this.fx():''].filter(Boolean).join(' ');
  });
  readonly hasSettings=computed(()=>this.canManage()&&!this.definition().preview&&!this.definition().retired);
  readonly statusLabel=computed(()=>this.definition().preview?'Preview':this.definition().retired?'Retired':this.state().status==='ready'?'Live':this.state().status==='loading'&&!selfContained.includes(this.id())?'loading':this.state().status);

  private stopTicking?:()=>void;
  private fxTimers:ReturnType<typeof setTimeout>[]=[];
  private observer?:ResizeObserver;
  private ticks=0;
  private polling=false;
  private measureVersion=0;
  private readonly unsubscribe=this.bridge.listen(e=>{
    if(e.event==='connections'&&this.live())void this.refresh();
    // A service can announce fresh data (the development bridge does), so events play right away.
    // A pushed update (chat) skips a beat rather than queue behind a read already in flight; the next one catches up.
    if(e.event==='service'&&e.data===this.id()&&this.live()&&!this.polling&&this.active())void this.poll();
  });
  /**
   * A widget nobody can see (its page hidden or covered, or its tile under an application) neither ticks nor
   * polls: the host is not asked for data no one sees. Seen again, it catches up at once.
   */
  readonly active=computed(()=>pageShown()&&!this.resting());

  constructor(){
    super();
    effect(()=>{this.scale();requestAnimationFrame(()=>this.measure());});
    // Each state (loading, body, setup…) lays out differently, so it is fitted once it has rendered.
    effect(()=>{this.view();requestAnimationFrame(()=>requestAnimationFrame(()=>this.measure()));});
    // A new body starts with a clean card.
    effect(()=>{this.id();this.cardClass.set('');});
    let wasActive=true;
    effect(()=>{const active=this.active();if(active&&!wasActive)untracked(()=>{this.now.set(new Date());if(this.live()&&this.id()!=='clock'&&!this.polling)void this.poll();});wasActive=active;});
  }

  ngOnInit(){
    if(this.live())void this.refresh();
    else if(!this.definition().retired&&!this.definition().preview)this.state.set({status:'ready',title:this.definition().name,detail:'Saved on this PC'});
    this.stopTicking=everySecond(()=>{
      if(!this.active())return;
      this.now.set(new Date());this.ticks++;
      const view=this.view();
      if(view==='loading')this.loaderStep.update(n=>n+1);
      if(view==='offline'){if(this.retry()<=1){this.retry.set(retrySeconds);void this.poll();}else this.retry.update(n=>n-1);return;}
      if(this.live()&&this.id()!=='clock'&&!this.polling&&this.ticks%refreshSeconds(this.id())===0)void this.poll();
    });
  }
  /** Timed refreshes never overlap: a slow service skips a beat instead of queuing requests. */
  private async poll(){this.polling=true;try{await this.refresh();}finally{this.polling=false;}}
  ngAfterViewInit(){
    this.observer=new ResizeObserver(()=>this.measure());this.observer.observe(this.container().nativeElement);
    // Text laid out in a fallback face can look taller than it is: fit again once the fonts are in.
    void document.fonts?.ready.then(()=>this.measure());
  }
  ngOnDestroy(){this.unsubscribe();this.stopTicking?.();this.fxTimers.forEach(clearTimeout);this.observer?.disconnect();}

  async refresh(){
    let changed:boolean;
    try{changed=this.setState(await this.bridge.call<ServiceState>('service',{service:this.id()}));}
    catch(e){changed=this.setState({status:'error',title:'Could not refresh',detail:(e as Error).message});}
    this.retry.set(retrySeconds);
    if(changed&&this.id()!=='twitch')requestAnimationFrame(()=>this.measure());
  }
  private seen='';
  /**
   * Most readings repeat the last one (chat every couple of seconds, a battery that has not moved); one that
   * changes nothing but its time stamp must not redraw or refit the card. Returns whether the state changed.
   */
  private setState(state:ServiceState){
    if(!timedBodies.includes(this.id())){const seen=JSON.stringify(state,(key,value)=>key==='updated'?undefined:value);if(seen===this.seen)return false;this.seen=seen;}
    this.state.set(state);this.receivedAt.set(Date.now());return true;
  }

  /** Restarts the event: the class comes off, then back on a frame later, so a repeat plays again. */
  fire(kind:string,ms=1600){
    this.fxTimers.forEach(clearTimeout);this.fx.set('');
    this.fxTimers=[setTimeout(()=>{this.fx.set(kind);this.fxTimers.push(setTimeout(()=>this.fx.set(''),ms));},30)];
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
  /**
   * Shrinking widens the layout box in its own units, which can switch a widget's narrow-tile rules
   * off and make it taller again, so the fit is checked again after each step until it holds.
   */
  private fitOverflow(container:HTMLElement,pixelWidth:number,pixelHeight:number,step=0){
    const currentScale=this.fit();if(currentScale<=0)return;
    const ratio=Math.min(1,contentRatio(container,currentScale));
    const effective=ratio<.995?Math.max(.55,currentScale*ratio*.99):currentScale;
    if(effective>=currentScale-.005)return;
    this.fit.set(effective);this.bodyHeight.set(pixelHeight/effective);
    const version=this.measureVersion;
    if(step<4)requestAnimationFrame(()=>requestAnimationFrame(()=>{if(version===this.measureVersion&&container.isConnected)this.fitOverflow(container,pixelWidth,pixelHeight,step+1);}));
  }

  // Shared helpers for bodies.
  contentLimit(id=this.id()){return widgetContentLimit(id,this.layoutWidth(),this.capacityHeight());}
  metric(key:string){return Number(this.state().data?.[key]??0);}
  items(limit=this.contentLimit()){return this.state().items?.slice(0,limit)??[];}
  external(url?:string){if(url)void this.bridge.call('external',{url});}
  async control(command:string,payload:unknown){
    this.controlError.set('');
    try{this.setState(await this.bridge.call<ServiceState>(command,payload));}
    catch(e){this.controlError.set((e as Error).message);}
  }
}
