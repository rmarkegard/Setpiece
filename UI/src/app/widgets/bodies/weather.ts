import {ChangeDetectionStrategy,Component,computed,inject} from '@angular/core';
import {DecimalPipe} from '@angular/common';
import {IconComponent} from '../../ui/icon';
import {WidgetContext} from '../context';

/** WMO weather codes to Material Symbols. */
export function weatherSymbol(code:number){return code<2?'sunny':code<4?'partly_cloudy_day':code<50?'foggy':code<70?'rainy':code<80?'weather_snowy':code<95?'rainy':'thunderstorm';}

@Component({
  selector:'sp-weather-body',
  changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[DecimalPipe,IconComponent],
  template:`
    <span class="eyebrow"><sp-icon name="location_on"/><span>{{w.state().detail}}</span></span>
    <div class="now">
      <span class="hero">{{w.state().title}}</span>
      <span class="sky"><sp-icon [name]="symbol()" [filled]="true"/></span>
    </div>
    @if(!w.compact()){
      <div class="chips">
        <span class="chip"><sp-icon name="thermostat"/>Feels {{w.metric('feelsLike')|number:'1.0-0'}}°</span>
        <span class="chip"><sp-icon name="air"/>{{w.metric('wind')|number:'1.0-0'}} km/h</span>
      </div>
    }
    @if(hours().length){
      <div class="forecast push">
        @for(hour of hours();track $index){
          <div><span class="muted">{{hour.time}}</span><strong>{{hour.temp}}</strong>@if(!w.compact()){<small class="muted clip">{{hour.note}}</small>}</div>
        }
      </div>
    }`,
  styleUrl:'./body.scss',
  styles:`
    .now{display:flex;align-items:center;justify-content:space-between;gap:var(--space-3)}
    .sky{display:grid;place-items:center;width:1.5em;height:1.5em;font-size:48px;border-radius:50%;background:var(--w-inset-strong)}
    .sky sp-icon{font-size:.72em}
    :host-context(.compact) .sky{font-size:34px}
    :host-context(.spacious) .sky{font-size:64px}
    .forecast{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:3px}
    .forecast div{display:flex;flex-direction:column;align-items:center;gap:2px;padding:var(--space-2) var(--space-1);background:var(--w-inset);border-radius:var(--shape-xs);min-width:0;font:var(--mat-sys-label-medium)}
    .forecast div:first-child{border-radius:var(--shape-lg) var(--shape-xs) var(--shape-xs) var(--shape-lg)}
    .forecast div:last-child{border-radius:var(--shape-xs) var(--shape-lg) var(--shape-lg) var(--shape-xs)}
    .forecast strong{font-family:var(--font-brand);font-weight:600;font-size:17px;font-variant-numeric:tabular-nums}
    .forecast small{max-width:100%;font:var(--mat-sys-label-small)}
  `
})
export class WeatherBody {
  readonly w=inject(WidgetContext);
  readonly symbol=computed(()=>weatherSymbol(this.w.metric('code')));
  readonly hours=computed(()=>this.w.items().map(item=>{const [temp,note]=item.detail.split(' · ');return {time:item.title,temp:temp.replace(/\.\d/,''),note:note??''};}));
}
