import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {wallpaperNames} from '../src/domain.ts';
import {newTile,preset,splitTile,removeTile,moveBoundary,swapTiles,transform,assertLayout,History,fittingGap,moveTile,resizeTile,vacantTile,vacantRegionAt,dropTile,tilePercentBounds} from '../src/domain.ts';

test('every selectable wallpaper ships and agrees with native validation',()=>{
  const images=wallpaperNames.filter(id=>id!=='ambient');
  assert.equal(images.length,20);
  assert.equal(new Set(wallpaperNames).size,21);
  const assets=new URL('../../Setpiece/Assets/Wallpapers/',import.meta.url);
  assert.deepEqual(readdirSync(assets).sort(),images.map(id=>id+'.jpg').sort());
  const native=readFileSync(new URL('../../Setpiece/ProfileRules.cs',import.meta.url),'utf8');
  const nativeIds=[...native.match(/WallpaperIds\s*=\s*\[([\s\S]*?)\]/)![1].matchAll(/"([^"]+)"/g)].map(match=>match[1]);
  assert.deepEqual(nativeIds,wallpaperNames);
  for(const id of images){
    const bytes=readFileSync(new URL(id+'.jpg',assets));
    assert.equal(bytes.readUInt16BE(0),0xffd8,id+' must be a JPEG');
    assert.ok(bytes.length>10000,id+' must contain artwork');
  }
});

test('large gaps adapt to narrow tiles on a smaller display',()=>{
  const tiles=preset('columns',3);tiles[0].Width=.475;tiles[1].X=.475;tiles[1].Width=.025;tiles[2].X=.5;tiles[2].Width=.5;
  assertLayout(tiles);
  assert.equal(fittingGap(40,16,tiles,960,600),22.200000000000003);
  assert.equal(fittingGap(12,16,preset('columns',3),1920,1080),12);
});

test('every preset fills the monitor from 1 to 20 tiles',()=>{
  for(const kind of ['balanced','rows','columns','main-half','main-third','main-two'])for(let count=1;count<=20;count++){const tiles=preset(kind,count);assertLayout(tiles);assert.ok(Math.abs(tiles.reduce((sum,t)=>sum+t.Width*t.Height,0)-1)<1e-7);}
});
test('invalid split target produces an actionable error without mutation',()=>{
  const tiles=[newTile()];const before=structuredClone(tiles);
  assert.throws(()=>splitTile(tiles,'missing',true),/Select a tile/);assert.deepEqual(tiles,before);
});
test('shared boundary resizes both neighbors',()=>{
  const tiles=preset('columns',3);const result=moveBoundary(tiles,'x',1/3,.11,0);
  assert.ok(Math.abs(result[0].Width-(1/3+.11))<1e-6);
  assert.ok(Math.abs(result[1].X-(1/3+.11))<1e-6);assert.equal(result[2].Width,tiles[2].Width);assertLayout(result);
});
test('layout transforms are reversible',()=>{
  const tiles=preset('main-third',7);
  let rotated=tiles;for(let i=0;i<4;i++)rotated=transform(rotated,'rotate');
  for(let i=0;i<tiles.length;i++)for(const key of ['X','Y','Width','Height'] as const)assert.ok(Math.abs(rotated[i][key]-tiles[i][key])<1e-6);
  assert.deepEqual(swapTiles(swapTiles(tiles,tiles[0].Id,tiles[1].Id),tiles[0].Id,tiles[1].Id),tiles);
});
test('generated edit sequences stay bounded, non-overlapping and preserve content',()=>{
  let seed=81;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/2**32;};
  for(let run=0;run<50;run++){
    let tiles=[newTile()];
    for(let step=0;step<100;step++){
      const chosen=tiles[Math.floor(random()*tiles.length)];const operation=Math.floor(random()*4);
      if(operation===0&&tiles.length<20&&(chosen.Width>.1||chosen.Height>.1))tiles=splitTile(tiles,chosen.Id,chosen.Width>=chosen.Height);
      else if(operation===1&&tiles.length>1){const ids=tiles.filter(t=>t.Id!==chosen.Id).map(t=>t.Id).sort();tiles=removeTile(tiles,chosen.Id);assert.deepEqual(tiles.map(t=>t.Id).sort(),ids);}
      else if(operation===2)tiles=transform(tiles,'rotate');
      else if(operation===3&&chosen.X>0)tiles=moveBoundary(tiles,'x',chosen.X,(random()-.5)*.05,0);
      assertLayout(tiles);
    }
  }
});
test('history caps at 60 and new edits invalidate redo',()=>{
  const history=new History<number>();for(let i=0;i<70;i++)history.commit(i);
  let current=70;let count=0;while(history.canUndo){current=history.undo(current);count++;}
  assert.equal(count,60);assert.equal(current,10);assert.equal(history.redo(current),11);history.commit(100);assert.equal(history.canRedo,false);
});

test('disconnected aligned edges move independently and a shared corner moves both arms',()=>{
  const tiles=preset('balanced',4);
  const top=moveBoundary(tiles,'x',.5,.1,0,.25);
  assert.equal(top[0].Width,.6);assert.equal(top[2].Width,.5);assertLayout(top);
  const corner=moveBoundary(moveBoundary(tiles,'x',.5,.1,0,.5),'y',.5,-.1,0,.6);
  assert.equal(corner[0].Width,.6);assert.equal(corner[2].Width,.6);assert.equal(corner[0].Height,.4);assertLayout(corner);
});

