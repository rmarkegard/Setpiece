import {ChangeDetectionStrategy,Component,computed,inject,signal} from '@angular/core';
import {eventStart,isoWeek,pad,untilLabel,zoneTime} from '../../../widget-format';
import {WidgetContext} from '../context';
import {OdoComponent,flashSet,onChange,slotList} from '../motion';


/** Clock: the hour is heavy, the minute is light, the colon breathes; each place shows its sun. */
@Component({
  selector:'sp-clock-body',
  changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[OdoComponent],
  template:`
    <div class="ck-main">
      <span class="ck-rip r1"></span><span class="ck-rip r2"></span><span class="ck-rip r3"></span>
      <div class="spread"><span class="eyebrow">{{dateLabel()}}</span><span class="chip"><span>Week {{week()}}</span></span></div>
      <div>
        <div class="ck-time hero" role="img" [attr.aria-label]="hh()+':'+mm()">
          <span class="ck-h"><sp-odo [value]="hh()"/></span>
          <span class="ck-colon">:</span>
          <span class="ck-m"><sp-odo [value]="mm()"/></span>
        </div>
        <div class="ck-secs"><span class="ck-bar"><i [style.animation-delay]="secondsOffset+'s'"></i></span><span class="ck-s">{{ss()}}</span></div>
      </div>
    </div>
    <div class="ck-places">
      @for(place of places();track place.zone){
        <div class="ck-place" [class.day]="place.day" [class.night]="!place.day">
          <svg class="ck-arc" viewBox="0 0 40 24" aria-hidden="true"><path class="hz" d="M1 21H39"></path><path class="arc" d="M4 21A16 16 0 0 1 36 21"></path><circle class="ck-sun" cx="0" cy="0" r="3.6" [style.transform]="'translate('+place.x+'px, '+place.y+'px)'"></circle></svg>
          <div style="min-width: 0"><span class="ck-city clip">{{place.name}}</span><span class="ck-pt">{{place.t}}</span></div>
          <span class="ck-off">{{place.off}}</span>
        </div>
      }
    </div>`,
  styleUrl:'./body.scss'
})
export class ClockBody {
  readonly w=inject(WidgetContext);
  /** The seconds bar is one 60 s animation, started at the right point so it sweeps in step with the clock. */
  readonly secondsOffset=-new Date().getSeconds();
  readonly dateLabel=computed(()=>this.w.now().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'}));
  readonly week=computed(()=>isoWeek(this.w.now()));
  readonly hh=computed(()=>pad(this.w.now().getHours()));
  readonly mm=computed(()=>pad(this.w.now().getMinutes()));
  readonly ss=computed(()=>pad(this.w.now().getSeconds()));
  private readonly zones=computed(()=>{
    const data=this.w.state().data,local=Intl.DateTimeFormat().resolvedOptions().timeZone;
    const zones=Array.isArray(data?.['zones'])?data!['zones'] as string[]:['America/New_York','Asia/Tokyo','Australia/Sydney'];
    const labels=Array.isArray(data?.['labels'])?data!['labels'] as string[]:[];
    // The big clock is already local time, so the places list shows the others.
    return zones.map((zone,i)=>({zone,name:labels[i]??zone.split('/').pop()?.replaceAll('_',' ')??zone})).filter(z=>z.zone!==local).slice(0,3);
  });
  readonly places=computed(()=>{
    const now=this.w.now(),localH=now.getHours()+now.getMinutes()/60;
    return this.zones().map(z=>{
      const {t,h}=zoneTime(z.zone,now);
      let diff=Math.round((h-localH)*2)/2;while(diff>12)diff-=24;while(diff<=-12)diff+=24;
      const day=h>=6&&h<18,f=day?(h-6)/12:((h-18+24)%24)/12,th=Math.PI*(1-f);
      return {zone:z.zone,name:z.name,t,day,off:(diff>0?'+':diff<0?'−':'')+Math.abs(diff)+'h',x:(20+16*Math.cos(th)).toFixed(2),y:(21-16*Math.sin(th)).toFixed(2)};
    });
  });
  constructor(){onChange(()=>this.w.now().getHours(),()=>this.w.fire('chime',2600));}
}

interface CalendarEvent {key:string;title:string;place:string;start:number;}
const ROW=58;

/** Calendar: a tear-off date and an agenda that makes room. Every event carries its own date. */
@Component({
  selector:'sp-calendar-body',
  changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[OdoComponent],
  template:`
    <div class="cal-head">
      <div class="cal-date" aria-hidden="true"><span class="cal-holes"><i></i><i></i></span><span class="cal-dnum">{{w.now().getDate()}}</span></div>
      <div class="cal-dl"><strong>{{weekday()}}</strong><span>{{monthLine()}}</span></div>
    </div>
    <div class="cal-agenda"><span>Coming up</span><span class="cal-count"><sp-odo [value]="events().length"/><span>{{events().length===1?'event':'events'}}</span></span></div>
    <div class="slots fade" role="list">
      @for(row of rows();track row.key){
        <div class="slot cal-row" role="listitem" [class]="row.cls" [style.top.px]="row.y">
          <div class="card cal-card">
            <span class="cal-d" aria-hidden="true"><b>{{row.day}}</b><span>{{row.mon}}</span></span>
            <div class="cal-copy"><strong>{{row.title}}</strong><span>{{row.sub}}</span><i class="cal-strike"></i></div>
            @if(row.chip){<span class="chip cal-chip">{{row.chip}}</span>}
          </div>
        </div>
      }
    </div>`,
  styleUrl:'./body.scss'
})
export class CalendarBody {
  readonly w=inject(WidgetContext);
  readonly weekday=computed(()=>this.w.now().toLocaleDateString('en-GB',{weekday:'long'}));
  readonly monthLine=computed(()=>this.w.now().toLocaleDateString('en-GB',{month:'long',year:'numeric'}));
  readonly events=computed<CalendarEvent[]>(()=>{
    const now=new Date(this.w.receivedAt());
    return (this.w.state().items??[]).map(item=>{
      const start=eventStart(item,now),place=typeof item['place']==='string'?item['place'] as string:item.detail.split(' · ').slice(1).join(' · ');
      // The service's id keeps a moved event the same row; without one, title and time identify it.
      return {key:(typeof item['id']==='string'&&item['id']?item['id'] as string:item.title+'|'+start),title:item.title,place,start};
    }).filter(e=>Number.isFinite(e.start)).sort((a,b)=>a.start-b.start).slice(0,12);
  });
  /** Cancelled events stay in their place, struck through, for a moment before the list closes the gap. */
  private readonly leaving=signal<CalendarEvent[]>([]);
  private readonly shown=computed(()=>[...this.events(),...this.leaving()].sort((a,b)=>a.start-b.start).slice(0,12));
  private readonly slots=slotList(()=>this.shown(),e=>e.key,{fresh:1700,gone:900});
  private readonly struck=flashSet(1600);
  private readonly reminder=flashSet(2600);
  private readonly next=computed(()=>{const now=this.w.now().getTime();return this.events().find(e=>e.start>now);});
  readonly rows=computed(()=>{
    const now=this.w.now(),today=now.toDateString(),next=this.next(),knock=this.reminder.keys(),struck=this.struck.keys(),list=this.shown();
    return this.slots().map(slot=>{
      const e=slot.item,d=new Date(e.start),prev=slot.rank>0&&!slot.gone?list[slot.rank-1]:undefined;
      const same=!!prev&&new Date(prev.start).toDateString()===d.toDateString(),isNext=!slot.gone&&next?.key===e.key;
      const chip=knock.has(e.key)?'Reminder':isNext?untilLabel(e.start-now.getTime()):'';
      const cls=['slot cal-row',e.start<now.getTime()?'past':'',slot.gone?'gone':'',struck.has(e.key)?'strike':'',same?'same':'',d.toDateString()===today?'today':'',isNext?'next':'',slot.fresh?'fresh':'',knock.has(e.key)?'knock':''].filter(Boolean).join(' ');
      return {key:slot.key,cls,y:slot.rank*ROW,day:d.getDate(),mon:d.toLocaleDateString('en-GB',{month:'short'}).toUpperCase(),title:e.title,
        sub:d.toLocaleDateString('en-GB',{weekday:'short'})+' '+pad(d.getHours())+':'+pad(d.getMinutes())+(e.place?' · '+e.place:''),chip};
    });
  });
  constructor(){
    // A new event slides in; a cancelled one is struck out; five minutes before the next one, it knocks.
    onChange(()=>this.events(),(list,before)=>{
      const now=Date.now(),keys=list.map(e=>e.key),was=before.map(e=>e.key);
      if(list.some(e=>!was.includes(e.key)&&e.start>now))this.w.fire('new',1600);
      // An event that disappears before it starts was cancelled: it is struck out, then it leaves.
      const cancelled=before.filter(e=>!keys.includes(e.key)&&e.start>now);
      if(cancelled.length){
        cancelled.forEach(e=>this.struck.mark(e.key));this.leaving.update(l=>[...l,...cancelled]);this.w.fire('cancel',1400);
        setTimeout(()=>this.leaving.update(l=>l.filter(e=>!cancelled.includes(e))),700);
      }
    },(a,b)=>a.map(e=>e.key).join()===b.map(e=>e.key).join());
    onChange(()=>{const n=this.next();return n&&n.start-this.w.now().getTime()<=5*60000?n.key:'';},key=>{if(key){this.reminder.mark(key);this.w.fire('soon',2600);}});
  }
}
