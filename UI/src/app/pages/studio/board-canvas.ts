import {ChangeDetectionStrategy,Component,HostListener,computed,inject,signal} from '@angular/core';
import {NgStyle} from '@angular/common';
import {MatButtonModule} from '@angular/material/button';
import {MatMenuModule} from '@angular/material/menu';
import {Profile,ResizeHandle,Tile,TileDrop,dropTile,moveTile,resizeTile,tilePercentBounds,widgetDefinition} from '../../../domain';
import {StudioStore} from '../../state/studio-store';
import {IconComponent} from '../../ui/icon';
import {WallpaperComponent} from '../../ui/wallpaper';
import {WidgetFrame} from '../../widgets/widget-frame';

interface Drag {id:string;handle:ResizeHandle|null;x:number;y:number;originX:number;originY:number;width:number;height:number;before:Profile;pointerId:number;}

/**
 * The live board: the display at its real aspect ratio, with the wallpaper, widgets
 * rendering for real, and tiles you move by dragging and resize by their handles.
 */
@Component({
  selector:'sp-board-canvas',
  changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[NgStyle,MatButtonModule,MatMenuModule,IconComponent,WallpaperComponent,WidgetFrame],
  templateUrl:'./board-canvas.html',
  styleUrl:'./board-canvas.scss'
})
export class BoardCanvas {
  readonly store=inject(StudioStore);
  readonly handles:ResizeHandle[]=['n','s','e','w','nw','ne','sw','se'];
  readonly dropPreview=signal<TileDrop|null>(null);
  readonly dragging=signal('');
  private drag:Drag|null=null;

  readonly boardStyle=computed(()=>{const {width,height}=this.store.monitorSize();return {'aspect-ratio':width+' / '+height,'--ratio':String(width/height)};});
  readonly dropTarget=computed(()=>this.dropPreview()?.tiles.find(t=>t.Id===this.dragging()));

  bounds(tile:Tile,tiles=this.store.tiles()){
    const {width,height}=this.store.monitorSize(),p=this.store.profile();
    const b=tilePercentBounds(tile,tiles,width,height,p.OuterMargin,p.Gap);
    return {left:b.left+'%',top:b.top+'%',width:b.width+'%',height:b.height+'%'};
  }
  dropStyle(){const tile=this.dropTarget(),candidate=this.dropPreview();return tile&&candidate?this.bounds(tile,candidate.tiles):{};}
  label(tile:Tile,index:number){return tile.ContentKind==='Widget'?widgetDefinition(tile.WidgetId).name:tile.ContentKind==='Web'?(tile.SharedWebName||'Browser'):(tile.AssignedProcessName||'Tile '+(index+1));}

  start(event:PointerEvent,id:string,handle:ResizeHandle|null=null){
    if(event.button!==0||this.store.preview())return;
    const target=event.target as HTMLElement;
    if(!handle&&target.closest('button,input,select,textarea,a,[role=menu]'))return;
    const canvas=(event.currentTarget as HTMLElement).closest('.board')!.getBoundingClientRect();
    const {width,height}=this.store.monitorSize(),margin=this.store.profile().OuterMargin;
    const usableWidth=canvas.width*(1-2*margin/width),usableHeight=canvas.height*(1-2*margin/height);
    this.store.selected.set(id);
    this.drag={id,handle,x:event.clientX,y:event.clientY,originX:canvas.left+(canvas.width-usableWidth)/2,originY:canvas.top+(canvas.height-usableHeight)/2,width:usableWidth,height:usableHeight,before:structuredClone(this.store.profile()),pointerId:event.pointerId};
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    event.preventDefault();event.stopPropagation();
  }

  @HostListener('window:pointermove',['$event'])
  move(event:PointerEvent){
    const d=this.drag;if(!d||d.pointerId!==event.pointerId)return;
    const next=structuredClone(d.handle?d.before:this.store.profile()),b=next.MonitorBoards.find(b=>b.MonitorIndex===next.MonitorIndex)!;
    const dx=(event.clientX-d.x)/d.width,dy=(event.clientY-d.y)/d.height,snap=next.SmartSnap&&!event.altKey?next.SnapStep:0;
    const original=d.before.MonitorBoards.find(b=>b.MonitorIndex===next.MonitorIndex)!.Zones.find(t=>t.Id===d.id)!,current=b.Zones.find(t=>t.Id===d.id)!;
    b.Zones=d.handle?resizeTile(b.Zones,d.id,d.handle,dx,dy,snap):moveTile(b.Zones,d.id,original.X+dx-current.X,original.Y+dy-current.Y,snap);
    this.store.profile.set(next);
    if(!d.handle&&Math.hypot(event.clientX-d.x,event.clientY-d.y)>8){
      this.dragging.set(d.id);
      const source=d.before.MonitorBoards.find(board=>board.MonitorIndex===d.before.MonitorIndex)!;
      const px=Math.max(0,Math.min(1,(event.clientX-d.originX)/d.width)),py=Math.max(0,Math.min(1,(event.clientY-d.originY)/d.height));
      this.dropPreview.set(dropTile(source.Zones,d.id,px,py));
    }else this.dropPreview.set(null);
  }

  @HostListener('window:pointerup',['$event'])
  end(event:PointerEvent){
    const d=this.drag;if(!d||d.pointerId!==event.pointerId)return;
    const candidate=this.dropPreview();
    if(candidate&&!d.handle)this.store.profile.update(p=>{const next=structuredClone(p);next.MonitorBoards.find(b=>b.MonitorIndex===next.MonitorIndex)!.Zones=candidate.tiles;return next;});
    this.drag=null;this.dropPreview.set(null);this.dragging.set('');
    if(JSON.stringify(d.before)!==JSON.stringify(this.store.profile())){this.store.commit(d.before);void this.store.execute('profile',{profile:this.store.profile()});}
  }

  @HostListener('window:pointercancel')
  @HostListener('window:keydown.escape')
  cancel(){if(this.drag){this.store.profile.set(this.drag.before);this.drag=null;}this.dropPreview.set(null);this.dragging.set('');}

  key(event:KeyboardEvent,id:string,handle:ResizeHandle|null=null){
    if((event.target!==event.currentTarget&&!handle)||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)||this.store.preview())return;
    event.preventDefault();event.stopPropagation();
    const p=this.store.profile(),step=p.SmartSnap&&!event.altKey?p.SnapStep:.001;
    const dx=event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0,dy=event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0;
    this.store.editBoard(b=>b.Zones=handle?resizeTile(b.Zones,id,handle,dx,dy):moveTile(b.Zones,id,dx,dy));
  }
}
