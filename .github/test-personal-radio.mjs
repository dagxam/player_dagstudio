
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
 canonicalTrackUrl:track=>String(track?.url||''),
 playlists:[],playbackPlaylist:[],smartRadioQueryArtists:()=>[],showConfirm:()=>{},
 navigator:{},window:{dispatchEvent:()=>{},addEventListener:()=>{}},
 CustomEvent:class {constructor(type){this.type=type;}},};
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

// Even when saved songs are ranked higher than online results, the Wave must
// only play a newly discovered song. Excluded libraries cannot seed searches.
const allowed={artist:'Разрешённый артист',title:'Моя песня',url:'https://example.org/allowed.mp3'};
const excluded={artist:'Исключённый артист',title:'Скрытая',url:'https://example.org/excluded.mp3'};
const discovered={artist:'Новый артист',title:'Открытие',url:'https://example.org/discovered.mp3'};
const another={artist:'Другой артист',title:'Новый хит',url:'https://example.org/another.mp3'};
ctx.playlists=[{id:10,tracks:[allowed]},{id:11,tracks:[excluded]}];
ctx.setPlaylistExcludedFromLikes(11,true);
ctx.tasteRecord('like',excluded);
ctx.playbackPlaylist=[];ctx.playbackQueue=[];ctx.currentIndex=-1;
ctx.quickMixCurrent={key:'wave',tracks:[allowed]};
ctx.quickMixUnique=items=>items;
ctx.quickMixRankTracks=items=>items;
ctx.quickMixReleaseTimestamp=()=>0;
ctx.getNetworkProfile=()=>({weak:false,saveData:false});
ctx.recordPlayerEvent=()=>{};
const queries=[];
ctx.api=async (action,params)=>{
    assert.equal(action,'search_global');
    queries.push(params.query);
    return {success:true,data:[allowed,excluded,discovered,another]};
};
const recommendation=await ctx.findWaveNextTrack();
assert.ok([discovered.url,another.url].includes(recommendation.url),'saved songs are seeds, not Wave playback');
assert.equal(recommendation._waveRadio,true);
assert.ok(!queries.includes(excluded.artist),'excluded playlist artists must not seed discovery');
console.log('WAVE_ONLINE_DISCOVERY_EXCLUDES_SAVED_AND_DISABLED_OK');

// A fresh opening of Wave must not replay the previous first discovery, even
// if all server searches return the same ranked catalogue.
ctx.radioRememberPlayed('wave',recommendation);
const reopened=await ctx.findWaveNextTrack();
assert.notEqual(reopened.url,recommendation.url,'reopening Wave chooses another recommendation');
assert.equal(ctx.radioRecentTracks('wave').length,1);
assert.ok(Number(localStorage.getItem('dag_wave_cursor_v2:listener'))>=2,
 'Wave search positions advance across plays and browser restarts');
ctx.playbackWanted=false;
ctx.trafficSaverEnabled=()=>true;
const prepared=await ctx.warmWaveFirstTrack();
assert.equal(prepared?.url,reopened.url,'the first track can be prepared before play starts');
assert.equal(ctx.playbackWanted,false,'preparing Wave must never start playback');
console.log('WAVE_ROTATING_HISTORY_AND_IDLE_PREPARATION_OK');
