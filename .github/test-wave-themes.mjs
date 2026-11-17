import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const src=readFileSync(new URL('../script.js',import.meta.url),'utf8');
const cut=(a,b)=>{
    const begin=src.indexOf(a),end=src.indexOf(b,begin+a.length);
    assert.ok(begin>=0&&end>begin,'missing '+a);
    return src.slice(begin,end);
};
const store=new Map();
const storage={
    getItem:key=>store.get(key)||null,
    setItem:(key,value)=>store.set(key,String(value)),
    removeItem:key=>store.delete(key)
};
const rus={title:'Поп-хит',artist:'Руки Вверх!',url:'https://music.example/ruki.mp3'};
const ava={title:'Песня на аварском',artist:'Певец А',url:'https://music.example/avar.mp3'};
const ctx={
    currentUser:'rus-listener',localStorage:storage,
    normalizeTrackIdentity:value=>String(value||'').toLowerCase()
        .replace(/[^a-zа-яё0-9]+/gi,' ').trim(),
    canonicalTrackUrl:t=>String(t?.url||''),
    playlists:[],playbackPlaylist:[],playbackQueue:[],currentIndex:-1,
    document:{getElementById:()=>null,hidden:true},
    window:{addEventListener:()=>{},dispatchEvent:()=>{}},
    CustomEvent:class {constructor(type){this.type=type}},
    navigator:{onLine:true},getNetworkProfile:()=>({weak:true,saveData:false}),
    trafficSaverEnabled:()=>true,
    smartRadioQueryArtists:()=>[],showConfirm:()=>{},
    quickMixUnique:tracks=>tracks,
    sourceHealthScore:()=>0,
    recordPlayerEvent:()=>{},
    api:async()=>({success:true,data:[]})
};
runInNewContext(cut('const TASTE_STORAGE_PREFIX=','// SMART RADIO MATCHER START'),ctx);
runInNewContext(cut('function quickMixReleaseTimestamp(track) {','function quickMixRank(track,'),ctx);
const year=new Date().getUTCFullYear();
const freshDate=new Date(Date.now()-45*86400000).toISOString().slice(0,10);

ctx.playlists=[{id:1,name:'Мой список',tracks:[rus]}];
let themes=ctx.waveThemeDirections(ctx.waveLibrarySeeds());
assert.ok(themes.some(t=>t.id==='russian-pop'),
    'Руки Вверх! seed should imply a broad Russian pop style, not an artist-only search');
let directions=ctx.waveSearchDirections(ctx.waveLibrarySeeds());
assert.ok(directions.filter(d=>d.kind==='theme').length>
    directions.filter(d=>d.kind==='artist').length);
assert.ok(directions.some(d=>/русск/i.test(d.query)));
assert.ok(directions.some(d=>d.query.includes(String(year))),
    'The wave should query for more recent releases every theme cycle');

const newerRussian={title:'Новая русская песня',artist:'Другой исполнитель',
    url:'https://music.example/rus-new.mp3',release_date:freshDate};
const oldRussian={title:'Старый русский хит',artist:'Другой исполнитель',
    url:'https://music.example/rus-old.mp3',release_date:'2012-01-01'};
const sameArtist={title:'Ещё песня',artist:'Руки Вверх!',
    url:'https://music.example/ruki-other.mp3',release_date:freshDate};
assert.ok(ctx.waveReleasePriority(newerRussian).bucket>
    ctx.waveReleasePriority(oldRussian).bucket);
assert.equal(ctx.waveReleasePriority({...newerRussian,release_date:''}).verified,false,
    'Missing dates must not be invented');
storage.setItem('dag_wave_cursor_v2:rus-listener','1');
const calls=[];
ctx.api=async(action,params)=>{
    assert.equal(action,'search_global');
    calls.push(params.query);
    return {success:true,data:[sameArtist,oldRussian,newerRussian]};
};
let picked=await ctx.findWaveNextTrack();
assert.equal(picked.artist,'Другой исполнитель',
    'Different Russian pop artists beat repeated seed performer');
assert.equal(picked.title,'Новая русская песня',
    'Verified recent Russian pop release wins against dated old version');
assert.equal(picked._waveRadio,true);
assert.ok(calls.some(q=>/русск/i.test(q)));
ctx.radioRememberPlayed('wave',picked);
assert.ok(ctx.waveRecentArtists().includes('другой исполнитель'));

ctx.currentUser='avar-listener';
ctx.playlists=[{id:2,name:'Аварские песни',tracks:[ava]}];
themes=ctx.waveThemeDirections(ctx.waveLibrarySeeds());
assert.ok(themes.some(t=>t.id==='avar'));
directions=ctx.waveSearchDirections(ctx.waveLibrarySeeds());
assert.ok(directions.some(d=>/авар/i.test(d.query)));
assert.ok(!directions.some(d=>/руки/i.test(d.query)));
storage.setItem('dag_wave_cursor_v2:avar-listener','1');
const avaRecent={title:'Новая аварская песня',artist:'Певица Б',
    url:'https://music.example/avar-new.mp3',genre:'Аварские песни',release_date:freshDate};
const avaUndated={title:'Другая аварская песня',artist:'Певец В',
    url:'https://music.example/avar-undated.mp3',genre:'Аварские песни'};
const avaOld={title:'Старая аварская песня',artist:'Певец Г',
    url:'https://music.example/avar-old.mp3',genre:'Аварские песни',
    release_date:'2015-03-10'};
ctx.api=async(action,params)=>{assert.equal(action,'search_global');calls.push(params.query);
    return {success:true,data:[avaOld,avaRecent,avaUndated]};};
picked=await ctx.findWaveNextTrack();
assert.equal(picked.artist,'Певица Б',
    'Different Avar performers with verified recent release must be preferred');
ctx.radioRememberPlayed('wave',picked);
let following=await ctx.findWaveNextTrack();
assert.equal(following.artist,'Певец В',
    'After hearing a fresh Avar song, a different unplayed artist is selected before old releases');
assert.notEqual(following.artist,picked.artist);
ctx.radioRememberPlayed('wave',following);

ctx.currentUser='mixed-listener';
ctx.playlists=[
    {id:3,name:'Русские хиты',tracks:[rus]},
    {id:4,name:'Аварские песни',tracks:[ava]}
];
directions=ctx.waveSearchDirections(ctx.waveLibrarySeeds());
assert.ok(directions.some(d=>/русск/i.test(d.query)));
assert.ok(directions.some(d=>/авар/i.test(d.query)));
assert.notEqual(directions[0].theme,directions[1].theme,
    'Theme directions alternate across mixed playlists');

ctx.setPlaylistExcludedFromLikes(4,true);
directions=ctx.waveSearchDirections(ctx.waveLibrarySeeds());
assert.ok(!directions.some(d=>/авар/i.test(d.query)),
    'Excluded playlist does not steer the Wave toward its theme');
assert.ok(directions.some(d=>/русск/i.test(d.query)));
console.log('WAVE_GENRE_RUSSIAN_AVAR_DIVERSE_FRESH_RELEASE_DATES_AND_EXCLUSIONS_OK');
