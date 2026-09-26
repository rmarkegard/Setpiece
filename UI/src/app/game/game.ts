import {ChangeDetectionStrategy,Component,OnDestroy,OnInit,inject,signal} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatButtonToggleModule} from '@angular/material/button-toggle';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {Bridge} from '../../bridge';
import {IconComponent} from '../ui/icon';

interface Game {salvage:number;level:number;armor:number;power:number;engine:number;last:number;}
type Skill='armor'|'power'|'engine';

@Component({
  selector:'sp-game',
  changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[MatButtonModule,MatButtonToggleModule,MatProgressBarModule,IconComponent],
  template:`
    <div class="game" (keydown)="keyboard($event)" tabindex="0" aria-label="Scrapbots. Use the arrow keys to pilot and space to fire.">
      <header>
        <div class="title">
          <span class="badge"><sp-icon name="smart_toy" [filled]="true"/></span>
          <div><h2 class="headline-small emphasized">Scrapbots</h2><p class="body-medium on-surface-variant">Sector {{game().level}} · something good in the scrap</p></div>
        </div>
        <span class="salvage"><sp-icon name="diamond" [filled]="true"/>{{game().salvage}} salvage</span>
      </header>
      <mat-button-toggle-group [value]="view()" (change)="view.set($event.value)" aria-label="Game view" hideSingleSelectionIndicator>
        <mat-button-toggle value="pilot"><sp-icon name="joystick"/>Pilot</mat-button-toggle>
        <mat-button-toggle value="skills"><sp-icon name="account_tree"/>Skill tree</mat-button-toggle>
      </mat-button-toggle-group>
      @if(view()==='pilot'){
        <div class="arena" role="img" aria-label="Scrapyard. Your bot is the round shape, guardians are hexagons, and the exit is at the bottom right.">
          <svg viewBox="0 0 600 340">
            <defs><pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><circle cx="20" cy="20" r="1.6" fill="currentColor" opacity=".22"/></pattern></defs>
            <rect width="600" height="340" fill="url(#grid)"/>
            @for(rock of rocks;track $index){<rect [attr.x]="rock.x" [attr.y]="rock.y" width="36" height="36" rx="12" fill="var(--mat-sys-surface-container-highest)"/>}
            <rect x="528" y="258" width="58" height="58" rx="18" fill="var(--mat-sys-tertiary-container)"/>
            <text x="557" y="296" text-anchor="middle" class="glyph" fill="var(--mat-sys-on-tertiary-container)">flag</text>
            @for(enemy of enemies();track enemy.id){
              <g [attr.transform]="'translate('+enemy.x+','+enemy.y+')'">
                <path d="M0 -19 L16 -10 L16 10 L0 19 L-16 10 L-16 -10Z" fill="var(--mat-sys-error-container)" stroke="var(--mat-sys-error)" stroke-width="2" stroke-linejoin="round"/>
                <text text-anchor="middle" y="5" fill="var(--mat-sys-on-error-container)" font-size="12" font-weight="600">{{enemy.hp}}</text>
              </g>
            }
            @for(piece of loot();track piece.id){<rect [attr.transform]="'translate('+piece.x+','+piece.y+') rotate(45)'" x="-6" y="-6" width="12" height="12" rx="3" fill="var(--mat-sys-tertiary)"/>}
            <circle [attr.cx]="position().x" [attr.cy]="position().y" r="19" fill="var(--mat-sys-primary)"/>
            <circle [attr.cx]="position().x+6" [attr.cy]="position().y-5" r="5" fill="var(--mat-sys-on-primary)"/>
          </svg>
        </div>
        <div class="status-row">
          <div class="hull">
            <span class="label-large">Hull {{health()}} / {{100+game().armor*20}}</span>
            <mat-progress-bar [value]="health()/(100+game().armor*20)*100" aria-label="Hull"/>
          </div>
          <span class="label-large on-surface-variant">{{cargo()}} salvage on board</span>
        </div>
        <p class="status body-medium" aria-live="polite">{{status()}}</p>
        <div class="controls">
          <div class="pad" role="group" aria-label="Move">
            <button matIconButton class="up" aria-label="Move up" (click)="move(0,-25)"><sp-icon name="keyboard_arrow_up"/></button>
            <button matIconButton class="left" aria-label="Move left" (click)="move(-25,0)"><sp-icon name="keyboard_arrow_left"/></button>
            <button matIconButton class="down" aria-label="Move down" (click)="move(0,25)"><sp-icon name="keyboard_arrow_down"/></button>
            <button matIconButton class="right" aria-label="Move right" (click)="move(25,0)"><sp-icon name="keyboard_arrow_right"/></button>
          </div>
          <div class="actions">
            <button matButton="filled" (click)="attack()"><sp-icon name="bolt"/>Pulse cannon</button>
            <button matButton="tonal" (click)="extract()"><sp-icon name="flag"/>Extract</button>
            <button matButton (click)="newMission()">New mission</button>
          </div>
        </div>
      } @else {
        <p class="body-medium on-surface-variant">Your workshop collects one salvage per minute while you're away, up to eight hours. Upgrade your bot for the next mission.</p>
        <div class="skills">
          @for(skill of skills;track skill.key){
            <section>
              <span class="skill-icon"><sp-icon [name]="skill.icon" [filled]="true"/></span>
              <h3 class="title-large">{{skill.name}}</h3>
              <p class="body-medium on-surface-variant">{{skill.description}}</p>
              <div class="pips" [attr.aria-label]="'Level '+level(skill.key)">@for(n of [1,2,3,4,5];track n){<i [class.on]="n<=level(skill.key)"></i>}</div>
              <button matButton="filled" [disabled]="game().salvage<cost(skill.key)" (click)="upgrade(skill.key)">Upgrade · {{cost(skill.key)}}</button>
            </section>
          }
        </div>
      }
    </div>`,
  styles:`
    :host{display:block}
    .game{display:flex;flex-direction:column;gap:var(--space-4);outline:none}
    header{display:flex;align-items:center;justify-content:space-between;gap:var(--space-4);flex-wrap:wrap}
    .title{display:flex;align-items:center;gap:var(--space-3)}
    .badge{display:grid;place-items:center;width:48px;height:48px;border-radius:var(--shape-lg) var(--shape-lg) var(--shape-lg) var(--shape-xs);background:var(--mat-sys-play-container);color:var(--mat-sys-on-play-container)}
    .salvage{display:inline-flex;align-items:center;gap:var(--space-2);padding:var(--space-2) var(--space-4);border-radius:var(--shape-full);background:var(--mat-sys-tertiary-container);color:var(--mat-sys-on-tertiary-container);font:var(--mat-sys-label-large)}
    .salvage sp-icon{font-size:18px}
    mat-button-toggle-group{align-self:flex-start}
    mat-button-toggle sp-icon{font-size:18px;margin-right:var(--space-2)}
    .arena{align-self:center;width:100%;max-width:calc(706px * var(--ui-scale));border-radius:var(--shape-xl);background:var(--mat-sys-surface-container-lowest);overflow:hidden;color:var(--mat-sys-on-surface)}
    svg{display:block;width:100%;height:auto}
    .glyph{font-family:'Material Symbols Rounded';font-size:26px}
    .status-row{display:flex;align-items:center;justify-content:space-between;gap:var(--space-4)}
    .hull{display:flex;flex-direction:column;gap:var(--space-2);width:45%}
    .status{min-height:1.5em;color:var(--mat-sys-on-surface-variant)}
    .controls{display:flex;align-items:center;gap:var(--space-6);flex-wrap:wrap}
    .pad{display:grid;grid-template-columns:repeat(3,40px);grid-template-rows:repeat(2,40px);gap:2px}
    .pad button{background:var(--mat-sys-surface-container-highest);border-radius:var(--shape-md)}
    .pad .up{grid-column:2}.pad .left{grid-column:1;grid-row:2}.pad .down{grid-column:2;grid-row:2}.pad .right{grid-column:3;grid-row:2}
    .actions{display:flex;gap:var(--space-2);flex-wrap:wrap}
    .skills{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:var(--space-3)}
    .skills section{display:flex;flex-direction:column;gap:var(--space-3);padding:var(--space-5);border-radius:var(--shape-xl);background:var(--mat-sys-surface-container-high)}
    .skill-icon{display:grid;place-items:center;width:48px;height:48px;border-radius:var(--shape-lg);background:var(--mat-sys-primary-container);color:var(--mat-sys-on-primary-container)}
    .pips{display:flex;gap:4px}
    .pips i{width:18px;height:6px;border-radius:3px;background:var(--mat-sys-outline-variant)}
    .pips i.on{background:var(--mat-sys-primary)}
    .skills button{margin-top:auto;align-self:flex-start}
  `
})
export class GameComponent implements OnInit,OnDestroy {
  private readonly bridge=inject(Bridge);
  readonly game=signal<Game>({salvage:0,level:1,armor:0,power:0,engine:0,last:Date.now()});
  readonly view=signal<'pilot'|'skills'>('pilot');
  readonly position=signal({x:60,y:60});
  readonly health=signal(100);
  readonly cargo=signal(0);
  readonly status=signal('Collect salvage, defeat guardians, and reach the exit to extract.');
  readonly enemies=signal([{id:1,x:300,y:120,hp:50},{id:2,x:420,y:240,hp:70}]);
  readonly loot=signal(Array.from({length:8},(_,i)=>({id:i,x:120+i*50,y:80+(i%3)*70})));
  readonly rocks=[{x:190,y:180},{x:390,y:50},{x:90,y:240}];
  readonly skills:{key:Skill;name:string;description:string;icon:string}[]=[
    {key:'armor',name:'Reinforced hull',description:'+20 hull integrity per level.',icon:'shield'},
    {key:'power',name:'Pulse amplifier',description:'+10 cannon damage per level.',icon:'bolt'},
    {key:'engine',name:'Salvage drive',description:'Move faster and collect from farther away.',icon:'speed'}
  ];

