
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
 navigator:{},window:{dispatchEvent:()=>{}},CustomEvent:class {constructor(type){this.type=type;}},};
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
assert.equal(positive.length,1,'Wave is listening-based, not a copy of playlist favourites');
assert.ok(positive.some(track=>track.url===completed.url));
assert.ok(!positive.some(track=>track.url===saved.url));
assert.equal(ctx.likedPlaylistTracks().length,1,'Saved songs are in Мне нравится');
ctx.tasteRecord('dislike',completed);
positive=ctx.tastePositiveTracks();
assert.ok(!positive.some(track=>track.url===completed.url),'dislikes must not remain positive');
ctx.tasteRecord('listen',{artist:'Группа',title:'Услышанная',url:'https://example.org/heard.mp3'});
assert.ok(ctx.tastePositiveTracks().some(t=>t.title==='Услышанная'),'Short actual listening enters Wave history');
ctx.playlists.push({id:2,tracks:[{artist:'А',title:'Другое',url:'https://example.org/other.mp3'}]});
ctx.setPlaylistExcludedFromLikes(2,true);
assert.equal(ctx.likedPlaylistTracks().length,1,'Excluded playlist does not contribute to Мне нравится');
const wave=ctx.waveLibrarySeeds();
assert.ok(wave.some(t=>t.url===saved.url),
 'Wave recommendations learn from ALL playlists, not only completed listens');
assert.ok(!wave.some(t=>t.title==='Другое'),
 'A playlist excluded from Мне нравится is also excluded from Wave seeds');
assert.ok(wave.some(t=>t.title==='Услышанная'),
 'Wave retains learned listening history alongside library tracks');

console.log('WAVE_HISTORY_AND_PLAYLIST_LIKES_OK');
