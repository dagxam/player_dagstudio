import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const js=read('script.js'),php=read('api.php'),html=read('index.php');
const css=read('studio-next.css'),engine=read('native/android/DAGAudioEngine.java');

assert.match(html,/id="wave-add-playlist-btn"/);
assert.match(html,/onclick="saveWavePlayingTrack\(\)"/);
assert.match(css,/\.wave-add-playlist-btn\[hidden\]/);
assert.match(js,/function saveWavePlayingTrack\(\)/);
assert.match(js,/selectedTrackForSave=track;\s*openPlaylistSelect\(true\)/);
assert.match(js,/const enabled=Boolean\(track\?\.url&&playbackTab==='mix:wave'\)/);
assert.match(js,/mode: 'fast'/);
assert.match(js,/mode: 'full'/);
assert.match(js,/radioSearchPage\(direction\.query,direction\.page,net,'fast'\)/);
assert.match(js,/radioSearchPage\(direction\.query,direction\.page,net,'full'\)/);
assert.match(js,/async function getStartupCachedAudio\(track, timeoutMs = 280\)/);
assert.match(js,/Avoid loading an empty source before loading the selected one/);
assert.match(engine,/setBufferDurationsMsForStreaming\(35000, 180000, 1000, 4500\)/);
assert.match(php,/\$fast_search = \(\$data\['mode'\] \?\? ''\) === 'fast' && \$page === 1/);
assert.match(php,/\$provider_timeout = \$fast_search \? 3/);
assert.match(php,/\$muzca_detail_limit = \$fast_search \? 0/);
assert.match(php,/foreach \(\$urls as \$key => \$url\)/);
const start=js.indexOf('function scheduleSearchEnrichment(');
const end=js.indexOf('\nasync function performSearch(',start);
assert.ok(start>0&&end>start,'Search enrichment helper exists');

const tasks=[]; let renders=0;
const first={title:'A',url:'https://example.org/a.mp3'};
const second={title:'B',url:'https://example.org/b.mp3'};
const context={
 clearTimeout:()=>{},
 setTimeout:(f,ms)=>{tasks.push({f,ms});return tasks.length},
 searchEnrichmentTimer:null,searchRequestSerial:3,currentSearchQuery:'artist',
 navigator:{onLine:true},getNetworkProfile:()=>({weak:false,saveData:false}),
 api:async(action,params)=>{
  assert.equal(action,'search_global');assert.equal(params.mode,'full');
  return {success:true,data:[first,second],source_counts:{audius:2},sources:{audius:{ok:true}}};
 },
 searchPlaylistCache:[first],currentTab:'search',playlist:[first],
 canonicalTrackUrl:track=>track.url,renderPlaylist:()=>{renders++},
 displaySearchMessage:()=>{},searchStatus:()=>{},explainConnectionFailure:()=>{},
 console
};
runInNewContext(js.slice(start,end)+'\nglobalThis.schedule=scheduleSearchEnrichment;',context);
context.schedule('artist',3);
assert.equal(tasks.length,1);
assert.equal(tasks[0].ms,450);
await tasks.shift().f();
assert.equal(context.searchPlaylistCache.length,2,'Slow sources append songs');
assert.equal(context.searchPlaylistCache[0].url,first.url,'Quick results retain position');
assert.equal(renders,1);
assert.equal(context.hasMoreSearchResults,false);
context.schedule('artist',3);
context.searchRequestSerial=4;
await tasks.shift().f();
assert.equal(renders,1,'Stale searches must not repaint');
console.log('FAST_SEARCH_ENRICHMENT_WAVE_PLAYLIST_SINGLE_AUDIO_LOAD_OK');
