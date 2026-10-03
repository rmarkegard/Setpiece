import {AfterViewInit,ChangeDetectionStrategy,Component,ElementRef,OnDestroy,computed,effect,inject,signal,viewChild} from '@angular/core';
import {QuotaWindow,Span,flowSeconds,outputName,printStage,quotaSpan,rate,shortChipName,sparkPath} from '../../../widget-format';
import {WidgetContext} from '../context';
import {FitTextDirective} from '../fit-text';
import {OdoComponent,clockTime,onChange} from '../motion';

const HISTORY=24;
interface Reading {key:string;label:string;unit:string;lo:number;hi:number;hot:number;}
const readings:Reading[]=[
  {key:'cpu',label:'CPU',unit:'%',lo:0,hi:100,hot:85},{key:'memory',label:'Memory',unit:'%',lo:0,hi:100,hot:90},
  {key:'gpu',label:'GPU',unit:'%',lo:0,hi:100,hot:85},{key:'temperature',label:'Temp',unit:'°',lo:30,hi:95,hot:75}
];

/** System: four living readings with their recent history; a reading warms in color when it runs hot. */
@Component({
  selector:'sp-system-body',
  changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[OdoComponent,FitTextDirective],
  template:`
    <div class="sy-tiles">
      @for(tile of tiles();track tile.key){
        <div class="sy-tile" [class.hot]="tile.hot" role="img" [attr.aria-label]="tile.aria">
          <span class="sy-label"><span>{{tile.label}}</span><span [spFitText]="tile.sub">{{tile.sub}}</span></span>
          <div class="sy-val hero">@if(tile.value===null){<span class="sy-off">Off</span>}@else{<sp-odo [value]="tile.value"/><small>{{tile.unit}}</small>}</div>
          <div class="sy-spark"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path class="sy-area" [attr.d]="tile.area" [style.d]="'path(\\''+tile.area+'\\')'"></path><path class="sy-line" [attr.d]="tile.line" [style.d]="'path(\\''+tile.line+'\\')'"></path></svg></div>
        </div>
      }
    </div>
    <div class="sy-net">
      <div class="sy-flow-row"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6"></path></svg><span class="sy-flow" [style.animation-duration]="down().seconds+'s'"></span><span class="sy-flow-v">{{down().text}}</span></div>
      <div class="sy-flow-row"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"></path></svg><span class="sy-flow up" [style.animation-duration]="up().seconds+'s'"></span><span class="sy-flow-v">{{up().text}}</span></div>
    </div>`,
  styleUrl:'./body.scss'
})
export class SystemBody {
  readonly w=inject(WidgetContext);
  private sensor(key:string){const n=this.w.state().data?.[key];return typeof n==='number'&&Number.isFinite(n)?n:null;}
  private text(key:string){const n=this.w.state().data?.[key];return typeof n==='string'?n:'';}
  /** Recent history per reading, one sample per refresh. */
  private readonly history=signal<Record<string,number[]>>({});
  private readonly subs=computed(()=>({
    cpu:shortChipName(this.text('cpuName'))||'Processor',
    memory:this.sensor('totalGb')!==null?Math.round(this.sensor('totalGb')!)+' GB':'Installed',
    gpu:shortChipName(this.text('gpuName'))||'Graphics',
    temperature:'CPU package'
  } as Record<string,string>));
  readonly tiles=computed(()=>{
    const history=this.history();
    return readings.map(r=>{
      const raw=this.sensor(r.key),value=raw===null?null:Math.round(raw),past=history[r.key]??[],path=sparkPath(past.length>1?past:[raw??r.lo,raw??r.lo],r.lo,r.hi);
      return {key:r.key,label:r.label,sub:this.subs()[r.key],unit:r.unit,value,hot:value!==null&&value>=r.hot,line:path.line,area:path.area,aria:r.label+' '+(value===null?'off':value+r.unit)};
    });
  });
  readonly down=computed(()=>{const n=this.sensor('download')??0;return {text:rate(n),seconds:flowSeconds(n)};});
  readonly up=computed(()=>{const n=this.sensor('upload')??0;return {text:rate(n),seconds:flowSeconds(n)};});
  constructor(){
    effect(()=>{
      this.w.receivedAt();const data=this.w.state().data??{};
      this.history.update(h=>{const next={...h};for(const r of readings){const v=data[r.key];if(typeof v!=='number')continue;const list=next[r.key]??Array(HISTORY).fill(v);next[r.key]=[...list.slice(-(HISTORY-1)),v];}return next;});
    });
    onChange(()=>this.tiles().filter(t=>t.hot).map(t=>t.key).join(),(hot,before)=>{if(hot.length>before.length)this.w.fire('spike',1800);});
  }
}

