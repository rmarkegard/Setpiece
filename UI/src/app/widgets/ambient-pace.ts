import {pageShown} from '../state/presence';

/**
 * Runs a page's ambient motion at a fixed, low frame rate.
 *
 * Every Setpiece page (the desks, the main window, the browser's toolbar) and every web page in the
 * shared browser draw through one WebView2 graphics process. While any CSS animation is running, Chromium
 * composites that window on every vsync, whatever the animation's easing: a looping clock colon on a
 * 240 Hz display is 240 full-window frames a second. With a few loops on each desk this kept the graphics
 * process above a full core, and video in the browser, decoded and shown by that same process, hitched
 * and buffered. (Easing the loops in steps() changes how they look, not how often the window is drawn.)
 *
 * So looping animations, and the longer transitions that data updates restart (Spotify's progress, the
 * system charts), are taken off Chromium's clock: paused, and moved forward by hand a few times a second.
 * The window is then drawn only on those ticks. One-off event motion and quick hover feedback (under
 * 300ms) keep running at full rate; they are short and rare.
 *
 * The slowest loops (the clock's seconds bar, a turning sun: 20 s or longer) move under a pixel in a tenth
 * of a second, so they step ten times a second.
 *
 * Nothing moves while nobody can see it: a hidden or covered page, or a widget resting under an application
 * (.resting), holds its loops still, and they pick up where they would be when it shows again.
 *
 * Returns a function that stops pacing and hands the animations back to Chromium.
 */
export function paceAmbientMotion(fps:number):()=>void{
  /** Each driven animation, the clock origin its current time is measured from, and every how many ticks it steps. */
  const driven=new Map<Animation,{origin:number;every:number}>();
  const slowEvery=Math.max(1,Math.round(fps/10));let ticks=0;
  const take=(animation:Animation)=>{
    if(driven.has(animation)||animation.playState!=='running'||animation.playbackRate!==1)return;
    const effect=animation.effect as KeyframeEffect|null,timing=effect?.getTiming();
    if(!effect||typeof timing?.duration!=='number'||timing.duration<=0)return;
    const loop=timing.iterations===Infinity,transition=animation instanceof CSSTransition;
    if(!loop&&!(transition&&timing.duration>=300))return;
    const at=Number(animation.currentTime??0);
    animation.pause();driven.set(animation,{origin:performance.now()-at,every:loop&&timing.duration>=20000?slowEvery:1});
  };
  const takeFrom=(event:Event)=>{for(const animation of (event.target as Element).getAnimations())take(animation);};
  document.addEventListener('animationstart',takeFrom,true);
  document.addEventListener('transitionrun',takeFrom,true);
  // Transitions replaced mid-flight (a chart retargeting every second) can start without an event in time.
  const sweep=setInterval(()=>{if(pageShown())document.getAnimations().forEach(take);},250);
  queueMicrotask(()=>document.getAnimations().forEach(take));
  const tick=setInterval(()=>{
    if(!pageShown())return;
    const now=performance.now();ticks++;
    for(const [animation,{origin,every}] of driven){
      const effect=animation.effect as KeyframeEffect|null;
      // A removed element or a replaced transition leaves its animation idle: let it go.
      if(animation.playState==='idle'||!effect?.target?.isConnected){driven.delete(animation);continue;}
      // Something else (a style change, a widget) took the animation back: leave it to Chromium.
      if(animation.playState!=='paused'){driven.delete(animation);continue;}
      if(ticks%every||(effect.target as Element).closest('.resting'))continue;
      const time=now-origin,end=Number(effect.getComputedTiming().endTime);
      if(Number.isFinite(end)&&time>=end){driven.delete(animation);animation.finish();continue;}
      animation.currentTime=time;
    }
  },1000/fps);
  return ()=>{
    clearInterval(sweep);clearInterval(tick);
    document.removeEventListener('animationstart',takeFrom,true);
    document.removeEventListener('transitionrun',takeFrom,true);
    for(const animation of driven.keys())if(animation.playState==='paused')animation.play();
    driven.clear();
  };
}
