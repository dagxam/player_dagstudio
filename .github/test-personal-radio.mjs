
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const src=readFileSync(new URL('../script.js',import.meta.url),'utf8');
const begin=src.indexOf('const TASTE_STORAGE_PREFIX=');
const end=src.indexOf('// SMART RADIO MATCHER START');
assert.ok(begin>0&&end>begin);
const memory=new Map();
const localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
const ctx={currentUser:'listener',localStorage,document:{getElementById:()=>null},
 normalizeTrackIdentity:v=>String(v||'').toLowerCase().trim(),
 playlists:[],playbackPlaylist:[],smartRadioQueryArtists:()=>[],showConfirm:()=>{},
 navigator:{},};
runInNewContext(src.slice(begin,end),ctx);
const a={artist:'Баста',title:'Сансара'},b={artist:'Miyagi',title:'Captain'};
ctx.tasteRecord('finish',a);
ctx.tasteRecord('like',a);
ctx.tasteRecord('skip',b);
ctx.tasteRecord('dislike',b);
assert.ok(ctx.tasteCandidateScore(a,['Баста'])>10);
assert.ok(ctx.tasteCandidateScore(b,['Miyagi'])<0);
assert.ok(memory.size===1);
console.log('PERSONAL_RADIO_BEHAVIOR_OK');

assert.ok(src.includes('function tastePreferredGenres()'));
assert.ok(src.includes('positiveGenre*2'));
console.log('PERSONAL_GENRE_SIGNAL_OK');

const completed={artist:'Хабиб',title:'Песня в дорогу',url:'https://example.org/finished.mp3'};
const saved={artist:'Зара',title:'Любимая',url:'https://example.org/saved.mp3'};
ctx.tasteRecord('finish',completed);
ctx.playlists.push({id:1,tracks:[saved]});
let positive=ctx.tastePositiveTracks();
assert.equal(positive.length,2,'completed and saved songs must be part of My Wave');
assert.ok(positive.some(track=>track.url===completed.url));
assert.ok(positive.some(track=>track.url===saved.url));
ctx.tasteRecord('dislike',completed);
positive=ctx.tastePositiveTracks();
assert.ok(!positive.some(track=>track.url===completed.url),'dislikes must not remain positive');
console.log('WAVE_POSITIVE_COMPLETED_AND_LIKED_OK');
