import {bootstrapApplication} from '@angular/platform-browser';
import {provideZonelessChangeDetection} from '@angular/core';
import {MAT_FORM_FIELD_DEFAULT_OPTIONS,MatFormFieldDefaultOptions} from '@angular/material/form-field';
import {installMock} from './dev/mock';
import {AppComponent} from './app/app';

installMock();
bootstrapApplication(AppComponent,{providers:[
  provideZonelessChangeDetection(),
  // Every field is outlined, and long hints push content down instead of overlapping it.
  {provide:MAT_FORM_FIELD_DEFAULT_OPTIONS,useValue:{appearance:'outline',subscriptSizing:'dynamic'} satisfies MatFormFieldDefaultOptions}
]}).catch(error=>{document.body.textContent='Setpiece could not start: '+error.message;});
