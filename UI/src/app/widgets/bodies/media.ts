import {ChangeDetectionStrategy,Component,computed,effect,inject,signal} from '@angular/core';
import {clock} from '../../../widget-format';
import {WidgetContext} from '../context';
import {onChange,pick} from '../motion';

/** A clip-path polygon that follows r(θ) inside the unit square. */
function outline(radius:(t:number)=>number){
  const pts:string[]=[];
  for(let k=0;k<72;k++){const t=k/72*Math.PI*2,r=Math.min(.5/Math.max(Math.abs(Math.cos(t)),Math.abs(Math.sin(t))),radius(t));pts.push((50+100*r*Math.cos(t)).toFixed(2)+'% '+(50+100*r*Math.sin(t)).toFixed(2)+'%');}
  return 'polygon('+pts.join(', ')+')';
}
/** Paused, the cover is a soft square; playing, it becomes a scalloped cookie that turns. */
const square=outline(t=>.5*Math.pow(Math.pow(Math.abs(Math.cos(t)),5)+Math.pow(Math.abs(Math.sin(t)),5),-1/5));
const cookie=outline(t=>.468+.032*Math.cos(9*t));
const wave=(()=>{let d='M0 8';for(let x=0,k=0;x<1400;x+=20,k++)d+=' Q'+(x+10)+' '+(k%2?18:-2)+' '+(x+20)+' 8';return d;})();
/** Cover art for tracks without artwork, one per track palette. */
const covers=[
  {bg:'oklch(.24 .07 285)',a:'oklch(.68 .19 355)',c:'oklch(.87 .12 85)',ax:0,ay:6,as:1,so:1,ro:0,sx:22,sy:-26},
  {bg:'oklch(.26 .08 250)',a:'oklch(.66 .13 200)',c:'oklch(.88 .09 320)',ax:-12,ay:-10,as:.78,so:0,ro:.9,sx:20,sy:22},
  {bg:'oklch(.2 .03 20)',a:'oklch(.6 .2 25)',c:'oklch(.93 .03 90)',ax:10,ay:12,as:1.14,so:.55,ro:.45,sx:-24,sy:-22},
  {bg:'oklch(.32 .1 300)',a:'oklch(.8 .15 65)',c:'oklch(.7 .18 340)',ax:0,ay:16,as:1.2,so:1,ro:0,sx:-22,sy:-28}
];

