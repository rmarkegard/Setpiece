import {ChangeDetectionStrategy,Component,computed,effect,inject} from '@angular/core';
import {forecastCurve,weatherSky} from '../../../widget-format';
import {WidgetContext} from '../context';
import {OdoComponent,onChange} from '../motion';

// Two depths of rain: far drops are thin and slow, near drops are longer and quicker.
const rand=(i:number,k:number)=>((Math.sin((i+1)*k)*43758.5453)%1+1)%1;
const drops=Array.from({length:46},(_,i)=>{const near=i%3===0;return {near,x:(rand(i,12.9898)*110-5).toFixed(1),len:Math.round(near?26+rand(i,78.233)*16:12+rand(i,78.233)*10),op:(near?.5+rand(i,3.1)*.3:.22+rand(i,3.1)*.2).toFixed(2),dur:(near?.42+rand(i,9.7)*.14:.7+rand(i,9.7)*.3).toFixed(2),delay:(-rand(i,5.3)*1.2).toFixed(2)};});
const splashes=Array.from({length:9},(_,i)=>({x:(6+((i*37)%88)).toFixed(1),delay:(-(i*.37)%1.3).toFixed(2)}));

/** Weather: a living sky, and the next six hours drawn as one line. The card takes the sky's color. */
@Component({
  selector:'sp-weather-body',
  changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[OdoComponent],
  template:`
    <span class="wx-fx rain" aria-hidden="true">@for(drop of drops;track $index){<i [class]="drop.near?'near':'far'" [style.left.%]="drop.x" [style.height.px]="drop.len" [style.opacity]="drop.op" [style.animation-duration]="drop.dur+'s'" [style.animation-delay]="drop.delay+'s'"></i>}@for(splash of splashes;track $index){<b [style.left.%]="splash.x" [style.animation-delay]="splash.delay+'s'"></b>}</span><span class="wx-fx glow"></span>
    <div class="wx-top">
      <div style="min-width: 0">
        <span class="eyebrow"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.5-5.8-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 15.2 12 21 12 21z"></path><circle cx="12" cy="9.8" r="2.3"></circle></svg>{{w.state().detail}} · {{updated()}}</span>
        <div class="wx-temp hero" role="img" [attr.aria-label]="temp()+' degrees, '+sky().label"><sp-odo [value]="temp()+'°'"/></div>
        <div class="wx-cond"><span class="wx-cond-t" style="font-weight: 650; font-size: 15px; color: inherit">{{sky().label}}</span><span>H {{high()}}° · L {{low()}}° · Wind {{wind()}} km/h</span></div>
      </div>
      <svg class="wx-sky" viewBox="0 0 112 112" aria-hidden="true">
        <g class="g wx-sun">
          <g class="wx-rays"><line x1="90" y1="40" x2="96" y2="40"></line><line x1="82.97" y1="56.97" x2="87.2" y2="61.2"></line><line x1="66" y1="64" x2="66" y2="70"></line><line x1="49.03" y1="56.97" x2="44.8" y2="61.2"></line><line x1="42" y1="40" x2="36" y2="40"></line><line x1="49.03" y1="23.03" x2="44.8" y2="18.8"></line><line x1="66" y1="16" x2="66" y2="10"></line><line x1="82.97" y1="23.03" x2="87.2" y2="18.8"></line></g>
          <circle cx="66" cy="40" r="17"></circle>
        </g>
        <g class="g wx-cloud-back wx-cloud"><circle class="back" cx="30" cy="54" r="10"></circle><circle class="back" cx="43" cy="47" r="13"></circle><rect class="back" x="20" y="52" width="38" height="12" rx="6"></rect></g>
        <g class="g wx-cloud wx-front"><circle cx="46" cy="68" r="14"></circle><circle cx="63" cy="59" r="18"></circle><circle cx="80" cy="69" r="12"></circle><rect x="32" y="67" width="60" height="15" rx="7.5"></rect></g>
        <g class="g wx-drops"><line x1="46" y1="88" x2="43" y2="96"></line><line x1="58" y1="88" x2="55" y2="96"></line><line x1="70" y1="88" x2="67" y2="96"></line><line x1="82" y1="88" x2="79" y2="96"></line></g>
      </svg>
    </div>
    @if(hours().length>1){
      <div class="wx-curve">
        <div class="wx-plot">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path class="wx-area" [attr.d]="curve().area" [style.d]="'path(\\''+curve().area+'\\')'"></path><path class="wx-line" [attr.d]="curve().line" [style.d]="'path(\\''+curve().line+'\\')'"></path></svg>
          @for(pt of curve().pts;track $index){<span class="wx-pt" [class.now]="$first" [style.left.%]="pt[0]" [style.top.%]="pt[1].toFixed(1)"></span>}
        </div>
        <div class="wx-hours">@for(hour of hours();track $index){<div class="wx-hour"><b>{{hour.t}}°</b><span>{{hour.label}}</span></div>}</div>
      </div>
    }`,
  styleUrl:'./body.scss'
})
export class WeatherBody {
  readonly w=inject(WidgetContext);
  readonly drops=drops;
  readonly splashes=splashes;
  readonly sky=computed(()=>weatherSky(this.w.metric('code')));
  readonly temp=computed(()=>Math.round(parseFloat(this.w.state().title)||this.w.metric('temperature')));
  readonly high=computed(()=>Math.round(this.w.metric('high')));
  readonly low=computed(()=>Math.round(this.w.metric('low')));
  readonly wind=computed(()=>Math.round(this.w.metric('wind')));
  readonly hours=computed(()=>(this.w.state().items??[]).slice(0,6).map((item,i)=>{
    const t=Math.round(typeof item['temp']==='number'?item['temp'] as number:parseFloat(item.detail));
    return {t,label:i===0?'Now':item.title.slice(0,2)};
  }).filter(h=>Number.isFinite(h.t)));
  readonly curve=computed(()=>forecastCurve(this.hours().map(h=>h.t)));
  readonly updated=computed(()=>{
    const at=Date.parse(this.w.state().updated??'')||this.w.receivedAt(),minutes=Math.floor((this.w.now().getTime()-at)/60000);
    return minutes<1?'updated just now':minutes<60?'updated '+minutes+' min ago':'updated '+Math.floor(minutes/60)+' h ago';
  });
  constructor(){
    effect(()=>this.w.cardClass.set('cond-'+this.sky().sky));
    onChange(()=>this.sky().label,()=>this.w.fire('change',1300));
  }
}
