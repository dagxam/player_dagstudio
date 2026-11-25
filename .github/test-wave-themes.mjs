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
assert.equal(JSON.stringify(directions.slice(0,4).map(d=>d.theme)),
 JSON.stringify(['russian-pop','caucasus','russian-pop','caucasus']),
 'Wave starts Russian 2026 and Caucasus 2026 in alternating directions');
assert.equal(JSON.stringify(directions.slice(4,8).map(d=>d.theme)),
 JSON.stringify(['russian-pop','dagestan','russian-pop','caucasus']),
 'Wave continues with regional Caucasus 2026 and Russian 2026 artists');
assert.ok(!directions.slice(0,24).some(d=>d.theme==='foreign'),
 'Wave must not start with foreign music');
assert.ok(directions.slice(0,8).every(d=>d.query.includes(String(year))),
 'All opening Wave priority searches explicitly target the current year');
assert.equal(ctx.waveSameArtist('JONY (feat. Баста)','Баста'),true,
 'Credits enclosed in parentheses must still identify a repeated singer');
assert.equal(ctx.waveSameArtist('JONY x Баста','Баста'),true,
 'Cross-artist X credits must still identify a repeated singer');
assert.equal(ctx.waveSameArtist('JONY feat. Баста','Баста'),true,
 'A repeated collaborator must count as the same singer');
assert.equal(ctx.waveSameArtist('Группа Горцы','Группа Горцы'),true,
 'A repeated group must be detected');
assert.equal(ctx.waveSameArtist('Баста','Miyagi'),false,
 'Different artists can play successively');

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
storage.setItem('dag_wave_cursor_v4_four_priority:rus-listener','0');
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
    'Verified current-year Russian release wins against dated old version');
assert.equal(picked._waveRadio,true);
assert.ok(calls.some(q=>/Мари Краймбрери|JONY|Zivert|Miyagi|Баста|Ислам Итляшев|Султан Лагучев/i.test(q)),
    'Fast Wave lookup uses a concrete Russian or Caucasus performer before slow year text queries');
ctx.radioRememberPlayed('wave',picked);
assert.ok(ctx.waveRecentArtists().includes('другой исполнитель'));

ctx.currentUser='avar-listener';
ctx.playlists=[{id:2,name:'Аварские песни',tracks:[ava]}];
themes=ctx.waveThemeDirections(ctx.waveLibrarySeeds());
assert.ok(themes.some(t=>t.id==='avar'));
directions=ctx.waveSearchDirections(ctx.waveLibrarySeeds());
assert.ok(directions.some(d=>/авар/i.test(d.query)));
assert.ok(!directions.some(d=>/руки/i.test(d.query)));
storage.setItem('dag_wave_cursor_v4_four_priority:avar-listener','3');
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
assert.ok(!directions.some(d=>/Певец А/i.test(d.query)),
    'Excluded playlist artists never become personal discovery seeds');
assert.ok(directions.some(d=>/авар/i.test(d.query)),
    'Editorial regional rotation stays diverse even if a playlist is excluded');
assert.ok(directions.some(d=>/русск/i.test(d.query)));
// A provider returning the same artist under another collaboration must
// never play that artist again immediately; another singer should win.
ctx.currentUser='repeat-listener';
ctx.playlists=[{id:91,name:'Русские хиты',tracks:[rus]}];
ctx.playbackPlaylist=[{artist:'Баста',title:'Предыдущая',url:'https://music.example/prior.mp3'}];
ctx.currentIndex=0;
storage.setItem('dag_wave_cursor_v4_four_priority:repeat-listener','0');
ctx.api=async()=>({success:true,data:[
    {title:'Дуэт',artist:'Баста feat. Друг',url:'https://music.example/duet.mp3',release_date:freshDate},
    {title:'Другая новинка',artist:'Мияги',url:'https://music.example/miyagi.mp3',release_date:freshDate}
]});
picked=await ctx.findWaveNextTrack();
assert.equal(picked.artist,'Мияги',
 'Wave rejects the singer playing now, including their collaborations');
// First tap must authorize HTMLMediaElement playback before an awaited
// provider search, without creating a separate player or requiring playlists.
let gesturePlayCalls=0;
const gestureAudio={paused:true,loop:false,preload:'none',src:'',
 play(){gesturePlayCalls++;this.paused=false;return Promise.resolve();}};
const gesture={
 NATIVE_MEDIA3_ACTIVE:false,navigator:{onLine:true},playbackWanted:false,
 playbackPlaylist:[],currentIndex:-1,mainAudio:gestureAudio,
 btoa:binary=>Buffer.from(binary,'binary').toString('base64'),
 recordPlayerEvent:()=>{}
};
const gestureBegin=src.indexOf('let waveGestureSilentUrl=');
const gestureEnd=src.indexOf('function requestAudioPlay()',gestureBegin);
assert.ok(gestureBegin>0&&gestureEnd>gestureBegin,'Wave gesture helpers exist');
runInNewContext(src.slice(gestureBegin,gestureEnd),gesture);
gesture.primeWaveAudioFromClick();
assert.equal(gesturePlayCalls,1,'The first click primes HTML5 playback synchronously');
assert.equal(gestureAudio.loop,true,'The primer cannot emit an ended event while searching');
assert.ok(gestureAudio.src.startsWith('data:audio/wav;base64,'),
 'Wave primes the existing audio element with silent PCM');
assert.ok(Buffer.from(gestureAudio.src.split(',')[1],'base64').length>50000);
gesture.primeWaveAudioFromClick();
assert.equal(gesturePlayCalls,1,'A second click during discovery does not restart the audio element');
gesture.NATIVE_MEDIA3_ACTIVE=true;gesture.playbackWanted=false;
gesture.primeWaveAudioFromClick();
assert.equal(gesturePlayCalls,1,'Media3 is never primed with an HTML5 silence track');
const studio=readFileSync(new URL('../studio.js',import.meta.url),'utf8');
const waveEntry=studio.slice(studio.indexOf('window.openStudioWave=function()'),
 studio.indexOf('// Return to the real list',studio.indexOf('window.openStudioWave=function()')));
assert.ok(waveEntry.indexOf('primeWaveAudioFromClick()')>=0);
assert.ok(waveEntry.indexOf('primeWaveAudioFromClick()')<waveEntry.indexOf("startQuickMix('wave')"),
 'Wave primer executes directly in the click before asynchronous discovery');
assert.ok(src.includes('if (isRepeat && !isContinuousRadio())'),
 'A persisted Repeat setting must not prevent the next Wave song');
assert.ok(src.includes('smartRadioBusy || (isRepeat&&!isContinuousRadio())'),
 'Wave prefetch must work even when Repeat is enabled');
assert.ok(!src.includes("if(!library.length)return null;"),
 'A new user without saved playlists must still hear the editorial Wave');
console.log('WAVE_ONE_TAP_BROWSER_PRIME_AND_ENDLESS_AUTOPLAY_OK');

console.log('WAVE_GENRE_RUSSIAN_AVAR_DIVERSE_FRESH_RELEASE_DATES_AND_EXCLUSIONS_OK');
