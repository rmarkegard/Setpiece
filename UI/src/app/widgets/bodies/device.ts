import {ChangeDetectionStrategy,Component,computed,inject} from '@angular/core';
import {DecimalPipe} from '@angular/common';
import {MatButtonModule} from '@angular/material/button';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {MatSliderModule} from '@angular/material/slider';
import {MatTooltipModule} from '@angular/material/tooltip';
import {IconComponent} from '../../ui/icon';
import {WidgetContext} from '../context';

const throughput=(n:unknown)=>typeof n==='number'?(n>=1024*1024?(n/1024/1024).toFixed(1)+' MB/s':(n/1024).toFixed(n>=10240?0:1)+' KB/s'):'…';

@Component({
  selector:'sp-system-body',
  changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[MatProgressBarModule,IconComponent],
  template:`
    <div class="readings grow">
      @for(reading of readings();track reading.label){
        <div class="meter">
          <span class="meter-label"><span>{{reading.label}}</span><span class="meter-value">{{reading.text}}</span></span>
          @if(reading.value!==null){<mat-progress-bar [value]="reading.value" [attr.aria-label]="reading.label"/>}
        </div>
      }
    </div>
    @if(!(w.short()&&w.narrow())){<div class="chips push">
      <span class="chip"><sp-icon name="arrow_downward"/>{{down()}}</span>
      <span class="chip"><sp-icon name="arrow_upward"/>{{up()}}</span>
    </div>}`,
  styleUrl:'./body.scss',
  styles:`
    .readings{display:grid;grid-template-columns:1fr;align-content:center;gap:var(--space-3)}
    :host-context(.compact) .readings{grid-template-columns:1fr 1fr;gap:var(--space-2) var(--space-3)}
    :host-context(.spacious) .readings{grid-template-columns:1fr 1fr;gap:var(--space-5) var(--space-4)}
  `
})
export class SystemBody {
  readonly w=inject(WidgetContext);
  private sensor(key:string){const n=this.w.state().data?.[key];return typeof n==='number'?n:null;}
  readonly readings=computed(()=>{
    const gpu=this.sensor('gpu'),temperature=this.sensor('temperature');
    return [
      {label:'CPU',value:this.w.metric('cpu'),text:Math.round(this.w.metric('cpu'))+'%'},
      {label:this.w.compact()?'RAM':'Memory',value:this.w.metric('memory'),text:Math.round(this.w.metric('memory'))+'%'},
      {label:'GPU',value:gpu,text:gpu===null?'Off':Math.round(gpu)+'%'},
      {label:this.w.compact()?'Temp':'CPU temp',value:temperature,text:temperature===null?'Off':Math.round(temperature)+'°'}
    ];
  });
  readonly down=computed(()=>throughput(this.w.state().data?.['download']));
  readonly up=computed(()=>throughput(this.w.state().data?.['upload']));
}

@Component({
  selector:'sp-battery-body',
  changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[MatProgressBarModule,IconComponent],
  template:`
    <span class="eyebrow"><sp-icon [name]="charging()?'bolt':'battery_horiz_075'"/><span>{{charging()?'Charging':'On battery'}}</span></span>
    <div class="row spread push">
      <span class="hero">{{level()}}<small>%</small></span>
      <span class="cell"><sp-icon [name]="icon()" [filled]="true"/></span>
    </div>
    <mat-progress-bar [value]="level()" aria-label="Battery level"/>
    @if(!w.compact()){<p class="muted">{{w.state().detail}}</p>}`,
  styleUrl:'./body.scss',
  styles:`
    .cell{display:grid;place-items:center;width:1.4em;height:1.4em;font-size:48px;border-radius:var(--shape-lg);background:var(--w-inset-strong)}
    .cell sp-icon{font-size:.7em;rotate:90deg}
    :host-context(.compact) .cell{display:none}
  `
})
export class BatteryBody {
  readonly w=inject(WidgetContext);
  readonly level=computed(()=>Math.round(this.w.metric('level')||parseInt(this.w.state().title)||0));
  readonly charging=computed(()=>!!this.w.state().data?.['charging']);
  readonly icon=computed(()=>this.charging()?'battery_charging_full':this.level()>85?'battery_full':this.level()>55?'battery_5_bar':this.level()>25?'battery_3_bar':'battery_1_bar');
}

@Component({
  selector:'sp-volume-body',
  changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[MatButtonModule,MatSliderModule,MatProgressBarModule,MatTooltipModule,IconComponent],
  template:`
    <span class="eyebrow"><sp-icon name="speaker"/><span>{{w.state().detail||'Windows output'}}</span></span>
    <div class="row spread push">
      <span class="hero" [class.muted]="muted()">{{level()}}<small>%</small></span>
      <button class="mute" matIconButton [attr.aria-pressed]="muted()" [matTooltip]="muted()?'Unmute':'Mute'" [attr.aria-label]="muted()?'Unmute':'Mute'" (click)="w.control('volume',{muted:!muted()})">
        <sp-icon [name]="muted()?'volume_off':'volume_up'" [filled]="true"/>
      </button>
    </div>
    <mat-slider min="0" max="100" step="1"><input matSliderThumb aria-label="Output volume" [value]="level()" (valueChange)="w.control('volume',{level:$event})"></mat-slider>
    @if(w.spacious()){<mat-progress-bar class="peak" [value]="w.metric('peak')" aria-label="Live audio level"/>}`,
  styleUrl:'./body.scss',
  styles:`
    mat-slider{width:calc(100% + 16px);margin:0 -8px}
    .mute{width:64px;height:64px;padding:0;border-radius:var(--shape-lg);background:var(--w-inset-strong);transition:border-radius var(--motion-spatial-fast)}
    .mute[aria-pressed=true]{border-radius:50%;background:var(--w-fg);color:var(--w-container);--mat-icon-button-icon-color:var(--w-container)}
    .mute sp-icon{font-size:28px}
    :host-context(.compact) .mute{width:48px;height:48px}
    .peak{--mat-progress-bar-track-height:4px;--mat-progress-bar-active-indicator-height:4px}
  `
})
export class VolumeBody {
  readonly w=inject(WidgetContext);
  readonly level=computed(()=>Math.round(this.w.metric('level')));
  readonly muted=computed(()=>!!this.w.state().data?.['muted']);
}

