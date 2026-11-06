import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const js=readFileSync(new URL('../script.js',import.meta.url),'utf8');
const begin=js.indexOf('function countTrackListening(track, currentTime) {');
const end=js.indexOf('\nfunction isPrematureTrackEnd(',begin);
assert.ok(begin>0&&end>begin);
const context={playbackWanted:true,mainAudio:{paused:false,currentTime:0,duration:120}};
runInNewContext(js.slice(begin,end)+'\nglobalThis.listen=countTrackListening;globalThis.complete=wasTrackFullyHeard;',context);
const full={_listenedSeconds:0,_listenedLastPosition:null,_listenedWasAtStart:false};
for(let t=1;t<=120;t++){context.mainAudio.currentTime=t;context.listen(full,t);}
assert.equal(context.complete(full),true);
const skipped={_listenedSeconds:0,_listenedLastPosition:null,_listenedWasAtStart:false};
for(let t=1;t<=15;t++){context.mainAudio.currentTime=t;context.listen(skipped,t);}
context.mainAudio.currentTime=119;context.listen(skipped,119);
assert.equal(context.complete(skipped),false);
assert.match(js,/if \(options\.reason !== 'completed'\) return/);
assert.match(js,/if \(!isUrlStillInAnyPlaylist\(trackOrUrl\)\) return/);
assert.match(js,/cacheTrackSilently\(finishedTrack, \{ reason: 'completed'/);
assert.doesNotMatch(js,/cacheTrackSilently\(trackData, \{ reason: 'playlist'/);
assert.doesNotMatch(js,/cacheTrackSilently\(pausedTrack,/);
console.log('FULL_LISTEN_OFFLINE_PUBLICATION_OK');
