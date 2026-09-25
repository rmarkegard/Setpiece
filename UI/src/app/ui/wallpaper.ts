import {ChangeDetectionStrategy,Component,computed,effect,input,signal} from '@angular/core';

// The host serves wallpapers from its asset origin; the development mock points this at a local copy.
const assetBase=()=>(window as unknown as {setpieceAssetBase?:string}).setpieceAssetBase??'https://assets.setpiece.local/';
export const wallpaperUrl=(id:string,extension:'png'|'mp4')=>`${assetBase()}Wallpapers/${id}.${extension}`;

@Component({
  selector:'sp-wallpaper',
  changeDetection:ChangeDetectionStrategy.OnPush,
  template:`
    <div class="art" [class.ambient]="id()==='ambient'" [class.moving]="moving()" [style.animation-delay]="phase" [style.background-image]="image()">
      @if(id()!=='ambient'&&moving()&&!failed()){
        <video [src]="video()" [poster]="poster()" autoplay muted loop playsinline aria-hidden="true" (error)="failed.set(true)" (loadedmetadata)="synchronize($event)"></video>
      }
      <div class="veil"></div>
    </div>`,
  styles:`
    :host{display:block;position:absolute;inset:0;z-index:var(--z-wallpaper);pointer-events:none}
    .art{position:absolute;inset:0;background-size:cover;background-position:center}
    .ambient{background:
      radial-gradient(ellipse at 18% 78%,var(--mat-sys-tertiary-container),transparent 60%),
      radial-gradient(ellipse at 82% 16%,var(--mat-sys-primary-container),transparent 62%),
      var(--mat-sys-surface-container-lowest);background-size:130% 130%}
    .ambient.moving{animation:breathe 24s ease-in-out infinite alternate}
    video{width:100%;height:100%;object-fit:cover}
    .veil{position:absolute;inset:0;background:var(--wallpaper-veil)}
    @keyframes breathe{from{background-position:0% 0%;filter:saturate(.85)}to{background-position:100% 100%;filter:saturate(1.15)}}
  `
})
export class WallpaperComponent {
  readonly id=input('ambient');
  readonly moving=input(false);
  readonly failed=signal(false);
  readonly phase='-'+(Date.now()/1000%48)+'s';
  readonly image=computed(()=>this.id()==='ambient'?'':`url("${wallpaperUrl(this.id(),'png')}")`);
  readonly poster=computed(()=>wallpaperUrl(this.id(),'png'));
  readonly video=computed(()=>wallpaperUrl(this.id(),'mp4'));
  constructor(){effect(()=>{this.id();this.failed.set(false);});}
  /** Every surface plays the same loop in step, so neighbors line up across windows. */
  synchronize(event:Event){const video=event.target as HTMLVideoElement;if(Number.isFinite(video.duration)&&video.duration>0)video.currentTime=(Date.now()/1000)%video.duration;}
}
