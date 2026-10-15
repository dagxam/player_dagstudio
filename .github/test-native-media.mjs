// Isolated Node regression: Media3 adapter must mirror live Android position.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source = readFileSync(new URL('../native/native-audio-adapter.js', import.meta.url), 'utf8');
const javaEngine = readFileSync(new URL('../native/android/DAGAudioEngine.java', import.meta.url), 'utf8');
const javaService = readFileSync(new URL('../native/android/DAGMediaService.java', import.meta.url), 'utf8');
const script = readFileSync(new URL('../script.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../modern.css', import.meta.url), 'utf8');
const window = new EventTarget();
const sent = [];
window.DAG_NATIVE_BRIDGE = {audioPlayer:{
    load: async options => {sent.push({action:'load',...options});},
    status: async () => ({}),
    resume: async()=>{},
    pause: async()=>{},
    stop: async()=>{},
    seek: async options => {sent.push({action:'seek',...options});}
}};
runInNewContext(source, {window,EventTarget,Event,setInterval:()=>0,Number,Date,Math,console});
const audio = new window.DAGNativeAudioAdapter();
let playheadEvents = 0;
let metadataEvents = 0;
audio.addEventListener('timeupdate',()=>playheadEvents++);
audio.addEventListener('durationchange',()=>metadataEvents++);
audio.src='https://pl.dagstudio.ru/proxy.php?url=demo';
await audio.play();
const event=new Event('dag-native-audio-status');
event.detail={hasSource:true,state:'ready',playing:true,durationMs:240000,
    positionMs:18100,bufferedPositionMs:62000,error:''};
window.dispatchEvent(event);
assert.equal(audio.duration,240);
assert.equal(audio.currentTime,18.1);
assert.equal(audio.buffered.end(0),62);
assert.ok(playheadEvents>0 && metadataEvents>0);
audio.currentTime=121.75;
await Promise.resolve();
assert.ok(sent.some(x=>x.action==='seek' && x.positionMs===121750));
audio._lastSeek=0;
const later=new Event('dag-native-audio-status');
later.detail={...event.detail,positionMs:127000,bufferedPositionMs:144000};
window.dispatchEvent(later);
assert.equal(audio.currentTime,127);
assert.ok(javaService.includes('positionHandler.postDelayed(positionTicker, 850L)'),
    'native service must publish positions periodically');
assert.ok(javaEngine.includes('public void publishProgress()'),
    'Media3 live position must reach JS');
assert.ok(script.includes("mainAudio.addEventListener('timeupdate', updateProgress)"),
    'bar must redraw when native audio position advances');
assert.ok(script.includes('seekFromProgressClientX(event.clientX)'),
    'bar must accept touch scrubbing');
assert.ok(css.includes('/* TEYES CC3: no full-width elliptical backdrop during buffering. */'),
    'loading overlay must not produce an ellipse');
console.log('MEDIA3_PLAYHEAD_AND_SEEK_OK', {seconds:audio.currentTime,duration:audio.duration,buffered:audio.buffered.end(0)});

const earlyAudio=new window.DAGNativeAudioAdapter();
let endedEvents=0, prematureEvents=0;
earlyAudio.addEventListener('ended',()=>endedEvents++);
earlyAudio.addEventListener('prematureend',()=>prematureEvents++);
earlyAudio.src='https://pl.dagstudio.ru/proxy.php?url=short';
await earlyAudio.play();
const cut=new Event('dag-native-audio-status');
cut.detail={hasSource:true,state:'ended',playing:false,durationMs:220000,
    positionMs:3000,bufferedPositionMs:4000,error:''};
window.dispatchEvent(cut);
assert.equal(prematureEvents,1,'early stream completion must recover, not skip');
assert.equal(endedEvents,0);
assert.equal(earlyAudio.ended,false);
const completed=new window.DAGNativeAudioAdapter();
let normalEnd=0;
completed.addEventListener('ended',()=>normalEnd++);
completed.src='https://pl.dagstudio.ru/proxy.php?url=complete';
await completed.play();
const finish=new Event('dag-native-audio-status');
finish.detail={hasSource:true,state:'ended',playing:false,durationMs:220000,
    positionMs:219700,bufferedPositionMs:220000,error:''};
window.dispatchEvent(finish);
assert.equal(normalEnd,1,'fully played track must still advance');
console.log('MEDIA3_PREMATURE_END_RECOVERY_GUARD_OK');
