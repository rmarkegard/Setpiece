import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAppearance,defaultAppearance,colorRoles,accentColors,type Appearance} from '../src/theme.ts';

for(const [scheme,accent] of Object.entries({terminal:'#517c60',luna:'#686299',tidal:'#316b85',clay:'#96694c'})){
  test(`migrates ${scheme} without losing mode or surface preferences`,()=>{
    const result=normalizeAppearance({scheme,accent:'',mode:'light',radius:12,opacity:.85});
    assert.equal(result.scheme,'setpiece');assert.equal(result.accent,accent);
    assert.equal(result.mode,'light');assert.equal(result.radius,12);assert.equal(result.opacity,.85);
    assert.deepEqual(normalizeAppearance(result),result);
  });
}
test('custom accents take precedence over legacy colors',()=>{
  assert.equal(normalizeAppearance({scheme:'clay',accent:'#AABBCC'}).accent,'#aabbcc');
});
test('missing and invalid preferences recover to a usable theme',()=>{
  assert.deepEqual(normalizeAppearance(null),defaultAppearance);
  assert.equal(normalizeAppearance({scheme:'unknown',accent:'invalid'}).accent,defaultAppearance.accent);
  assert.equal(normalizeAppearance({scheme:'luna'}).accent,'#686299');
});
// appearance-v2.json is forwarded as an untyped JSON object, so a scale preference can
// arrive missing, as a string, or out of range; normalization must always yield a value
// the CSS custom properties can consume.
const prefs=(value:unknown)=>normalizeAppearance(value as Partial<Appearance>);
test('ui and font scale default, clamp, snap to 0.05 and stay idempotent',()=>{
  assert.equal(normalizeAppearance(undefined).uiScale,1);
  assert.equal(normalizeAppearance({}).fontScale,1);
  assert.equal(prefs({uiScale:Number.NaN}).uiScale,1);
  assert.equal(prefs({fontScale:'nope'}).fontScale,1);
  assert.equal(prefs({uiScale:null}).uiScale,1);
  assert.equal(prefs({uiScale:99}).uiScale,1.6);
  assert.equal(prefs({fontScale:9}).fontScale,1.5);
  assert.equal(prefs({uiScale:.1}).uiScale,.8);
  assert.equal(prefs({fontScale:.2}).fontScale,.8);
  assert.equal(prefs({uiScale:1.23}).uiScale,1.25);
  assert.equal(prefs({uiScale:'1.3'}).uiScale,1.3);
  assert.equal(prefs({uiScale:'1.3'}).fontScale,1);
  const scaled=prefs({uiScale:1.35,fontScale:.9});
  assert.deepEqual(normalizeAppearance(scaled),scaled);
});
function luminance(hex:string){const rgb=hex.slice(1).match(/../g)!.map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;}
function contrast(a:string,b:string){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
test('both modes retain readable text for preset and extreme custom accents',()=>{
  for(const accent of [...accentColors.map(a=>a.color),'#ffffff','#000000','#ffff00','#00ff00'])for(const dark of [false,true]){
    const roles=colorRoles(accent,dark);
    for(const [bg,fg] of [['primary','on-primary'],['primary-container','on-primary-container'],['secondary-container','on-secondary-container'],['surface','on-surface'],['surface-container','on-surface-variant']]){
      assert.ok(contrast(roles[bg],roles[fg])>=4.5,`${accent} ${dark?'dark':'light'} ${bg}/${fg}`);
    }
  }
});
