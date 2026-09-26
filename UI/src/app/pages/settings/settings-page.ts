import {ChangeDetectionStrategy,Component,inject} from '@angular/core';
import {DecimalPipe} from '@angular/common';
import {MatButtonModule} from '@angular/material/button';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {MatSliderModule} from '@angular/material/slider';
import {MatSlideToggleModule} from '@angular/material/slide-toggle';
import {MatTooltipModule} from '@angular/material/tooltip';
import {fontScaleRange,uiScaleRange} from '../../../theme';
import {StudioStore} from '../../state/studio-store';
import {Dialogs} from '../../dialogs/dialogs';
import {IconComponent} from '../../ui/icon';
import {PageHeaderComponent,RowComponent,SectionComponent} from '../../ui/kit';

@Component({
  selector:'sp-settings-page',
  changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[DecimalPipe,MatButtonModule,MatProgressSpinnerModule,MatSliderModule,MatSlideToggleModule,MatTooltipModule,IconComponent,PageHeaderComponent,RowComponent,SectionComponent],
  templateUrl:'./settings-page.html',
  styleUrl:'./settings-page.scss'
})
export class SettingsPage {
  readonly store=inject(StudioStore);
  readonly dialogs=inject(Dialogs);
  readonly uiRange=uiScaleRange;
  readonly fontRange=fontScaleRange;
  readonly shortcuts=[{keys:['Ctrl','S'],label:'Save the workspace'},{keys:['Ctrl','Z'],label:'Undo a layout change'},{keys:['Ctrl','Shift','Z'],label:'Redo'},{keys:['Esc'],label:'Cancel a drag or a layout preview'}];
  copy(text:string){void navigator.clipboard?.writeText(text).then(()=>this.store.notify('Copied'));}
}
