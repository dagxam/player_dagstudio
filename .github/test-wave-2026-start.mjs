import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const src=readFileSync(new URL('../script.js',import.meta.url),'utf8');
const begin=src.indexOf('const TASTE_STORAGE_PREFIX=');
const end=src.indexOf('// SMART RADIO MATCHER START',begin);
assert.ok(begin>=0&&end>begin);
const store=new Map();
const ctx={
 currentUser:'2026-start',localStorage:{
  getItem:key=>store.get(key)||null,
  setItem:(key,val)=>store.set(key,String(val)),
  removeItem:key=>store.delete(key)
 },
 normalizeTrackIdentity:v=>String(v||'').toLowerCase().trim(),
 canonicalTrackUrl:t=>String(t?.url||''),
 playlists:[],playbackPlaylist:[],playbackQueue:[],currentIndex:-1,
 document:{getElementById:()=>null,hidden:true},
 window:{addEventListener:()=>{},dispatchEvent:()=>{}},
 navigator:{onLine:true},
 getNetworkProfile:()=>({weak:false,saveData:false}),
 smartRadioQueryArtists:()=>[],showConfirm:()=>{},
 quickMixUnique:tracks=>tracks,
 quickMixReleaseTimestamp:track=>{
  const date=track?.release_date;
  return date?Date.parse(date+'T00:00:00Z'):0;
 },
 quickMixRankTracks:tracks=>tracks,
 sourceHealthScore:()=>0,
 recordPlayerEvent:()=>{},
 api:async()=>({success:true,data:[]})
};
runInNewContext(src.slice(begin,end),ctx);
const directions=ctx.waveSearchDirections([]);
assert.ok(directions.length>=24);
assert.ok(directions.slice(0,24).every(d=>d.query.endsWith(' 2026')));
assert.ok(directions.slice(0,24).every((d,i)=>i%2===0?
  d.theme==='russian-pop':d.theme!=='russian-pop'));
assert.ok(directions.every(d=>d.theme!=='foreign'),'no foreign startup catalog');

let finishSlow;
const slow=new Promise(resolve=>{finishSlow=resolve;});
const first=await ctx.waveFirstNonempty([
 Promise.resolve([{title:'Ready',artist:'A',url:'https://example.org/ready.mp3'}]),
 slow
]);
assert.equal(first[0].title,'Ready','Wave must not wait for slower second search');
finishSlow([]);
const old={title:'Dated old',artist:'Dated artist',url:'https://example.org/old.mp3',
 release_date:'2025-07-01'};
const newSong={title:'2026 release',artist:'New artist',url:'https://example.org/new.mp3',
 release_date:'2026-10-20'};
const undated={title:'Undated',artist:'Undated artist',url:'https://example.org/undated.mp3'};
let calls=0;
ctx.api=async(action,params)=>{
 assert.equal(action,'search_global');calls++;
 // The fast artist-based lookup can supply audio before slow 2026 text search.
 return {success:true,data:[old,newSong,undated]};
};
let selected=await ctx.findWaveNextTrack();
assert.equal(selected.title,'2026 release',
 'Verified 2026 release is preferred over unknown and a 2025 song');
assert.equal(selected._waveRadio,true);
ctx.radioRememberPlayed('wave',selected);
selected=await ctx.findWaveNextTrack();
assert.equal(selected.title,'Undated',
 'Another session chooses a different unplayed song when 2026 metadata is unavailable');
assert.ok(calls>=2);
assert.ok(store.has('dag_wave_cursor_v4_four_priority:2026-start'));
const html=readFileSync(new URL('../index.php',import.meta.url),'utf8');
assert.match(html,/id="vinyl-wave-play"/);
assert.match(html,/id="studio-header-wave"/);
assert.match(src,/new Promise\(resolve=>setTimeout\(\(\)=>resolve\(null\),180\)\)/);
console.log('WAVE_2026_RUSSIAN_CAUCASUS_FAST_START_AND_DIVERSITY_OK');
