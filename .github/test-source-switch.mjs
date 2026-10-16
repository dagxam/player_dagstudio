
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const src=readFileSync(new URL('../script.js',import.meta.url),'utf8');
const a=src.indexOf("const SOURCE_HEALTH_KEY='"),b=src.indexOf('async function refreshSavedTrackSource(',a);
assert.ok(a>=0&&b>a);
const memory=new Map();
const ctx={localStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)},
 normalizeTrackIdentity:v=>String(v||'').toLowerCase().trim()};
runInNewContext(src.slice(a,b),ctx);
const saved={title:'Сансара',artist:'Баста'};
assert.ok(ctx.scoreReplacementTrack(saved,{...saved,source:'[AUDIUS]'})>150);
assert.ok(ctx.scoreReplacementTrack(saved,{title:'Чужой',artist:'Баста'})<0);
ctx.sourceHealthUpdate({source:'[AUDIUS]'},'success');
ctx.sourceHealthUpdate({source:'[AUDIUS]'},'success');
ctx.sourceHealthUpdate({source:'[VK]'},'error');
assert.ok(ctx.sourceHealthScore('[AUDIUS]')>ctx.sourceHealthScore('[VK]'));
assert.ok(src.includes('track._failedAlternateUrls'));
assert.ok(src.includes('track._streamRetries===2'));
assert.ok(src.includes('track._pendingSaveSource'));
assert.ok(src.includes('mainAudio.currentTime>=12'));
console.log('ALTERNATE_SOURCE_AND_HEALTH_OK');
