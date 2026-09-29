import {Signal,WritableSignal} from '@angular/core';
import {ServiceItem,ServiceState,WidgetDefinition} from '../../domain';

/**
 * What a widget body can read from its frame. The frame provides itself under this token,
 * which keeps bodies independent of the frame module.
 */
export abstract class WidgetContext {
  abstract readonly definition:Signal<WidgetDefinition>;
  abstract readonly state:WritableSignal<ServiceState>;
  /** Ticks every second. */
  abstract readonly now:Signal<Date>;
  /** When the current state arrived, for values that keep moving between refreshes. */
  abstract readonly receivedAt:Signal<number>;
  abstract readonly compact:Signal<boolean>;
  /** Height under 220: fewer rows. Narrow is width under 220: fewer columns. Compact is either. */
  abstract readonly short:Signal<boolean>;
  abstract readonly narrow:Signal<boolean>;
  abstract readonly spacious:Signal<boolean>;
  abstract readonly layoutWidth:Signal<number>;
  abstract readonly capacityHeight:Signal<number>;
  abstract readonly controlError:WritableSignal<string>;
  /** Classes the body adds to its card, such as the weather condition or the track's colors. */
  abstract readonly cardClass:WritableSignal<string>;
  /** Plays an event on the card: the spark ring flares and the body's own "fx-<kind>" motion runs once. */
  abstract fire(kind:string,ms?:number):void;
  abstract contentLimit(id?:string):number;
  abstract metric(key:string):number;
  abstract items(limit?:number):ServiceItem[];
  abstract external(url?:string):void;
  /** Sends a control command whose reply is the widget's new state. */
  abstract control(command:string,payload:unknown):Promise<void>;
  abstract refresh():Promise<void>;
}
