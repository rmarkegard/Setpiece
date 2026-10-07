import {ChangeDetectionStrategy,Component,computed,input} from '@angular/core';

// The host serves wallpapers from its asset origin; the development mock points this at a local copy.
const assetBase=()=>(window as unknown as {setpieceAssetBase?:string}).setpieceAssetBase??'https://assets.setpiece.local/';
export const wallpaperUrl=(id:string)=>`${assetBase()}Wallpapers/${id}.jpg`;

@Component({
  selector:'sp-wallpaper',
  changeDetection:ChangeDetectionStrategy.OnPush,
  template:`
    <div class="art" [class.ambient]="id()==='ambient'" [style.background-image]="image()"></div>
    <div class="veil"></div>`,
  styles:`
    :host{display:block;position:absolute;inset:0;z-index:var(--z-wallpaper);pointer-events:none;overflow:hidden}
    .art{position:absolute;inset:0;background-size:cover;background-position:center}
    .ambient{background:
      radial-gradient(ellipse at 18% 78%,var(--mat-sys-tertiary-container),transparent 60%),
      radial-gradient(ellipse at 82% 16%,var(--mat-sys-primary-container),transparent 62%),
      var(--mat-sys-surface-container-lowest);background-size:130% 130%}
    .veil{position:absolute;inset:0;background:var(--wallpaper-veil)}
  `
})
export class WallpaperComponent {
  readonly id=input('ambient');
  readonly image=computed(()=>this.id()==='ambient'?'':`url("${wallpaperUrl(this.id())}")`);
}
