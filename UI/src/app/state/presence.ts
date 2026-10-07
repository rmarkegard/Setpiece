import {computed,signal} from '@angular/core';

/**
 * Whether anyone can see this page. A hidden page (Studio minimized, a browser put away) and a page the host
 * reports as covered by other windows rest: widgets stop ticking and polling, and looping motion holds still.
 * WebView2 keeps drawing a covered window on its own, so the host looks for it (Setpiece/Cover.cs).
 */
const hidden=signal(document.hidden);
const covered=signal(false);
document.addEventListener('visibilitychange',()=>hidden.set(document.hidden));
export const pageShown=computed(()=>!hidden()&&!covered());
export function setPageCovered(value:boolean){covered.set(value);}

/**
 * One clock for every widget on a page, on the wall clock's second: they all move on the same tick, so the
 * page draws once a second rather than once per widget, and the clock's seconds turn when the second does.
 */
const listeners=new Set<()=>void>();
let timer:ReturnType<typeof setTimeout>|undefined;
function schedule(){
  timer=setTimeout(()=>{timer=undefined;for(const listener of [...listeners])listener();if(listeners.size)schedule();},1000-Date.now()%1000+4);
}
export function everySecond(listener:()=>void):()=>void{
  listeners.add(listener);if(!timer)schedule();
  return ()=>{listeners.delete(listener);if(!listeners.size&&timer){clearTimeout(timer);timer=undefined;}};
}
