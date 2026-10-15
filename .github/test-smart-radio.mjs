
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
