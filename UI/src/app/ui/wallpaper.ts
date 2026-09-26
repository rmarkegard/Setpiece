import {ChangeDetectionStrategy,Component,computed,input} from '@angular/core';

// The host serves wallpapers from its asset origin; the development mock points this at a local copy.
const assetBase=()=>(window as unknown as {setpieceAssetBase?:string}).setpieceAssetBase??'https://assets.setpiece.local/';
export const wallpaperUrl=(id:string)=>`${assetBase()}Wallpapers/${id}.jpg`;

@Component({
  selector:'sp-wallpaper',
  changeDetection:ChangeDetectionStrategy.OnPush,
  template:`
    <div class="art" [class.ambient]="id()==='ambient'" [class.moving]="moving()" [style.animation-delay]="phase" [style.background-image]="image()"></div>
    <div class="veil"></div>`,
  styles:`
    :host{display:block;position:absolute;inset:0;z-index:var(--z-wallpaper);pointer-events:none;overflow:hidden}
    .art{position:absolute;inset:0;background-size:cover;background-position:center}
    .art.moving:not(.ambient){animation:drift 48s ease-in-out infinite}
    .ambient{background:
      radial-gradient(ellipse at 18% 78%,var(--mat-sys-tertiary-container),transparent 60%),
      radial-gradient(ellipse at 82% 16%,var(--mat-sys-primary-container),transparent 62%),
      var(--mat-sys-surface-container-lowest);background-size:130% 130%}
    .ambient.moving{animation:breathe 24s ease-in-out infinite alternate}
    .veil{position:absolute;inset:0;background:var(--wallpaper-veil)}
    @keyframes drift{0%,100%{transform:scale(1.025) translate(-.35%,-.2%)}50%{transform:scale(1.065) translate(.35%,.2%)}}
    @keyframes breathe{from{background-position:0% 0%;filter:saturate(.85)}to{background-position:100% 100%;filter:saturate(1.15)}}
    :host-context(.reduced-motion) .art{animation:none}
    @media(prefers-reduced-motion:reduce){.art.moving{animation:none}}
  `
})
export class WallpaperComponent {
  readonly id=input('ambient');
  readonly moving=input(false);
  /** Every surface shares one drift phase, so neighbors line up across windows. */
  readonly phase='-'+(Date.now()/1000%48)+'s';
  readonly image=computed(()=>this.id()==='ambient'?'':`url("${wallpaperUrl(this.id())}")`);
}
