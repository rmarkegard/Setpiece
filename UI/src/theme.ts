import {argbFromHex,hexFromArgb,Hct,SchemeTonalSpot,MaterialDynamicColors,TonalPalette,DynamicScheme} from '@material/material-color-utilities';

// Theme identity is independent of color, leaving room for distinct themes later.
export interface Appearance {scheme:string;mode:'dark'|'light';accent:string;opacity:number;dim:number;glow:number;radius:number;reducedMotion:boolean;uiScale:number;fontScale:number;}
export const defaultAccent='#5e5ce6';
export const accentColors=[{name:'Iris',color:defaultAccent},{name:'Sage',color:'#517c60'},{name:'Ocean',color:'#316b85'},{name:'Rose',color:'#ad526f'},{name:'Clay',color:'#96694c'},{name:'Amber',color:'#a87919'}];
export const defaultAppearance:Appearance={scheme:'setpiece',mode:'dark',accent:defaultAccent,opacity:1,dim:.3,glow:.1,radius:24,reducedMotion:false,uiScale:1,fontScale:1};
const legacySeeds:Record<string,string>={terminal:'#517c60',luna:'#686299',tidal:'#316b85',clay:'#96694c'};
const validColor=(value:unknown):value is string=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value);
// User scale preferences. Both are clamped to a usable range and snapped to 0.05 so
// the Settings sliders, the persisted JSON and the CSS custom properties all agree.
export const uiScaleRange={min:.8,max:1.6};
export const fontScaleRange={min:.8,max:1.5};
const scaleValue=(value:unknown,min:number,max:number):number=>{const n=typeof value==='number'?value:typeof value==='string'&&value.trim()!==''?Number(value):NaN;if(!Number.isFinite(n))return 1;return Math.round(Math.min(max,Math.max(min,n))*20)/20;};
export function normalizeAppearance(value:Partial<Appearance>|null|undefined):Appearance{
  const prefs={...defaultAppearance,...value};
  const accent=validColor(value?.accent)?value.accent.toLowerCase():legacySeeds[prefs.scheme]??defaultAccent;
  return {...prefs,scheme:'setpiece',mode:prefs.mode==='light'?'light':'dark',accent,uiScale:scaleValue(prefs.uiScale,uiScaleRange.min,uiScaleRange.max),fontScale:scaleValue(prefs.fontScale,fontScaleRange.min,fontScaleRange.max)};
}
export function colorRoles(seed:string,dark:boolean):Record<string,string>{
  const base=new SchemeTonalSpot(Hct.fromInt(argbFromHex(validColor(seed)?seed:defaultAccent)),dark,0);
  // Warm neutral surfaces, slate secondary controls, and earthy tertiary accents.
  const scheme=new DynamicScheme({...base,primaryPalette:TonalPalette.fromInt(argbFromHex(validColor(seed)?seed:defaultAccent)),neutralPalette:TonalPalette.fromHueAndChroma(80,4),neutralVariantPalette:TonalPalette.fromHueAndChroma(80,6),secondaryPalette:TonalPalette.fromHueAndChroma(260,16),tertiaryPalette:TonalPalette.fromHueAndChroma(70,16)});
  const roles:Record<string,string>={};
  for(const [name,value] of Object.entries(MaterialDynamicColors))if(value&&typeof value==='object'&&'getArgb' in value){const role=name.replace(/[A-Z]/g,c=>'-'+c.toLowerCase());roles[role]=hexFromArgb(value.getArgb(scheme));}
  return roles;
}
export function applyAppearance(value:Appearance){
  const prefs=normalizeAppearance(value),roles=colorRoles(prefs.accent,prefs.mode==='dark');
  const root=document.documentElement;for(const [role,color] of Object.entries(roles))root.style.setProperty('--mat-sys-'+role,color);
  root.style.colorScheme=prefs.mode;root.dataset['mode']=prefs.mode;
  root.style.setProperty('--surface-opacity',String(prefs.opacity));root.style.setProperty('--wallpaper-dim',String(prefs.dim));root.style.setProperty('--glow',String(prefs.glow));root.style.setProperty('--user-radius',prefs.radius+'px');root.classList.toggle('reduced-motion',prefs.reducedMotion);
  // Structural sizes (space, shape, chrome) ride --ui-scale; the rem root rides --font-scale.
  root.style.setProperty('--ui-scale',String(prefs.uiScale));root.style.setProperty('--font-scale',String(prefs.fontScale));
}
