import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const src=readFileSync(new URL('../script.js',import.meta.url),'utf8');
const begin=src.indexOf('function toggleShuffle() {');
const end=src.indexOf('function toggleRepeat()',begin);
assert.ok(begin>=0 && end>begin);
const list=[0,1,2,3,4].map(i=>({title:'Song '+i,artist:'Artist',url:'https://test.invalid/'+i+'.mp3'}));
let played=0,notified='';
const btn={classList:{remove:()=>{}},setAttribute:()=>{}};
const context={playlist:list.slice(),playbackPlaylist:list.slice(),currentIndex:2,
 currentTab:'search',quickMixCurrent:null,isShuffle:false,smartShufflePlayed:new Set(),
 canonicalTrackUrl:t=>t?.url,document:{getElementById:()=>btn},
 renderPlaylist:()=>{},showNotification:t=>{notified=t;},playTrack:()=>{played++;}};
runInNewContext(src.slice(begin,end),context);
context.toggleShuffle();
assert.equal(context.playbackPlaylist[context.currentIndex],list[2],
 'playing audio identity must remain unchanged');
assert.equal(played,0,'shuffle must not restart current audio');
assert.equal(context.playlist[0],list[2]);
assert.equal(new Set(context.playlist).size,list.length);
assert.deepEqual(context.playlist.map(t=>t.url),context.playbackPlaylist.map(t=>t.url));
assert.equal(notified,'','rearranging the playlist must not open a modal');
const before=context.playlist.map(t=>t.url).join(',');
context.toggleShuffle();
assert.notEqual(context.playlist.map(t=>t.url).join(','),before,
 'pressing again must visibly rearrange songs');
console.log('INSTANT_SHUFFLE_PRESERVES_PLAYBACK_OK');
