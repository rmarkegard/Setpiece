import {ChangeDetectionStrategy,Component,input} from '@angular/core';

/** A Material Symbols Rounded glyph. `name` is the ligature, e.g. "schedule". */
@Component({
  selector:'sp-icon',
  changeDetection:ChangeDetectionStrategy.OnPush,
  template:`<span class="material-symbols" aria-hidden="true">{{name()}}</span>`,
  host:{'[class.filled]':'filled()'},
  styles:`
    :host{display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;line-height:1;flex-shrink:0;font-size:var(--icon-size)}
    :host(.filled){--icon-fill:1}
    .material-symbols{font-size:1em}
  `
})
export class IconComponent {
  readonly name=input.required<string>();
  readonly filled=input(false);
}
