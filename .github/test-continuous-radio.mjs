import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const src=readFileSync(new URL('../script.js',import.meta.url),'utf8');
const extract=(start,end)=>{
    const a=src.indexOf(start),b=src.indexOf(end,a+start.length);
    assert.ok(a>=0&&b>a,`Cannot extract ${start}`);
    return src.slice(a,b);
};
const first={artist:'A',title:'A1',url:'https://example.org/a.mp3'};
const newer={artist:'B',title:'B1',url:'https://example.org/b.mp3',_chartRadio:true};

// Both continuous stations must look for more songs at the end, even without
// generic smart radio enabled or while disconnected from the internet.
const transitions=[];
const next={playbackPlaylist:[first],currentIndex:0,playbackQueue:[],
    playbackTab:'mix:wave',navigator:{onLine:false},isShuffle:false,
    smartRadioEnabled:false,smartRadioPrefetch:null,
    recordManualPlaybackTransition:()=>{},
    isContinuousRadio(){return this.playbackTab==='mix:wave'||this.playbackTab==='mix:charts';},
    cancelContinuousRadioRetry:()=>{},
    playTrack:index=>transitions.push(['play',index]),
    playSmartRadioNext:()=>transitions.push(['discover'])};
// The actual function calls isContinuousRadio() in the lexical environment;
// use a closure that reads the same state as the test controls.
next.isContinuousRadio=()=>['mix:wave','mix:charts'].includes(next.playbackTab);
runInNewContext(extract('function playNext() {','function playPrev() {'),next);
next.playNext();
assert.deepEqual(transitions.pop(),['discover'],'offline Wave must never wrap');
next.playbackTab='mix:charts';
next.navigator.onLine=true;
next.playNext();
assert.deepEqual(transitions.pop(),['discover'],'charts must find a song after the final entry');
next.playbackPlaylist=[first,newer];
next.playNext();
assert.deepEqual(transitions.pop(),['play',1],'charts play an already prepared next entry');
console.log('CONTINUOUS_RADIO_NEVER_WRAPS_AND_CONSUMES_NEXT_OK');

// After old chart search pages have run out, the next scroll begins a new
// search cycle instead of putting the chart in a permanent exhausted state.
const state={key:'charts',loading:false,loadingMore:false,exhausted:true,
    lastRefreshAt:Date.now()-60000,nextDirection:0,
    exhaustedQueries:new Set(['new releases']),pageNumbers:new Map([['new releases',16]]),
    checkedSources:new Set(),activeSources:new Set(),tracks:[first]};
const calls=[];
const mixing={quickMixCurrent:state,quickMixRequestId:1,currentTab:'mix:charts',
    navigator:{onLine:true},QUICK_MIXES:{charts:{mode:'recent'}},
    quickMixSearchPlan:()=>[{region:'world',queries:['new releases']}],
    getNetworkProfile:()=>({weak:false,saveData:false}),
    api:async (action,query)=>{calls.push(query);return {success:true,data:[newer]};},
    quickMixUnique:(tracks,known=[])=>tracks.filter(t=>!known.some(k=>k.url===t.url)),
    quickMixRankTracks:tracks=>tracks,
    canonicalTrackUrl:t=>t.url,
    playbackTab:'mix:charts',playbackWanted:false,playbackPlaylist:[first],
    document:{querySelector:()=>null},renderPlaylist:()=>{},setQuickMixStatus:()=>{},
    recordPlayerEvent:()=>{}};
runInNewContext(extract('async function loadMoreQuickMix() {','// --- ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК ---'),mixing);
await mixing.loadMoreQuickMix();
assert.equal(calls.length,1,'expired chart paging must restart search');
assert.equal(calls[0].page,2,'old page limits must be reset');
assert.equal(state.tracks.length,2,'refreshed charts append discoveries');
assert.ok(Date.now()-state.lastRefreshAt<5000,'refreshed charts can be retried after cooldown');
state.exhausted=true;
state.lastRefreshAt=Date.now();
await mixing.loadMoreQuickMix();
assert.equal(calls.length,1,'retries honor the provider cooldown');
console.log('CHARTS_REFRESH_AFTER_EXHAUSTION_AND_THROTTLE_OK');
