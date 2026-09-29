import {ChangeDetectionStrategy,Component,computed,effect,inject,signal} from '@angular/core';
import {ServiceItem} from '../../../domain';
import {lineKind,siden} from '../../../widget-format';
import {WidgetContext} from '../context';
import {OdoComponent,ago,clockTime,compact,flashSet,onChange,slotList} from '../motion';

const text=(item:ServiceItem,key:string)=>typeof item[key]==='string'?item[key] as string:'';
const num=(item:ServiceItem,key:string)=>typeof item[key]==='number'?item[key] as number:NaN;

interface Departure {key:string;line:string;dest:string;kind:'bus'|'tram'|'train';mode:string;minutes:number;at:number;platform:string;delay:number;}
const modeLabel:Record<string,string>={bus:'Bus',coach:'Coach',tram:'Tram',rail:'Train',metro:'Metro',water:'Ferry',air:'Flight'};

/** Ruter: the next departure is a hero with a live approach track; the rest make room as it leaves. */
@Component({
  selector:'sp-departures-body',
  changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[OdoComponent],
  template:`
    <div class="spread"><span class="eyebrow"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M12 5h6.5l2 2.5-2 2.5H12M12 12H5.5l-2 2.5 2 2.5H12"></path></svg>{{w.state().title}}</span><span class="chip"><span class="dot live"></span>Live</span></div>
    @if(hero();as h){
      <div class="ru-hero">
        <div class="ru-hero-in">
          <div class="spread">
            <div style="display: flex; align-items: center; gap: 12px; min-width: 0">
              <span class="ru-line" [class]="'ru-line '+h.kind">{{h.line}}</span>
              <div style="min-width: 0"><div class="ru-dest clip">{{h.dest}}</div><div class="ru-sub">{{h.sub}}</div></div>
            </div>
            @if(h.minutes<=0){<span class="ru-now">Nå</span>}
            @else{<span class="ru-due" role="img" [attr.aria-label]="h.minutes+' minutes'"><sp-odo [value]="h.minutes"/><small>min</small></span>}
          </div>
          <div class="ru-track" aria-hidden="true">
            <span class="ru-stop" style="left: 0%"></span><span class="ru-stop" style="left: 33%"></span><span class="ru-stop" style="left: 66%"></span><span class="ru-stop you" style="left: 100%"></span>
            <span class="ru-bus" [style.left.%]="h.position"><svg class="ic" viewBox="0 0 24 24"><path d="M6.5 3.5h11a2 2 0 0 1 2 2v11h-15v-11a2 2 0 0 1 2-2zM4.5 11h15M7.5 20v-3.5M16.5 20v-3.5"></path></svg></span>
          </div>
        </div>
      </div>
    }
    <div class="ru-list-h"><span>Next from here</span><span>{{clock()}}</span></div>
    <div class="slots fade" role="list">
      @for(row of rows();track row.key){
        <div class="slot ru-row" role="listitem" [class]="row.cls" [style.top.px]="row.y">
          <div class="card"><span [class]="'ru-line '+row.kind">{{row.line}}</span><span class="ru-dest">{{row.dest}}</span><span class="ru-time">@if(row.delay>0){<span class="ru-late">+{{row.delay}}</span>}{{row.due}}</span></div>
        </div>
      }
    </div>`,
  styleUrl:'./body.scss'
})
export class DeparturesBody {
  readonly w=inject(WidgetContext);
  readonly clock=computed(()=>clockTime(this.w.now()));
  private readonly late=flashSet(1400);
  readonly departures=computed<Departure[]>(()=>{
    const base=this.w.receivedAt(),elapsed=Math.floor((this.w.now().getTime()-base)/60000);
    return (this.w.state().items??[]).map((item,i)=>{
      const [line='',dest='']=item.title.split(' · '),mode=text(item,'mode'),at=Date.parse(text(item,'time'));
      const given=num(item,'minutes'),parsed=parseInt(item.detail),minutes=Number.isFinite(at)?Math.max(0,Math.ceil((at-this.w.now().getTime())/60000)):Math.max(0,(Number.isFinite(given)?given:Number.isFinite(parsed)?parsed:0)-elapsed);
      return {key:text(item,'id')||item.title+'|'+(Number.isFinite(at)?at:i),line:text(item,'line')||line,dest:text(item,'destination')||dest,kind:lineKind(mode),mode,minutes,at:Number.isFinite(at)?at:base+minutes*60000,platform:text(item,'platform'),delay:Math.max(0,Math.round(num(item,'delay'))||0)};
    }).sort((a,b)=>a.minutes-b.minutes);
  });
  readonly hero=computed(()=>{
    const h=this.departures()[0];if(!h)return null;
    const sub=[modeLabel[h.mode]??'Bus',h.platform?(h.kind==='train'?'Track ':'Platform ')+h.platform:''].filter(Boolean).join(' · ');
    return {...h,sub,position:((1-Math.min(h.minutes,8)/8)*100).toFixed(1)};
  });
  private readonly rest=computed(()=>this.departures().slice(1));
  private readonly slots=slotList(()=>this.rest(),d=>d.key,{fresh:1400,gone:900});
  readonly rows=computed(()=>{
    const hero=this.hero()?.key,late=this.late.keys();
    return this.slots().map(s=>{
      const d=s.item,due=d.minutes>=15?clockTime(d.at):d.minutes<=0?'Nå':d.minutes+' min';
      // The departure that just became the hero rises out of the list.
      const y=s.gone&&s.key===hero?-56:s.rank*56;
      return {key:s.key,y,line:d.line,kind:d.kind,dest:d.dest,delay:d.delay,due,cls:['slot ru-row',s.gone||s.key===hero?'gone':'',s.fresh?'fresh':'',late.has(s.key)?'late':''].filter(Boolean).join(' ')};
    });
  });
  constructor(){
    onChange(()=>this.hero()?.key??'',(_,before)=>{if(before&&!this.departures().some(d=>d.key===before))this.w.fire('depart',1150);});
    onChange(()=>this.departures().map(d=>[d.key,d.delay] as const),(now,before)=>{
      const worse=now.filter(([key,delay])=>delay>(before.find(b=>b[0]===key)?.[1]??delay));
      if(worse.length){worse.forEach(([key])=>this.late.mark(key));this.w.fire('delay',1400);}
    });
  }
}

