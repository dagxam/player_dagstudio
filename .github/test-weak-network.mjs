import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const js=readFileSync(new URL('../script.js',import.meta.url),'utf8');
const android=readFileSync(new URL('../native/android/DAGAudioEngine.java',import.meta.url),'utf8');
const css=readFileSync(new URL('../studio-touch.css',import.meta.url),'utf8');
const layout=readFileSync(new URL('../studio-next.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.php',import.meta.url),'utf8');

assert.match(js,/const WEB_BUILD_LABEL = '2326'/);
assert.match(android,/setBufferDurationsMsForStreaming\(45000, 180000, 2500, 10000\)/);
assert.match(android, /setBufferDurationsMsForLocalPlayback\(1000, 50000, 500, 1000\)/);
assert.match(android,/DefaultLoadErrorHandlingPolicy\(8\)/);
assert.match(js,/cacheTrackSilently\(finishedTrack, \{ reason: 'completed'/);
assert.match(js,/reason === 'media-error' \|\| !getNetworkProfile\(\)\.weak/);
assert.match(css,/\.studio-showcase\.showcase-mobile-list/);
assert.match(layout,/root\.classList\.add\('showcase-mobile-list'\)/);
assert.match(layout,/root\.classList\.remove\('showcase-mobile-list'\)/);
assert.match(layout,/root\.classList\.remove\('showcase-wave-only'\)/);
assert.match(index,/id="android-apk-update-btn"/);
assert.match(js,/window\.updateAndroidPackage = async function/);
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
assert.match(js,/async function getStartupCachedAudio\(track, timeoutMs = 900\)/);
assert.match(js,/Promise\.race\(\[pending, timedOut\]\)/);
assert.match(js,/if \(expired && result\?\.isBlob && result\.url\) URL\.revokeObjectURL/);
assert.match(js,/playbackTab==='mix:wave' && track\._waveRadio/);
assert.match(js,/: await getStartupCachedAudio\(track\)/);
assert.match(js,/reason === 'media-error' \|\| !getNetworkProfile\(\)\.weak/);
assert.match(js,/register\('\/sw\.js\?v=2331'/);
console.log('WEAK_NETWORK_BUFFER_AND_MOBILE_LIST_AND_APK_UI_OK');
