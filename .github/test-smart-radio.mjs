
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const text=readFileSync(new URL('../script.js',import.meta.url),'utf8');
const a=text.indexOf('// SMART RADIO MATCHER START');
const b=text.indexOf('// SMART RADIO MATCHER END');
assert.ok(a>=0 && b>a);
const ctx={};
runInNewContext(text.slice(a,b),ctx);
const base=[{title:'Пустота',artist:'Miyagi & Andy Panda',url:'https://example.org/seed.mp3'},
 {title:'Captain',artist:'Miyagi',url:'https://example.org/captain.mp3'}];
const unrelated={title:'Другая музыка',artist:'Полина',url:'https://example.org/unrelated.mp3'};
const repeated={title:'Пустота',artist:'Miyagi & Andy Panda',url:'https://example.org/other.mp3'};
const newSong={title:'Снова',artist:'Miyagi',url:'https://example.org/new.mp3'};
assert.equal(ctx.smartRadioQueryArtists(base).length,1);
assert.equal(ctx.smartRadioPickCandidate([unrelated,repeated],base,base,0),null);
const picked=ctx.smartRadioPickCandidate([unrelated,repeated,newSong],base,base,.5);
assert.equal(picked.url,newSong.url);
assert.equal(ctx.smartRadioPickCandidate([newSong],base,[...base,newSong],0),null);
assert.equal(ctx.smartRadioPickCandidate([{...newSong,url:'https://example.org/other.mp3'}],base,[...base,newSong],0),null);
console.log('SMART_RADIO_RECOMMENDATIONS_OK');

const prematureStart=text.indexOf('function isPrematureTrackEnd(');
const prematureEnd=text.indexOf('\nfunction handlePrematureTrackEnd(',prematureStart);
assert.ok(prematureStart>0 && prematureEnd>prematureStart,'premature playback end guard exists');
const early={};
runInNewContext(text.slice(prematureStart,prematureEnd),early);
assert.equal(early.isPrematureTrackEnd(2,180),true);
assert.equal(early.isPrematureTrackEnd(45,180),true);
assert.equal(early.isPrematureTrackEnd(180,180),false);
assert.equal(early.isPrematureTrackEnd(90,92),false);
assert.ok(text.includes('function maybePrefetchSmartRadio()'));
assert.ok(text.includes('smartRadioPrefetch===prefetched'));
assert.ok(text.includes("mainAudio.addEventListener('prematureend',()=>handlePrematureTrackEnd(true))"));
console.log('SMART_RADIO_EARLY_PREFETCH_AND_END_GUARDS_OK');
