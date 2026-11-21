import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const js=readFileSync(new URL('../script.js',import.meta.url),'utf8');
const android=readFileSync(new URL('../native/android/DAGAudioEngine.java',import.meta.url),'utf8');
const css=readFileSync(new URL('../studio-touch.css',import.meta.url),'utf8');
const layout=readFileSync(new URL('../studio-next.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.php',import.meta.url),'utf8');

assert.match(js,/const WEB_BUILD_LABEL = '\d+'/);
assert.match(android,/setBufferDurationsMsForStreaming\(60000, 180000, 2500, 12000\)/);
assert.match(android, /setBufferDurationsMsForLocalPlayback\(1000, 50000, 500, 1000\)/);
assert.match(android,/DefaultLoadErrorHandlingPolicy\(8\)/);
assert.match(js,/cacheTrackSilently\(finishedTrack, \{ reason: 'completed'/);
assert.match(js,/reason === 'media-error' \|\| !getNetworkProfile\(\)\.weak/);
assert.match(css,/\.studio-showcase\.showcase-mobile-list/);
assert.match(layout,/root\.classList\.add\('showcase-mobile-list'\)/);
assert.match(layout,/root\.classList\.remove\('showcase-mobile-list'\)/);
assert.match(layout,/root\.classList\.remove\('showcase-wave-only'\)/);
assert.doesNotMatch(index,/id="android-apk-update-btn"/);
assert.doesNotMatch(js,/window\.updateAndroidPackage = async function/);
assert.match(js,/installer\.check\(\)/);
assert.match(js,/installer\.install\(\)/);

const start=js.indexOf('function scheduleStreamRecovery(reason, delay) {');
const end=js.indexOf('\nasync function recoverCurrentStream(reason)',start);
assert.ok(start>0&&end>start);
let queued=[],recoveries=0,frozen=false,loaderCalls=0;
const ctx={
 NATIVE_MEDIA3_ACTIVE:false,
 playbackPlaylist:[{url:'https://pl.dagstudio.ru/proxy.php?url=track'}],
 currentIndex:0, mainAudio:{ended:false},playbackWanted:true,
 streamRecoveryTimer:null,currentPlaybackToken:2,
 getNetworkProfile:()=>({weak:true,veryWeak:true}),
 AUDIO_COMPAT_PROFILE:{legacyAndroid:false},
 clearStreamRecoveryTimer(){this.streamRecoveryTimer=null;},
 setTimeout(fn,ms){queued.push({fn,ms});return queued.length;},
 bufferedSecondsAhead:()=>0,playbackIsFrozen:()=>frozen,
 showLoader:()=>{loaderCalls++},
 recoverCurrentStream:()=>{recoveries++}
};
runInNewContext(js.slice(start,end)+'\nglobalThis.__schedule=scheduleStreamRecovery;',ctx);
ctx.__schedule('waiting');
assert.equal(queued.length,1);
assert.ok(queued[0].ms>=25000,'Weak link must be given time to buffer');
queued.shift().fn();
assert.equal(recoveries,0,'Do not restart a still-buffering 2G stream');
assert.equal(queued.length,1,'Keep waiting on existing stream');
frozen=true;
queued.shift().fn();
assert.equal(recoveries,1,'Truly frozen playhead can recover');
assert.match(js,/async function getStartupCachedAudio\(track, timeoutMs = 280\)/);
assert.match(js,/Promise\.race\(\[pending, timedOut\]\)/);
assert.match(js,/if \(expired && result\?\.isBlob && result\.url\) URL\.revokeObjectURL/);
assert.match(js,/playbackTab==='mix:wave' && track\._waveRadio/);
assert.match(js,/: await getStartupCachedAudio\(track\)/);
assert.match(js,/reason === 'media-error' \|\| !getNetworkProfile\(\)\.weak/);
assert.match(js,/register\('\/sw\.js\?v=\d+'/);
// Only genuine, playable records returned by the unified API appear.
assert.doesNotMatch(index,/hitmos-external-link/);
assert.doesNotMatch(js,/renderHitmosExternalResult/);
assert.doesNotMatch(js,/listEl\.prepend\(row\)/);
console.log('WEAK_NETWORK_BUFFER_AND_MOBILE_LIST_AND_APK_UI_OK');

assert.match(js,/const fullFileFallback = !NATIVE_MEDIA3_ACTIVE/);
assert.match(js,/const useNoRange = !NATIVE_MEDIA3_ACTIVE/);
assert.match(js,/signal: webCacheAbortController.signal/);
const priorityStart=js.indexOf('let webCacheAbortController = null;');
const priorityEnd=js.indexOf('function scheduleNativeCacheWorker',priorityStart);
let aborts=0, cancels=0;
const priorityContext={playbackWanted:true, mainAudio:{paused:true}, IS_NATIVE_APP:true,
 nativeCacheWorkerRunning:true,isCurrentTrackFullyReady:()=>false,
 bufferedSecondsAhead:()=>0,getNetworkProfile:()=>({weak:false}),
 nativeAudioCacheBridge:()=>({cancel:()=>{cancels++;return Promise.resolve();}})};
runInNewContext(js.slice(priorityStart,priorityEnd)+
 '\nglobalThis.test={playbackNeedsNetworkPriority,prioritizePlaybackNetwork,offlineDownloadDeferred,setAbort(c){webCacheAbortController=c;}}',priorityContext);
assert.equal(priorityContext.test.playbackNeedsNetworkPriority(),true,'new song owns network while old decoder is paused');
priorityContext.test.setAbort({abort(){aborts++;}});
priorityContext.test.prioritizePlaybackNetwork();
assert.equal(aborts,1);assert.equal(cancels,1);
assert.equal(priorityContext.test.offlineDownloadDeferred(new Error('DAG_PLAYBACK_PRIORITY')),true);
priorityContext.playbackWanted=false;
assert.equal(priorityContext.test.playbackNeedsNetworkPriority(),false);
console.log('FOREGROUND_AUDIO_NETWORK_PRIORITY_OK');