interface Story {key:string;title:string;kicker:string;published:number;url?:string;}

/** VG News: editorial, with condensed headlines, outlined numerals and a breaking ribbon. */
@Component({
  selector:'sp-news-body',
  changeDetection:ChangeDetectionStrategy.OnPush,
  template:`
    <div class="nw-top">
      <span class="eyebrow"><span class="nw-mark">VG</span>Siste nytt</span>
      <span class="chip"><span class="dot live"></span>Live</span>
      <div class="nw-ribbon" aria-hidden="true"><span class="dot"></span>SISTE NYTT</div>
    </div>
    @if(lead();as story){
      <a class="nw-lead" [attr.href]="story.url" (click)="open($event,story.url)" style="color: inherit; text-decoration: none">
        <span class="nw-kicker">{{story.kicker}}</span>
        <span class="nw-headline">{{story.title}}</span>
        <span class="nw-meta"><span>{{when(story.published)}}</span></span>
      </a>
    }
    <div class="slots fade" role="list">
      @for(row of rows();track row.key){
        <div class="slot nw-row" role="listitem" [class]="row.cls" [style.top.px]="row.y">
          <a class="card" [attr.href]="row.url" (click)="open($event,row.url)" style="color: inherit; text-decoration: none"><span class="nw-num">{{row.num}}</span><div style="min-width: 0"><strong>{{row.title}}</strong><span>{{row.kicker}} · {{row.ago}}</span></div></a>
        </div>
      }
    </div>`,
  styleUrl:'./body.scss'
})
export class NewsBody {
  readonly w=inject(WidgetContext);
  readonly stories=computed<Story[]>(()=>(this.w.state().items??[]).map((item,i)=>{
    const published=Date.parse(text(item,'published'));
    return {key:item.url||item.title,title:item.title,kicker:(text(item,'category')||'Nyheter').toUpperCase(),published:Number.isFinite(published)?published:this.w.receivedAt()-i*60000,url:item.url};
  }).sort((a,b)=>b.published-a.published));
  readonly lead=computed(()=>this.stories()[0]);
  /** Three stories under the lead as designed; a taller tile shows more. */
  private readonly fits=computed(()=>Math.max(3,Math.min(7,Math.floor((this.w.capacityHeight()-286)/76))));
  private readonly slots=slotList(()=>this.stories().slice(1,1+this.fits()),s=>s.key,{fresh:2200,gone:900});
  readonly rows=computed(()=>{const now=this.w.now().getTime();return this.slots().map(s=>({key:s.key,url:s.item.url,num:s.rank+2,title:s.item.title,kicker:s.item.kicker,ago:siden(s.item.published,now),y:s.rank*76,cls:['slot nw-row',s.gone?'gone':'',s.fresh?'fresh':''].filter(Boolean).join(' ')}));});
  when(published:number){return siden(published,this.w.now().getTime());}
  open(event:Event,url?:string){event.preventDefault();this.w.external(url);}
  constructor(){onChange(()=>this.lead()?.key??'',(now,before)=>{if(now&&before)this.w.fire('breaking',3300);});}
}

