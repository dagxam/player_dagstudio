import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const script=read('script.js'),sidebar=read('studio-next.js');
const nav=sidebar.slice(sidebar.indexOf("add('wave','Моя волна'"),sidebar.indexOf("add('playlists'"));
assert.match(nav,/window\.openStudioWave\(\)/);
assert.match(nav,/window\.studioExpandPlayer\(\)/);
assert.doesNotMatch(nav,/startQuickMix\('wave'\)|playTrack\(/);
const a=script.indexOf('function quickMixAvoidAdjacentArtists(');
const b=script.indexOf('function quickMixDiversify(',a);
assert.ok(a>0&&b>a);
const ctx={normalizeTrackIdentity:v=>String(v||'').toLowerCase().trim()};
runInNewContext(script.slice(a,b),ctx);
const rows=[{artist:'Ислам Итляшев'}, {artist:'Ислам Итляшев'},
 {artist:'Султан Лагучев'}, {artist:'Эльбрус Джанмирзоев'},
 {artist:'Ислам Итляшев feat. Султан Лагучев'}];
const spread=ctx.quickMixAvoidAdjacentArtists(rows);
assert.equal(spread.length,5);
for(let i=1;i<spread.length;i++)assert.notEqual(spread[i].artist,spread[i-1].artist);
assert.match(script,/window\.removeOfflineSavedTrack=function\(index\)/);
assert.match(script,/deleteDeviceCachedTrack\(track,true,true\)/);
assert.match(script,/quickMixAvoidAdjacentArtists\(ranked\.map/);
const core=script.slice(script.indexOf('async function deleteDeviceCachedTrack('),
 script.indexOf('const OFFLINE_KEEP_PREFIX=',script.indexOf('async function deleteDeviceCachedTrack(')));
const song={url:'https://music.example/a.mp3',title:'Song',artist:'Singer'};
const index={[song.url]:{url:song.url,path:'music/a.mp3',owners:['alice','bob']}};
let deleted=0,updated=null;
const db={IS_NATIVE_APP:true,normalizeCacheTrack:t=>t,canonicalTrackUrl:t=>t.url,
 currentCacheOwner:()=> 'alice',readNativeAudioIndex:()=>index,
 writeNativeAudioIndex:v=>{updated=v},nativeAudioCacheBridge:()=>({
 delete:async()=>{deleted++;return {deleted:true}},get:async()=>({exists:false})}),
 isUrlStillInAnyPlaylist:()=>true,offlineKeptUrls:()=>[song.url]};
runInNewContext(core,db);
assert.equal(await db.deleteDeviceCachedTrack(song,true,true),true);
assert.equal(deleted,0);
assert.deepEqual(Array.from(updated[song.url].owners),['bob']);
console.log('WAVE_NAV_CAUCASUS_SPREAD_SAFE_OFFLINE_REMOVE_OK');
