
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../script.js',import.meta.url),'utf8');
const begin=source.indexOf('function quickMixUnique(');
const end=source.indexOf('function setQuickMixStatus(',begin);
assert.ok(begin>0&&end>begin);
const ctx={normalizeTrackIdentity:v=>String(v||'').toLowerCase().trim()};
runInNewContext(source.slice(begin,end),ctx);
const a={artist:'Miyagi',title:'Captain',url:'https://example.org/a.mp3'};
const duplicate={...a,url:'https://example.org/d.mp3'};
const b={artist:'Баста',title:'Сансара',url:'https://example.org/b.mp3'};
assert.equal(ctx.quickMixUnique([a,duplicate,b]).length,2);
assert.equal(ctx.quickMixUnique([a],[a]).length,0);
assert.ok(source.includes('selectedTrackForSave=track;'));
assert.ok(!source.slice(source.indexOf('async function playSmartRadioNext()'),source.indexOf('function toggleShuffle()')).includes('showNotification('));
console.log('QUICK_MIXES_AND_HEART_OK');