interface Post {key:string;title:string;score:number;created:number;url?:string;}

/** Reddit: rank is position, so a rising post climbs past the others. */
@Component({
  selector:'sp-reddit-body',
  changeDetection:ChangeDetectionStrategy.OnPush,
  template:`
    <div class="spread"><span class="eyebrow"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v10H9.5L5 19z"></path></svg>{{w.state().title}} · Hot</span><span class="chip" [class.hi]="rising().size>0">{{rising().size>0?'Rising fast':'Top today'}}</span></div>
    <div class="slots fade" role="list">
      @for(row of rows();track row.key){
        <div class="slot rd-row" role="listitem" [class]="row.cls" [style.top.px]="row.y">
          <a class="card" [attr.href]="row.url" (click)="open($event,row.url)" style="color: inherit; text-decoration: none">
            <span class="rd-vote"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.5 19 12h-4.2v7.5H9.2V12H5z"></path></svg>{{row.votes}}</span>
            <span style="min-width: 0"><strong>{{row.title}}</strong><span>{{row.age}}</span></span>
          </a>
        </div>
      }
    </div>`,
  styleUrl:'./body.scss'
})
export class RedditBody {
  readonly w=inject(WidgetContext);
  private readonly flash=flashSet(3200);
  readonly rising=this.flash.keys;
  readonly posts=computed<Post[]>(()=>(this.w.state().items??[]).map(item=>{
    const score=num(item,'score'),created=num(item,'created');
    return {key:item.url||item.title,title:item.title,score:Number.isFinite(score)?score:parseInt(item.detail)||0,created:Number.isFinite(created)?created*1000:NaN,url:item.url};
  }).sort((a,b)=>b.score-a.score));
  private readonly slots=slotList(()=>this.posts(),p=>p.key,{fresh:1400,gone:900});
  readonly rows=computed(()=>{const now=this.w.now().getTime(),rising=this.rising();return this.slots().map(s=>({key:s.key,url:s.item.url,title:s.item.title,votes:compact(s.item.score),age:ago(s.item.created,now),y:s.rank*62,cls:['slot rd-row',s.gone?'gone':'',rising.has(s.key)?'rising':''].filter(Boolean).join(' ')}));});
  open(event:Event,url?:string){event.preventDefault();this.w.external(url);}
  constructor(){
    onChange(()=>this.posts().map(p=>p.key),(now,before)=>{
      const climbed=now.filter((key,rank)=>{const was=before.indexOf(key);return was>rank;});
      if(climbed.length){climbed.forEach(key=>this.flash.mark(key));this.w.fire('rise',3200);}
    });
  }
}

