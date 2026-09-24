import { Injectable } from '@angular/core';
declare global { interface Window { chrome?: {webview?: {postMessage:(message:unknown)=>void;addEventListener:(name:string,callback:(event:MessageEvent)=>void)=>void}}; } }
@Injectable({providedIn:'root'})
export class Bridge {
  private sequence=0;
  private pending=new Map<number,{resolve:(value:any)=>void;reject:(reason:Error)=>void;timeout:ReturnType<typeof setTimeout>}>();
  onEvent:(event:any)=>void=()=>{};
  private listeners=new Set<(event:any)=>void>();
  listen(listener:(event:any)=>void){this.listeners.add(listener);return()=>this.listeners.delete(listener);}
  constructor(){window.chrome?.webview?.addEventListener('message',event=>{
    const data=event.data;if(data.event){this.onEvent(data);for(const listener of this.listeners)listener(data);return;}
    const task=this.pending.get(data.id);if(!task)return;clearTimeout(task.timeout);this.pending.delete(data.id);
    if(data.error)task.reject(new Error(data.error));else task.resolve(data.result);
  });}
  call<T=any>(command:string,payload:unknown={}):Promise<T>{
    if(!window.chrome?.webview)return Promise.reject(new Error('Open Setpiece.exe to connect this interface to Windows.'));
    return new Promise((resolve,reject)=>{const id=++this.sequence;const timeout=setTimeout(()=>{this.pending.delete(id);reject(new Error('This request took too long. Try again.'));},180000);this.pending.set(id,{resolve,reject,timeout});window.chrome!.webview!.postMessage({id,command,payload});});
  }
}
