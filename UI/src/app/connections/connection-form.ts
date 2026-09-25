import {ChangeDetectionStrategy,Component,computed,effect,inject,input,output,signal,untracked} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatButtonToggleModule} from '@angular/material/button-toggle';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {Bridge} from '../../bridge';
import {StudioStore} from '../state/studio-store';
import {infoFor,statusIcon,statusLabel} from '../state/services';
import {IconComponent} from '../ui/icon';

const redirect='http://127.0.0.1:43827/callback/';

/**
 * Settings and account connection for one service. Every service uses the same flow:
 * fields, one primary action (Connect, Save or Enable sensors), and Disconnect when the
 * host keeps credentials.
 */
@Component({
  selector:'sp-connection-form',
  changeDetection:ChangeDetectionStrategy.OnPush,
  imports:[FormsModule,MatButtonModule,MatButtonToggleModule,MatFormFieldModule,MatInputModule,MatProgressBarModule,IconComponent],
  templateUrl:'./connection-form.html',
  styleUrl:'./connection-form.scss'
})
export class ConnectionFormComponent {
  readonly id=input.required<string>();
  readonly openGame=output<void>();
  readonly openAccount=output<void>();

  private readonly bridge=inject(Bridge);
  readonly store=inject(StudioStore);
  readonly redirect=redirect;
  readonly info=computed(()=>infoFor(this.id()));
  readonly service=computed(()=>this.info()?.service??this.id());
  readonly status=computed(()=>this.info()?.status(this.store.connections())??'ready');
  readonly statusLabel=computed(()=>statusLabel[this.status()]);
  readonly statusIcon=computed(()=>statusIcon[this.status()]);
  readonly busy=signal(false);
  readonly result=signal<{ok:boolean;text:string}|null>(null);
  readonly stops=signal<{id:string;name:string;label:string}[]>([]);
  readonly places=signal<{name:string;timezone:string;label:string}[]>([]);
  /** Field values, keyed as the host's `connect` command expects them. */
  form:Record<string,any>={};

  constructor(){effect(()=>this.reset(this.service()));}

  private reset(service:string){
    // Read once: a refresh after saving must not wipe what the user just entered.
    const c=untracked(()=>this.store.connections());
    const zones:string[]=structuredClone(c['ClockTimeZones']??['Europe/Oslo','America/New_York']);
    const labels:string[]=c['ClockLocationLabels']??[];
    this.form={
      service,zones,zoneLabels:zones.map((z,i)=>labels[i]??z.split('/').pop()?.replaceAll('_',' ')??z),zoneQuery:'',
      discordMode:c['DiscordCallConnected']?'call':'server',location:c['WeatherLocation']??'',serverId:c['DiscordServerId']??'',
      clientId:c[service==='google'?'GoogleClientId':service==='reddit'?'RedditClientId':service==='discord'?'DiscordClientId':'SpotifyClientId']??'',
      exclusions:(c['CalendarExcludedTitles']??[]).join('\n'),community:c['RedditCommunity']??'technology',host:c['BambuHost']??'',serial:c['BambuSerial']??'',
      provider:c['InboxProvider']??'google',executable:c['CodexExecutable']??'',categoriesText:(c['NewsCategories']??[]).join(', '),
      stopName:c['RuterStopName']??'',query:''
    };
    this.result.set(null);this.stops.set([]);this.places.set([]);
  }

  async searchStops(){try{this.stops.set(await this.bridge.call('stop-search',{query:this.form['query']}));}catch(e){this.result.set({ok:false,text:(e as Error).message});}}
  chooseStop(stop:{id:string;name:string}){this.form['stopId']=stop.id;this.form['stopName']=stop.name;this.stops.set([]);}
  async searchPlaces(){try{this.places.set(await this.bridge.call('timezone-search',{query:this.form['zoneQuery']}));}catch(e){this.result.set({ok:false,text:(e as Error).message});}}
  choosePlace(place:{name:string;timezone:string}){if(this.form['zones'].length>=4)return;this.form['zones'].push(place.timezone);this.form['zoneLabels'].push(place.name);this.form['zoneQuery']='';this.places.set([]);}
  removePlace(index:number){this.form['zones'].splice(index,1);this.form['zoneLabels'].splice(index,1);}

  async commit(){
    this.form['categories']=String(this.form['categoriesText']??'').split(',').map(s=>s.trim()).filter(Boolean);
    this.busy.set(true);this.result.set(null);
    try{const reply=await this.bridge.call('connect',this.form);this.result.set({ok:true,text:[reply?.title,reply?.detail].filter(Boolean).join(' · ')||'Saved'});await this.store.refreshConnections();}
    catch(e){this.result.set({ok:false,text:(e as Error).message});}
    finally{this.busy.set(false);}
  }
  async disconnect(){
    this.busy.set(true);
    try{await this.bridge.call('disconnect',{service:this.service()});await this.store.refreshConnections();this.result.set({ok:true,text:'Disconnected. Your other connections are kept.'});}
    catch(e){this.result.set({ok:false,text:(e as Error).message});}
    finally{this.busy.set(false);}
  }
}
