import {ChangeDetectionStrategy,Component,DestroyRef,Signal,computed,effect,inject,input,signal,untracked} from '@angular/core';
import {odoPlaces} from '../../widget-format';
export {ago,clockTime,compact,odoPlaces,pick} from '../../widget-format';



@Component({
  selector:'sp-odo',
  changeDetection:ChangeDetectionStrategy.OnPush,
  host:{class:'odo','[attr.aria-hidden]':'true'},
  template:`@for(place of places();track $index){@if(place.digit){<span class="odo-d"><span class="odo-s" [style.transform]="place.transform" [style.transition-delay]="place.delay"><i>0</i><i>1</i><i>2</i><i>3</i><i>4</i><i>5</i><i>6</i><i>7</i><i>8</i><i>9</i></span></span>}@else{<span class="odo-x">{{place.char}}</span>}}`
})
export class OdoComponent {
  readonly value=input<string|number>('');
  // Places are keyed by position from the right, so 9 → 10 grows a digit on the left.
  readonly places=computed(()=>odoPlaces(this.value()));
}

/**
 * Calls back when a value changes after the first reading, with the previous value. This is how
 * widgets tell a real event (a new email, a finished print) from the first load, which never animates.
 */
export function onChange<T>(read:()=>T,changed:(current:T,previous:T)=>void,same:(a:T,b:T)=>boolean=(a,b)=>JSON.stringify(a)===JSON.stringify(b)){
  let first=true,previous:T;
  effect(()=>{
    const current=read();
    if(first){first=false;previous=current;return;}
    if(same(current,previous))return;
    const before=previous;previous=current;untracked(()=>changed(current,before));
  });
}

/** A row in a slotted list: placed by rank, so reordering glides; fresh rows bloom in, removed rows slide out. */
export interface Slot<T> {key:string;item:T;rank:number;fresh:boolean;gone:boolean;}

/**
 * Keeps a list's rows mounted by key. New keys are marked fresh for a moment; keys that disappear
 * stay as "gone" rows at their last rank until their exit transition has played.
 */
export function slotList<T>(items:()=>T[],key:(item:T)=>string,timing={fresh:1400,gone:900}):Signal<Slot<T>[]>{
  const destroy=inject(DestroyRef);
  const fresh=signal<Set<string>>(new Set()),gone=signal<Slot<T>[]>([]);
  const timers=new Set<ReturnType<typeof setTimeout>>();
  const later=(ms:number,run:()=>void)=>{const t=setTimeout(()=>{timers.delete(t);run();},ms);timers.add(t);};
  destroy.onDestroy(()=>timers.forEach(clearTimeout));
  let first=true,last:Slot<T>[]=[];
  effect(()=>{
    const current=items().map((item,rank)=>({key:key(item),item,rank,fresh:false,gone:false}));
    untracked(()=>{
      const keys=new Set(current.map(s=>s.key)),before=new Set(last.map(s=>s.key));
      if(!first){
        const added=current.filter(s=>!before.has(s.key)).map(s=>s.key);
        if(added.length){fresh.update(set=>new Set([...set,...added]));later(timing.fresh,()=>fresh.update(set=>{const next=new Set(set);added.forEach(k=>next.delete(k));return next;}));}
        const removed=last.filter(s=>!keys.has(s.key)).map(s=>({...s,gone:true,fresh:false}));
        if(removed.length){gone.update(list=>[...list.filter(g=>!keys.has(g.key)&&!removed.some(r=>r.key===g.key)),...removed]);later(timing.gone,()=>gone.update(list=>list.filter(g=>!removed.some(r=>r.key===g.key))));}
      }
      gone.update(list=>list.filter(g=>!keys.has(g.key)));
      first=false;last=current;
    });
  });
  return computed(()=>{
    const set=fresh(),current=items().map((item,rank)=>({key:key(item),item,rank,fresh:set.has(key(item)),gone:false}));
    return [...current,...gone()];
  });
}

/** Keys that are briefly marked, such as a row that just rose in rank or a departure that got delayed. */
export function flashSet(ms:number){
  const destroy=inject(DestroyRef),keys=signal<ReadonlySet<string>>(new Set()),timers=new Set<ReturnType<typeof setTimeout>>();
  destroy.onDestroy(()=>timers.forEach(clearTimeout));
  return {
    keys:keys.asReadonly(),
    mark(key:string){
      keys.update(set=>new Set([...set,key]));
      const t=setTimeout(()=>{timers.delete(t);keys.update(set=>{const next=new Set(set);next.delete(key);return next;});},ms);timers.add(t);
    }
  };
}




