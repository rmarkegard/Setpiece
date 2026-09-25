import {ChangeDetectionStrategy,Component,computed,inject} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {IconComponent} from '../../ui/icon';
import {WidgetContext} from '../context';

@Component({
  selector:'sp-departures-body',
  changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[IconComponent],
  template:`
    <span class="eyebrow"><sp-icon name="signpost"/><span>{{w.state().title}}</span></span>
    <div class="list departures grow">
      @for(departure of departures();track $index){
        <div>
          <span class="line">{{departure.line}}</span>
          <strong class="clip destination">{{departure.destination}}</strong>
          <span class="due">{{departure.due}}</span>
        </div>
      } @empty {<p class="muted">{{w.state().detail}}</p>}
    </div>`,
  styleUrl:'./body.scss',
  styles:`
    .departures>div{padding-block:var(--space-2)}
    .line{display:grid;place-items:center;min-width:2.6em;height:1.9em;padding:0 .4em;border-radius:var(--shape-sm);background:var(--w-fg);color:var(--w-container);font-family:var(--font-brand);font-weight:700;font-size:14px}
    .destination{flex:1;font:var(--mat-sys-title-small)}
    .due{font-family:var(--font-brand);font-weight:600;font-stretch:var(--font-hero-stretch);font-size:18px;font-variant-numeric:tabular-nums;white-space:nowrap}
    :host-context(.narrow) .departures>div{gap:var(--space-2);padding-inline:var(--space-2)}
    :host-context(.narrow) .line{min-width:2.2em;font-size:12px}
    :host-context(.narrow) .due{font-size:15px}
    :host-context(.narrow) .destination{font:var(--mat-sys-label-large)}
  `
})
export class DeparturesBody {
  readonly w=inject(WidgetContext);
  readonly departures=computed(()=>this.w.items().map(item=>{const [line,destination]=item.title.split(' · ');return {line,destination:destination??'',due:item.detail};}));
}

@Component({
  selector:'sp-news-body',
  changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[MatButtonModule,IconComponent],
  template:`
    <span class="eyebrow"><sp-icon name="newspaper"/><span>VG · Headlines</span></span>
    @if(lead();as item){
      <button class="lead" (click)="w.external(item.url)">
        <strong class="headline clamp-3">{{item.title}}</strong>
        @if(!w.narrow()){<span class="muted clamp-2">{{item.detail}}</span>}
      </button>
      @if(more().length){
        <div class="list news-list push">
          @for(next of more();track $index){<button (click)="w.external(next.url)"><span class="list-copy"><strong class="clamp-2">{{next.title}}</strong></span><sp-icon name="arrow_outward"/></button>}
        </div>
      }
    }`,
  styleUrl:'./body.scss',
  styles:`
    .lead{display:flex;flex-direction:column;gap:var(--space-2);padding:0;border:0;background:none;color:inherit;text-align:left;cursor:pointer;font:inherit}
    .lead:hover .headline{text-decoration:underline;text-underline-offset:.15em}
    .headline{font-family:var(--font-brand);font-weight:600;font-stretch:var(--font-hero-stretch);font-size:22px;line-height:1.2}
    :host-context(.spacious) .headline{font-size:30px}
    :host-context(.compact) .headline{font-size:17px}
    .clamp-3{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
    .news-list sp-icon{font-size:18px;color:var(--w-muted)}
  `
})
export class NewsBody {
  readonly w=inject(WidgetContext);
  readonly lead=computed(()=>this.w.state().items?.[0]);
  readonly more=computed(()=>this.w.state().items?.slice(1,this.w.contentLimit())??[]);
}

@Component({
  selector:'sp-reddit-body',
  changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[IconComponent],
  template:`
    <span class="eyebrow"><sp-icon name="dynamic_feed"/><span>{{w.state().title}}</span></span>
    <div class="list posts grow">
      @for(post of w.items();track $index){
        <button (click)="w.external(post.url)"><span class="list-copy"><strong class="clamp-2">{{post.title}}</strong><span class="clip">{{post.detail}}</span></span></button>
      }
    </div>`,
  styleUrl:'./body.scss'
})
export class RedditBody {readonly w=inject(WidgetContext);}

