const clamp = (value:number,min:number,max:number) => Math.max(min,Math.min(max,value));

/** Number of optional rows or details that fit in a widget's usable content area. */
export function widgetContentLimit(id:string,width:number,height:number):number {
  width=Number.isFinite(width)?Math.max(0,width):0;
  height=Number.isFinite(height)?Math.max(0,height):0;
  const widthFactor=width<220?1.6:width<320?1.25:1;
  const rows=(reserved:number,rowHeight:number,min:number,max:number)=>
    clamp(Math.floor(Math.max(0,height-reserved)/(rowHeight*widthFactor)),min,max);

  switch(id){
    case 'google-calendar': {
      const compact=width<220||height<220;
      return clamp(Math.floor(Math.max(0,height-(compact?36:84))/(compact?38:58)),2,24);
    }
    case 'weather':
      if(width<200||height<90)return 2;
      if(width>=300)return 5;
      if(width>=230)return 4;
      return 3;
    case 'email': return rows(72,66,1,8);
    case 'ruter': return rows(42,44,1,6);
    case 'reddit': return rows(30,70,1,6);
    case 'discord': return rows(86,48,2,10);
    case 'news': return rows(140,70,1,6);
    case 'codex':
      if(width<175||height<100)return 1;
      if(width>=300&&height>=260)return 3;
      return 2;
    case 'clock':
      if(width<220||height<170)return 1;
      if(width>=440&&height>=440)return 4;
      return 2;
    case 'bambu-lab':
      if(width<260||height<220)return 1;
      if(width<440||height<420)return 2;
      return 4;
    case 'idle-game':
      if(width<220||height<220)return 7;
      return width>=440&&height>=420?28:14;
    case 'github':
      if(width<240||height<220)return 16;
      return width>=440&&height>=420?40:28;
    case 'market':
      if(width<240||height<220)return 3;
      return width>=440&&height>=420?6:4;
    default: return rows(50,56,1,8);
  }
}
