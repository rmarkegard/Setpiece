import {ChangeDetectionStrategy,Component,ElementRef,computed,effect,inject,signal,viewChild} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {ServiceItem} from '../../../domain';
import {lineKind,siden} from '../../../widget-format';
import {WidgetContext} from '../context';
import {StudioStore} from '../../state/studio-store';
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

interface Member {key:string;name:string;state:string;avatar:string;}
const discordMark='M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.028C.533 9.046-.319 13.58.099 18.058a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.873-1.295 1.226-1.994a.076.076 0 0 0-.042-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .078-.011c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .079.01c.12.099.246.198.373.292a.077.077 0 0 1-.007.128 12.3 12.3 0 0 1-1.873.891.077.077 0 0 0-.041.107c.36.698.772 1.363 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.029zM8.02 15.331c-1.183 0-2.157-1.086-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.332-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.086-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.332-.946 2.418-2.157 2.418z';

/**
 * Discord: who is here, at a glance. In a call the card names the channel and its server, lists everyone
 * with their avatar and whether they are muted or deafened, and keeps your own mute and deafen one tap away.
 * Following a public server, it lists who is online.
 */
@Component({
  selector:'sp-discord-body',
  changeDetection:ChangeDetectionStrategy.OnPush,
  template:`
    <div class="dz-toast" aria-live="polite"><i>{{toast().charAt(0)}}</i>{{toast()}}</div>
    <div class="dz-head">
      @if(icon()){<img class="dz-server" [src]="icon()" alt="">}@else{<span class="dz-server mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path [attr.d]="mark"></path></svg></span>}
      <div style="min-width: 0">
        <div class="dz-name clip">{{heading()}}</div>
        <div class="dz-ch clip">@if(voice()){<span class="dot live"></span>}{{subline()}}</div>
      </div>
    </div>
    <div class="dz-people" [class.stage]="stage()" [style.--dz-cols]="grid().cols" [style.--dz-rows]="grid().rows" role="list" [attr.aria-label]="voice()?'In this call':'Online now'">
      @for(m of shown();track m.key){
        <div class="dz-person" role="listitem" [class]="m.cls" [attr.aria-label]="m.aria">
          <span class="dz-face">
            <span class="dz-av" [class]="m.hue">@if(m.avatar){<img [src]="m.avatar" alt="" loading="lazy">}@else{{{m.initial}}}</span>
            @if(m.deaf){<svg class="ic dz-state" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 15v-3a8 8 0 0 1 13.7-5.6M20 12v3M4 15h3v5H5.5A1.5 1.5 0 0 1 4 18.5zM17 20h1.5a1.5 1.5 0 0 0 1.5-1.5V15h-3zM4 4l16 16"></path></svg>}
            @else if(m.muted){<svg class="ic dz-state" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5.5a3 3 0 0 1 6 0v5M15 13a3 3 0 0 1-5.6 1.4M6 11a6 6 0 0 0 10.4 4.1M12 18v3M4 4l16 16"></path></svg>}
            @else if(!voice()){<span class="dz-presence" [class]="m.state"></span>}
          </span>
          <span class="dz-who clip">{{m.name}}</span>
        </div>
      } @empty {<p class="dz-empty">{{voice()?'Nobody else is here yet.':'Nobody is online right now.'}}</p>}
      @if(more()>0){<div class="dz-more">+{{more()}} more</div>}
    </div>
    @if(voice()){
      <div class="dz-ctl">
        <button class="btn tonal" type="button" [attr.aria-pressed]="muted()" (click)="w.control('discord-voice',{muted:!muted()})"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true">@if(muted()){<path d="M9 5.5a3 3 0 0 1 6 0v5M15 13a3 3 0 0 1-5.6 1.4M6 11a6 6 0 0 0 10.4 4.1M12 18v3M4 4l16 16"></path>}@else{<path d="M12 3a3 3 0 0 0-3 3v5.5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"></path>}</svg>{{muted()?'Unmute':'Mute'}}</button>
        <button class="btn tonal" type="button" [attr.aria-pressed]="deafened()" (click)="w.control('discord-voice',{deafened:!deafened()})"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true">@if(deafened()){<path d="M4 15v-3a8 8 0 0 1 13.7-5.6M20 12v3M4 15h3v5H5.5A1.5 1.5 0 0 1 4 18.5zM17 20h1.5a1.5 1.5 0 0 0 1.5-1.5V15h-3zM4 4l16 16"></path>}@else{<path d="M4 15v-3a8 8 0 0 1 16 0v3M4 15h3v5H5.5A1.5 1.5 0 0 1 4 18.5zM20 15h-3v5h1.5a1.5 1.5 0 0 0 1.5-1.5z"></path>}</svg>{{deafened()?'Undeafen':'Deafen'}}</button>
      </div>
    }`,
  styleUrl:'./body.scss'
})
export class DiscordBody {
  readonly w=inject(WidgetContext);
  readonly mark=discordMark;
  readonly toast=signal('');
  private readonly joined=flashSet(1000);
  readonly voice=computed(()=>!!this.w.state().data?.['voice']);
  readonly muted=computed(()=>!!this.w.state().data?.['muted']);
  readonly deafened=computed(()=>!!this.w.state().data?.['deafened']);
  readonly icon=computed(()=>String(this.w.state().data?.['icon']||''));
  /** In a call the card names the channel; following a server, the server. */
  readonly heading=computed(()=>this.w.state().title||'Discord');
  readonly subline=computed(()=>{
    const server=String(this.w.state().data?.['server']||''),n=this.members().length;
    return this.voice()?[server,n+' in voice'].filter(Boolean).join(' · '):this.w.state().detail;
  });
  readonly members=computed<Member[]>(()=>(this.w.state().items??[]).map((item,i)=>({key:text(item,'id')||item.title+'|'+i,name:item.title,state:item.detail,avatar:text(item,'avatar')})));
  /** As many people as the tile has room for, in as many 150px columns as fit; the rest are counted. */
  private readonly room=computed(()=>{
    const columns=Math.max(1,Math.floor((this.w.layoutWidth()-56)/150)),rows=Math.max(1,Math.floor((this.w.capacityHeight()-(this.voice()?156:86))/42));
    return Math.max(2,columns*rows);
  });
  readonly more=computed(()=>Math.max(0,this.members().length-this.room()));
  /** A small call fills the panel like Discord's own call view: one large tile per person. */
  readonly stage=computed(()=>this.voice()&&this.members().length>0&&this.members().length<=4);
  /** The arrangement that gives each person the largest tile: side by side in a wide card, stacked in a tall one. */
  readonly grid=computed(()=>{
    const n=Math.max(1,this.members().length),width=Math.max(1,this.w.layoutWidth()-56),height=Math.max(1,this.w.capacityHeight()-160);
    let best={cols:n,rows:1,size:0};
    for(let cols=1;cols<=n;cols++){const rows=Math.ceil(n/cols),size=Math.min(width/cols,height/rows);if(size>best.size+.5)best={cols,rows,size};}
    return {cols:best.cols,rows:best.rows};
  });
  readonly shown=computed(()=>{const fresh=this.joined.keys(),list=this.members(),room=this.room();return list.slice(0,list.length>room?room-1:room).map((m,i)=>{
    const deaf=/deafened/i.test(m.state),muted=deaf||/muted/i.test(m.state);
    return {key:m.key,name:m.name,avatar:m.avatar,initial:m.name.charAt(0).toUpperCase(),deaf,muted,state:m.state.toLowerCase(),hue:'dz-av a'+(i%5),
      cls:['dz-person',muted?'quiet':'',fresh.has(m.key)?'fresh':''].filter(Boolean).join(' '),aria:m.name+(deaf?', deafened':muted?', muted':'')};
  });});
  constructor(){
    onChange(()=>this.members().map(m=>m.key),(now,before)=>{
      const arrived=this.members().filter(m=>now.includes(m.key)&&!before.includes(m.key));
      if(arrived.length){arrived.forEach(m=>this.joined.mark(m.key));this.toast.set(arrived[0].name+' joined '+(this.voice()?this.heading():'the server'));this.w.fire('join',2700);}
    });
  }
}

