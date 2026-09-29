import {ChangeDetectionStrategy,Component,OnDestroy,OnInit,computed,effect,inject,signal} from '@angular/core';
import {Bridge} from '../../../bridge';
import {WidgetContext} from '../context';

let noteIds=0;

/** Notes: ruled paper that saves itself; the check draws itself in when it has. */
@Component({
  selector:'sp-notes-body',
  changeDetection:ChangeDetectionStrategy.OnPush,
  template:`
    <div class="spread">
      <span class="eyebrow"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M4 12h8M4 17h5M15.5 19.5l5-5-2-2-5 5-.6 2.6z"></path></svg>Notes</span>
      <span class="nt-state" aria-live="polite"><span class="nt-ind"><span class="nt-spin"></span><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path pathLength="1" d="M5 12.5l4.5 4.5L19 7.5"></path></svg></span>{{error()||(saving()?'Saving…':'Saved')}}</span>
    </div>
    <div class="nt-paper">
      <label [attr.for]="id" style="position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%)">Your note</label>
      <textarea [id]="id" class="nt-text" spellcheck="true" placeholder="Capture a thought…" [value]="text()" (input)="save($any($event.target).value)"></textarea>
    </div>
    <div class="nt-foot"><span>{{words()}} {{words()===1?'word':'words'}}</span><span>On this PC</span></div>`,
  styleUrl:'./body.scss'
})
export class NotesBody implements OnInit,OnDestroy {
  private readonly bridge=inject(Bridge);
  private readonly w=inject(WidgetContext);
  readonly id='nt-text-'+(++noteIds);
  readonly text=signal('');
  readonly saving=signal(false);
  readonly error=signal('');
  /** Words, not counting the bullets people type. */
  readonly words=computed(()=>{const t=this.text().trim();return t?t.split(/\s+/).filter(x=>x!=='•'&&x!=='-').length:0;});
  private revision=0;
  private pending?:ReturnType<typeof setTimeout>;
  /** A save from another window (Studio or the desk) arrives here; typing in progress in this one wins. */
  private readonly unsubscribe=this.bridge.listen(e=>{if(e.event==='note'&&!this.saving()&&typeof e.data?.text==='string')this.text.set(e.data.text);});
  constructor(){effect(()=>this.w.cardClass.set(this.saving()?'saving':''));}
  ngOnInit(){this.bridge.call('note-read').then(data=>this.text.set(data?.text??'')).catch(e=>this.error.set(e.message));}
  save(value:string){
    this.text.set(value);this.saving.set(true);this.error.set('');const revision=++this.revision;
    // Typing coalesces into one save a moment after the last keystroke.
    clearTimeout(this.pending);
    this.pending=setTimeout(()=>this.bridge.call('note-save',{text:value}).then(()=>{if(revision===this.revision){this.saving.set(false);this.w.fire('saved',900);}}).catch(e=>{this.saving.set(false);this.error.set(e.message);}),600);
  }
  ngOnDestroy(){this.unsubscribe();if(this.saving()){clearTimeout(this.pending);void this.bridge.call('note-save',{text:this.text()});}}
}

/** Concepts that are not live yet: shown in the same card language, clearly marked as previews. */
@Component({
  selector:'sp-preview-body',
  changeDetection:ChangeDetectionStrategy.OnPush,
  template:`
    <div class="spread"><span class="eyebrow">{{w.definition().name}}</span><span class="chip">Preview</span></div>
    @switch(w.definition().id){
      @case('market'){
        <strong style="font: 650 17px/1.2 var(--font-brand)">Your watchlist</strong>
        <div style="flex: 1; min-height: 0; display: flex; align-items: flex-end; gap: 6px" aria-hidden="true">@for(n of cells.slice(0,12);track n){<i style="flex: 1; border-radius: 6px 6px 3px 3px" [style.height.%]="30+((n*37)%60)" [style.background]="n%3===0?'var(--hi)':'var(--inset2)'"></i>}</div>
      }
      @case('focus'){
        <div style="flex: 1; min-height: 0; display: grid; place-items: center"><span class="hero" style="font-size: 44px">25:00</span></div>
        <p style="margin: 0; text-align: center; font: 500 12.5px/1.3 var(--font-brand); color: var(--muted)">A moment for one thing.</p>
      }
      @default{
        <strong style="font: 650 17px/1.2 var(--font-brand)">Small steps, steady progress</strong>
        <div style="flex: 1; min-height: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(14px, 1fr)); grid-auto-rows: 14px; gap: 4px; align-content: center" aria-hidden="true">@for(n of cells;track n){<i style="border-radius: 4px; background: var(--hi)" [style.opacity]=".18+(n%5)*.2"></i>}</div>
      }
    }`,
  styleUrl:'./body.scss'
})
export class PreviewBody {
  readonly w=inject(WidgetContext);
  readonly cells=Array.from({length:40},(_,i)=>i);
}