  async ngOnInit(){
    if(new URLSearchParams(location.search).has('skills'))this.view.set('skills');
    try{
      const saved=await this.bridge.call('game-read');
      if(saved.last){
        const elapsed=Math.min(480,Math.max(0,Math.floor((Date.now()-saved.last)/60000)));
        this.game.set({...this.game(),...saved,salvage:Number(saved.salvage??0)+elapsed,last:Date.now()});
        this.health.set(100+this.game().armor*20);
      }
    }catch(e){this.status.set((e as Error).message);}
  }
  level(key:Skill){return this.game()[key];}
  cost(key:Skill){return (this.level(key)+1)*25;}
  upgrade(key:Skill){const cost=this.cost(key);if(this.game().salvage<cost)return;this.game.update(g=>({...g,[key]:g[key]+1,salvage:g.salvage-cost}));void this.save();}
  move(dx:number,dy:number){
    if(this.health()<=0)return;
    const speed=1+this.game().engine*.1;
    this.position.update(p=>({x:Math.min(575,Math.max(25,p.x+dx*speed)),y:Math.min(315,Math.max(25,p.y+dy*speed))}));
    const p=this.position(),collected=this.loot().filter(l=>Math.hypot(l.x-p.x,l.y-p.y)<30+this.game().engine*5);
    if(collected.length){this.cargo.update(n=>n+collected.length*5);this.loot.update(list=>list.filter(l=>!collected.includes(l)));this.status.set('Salvage secured. Bring it to the exit.');}
    this.enemyTurn();
  }
  attack(){
    if(this.health()<=0)return;
    const p=this.position();
    const target=this.enemies().filter(e=>Math.hypot(e.x-p.x,e.y-p.y)<180).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];
    if(!target){this.status.set('No guardian in range. Move closer.');return;}
    this.enemies.update(list=>list.map(e=>e.id===target.id?{...e,hp:e.hp-25-this.game().power*10}:e).filter(e=>e.hp>0));
    if(!this.enemies().some(e=>e.id===target.id)){this.cargo.update(n=>n+15);this.status.set('Guardian dismantled. +15 salvage.');}
    else this.status.set('Pulse hit. Keep moving.');
    this.enemyTurn();
  }
  enemyTurn(){
    const p=this.position();let damage=0;
    this.enemies.update(list=>list.map(e=>{const distance=Math.hypot(e.x-p.x,e.y-p.y);if(distance<45){damage+=8;return e;}if(distance<230)return {...e,x:e.x+(p.x-e.x)/distance*14,y:e.y+(p.y-e.y)/distance*14};return e;}));
    this.health.update(h=>Math.max(0,h-damage));
    if(this.health()===0){this.cargo.set(0);this.status.set('Hull lost. Your workshop salvage is safe. Start a new mission.');}
  }
  extract(){
    if(this.health()<=0){this.status.set('Start a new mission to return to the scrapyard.');return;}
    if(Math.hypot(this.position().x-557,this.position().y-285)>70){this.status.set('Reach the exit at the bottom right to extract.');return;}
    this.game.update(g=>({...g,salvage:g.salvage+this.cargo(),level:g.level+1}));this.cargo.set(0);this.newMission();
    this.status.set('Extraction complete. Salvage delivered; your next sector is ready.');void this.save();
  }
  newMission(){
    this.position.set({x:60,y:60});this.health.set(100+this.game().armor*20);this.cargo.set(0);
    this.enemies.set([{id:1,x:300,y:120,hp:40+this.game().level*10},{id:2,x:420,y:240,hp:60+this.game().level*10}]);
    this.loot.set(Array.from({length:8},(_,i)=>({id:i,x:120+i*50,y:80+(i%3)*70})));
    this.status.set('A new sector awaits. Bring your bot home.');
  }
  keyboard(e:KeyboardEvent){
    if(e.key==='ArrowLeft')this.move(-25,0);else if(e.key==='ArrowRight')this.move(25,0);else if(e.key==='ArrowUp')this.move(0,-25);else if(e.key==='ArrowDown')this.move(0,25);else if(e.key===' ')this.attack();else return;
    e.preventDefault();
  }
  async save(){this.game.update(g=>({...g,last:Date.now()}));try{await this.bridge.call('game-save',this.game());}catch(e){this.status.set('Could not save: '+(e as Error).message);}}
  ngOnDestroy(){void this.save();}
}
