import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const src=read('script.js'),vision=read('studio-vision.js');
const studio=read('studio.js'),html=read('index.php'),sw=read('sw.js');
const start=src.indexOf('async function playTrack(index, options = {}) {');
const end=src.indexOf('    playbackWanted = true;',start);
assert.ok(start>0&&end>start,'Shared playback entry point found');
const entry=src.slice(start,end);
const call=entry.indexOf('window.studioExpandPlayer?.();');
assert.ok(call>0,'Track selection opens now-playing view');
assert.ok(call>entry.indexOf('if (!options.fromPlayback) {'),'Open player only for explicit new selections');
assert.ok(call<entry.indexOf('smartRadioRequestSerial++'),'View changes before async playback starts');
const experiment={
  playlist:[{url:'https://example.test/one.mp3',title:'One'}],
  playbackPlaylist:[],currentTab:'search',playbackTab:'',
  options:{},idx:0,recordManualPlaybackTransition:()=>{},
  smartRadioRequestSerial:0,smartRadioPrefetch:null,
  smartShufflePlayed:new Set(),document:{getElementById:()=>null},
  opened:0
};
experiment.window={studioExpandPlayer:()=>{experiment.opened++}};
const suffix='\nglobalThis.begin=playTrack;';
// The rest of playTrack is deliberately omitted: the harness asserts the
// gesture-bound prelude, independently of network/API/Media3.
const prelude=entry.replace(/^async function playTrack\(index, options = \{\}\) \{/,
  'function startSelectedTrack(index, options = {}) {')+'\n}\nglobalThis.run=startSelectedTrack;';
runInNewContext(prelude,experiment);
experiment.run(0);
assert.equal(experiment.opened,1);
assert.equal(experiment.playbackTab,'search');
assert.equal(experiment.playbackPlaylist.length,1);
experiment.run(0,{fromPlayback:true});
assert.equal(experiment.opened,1,'Auto-advance/recovery does not reopen a dismissed player');
assert.match(vision,/window\.studioExpandPlayer = expandPlayer/);
assert.match(vision,/dx < 0 \? 'next' : 'prev'/);
assert.match(vision,/if \(direction === 'next'\) window\.playNext\?\.\(\)/);
assert.match(vision,/else window\.playPrev\?\.\(\)/);
assert.match(studio,/renderPlaylist\(\);playTrack\(index\)/,'Liked songs use shared playback');
assert.match(src,/div\.onclick = \(\) => \{ playTrack\(i\); \}/,'Track list uses shared playback');
assert.match(src,/await playTrack\(0\)/,'Wave uses shared playback');
assert.match(html,/script\.js\?v=2388/);
assert.match(sw,/dagstudio-player-shell-v2405/);
assert.match(src,/WEB_BUILD_LABEL = '2388'/);
console.log('ALL_TRACK_SELECTIONS_OPEN_SHARED_PLAYER_AND_PRESERVE_SWIPE_NEXT_PREV_OK');
