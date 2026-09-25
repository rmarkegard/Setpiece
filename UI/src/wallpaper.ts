import { Component,Input } from '@angular/core';
@Component({selector:'sp-wallpaper',standalone:true,template:`
<div class="art" [class.ambient]="id==='ambient'" [class.moving]="moving" [style.animation-delay]="phase" [style.background-image]="id==='ambient'?'':'url('+base+'.jpg)'"></div>
<div class="veil"></div>`,styles:[`
:host{display:block;position:absolute;inset:0;z-index:var(--z-wallpaper);pointer-events:none;overflow:hidden}
.art{position:absolute;inset:0;background-size:cover;background-position:center}
.art.moving:not(.ambient){animation:drift 48s ease-in-out infinite}
.ambient{background:radial-gradient(ellipse at 20% 70%,var(--mat-sys-tertiary-container),transparent 65%),radial-gradient(ellipse at 80% 20%,var(--mat-sys-primary-container),var(--mat-sys-surface-container-lowest));background-size:130% 130%}
.ambient.moving{animation:breathe var(--motion-ambient,24s) ease-in-out infinite alternate}
.veil{position:absolute;inset:0;background:var(--wallpaper-veil)}
@keyframes drift{0%,100%{transform:scale(1.025) translate(-.35%,-.2%)}50%{transform:scale(1.065) translate(.35%,.2%)}}
@keyframes breathe{from{background-position:0% 0%;filter:saturate(.85)}to{background-position:100% 100%;filter:saturate(1.15)}}
:host-context(.reduced-motion) .art{animation:none}
@media(prefers-reduced-motion:reduce){.art.moving:not(.ambient),.ambient.moving{animation:none}}
`]})
export class WallpaperComponent {
  @Input() id='ambient';
  @Input() moving=false;
  phase='-'+(Date.now()/1000%48)+'s';
  get base(){return 'https://assets.setpiece.local/Wallpapers/'+this.id;}
}
