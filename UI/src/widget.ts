import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ElementRef, ViewChild, AfterViewInit, OnChanges, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSliderModule } from '@angular/material/slider';
import { Bridge } from './bridge';
import { IconComponent } from './icon';
import { widgets, ServiceState } from './domain';
import { widgetContentLimit } from './widget-layout';
@Component({selector:'sp-widget',standalone:true,imports:[IconComponent,CommonModule,FormsModule,MatButtonModule,MatProgressBarModule,MatSliderModule],template:`
  <section class="widget" [attr.aria-label]="definition.name" [attr.data-widget]="id" [attr.data-state]="state().status" [class.compact]="compact()" [class.spacious]="spacious()" [style.--widget-density]="density()">
    <header><span class="row widget-title"><span class="widget-icon"><sp-icon class="icon" [name]="definition.icon"></sp-icon></span><strong>{{definition.name}}</strong></span><span class="state-label">{{definition.preview?'PREVIEW':definition.retired?'RETIRED':state().status==='ready'?(['notes','idle-game'].includes(id)?'LOCAL':'LIVE'):state().status}}</span>@if(canExpand){<button class="expand-widget" [attr.aria-label]="'Expand '+definition.name" (click)="expand.emit()"><sp-icon name="open_in_full"></sp-icon></button>}</header>
    <div class="fit-container" #container tabindex="0" aria-label="Widget content"><div class="fit-content" #content [style.zoom]="fit()" [style.--body-height]="bodyHeight()+'px'">
    @if(definition.retired){<div class="quiet-state"><span class="large-symbol">×</span><h3>This chapter has closed</h3><p>X / Twitter is retired. Your tile is preserved.</p><button mat-button (click)="manage.emit()">Choose another widget</button></div>}
    @else if(definition.preview){
      @switch(id){@case('market'){<div class="preview-hero">Your watchlist</div><p class="muted">A considered view of the market.</p><div class="preview-bars">@for(n of squares.slice(0,contentLimit());track n){<i></i>}</div>}
      @case('focus'){<div class="focus-ring">25:00</div><p class="muted center">A moment for one thing.</p>}
      @default{<h3>Small steps. Steady progress.</h3><div class="contributions">@for(n of squares.slice(0,contentLimit());track n){<i [style.opacity]=".15+(n%5)*.17"></i>}</div><p class="muted">Contribution layout preview</p>}}
    }
    @else if(id==='clock'&&compact()){
      <div class="compact-clock"><div><strong>{{now()|date:'HH:mm'}}</strong><p class="muted">{{now()|date:'EEE, d MMM'}}</p></div>@if(zones[0]){<div><span class="muted">{{zoneLabel(0)}}</span><strong>{{worldTime(zones[0])}}</strong></div>}</div>
    }
    @else if(id==='clock'){
      <div class="clock-time">{{now()|date:'HH:mm'}}<span>{{now()|date:'ss'}}</span></div><p class="muted">{{now()|date:'EEEE, d MMMM'}}</p>
      <div class="world-clocks">@for(zone of zones.slice(0,contentLimit());track $index){<div><span class="muted">{{zoneLabel($index)}}</span><strong>{{worldTime(zone)}}</strong></div>}</div>
    }
    @else if(id==='notes'){<textarea aria-label="Your note" placeholder="Capture a thought…" class="note" [ngModel]="note" (ngModelChange)="saveNote($event)" spellcheck="true"></textarea><span class="muted small">{{noteStatus()}}</span>}
    @else if(id==='idle-game'){
      <div class="game-summary"><span class="bot">⬡</span><div><h3>Pilot, your bot is ready.</h3><p class="muted">{{gameSalvage()}} salvage in the workshop</p></div></div><div class="mission-map">@for(n of squares.slice(0,contentLimit());track n){<i [class.signal]="n%7===2"></i>}</div><button mat-flat-button (click)="play.emit()">Enter the scrapyard</button>
    }
    @else if(state().status==='loading'){<div class="quiet-state"><mat-progress-bar mode="indeterminate"></mat-progress-bar><p>Finding the latest for you…</p></div>}
    @else if(state().status==='disconnected'||state().status==='error'||state().status==='offline'){
      <div class="quiet-state"><sp-icon class="large-symbol" [name]="state().status==='offline'?'cloud_off':definition.icon"></sp-icon><h3>{{state().title}}</h3><p>{{state().detail}}</p><button mat-button (click)="state().status==='disconnected'?manage.emit():refresh()">{{state().status==='disconnected'?'Connect service':'Try again'}}</button></div>
    }
    @else {
      @switch(id){
        @case('weather'){<div class="weather-layout"><div class="weather-now"><div><strong>{{state().title}}</strong><h3>{{state().detail}}</h3></div><span class="weather-icon">{{weatherIcon()}}</span></div><p class="weather-details muted">Feels like {{state().data?.['feelsLike']}}° · Wind {{state().data?.['wind']}} km/h</p><div class="forecast">@for(item of state().items?.slice(0,contentLimit());track $index){<div><span>{{item.title}}</span><strong>{{item.detail.split(' · ')[0]}}</strong><small>{{item.detail.split(' · ')[1]}}</small></div>}</div></div>}
        @case('system'){
          <div class="system-readings">
            <div class="reading cpu"><div><span><i></i>CPU load</span><strong>{{metric('cpu')|number:'1.0-0'}}%</strong></div><mat-progress-bar [value]="metric('cpu')"></mat-progress-bar></div>
            <div class="reading gpu"><div><span><i></i>GPU compute</span><strong>{{sensor('gpu','%')}}</strong></div><mat-progress-bar [value]="metric('gpu')"></mat-progress-bar></div>
            <div class="reading temperature"><div><span><i></i>CPU temperature</span><strong>{{sensor('temperature','°C')}}</strong></div>@if(state().data?.['temperature']!==undefined&&state().data?.['temperature']!==null){<mat-progress-bar [value]="metric('temperature')"></mat-progress-bar>}</div>
            <div class="reading memory"><div><span><i></i>Memory</span><strong>{{metric('memory')|number:'1.0-0'}}%</strong></div><mat-progress-bar [value]="metric('memory')"></mat-progress-bar></div>
          </div>
          @if(!compact()){<p class="muted system-detail">{{state().detail}}</p>}
          <div class="system-footer"><span class="transfer down">↓ {{throughput('download')}}</span><span class="transfer up">↑ {{throughput('upload')}}</span><button mat-button (click)="manage.emit()">Details</button></div>
        }
        @case('volume'){<div class="volume-hero"><span class="large-symbol">{{state().data?.['muted']?'♩':'♪'}}</span><strong>{{metric('level')|number:'1.0-0'}}<small>%</small></strong></div>@if(!compact()){<p class="muted">{{state().detail}}</p>}<mat-slider min="0" max="100" step="1"><input matSliderThumb aria-label="System output volume" [value]="metric('level')" (valueChange)="volume($event)"></mat-slider><div class="row spread"><button mat-stroked-button (click)="mute()">{{state().data?.['muted']?'Unmute':'Mute'}}</button><span class="muted small">Windows output</span></div>@if(spacious()){<mat-progress-bar [value]="metric('peak')" aria-label="Live audio level"></mat-progress-bar>}}
        @case('email'){<div class="inbox-summary"><span class="large-symbol">✉</span><div><h3>{{state().title}}</h3>@if(!compact()){<p class="muted">{{state().detail}}</p>}</div></div><div class="posts inbox-posts">@for(item of state().items?.slice(0,contentLimit());track $index){<button (click)="external(item.url!)"><span>{{item.detail}}</span><strong>{{item.title||'No subject'}}</strong></button>}</div>}
        @case('bambu-lab'){<div class="printer-layout"><div class="printer-camera">@if(state().data?.['image']){<img [src]="state().data?.['image']" alt="Latest printer camera frame">}@else{<sp-icon name="deployed_code"></sp-icon><span>Camera unavailable</span>}</div><div class="printer-status"><div><span class="eyebrow">{{state().data?.['stage']}}</span><h3>{{state().title}}</h3></div><strong>{{metric('progress')|number:'1.0-0'}}%</strong></div><mat-progress-bar [value]="metric('progress')"></mat-progress-bar><div class="printer-values">@for(value of printerValues();track value.label){<div><span>{{value.label}}</span><strong>{{value.value}}</strong></div>}</div></div>}
        @case('codex'){<div class="usage-providers">@for(provider of ['codex','go'];track provider){<section class="usage-provider" [class.go]="provider==='go'"><h3>{{provider==='codex'?'Codex':'OpenCode'}} <small>used</small></h3>@for(window of quotaWindows(provider).slice(0,contentLimit());track $index){<div class="usage-meter"><div><span>{{quotaLabel(window)}}</span><strong>{{window.used|number:'1.0-0'}}%</strong></div><mat-progress-bar [value]="window.used"></mat-progress-bar></div>}@if(!quotaWindows(provider).length){<p class="muted small">Limits unavailable</p>}</section>}</div>}
        @case('spotify'){<div class="music-art">@if(state().data?.['image']){<img [src]="state().data?.['image']" alt="Album artwork">}@else{<span>♫</span>}</div><h3>{{state().title}}</h3>@if(!compact()){<p class="muted">{{state().detail}}</p><mat-progress-bar [value]="metric('progress')/Math.max(1,metric('duration'))*100"></mat-progress-bar>}<div class="row"><button mat-icon-button aria-label="Previous track" (click)="playback('previous')"><sp-icon name="skip_previous"></sp-icon></button><button mat-flat-button (click)="playback(state().data?.['playing']?'pause':'play')">{{state().data?.['playing']?'Pause':'Play'}}</button><button mat-icon-button aria-label="Next track" (click)="playback('next')"><sp-icon name="skip_next"></sp-icon></button>@if(spacious()){<button mat-button (click)="external('https://open.spotify.com')">Open Spotify</button>}</div>}
        @case('battery'){@if(state().status==='empty'){<div class="quiet-state"><sp-icon class="large-symbol" name="power"></sp-icon><h3>{{state().title}}</h3><p>{{state().detail}}</p></div>}@else{<div class="battery-hero"><span>{{state().title}}</span></div><mat-progress-bar [value]="metric('level')"></mat-progress-bar>@if(!compact()){<p class="muted battery-detail">{{state().detail}}</p>}}}
        @case('google-calendar'){<div class="calendar-layout"><div class="calendar-date"><span>{{now()|date:'dd'}}</span><div><h3>{{now()|date:'EEEE'}}</h3><p class="muted">{{now()|date:'MMMM yyyy'}}</p></div></div><div class="agenda">@for(item of state().items?.slice(0,contentLimit());track $index){<div [title]="item.title+' · '+item.detail"><i></i><section><strong>{{item.title}}</strong><p class="muted">{{item.detail}}</p></section></div>}</div>@if(!state().items?.length){<p>{{state().detail}}</p>}</div>}
        @case('ruter'){<h3>{{state().title}}</h3>@if(!compact()||!state().items?.length){<p class="muted small">{{state().detail}}</p>}<div class="departures">@for(item of state().items?.slice(0,contentLimit());track $index){<div><span class="line-badge">{{item.title.split(' · ')[0]}}</span><strong>{{item.title.split(' · ')[1]}}</strong><span>{{item.detail}}</span></div>}</div>}
        @case('news'){<span class="eyebrow">VG · Headlines</span>@if(state().items?.[0];as item){<h2 class="headline">{{item.title}}</h2><p class="muted news-summary">{{item.detail}}</p><button mat-button (click)="external(item.url!)">Read the story ↗</button><div class="news-list">@for(next of state().items?.slice(1,contentLimit());track $index){<button (click)="external(next.url!)"><strong>{{next.title}}</strong><span>{{next.detail}}</span></button>}</div>}}
        @case('reddit'){<span class="eyebrow">{{state().title}}</span><div class="posts">@for(item of state().items?.slice(0,contentLimit());track $index){<button (click)="external(item.url!)"><strong>{{item.title}}</strong><span>{{item.detail}}</span></button>}</div>}
        @case('discord'){@if(state().data?.['voice']){<div class="row"><button mat-stroked-button (click)="voice('muted')">{{state().data?.['muted']?'Unmute':'Mute'}}</button><button mat-stroked-button (click)="voice('deafened')">{{state().data?.['deafened']?'Undeafen':'Deafen'}}</button></div>}<div class="community"><span class="online-dot"></span><h3>{{state().title}}</h3></div>@if(!compact()){<p class="muted">{{state().detail}}</p>}<div class="member-list">@for(item of state().items?.slice(0,contentLimit());track $index){<div><span class="avatar">{{item.title.slice(0,1)}}</span><strong>{{item.title}}</strong><span class="muted">{{item.detail}}</span></div>}</div>}
        @default{<h2>{{state().title}}</h2><p class="muted">{{state().detail}}</p>@for(item of state().items?.slice(0,contentLimit());track $index){<div class="data-row"><strong>{{item.title}}</strong><span>{{item.detail}}</span></div>}}
      }
    }
    @if(controlError()){<p class="error small" role="alert">{{controlError()}}</p>}
    </div></div>
  </section>`,styles:[`
  :host{display:block;width:100%;height:100%;min-height:0}.widget{height:100%;display:flex;flex-direction:column;color:var(--mat-sys-on-surface);overflow:hidden;container-type:inline-size}header{display:flex;align-items:center;justify-content:space-between;gap: var(--space-12);font:var(--mat-sys-label-large)}.state-label{font-size: var(--text-9);border-radius: var(--radius-full);white-space:nowrap}.fit-container{flex:1;min-height:0;position:relative}.fit-content{transform-origin:top left;display:flex;flex-direction:column;min-height:0}.quiet-state p{color:var(--mat-sys-on-surface-variant)}.large-symbol{font-size: var(--text-40);color:var(--mat-sys-primary)}.clock-time{font:var(--mat-sys-display-large);font-size: clamp(var(--text-32),18cqw,var(--text-72));letter-spacing:-.04em}.clock-time span{font:var(--mat-sys-title-large);color:var(--mat-sys-on-surface-variant);margin-left: var(--space-8)}.world-clocks{display:flex;border-top:1px solid var(--mat-sys-outline-variant);padding-top: var(--space-16);flex-wrap:wrap}.world-clocks>div{flex:1;display:flex;flex-direction:column;gap: var(--space-6)}.world-clocks strong{font:var(--mat-sys-title-large)}select{max-width:100%;color:var(--mat-sys-on-surface-variant);background:var(--mat-sys-surface-container);border:0;padding: var(--space-4) 0;min-height:28px}.weather-icon{color:var(--mat-sys-tertiary)}.forecast{justify-content:space-between;border-top:1px solid var(--mat-sys-outline-variant)}.metrics{display:grid;grid-template-columns:1fr 1fr;}.metrics strong{font:var(--mat-sys-display-medium)}.metrics small{font:var(--mat-sys-title-medium)}.music-art{background:var(--mat-sys-tertiary-container);color:var(--mat-sys-on-tertiary-container);width:90px;height:90px;border-radius: var(--radius-12);overflow:hidden;display:grid;place-items:center;font-size: var(--text-48)}.music-art img{width:100%;height:100%;object-fit:cover}.battery-hero{font:var(--mat-sys-display-medium)}.calendar-date>span{font:var(--mat-sys-display-medium);color:var(--mat-sys-primary)}.agenda>div{display:flex;gap: var(--space-12);padding: var(--space-12) 0}.agenda i{width:3px;border-radius: var(--radius-3)}.departures>div{display:flex;align-items:center;gap: var(--space-10);padding: var(--space-12) 0;border-bottom:1px solid var(--mat-sys-outline-variant)}.departures strong{flex:1}.line-badge{border-radius: var(--radius-6);min-width:32px;padding: var(--space-6);text-align:center;font-weight:700}.posts{display:flex;flex-direction:column;gap: var(--space-12)}.posts button{text-align:left;border:0;color:inherit;display:flex;flex-direction:column;gap: var(--space-8);min-height:48px}.posts span{color:var(--mat-sys-on-surface-variant);font:var(--mat-sys-body-small)}.community{display:flex;gap: var(--space-10);align-items:center}.online-dot{width:10px;height:10px;border-radius: 100%}.member-list>div{display:flex;align-items:center;gap: var(--space-10);}.member-list strong{flex:1}.avatar{background:var(--mat-sys-secondary-container);color:var(--mat-sys-on-secondary-container);width:32px;height:32px;border-radius: 50%;display:grid;place-items:center}.note{resize:none;field-sizing:content;color:var(--mat-sys-on-surface);border:0;line-height:1.7;width:100%;overflow:hidden}.focus-ring{border:12px solid var(--mat-sys-primary-container);border-top-color:var(--mat-sys-primary);border-radius: 50%;width:160px;height:160px;display:grid;place-items:center;font:var(--mat-sys-display-small);margin: auto}.center{text-align:center}.contributions{display:grid;grid-template-columns:repeat(8,1fr);gap: var(--space-5);margin: var(--space-16) 0}.contributions i{aspect-ratio:1;background:var(--mat-sys-primary);border-radius: var(--radius-4)}.preview-bars{display:flex;align-items:flex-end;gap: var(--space-10);height:100px}.preview-bars i{flex:1;background:var(--mat-sys-tertiary);border-radius: var(--radius-4) var(--radius-4) 0 0;height:50%}.preview-bars i:nth-child(2n){height:80%}.preview-bars i:nth-child(3n){height:65%}.preview-hero{font:var(--mat-sys-headline-small)}.game-summary{display:flex;gap: var(--space-16);align-items:center}.bot{font-size: var(--text-48);color:var(--mat-sys-primary)}.mission-map{display:grid;grid-template-columns:repeat(7,1fr);gap: var(--space-5)}.mission-map i{height:15px;border-radius: var(--radius-4);background:var(--mat-sys-surface-container-highest)}.mission-map i.signal{background:var(--mat-sys-tertiary-container)}.data-row{display:flex;justify-content:space-between;padding: var(--space-10) 0;border-bottom:1px solid var(--mat-sys-outline-variant)}.volume-hero{display:flex;align-items:center;gap: var(--space-20)}.volume-hero strong{font:var(--mat-sys-display-medium)}.volume-hero small{font:var(--mat-sys-title-large)}.inbox-summary{display:flex;align-items:center;gap: var(--space-16)}.inbox-posts button{border-bottom:1px solid var(--mat-sys-outline-variant)}.printer-hero strong{font:var(--mat-sys-display-small)}.printer-outline{aspect-ratio:1.3;border-radius: var(--radius-12);display:flex;flex-direction:column;align-items:center;justify-content:center;}.printer-outline span{font-size: var(--text-48)}.printer-metrics,.sensor-grid{display:grid;grid-template-columns:1fr 1fr;gap: var(--space-12)}.printer-metrics>div,.sensor-grid>div{display:flex;flex-direction:column;gap: var(--space-5)}.printer-metrics span,.sensor-grid span{color:var(--mat-sys-on-surface-variant);font:var(--mat-sys-label-medium)}.quota-row{display:flex;flex-direction:column;gap: var(--space-8)}.opencode-metrics>div{display:flex;flex:1;flex-direction:column;gap: var(--space-4)}.opencode-metrics strong{font:var(--mat-sys-title-large)}.opencode-metrics span{font:var(--mat-sys-label-small);color:var(--mat-sys-on-surface-variant)}.compact .state-label{display:none}.compact .world-clocks{padding-top: var(--space-8)}.compact .music-art{height:48px;width:48px}.compact .quiet-state .large-symbol,.compact .quiet-state p{display:none}.compact .quiet-state{gap: var(--space-4)}.compact .departures>div{padding: var(--space-4) 0;gap: var(--space-6)}.compact .line-badge{min-width:24px;padding: var(--space-4)}.compact .departures strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .compact .system-detail,.compact .sensor-temperature,.compact .sensor-status,.compact .sensor-settings,.compact .news-summary{display:none}.compact .metrics{gap: var(--space-16)}.compact .metrics>div{gap: var(--space-4)}.compact .metrics strong{font:var(--mat-sys-headline-large)}.compact .sensor-grid{gap: var(--space-12)}.compact-quotas{display:grid;grid-template-columns:1fr 1fr;}.compact-quotas>div{display:flex;flex-direction:column;gap: var(--space-4)}.compact-quotas strong{font:var(--mat-sys-headline-large)}.compact-opencode{display:flex;align-items:center;justify-content:space-between;gap: var(--space-12);border-top:1px solid var(--mat-sys-outline-variant);padding-top: var(--space-8)}.compact-opencode span{font:var(--mat-sys-body-small)}.compact .contributions{grid-template-rows:repeat(3,24px);margin: 0}.compact .contributions i{aspect-ratio:auto}.compact .contributions i:nth-child(n+25){display:none}.compact .headline{font-size: var(--text-20);line-height:1.25;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden}.compact .compact-clock>div:first-child>strong{font-size: clamp(var(--text-38),18cqw,var(--text-96));line-height:1}.compact .compact-clock>div:last-child>strong{font-size: clamp(var(--text-24),10cqw,var(--text-52));line-height:1.1}.compact .compact-weather>strong{font-size: clamp(var(--text-40),18cqw,var(--text-96));line-height:1}
  header{font-size: calc(var(--text-14) * var(--widget-density,1));margin-bottom: calc(var(--space-20) * var(--widget-density,1))}header .icon{font-size: calc(var(--text-20) * var(--widget-density,1))}.state-label{font-size: calc(var(--text-9) * var(--widget-density,1))}.compact header{margin-bottom: calc(var(--space-10) * var(--widget-density,1))}

  /* Expressive Material 3 widget language. Each tile keeps one clear focal point,
     with tonal grouping and responsive density instead of dashboard-like boxes. */
  .widget{
    
    
    
    position:relative;
    isolation:isolate;
    
    
    
    
  }
  .widget:before{content:'';position:absolute;z-index: var(--z-wallpaper);right:-18%;top:-35%;width:68%;aspect-ratio:1;border-radius: 50%;background:var(--widget-accent-container);opacity:.22;filter:blur(2px);pointer-events:none}
  .widget[data-widget='weather'],.widget[data-widget='bambu-lab']{--widget-accent:var(--mat-sys-tertiary);--widget-accent-container:var(--mat-sys-tertiary-container);--widget-on-accent:var(--mat-sys-on-tertiary-container)}
  .widget[data-widget='news'],.widget[data-widget='ruter'],.widget[data-widget='email']{--widget-accent:var(--mat-sys-secondary);--widget-accent-container:var(--mat-sys-secondary-container);--widget-on-accent:var(--mat-sys-on-secondary-container)}
  .widget header{position:relative;z-index: var(--z-tile-meta);justify-content:flex-start;}
  .widget-title{min-width:0;gap: var(--space-10)}.widget-title>strong{overflow:hidden;text-overflow:ellipsis;font-weight:700;letter-spacing:-.01em}
  .widget-icon{display:grid;place-items:center;flex:0 0 auto;color:var(--widget-on-accent)}
  header .icon{color:inherit}.state-label{display:flex;align-items:center;gap: var(--space-5);margin-left: auto;color:var(--mat-sys-on-surface-variant);background:color-mix(in srgb,var(--mat-sys-surface-container-highest) 82%,transparent);border:1px solid color-mix(in srgb,var(--mat-sys-outline-variant) 55%,transparent);padding: var(--space-5) var(--space-8);font-weight:700;letter-spacing:.07em}
  .state-label:before{content:'';border-radius: 50%;}
  [data-state='disconnected'] .state-label:before,[data-state='offline'] .state-label:before{background:var(--mat-sys-outline)}
  .expand-widget{display:grid;place-items:center;flex-shrink:0;width:32px;height:32px;min-width:32px;padding: 0;border:0;border-radius: var(--radius-11);background:transparent;color:var(--mat-sys-on-surface-variant);cursor:pointer;transition: background var(--motion-control),color var(--motion-control),transform var(--motion-control)}.expand-widget .material-symbols{font-size: var(--text-18)}
.expand-widget:hover{background:var(--widget-accent-container);color:var(--widget-on-accent);transform:translateY(-1px)}
  
  .muted{color:color-mix(in srgb,var(--mat-sys-on-surface-variant) 92%,transparent)}
  .eyebrow{font-weight:750;letter-spacing:.1em;color:var(--widget-accent)}

  .widget mat-progress-bar{--mat-progress-bar-active-indicator-color:var(--widget-accent);--mat-progress-bar-track-color:color-mix(in srgb,var(--widget-accent-container) 64%,var(--mat-sys-surface-container-highest));--mat-progress-bar-active-indicator-height:var(--space-6);--mat-progress-bar-track-height:var(--space-6);--mat-progress-bar-track-shape:var(--radius-full);border-radius: var(--radius-full);overflow:hidden}.quiet-state .large-symbol{display:grid;place-items:center;width:58px;height:58px;border-radius: var(--radius-19);background:var(--widget-accent-container);color:var(--widget-on-accent);font-size: var(--text-30)}.quiet-state h3{margin-top: var(--space-4);font:var(--mat-sys-title-large);letter-spacing:-.02em}.quiet-state p{max-width:34ch}.quiet-state button{margin-top: var(--space-4);background:var(--widget-accent-container);color:var(--widget-on-accent);border-radius: var(--radius-full)}.weather-icon{display:grid;place-items:center;border-radius: 50%;background:color-mix(in srgb,var(--mat-sys-surface) 55%,transparent);color:var(--widget-accent);box-shadow: var(--elevation-hairline)}
  .weather-hero+h3{font:var(--mat-sys-title-large);letter-spacing:-.02em}.forecast{border:0;}.forecast strong{font:var(--mat-sys-title-medium)}
  .compact-weather{height:100%;padding: var(--space-12) var(--space-14);border-radius: var(--radius-20);background:linear-gradient(135deg,var(--widget-accent-container),color-mix(in srgb,var(--widget-accent-container) 38%,transparent));color:var(--widget-on-accent)}.compact-weather>span{display:grid;place-items:center;width:54px;height:54px;border-radius: var(--radius-18);background:color-mix(in srgb,var(--mat-sys-surface) 52%,transparent)}

  .metrics>div{display: flex;flex-direction: column;gap: var(--space-8);padding: var(--space-14);border-radius: var(--radius-17);background: color-mix(in srgb,var(--mat-sys-surface-container-high) 80%,transparent)}.metrics>div:first-child{background:color-mix(in srgb,var(--widget-accent-container) 70%,transparent)}.metrics strong{font-size: clamp(var(--text-30),12cqw,var(--text-48));line-height:1;letter-spacing:-.045em}.metrics small{font-size: .45em;margin-left: var(--space-2)}.system-detail{margin: 0 var(--space-4)}.sensor-grid>div{padding: var(--space-10) var(--space-12);border-radius: var(--radius-13);background:color-mix(in srgb,var(--mat-sys-surface-container) 80%,transparent)}.sensor-status{margin: 0 var(--space-4)}.sensor-settings{align-self:flex-start;border-radius: var(--radius-full)}.printer-hero img,.printer-outline{height:100%;min-height:112px;max-height:180px;border-radius: var(--radius-15)}.printer-hero h3{margin: var(--space-6) 0;font:var(--mat-sys-title-large)}.printer-hero strong{line-height:1;letter-spacing:-.04em}.printer-metrics>div{border-radius: var(--radius-13);}.calendar-date>span{line-height:.95;color:inherit;letter-spacing:-.055em}.calendar-date h3{margin: 0}.calendar-date p{margin: var(--space-2) 0 0;color:inherit;opacity:.75}.agenda{display:flex;flex-direction:column;gap: var(--space-7)}.agenda>div{gap: var(--space-10);padding: var(--space-10) var(--space-12);border-radius: var(--radius-14);}.agenda i{width:5px;}.agenda p{margin: var(--space-3) 0 0}.news-summary{line-height:1.48;max-width:48ch}.widget[data-widget='news'] .fit-content>button{align-self:flex-start;margin-top: auto;border-radius: var(--radius-full);background:var(--widget-accent-container);color:var(--widget-on-accent);padding-inline: var(--space-16)}
  .community{padding: var(--space-12) var(--space-14);border-radius: var(--radius-18);background:color-mix(in srgb,var(--widget-accent-container) 58%,transparent)}.online-dot{background:var(--widget-accent);box-shadow: var(--elevation-focus-ring)}.member-list>div{margin-top: var(--space-7);padding: var(--space-8) var(--space-10);border-radius: var(--radius-13);background:color-mix(in srgb,var(--mat-sys-surface-container-high) 72%,transparent)}
  .departures{display:flex;flex-direction:column;gap: var(--space-7)}.departures>div{border:0;padding: var(--space-9) var(--space-10);border-radius: var(--radius-14);}.departures>div:first-child{background:color-mix(in srgb,var(--widget-accent-container) 72%,transparent)}.departures>div>span:last-child{padding: var(--space-4) var(--space-8);border-radius: var(--radius-full);background:var(--mat-sys-surface-container-lowest);font:var(--mat-sys-label-small);white-space:nowrap}.line-badge{border-radius: var(--radius-10);padding: var(--space-6) var(--space-8)}.posts button{padding: var(--space-10) var(--space-12);border-radius: var(--radius-14);background:color-mix(in srgb,var(--mat-sys-surface-container-high) 72%,transparent);transition: background var(--motion-fast),transform var(--motion-fast)}.posts button:hover{background:var(--widget-accent-container);transform:translateY(-1px)}.inbox-posts button{border:0}
  .note{box-sizing:border-box;field-sizing:fixed;height:0;min-height:0;flex:1 1 0;padding: var(--space-14) var(--space-16);border-radius: var(--radius-18);background:color-mix(in srgb,var(--widget-accent-container) 42%,transparent);font:var(--mat-sys-body-large);overflow:auto;outline:none}.note:focus{box-shadow: var(--elevation-accent-inset)}
  .quota-row{gap: var(--space-6);padding: var(--space-9) var(--space-11);border-radius: var(--radius-13);}.opencode-metrics>div{border-radius: var(--radius-13);}.divider{border-color:color-mix(in srgb,var(--mat-sys-outline-variant) 60%,transparent)}
  .compact-clock{height:100%;padding: var(--space-12) var(--space-14);border-radius: var(--radius-20);background:linear-gradient(135deg,color-mix(in srgb,var(--widget-accent-container) 78%,transparent),transparent)}.compact-clock>div:last-child{padding-left: var(--space-14);border-left:1px solid color-mix(in srgb,var(--widget-accent) 28%,transparent)}
  .world-clocks{border:0;gap: var(--space-8)}.world-clocks>div{padding: var(--space-10) var(--space-12);border-radius: var(--radius-14);background:color-mix(in srgb,var(--mat-sys-surface-container-high) 76%,transparent)}

  .compact{padding: var(--space-12);border-radius: var(--user-radius, var(--radius-16))}.compact:before{top:-18%;right:-24%;opacity:.18}.compact .widget-icon{width:29px;height:29px;border-radius: var(--radius-10)}.compact .widget-title{gap: var(--space-8)}.compact .fit-content{gap: var(--space-7)}.compact .metrics>div{padding: var(--space-10);border-radius: var(--radius-13)}.compact .sensor-grid>div{padding: var(--space-7) var(--space-8)}.compact .printer-hero{padding: var(--space-6);border-radius: var(--radius-15)}.compact .printer-hero img,.compact .printer-outline{min-height:78px;border-radius: var(--radius-11)}.compact .printer-metrics>div{padding: var(--space-7) var(--space-8)}
  @container (max-width:360px){.widget:not(.compact){padding: var(--space-15)}.forecast>div:nth-child(n+5){display:none}.state-label{padding: var(--space-4) var(--space-6)}.printer-hero{grid-template-columns:1fr}.printer-hero img{max-height:130px}.opencode-metrics{display:grid;grid-template-columns:1fr 1fr}.opencode-metrics>div:last-child{grid-column:1/-1}}
  @container (max-width:320px){.state-label{display:none}.widget-title>strong{white-space:normal;line-height:1.15}.departures>div{padding: var(--space-8)}.departures>div>span:last-child{padding-inline: var(--space-6)}}
  @container (min-width:620px){.widget{padding: calc(var(--space-22) * var(--widget-density,1))}.widget header{margin-bottom: calc(var(--space-18) * var(--widget-density,1))}.sensor-grid{grid-template-columns:repeat(4,1fr)}.printer-hero{grid-template-columns:minmax(180px,1fr) 1.35fr}.forecast>div{padding-block: var(--space-13)}}
  /* Component colors have stable meanings and paired light/dark contrast. */
  
  .widget{
    
    
    
    
    
    --widget-accent:var(--violet);--widget-accent-container:var(--violet-soft);--widget-on-accent:var(--violet);
    box-sizing:border-box;padding: var(--space-16);border:0;border-radius: var(--user-radius, var(--radius-16));
    background:var(--widget-surface);box-shadow: var(--elevation-widget);
  }
  .widget:before{display:none}
  .widget[data-widget='weather']{--widget-accent:var(--amber);--widget-accent-container:var(--amber-soft);--widget-on-accent:var(--amber)}
  .widget[data-widget='bambu-lab'],.widget[data-widget='ruter'],.widget[data-widget='battery'],.widget[data-widget='spotify']{--widget-accent:var(--mint);--widget-accent-container:var(--mint-soft);--widget-on-accent:var(--mint)}
  .widget[data-widget='news'],.widget[data-widget='email'],.widget[data-widget='volume']{--widget-accent:var(--blue);--widget-accent-container:var(--blue-soft);--widget-on-accent:var(--blue)}
  .widget[data-widget='google-calendar'],.widget[data-widget='notes']{--widget-accent:var(--rose);--widget-accent-container:var(--rose-soft);--widget-on-accent:var(--rose)}
  .widget header{gap: var(--space-8);margin-bottom: var(--space-16);flex-shrink:0;font-size: var(--text-13)}
  .widget-title{flex:1}.widget-title>strong{white-space:normal;line-height:1.2}
  .widget-icon{width:32px;height:32px;border-radius: var(--radius-12);background:var(--widget-accent-container)}
  .widget .state-label{font-size: var(--text-9);letter-spacing:0;border:0;box-shadow:none;background:var(--mint-soft);color:var(--mint);max-width:85px;overflow:hidden;text-overflow:ellipsis}
  .state-label:before{background:currentColor;box-shadow:none;width:5px;height:5px;flex-shrink:0}
  [data-state='disconnected'] .state-label,[data-state='empty'] .state-label{background:var(--mat-sys-surface-container-high);color:var(--mat-sys-on-surface-variant)}
  .fit-container{overflow:hidden;overscroll-behavior:contain}
  .fit-content{width:100%;max-width:100%;height:100%;box-sizing:border-box;gap: var(--space-12);transform:none;font-size: var(--text-13);line-height:1.45}
  .fit-content>*{min-width:0;max-width:100%;flex-shrink:0;box-sizing:border-box}
  .fit-content h3{font-size: var(--text-16);line-height:1.3;margin: 0}
  .fit-content p{margin: 0}.fit-content .small{font-size: var(--text-11)}
  .metrics{gap: var(--space-10)}.metrics>div,.compact .metrics>div{padding: var(--space-12);border-radius: var(--radius-16);background:var(--violet-soft);color:var(--violet);gap: var(--space-6)}
  .metrics>div:nth-child(2){background:var(--blue-soft);color:var(--blue);--widget-accent:var(--blue);--widget-accent-container:var(--blue-soft)}
  .metrics strong,.compact .metrics strong{font-size: var(--text-36);line-height:1.1;font-weight:550}
  .metrics .muted{color:inherit}.sensor-grid{gap: var(--space-8);grid-template-columns:repeat(2,minmax(0,1fr))}
  .sensor-grid>div,.compact .sensor-grid>div{background:var(--mint-soft);color:var(--mint);padding: var(--space-9) var(--space-10)}
  .sensor-grid>div:nth-child(2){background:var(--amber-soft);color:var(--amber)}
  .sensor-grid>div:nth-child(n+3){background:var(--mat-sys-surface-container-low);color:var(--mat-sys-on-surface)}
  .sensor-grid span,.printer-metrics span{font-size: var(--text-11);color:inherit}.sensor-grid strong{font-size: var(--text-13)}.system-detail{font-size: var(--text-12)}
  .sensor-status{display:none}.sensor-settings{font-size: var(--text-11);min-height:28px;height:28px}
  .weather-hero{display: flex;align-items: center;justify-content: space-between;font: var(--mat-sys-display-large);font-weight: 500;padding: var(--space-14) var(--space-16);min-height: 100px;background: var(--amber-soft);color: var(--mat-sys-on-surface);font-size: var(--text-64);line-height: 1.1;border-radius: var(--radius-20)}
  .weather-icon{background:var(--widget-surface-warm);color:var(--amber);box-shadow:none}
  .forecast{gap: var(--space-5);padding: 0;display:grid;grid-template-columns:repeat(5,minmax(0,1fr))}
  .forecast>div{display: flex;flex-direction: column;align-items: center;flex: 1;border-radius: var(--radius-14);text-align: center;padding: var(--space-10) var(--space-2);gap: var(--space-8);background: var(--blue-soft);font-size: var(--text-11);color: var(--blue)}
  .forecast>div:first-child{background:var(--amber-soft);color:var(--amber)}.forecast strong{font-size: var(--text-13)}.forecast small{font-size: var(--text-9);color:inherit}
  .printer-hero{align-items: center;grid-template-columns: minmax(110px,1.15fr) 1fr;border-radius: var(--radius-20);display: flex;flex-wrap: wrap;background: transparent;padding: 0;gap: var(--space-10)}
  .printer-hero img{width:100%;height:clamp(100px,35cqw,180px);min-height:0;max-height:none;object-fit:cover;border-radius: var(--radius-18)}
  .printer-hero>div:last-child{width:100%;padding: 0;display:grid;grid-template-columns:1fr auto;align-items:center;gap: var(--space-3) var(--space-8)}
  .printer-hero .eyebrow{font-size: var(--text-10);grid-column:1}.printer-hero h3{grid-column:1;font-size: var(--text-15)}
  .printer-hero strong{grid-column:2;grid-row:1/3;font-size: var(--text-32);color:var(--mint)}
  .printer-metrics{grid-template-columns:repeat(2,minmax(0,1fr));gap: var(--space-8)}.printer-metrics>div{background:var(--mint-soft);color:var(--mint);padding: var(--space-8) var(--space-10)}
  .printer-metrics>div:nth-child(n+3){background:var(--amber-soft);color:var(--amber)}
  .calendar-date{display: flex;align-items: center;border-radius: var(--radius-20);color: var(--widget-on-accent);background: var(--rose-soft);padding: var(--space-16);gap: var(--space-16)}.calendar-date>span{font-size: var(--text-56)}
  .agenda>div{background:var(--blue-soft)}.agenda>div:nth-child(even){background:var(--violet-soft)}
  .agenda i{background:var(--blue);flex-shrink:0}.agenda>div:nth-child(even) i{background:var(--violet)}
  .headline{font: var(--mat-sys-headline-small);margin: var(--space-2) 0;letter-spacing: -.035em;font-size: clamp(var(--text-22),5.5cqw,var(--text-32));line-height: 1.2}.news-summary{font-size: var(--text-14)}
  .quiet-state{display: flex;flex-direction: column;height: 100%;justify-content: center;padding: var(--space-18) var(--space-8);text-align: left;align-items: flex-start;gap: var(--space-14)}.quiet-state h3{font-size: var(--text-22)}.quiet-state p{font-size: var(--text-13)}
  .compact-quotas{gap: var(--space-10)}.compact-quotas>div{padding: var(--space-12);border-radius: var(--radius-16);background:var(--violet-soft);color:var(--violet)}
  .compact-quotas>div:nth-child(2){background:var(--blue-soft);color:var(--blue);--widget-accent:var(--blue)}
  .compact-quotas strong{font-size: var(--text-34)}.compact-quotas .muted{color:inherit}.compact-opencode{flex-wrap:wrap;font-size: var(--text-12)}
  .quota-row{background:var(--violet-soft)}.quota-row:nth-of-type(even){background:var(--blue-soft);--widget-accent:var(--blue)}
  .opencode-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap: var(--space-6)}.opencode-metrics>div{padding: var(--space-8);background:var(--mint-soft)}.opencode-metrics>div:last-child{grid-column:auto}.opencode-metrics strong{font-size: var(--text-15);overflow-wrap:anywhere}
  .departures>div{background:var(--mint-soft)}.line-badge{background:var(--mint);color:var(--accent-on-mint)}
  .compact .sensor-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
  .compact .printer-hero{display:grid;grid-template-columns:1fr 1fr}.compact .printer-hero img{height:85px;min-height:0}
  .compact .printer-hero>div:last-child{display:block}.compact .printer-metrics>div:nth-child(-n+2){display:none}
  @container(max-width:360px){.forecast>div:nth-child(n+5){display:flex}.widget:not(.compact){padding: var(--space-14)}.opencode-metrics{grid-template-columns:repeat(3,minmax(0,1fr))}.opencode-metrics>div:last-child{grid-column:auto}}
  @container(min-width:480px){.sensor-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.metrics strong{font-size: var(--text-42)}.weather-hero{font-size: var(--text-76)}}
  .system-readings{display:grid;gap: var(--space-13)}
  .reading{--reading:var(--violet);display:grid;gap: var(--space-6);--widget-accent:var(--reading);--widget-accent-container:var(--mat-sys-surface-container-high)}
  .reading>div{display:flex;align-items:center;justify-content:space-between;gap: var(--space-12);font-size: var(--text-12)}
  .reading>div>span{display:flex;align-items:center;gap: var(--space-8)}.reading i{width:8px;height:8px;border-radius: var(--radius-3);background:var(--reading)}
  .reading strong{color:var(--reading);font-size: var(--text-13);font-variant-numeric:tabular-nums}
  .reading.gpu{--reading:var(--mint)}.reading.temperature{--reading:var(--amber)}.reading.memory{--reading:var(--blue)}
  .system-footer{display:flex;align-items:center;flex-wrap:wrap;gap: var(--space-7);padding-top: var(--space-8);border-top:1px solid var(--mat-sys-outline-variant)}
  .transfer{padding: var(--space-5) var(--space-8);border-radius: var(--radius-full);font-size: var(--text-10);font-variant-numeric:tabular-nums}.down{background:var(--mint-soft);color:var(--mint)}.up{background:var(--blue-soft);color:var(--blue)}
  .system-footer button{margin-left: auto;font-size: var(--text-11);padding: 0 var(--space-6);min-width:40px;min-height:28px;height:28px}
  .compact .system-readings{gap: var(--space-7)}.compact .reading{gap: var(--space-3)}.compact .reading.temperature{display:none}.compact .system-footer{padding-top: var(--space-4)}
  .printer-outline{width:100%;height:105px;min-height:0;border:0;background:var(--mint-soft);color:var(--mint)}
  .compact .printer-outline{height:85px;min-height:0}.printer-metrics strong{font-size: var(--text-13)}
  .weather-hero+h3+p{font-size: var(--text-12)}
  .widget[data-widget='weather'] .weather-hero{min-height:80px;padding: var(--space-8) var(--space-14);font-size: var(--text-56)}.weather-icon{width:58px;height:58px;font-size: var(--text-36)}
  .widget[data-widget='weather'] .fit-content{gap: var(--space-6)}
  .reading mat-progress-bar{--mat-progress-bar-active-indicator-color:var(--reading)}

  .compact-quotas>div:nth-child(2) mat-progress-bar{--mat-progress-bar-active-indicator-color:var(--blue)}

  .system-footer button{overflow:hidden}
  :host{container-type:size}
  .widget[data-widget='weather'] .fit-content,.widget[data-widget='bambu-lab'] .fit-content,.widget[data-widget='codex'] .fit-content,.widget[data-widget='google-calendar'] .fit-content{height:var(--body-height);min-height:0}
  .weather-layout,.printer-layout,.calendar-layout{display:flex;flex-direction:column;height:100%;min-height:0;gap: var(--space-8)}
  .weather-layout>*,.printer-layout>*{flex-shrink:0}
  .weather-now{display:flex;align-items:center;justify-content:space-between;gap: var(--space-10);flex:1 1 0;min-height:0;padding: var(--space-8) var(--space-14);border-radius: var(--radius-18);background:var(--amber-soft)}
  .weather-now>div{min-width:0}.weather-now>div>strong{display:block;max-width:100%;font-size: clamp(var(--text-36),13cqw,var(--text-64));line-height:.98;font-weight:500;letter-spacing:-.05em}
  .weather-now h3{margin-top: var(--space-4);font-size: var(--text-14)}.weather-details{font-size: var(--text-11);white-space:nowrap}
  .weather-layout .forecast{height:76px;gap: var(--space-4)}.weather-layout .forecast>div{justify-content:center;padding: var(--space-4) var(--space-1);gap: var(--space-6)}
  .printer-camera{flex:1 1 0;min-height:0;overflow:hidden;display:flex;align-items:center;justify-content:center;gap: var(--space-8);border-radius: var(--radius-16);background:var(--mint-soft);color:var(--mint);font-size: var(--text-11)}
  .printer-camera img{display:block;width:100%;height:100%;object-fit:cover}
  .printer-status{display:flex;align-items:center;justify-content:space-between;gap: var(--space-8);min-height:42px}.printer-status>div{min-width:0}.printer-status h3{font-size: var(--text-14);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.printer-status .eyebrow{font-size: var(--text-9)}.printer-status>strong{font-size: var(--text-30);line-height:1;color:var(--mint)}
  .printer-values{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap: var(--space-5);height:52px}
  .printer-values>div{display:flex;flex-direction:column;justify-content:center;gap: var(--space-4);padding: var(--space-6);border-radius: var(--radius-11);background:var(--mint-soft);color:var(--mint)}
  .printer-values>div:nth-child(n+3){background:var(--amber-soft);color:var(--amber)}.printer-values span{font-size: var(--text-9)}.printer-values strong{font-size: var(--text-11);white-space:nowrap}
  .usage-providers{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:minmax(0,1fr);gap: var(--space-10);height:100%;min-height:0}
  .usage-provider{display:flex;flex-direction:column;gap: var(--space-8);min-width:0;padding: var(--space-12);border-radius: var(--radius-16);background:var(--violet-soft)}
  .usage-provider.go{background:var(--mint-soft);--widget-accent:var(--mint)}.usage-provider h3{font-size: var(--text-13);display:flex;align-items:baseline;justify-content:space-between;gap: var(--space-4);flex-shrink:0}.usage-provider h3 small{font-size: var(--text-9);font-weight:400}
  .usage-meter{display:flex;flex-direction:column;gap: var(--space-5);min-height:0}.usage-meter>div{display:flex;justify-content:space-between;gap: var(--space-4);font-size: var(--text-11)}.usage-meter strong{font-size: var(--text-13)}.usage-provider.go mat-progress-bar{--mat-progress-bar-active-indicator-color:var(--mint)}
  .widget[data-widget='notes'] .fit-content>.note{flex:1 1 0;min-height:0;height:0}
  .widget[data-widget='volume'] mat-slider{min-width:0;margin-inline:24px}
  .widget[data-widget='codex'] .usage-providers{align-self:stretch;width:100%;padding-bottom:var(--space-2)}
  .widget[data-widget='codex'] .usage-provider{border-radius:var(--radius-16)}
  .calendar-layout{gap: var(--space-12)}.calendar-layout .calendar-date{height:72px;min-height:72px;padding: var(--space-10) var(--space-14);box-sizing:border-box}.calendar-layout .calendar-date>span{font-size: var(--text-44)}.calendar-layout .agenda{flex:1 1 auto;min-height:0}
  .calendar-layout .agenda{gap: var(--space-6)}.calendar-layout .agenda>div{height:52px;box-sizing:border-box;padding: var(--space-6) var(--space-10);flex-shrink:0;align-items:stretch}
  .calendar-layout .agenda section{min-width:0;display:flex;flex-direction:column;justify-content:center}.calendar-layout .agenda strong,.calendar-layout .agenda p{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size: var(--text-12);line-height:17px}.calendar-layout .agenda p{font-size: var(--text-11);margin: var(--space-2) 0 0}
  .compact[data-widget='system'] .reading.gpu,.compact[data-widget='system'] .reading.temperature{display:none}.compact[data-widget='system'] .system-readings{grid-template-columns:repeat(2,minmax(0,1fr))}
  .compact[data-widget='weather'] .weather-details{display:none}.compact[data-widget='weather'] .weather-layout{gap:var(--space-1)}
  .compact[data-widget='bambu-lab'] .printer-camera{max-height:72px}.widget[data-widget='bambu-lab'] .printer-values{grid-template-columns:repeat(2,minmax(0,1fr))}.spacious[data-widget='bambu-lab'] .printer-values{grid-template-columns:repeat(4,minmax(0,1fr))}
  .news-list{display:flex;flex-direction:column;gap:var(--space-5);min-height:0}.news-list>button{display:flex;flex-direction:column;gap:var(--space-4);min-height:34px;padding:var(--space-7) 0;text-align:left;border:0;border-bottom:1px solid var(--mat-sys-outline-variant);color:inherit}.news-list>button span{font-size:var(--text-11);color:var(--mat-sys-on-surface-variant);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.compact[data-widget='news'] .news-summary{display:none}
  .compact[data-widget='spotify'] .music-art{width:48px;height:48px}.compact[data-widget='spotify'] .row{gap:var(--space-4);padding-right:var(--space-4)}.compact[data-widget='battery'] .battery-detail{display:none}.compact[data-widget='volume'] .volume-hero{gap:var(--space-8)}
  .compact .quiet-state{gap:var(--space-4);padding:var(--space-12) var(--space-8)}.compact .quiet-state h3{font-size:var(--text-20);line-height:1.1}
  .compact[data-widget='idle-game'] .mission-map i{height:8px}.spacious[data-widget='idle-game'] .mission-map i{height:18px}
  .compact[data-widget='google-calendar'] .calendar-layout{gap:var(--space-4)}.compact[data-widget='google-calendar'] .calendar-date{height:30px;min-height:30px;padding:0}.compact[data-widget='google-calendar'] .calendar-date>span{font-size:var(--text-22)}.compact[data-widget='google-calendar'] .calendar-date>div{display:none}.compact[data-widget='google-calendar'] .agenda{gap:var(--space-2)}.compact[data-widget='google-calendar'] .agenda>div{height:36px;padding:var(--space-4) var(--space-6)}.compact[data-widget='google-calendar'] .agenda strong{font-size:var(--text-10);line-height:12px}.compact[data-widget='google-calendar'] .agenda p{font-size:var(--text-9);line-height:11px}
  .compact[data-widget='weather'] .weather-layout .forecast{height:34px}.compact[data-widget='weather'] .weather-layout .forecast>div{padding:var(--space-1) 0;gap:var(--space-1)}.compact[data-widget='weather'] .weather-layout .forecast span{font-size:var(--text-10)}.compact[data-widget='weather'] .weather-layout .forecast strong{font-size:var(--text-11)}.compact[data-widget='weather'] .weather-layout .forecast small{display:none}.compact[data-widget='weather'] .weather-now{padding:var(--space-1) var(--space-8)}.compact[data-widget='weather'] .weather-now>div>strong{font-size:var(--text-48);line-height:1}.compact[data-widget='weather'] .weather-now h3{display:none}
  .compact[data-widget='weather'] .fit-content{height:calc(var(--body-height) - var(--space-8))}
  .compact[data-widget='codex'] .usage-provider{padding:var(--space-8);gap:var(--space-5)}.compact[data-widget='codex'] .usage-provider h3{font-size:var(--text-11);gap:var(--space-2);flex-wrap:wrap}.compact[data-widget='codex'] .usage-provider h3 small{font-size:var(--text-9)}
  .focus-ring{width:min(160px,55cqw);height:min(160px,55cqw);border-width:clamp(6px,2.2cqw,12px)}
  @container(max-height:260px){.weather-layout{gap: var(--space-5)}.weather-layout .forecast{height:48px}.weather-layout .forecast small{display:none}.weather-now{padding: var(--space-4) var(--space-10)}.weather-now>div{display:flex;align-items:center;gap: var(--space-10)}.weather-now>div>strong{font-size: var(--text-36)}.weather-now h3{font-size: var(--text-12);margin: 0}.weather-now .weather-icon{width:36px;height:36px;font-size: var(--text-26)}.usage-provider{padding: var(--space-8);gap: var(--space-7)}.usage-provider h3{font-size: var(--text-12)}.usage-meter{gap: var(--space-3)}.printer-layout{gap: var(--space-5)}.printer-status{min-height:34px}.printer-status>strong{font-size: var(--text-24)}.printer-values{height:44px}}
  @container(max-width:320px){.compact[data-widget='system'] .reading{min-width:0}.compact[data-widget='system'] .reading>div{flex-wrap:wrap;gap:var(--space-3)}.compact[data-widget='system'] .reading>div>span{flex:1 1 100%;min-width:0}.compact[data-widget='system'] .reading>div>strong{flex:0 0 auto;margin-left:auto}}
`]})
export class WidgetComponent implements OnInit,OnDestroy,AfterViewInit,OnChanges {
  @Input() canExpand=true;@Input() id='clock';@Input() scale=1;@Output() manage=new EventEmitter<void>();@Output() play=new EventEmitter<void>();@Output() expand=new EventEmitter<void>();
  @ViewChild('container') container!:ElementRef<HTMLElement>;@ViewChild('content') content!:ElementRef<HTMLElement>;
  bridge=inject(Bridge);state=signal<ServiceState>({status:'loading',title:'',detail:''});now=signal(new Date());fit=signal(1);density=signal(1);layoutWidth=signal(240);capacityHeight=signal(240);compact=signal(false);spacious=signal(false);noteStatus=signal('All changes saved');gameSalvage=signal(0);note='';zones=['Europe/Oslo','America/New_York'];zoneLabels=['Oslo','New York'];squares=Array.from({length:40},(_,i)=>i);Math=Math;
  private unsubscribe=this.bridge.listen(e=>{if(e.event==='connections'&&!this.definition.preview&&!this.definition.retired&&!['notes','idle-game'].includes(this.id))void this.refresh();});
  private timer?:ReturnType<typeof setInterval>;private saveTimer?:ReturnType<typeof setTimeout>;private observer?:ResizeObserver;private ticks=0;private measureVersion=0;
  get definition(){return widgets.find(w=>w.id===this.id)??widgets[0];}
  ngOnInit(){if(this.id==='notes')this.bridge.call('note-read').then(data=>{this.note=data.text??'';this.state.set({status:'ready',title:'Notes',detail:'Saved on this PC'});}).catch(e=>this.noteStatus.set(e.message));else if(this.id==='idle-game')this.bridge.call('game-read').then(data=>{this.gameSalvage.set(data.salvage??0);this.state.set({status:'ready',title:'Scrapbots',detail:'Saved on this PC'});}).catch(()=>{});else if(!this.definition.preview&&!this.definition.retired)void this.refresh();this.timer=setInterval(()=>{this.now.set(new Date());this.ticks++;if(this.ticks%(['system','volume','battery'].includes(this.id)?2:this.id==='codex'?60:this.id==='bambu-lab'?10:['discord','spotify'].includes(this.id)?5:30)===0&&!['clock','notes','idle-game'].includes(this.id)&&!this.definition.preview&&!this.definition.retired)void this.refresh();},1000);}
  ngAfterViewInit(){this.observer=new ResizeObserver(()=>this.measure());this.observer.observe(this.container.nativeElement);}
  ngOnChanges(){requestAnimationFrame(()=>{if(this.container)this.measure();});}
  private measure(){
    const container=this.container.nativeElement;
    const scale=Math.max(.75,Math.min(3,this.scale));
    const pixelWidth=container.clientWidth,pixelHeight=container.clientHeight;
    if(pixelWidth<=0||pixelHeight<=0)return;
    const version=++this.measureVersion;
    const width=pixelWidth/scale,height=pixelHeight/scale;
    // Keep the user's preferred scale when it fits. If a tile is smaller than its
    // content at that scale, reduce only the rendered content enough to contain it.
    this.fit.set(scale);this.density.set(1);
    this.layoutWidth.set(width);this.capacityHeight.set(height);this.bodyHeight.set(height);
    this.compact.set(height<220||width<220);
    this.spacious.set(height>=420&&width>=440);
    requestAnimationFrame(()=>{
      if(version!==this.measureVersion)return;
      if(!container.isConnected||container.clientWidth!==pixelWidth||container.clientHeight!==pixelHeight)return;
      this.fitOverflow(pixelWidth,pixelHeight);
    });
  }
  private fitOverflow(pixelWidth=this.container.nativeElement.clientWidth,pixelHeight=this.container.nativeElement.clientHeight){
    const container=this.container.nativeElement,currentScale=this.fit();
    if(!container.isConnected||pixelWidth<=0||pixelHeight<=0||currentScale<=0||this.id==='weather')return;
    const fitRatio=Math.min(1,pixelWidth/Math.max(pixelWidth,container.scrollWidth),pixelHeight/Math.max(pixelHeight,container.scrollHeight));
    const effectiveScale=fitRatio<.995?Math.max(.55,currentScale*fitRatio*.99):currentScale;
    if(effectiveScale>=currentScale-.005)return;
    this.fit.set(effectiveScale);
    this.bodyHeight.set(pixelHeight/effectiveScale);
  }
  async refresh(){try{const state=await this.bridge.call<ServiceState>('service',{service:this.id});this.state.set(state);if(this.id==='clock'&&Array.isArray(state.data?.['zones'])){this.zones=(state.data!['zones'] as string[]).slice(0,4);this.zoneLabels=Array.isArray(state.data?.['labels'])?(state.data!['labels'] as string[]).slice(0,4):[];}}catch(e){this.state.set({status:'error',title:'Could not refresh',detail:(e as Error).message});}requestAnimationFrame(()=>{if(this.container)this.measure();});}
  contentLimit(id=this.id){return widgetContentLimit(id,this.layoutWidth(),this.capacityHeight());}
  bodyHeight=signal(240);
  printerValues(){return [
    {label:'Remaining',value:this.metric('minutes')+' min'},
    {label:'Layers',value:this.metric('layer')+' / '+this.metric('layers')},
    {label:'Nozzle',value:this.metric('nozzle').toFixed(0)+'°'},
    {label:'Bed',value:this.metric('bed').toFixed(0)+'°'}
  ].slice(0,this.contentLimit('bambu-lab'));}
  quotaLabel(window:any){const name=String(window.name??'').toLowerCase();return window.minutes===300||name==='rolling'?'5h':window.minutes===10080||name==='weekly'?'Weekly':window.minutes>=40320||name==='monthly'?'Monthly':window.minutes?window.minutes/60+'h':window.name;}
  quotaWindows(provider:string){return this.usageWindows(provider).filter(w=>['5h','Weekly','Monthly'].includes(this.quotaLabel(w)));}
  usageWindows(provider:string):any[]{return (this.state().data?.[provider] as any)?.windows??[];}
  controlError=signal('');
  async playback(action:string){this.controlError.set('');try{this.state.set(await this.bridge.call('spotify-playback',{action}));}catch(e){this.controlError.set((e as Error).message);}}
  async voice(key:'muted'|'deafened'){this.controlError.set('');try{this.state.set(await this.bridge.call('discord-voice',{[key]:!this.state().data?.[key]}));}catch(e){this.controlError.set((e as Error).message);}}
  resetTime(value:number){return value?'resets '+new Date(value*1000).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'reset time unavailable';}
  sensor(key:string,unit:string){const n=this.state().data?.[key];return typeof n==='number'?Math.round(n)+unit:'Unavailable';}
  throughput(key:string){const n=this.state().data?.[key];return typeof n==='number'?(n/1024).toFixed(1)+' KB/s':'Measuring…';}
  async volume(level:number){try{this.state.set(await this.bridge.call('volume',{level}));}catch(e){this.state.set({status:'error',title:'Could not change volume',detail:(e as Error).message});}}
  async mute(){this.state.set(await this.bridge.call('volume',{muted:!this.state().data?.['muted']}));}
  metric(key:string){return Number(this.state().data?.[key]??0);}
  weatherIcon(){const code=this.metric('code');return code<3?'☀':code<50?'☁':code<80?'☂':'☇';}
  worldTime(zone:string){try{return new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',minute:'2-digit'}).format(this.now());}catch{return 'Unknown zone';}}
  zoneLabel(index:number){return this.zoneLabels[index]??this.zones[index]?.split('/').pop()?.replaceAll('_',' ')??this.zones[index];}
  private noteRevision=0;
  saveNote(value:string){this.note=value;const revision=++this.noteRevision;this.noteStatus.set('Saving…');void this.bridge.call('note-save',{text:value}).then(()=>{if(revision===this.noteRevision)this.noteStatus.set('All changes saved');}).catch(e=>this.noteStatus.set(e.message));}
  external(url:string){void this.bridge.call('external',{url});}
  ngOnDestroy(){this.unsubscribe();clearInterval(this.timer);this.observer?.disconnect();if(this.saveTimer){clearTimeout(this.saveTimer);if(this.noteStatus()==='Saving…')void this.bridge.call('note-save',{text:this.note});}}
}