test('free placement preserves contents, empty space and unrelated tile geometry',()=>{
 const tiles=[newTile(.1,.1,.2,.2),newTile(.7,.6,.2,.3)];tiles[0].ContentKind='Widget';tiles[0].WidgetId='clock';
 const moved=moveTile(tiles,tiles[0].Id,.123,.217);assert.equal(moved[0].X,.223);assert.equal(moved[0].Y,.317);assert.equal(moved[0].WidgetId,'clock');assert.deepEqual(moved[1],tiles[1]);assert.equal(tiles[0].X,.1);
 const removed=removeTile(tiles,tiles[0].Id);assert.deepEqual(removed,[tiles[1]]);
 assertLayout(moved);assertLayout(removed);
});
test('fast moves cannot jump across tiles and edge contact is allowed',()=>{
 const tiles=[newTile(0,.2,.2,.2),newTile(.4,0,.1,1)];
 const moved=moveTile(tiles,tiles[0].Id,.8,0);assert.ok(Math.abs(moved[0].X-.2)<1e-7);assertLayout(moved);
 const touching=[newTile(.2,.2,.2,.2),tiles[1]];assert.ok(moveTile(touching,touching[0].Id,-.1,0)[0].X<.2);
 assert.equal(moveTile(touching,touching[0].Id,0,.3)[0].Y,.5);
});
test('individual resizing creates gaps and stops at neighbors and monitor bounds',()=>{
 const tiles=preset('columns',2),id=tiles[0].Id;
 const smaller=resizeTile(tiles,id,'se',-.15,-.3);assert.ok(Math.abs(smaller[0].Width-.35)<1e-7);assert.equal(smaller[0].Height,.7);assert.deepEqual(smaller[1],tiles[1]);
 const bigger=resizeTile(smaller,id,'e',1,0);assert.ok(Math.abs(bigger[0].Width-.5)<1e-7);
 const tiny=resizeTile(smaller,id,'nw',1,1);assert.ok(tiny[0].Width>=.025-1e-7&&tiny[0].Height>=.025-1e-7);assertLayout(tiny);
});
test('snap is optional and dragging stays within the display',()=>{
 const tiles=[newTile(.1,.1,.2,.2)],id=tiles[0].Id;
 assert.ok(Math.abs(moveTile(tiles,id,.123,.117,.05)[0].X-.2)<1e-7);
 assert.equal(moveTile(tiles,id,.123,.117,0)[0].X,.223);
 const bounded=moveTile(tiles,id,10,-10)[0];assert.equal(bounded.X,.8);assert.equal(bounded.Y,0);
});
test('new tiles use empty space without rearranging neighbors',()=>{
 const tiles=[newTile(0,0,.5,1),newTile(.5,0,.5,.5)],added=vacantTile(tiles);assert.ok(added);assertLayout([...tiles,added]);assert.ok(added.X>=.5&&added.Y>=.5);assert.equal(vacantTile(preset('columns',3)),null);
});
test('dropping fills free space or swaps with the tile under the pointer',()=>{
 const tiles=[newTile(0,0,.5,1),newTile(.5,0,.5,.5)],moving=tiles[0],target=tiles[1];
 const region=vacantRegionAt(tiles,moving.Id,.75,.75);assert.ok(region);assert.deepEqual([region.X,region.Y,region.Width,region.Height],[0,.5,1,.5]);
 const filled=dropTile(tiles,moving.Id,.75,.75);assert.equal(filled?.kind,'fit');assert.deepEqual([filled!.tiles[0].X,filled!.tiles[0].Y,filled!.tiles[0].Width,filled!.tiles[0].Height],[0,.5,1,.5]);assertLayout(filled!.tiles);
 const swapped=dropTile(tiles,moving.Id,.75,.25);assert.equal(swapped?.kind,'swap');assert.deepEqual([swapped!.tiles[0].X,swapped!.tiles[0].Y,swapped!.tiles[0].Width,swapped!.tiles[0].Height],[.5,0,.5,.5]);assert.deepEqual([swapped!.tiles[1].X,swapped!.tiles[1].Y,swapped!.tiles[1].Width,swapped!.tiles[1].Height],[0,0,.5,1]);assertLayout(swapped!.tiles);
});
test('drop-to-fit only resizes when the vacant region is smaller than the moving tile',()=>{
 const tiles=[newTile(.1,.1,.2,.2)];
 assert.equal(dropTile(tiles,tiles[0].Id,.8,.8),null);
 assert.deepEqual([tiles[0].X,tiles[0].Y,tiles[0].Width,tiles[0].Height],[.1,.1,.2,.2]);
});
test('preview proportions use each target resolution and native margins and gaps',()=>{
 const tiles=preset('columns',2),tile=tiles[1];
 for(const [width,height] of [[1920,1080],[3440,1440],[1080,1920],[3840,2160]]){
  const b=tilePercentBounds(tile,tiles,width,height,16,12);
  assert.ok(Math.abs(b.left/100*width-(width/2+6))<1e-7);
  assert.ok(Math.abs((b.left+b.width)/100*width-(width-16))<1e-7);
  assert.ok(Math.abs(b.top/100*height-16)<1e-7);
  assert.ok(Math.abs(b.height/100*height-(height-32))<1e-7);
 }
});
test('many free move and resize operations never overlap or mutate neighbors',()=>{
 let tiles=preset('balanced',6),seed=41;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/2**32;};
 const handles=['n','s','e','w','nw','ne','sw','se'] as const;
 for(let i=0;i<1500;i++){
  const t=tiles[Math.floor(random()*tiles.length)],before=structuredClone(tiles),dx=random()-.5,dy=random()-.5;
  tiles=i%2?moveTile(tiles,t.Id,dx,dy):resizeTile(tiles,t.Id,handles[Math.floor(random()*8)],dx,dy);
  assertLayout(tiles);assert.deepEqual(tiles.filter(a=>a.Id!==t.Id),before.filter(a=>a.Id!==t.Id));
 }
});
