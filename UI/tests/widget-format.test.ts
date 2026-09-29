import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ago,clockTime,compact,eventStart,forecastCurve,isoWeek,lineKind,odoPlaces,outputName,pick,printStage,quotaSpan,shortChipName,siden,untilLabel,weatherSky} from '../src/widget-format.ts';

test('odometer places roll digits and keep other characters fixed, rightmost first',()=>{
  const places=odoPlaces('16°');
  assert.deepEqual(places.map(p=>p.digit),[true,true,false]);
  assert.equal(places[1].transform,'translateY(-6em)');assert.equal(places[1].delay,'0ms');assert.equal(places[0].delay,'70ms');
  assert.equal(places[2].char,'°');
});
test('weather codes map to the three painted skies with honest words',()=>{
  assert.deepEqual(weatherSky(0),{sky:'clear',label:'Clear skies'});
  assert.deepEqual(weatherSky(2),{sky:'partly',label:'Partly cloudy'});
  assert.deepEqual(weatherSky(61),{sky:'rain',label:'Light rain'});
  assert.equal(weatherSky(73).label,'Snow');assert.equal(weatherSky(95).label,'Thunderstorm');
});
test('the forecast curve spans the box and keeps the design range for mild days',()=>{
  const {pts,line,area}=forecastCurve([16,17,17,16,14,12]);
  assert.equal(pts.length,6);assert.equal(pts[0][0],0);assert.equal(pts[5][0],100);
  // The canvas plots 7–22 °C for this sample: 16 °C sits at 40 %.
  assert.equal(pts[0][1].toFixed(1),'40.0');
  assert.ok(line.startsWith('M0 40.00'));assert.ok(area.endsWith('L100 100 L0 100 Z'));
  const cold=forecastCurve([-20,-5,10]);assert.ok(cold.pts.every(p=>p[1]>=0&&p[1]<=100));
});
test('event starts come from the ISO start, or from the older day-and-time detail',()=>{
  const now=new Date(2026,8,28,20,0);
  assert.equal(eventStart({title:'x',detail:'',start:'2026-10-01T15:30:00.000Z'},now),Date.parse('2026-10-01T15:30:00.000Z'));
  const fallback=new Date(eventStart({title:'x',detail:'Wed 17:30 · Odeon Kino'},now));
  assert.equal(fallback.getDay(),3);assert.equal(fallback.getHours(),17);assert.equal(fallback.getMinutes(),30);
  assert.ok(Number.isNaN(eventStart({title:'x',detail:'someday'},now)));
});
test('the next-event chip counts down in words',()=>{
  assert.equal(untilLabel(4*60000),'in 4 min');assert.equal(untilLabel(2*3600000),'in 2 h');
  assert.equal(untilLabel(26*3600000),'Tomorrow');assert.equal(untilLabel(5*86400000),'in 5 days');assert.equal(untilLabel(30*86400000),'in 4 weeks');
});
test('ISO weeks match the calendar',()=>{
  assert.equal(isoWeek(new Date(2026,8,28)),40);assert.equal(isoWeek(new Date(2027,0,1)),53);assert.equal(isoWeek(new Date(2026,0,5)),2);
});
test('quota windows are read as five hours, a week or a month',()=>{
  assert.equal(quotaSpan({used:1,minutes:300}),'5h');assert.equal(quotaSpan({used:1,name:'rolling'}),'5h');
  assert.equal(quotaSpan({used:1,minutes:10080}),'Week');assert.equal(quotaSpan({used:1,name:'weekly'}),'Week');
  assert.equal(quotaSpan({used:1,name:'monthly'}),'Month');assert.equal(quotaSpan({used:1,minutes:60}),null);
});
test('printer states become the card stages',()=>{
  assert.equal(printStage('RUNNING'),'printing');assert.equal(printStage('PAUSE'),'paused');assert.equal(printStage('FINISH'),'done');
  assert.equal(printStage('FAILED'),'failed');assert.equal(printStage('IDLE'),'idle');assert.equal(printStage(''),'idle');
});
test('chip and device names are shortened the way people say them',()=>{
  assert.equal(shortChipName('AMD Ryzen 7 7800X3D 8-Core Processor'),'Ryzen 7 7800X3D');
  assert.equal(shortChipName('Intel(R) Core(TM) i7-12700K CPU @ 3.60GHz'),'Core i7-12700K');
  assert.equal(shortChipName('NVIDIA GeForce RTX 4070'),'RTX 4070');
  assert.equal(outputName('Speakers (Realtek(R) Audio)'),'Speakers · Realtek(R) Audio');assert.equal(outputName('Headphones'),'Headphones');
});
test('transport modes pick the line badge',()=>{
  assert.equal(lineKind('bus'),'bus');assert.equal(lineKind('tram'),'tram');assert.equal(lineKind('rail'),'train');assert.equal(lineKind('metro'),'train');assert.equal(lineKind('water'),'bus');
});
test('relative times read naturally in English and Norwegian',()=>{
  const now=Date.parse('2026-09-28T20:00:00Z');
  assert.equal(ago(now-20000,now),'Just now');assert.equal(ago(now-40*60000,now),'40m ago');assert.equal(ago(now-5*3600000,now),'5h ago');assert.equal(ago(undefined,now),'');
  assert.equal(siden(now-12*60000,now),'12 min siden');assert.equal(siden(now-3*3600000,now),'3 t siden');assert.equal(siden(now,now),'Akkurat nå');
});
test('numbers and times are formatted compactly',()=>{
  assert.equal(compact(4210),'4.2k');assert.equal(compact(860),'860');
  assert.equal(clockTime(new Date(2026,8,28,9,5)),'09:05');
  assert.equal(pick('2Z8WuEywRWYTKe1NybPQEW',4),0);assert.ok(pick('anything',4)<4);
});
