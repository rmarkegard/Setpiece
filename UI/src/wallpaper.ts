import { Component,Input } from '@angular/core';
@Component({selector:'sp-wallpaper',standalone:true,template:`
<div class="art" [class.ambient]="id==='ambient'" [class.moving]="moving" [style.animation-delay]="phase" [style.background-image]="id==='ambient'?'':'url('+base+'.png)'">
@if(id!=='ambient'&&moving&&!failed){<video [src]="base+'.mp4'" [poster]="base+'.png'" autoplay muted loop playsinline (error)="failed=true" aria-hidden="true" (loadedmetadata)="synchronize($event)"></video>}
<div class="veil"></div></div>`,styles:[`
:host{display:block;position:absolute;inset:0;z-index: var(--z-wallpaper);pointer-events:none}.art{position:absolute;inset:0;background-size:cover;background-position:center}.ambient{background:radial-gradient(ellipse at 20% 70%,var(--mat-sys-tertiary-container),transparent 65%),radial-gradient(ellipse at 80% 20%,var(--mat-sys-primary-container),var(--mat-sys-surface-container-lowest));background-size:130% 130%}.ambient.moving{animation: breathe var(--motion-ambient, 24s) ease-in-out infinite alternate}video{width:100%;height:100%;object-fit:cover}.veil{position:absolute;inset:0;background:var(--wallpaper-veil)}@keyframes breathe{from{background-position:0% 0%;filter:saturate(.85)}to{background-position:100% 100%;filter:saturate(1.15)}}:host-context(.reduced-motion) .ambient{animation: none}
`]})
export class WallpaperComponent {
  private current='ambient';failed=false;
  @Input() set id(value:string){if(value!==this.current)this.failed=false;this.current=value;}get id(){return this.current;}
  @Input() moving=false;
  phase='-'+(Date.now()/1000%48)+'s';
  synchronize(event:Event){const video=event.target as HTMLVideoElement;if(Number.isFinite(video.duration)&&video.duration>0)video.currentTime=(Date.now()/1000)%video.duration;}
  get base(){return 'https://assets.setpiece.local/Wallpapers/'+this.id;}
}
