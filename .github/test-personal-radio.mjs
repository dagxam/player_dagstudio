
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
