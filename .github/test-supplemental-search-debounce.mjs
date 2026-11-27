import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const script=read('script.js');
const start=script.indexOf('function queuePlayableCatalogSearch(override){');
const end=script.indexOf("mainSearchInput?.addEventListener('input',",start);
assert.ok(start>0&&end>start,'Supplemental search scheduling function available');
const scheduled=new Map();
let last=0;
const requested=[];
const context={
  playableCatalogSearchTimer:null,playableCatalogSearchSerial:0,
  playableCatalogRows:[],playableCatalogQuery:'',
  mainSearchInput:{value:'Miyagi'},
  clearTimeout:id=>scheduled.delete(id),
  setTimeout:(fn,delay)=>{scheduled.set(++last,{fn,delay});return last;},
  requestPlayableCatalogs:(q,s)=>requested.push([q,s])
};
runInNewContext(script.slice(start,end)+'\nglobalThis.queue=queuePlayableCatalogSearch;',context);
context.queue(); // input event schedules the multi-source request
assert.equal(scheduled.size,1);
context.queue('Miyagi'); // search start / Enter must NOT cancel that request
assert.equal(scheduled.size,1,'Second same-query call canceled the scheduled supplemental search');
assert.equal(context.playableCatalogSearchSerial,1,'Same query unexpectedly invalidated the search');
const task=[...scheduled.values()][0];
assert.equal(task.delay,720);
// A real timeout is removed from the event loop when it fires.
scheduled.delete([...scheduled.keys()][0]);
task.fn();
assert.deepEqual(requested[0],['Miyagi',1],'All provider results must be fetched');
context.mainSearchInput.value='Ислам Итляшев';
context.queue();
assert.equal(scheduled.size,1,'New query should replace stale lookup');
assert.equal(context.playableCatalogSearchSerial,2);
const selected=[...scheduled.values()][0];
selected.fn();
assert.equal(requested[1][0],'Ислам Итляшев');
assert.match(read('index.php'),/script\.js\?v=2386/);
assert.match(read('sw.js'),/dagstudio-player-shell-v2403/);
console.log('SUPPLEMENTAL_PLAYABLE_SEARCH_DEBOUNCE_AND_PWA_REFRESH_OK');

assert.match(script,/const providers = new Set\(searchPlaylistCache\.map\(/,
  'Full search should count merged provider labels');
assert.match(script,/const providersWithSongs = new Set\(searchPlaylistCache\.map\(/,
  'Fast search should count all providers currently visible');
