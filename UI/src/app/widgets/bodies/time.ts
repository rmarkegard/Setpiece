import {ChangeDetectionStrategy,Component,computed,inject} from '@angular/core';
import {DatePipe} from '@angular/common';
import {WidgetContext} from '../context';

@Component({
  selector:'sp-clock-body',
  changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[DatePipe],
  template:`
    <div class="main">
      <span class="eyebrow"><span>{{w.now()|date:(w.compact()?'EEE d MMM':'EEEE d MMMM')}}</span></span>
      <div class="time">
        <span class="hero xl">{{w.now()|date:'HH:mm'}}</span>
        @if(!w.compact()){<span class="seconds">{{w.now()|date:'ss'}}</span>}
      </div>
    </div>
    @if(places().length){
      <div class="places">
        @for(place of places();track place.zone){
          <div class="place"><span class="muted clip">{{place.label}}</span><strong>{{time(place.zone)}}</strong></div>
        }
      </div>
    }`,
  styleUrl:'./body.scss',
  styles:`
    .main{flex:1;display:flex;flex-direction:column;justify-content:space-between;gap:var(--space-2);min-width:0}
    .time{display:flex;align-items:flex-start;gap:var(--space-2)}
    .seconds{font-family:var(--font-brand);font-weight:500;font-size:22px;font-variant-numeric:tabular-nums;color:var(--w-muted);margin-top:.3em}
    :host-context(.spacious) .seconds{font-size:32px}
    /* Wide but short: time on the left, places stacked on the right. */
    :host-context(.short:not(.narrow)){flex-direction:row;align-items:stretch}
    :host-context(.short:not(.narrow)) .places{grid-template-columns:1fr;align-content:center;width:42%}
    .places{display:grid;grid-template-columns:repeat(auto-fit,minmax(92px,1fr));gap:3px}
    .place{display:flex;flex-direction:column;gap:2px;padding:var(--space-2) var(--space-3);background:var(--w-inset);border-radius:var(--shape-xs);min-width:0}
    .place:first-child{border-radius:var(--shape-lg) var(--shape-xs) var(--shape-xs) var(--shape-lg)}
    .place:last-child{border-radius:var(--shape-xs) var(--shape-lg) var(--shape-lg) var(--shape-xs)}
    .place:only-child{border-radius:var(--shape-lg)}
    .place span{font:var(--mat-sys-label-medium)}
    .place strong{font-family:var(--font-brand);font-weight:600;font-stretch:var(--font-hero-stretch);font-size:20px;font-variant-numeric:tabular-nums}
    :host-context(.compact) .places{grid-template-columns:1fr}
    :host-context(.compact) .place{flex-direction:row;justify-content:space-between;align-items:baseline;padding:var(--space-1) var(--space-3)}
    :host-context(.compact) .place strong{font-size:16px}
    :host-context(.compact) .place:first-child{border-radius:var(--shape-lg) var(--shape-lg) var(--shape-xs) var(--shape-xs)}
    :host-context(.compact) .place:last-child{border-radius:var(--shape-xs) var(--shape-xs) var(--shape-lg) var(--shape-lg)}
    :host-context(.compact) .place:only-child{border-radius:var(--shape-lg)}
  `
})
export class ClockBody {
  readonly w=inject(WidgetContext);
  private readonly zones=computed(()=>{
    const data=this.w.state().data;
    const zones=Array.isArray(data?.['zones'])?(data!['zones'] as string[]).slice(0,4):['Europe/Oslo','America/New_York'];
    const labels=Array.isArray(data?.['labels'])?data!['labels'] as string[]:[];
    return zones.map((zone,i)=>({zone,label:labels[i]??zone.split('/').pop()?.replaceAll('_',' ')??zone}));
  });
  readonly places=computed(()=>this.zones().slice(0,this.w.contentLimit()));
  time(zone:string){try{return new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',minute:'2-digit'}).format(this.w.now());}catch{return '--:--';}}
}

@Component({
  selector:'sp-calendar-body',
  changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[DatePipe],
  template:`
    <div class="head">
      <span class="day hero md">{{w.now()|date:'d'}}</span>
      <div class="list-copy"><strong class="title">{{w.now()|date:'EEEE'}}</strong><span>{{w.now()|date:'MMMM yyyy'}}</span></div>
    </div>
    @if(events().length){
      <div class="agenda list grow">
        @for(event of events();track $index){
          <div [title]="event.title+' · '+event.detail">
            <span class="when">{{event.time}}</span>
            <div class="list-copy"><strong class="clip">{{event.title}}</strong>@if(event.rest&&!w.compact()){<span class="clip">{{event.rest}}</span>}</div>
          </div>
        }
      </div>
    } @else {
      <p class="muted push">{{w.state().detail||'Nothing else today. Enjoy the room.'}}</p>
    }`,
  styleUrl:'./body.scss',
  styles:`
    .head{display:flex;align-items:center;gap:var(--space-3)}
    .day{display:grid;place-items:center;min-width:1.6em;height:1.6em;padding:0 .15em;border-radius:var(--shape-lg);background:var(--w-fg);color:var(--w-container);font-size:34px}
    :host-context(.compact) .day{font-size:24px}
    :host-context(.spacious) .day{font-size:44px}
    .when{font-family:var(--font-brand);font-weight:600;font-variant-numeric:tabular-nums;font-size:14px;min-width:3.2em}
  `
})
export class CalendarBody {
  readonly w=inject(WidgetContext);
  readonly events=computed(()=>this.w.items().map(item=>{const [time,...rest]=item.detail.split(' · ');return {title:item.title,detail:item.detail,time,rest:rest.join(' · ')};}));
}