/** Battery: a cell that fills; stripes march while charging; the card turns green or warm with the state. */
@Component({
  selector:'sp-battery-body',
  changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[OdoComponent],
  template:`
    <span class="eyebrow"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 8h14a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5h-14A1.5 1.5 0 0 1 2 14.5v-5A1.5 1.5 0 0 1 3.5 8zM21.5 10.5v3"></path></svg>{{eyebrow()}}</span>
    <div>
      <div class="bt-pct hero" role="img" [attr.aria-label]="'Battery '+level()+'%'+(charging()?', charging':'')"><span style="display: inline-flex; align-items: flex-start"><sp-odo [value]="level()"/><small>%</small></span><svg class="ic f bt-bolt" viewBox="0 0 24 24" aria-hidden="true"><path d="M13.2 2.5 5 13.6h6.1L10.2 21.5l8.3-11.2h-6.2z"></path></svg></div>
      <div class="bt-left">{{left()}}</div>
    </div>
    <div class="bt-cellwrap" aria-hidden="true">
      <div class="bt-cell"><div class="bt-fill" [style.width.%]="level()"></div><div class="bt-seg"><i></i><i></i><i></i><i></i><i></i></div></div>
      <span class="bt-nub"></span>
    </div>`,
  styleUrl:'./body.scss'
})
export class BatteryBody {
  readonly w=inject(WidgetContext);
  readonly level=computed(()=>Math.round(this.w.metric('level')||parseInt(this.w.state().title)||0));
  readonly charging=computed(()=>!!this.w.state().data?.['charging']);
  readonly plugged=computed(()=>!!this.w.state().data?.['plugged']||this.charging());
  readonly low=computed(()=>this.level()<20&&!this.plugged());
  readonly eyebrow=computed(()=>this.charging()?'Charging':this.plugged()?'Plugged in':this.low()?(this.w.state().data?.['saver']?'Battery saver is on':'Battery low'):'On battery');
  readonly left=computed(()=>{
    if(this.plugged())return this.level()>=100?'Fully charged':this.charging()?'Charging from the wall':'Connected to power';
    const seconds=this.w.metric('remaining');if(!(seconds>0))return 'Estimating time left';
    const minutes=Math.round(seconds/60);return (minutes>=60?Math.floor(minutes/60)+' h '+(minutes%60)+' min':minutes+' min')+' left';
  });
  constructor(){
    effect(()=>this.w.cardClass.set(this.charging()?'charging':this.low()?'low':''));
    onChange(()=>this.plugged(),plugged=>this.w.fire(plugged?'plug':'unplug',plugged?1100:800));
    onChange(()=>this.low(),low=>{if(low)this.w.fire('low',1500);});
  }
}