@Component({
  selector:'sp-inbox-body',
  changeDetection:ChangeDetectionStrategy.OnPush,
  template:`
    <div class="row">
      <span class="count hero md">{{count()}}</span>
      <div class="list-copy"><strong class="title">Unread</strong>@if(!w.short()){<span class="clip">{{w.state().detail}}</span>}</div>
    </div>
    <div class="list inbox-posts grow">
      @for(message of w.items();track $index){
        <button (click)="w.external(message.url)"><span class="avatar">{{initial(message.detail)}}</span><span class="list-copy"><strong class="clip">{{message.title||'No subject'}}</strong><span class="clip">{{message.detail}}</span></span></button>
      }
    </div>`,
  styleUrl:'./body.scss',
  styles:`
    .count{display:grid;place-items:center;min-width:1.5em;height:1.5em;padding:0 .2em;border-radius:var(--shape-lg);background:var(--w-fg);color:var(--w-container)}
    .avatar{display:grid;place-items:center;flex-shrink:0;width:32px;height:32px;border-radius:50%;background:var(--w-inset-strong);font:var(--mat-sys-title-small)}
  `
})
export class InboxBody {
  readonly w=inject(WidgetContext);
  readonly count=computed(()=>parseInt(this.w.state().title)||this.w.state().items?.length||0);
  initial(detail:string){return detail.trim().charAt(0).toUpperCase()||'?';}
}

@Component({
  selector:'sp-discord-body',
  changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[MatButtonModule,IconComponent],
  template:`
    <div class="row">
      <span class="server" aria-hidden="true"><sp-icon name="forum" [filled]="true"/></span>
      <div class="list-copy"><strong class="title clip">{{w.state().title}}</strong>@if(!w.compact()){<span>{{w.state().detail}}</span>}</div>
    </div>
    @if(voice()){
      <div class="row">
        <button matButton="tonal" [attr.aria-pressed]="!!w.state().data?.['muted']" (click)="w.control('discord-voice',{muted:!w.state().data?.['muted']})"><sp-icon [name]="w.state().data?.['muted']?'mic_off':'mic'"/>{{w.state().data?.['muted']?'Unmute':'Mute'}}</button>
        <button matButton="tonal" [attr.aria-pressed]="!!w.state().data?.['deafened']" (click)="w.control('discord-voice',{deafened:!w.state().data?.['deafened']})"><sp-icon [name]="w.state().data?.['deafened']?'headset_off':'headphones'"/>{{w.state().data?.['deafened']?'Undeafen':'Deafen'}}</button>
      </div>
    }
    <div class="list members grow">
      @for(member of w.items();track $index){
        <div><span class="avatar" [attr.data-status]="member.detail">{{member.title.charAt(0)}}</span><strong class="clip grow">{{member.title}}</strong><span class="muted status">{{member.detail}}</span></div>
      }
    </div>`,
  styleUrl:'./body.scss',
  styles:`
    .server{display:grid;place-items:center;flex-shrink:0;width:40px;height:40px;border-radius:var(--shape-md);background:var(--w-fg);color:var(--w-container)}
    .server sp-icon{font-size:22px}
    :host-context(.compact) .server{width:32px;height:32px}
    .members>div{padding-block:var(--space-1-5)}
    .avatar{position:relative;display:grid;place-items:center;flex-shrink:0;width:28px;height:28px;border-radius:50%;background:var(--w-inset-strong);font:var(--mat-sys-label-large)}
    .avatar::after{content:'';position:absolute;right:-1px;bottom:-1px;width:9px;height:9px;border-radius:50%;background:var(--w-fg);border:2px solid var(--w-container)}
    .avatar[data-status=idle]::after{background:var(--w-muted)}
    .avatar[data-status=dnd]::after{background:var(--mat-sys-error)}
    .status{font:var(--mat-sys-label-medium);text-transform:capitalize}
    strong{font:var(--mat-sys-title-small)}
  `
})
export class DiscordBody {
  readonly w=inject(WidgetContext);
  readonly voice=computed(()=>!!this.w.state().data?.['voice']);
}
