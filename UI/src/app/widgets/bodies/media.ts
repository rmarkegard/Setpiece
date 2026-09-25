import {ChangeDetectionStrategy,Component,computed,inject} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {MatTooltipModule} from '@angular/material/tooltip';
import {IconComponent} from '../../ui/icon';
import {WidgetContext} from '../context';

const clock=(ms:number)=>{const s=Math.max(0,Math.round(ms/1000));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');};

@Component({
  selector:'sp-spotify-body',
  changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[MatButtonModule,MatProgressBarModule,MatTooltipModule,IconComponent],
  template:`
    <div class="track" [class.stacked]="w.spacious()||(!w.short()&&w.narrow())">
      <div class="art" [class.playing]="playing()">
        @if(image()){<img [src]="image()" alt="Album artwork">}@else{<sp-icon name="music_note" [filled]="true"/>}
      </div>
      <div class="list-copy">
        <strong class="song clamp-2">{{w.state().title}}</strong>
        <span class="clip">{{w.state().detail}}</span>
      </div>
    </div>
    @if(!w.compact()){
      <div class="progress push">
        <mat-progress-bar [value]="percent()" aria-label="Track progress"/>
        <div class="row spread muted times"><span>{{elapsed()}}</span><span>{{total()}}</span></div>
      </div>
    }
    <div class="controls" [class.push]="w.compact()">
      <button matIconButton matTooltip="Previous" aria-label="Previous track" (click)="w.control('spotify-playback',{action:'previous'})"><sp-icon name="skip_previous" [filled]="true"/></button>
      <button class="play" [class.playing]="playing()" [attr.aria-label]="playing()?'Pause':'Play'" (click)="w.control('spotify-playback',{action:playing()?'pause':'play'})"><sp-icon [name]="playing()?'pause':'play_arrow'" [filled]="true"/></button>
      <button matIconButton matTooltip="Next" aria-label="Next track" (click)="w.control('spotify-playback',{action:'next'})"><sp-icon name="skip_next" [filled]="true"/></button>
      @if(w.spacious()){<button class="open" matButton="tonal" (click)="w.external('https://open.spotify.com')">Open Spotify</button>}
    </div>`,
  styleUrl:'./body.scss',
  styles:`
    .track{display:flex;align-items:center;gap:var(--space-3);min-width:0}
    .track.stacked{flex-direction:column;align-items:flex-start;flex:1;min-height:0}
    .art{display:grid;place-items:center;flex-shrink:0;width:72px;aspect-ratio:1;border-radius:var(--shape-md);background:var(--w-inset-strong);overflow:hidden;transition:border-radius var(--motion-spatial)}
    .art.playing{border-radius:var(--shape-xl)}
    .art img{width:100%;height:100%;object-fit:cover}
    .art sp-icon{font-size:32px}
    .stacked .art{align-self:stretch;width:auto;height:auto;aspect-ratio:auto;flex:1 1 0;min-height:80px;border-radius:var(--shape-xl)}
    .stacked .art sp-icon{font-size:56px}
    :host-context(.compact) .art{width:52px}
    .song{font-family:var(--font-brand);font-weight:600;font-stretch:var(--font-hero-stretch);font-size:20px;line-height:1.2}
    :host-context(.spacious) .song{font-size:26px}
    .progress{display:flex;flex-direction:column;gap:var(--space-1)}
    .times{font:var(--mat-sys-label-medium);font-variant-numeric:tabular-nums}
    .controls{display:flex;align-items:center;gap:var(--space-2)}
    .play{display:grid;place-items:center;width:56px;height:56px;border:0;cursor:pointer;border-radius:50%;background:var(--w-fg);color:var(--w-container);transition:border-radius var(--motion-spatial-fast),transform var(--motion-spatial-fast)}
    .play.playing{border-radius:var(--shape-lg)}
    .play:active{transform:scale(.94)}
    .play sp-icon{font-size:30px}
    :host-context(.compact) .play{width:44px;height:44px}
    .open{margin-left:auto}
  `
})
export class SpotifyBody {
  readonly w=inject(WidgetContext);
  readonly playing=computed(()=>!!this.w.state().data?.['playing']);
  readonly image=computed(()=>this.w.state().data?.['image'] as string|undefined);
  readonly percent=computed(()=>this.w.metric('progress')/Math.max(1,this.w.metric('duration'))*100);
  readonly elapsed=computed(()=>clock(this.w.metric('progress')));
  readonly total=computed(()=>clock(this.w.metric('duration')));
}