/** Volume: an expressive slider with the live signal inside the fill. */
@Component({
  selector:'sp-volume-body',
  changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[OdoComponent],
  template:`
    <span class="eyebrow"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="3" width="12" height="18" rx="3"></rect><circle cx="12" cy="14.5" r="3"></circle><circle cx="12" cy="7.5" r="1"></circle></svg>{{device()}}</span>
    <div class="spread">
      <span class="vo-pct hero" role="img" [attr.aria-label]="'Volume '+level()+'%'+(muted()?', muted':'')"><sp-odo [value]="level()"/><small>%</small></span>
      <button class="vo-mute" type="button" [attr.aria-pressed]="muted()" [attr.aria-label]="muted()?'Unmute':'Mute'" (click)="w.control('volume',{muted:!muted()})">
        @if(muted()){<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4zM16 9.5l5 5M21 9.5l-5 5"></path></svg>}
        @else{<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.5 9a4.2 4.2 0 0 1 0 6M18.2 6.3a8 8 0 0 1 0 11.4"></path></svg>}
      </button>
    </div>
    <div class="vo-slider">
      <span class="vo-trackbg" [style.left]="'calc('+level()+'% + 13px)'"></span>
      <span class="vo-fill" [style.width]="'calc('+level()+'% - 4px)'"><span class="vo-meter">@for(bar of bars;track $index){<i></i>}</span></span>
      <span class="vo-handle" [style.left]="'calc('+level()+'% - 4px)'"></span>
      <input class="vo-range" type="range" min="0" max="100" step="1" [value]="level()" aria-label="Output volume" (input)="drag($any($event.target).valueAsNumber)" (change)="commit($any($event.target).valueAsNumber)">
      <span class="vo-focus"></span>
    </div>`,
  styleUrl:'./body.scss'
})
export class VolumeBody implements OnDestroy {
  readonly w=inject(WidgetContext);
  readonly bars=Array(40);
  /** While dragging, the slider follows the pointer; Windows catches up a moment later. */
  private readonly dragging=signal<number|null>(null);
  private send?:ReturnType<typeof setTimeout>;
  readonly level=computed(()=>this.dragging()??Math.round(this.w.metric('level')));
  readonly muted=computed(()=>!!this.w.state().data?.['muted']);
  readonly device=computed(()=>outputName(this.w.state().detail||'Windows output'));
  constructor(){
    // The meter only moves while sound is actually playing.
    effect(()=>this.w.cardClass.set([this.muted()?'muted':'',this.w.metric('peak')<1?'silent':''].filter(Boolean).join(' ')));
    onChange(()=>Math.round(this.w.metric('level')),()=>{if(this.dragging()===null)this.w.fire('level',900);});
    onChange(()=>this.muted(),()=>this.w.fire('mute',900));
  }
  drag(value:number){this.dragging.set(value);clearTimeout(this.send);this.send=setTimeout(()=>void this.w.control('volume',{level:value}),120);}
  commit(value:number){clearTimeout(this.send);void this.w.control('volume',{level:value}).then(()=>this.dragging.set(null));}
  ngOnDestroy(){clearTimeout(this.send);}
}

const spanClass:Record<Span,string>={'5h':'fh',Week:'wk',Month:'mn'};
const spanOrder:Span[]=['5h','Week','Month'];

