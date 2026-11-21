import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const js=readFileSync(new URL('../script.js',import.meta.url),'utf8');
const begin=js.indexOf('function countTrackListening(track, currentTime) {');
const end=js.indexOf('\nfunction isPrematureTrackEnd(',begin);
assert.ok(begin>0&&end>begin);
const context={playbackWanted:true,NATIVE_MEDIA3_ACTIVE:false,
  mainAudio:{paused:false,currentTime:0,duration:120}};
runInNewContext(js.slice(begin,end)+'\nglobalThis.listen=countTrackListening;globalThis.complete=wasTrackFullyHeard;',context);
const full={_listenedSeconds:0,_listenedLastPosition:null,_listenedWasAtStart:false};
for(let t=1;t<=120;t++){context.mainAudio.currentTime=t;context.listen(full,t);}
assert.equal(context.complete(full),true);
const skipped={_listenedSeconds:0,_listenedLastPosition:null,_listenedWasAtStart:false};
for(let t=1;t<=15;t++){context.mainAudio.currentTime=t;context.listen(skipped,t);}
context.mainAudio.currentTime=119;context.listen(skipped,119);
assert.equal(context.complete(skipped),false);
assert.match(js,/if \(options\.reason !== 'completed'\) return/);
assert.doesNotMatch(js,/if \(!isUrlStillInAnyPlaylist\(trackOrUrl\)\) return/);
assert.match(js,/cacheTrackSilently\(finishedTrack, \{ reason: 'completed'/);
assert.doesNotMatch(js,/cacheTrackSilently\(trackData, \{ reason: 'playlist'/);
assert.doesNotMatch(js,/cacheTrackSilently\(pausedTrack,/);
console.log('FULL_LISTEN_OFFLINE_PUBLICATION_OK');

// Native completion is reported by actual Media3 progress, not WebView timers.
context.NATIVE_MEDIA3_ACTIVE=true;
context.mainAudio.fullyHeard=true;
assert.equal(context.complete({_listenedWasAtStart:false}),true);
context.mainAudio.fullyHeard=false;
assert.equal(context.complete(full),false);
assert.match(js,/preferMedia3Cache: reason === 'completed'/);
assert.match(js,/nativeCacheQueue\[0\]\?\.reason !== 'completed'/);
console.log('NATIVE_FULL_LISTEN_OFFLINE_PROMOTION_OK');

assert.match(js,/function findNativeOfflineEntry\(trackOrUrl\)/);
assert.match(js,/matches.length === 1/);
const findStart=js.indexOf('function findNativeOfflineEntry(trackOrUrl)');
const findEnd=js.indexOf('\nasync function getNativeCachedAudio(',findStart);
const offlineMap={
 'https://a.test/one.mp3':{url:'https://a.test/one.mp3',path:'cache/one.mp3',artist:'Алан',title:'Песня',owners:['owner']},
 'https://a.test/other.mp3':{url:'https://a.test/other.mp3',path:'cache/two.mp3',artist:'Алан',title:'Другая',owners:['owner']},
 'https://a.test/private.mp3':{url:'https://a.test/private.mp3',path:'cache/private.mp3',artist:'Скрытый',title:'Трек',owners:['other']}
};
const lookupContext={
 readNativeAudioIndex:()=>offlineMap,currentCacheOwner:()=> 'owner',
 normalizeCacheTrack:track=>track,
 canonicalTrackUrl:track=>track.url,
 normalizeTrackIdentity:v=>String(v||'').toLowerCase().trim()
};
runInNewContext(js.slice(findStart,findEnd)+'\nglobalThis.lookup=findNativeOfflineEntry;',lookupContext);
assert.equal(lookupContext.lookup({url:'https://a.test/new.mp3',artist:'Алан',title:'Песня'}).entry.path,'cache/one.mp3');
assert.equal(lookupContext.lookup({url:'https://a.test/private.mp3',artist:'Скрытый',title:'Трек'}),null);
offlineMap['https://a.test/duplicate.mp3']={url:'https://a.test/duplicate.mp3',path:'cache/duplicate.mp3',artist:'Алан',title:'Песня',owners:['owner']};
assert.equal(lookupContext.lookup({url:'https://a.test/new.mp3',artist:'Алан',title:'Песня'}),null);
console.log('UNIQUE_SONG_OFFLINE_MATCH_ACROSS_SCREENS_OK');

assert.match(js,/const storedKey = existing.cachedKey \|\| resolved/);
assert.match(js,/path: existing.path/);
console.log('OFFLINE_ALIAS_REUSES_EXISTING_FILE_INDEX_OK');
