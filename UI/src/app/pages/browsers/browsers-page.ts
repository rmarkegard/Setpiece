import {ChangeDetectionStrategy,Component,computed,inject,signal} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatTooltipModule} from '@angular/material/tooltip';
import {SharedBrowser,StudioStore} from '../../state/studio-store';
import {IconComponent} from '../../ui/icon';
import {EmptyStateComponent,PageHeaderComponent,RowComponent,SectionComponent} from '../../ui/kit';

@Component({
  selector:'sp-browsers-page',
  changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[MatButtonModule,MatFormFieldModule,MatInputModule,MatTooltipModule,IconComponent,EmptyStateComponent,PageHeaderComponent,RowComponent,SectionComponent],
  templateUrl:'./browsers-page.html',
  styleUrl:'./browsers-page.scss'
})
export class BrowsersPage {
  readonly store=inject(StudioStore);
  readonly name=signal('Media');
  readonly url=signal('https://www.youtube.com/');
  readonly existing=computed(()=>this.store.sharedBrowsers().some(b=>b.name.toLowerCase()===this.name().trim().toLowerCase()));
  readonly tileReady=computed(()=>this.store.tile()?.ContentKind==='Application'&&!this.store.tile()?.AssignedProcessName);
  choose(browser:SharedBrowser){this.name.set(browser.name);this.url.set(browser.url||'https://www.google.com/');}
  fresh(){this.name.set('');this.url.set('https://www.google.com/');}
  host(url:string){try{return new URL(url).hostname.replace(/^www\./,'');}catch{return url||'Ready to browse';}}
}
