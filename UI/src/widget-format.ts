import type {ServiceItem} from './domain';

// Pure helpers behind the widgets: formats, parsing and geometry. No Angular, so they are unit-tested
// directly (UI/tests/widget-format.test.ts).

export const pad=(n:number)=>String(n).padStart(2,'0');

/** ISO 8601 week number. */
export function isoWeek(d:Date){
  const t=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));const day=t.getUTCDay()||7;t.setUTCDate(t.getUTCDate()+4-day);
  const y=new Date(Date.UTC(t.getUTCFullYear(),0,1));return Math.ceil(((t.getTime()-y.getTime())/86400000+1)/7);
}

/** Date formats are built once and reused: building one costs far more than using it, and widgets format every second. */
const formats=new Map<string,Intl.DateTimeFormat>();
export function formatDate(at:Date,options:Intl.DateTimeFormatOptions){
  const key=JSON.stringify(options);let format=formats.get(key);
  if(!format){format=new Intl.DateTimeFormat('en-GB',options);formats.set(key,format);}
  return format.format(at);
}

export function zoneTime(zone:string,at:Date){
  try{const t=formatDate(at,{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'});return {t,h:parseInt(t.slice(0,2),10)+parseInt(t.slice(3,5),10)/60};}
  catch{return {t:'--:--',h:0};}
}

/** When an event starts, from its ISO start, or from the older "ddd HH:mm · place" detail. */
export function eventStart(item:ServiceItem,now:Date):number{
  const iso=typeof item['start']==='string'?Date.parse(item['start'] as string):NaN;if(Number.isFinite(iso))return iso;
  const direct=Date.parse(item.detail);if(Number.isFinite(direct))return direct;
  const m=/^(\w{3}) (\d{1,2}):(\d{2})/.exec(item.detail);if(!m)return NaN;
  const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],target=days.indexOf(m[1]);if(target<0)return NaN;
  const d=new Date(now);d.setHours(+m[2],+m[3],0,0);d.setDate(d.getDate()+((target-d.getDay()+7)%7));return d.getTime();
}

/** How far away the next event is, the way the chip says it. */
export function untilLabel(ms:number){
  const h=ms/3600000;
  if(h<1)return 'in '+Math.max(1,Math.round(h*60))+' min';
  if(h<20)return 'in '+Math.round(h)+' h';
  const days=Math.round(h/24);if(days<=1)return 'Tomorrow';if(days<14)return 'in '+days+' days';
  return 'in '+Math.round(days/7)+' weeks';
}

export type Sky='clear'|'partly'|'rain';

/** WMO weather codes to the three skies the card can paint, with the words for them. */
export function weatherSky(code:number):{sky:Sky;label:string}{
  if(code<=0)return {sky:'clear',label:'Clear skies'};
  if(code===1)return {sky:'clear',label:'Mainly clear'};
  if(code===2)return {sky:'partly',label:'Partly cloudy'};
  if(code===3)return {sky:'partly',label:'Overcast'};
  if(code<50)return {sky:'partly',label:'Fog'};
  if(code<56)return {sky:'rain',label:'Drizzle'};
  if(code<58)return {sky:'rain',label:'Freezing drizzle'};
  if(code===61)return {sky:'rain',label:'Light rain'};
  if(code===63)return {sky:'rain',label:'Rain'};
  if(code<66)return {sky:'rain',label:'Heavy rain'};
  if(code<70)return {sky:'rain',label:'Freezing rain'};
  if(code<80)return {sky:'rain',label:'Snow'};
  if(code<83)return {sky:'rain',label:'Showers'};
  if(code<90)return {sky:'rain',label:'Snow showers'};
  return {sky:'rain',label:'Thunderstorm'};
}

/** The next hours as one smooth line (Catmull-Rom as cubic Béziers) in a 100 × 100 box. */
export function forecastCurve(temps:number[]){
  const max=Math.max(...temps),min=Math.min(...temps),span=Math.max(15,max-min+6),lo=(max+min)/2-span/2;
  const pts=temps.map((t,i)=>[i*(100/Math.max(1,temps.length-1)),(1-(t-lo)/span)*100]);
  let d='M'+pts[0][0]+' '+pts[0][1].toFixed(2);
  for(let i=0;i<pts.length-1;i++){
    const p0=pts[i-1]??pts[i],p1=pts[i],p2=pts[i+1],p3=pts[i+2]??p2;
    const c1=[p1[0]+(p2[0]-p0[0])/6,p1[1]+(p2[1]-p0[1])/6],c2=[p2[0]-(p3[0]-p1[0])/6,p2[1]-(p3[1]-p1[1])/6];
    d+=' C'+c1[0].toFixed(2)+' '+c1[1].toFixed(2)+' '+c2[0].toFixed(2)+' '+c2[1].toFixed(2)+' '+p2[0]+' '+p2[1].toFixed(2);
  }
  return {line:d,area:d+' L100 100 L0 100 Z',pts};
}

export const rate=(n:number)=>n>=1048576?(n/1048576).toFixed(1)+' MB/s':(n/1024).toFixed(n>=10240?0:1)+' KB/s';

/** Faster traffic, faster dots. */
export const flowSeconds=(n:number)=>Math.max(.12,1.7-Math.log10(Math.max(10,n))/4.6).toFixed(2);

/** "AMD Ryzen 7 7800X3D 8-Core Processor" → "Ryzen 7 7800X3D"; "NVIDIA GeForce RTX 4070" → "RTX 4070". */
export function shortChipName(name:string){
  return name.replace(/\((R|TM|C)\)/gi,'').replace(/\b(AMD|Intel|NVIDIA|GeForce|Processor|CPU|Graphics|Laptop GPU)\b/gi,'').replace(/\b\d+-Core\b/gi,'').replace(/@.*$/,'').replace(/\s+/g,' ').trim();
}

export function sparkPath(values:number[],lo:number,hi:number){
  const pts=values.map((x,i)=>[(i/Math.max(1,values.length-1)*100).toFixed(2),(100-(Math.max(lo,Math.min(hi,x))-lo)/(hi-lo)*92-4).toFixed(2)]);
  const line='M'+pts.map(p=>p[0]+' '+p[1]).join(' L');return {line,area:line+' L100 100 L0 100 Z'};
}

/** "Speakers (Realtek(R) Audio)" → "Speakers · Realtek(R) Audio". */
export function outputName(name:string){const m=/^(.*?)\s*\((.*)\)\s*$/.exec(name);return m?m[1]+' · '+m[2]:name;}

export interface QuotaWindow {name?:string;minutes?:number;used:number;reset?:number;resetText?:string;}

export type Span='5h'|'Week'|'Month';

/** Which quota a window is: the rolling five hours, the week or the month. */
export function quotaSpan(window:QuotaWindow):Span|null{
  const name=String(window.name??'').toLowerCase();
  if(window.minutes===300||name==='rolling'||name==='five_hour')return '5h';
  if(window.minutes===10080||name==='weekly'||name==='seven_day')return 'Week';
  if((window.minutes??0)>=40320||name==='monthly')return 'Month';
  return null;
}

export type PrintStage='printing'|'paused'|'done'|'failed'|'idle';

/** Printer states to the card's stages. */
export function printStage(state:string):PrintStage{return state==='RUNNING'||state==='PREPARE'?'printing':state==='PAUSE'?'paused':state==='FINISH'?'done':state==='FAILED'?'failed':'idle';}

/** Entur transport modes to the three line badges: buses are filled, trams outlined, trains and metro square. */
export function lineKind(mode:string):'bus'|'tram'|'train'{return mode==='tram'?'tram':['rail','metro','train'].includes(mode)?'train':'bus';}

/** Norwegian relative time, the way VG writes it. */
export function siden(from:number,now:number){
  const minutes=Math.max(0,Math.round((now-from)/60000));
  if(minutes<1)return 'Akkurat nå';if(minutes<60)return minutes+' min siden';
  const hours=Math.round(minutes/60);if(hours<24)return hours+' t siden';return Math.round(hours/24)+' d siden';
}

export const clock=(ms:number)=>{const s=Math.max(0,Math.floor(ms/1000));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');};

/** One place in an odometer: a rolling digit strip, or a fixed character such as ° or :. */
export interface OdoPlace {digit:boolean;transform:string;delay:string;char:string;}

/** Digits roll into place, the rightmost first, so a changing number reads as motion, not a swap. */
export function odoPlaces(value:string|number):OdoPlace[]{
  const text=String(value),places:OdoPlace[]=[];let n=0;
  for(let i=text.length-1;i>=0;i--){
    const char=text[i];
    if(char>='0'&&char<='9'){places.unshift({digit:true,transform:'translateY(-'+char+'em)',delay:n*70+'ms',char});n++;}
    else places.unshift({digit:false,transform:'',delay:'',char});
  }
  return places;
}

/** Relative time for list rows, in English. */
export function ago(from:Date|number|string|undefined,now:number):string{
  const at=from===undefined?NaN:new Date(from).getTime();if(!Number.isFinite(at))return '';
  const minutes=Math.max(0,Math.round((now-at)/60000));
  if(minutes<1)return 'Just now';if(minutes<60)return minutes+'m ago';
  const hours=Math.round(minutes/60);if(hours<24)return hours+'h ago';
  return Math.round(hours/24)+'d ago';
}

/** 1,234 → 1.2k, the way feeds count votes. */
export function compact(value:number){return value>=1000?(value/1000).toFixed(1)+'k':String(Math.round(value));}

/** HH:MM for a timestamp. */
export function clockTime(value:Date|number){const d=new Date(value);return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');}

/** A deterministic 0..n-1 pick from a string, so the same track always gets the same colors. */
export function pick(text:string,n:number){let h=0;for(const c of text)h=(h*31+c.charCodeAt(0))|0;return Math.abs(h)%n;}