interface QuotaWindow {name?:string;minutes?:number;used:number;}

@Component({
  selector:'sp-usage-body',
  changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[DecimalPipe,MatProgressBarModule],
  template:`
    <div class="providers grow">
      @for(provider of providers;track provider.key){
        <section>
          <span class="eyebrow"><span>{{provider.name}}</span></span>
          @for(window of windows(provider.key).slice(0,w.contentLimit());track $index){
            <div class="meter">
              <span class="meter-label"><span>{{w.compact()?brief(label(window)):label(window)}}</span><span class="meter-value">{{window.used|number:'1.0-0'}}%</span></span>
              <mat-progress-bar [value]="window.used" [attr.aria-label]="provider.name+' '+label(window)"/>
            </div>
          } @empty {<p class="muted">Limits unavailable</p>}
        </section>
      }
    </div>`,
  styleUrl:'./body.scss',
  styles:`
    .providers{display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4);align-content:center}
    section{display:flex;flex-direction:column;gap:var(--space-3);min-width:0}
    :host-context(.compact) .providers{gap:var(--space-3)}
    :host-context(.compact) section{gap:var(--space-2)}
  `
})
export class UsageBody {
  readonly w=inject(WidgetContext);
  readonly providers=[{key:'codex',name:'Codex'},{key:'go',name:'OpenCode'}];
  brief(label:string){return ({'5 hours':'5h',Weekly:'Week',Monthly:'Month'} as Record<string,string>)[label]??label;}
  label(window:QuotaWindow){const name=String(window.name??'').toLowerCase();return window.minutes===300||name==='rolling'?'5 hours':window.minutes===10080||name==='weekly'?'Weekly':(window.minutes??0)>=40320||name==='monthly'?'Monthly':window.minutes?window.minutes/60+' hours':window.name??'';}
  windows(provider:string):QuotaWindow[]{return ((this.w.state().data?.[provider] as {windows?:QuotaWindow[]})?.windows??[]).filter(w=>['5 hours','Weekly','Monthly'].includes(this.label(w)));}
}

@Component({
  selector:'sp-printer-body',
  changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[DecimalPipe,MatProgressBarModule,IconComponent],
  template:`
    @if(!w.short()){
      <div class="camera grow">
        @if(image()){<img [src]="image()" alt="Latest printer camera frame">}
        @else{<sp-icon name="videocam_off"/><span class="muted">Camera unavailable</span>}
      </div>
    }
    <div class="row spread" [class.push]="w.short()">
      <div class="list-copy"><span class="eyebrow"><span>{{w.state().data?.['stage']}}</span></span><strong class="title clip">{{w.state().title}}</strong></div>
      <span class="hero md">{{w.metric('progress')|number:'1.0-0'}}<small>%</small></span>
    </div>
    <mat-progress-bar [value]="w.metric('progress')" aria-label="Print progress"/>
    <div class="facts">
      @for(fact of facts();track fact.label){<div><span class="muted">{{fact.label}}</span><strong>{{fact.value}}</strong></div>}
    </div>`,
  styleUrl:'./body.scss',
  styles:`
    .camera{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:var(--space-2);min-height:80px;border-radius:var(--shape-lg);background:var(--w-inset);overflow:hidden}
    .camera img{width:100%;height:100%;object-fit:cover}
    .camera sp-icon{font-size:32px}
    .facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(88px,1fr));gap:3px}
    .facts div{display:flex;flex-direction:column;gap:2px;padding:var(--space-2) var(--space-3);border-radius:var(--shape-xs);background:var(--w-inset);font:var(--mat-sys-label-medium)}
    .facts div:first-child{border-top-left-radius:var(--shape-lg);border-bottom-left-radius:var(--shape-lg)}
    .facts div:last-child{border-top-right-radius:var(--shape-lg);border-bottom-right-radius:var(--shape-lg)}
    .facts strong{font-family:var(--font-brand);font-weight:600;font-size:16px;font-variant-numeric:tabular-nums}
  `
})
export class PrinterBody {
  readonly w=inject(WidgetContext);
  readonly image=computed(()=>this.w.state().data?.['image'] as string|undefined);
  readonly facts=computed(()=>[
    {label:'Remaining',value:this.w.metric('minutes')+' min'},
    {label:'Layer',value:this.w.metric('layer')+' / '+this.w.metric('layers')},
    {label:'Nozzle',value:this.w.metric('nozzle').toFixed(0)+'°'},
    {label:'Bed',value:this.w.metric('bed').toFixed(0)+'°'}
  ].slice(0,this.w.contentLimit('bambu-lab')));
}
