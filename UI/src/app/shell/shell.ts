import {ChangeDetectionStrategy,Component,HostListener,inject,signal} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatMenuModule} from '@angular/material/menu';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {MatTooltipModule} from '@angular/material/tooltip';
import {StudioStore,routes} from '../state/studio-store';
import {Dialogs} from '../dialogs/dialogs';
import {IconComponent} from '../ui/icon';
import {StudioPage} from '../pages/studio/studio-page';
import {WidgetsPage} from '../pages/widgets/widgets-page';
import {BrowsersPage} from '../pages/browsers/browsers-page';
import {AppearancePage} from '../pages/appearance/appearance-page';
import {SettingsPage} from '../pages/settings/settings-page';

const railKey='setpiece.rail-expanded';
const readRail=()=>{try{return localStorage.getItem(railKey)==='true';}catch{return false;}};

@Component({
  selector:'sp-shell',
  changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[MatButtonModule,MatMenuModule,MatProgressBarModule,MatProgressSpinnerModule,MatTooltipModule,IconComponent,StudioPage,WidgetsPage,BrowsersPage,AppearancePage,SettingsPage],
  templateUrl:'./shell.html',
  styleUrl:'./shell.scss'
})
export class ShellComponent {
  readonly store=inject(StudioStore);
  readonly dialogs=inject(Dialogs);
  readonly routes=routes;
  readonly expanded=signal(readRail());

  constructor(){void this.store.initialize();}

  toggleRail(){this.expanded.update(v=>!v);try{localStorage.setItem(railKey,String(this.expanded()));}catch{}}

  @HostListener('window:keydown',['$event'])
  keyboard(event:KeyboardEvent){
    const typing=event.target instanceof HTMLInputElement||event.target instanceof HTMLTextAreaElement||event.target instanceof HTMLSelectElement;
    if(event.key==='Escape')this.store.preview.set(null);
    if(typing||!event.ctrlKey)return;
    const key=event.key.toLowerCase();
    if(key==='z'){event.preventDefault();event.shiftKey?this.store.redo():this.store.undo();}
    if(key==='y'){event.preventDefault();this.store.redo();}
    if(key==='s'){event.preventDefault();void this.store.save();}
  }
}