const allSources=[{key:'claude',name:'Claude'},{key:'codex',name:'Codex'},{key:'go',name:'OpenCode'}];
/** AI usage: a ring per provider; the inner ring is the five-hour window, the outer ones the week and month. */
@Component({
  selector:'sp-usage-body',
  changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[OdoComponent],
  template:`
    <div class="spread"><span class="eyebrow"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9M12 3v9h9A9 9 0 0 0 12 3z"></path></svg>AI usage</span>@if(resetIn()){<span class="chip"><span>5h resets in {{resetIn()}}</span></span>}</div>
    <div class="ai-rings" [style.--ai-n]="providers().length">
      @for(p of providers();track p.key){
        <div class="ai-p" [class]="p.cls" role="img" [attr.aria-label]="p.aria">
          <div class="ai-ring">
            <svg viewBox="0 0 82 82" aria-hidden="true">
              @for(ring of p.rings;track $index){
                <circle class="tr" cx="41" cy="41" [attr.r]="ring.r" [style.opacity]="ring.track"></circle>
                <circle [attr.class]="ring.cls" cx="41" cy="41" [attr.r]="ring.r" pathLength="100" style="stroke-dasharray: 100" [style.stroke-dashoffset]="ring.offset" [style.opacity]="ring.opacity"></circle>
              }
            </svg>
            <div class="ai-c">@if(p.center!==null){<span style="display: inline-flex; align-items: flex-start"><sp-odo [value]="p.center"/><small>%</small></span>}@else{<span>–</span>}</div>
          </div>
          <span class="burst" [class.go]="burst()"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>
          <span class="ai-name">{{p.name}}</span>
          <span class="ai-lines">
            @for(line of p.lines;track line.label){<span class="ai-wk" [class]="line.cls"><i></i><span>{{line.label}} {{line.value}}%</span></span>}
            @empty{<span class="ai-wk" [title]="p.status"><span>{{p.expired?'Sign-in expired':'Not signed in'}}</span></span>}
          </span>
        </div>
      }
    </div>`,
  styleUrl:'./body.scss'
})
export class UsageBody {
  readonly w=inject(WidgetContext);
  readonly burst=signal(false);
  /** The providers you chose to show in the widget settings. */
  private readonly sources=computed(()=>{const hidden=(this.w.state().data?.["hidden"] as string[]|undefined)??[];return allSources.filter(s=>!hidden.includes(s.key));});
  private windows(key:string){
    const list=((this.w.state().data?.[key] as {windows?:QuotaWindow[]})?.windows??[]).map(win=>({win,span:quotaSpan(win)})).filter(x=>x.span) as {win:QuotaWindow;span:Span}[];
    return spanOrder.map(span=>list.find(x=>x.span===span)).filter(x=>!!x) as {win:QuotaWindow;span:Span}[];
  }
  readonly providers=computed(()=>this.sources().map(s=>{
    const list=this.windows(s.key),hot=list.some(x=>x.win.used>=90),three=list.length===3;
    // Rings from the outside in: month (or week), week, then the five hours.
    const radii=[37,28.5,20],outer=list.slice().reverse();
    const rings=radii.map((r,i)=>{const x=outer[i];if(!x)return {r,cls:'',offset:100,opacity:0,track:i<2?1:0};return {r,cls:spanClass[x.span]+(x.win.used>=90?' hot':''),offset:(100-x.win.used).toFixed(1),opacity:x.win.used<1?0:1,track:1};});
    const five=list.find(x=>x.span==='5h');
    const status=String((this.w.state().data?.[s.key] as {status?:string})?.status??'');
    return {key:s.key,name:s.name,status,expired:/expired/i.test(status),rings,center:five?Math.round(five.win.used):null,cls:['ai-p',hot?'hot':'',three?'three':'two'].filter(Boolean).join(' '),
      lines:list.map(x=>({label:x.span,value:Math.round(x.win.used),cls:'ai-wk '+spanClass[x.span]+(x.win.used>=90?' hot':'')})),
      aria:s.name+': '+(list.length?list.map(x=>x.span+' '+Math.round(x.win.used)+'%').join(', '):'not signed in')};
  }));
  /** The soonest five-hour reset among the providers that report one. */
  readonly resetIn=computed(()=>{
    const now=this.w.now().getTime();let soonest=Infinity;
    for(const s of this.sources())for(const x of this.windows(s.key))if(x.span==='5h'){
      const at=typeof x.win.reset==='number'?x.win.reset*1000:Date.parse(x.win.resetText??'');
      if(Number.isFinite(at)&&at>now)soonest=Math.min(soonest,at);
    }
    if(!Number.isFinite(soonest))return '';
    const minutes=Math.max(1,Math.round((soonest-now)/60000));return Math.floor(minutes/60)+'h '+String(minutes%60).padStart(2,'0')+'m';
  });
  constructor(){
    onChange(()=>this.sources().map(s=>this.windows(s.key).map(x=>Math.round(x.win.used))),(now,before)=>{
      const drops=now.some((list,i)=>list[0]!==undefined&&before[i]?.[0]!==undefined&&before[i][0]-list[0]>=20);
      if(drops){this.w.fire('reset',1500);this.burst.set(false);setTimeout(()=>{this.burst.set(true);setTimeout(()=>this.burst.set(false),1200);},30);}
      else if(now.some((list,i)=>list.some((v,j)=>v>=90&&(before[i]?.[j]??0)<90)))this.w.fire('burn',1600);
      else if(now.some((list,i)=>list.some((v,j)=>v-(before[i]?.[j]??v)>=5)))this.w.fire('use',1600);
    });
  }
}

// 3DBenchy in profile: hull with a raised bow, wheelhouse with a slanted front, roof overhang, funnel, windows and hawse hole.
const boat='M12 84 L146 84 Q160 84 168 74 L176 66 Q177 92 158 114 Q146 128 126 130 L42 130 Q22 130 16 114 Z M24 92 h110 v3 h-110 Z M152 94 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0 Z M44 84 L44 44 L116 44 L108 84 Z M52 52 h20 v18 h-20 Z M80 52 h19 v18 h-19 Z M38 44 L38 38 L122 38 L122 44 Z M52 38 L56 16 L70 16 L70 38 Z';

