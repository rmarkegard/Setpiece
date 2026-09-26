import {ChangeDetectionStrategy,Component,inject,signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {MAT_DIALOG_DATA,MatDialogModule,MatDialogRef} from '@angular/material/dialog';
import {MatButtonModule} from '@angular/material/button';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {IconComponent} from '../ui/icon';

export interface ConfirmData {
  icon:string;
  headline:string;
  body:string;
  actions:{label:string;value:string;kind?:'text'|'filled';danger?:boolean}[];
}

/** The M3 basic dialog: hero icon, headline, supporting text, actions on the trailing edge. */
@Component({
  selector:'sp-confirm-dialog',
  changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[MatDialogModule,MatButtonModule,IconComponent],
  template:`
    <div class="basic">
      <sp-icon class="hero-icon" [name]="data.icon"/>
      <h2 mat-dialog-title class="headline-small">{{data.headline}}</h2>
      <mat-dialog-content><p class="body-medium on-surface-variant">{{data.body}}</p></mat-dialog-content>
      <mat-dialog-actions align="end">
        @for(action of data.actions;track action.value){
          <button [matButton]="action.kind==='filled'?'filled':'text'" [class.danger]="action.danger" [mat-dialog-close]="action.value" [attr.cdkFocusInitial]="action.kind==='filled'?'':null">{{action.label}}</button>
        }
      </mat-dialog-actions>
    </div>`,
  styleUrl:'./dialog.scss'
})
export class ConfirmDialog {readonly data=inject<ConfirmData>(MAT_DIALOG_DATA);}

export interface NameData {headline:string;body:string;action:string;value:string;note?:string;}

@Component({
  selector:'sp-name-dialog',
  changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[FormsModule,MatDialogModule,MatButtonModule,MatFormFieldModule,MatInputModule,IconComponent],
  template:`
    <form class="basic" (ngSubmit)="submit()">
      <sp-icon class="hero-icon" name="space_dashboard"/>
      <h2 mat-dialog-title class="headline-small">{{data.headline}}</h2>
      <mat-dialog-content>
        <p class="body-medium on-surface-variant">{{data.body}}</p>
        @if(data.note){<p class="body-small on-surface-variant note"><sp-icon name="info"/>{{data.note}}</p>}
        <mat-form-field><mat-label>Workspace name</mat-label><input matInput name="name" [ngModel]="name()" (ngModelChange)="name.set($event)" maxlength="80" cdkFocusInitial required></mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" mat-dialog-close>Cancel</button>
        <button matButton="filled" type="submit" [disabled]="!name().trim()">{{data.action}}</button>
      </mat-dialog-actions>
    </form>`,
  styleUrl:'./dialog.scss'
})
export class NameDialog {
  readonly data=inject<NameData>(MAT_DIALOG_DATA);
  private readonly ref=inject(MatDialogRef<NameDialog,string>);
  readonly name=signal(this.data.value);
  submit(){if(this.name().trim())this.ref.close(this.name().trim());}
}
