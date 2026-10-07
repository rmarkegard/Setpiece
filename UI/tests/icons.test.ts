import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';

// The shipped icon font holds only the icons the interface names (tools/icons/subset.py); an icon missing from
// it would show its name as text. This finds every icon name in the source, the same way the subset does.
const names=JSON.parse(readFileSync(new URL('../../tools/icons/names.json',import.meta.url),'utf8')) as {included:string[];available:string[]};
const included=new Set(names.included),available=new Set(names.available);

test('every icon the interface names is in the shipped icon font',()=>{
 const source=new URL('../src/',import.meta.url);const missing=new Set<string>();
 for(const file of readdirSync(source,{recursive:true}) as string[]){
  if(!/\.(ts|html)$/.test(file))continue;
  for(const [,word] of readFileSync(new URL(file.replaceAll('\\','/'),source),'utf8').matchAll(/['"`]([a-z][a-z0-9_]*)['"`]/g))
   if(available.has(word)&&!included.has(word))missing.add(word);
 }
 assert.deepEqual([...missing],[],'Run tools/icons/subset.py to add these icons to UI/public/fonts/material-symbols-rounded.woff2');
});
