import {argbFromHex,hexFromArgb,Hct,SchemeTonalSpot,MaterialDynamicColors,TonalPalette,DynamicScheme} from '@material/material-color-utilities';

// Theme identity is independent of color, leaving room for distinct themes later.
export interface Appearance {scheme:string;mode:'dark'|'light';accent:string;opacity:number;dim:number;glow:number;radius:number;reducedMotion:boolean;uiScale:number;fontScale:number;surface:WidgetSurface;palette:WidgetPalette;}
/** Solid cards, or frosted glass that lets the wallpaper glow through. */
export type WidgetSurface='solid'|'glass';
/** Colorful gives every widget its own tone; plain puts them all on one neutral surface. */
export type WidgetPalette='colorful'|'plain';
export const defaultAccent='#5e5ce6';
export const accentColors=[{name:'Iris',color:defaultAccent},{name:'Sage',color:'#517c60'},{name:'Ocean',color:'#316b85'},{name:'Rose',color:'#ad526f'},{name:'Clay',color:'#96694c'},{name:'Amber',color:'#a87919'}];
export const defaultAppearance:Appearance={scheme:'setpiece',mode:'dark',accent:defaultAccent,opacity:1,dim:.3,glow:.1,radius:24,reducedMotion:false,uiScale:1,fontScale:1,surface:'solid',palette:'colorful'};
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
  return {...prefs,scheme:'setpiece',mode:prefs.mode==='light'?'light':'dark',accent,surface:prefs.surface==='glass'?'glass':'solid',palette:prefs.palette==='plain'?'plain':'colorful',uiScale:scaleValue(prefs.uiScale,uiScaleRange.min,uiScaleRange.max),fontScale:scaleValue(prefs.fontScale,fontScaleRange.min,fontScaleRange.max)};
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
  return roles;
}

export type WidgetCategory='Daily'|'Connected'|'Device'|'Preview'|'Retired';
/** The family tone a widget falls back to while it loads, needs setup or has nothing to show. */
export function widgetFamily(category:string){return ({Daily:'daily',Connected:'connected',Device:'device'} as Record<string,string>)[category]??'preview';}
/**
 * Each widget's own tone class (the card color, spun around the colour wheel from the accent),
 * chosen so neighbours on a desk never match. Colors live in styles/widgets.css.
 */
export const widgetTones:Record<string,string>={
  clock:'ck','google-calendar':'cal',weather:'wx',spotify:'mu','bambu-lab':'bb',system:'sy',ruter:'ru',news:'nw',
  codex:'ai',notes:'nt',battery:'bt',volume:'vo',discord:'dz',email:'ib',reddit:'rd'
};
export function widgetTone(id:string){return widgetTones[id]??'';}

/** The user's corner radius drives the whole shape scale; 24px is the Material default. */
export function shapeScale(radius:number){const r=Number.isFinite(radius)?Math.min(radiusRange.max,Math.max(radiusRange.min,radius)):24;return r/24;}

export function applyAppearance(value:Appearance){
  const prefs=normalizeAppearance(value),roles=colorRoles(prefs.accent,prefs.mode==='dark');
  const root=document.documentElement;for(const [role,color] of Object.entries(roles))root.style.setProperty('--mat-sys-'+role,color);
  root.style.colorScheme=prefs.mode;root.dataset['mode']=prefs.mode;
  // Widgets derive every tone from the accent in CSS (oklch relative colour), so any hex works.
  root.style.setProperty('--accent',prefs.accent);root.classList.toggle('glass',prefs.surface==='glass');root.classList.toggle('plain',prefs.palette==='plain');
  root.style.setProperty('--surface-opacity',String(prefs.opacity));root.style.setProperty('--wallpaper-dim',String(prefs.dim));root.style.setProperty('--glow',String(prefs.glow));root.style.setProperty('--user-radius',prefs.radius+'px');root.style.setProperty('--shape-scale',String(shapeScale(prefs.radius)));root.classList.toggle('reduced-motion',prefs.reducedMotion);
  // Structural sizes (space, shape, chrome) ride --ui-scale; the rem root rides --font-scale.
  root.style.setProperty('--ui-scale',String(prefs.uiScale));root.style.setProperty('--font-scale',String(prefs.fontScale));
}
