import {Signal,WritableSignal} from '@angular/core';
import {ServiceState,WidgetDefinition} from '../../domain';

/**
 * What a widget body can read from its frame. The frame provides itself under this token,
 * which keeps bodies independent of the frame module.
 */
export abstract class WidgetContext {
  abstract readonly definition:Signal<WidgetDefinition>;
  abstract readonly state:WritableSignal<ServiceState>;
  abstract readonly now:Signal<Date>;
  abstract readonly compact:Signal<boolean>;
  /** Height under 220: fewer rows. Narrow is width under 220: fewer columns. Compact is either. */
  abstract readonly short:Signal<boolean>;
  abstract readonly narrow:Signal<boolean>;
  abstract readonly spacious:Signal<boolean>;
  abstract readonly layoutWidth:Signal<number>;
  abstract readonly capacityHeight:Signal<number>;
  abstract readonly controlError:WritableSignal<string>;
  abstract contentLimit(id?:string):number;
  abstract metric(key:string):number;
  abstract items(limit?:number):{title:string;detail:string;url?:string}[];
  abstract external(url?:string):void;
  /** Sends a control command whose reply is the widget's new state. */
  abstract control(command:string,payload:unknown):Promise<void>;
  abstract refresh():Promise<void>;
}
