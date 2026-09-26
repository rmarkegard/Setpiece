import {ChangeDetectionStrategy,Component,computed,inject} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatMenuModule} from '@angular/material/menu';
import {MatTooltipModule} from '@angular/material/tooltip';
import {presetKinds,widgetDefinition} from '../../../domain';
import {StudioStore} from '../../state/studio-store';
import {IconComponent} from '../../ui/icon';
import {BoardCanvas} from './board-canvas';
import {Inspector} from './inspector';

@Component({
  selector:'sp-studio-page',
  changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[MatButtonModule,MatMenuModule,MatTooltipModule,IconComponent,BoardCanvas,Inspector],
  templateUrl:'./studio-page.html',
  styleUrl:'./studio-page.scss'
})
export class StudioPage {
  readonly store=inject(StudioStore);
  readonly presets=presetKinds;
  readonly quickAdd=['clock','weather','notes'].map(widgetDefinition);
  readonly presetName=computed(()=>presetKinds.find(p=>p.kind===this.store.presetKind())?.name??'Layout');
  readonly losing=computed(()=>Math.max(0,this.store.board().Zones.length-this.store.presetCount()));
  displayState(index:number){const p=this.store.profile();return !p.MonitorIndices.includes(index)?'available':p.MonitorIndex===index?'editing':'included';}
  choosePreset(kind:string){this.store.showPreset(kind,Math.max(2,Math.min(6,this.store.board().Zones.length)));}
}
