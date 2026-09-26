import {ChangeDetectionStrategy,Component,computed,inject} from '@angular/core';
import {DecimalPipe,UpperCasePipe} from '@angular/common';
import {MatButtonModule} from '@angular/material/button';
import {MatButtonToggleModule} from '@angular/material/button-toggle';
import {MatSliderModule} from '@angular/material/slider';
import {MatSlideToggleModule} from '@angular/material/slide-toggle';
import {MatTooltipModule} from '@angular/material/tooltip';
import {wallpaperNames} from '../../../domain';
import {Appearance,accentColors,defaultAccent} from '../../../theme';
import {StudioStore} from '../../state/studio-store';
import {IconComponent} from '../../ui/icon';
import {PageHeaderComponent,SectionComponent} from '../../ui/kit';
import {WallpaperComponent} from '../../ui/wallpaper';

type SurfaceKey='opacity'|'dim'|'glow';

@Component({
  selector:'sp-appearance-page',
  changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[DecimalPipe,UpperCasePipe,MatButtonModule,MatButtonToggleModule,MatSliderModule,MatSlideToggleModule,MatTooltipModule,IconComponent,PageHeaderComponent,SectionComponent,WallpaperComponent],
  templateUrl:'./appearance-page.html',
  styleUrl:'./appearance-page.scss'
})
export class AppearancePage {
  readonly store=inject(StudioStore);
  readonly accents=accentColors;
  readonly defaultAccent=defaultAccent;
  readonly wallpapers=wallpaperNames;
  readonly surfaces:{key:SurfaceKey;label:string;supporting:string}[]=[
    {key:'opacity',label:'Surface opacity',supporting:'How solid widgets and tiles are over your wallpaper.'},
    {key:'dim',label:'Wallpaper dimming',supporting:'Darken the wallpaper so content stands out.'},
    {key:'glow',label:'Accent glow',supporting:'A soft halo of your accent around widgets.'}
  ];
  readonly custom=computed(()=>!accentColors.some(a=>a.color===this.store.appearance().accent));
  value(key:SurfaceKey){return this.store.appearance()[key];}
  set<K extends keyof Appearance>(key:K,value:Appearance[K]){this.store.appearanceChange(key,value);}
  pretty(id:string){return id.split('-').map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' ');}
}
