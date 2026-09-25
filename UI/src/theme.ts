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
export const radiusRange={min:4,max:32};
const scaleValue=(value:unknown,min:number,max:number):number=>{const n=typeof value==='number'?value:typeof value==='string'&&value.trim()!==''?Number(value):NaN;if(!Number.isFinite(n))return 1;return Math.round(Math.min(max,Math.max(min,n))*20)/20;};
export function normalizeAppearance(value:Partial<Appearance>|null|undefined):Appearance{
  const prefs={...defaultAppearance,...value};
  const accent=validColor(value?.accent)?value.accent.toLowerCase():legacySeeds[prefs.scheme]??defaultAccent;
  return {...prefs,scheme:'setpiece',mode:prefs.mode==='light'?'light':'dark',accent,uiScale:scaleValue(prefs.uiScale,uiScaleRange.min,uiScaleRange.max),fontScale:scaleValue(prefs.fontScale,fontScaleRange.min,fontScaleRange.max)};
}

/**
 * Material 3 dynamic color from the user's accent. The accent is kept exactly as the
 * primary key color; secondary, tertiary and the neutrals are all derived from its hue,
 * so changing the accent recolors every surface and every widget category.
 */
export function colorRoles(seed:string,dark:boolean):Record<string,string>{
  const source=Hct.fromInt(argbFromHex(validColor(seed)?seed:defaultAccent));
  const base=new SchemeTonalSpot(source,dark,0);
  const scheme=new DynamicScheme({...base,
    primaryPalette:TonalPalette.fromInt(source.toInt()),
    secondaryPalette:TonalPalette.fromHueAndChroma(source.hue,24),
    tertiaryPalette:TonalPalette.fromHueAndChroma((source.hue+60)%360,32),
    neutralPalette:TonalPalette.fromHueAndChroma(source.hue,5),
    neutralVariantPalette:TonalPalette.fromHueAndChroma(source.hue,9)});
  const roles:Record<string,string>={};
  for(const [name,value] of Object.entries(MaterialDynamicColors))if(value&&typeof value==='object'&&'getArgb' in value){const role=name.replace(/[A-Z]/g,c=>'-'+c.toLowerCase());roles[role]=hexFromArgb(value.getArgb(scheme));}
  // Play is the one fixed hue: a bright game green, still toned like any other container.
  const play=TonalPalette.fromHueAndChroma(150,40);
  roles['play-container']=hexFromArgb(play.tone(dark?30:90));
  roles['on-play-container']=hexFromArgb(play.tone(dark?90:10));
  roles['play']=hexFromArgb(play.tone(dark?80:40));
  return roles;
}

/** Widget categories map onto color roles so every widget follows the accent. */
export type WidgetCategory='Daily'|'Connected'|'Device'|'Play'|'Preview'|'Retired';
export const categoryRoles:Record<WidgetCategory,{container:string;onContainer:string;accent:string}>={
  Daily:{container:'primary-container',onContainer:'on-primary-container',accent:'primary'},
  Connected:{container:'secondary-container',onContainer:'on-secondary-container',accent:'secondary'},
  Device:{container:'tertiary-container',onContainer:'on-tertiary-container',accent:'tertiary'},
  Play:{container:'play-container',onContainer:'on-play-container',accent:'play'},
  Preview:{container:'surface-container-highest',onContainer:'on-surface',accent:'on-surface-variant'},
  Retired:{container:'surface-container-highest',onContainer:'on-surface-variant',accent:'outline'}
};
export function categoryRole(category:string){return categoryRoles[category as WidgetCategory]??categoryRoles.Preview;}

/**
 * Expressive corner shapes per category, as [top-left, top-right, bottom-right, bottom-left]
 * multiples of the corner token. One smaller corner gives each family a recognizable silhouette.
 */
export const categoryShapes:Record<WidgetCategory,[number,number,number,number]>={
  Daily:[1,1,1,1],Connected:[1,1,1,.25],Device:[1,.25,1,1],Play:[1.5,1.5,1.5,1.5],Preview:[1,1,1,1],Retired:[1,1,1,1]
};
export function categoryShape(category:string){return categoryShapes[category as WidgetCategory]??categoryShapes.Preview;}

/** The user's corner radius drives the whole shape scale; 24px is the Material default. */
export function shapeScale(radius:number){const r=Number.isFinite(radius)?Math.min(radiusRange.max,Math.max(radiusRange.min,radius)):24;return r/24;}

export function applyAppearance(value:Appearance){
  const prefs=normalizeAppearance(value),roles=colorRoles(prefs.accent,prefs.mode==='dark');
  const root=document.documentElement;for(const [role,color] of Object.entries(roles))root.style.setProperty('--mat-sys-'+role,color);
  root.style.colorScheme=prefs.mode;root.dataset['mode']=prefs.mode;
  root.style.setProperty('--surface-opacity',String(prefs.opacity));root.style.setProperty('--wallpaper-dim',String(prefs.dim));root.style.setProperty('--glow',String(prefs.glow));root.style.setProperty('--user-radius',prefs.radius+'px');root.style.setProperty('--shape-scale',String(shapeScale(prefs.radius)));root.classList.toggle('reduced-motion',prefs.reducedMotion);
  // Structural sizes (space, shape, chrome) ride --ui-scale; the rem root rides --font-scale.
  root.style.setProperty('--ui-scale',String(prefs.uiScale));root.style.setProperty('--font-scale',String(prefs.fontScale));
}
