import {ChangeDetectionStrategy,Component,input} from '@angular/core';
import {IconComponent} from './icon';

/** Page title block: headline, one line of support, and actions on the trailing edge. */
@Component({
  selector:'sp-page-header',
  changeDetection:ChangeDetectionStrategy.OnPush,
  template:`
    <div class="copy">
      <h1 class="headline-medium">{{headline()}}</h1>
      @if(supporting()){<p class="body-large on-surface-variant">{{supporting()}}</p>}
    </div>
    <div class="actions"><ng-content/></div>`,
  styles:`
    :host{display:flex;align-items:flex-end;justify-content:space-between;gap:var(--space-4);flex-wrap:wrap;padding-block:var(--space-2) var(--space-6)}
    .copy{display:flex;flex-direction:column;gap:var(--space-1);min-width:0}
    h1{font-weight:var(--font-emphasis-weight);font-stretch:var(--font-hero-stretch)}
    .actions{display:flex;align-items:center;gap:var(--space-2);flex-wrap:wrap}
    .actions:empty{display:none}
  `
})
export class PageHeaderComponent {
  readonly headline=input.required<string>();
  readonly supporting=input('');
}

/** A titled group on a surface-container card. Content is projected below the title. */
@Component({
  selector:'sp-section',
  changeDetection:ChangeDetectionStrategy.OnPush,
  template:`
    @if(headline()){
      <header>
        @if(icon()){<span class="lead"><sp-icon [name]="icon()"/></span>}
        <div class="copy">
          <h2 class="title-large">{{headline()}}</h2>
          @if(supporting()){<p class="body-medium on-surface-variant">{{supporting()}}</p>}
        </div>
        <div class="trailing"><ng-content select="[section-action]"/></div>
      </header>
    }
    <ng-content/>`,
  host:{'[class.flush]':'flush()'},
  styles:`
    :host{display:flex;flex-direction:column;gap:var(--space-4);padding:var(--space-6);border-radius:var(--shape-xl);background:var(--mat-sys-surface-container);min-width:0}
    :host(.flush){gap:0;padding-inline:0;padding-bottom:var(--space-2)}
    :host(.flush) header{padding-inline:var(--space-6);padding-bottom:var(--space-3)}
    header{display:flex;align-items:center;gap:var(--space-4)}
    .lead{display:grid;place-items:center;width:var(--space-10);height:var(--space-10);border-radius:var(--shape-md);background:var(--mat-sys-secondary-container);color:var(--mat-sys-on-secondary-container);flex-shrink:0}
    .copy{flex:1;min-width:0;display:flex;flex-direction:column;gap:var(--space-0-5)}
    .trailing{display:flex;align-items:center;gap:var(--space-2)}
    .trailing:empty{display:none}
  `,
  imports:[IconComponent]
})
export class SectionComponent {
  readonly headline=input('');
  readonly supporting=input('');
  readonly icon=input('');
  readonly flush=input(false);
}

/**
 * An M3 list item used for settings rows: leading icon, headline, supporting text and a
 * trailing control. Content projected with [row-below] spans the full width underneath.
 */
@Component({
  selector:'sp-row',
  changeDetection:ChangeDetectionStrategy.OnPush,
  template:`
    <div class="main">
      @if(icon()){<sp-icon class="lead" [name]="icon()"/>}
      <div class="copy">
        <span class="body-large headline">{{headline()}}</span>
        @if(supporting()){<span class="body-medium on-surface-variant">{{supporting()}}</span>}
        <ng-content select="[row-supporting]"/>
      </div>
      <div class="trailing"><ng-content/></div>
    </div>
    <ng-content select="[row-below]"/>`,
  styles:`
    :host{display:flex;flex-direction:column;gap:var(--space-2);padding:var(--space-3) var(--space-6);min-height:calc(56px * var(--ui-scale))}
    :host + :host{border-top:1px solid var(--mat-sys-outline-variant)}
    .main{display:flex;align-items:center;gap:var(--space-4);min-height:calc(40px * var(--ui-scale))}
    .lead{color:var(--mat-sys-on-surface-variant)}
    .copy{flex:1;min-width:0;display:flex;flex-direction:column;gap:var(--space-0-5)}
    .headline{color:var(--mat-sys-on-surface)}
    .trailing{display:flex;align-items:center;gap:var(--space-2);flex-shrink:0}
    .trailing:empty{display:none}
  `,
  imports:[IconComponent]
})
export class RowComponent {
  readonly headline=input.required<string>();
  readonly supporting=input('');
  readonly icon=input('');
}

/** Empty states are invitations: a shaped icon, a headline and one line of guidance. */
@Component({
  selector:'sp-empty',
  changeDetection:ChangeDetectionStrategy.OnPush,
  template:`
    <span class="art"><sp-icon [name]="icon()"/></span>
    <h3 class="title-large">{{headline()}}</h3>
    @if(supporting()){<p class="body-medium on-surface-variant">{{supporting()}}</p>}
    <ng-content/>`,
  styles:`
    :host{display:flex;flex-direction:column;align-items:center;text-align:center;gap:var(--space-2);padding:var(--space-8) var(--space-4)}
    .art{display:grid;place-items:center;width:calc(72px * var(--ui-scale));height:calc(72px * var(--ui-scale));margin-bottom:var(--space-2);border-radius:var(--shape-xl) var(--shape-xl) var(--shape-xl) var(--shape-sm);background:var(--mat-sys-tertiary-container);color:var(--mat-sys-on-tertiary-container)}
    .art sp-icon{font-size:var(--icon-size-lg)}
    p{max-width:40ch}
  `,
  imports:[IconComponent]
})
export class EmptyStateComponent {
  readonly icon=input('inbox');
  readonly headline=input.required<string>();
  readonly supporting=input('');
}
