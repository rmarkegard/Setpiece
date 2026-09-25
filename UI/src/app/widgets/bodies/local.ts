import {ChangeDetectionStrategy,Component,OnDestroy,OnInit,computed,inject,output,signal} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {Bridge} from '../../../bridge';
import {IconComponent} from '../../ui/icon';
import {WidgetContext} from '../context';

@Component({
  selector:'sp-notes-body',
  changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[IconComponent],
  template:`
    <textarea class="note grow" aria-label="Your note" placeholder="Capture a thought…" spellcheck="true" [value]="text()" (input)="save($any($event.target).value)"></textarea>
    <span class="eyebrow status"><sp-icon [name]="status()==='Saving…'?'sync':'cloud_done'"/><span>{{status()}}</span></span>`,
  styleUrl:'./body.scss',
  styles:`
    .note{width:100%;resize:none;border:0;outline:0;padding:var(--space-3);margin:calc(var(--space-3) * -1) calc(var(--space-3) * -1) 0;width:calc(100% + var(--space-6));border-radius:var(--shape-lg);background:transparent;color:var(--w-fg);font:var(--mat-sys-body-large);line-height:1.55;transition:background-color var(--motion-effects)}
    .note:focus{background:var(--w-inset)}
    .note::placeholder{color:var(--w-muted)}
    :host-context(.spacious) .note{font-size:18px}
    .status{font:var(--mat-sys-label-medium)}
  `
})
export class NotesBody implements OnInit,OnDestroy {
  private readonly bridge=inject(Bridge);
  readonly text=signal('');
  readonly status=signal('Saved on this PC');
  private revision=0;
  ngOnInit(){this.bridge.call('note-read').then(data=>this.text.set(data.text??'')).catch(e=>this.status.set(e.message));}
  save(value:string){
    this.text.set(value);const revision=++this.revision;this.status.set('Saving…');
    this.bridge.call('note-save',{text:value}).then(()=>{if(revision===this.revision)this.status.set('Saved on this PC');}).catch(e=>this.status.set(e.message));
  }
  ngOnDestroy(){if(this.status()==='Saving…')void this.bridge.call('note-save',{text:this.text()});}
}

@Component({
  selector:'sp-scrapbots-body',
  changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[MatButtonModule,IconComponent],
  template:`
    <div class="row">
      <span class="bot"><sp-icon name="smart_toy" [filled]="true"/></span>
      <div class="list-copy"><strong class="title">Your bot is ready</strong><span>Sector {{level()}}</span></div>
    </div>
    <div class="map grow" aria-hidden="true">@for(n of cells();track n){<i [class.signal]="n%7===2" [class.home]="n===cells().length-1"></i>}</div>
    <div class="row spread">
      <span class="hero md">{{salvage()}}<small>salvage</small></span>
      <button matButton="filled" (click)="play.emit()"><sp-icon name="sports_esports"/>Play</button>
    </div>`,
  styleUrl:'./body.scss',
  styles:`
    .bot{display:grid;place-items:center;width:48px;height:48px;border-radius:var(--shape-lg) var(--shape-lg) var(--shape-lg) var(--shape-xs);background:var(--w-fg);color:var(--w-container)}
    .bot sp-icon{font-size:28px}
    .map{display:grid;grid-template-columns:repeat(auto-fill,minmax(18px,1fr));grid-auto-rows:18px;gap:5px;align-content:center;overflow:hidden}
    .map i{border-radius:5px;background:var(--w-inset)}
    .map i.signal{background:var(--w-inset-strong);border-radius:50%}
    .map i.home{background:var(--w-fg)}
    :host-context(.compact) .map{display:none}
  `
})
export class ScrapbotsBody implements OnInit {
  private readonly w=inject(WidgetContext);
  private readonly bridge=inject(Bridge);
  readonly play=output<void>();
  readonly salvage=signal(0);
  readonly level=signal(1);
  readonly cells=computed(()=>Array.from({length:this.w.contentLimit('idle-game')},(_,i)=>i));
  ngOnInit(){this.bridge.call('game-read').then(data=>{this.salvage.set(data.salvage??0);this.level.set(data.level??1);}).catch(()=>{});}
}

@Component({
  selector:'sp-preview-body',
  changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[IconComponent],
  template:`
    <span class="eyebrow"><sp-icon [name]="w.definition().icon"/><span>{{w.definition().name}}</span><span class="chip tag">Preview</span></span>
    @switch(w.definition().id){
      @case('market'){
        <strong class="title">Your watchlist</strong>
        <div class="bars grow" aria-hidden="true">@for(n of cells().slice(0,w.contentLimit());track n){<i [style.height.%]="30+((n*37)%60)"></i>}</div>
      }
      @case('focus'){
        <div class="focus grow"><span class="ring"><span class="hero">25:00</span></span></div>
        <p class="muted center">A moment for one thing.</p>
      }
      @default{
        <strong class="title">Small steps, steady progress</strong>
        <div class="contributions grow" aria-hidden="true">@for(n of cells().slice(0,w.contentLimit());track n){<i [style.opacity]=".18+(n%5)*.2"></i>}</div>
      }
    }`,
  styleUrl:'./body.scss',
  styles:`
    .tag{margin-left:auto;padding:2px var(--space-2);font:var(--mat-sys-label-small)}
    .bars{display:flex;align-items:flex-end;gap:6px}
    .bars i{flex:1;border-radius:var(--shape-sm) var(--shape-sm) var(--shape-xs) var(--shape-xs);background:var(--w-inset-strong)}
    .bars i:nth-child(3n){background:var(--w-fg)}
    .focus{display:grid;place-items:center}
    .ring{display:grid;place-items:center;aspect-ratio:1;height:min(100%,180px);border-radius:50%;border:10px solid var(--w-inset-strong);border-top-color:var(--w-fg)}
    .ring .hero{font-size:34px}
    .center{text-align:center}
    .contributions{display:grid;grid-template-columns:repeat(auto-fill,minmax(14px,1fr));grid-auto-rows:14px;gap:4px;align-content:center}
    .contributions i{border-radius:4px;background:var(--w-fg)}
  `
})
export class PreviewBody {
  readonly w=inject(WidgetContext);
  readonly cells=signal(Array.from({length:40},(_,i)=>i));
}