/**
 * Bambu Lab: the printer's own camera whenever a frame exists, shown whole at the frame's shape,
 * with the layer view filling the room below; without a frame, the layer view takes the stage.
 */
@Component({
  selector:'sp-printer-body',
  changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[OdoComponent],
  template:`
    <div class="bb-stage" #stageBox [class.v-cam]="!!image()" [class.v-layers]="!image()" [class.wide]="camera().wide" [class.cam-only]="camera().only&&!!image()" [style.--model-scale]="camera().model">
      @if(image();as src){<div class="bb-cam" [style.aspect-ratio]="ratio()" [style.width.px]="camera().width" [style.height.px]="camera().height"><img [src]="src" alt="Live camera view of the print bed" (load)="measure($event)"></div>}
      <div class="bb-layers" role="img" [attr.aria-label]="stageLabel()">
        <div class="bb-grid"></div>
        <div class="bb-plate"></div>
        <div class="bb-model">
          <svg class="bb-ghost" viewBox="0 12 180 120" aria-hidden="true"><path [attr.d]="boat"></path></svg>
          <div class="bb-fill" [style.height.%]="progress()"><svg viewBox="0 12 180 120" aria-hidden="true"><defs><pattern [attr.id]="patternId" x="0" y="0" width="8" height="2.6" patternUnits="userSpaceOnUse"><rect class="bb-ln" x="0" y="0" width="8" height="1.9"></rect></pattern></defs><path class="bb-solid" [attr.d]="boat"></path><path class="bb-lines" [attr.d]="boat" [style.fill]="'url(#'+patternId+')'"></path></svg></div>
          <div class="bb-shine"><i></i></div>
          <span class="bb-layer" [style.bottom.px]="progress()*1.2"></span>
          <div class="bb-head" [style.bottom.px]="progress()*1.2"><div class="bb-nozzle"><b></b><em></em><s></s></div></div>
        </div>
      </div>
      <div class="bb-stage-top"><span class="chip bb-live"><span class="dot" [class.live]="!!image()" [class.rec]="!!image()"></span>{{image()?'Live':'Camera offline'}}</span></div>
      <div class="bb-check"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path pathLength="1" d="M5 12.5l4.5 4.5L19 7.5"></path></svg></div>
    </div>
    <div class="bb-meta">
      <div class="bb-job"><strong>{{job()}}</strong><span class="eyebrow" style="margin-top: 3px">{{jobLine()}}</span><span class="chip" [class.hi]="stage()==='done'"><span class="dot" [class.live]="stage()==='printing'"></span>{{status()}}</span></div>
      <div class="bb-pct hero"><sp-odo [value]="pct()"/><small>%</small><span class="burst" [class.go]="stage()==='done'&&celebrating()"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span></div>
    </div>
    <div class="bb-bar" role="progressbar" aria-label="Print progress" aria-valuemin="0" aria-valuemax="100" [attr.aria-valuenow]="pct()"><b [style.width]="'calc('+progress()+'% - 2px)'"></b><i [style.opacity]="stage()==='done'?0:1"></i></div>
    <div class="bb-stats">
      <div class="bb-stat"><span>{{stage()==='done'?'Done':'Left'}}</span><b>{{remaining()}}</b></div>
      <div class="bb-stat"><span>Layer</span><b>{{w.metric('layer')}}<small>/{{w.metric('layers')}}</small></b></div>
      <div class="bb-stat" [class.hot]="nozzle()>=150" [class.cool]="nozzle()<150"><span>Nozzle</span><b>{{nozzle()}}°</b></div>
      <div class="bb-stat" [class.hot]="bed()>=40" [class.cool]="bed()<40"><span>Bed</span><b>{{bed()}}°</b></div>
    </div>`,
  styleUrl:'./body.scss'
})
export class PrinterBody implements AfterViewInit,OnDestroy {
  readonly w=inject(WidgetContext);
  private readonly stageBox=viewChild.required<ElementRef<HTMLElement>>('stageBox');
  private readonly stageSize=signal({width:263,height:311});
  private observer?:ResizeObserver;
  /**
   * The camera box keeps the frame's shape in any tile: full width when the stage is tall enough,
   * full height (centred) when it is not, and beside the layer view when the stage is wide.
   */
  readonly camera=computed(()=>{
    const {width,height}=this.stageSize(),[a,b]=this.ratio().split('/').map(Number),r=a/b||16/9;
    // Too little room for both: the camera alone. The layer view's boat scales to the room it has.
    if(height<80){const w=Math.min(width,height*r);return {wide:false,only:true,width:Math.round(w),height:Math.round(w/r),model:.72};}
    if(width-height*r>=140)return {wide:true,only:false,width:Math.round(height*r),height,model:Math.max(.3,Math.min(.72,(height-30)/120))};
    const w=Math.min(width,height*r),left=height-w/r-3;
    return {wide:false,only:left<60,width:Math.round(w),height:Math.round(w/r),model:Math.max(.3,Math.min(.72,(left-30)/120))};
  });
  ngAfterViewInit(){const el=this.stageBox().nativeElement;this.observer=new ResizeObserver(()=>this.stageSize.set({width:el.clientWidth,height:el.clientHeight}));this.observer.observe(el);}
  ngOnDestroy(){this.observer?.disconnect();}
  readonly boat=boat;
  /** Each card needs its own pattern id, or two printers on one page would share a fill. */
  readonly patternId='bbLayerLines'+Math.random().toString(36).slice(2,8);
  /** The camera box takes the frame's own shape once the frame has loaded (the A1 Mini streams 16:9). */
  readonly ratio=signal('16 / 9');
  readonly celebrating=signal(false);
  private readonly finishedAt=signal<number|null>(null);
  readonly image=computed(()=>this.w.state().data?.['image'] as string|undefined);
  readonly stage=computed(()=>printStage(String(this.w.state().data?.['stage']??'')));
  readonly progress=computed(()=>Math.max(0,Math.min(100,this.w.metric('progress'))));
  readonly pct=computed(()=>Math.floor(this.progress()));
  readonly nozzle=computed(()=>Math.round(this.w.metric('nozzle')));
  readonly bed=computed(()=>Math.round(this.w.metric('bed')));
  readonly job=computed(()=>String(this.w.state().data?.['job']||'Print').replace(/\.(gcode|3mf)$/i,''));
  readonly status=computed(()=>({printing:'Printing',paused:'Paused',done:'Finished',failed:'Needs attention',idle:'Idle'})[this.stage()]);
  readonly stageLabel=computed(()=>this.stage()==='done'?'Print finished':'Printing layer '+Math.max(1,this.w.metric('layer'))+' of '+this.w.metric('layers'));
  readonly remaining=computed(()=>{
    if(this.stage()==='done')return clockTime(this.finishedAt()??this.w.receivedAt());
    const m=Math.max(0,Math.round(this.w.metric('minutes')));return m<60?m+'m':Math.floor(m/60)+'h '+String(m%60).padStart(2,'0')+'m';
  });
  readonly jobLine=computed(()=>{
    const filament=String(this.w.state().data?.['filament']??''),stage=this.stage();
    const when=stage==='done'?'done '+clockTime(this.finishedAt()??this.w.receivedAt()):stage==='printing'||stage==='paused'?'ready '+clockTime(this.w.receivedAt()+this.w.metric('minutes')*60000):'';
    return [filament,when].filter(Boolean).join(' · ')||'Bambu Lab A1 Mini';
  });
  constructor(){
    effect(()=>this.w.cardClass.set(this.stage()==='failed'?'paused':this.stage()==='idle'?'done':this.stage()));
    onChange(()=>this.stage(),(stage,before)=>{
      if(stage==='done'){this.finishedAt.set(Date.now());this.w.fire('finish',3400);this.celebrating.set(true);setTimeout(()=>this.celebrating.set(false),3400);}
      else if(stage==='printing'&&(before==='done'||before==='idle'))this.w.fire('restart',900);
      else if(stage==='paused'||before==='paused')this.w.fire('pause',900);
    });
    onChange(()=>!!this.image(),()=>this.w.fire('camera',700));
  }
  measure(event:Event){const img=event.target as HTMLImageElement;if(img.naturalWidth&&img.naturalHeight)this.ratio.set(img.naturalWidth+' / '+img.naturalHeight);}
}