interface ChatPart {t:string;e?:string;}
interface ChatLine {key:string;name:string;color:string;action:boolean;system:boolean;badge:string;parts:ChatPart[];cls:string;}
const badgeMark:Record<string,string>={broadcaster:'●',moderator:'⚔',vip:'♦',subscriber:'★',founder:'★'};

/**
 * Twitch chat: the latest messages from one channel, newest at the bottom, emotes inline. Click the
 * channel name to switch channels. Signed in (in the widget settings), you can chat from the box below.
 */
@Component({
  selector:'sp-twitch-body',
  changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[FormsModule],
  template:`
    <div class="spread">
      @if(editing()){
        <form class="tw-switch" (ngSubmit)="switchTo()"><span aria-hidden="true">@</span><input #channelInput name="channel" [(ngModel)]="draftChannel" aria-label="Channel to follow" autocomplete="off" spellcheck="false" maxlength="25" (keydown.escape)="editing.set(false)" (blur)="editing.set(false)"></form>
      } @else {
        <button class="eyebrow tw-channel" type="button" [title]="'Switch channel'" (click)="startEditing()"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h15v10.5l-4.5 4.5h-3.5L9.5 21.5V19H5zM11 8.5v4M15.5 8.5v4"></path></svg>{{w.state().title}}</button>
      }
      <span class="chip" [class.hi]="live()"><span class="dot" [class.live]="live()"></span>{{live()?'Live chat':'Connecting'}}</span>
    </div>
    <div class="tw-log" role="log" aria-live="off" aria-label="Chat messages">
      @for(line of lines();track line.key){
        <p class="tw-line" [class]="line.cls">@if(!line.system){<b class="tw-name" [style.color]="line.color||null">@if(line.badge){<i class="tw-badge" aria-hidden="true">{{line.badge}}</i>}{{line.name}}</b>}<span class="tw-text">@for(part of line.parts;track $index){@if(part.e){<img class="tw-emote" [src]="part.e" [alt]="part.t" [title]="part.t" loading="lazy">}@else{{{part.t}}}}</span></p>
      } @empty {<p class="tw-quiet">{{live()?'Chat is quiet. Messages appear here.':'Joining the channel…'}}</p>}
    </div>
    @if(canSend()){
      <form class="tw-compose" (ngSubmit)="send()">
        <input name="message" [(ngModel)]="draft" (keydown.enter)="$event.preventDefault();send()" [placeholder]="'Chat as '+login()" aria-label="Send a message" autocomplete="off" maxlength="500" [disabled]="sending()">
        <button class="btn filled" type="submit" aria-label="Send" [disabled]="sending()||!draft.trim()"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12 20 4l-4 16-4.5-6.5zM11.5 13.5 20 4"></path></svg></button>
      </form>
      @if(w.controlError()){<p class="tw-error" role="alert">{{w.controlError()}}</p>}
    } @else if(live()){
      <button class="tw-signin" type="button" (click)="store.manageWidget('twitch')">{{authFailed()?'Twitch sign-in expired. Sign in again to chat':login()?'Signing in to chat…':'Sign in to chat'}}</button>
    }`,
  styleUrl:'./body.scss'
})
export class TwitchBody {
  readonly w=inject(WidgetContext);
  readonly store=inject(StudioStore);
  readonly live=computed(()=>!!this.w.state().data?.['connected']);
  readonly canSend=computed(()=>!!this.w.state().data?.['canSend']);
  readonly login=computed(()=>String(this.w.state().data?.['login']||''));
  readonly authFailed=computed(()=>!!this.w.state().data?.['authFailed']);
  readonly editing=signal(false);
  readonly sending=signal(false);
  private readonly channelInput=viewChild<ElementRef<HTMLInputElement>>('channelInput');
  draftChannel='';
  draft='';
  /**
   * Every buffered line is laid out; the log clips the oldest at its top edge, so a tall tile fills to the top.
   * Lines simply appear, like any chat: at several updates a second, an entrance animation per line would keep
   * the desk redrawing at the display's full rate.
   */
  readonly lines=computed<ChatLine[]>(()=>(this.w.state().items??[]).map((item,i)=>{
    const key=text(item,'id')||item.title+'|'+i,badges=Array.isArray(item['badges'])?item['badges'] as string[]:[],parts=Array.isArray(item['parts'])?item['parts'] as ChatPart[]:[{t:item.detail}];
    const top=['broadcaster','moderator','vip','subscriber','founder'].find(b=>badges.includes(b))??'';
    const system=item['system']===true;
    return {key,name:item.title,color:text(item,'color'),action:item['action']===true,system,badge:badgeMark[top]??'',parts,cls:['tw-line',item['action']===true?'me':'',system?'system':'',item['self']===true?'mine':''].filter(Boolean).join(' ')};
  }));
  startEditing(){
    this.draftChannel=String(this.w.state().data?.['channel']||'');this.editing.set(true);
    setTimeout(()=>{const input=this.channelInput()?.nativeElement;input?.focus();input?.select();});
  }
  async switchTo(){
    const channel=this.draftChannel.trim().replace(/^[@#]/,'');this.editing.set(false);
    if(!channel||channel.toLowerCase()===String(this.w.state().data?.['channel']||''))return;
    await this.w.control('connect',{service:'twitch',channel});
  }
  async send(){
    const message=this.draft.trim();if(!message||this.sending())return;
    this.sending.set(true);this.w.controlError.set('');
    try{await this.w.control('twitch-say',{text:message});if(!this.w.controlError())this.draft='';}
    finally{this.sending.set(false);}
  }
}
