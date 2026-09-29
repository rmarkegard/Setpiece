import {AfterViewInit,Directive,ElementRef,OnDestroy,effect,inject,input} from '@angular/core';

/**
 * Keeps a single line of text whole: when it would overflow its box, it first narrows (Roboto
 * Flex's width axis) and then steps down in size, never below a readable minimum. No ellipsis.
 */
@Directive({selector:'[spFitText]'})
export class FitTextDirective implements AfterViewInit,OnDestroy {
  /** The text, so the fit runs again when it changes. */
  readonly spFitText=input<unknown>('');
  readonly minSize=input(8);
  private readonly host=inject<ElementRef<HTMLElement>>(ElementRef);
  private observer?:ResizeObserver;
  private frame=0;
  constructor(){effect(()=>{this.spFitText();this.schedule();});}
  ngAfterViewInit(){
    const el=this.host.nativeElement;el.style.textOverflow='clip';
    this.observer=new ResizeObserver(()=>this.schedule());this.observer.observe(el);if(el.parentElement)this.observer.observe(el.parentElement);
    void document.fonts?.ready.then(()=>this.schedule());
  }
  ngOnDestroy(){this.observer?.disconnect();cancelAnimationFrame(this.frame);}
  private schedule(){cancelAnimationFrame(this.frame);this.frame=requestAnimationFrame(()=>this.fit());}
  private fit(){
    const el=this.host.nativeElement;if(!el.isConnected)return;
    el.style.fontSize='';el.style.fontStretch='';el.style.letterSpacing='';
    if(el.scrollWidth<=el.clientWidth+.5)return;
    // Narrower letterforms read better than smaller ones, so width goes first.
    for(const stretch of [92,84,76]){el.style.fontStretch=stretch+'%';if(el.scrollWidth<=el.clientWidth+.5)return;}
    el.style.letterSpacing='0';
    const base=parseFloat(getComputedStyle(el).fontSize)||12;
    for(let size=base-.5;size>=this.minSize();size-=.5){el.style.fontSize=size+'px';if(el.scrollWidth<=el.clientWidth+.5)return;}
  }
}
