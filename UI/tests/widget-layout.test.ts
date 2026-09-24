import test from 'node:test';
import assert from 'node:assert/strict';
import {widgetContentLimit} from '../src/widget-layout.ts';

test('calendar keeps two upcoming events in a small widget and scales with available space',()=>{
 assert.equal(widgetContentLimit('google-calendar',180,120),2);
 assert.equal(widgetContentLimit('google-calendar',320,260),3);
 assert.equal(widgetContentLimit('google-calendar',620,1000),15);
});

test('widget content grows using each widget’s own layout needs',()=>{
 const small={width:190,height:160},medium={width:360,height:320},large={width:620,height:800};
 for(const id of ['weather','email','ruter','reddit','discord','news','codex','clock','bambu-lab','idle-game','github','market']){
  const counts=[small,medium,large].map(size=>widgetContentLimit(id,size.width,size.height));
  assert.ok(counts[0]<=counts[1]&&counts[1]<=counts[2],`${id} should reveal more content as it grows: ${counts}`);
 }
});

test('widget content limits remain bounded for invalid and oversized dimensions',()=>{
 assert.equal(widgetContentLimit('google-calendar',Number.NaN,Number.POSITIVE_INFINITY),2);
 assert.equal(widgetContentLimit('google-calendar',1000,10000),24);
 assert.equal(widgetContentLimit('discord',5000,10000),10);
});
