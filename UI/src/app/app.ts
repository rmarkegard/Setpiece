import {ChangeDetectionStrategy,Component,inject} from '@angular/core';
import {StudioStore} from './state/studio-store';
import {ShellComponent} from './shell/shell';
import {BrowserToolbar} from './surfaces/browser-toolbar';
import {WidgetWindow,WorkspaceBackdrop} from './surfaces/surfaces';

/**
 * One bundle serves every Setpiece window. The host picks the surface with the query:
 * ?widget=<id>, ?workspace=<display>, ?browser=<name>, or nothing for Studio.
 */
@Component({
  selector:'setpiece-app',
  changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[ShellComponent,BrowserToolbar,WidgetWindow,WorkspaceBackdrop],
  template:`
    @if(store.widgetId){<sp-widget-window/>}
    @else if(store.workspace){<sp-workspace-backdrop/>}
    @else if(store.browserName){<sp-browser-toolbar/>}
    @else{<sp-shell/>}`
})
export class AppComponent {
  readonly store=inject(StudioStore);
  // Studio initializes from its shell, after its dialogs are ready to take capture guides.
  constructor(){if(!this.store.isStudio)void this.store.initialize();}
}
