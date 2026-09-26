import {ChangeDetectionStrategy,Component,computed,inject} from '@angular/core';
import {DecimalPipe} from '@angular/common';
import {MatButtonModule} from '@angular/material/button';
import {MatButtonToggleModule} from '@angular/material/button-toggle';
import {MatMenuModule} from '@angular/material/menu';
import {MatSliderModule} from '@angular/material/slider';
import {MatSlideToggleModule} from '@angular/material/slide-toggle';
import {MatTooltipModule} from '@angular/material/tooltip';
import {widgetDefinition} from '../../../domain';
import {StudioStore} from '../../state/studio-store';
import {IconComponent} from '../../ui/icon';

@Component({
  selector:'sp-inspector',
  changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[DecimalPipe,MatButtonModule,MatButtonToggleModule,MatMenuModule,MatSliderModule,MatSlideToggleModule,MatTooltipModule,IconComponent],
  templateUrl:'./inspector.html',
  styleUrl:'./inspector.scss'
})
export class Inspector {
  readonly store=inject(StudioStore);
  readonly widget=computed(()=>{const t=this.store.tile();return t?.ContentKind==='Widget'?widgetDefinition(t.WidgetId):null;});
  readonly full=computed(()=>this.store.board().Zones.length>=20);
  readonly snap=computed(()=>this.store.profile().SmartSnap?String(this.store.profile().SnapStep):'off');
  readonly snapSteps=[{value:'off',label:'Off'},{value:'0.01',label:'1%'},{value:'0.05',label:'5%'},{value:'0.1',label:'10%'},{value:'0.2',label:'20%'}];
  readonly heading=computed(()=>{
    const t=this.store.tile();if(!t)return '';
    return t.ContentKind==='Widget'?this.widget()!.name:t.ContentKind==='Web'?(t.SharedWebName||'Browser'):(t.AssignedProcessName||'Empty tile');
  });
  readonly icon=computed(()=>{const t=this.store.tile();return !t?'':t.ContentKind==='Widget'?this.widget()!.icon:t.ContentKind==='Web'?'language':t.AssignedProcessName?'web_asset':'crop_free';});
}