interface Message {key:string;from:string;subject:string;at:number;url?:string;unread:boolean;}

/** Inbox: the count rolls, new mail drops in, and zero is a small celebration. */
@Component({
  selector:'sp-inbox-body',
  changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[OdoComponent],
  template:`
    <div class="ib-head">
      <span class="ib-count hero" role="img" [attr.aria-label]="count()+' unread'"><sp-odo [value]="count()"/></span>
      <div class="ib-lbl"><strong>Unread</strong><span>{{source()}}</span></div>
      <span class="ib-env" aria-hidden="true"><svg class="ic" viewBox="0 0 24 24"><path d="M4 6.5h16v11H4zM4 7l8 6 8-6"></path></svg></span>
    </div>
    <div style="position: relative; flex: 1; min-height: 0; display: flex">
      <div class="slots fade" role="list">
        @for(row of rows();track row.key){
          <div class="slot ib-row" role="listitem" [class]="row.cls" [style.top.px]="row.y">
            <a class="card" [attr.href]="row.url" (click)="open($event,row.url)" style="color: inherit; text-decoration: none"><span class="ib-av">{{row.initial}}</span><span style="min-width: 0"><strong>{{row.from}}</strong><span>{{row.subject}}</span></span><span class="ib-time">{{row.time}}</span></a>
          </div>
        }
      </div>
      <div class="ib-zero"><b><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"></path></svg></b>All caught up<span>Nothing waiting for you</span><span class="burst" [class.go]="celebrate()"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span></div>
    </div>`,
  styleUrl:'./body.scss'
})
export class InboxBody {
  readonly w=inject(WidgetContext);
  readonly celebrate=signal(false);
  readonly messages=computed<Message[]>(()=>(this.w.state().items??[]).map(item=>{
    const at=Date.parse(text(item,'time')),from=text(item,'from')||item.detail.split(' · ')[0].replace(/\s*<.*>$/,'').replace(/^"|"$/g,'');
    return {key:item.url||item.title+'|'+from,from:from||'Unknown sender',subject:item.title||'No subject',at,url:item.url,unread:item['unread']!==false};
  }));
  readonly count=computed(()=>{const n=this.w.state().data?.['count'];return typeof n==='number'?n:this.messages().filter(m=>m.unread).length;});
  readonly source=computed(()=>String(this.w.state().data?.['source']||this.w.state().detail));
  /** Four rows as designed; a taller tile shows as many as fit. */
  private readonly fits=computed(()=>Math.max(4,Math.floor((this.w.capacityHeight()-100)/52)+1));
  private readonly slots=slotList(()=>this.messages().slice(0,this.fits()),m=>m.key,{fresh:1400,gone:900});
  readonly rows=computed(()=>{const today=this.w.now().toDateString();return this.slots().map(s=>{
    const m=s.item,d=new Date(m.at),time=!Number.isFinite(m.at)?'':d.toDateString()===today?clockTime(d):d.toLocaleDateString('en-GB',{weekday:'short'});
    return {key:s.key,url:m.url,from:m.from,subject:m.subject,time,initial:m.from.charAt(0).toUpperCase(),y:Math.min(s.rank,this.fits()-1)*52,cls:['slot ib-row',m.unread?'unread':'',s.gone?'gone':'',s.fresh?'fresh':''].filter(Boolean).join(' ')};
  });});
  open(event:Event,url?:string){event.preventDefault();this.w.external(url);}
  constructor(){
    effect(()=>this.w.cardClass.set(this.count()===0?'zero':''));
    onChange(()=>this.count(),(now,before)=>{
      if(now===0&&before>0){this.w.fire('read',1800);this.celebrate.set(true);setTimeout(()=>this.celebrate.set(false),1200);}
      else if(now>before)this.w.fire('new',1300);
    });
  }
}

interface Member {key:string;name:string;state:string;}

