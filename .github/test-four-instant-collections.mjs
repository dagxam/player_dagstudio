import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const html=read('index.php'),center=read('studio-center.js'),
      next=read('studio-next.js'),code=read('script.js');
const modal=html.slice(html.indexOf('<div id="quick-mixes-modal"'),
 html.indexOf('<!-- Read-only version check'));
const keys=[...modal.matchAll(/data-mix="([^"]+)"/g)].map(m=>m[1]);
assert.deepEqual(keys,['caucasus','russian','foreign','charts']);
for(const key of keys)assert.ok(modal.includes("onclick=\"startQuickMix('"+key+"')\""),
  key+' must start without a subcollection selection');
assert.doesNotMatch(modal,/openCaucasusRadio|caucasus-radio-modal|data-mix="wave"/);
assert.doesNotMatch(html,/id="caucasus-radio-modal"/);
const defs=center.slice(center.indexOf('const defs=['),center.indexOf('function selectNav('));
assert.deepEqual([...defs.matchAll(/key:'([^']+)'/g)].map(m=>m[1]),keys);
assert.match(center,/defs\.forEach\(d=>grid\.appendChild\(card\(d,\(\)=>showMix\(d\.key,d\.title\)\)\)\)/);
const choices=next.slice(next.indexOf('const choices=['),next.indexOf('const grid=node('));
assert.deepEqual([...choices.matchAll(/key:'([^']+)'/g)].map(m=>m[1]),keys);
assert.doesNotMatch(next.slice(next.indexOf('function selectMix('),next.indexOf('choices.forEach(')),
 /quick-mixes.*click|showList/);
assert.match(code,/charts:\{title:'Новые релизы',mode:'recent',autoPlayOnDiscover:true/);
assert.match(code,/if\(INSTANT_MIX_ARTISTS\[key\]\)primeWaveAudioFromClick\(true\)/);
assert.match(code,/await waveFirstNonempty\(promises\)/);
assert.match(code,/window\.warmInstantMixSelections=function/);
assert.match(code,/instantMixStartOrder\(quickMixCurrent\.tracks,key\)/);
const start=code.indexOf('const INSTANT_MIX_ARTISTS=');
const end=code.indexOf('let quickMixRequestId=',start);
assert.ok(start>0&&end>start);
const state={normalizeTrackIdentity:v=>String(v||'').toLowerCase().trim(),
 quickMixReleaseTimestamp:t=>t.release_date?Date.parse(t.release_date+'T00:00:00Z'):0,
 quickMixUnique:t=>t,quickMixRankTracks:t=>t,
 navigator:{onLine:true},getNetworkProfile:()=>({weak:false,saveData:false}),
 playbackWanted:false,trafficSaverEnabled:()=>false,document:{hidden:true},window:{},
 recordPlayerEvent:()=>{},radioRecentTracks:()=>[],radioTrackIdentity:t=>t.url,
 QUICK_MIXES:{charts:{mode:'recent'}},setTimeout:()=>{},api:async()=>({success:true,data:[]})};
runInNewContext(code.slice(start,end),state);
assert.equal(state.instantMixValidRelease({release_date:'2020-01-01'},'charts'),false);
assert.equal(state.instantMixValidRelease({release_date:'2026-10-01'},'charts'),true);
assert.equal(state.instantMixValidRelease({release_date:''},'charts'),true);
const accepted={title:'A',artist:'Dua Lipa',url:'https://example.org/a.mp3',release_date:'2026-10-04'};
const wrong={title:'B',artist:'Баста',url:'https://example.org/b.mp3',release_date:'2026-10-04'};
const old={title:'C',artist:'Dua Lipa',url:'https://example.org/c.mp3',release_date:'2010-10-04'};
const valid=state.instantMixFreshCandidates([accepted,wrong,old],'foreign','Dua Lipa');
assert.equal(valid.length,1);
assert.equal(valid[0].title,'A');
const begin=code.indexOf('function playNext() {'),after=code.indexOf('function playPrev()',begin);
assert.ok(begin>0&&after>begin);
const calls=[];
const play={playbackTab:'mix:caucasus',playbackQueue:[],playbackPlaylist:[accepted],
 currentIndex:0,navigator:{onLine:true},isShuffle:false,playbackWanted:true,
 recordManualPlaybackTransition:()=>{},waveSameArtist:()=>false,
 playInstantMixNext:key=>calls.push('next '+key),playSmartRadioNext:()=>calls.push('wrong genre'),
 playTrack:i=>calls.push('play '+i)};
runInNewContext(code.slice(begin,after),play);
play.playNext();
assert.deepEqual(calls,['next caucasus'],'Category cannot silently become generic Smart Radio');
console.log('FOUR_COLLECTIONS_DIRECT_AUTOPLAY_FRESH_FIRST_AND_CATEGORY_CONTINUITY_OK');
