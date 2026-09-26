import {ChangeDetectionStrategy,Component,computed,inject,signal} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatChipsModule} from '@angular/material/chips';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {widgets} from '../../../domain';
import {accounts,infoFor,statusIcon,statusLabel} from '../../state/services';
import {StudioStore} from '../../state/studio-store';
import {Dialogs} from '../../dialogs/dialogs';
import {IconComponent} from '../../ui/icon';
import {PageHeaderComponent,EmptyStateComponent} from '../../ui/kit';

const categories=['All','Daily','Connected','Device','Play','Preview'];

/** The widget library and every connection, in one place. */
@Component({
  selector:'sp-widgets-page',
  changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[MatButtonModule,MatChipsModule,MatFormFieldModule,MatInputModule,IconComponent,PageHeaderComponent,EmptyStateComponent],
  templateUrl:'./widgets-page.html',
  styleUrl:'./widgets-page.scss'
})
export class WidgetsPage {
  readonly store=inject(StudioStore);
  readonly dialogs=inject(Dialogs);
  readonly categories=categories;
  readonly accounts=accounts;
  readonly filter=signal('All');
  readonly search=signal('');
  readonly cards=computed(()=>{
    const query=this.search().trim().toLowerCase(),connections=this.store.connections();
    return widgets
      .filter(w=>!w.retired&&(this.filter()==='All'||w.category===this.filter())&&(w.name+' '+w.description+' '+w.category).toLowerCase().includes(query))
      .map(w=>{const status=w.preview?null:infoFor(w.id)?.status(connections)??null;return {...w,status,statusLabel:status?statusLabel[status]:'Preview',statusIcon:status?statusIcon[status]:'science',count:this.store.widgetCount(w.id)};});
  });
  readonly accountCards=computed(()=>accounts.map(a=>{const status=infoFor(a.id)!.status(this.store.connections());return {...a,status,statusLabel:statusLabel[status],statusIcon:statusIcon[status]};}));
  readonly needsSetup=computed(()=>this.cards().filter(c=>c.status==='needs-setup').length);
}