/** Discord: who is here, at a glance; in a call, your mute and deafen are one tap away. */
@Component({
  selector:'sp-discord-body',
  changeDetection:ChangeDetectionStrategy.OnPush,
  template:`
    <div class="dz-toast" aria-live="polite"><i>{{toast().charAt(0)}}</i>{{toast()}}</div>
    <div style="display: flex; align-items: center; gap: 12px; min-width: 0">
      <span class="dz-server" aria-hidden="true">{{initials()}}</span>
      <div style="min-width: 0"><div class="dz-name clip">{{server()}}</div><div class="dz-ch">{{voice()?'Connected to voice':w.state().detail}}</div></div>
    </div>
    <div class="dz-voice">
      <div class="dz-vh"><span><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.5 9a4.2 4.2 0 0 1 0 6"></path></svg>{{voice()?w.state().title:'Online now'}}</span><em>{{members().length}} {{voice()?'in voice':'online'}}</em></div>
      <div class="dz-avs">
        @for(m of shown();track m.key){
          <span class="dz-av" [class]="m.cls" [title]="m.name" [attr.aria-label]="m.aria">{{m.name.charAt(0).toUpperCase()}}<b><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5.5a3 3 0 0 1 6 0v5M15 13a3 3 0 0 1-5.6 1.4M6 11a6 6 0 0 0 10.4 4.1M12 18v3M4 4l16 16"></path></svg></b></span>
        }
      </div>
    </div>
    @if(voice()){
      <div class="dz-ctl">
        <button class="btn tonal" type="button" [attr.aria-pressed]="muted()" (click)="w.control('discord-voice',{muted:!muted()})"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a3 3 0 0 0-3 3v5.5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"></path></svg>{{muted()?'Unmute':'Mute'}}</button>
        <button class="btn tonal" type="button" [attr.aria-pressed]="deafened()" (click)="w.control('discord-voice',{deafened:!deafened()})"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 15v-3a8 8 0 0 1 16 0v3M4 15h3v5H5.5A1.5 1.5 0 0 1 4 18.5zM20 15h-3v5h1.5a1.5 1.5 0 0 0 1.5-1.5z"></path></svg>{{deafened()?'Undeafen':'Deafen'}}</button>
      </div>
    }`,
  styleUrl:'./body.scss'
})
export class DiscordBody {
  readonly w=inject(WidgetContext);
  readonly toast=signal('');
  private readonly joined=flashSet(1000);
  readonly voice=computed(()=>!!this.w.state().data?.['voice']);
  readonly muted=computed(()=>!!this.w.state().data?.['muted']);
  readonly deafened=computed(()=>!!this.w.state().data?.['deafened']);
  /** In a call the header names the server; the panel below names the channel. */
  readonly server=computed(()=>String(this.w.state().data?.['server']||this.w.state().title));
  readonly initials=computed(()=>this.server().split(/\s+/).filter(Boolean).slice(0,2).map(s=>s.charAt(0).toUpperCase()).join('')||'D');
  readonly members=computed<Member[]>(()=>(this.w.state().items??[]).map((item,i)=>({key:text(item,'id')||item.title+'|'+i,name:item.title,state:item.detail})));
  readonly shown=computed(()=>{const fresh=this.joined.keys();return this.members().slice(0,5).map((m,i)=>{
    const quiet=/muted|deafened/i.test(m.state);
    return {key:m.key,name:m.name,cls:['dz-av','a'+(i%5),quiet?'mic-off':'',fresh.has(m.key)?'fresh':''].filter(Boolean).join(' '),aria:m.name+(quiet?', '+m.state.toLowerCase():'')};
  });});
  constructor(){
    onChange(()=>this.members().map(m=>m.key),(now,before)=>{
      const arrived=this.members().filter(m=>now.includes(m.key)&&!before.includes(m.key));
      if(arrived.length){arrived.forEach(m=>this.joined.mark(m.key));this.toast.set(arrived[0].name+' joined '+(this.voice()?this.w.state().title:'the server'));this.w.fire('join',2700);}
    });
  }
}