/** Spotify: the cover becomes a spinning cookie while it plays; the progress line waves. */
@Component({
  selector:'sp-spotify-body',
  changeDetection:ChangeDetectionStrategy.OnPush,
  template:`
    <div class="mu-art-wrap">
      <div class="mu-art" [style.clip-path]="playing()?cookie:square">
        <div class="mu-art-in" [class.settle]="settling()" [style.transform]="'rotate('+angle()+'deg)'">
          @if(image();as src){<img [src]="src" [attr.alt]="'Cover art for '+w.state().title" style="display: block; width: 100%; height: 100%; object-fit: cover">}
          @else{
            <svg viewBox="0 0 100 100" role="img" [attr.aria-label]="'Cover art for '+w.state().title">
              <rect x="0" y="0" width="100" height="100" [style.fill]="cover().bg"></rect>
              <circle class="mu-ring" cx="50" cy="50" r="41" [style.stroke]="cover().c" [style.opacity]="cover().ro"></circle>
              <circle class="mu-big" cx="50" cy="50" r="30" [style.fill]="cover().a" [style.transform]="'translate('+cover().ax+'px, '+cover().ay+'px) scale('+cover().as+')'"></circle>
              <g [style.opacity]="cover().so" style="transition: opacity .6s"><rect x="0" y="62" width="100" height="3" [style.fill]="cover().bg"></rect><rect x="0" y="70" width="100" height="4" [style.fill]="cover().bg"></rect><rect x="0" y="79" width="100" height="5" [style.fill]="cover().bg"></rect><rect x="0" y="89" width="100" height="6" [style.fill]="cover().bg"></rect></g>
              <circle class="mu-small" cx="50" cy="50" r="7" [style.fill]="cover().c" [style.transform]="'translate('+cover().sx+'px, '+cover().sy+'px)'"></circle>
            </svg>
          }
        </div>
      </div>
    </div>
    <div class="mu-side">
      <span class="eyebrow"><span class="mu-eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span>{{playing()?'Playing on '+(device()||'Spotify'):'Paused'}}</span>
      <div class="mu-copy"><div class="mu-title clamp2">{{w.state().title}}</div><div class="mu-artist clip">{{artistLine()}}</div></div>
      <div class="mu-prog">
        <div class="mu-track" role="progressbar" aria-label="Track progress" aria-valuemin="0" aria-valuemax="100" [attr.aria-valuenow]="rounded()">
          <div class="mu-played" [style.width]="'calc('+percent()+'% - 5px)'"><svg class="mu-wave" viewBox="0 0 1400 16" aria-hidden="true"><path [attr.d]="wave"></path></svg></div>
          <span class="mu-rest" [style.width]="'calc('+(100-percent())+'% - 5px)'"></span>
          <span class="mu-thumb" [style.left.%]="percent()"></span>
        </div>
        <div class="mu-times"><span>{{elapsed()}}</span><span>{{total()}}</span></div>
      </div>
      <div class="mu-ctl">
        <button class="ibtn" type="button" aria-label="Previous track" (click)="w.control('spotify-playback',{action:'previous'})"><svg class="ic f" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6h2.2v12H6zM9.6 12 18 6.2v11.6z"></path></svg></button>
        <button class="mu-play" [class.on]="playing()" type="button" [attr.aria-label]="playing()?'Pause':'Play'" (click)="w.control('spotify-playback',{action:playing()?'pause':'play'})">
          @if(playing()){<svg class="ic f" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5.5h3.4v13H7zM13.6 5.5H17v13h-3.4z"></path></svg>}
          @else{<svg class="ic f" viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 5.6v12.8a.8.8 0 0 0 1.2.7l10-6.4a.8.8 0 0 0 0-1.4l-10-6.4a.8.8 0 0 0-1.2.7z"></path></svg>}
        </button>
        <button class="ibtn" type="button" aria-label="Next track" (click)="w.control('spotify-playback',{action:'next'})"><svg class="ic f" viewBox="0 0 24 24" aria-hidden="true"><path d="M15.8 6H18v12h-2.2zM6 6.2 14.4 12 6 17.8z"></path></svg></button>
        <button class="ibtn mu-like" [class.on]="liked()" type="button" [attr.aria-pressed]="liked()" aria-label="Save to your library" (click)="w.control('spotify-like',{liked:!liked()})"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7.5-4.6-7.5-10.4A4.1 4.1 0 0 1 12 7.3a4.1 4.1 0 0 1 7.5 2.3C19.5 15.4 12 20 12 20z"></path></svg><span class="burst" [class.go]="celebrate()"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span></button>
      </div>
    </div>`,
  styleUrl:'./body.scss'
})
export class SpotifyBody {
  readonly w=inject(WidgetContext);
  readonly cookie=cookie;
  readonly square=square;
  readonly wave=wave;
  readonly angle=signal(0);
  readonly settling=signal(false);
  readonly celebrate=signal(false);
  readonly playing=computed(()=>!!this.w.state().data?.['playing']);
  readonly liked=computed(()=>!!this.w.state().data?.['liked']);
  readonly image=computed(()=>this.w.state().data?.['image'] as string|undefined);
  readonly device=computed(()=>String(this.w.state().data?.['device']??''));
  private readonly track=computed(()=>String(this.w.state().data?.['track']||this.w.state().title+'|'+this.w.state().detail));
  /** The card borrows one of four palettes, picked by the track. */
  readonly palette=computed(()=>pick(this.track(),covers.length));
  readonly cover=computed(()=>covers[this.palette()]);
  readonly artistLine=computed(()=>{const album=String(this.w.state().data?.['album']??'');return this.w.state().detail+(album&&!this.w.state().detail.includes(album)?' · '+album:'');});
  private readonly duration=computed(()=>Math.max(1,this.w.metric('duration')));
  /** Progress keeps moving between refreshes while the track plays. */
  private readonly position=computed(()=>Math.min(this.duration(),this.w.metric('progress')+(this.playing()?this.w.now().getTime()-this.w.receivedAt():0)));
  readonly percent=computed(()=>Math.min(100,this.position()/this.duration()*100));
  readonly rounded=computed(()=>Math.round(this.percent()));
  readonly elapsed=computed(()=>clock(this.position()));
  readonly total=computed(()=>clock(this.duration()));
  constructor(){
    effect(()=>this.w.cardClass.set('trk-'+this.palette()+' '+(this.playing()?'playing':'paused')));
    // The cover turns a little every second while the track plays, and settles upright when paused.
    onChange(()=>this.w.now().getTime(),()=>{if(this.playing()){this.settling.set(false);this.angle.update(a=>a+9);}});
    onChange(()=>this.playing(),playing=>{if(!playing){this.settling.set(true);this.angle.update(a=>Math.ceil(a/360)*360);}this.w.fire('toggle',700);});
    onChange(()=>this.track(),()=>this.w.fire('next',820));
    onChange(()=>this.liked(),liked=>{if(liked){this.w.fire('like',1100);this.celebrate.set(true);setTimeout(()=>this.celebrate.set(false),1100);}});
  }
}
