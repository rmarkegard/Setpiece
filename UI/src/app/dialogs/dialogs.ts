import {Injectable,inject} from '@angular/core';
import {MatDialog} from '@angular/material/dialog';
import {firstValueFrom} from 'rxjs';
import {StudioStore} from '../state/studio-store';
import {ConfirmData,ConfirmDialog,NameData,NameDialog} from './basic-dialogs';
import {WidgetDialog,WidgetDialogData} from './widget-dialog';

/** Opens the Studio's dialogs and carries out what the user chose. */
@Injectable({providedIn:'root'})
export class Dialogs {
  private readonly dialog=inject(MatDialog);
  private readonly store=inject(StudioStore);

  constructor(){
    this.store.dialogs={
      closeUnsaved:()=>void this.closeUnsaved(),
      manage:id=>this.widget(id,id==='idle-game'),
      inspect:id=>this.widget(id),
      guide:service=>this.widget(service==='calendar'?'google-calendar':service)
    };
  }

  private confirm(data:ConfirmData){return firstValueFrom(this.dialog.open<ConfirmDialog,ConfirmData,string>(ConfirmDialog,{data,autoFocus:'dialog'}).afterClosed());}
  private name(data:NameData){return firstValueFrom(this.dialog.open<NameDialog,NameData,string>(NameDialog,{data}).afterClosed());}

  widget(id:string,play=false){
    this.dialog.closeAll();
    const ref=this.dialog.open<WidgetDialog,WidgetDialogData>(WidgetDialog,{data:{id,play},maxWidth:'none',panelClass:'sp-dialog',autoFocus:'dialog'});
    ref.componentInstance.openAccount=account=>this.widget(account);
  }

  async createProfile(){
    const name=await this.name({headline:'New workspace',body:'Give it a name that fits what you do there.',action:'Create',value:'',note:this.store.dirty()?'Your current workspace is saved first.':undefined});
    if(name)await this.store.createProfile(name);
  }
  async rename(){
    const name=await this.name({headline:'Rename workspace',body:'This is the name you pick it by.',action:'Rename',value:this.store.profile().Name});
    if(name)this.store.rename(name);
  }
  async switchProfile(key:string){
    if(key===this.store.key())return;
    if(!this.store.dirty()){await this.store.loadProfile(key);return;}
    const choice=await this.confirm({icon:'save',headline:'Save your changes?',body:`${this.store.profile().Name} has changes you haven't saved. Save them before switching?`,actions:[{label:'Cancel',value:'cancel'},{label:'Discard',value:'discard'},{label:'Save and switch',value:'save',kind:'filled'}]});
    if(choice==='discard')await this.store.loadProfile(key);
    if(choice==='save')await this.store.saveAndSwitch(key);
  }
  async closeUnsaved(){
    const choice=await this.confirm({icon:'save',headline:'Save before closing?',body:`${this.store.profile().Name} has changes you haven't saved.`,actions:[{label:'Keep working',value:'cancel'},{label:'Discard and close',value:'discard'},{label:'Save and close',value:'save',kind:'filled'}]});
    if(choice==='discard')this.store.windowAction('close-confirmed');
    if(choice==='save')await this.store.saveAndClose();
  }
  async deleteProfile(){
    const choice=await this.confirm({icon:'delete',headline:`Delete ${this.store.profile().Name}?`,body:'This removes the saved workspace. Your apps and connections stay on this PC.',actions:[{label:'Cancel',value:'cancel'},{label:'Delete',value:'delete',kind:'filled',danger:true}]});
    if(choice==='delete')await this.store.deleteProfile();
  }
}
