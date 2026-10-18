
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

assert.ok(source.includes('btn.disabled=false;'),'mixes must be switchable during a search');
assert.ok(source.includes('playlistSnapshotOwner = username;\n        updatePlayingHeart();'),'heart should update after server playlist sync');
console.log('QUICK_MIXES_SWITCH_AND_FAVORITE_SYNC_OK');

const rankBegin=source.indexOf('function quickMixReleaseTimestamp(');
const rankEnd=source.indexOf('function setQuickMixStatus(',rankBegin);
assert.ok(rankBegin>0&&rankEnd>rankBegin);
runInNewContext(source.slice(rankBegin,rankEnd),ctx);
const popular={title:'Popular',artist:'Singer',url:'https://example.org/popular.mp3',play_count:300000,favorite_count:12000};
const less={title:'Less',artist:'Singer',url:'https://example.org/less.mp3',play_count:5};
const sorted=ctx.quickMixRankTracks([less,popular],{mode:'popular'});
assert.equal(sorted[0].title,'Popular');
const recent={title:'Recent',artist:'Singer',url:'https://example.org/recent.mp3',
    play_count:1000,release_date:new Date(Date.now()-30*86400000).toISOString().slice(0,10)};
assert.ok(ctx.quickMixRank(recent,{mode:'popular'})>ctx.quickMixRank({...recent,release_date:''},{mode:'popular'}));
assert.equal(ctx.quickMixReleaseTimestamp({release_date:'not-a-date'}),0);
assert.ok(source.includes('QUICK_MIXES={'));
assert.ok(source.includes('caucasus:')&&source.includes('foreign:'));
assert.ok(source.includes("String(currentTab).startsWith('mix:')"));
const singerA=[
 {artist:'Only A',title:'A1',url:'https://x.example/a1'},
 {artist:'Only A',title:'A2',url:'https://x.example/a2'},
 {artist:'Only A',title:'A3',url:'https://x.example/a3'}
];
const singerB=[
 {artist:'Different B',title:'B1',url:'https://x.example/b1'},
 {artist:'Different B',title:'B2',url:'https://x.example/b2'}
];
const diverse=ctx.quickMixRankTracks([...singerA,...singerB],{mode:'popular'});
assert.equal(diverse.length,5);
assert.notEqual(diverse[0].artist,diverse[1].artist,
    'A collection with multiple artists must not start with consecutive songs by one singer');
const freshOne={artist:'Recent A',title:'Now',url:'https://x.example/recent',
 release_date:new Date(Date.now()-2*86400000).toISOString().slice(0,10)};
const olderOne={artist:'Legacy B',title:'Past',url:'https://x.example/older'};
const datedFirst=ctx.quickMixRankTracks([olderOne,freshOne],{mode:'popular'});
assert.equal(datedFirst[0].title,'Now','verified recent records should start playlists');
const recentOnly=ctx.quickMixRankTracks([olderOne,freshOne],{mode:'recent'});
assert.equal(recentOnly.length,2);
assert.equal(recentOnly[0].title,'Now');
assert.equal(recentOnly[0]._releaseVerified,true);
assert.equal(recentOnly[1].title,'Past');
assert.equal(recentOnly[1]._releaseVerified,false);
console.log('DIVERSE_ARTISTS_FRESH_FIRST_AND_VERIFIED_CHARTS_OK');
console.log('POPULARITY_AND_RELEASE_RANKING_OK');

// Caucasus: cover every North Caucasus republic plus South Caucasus;
// Dagestan includes Russian-language-oriented searches and native-language
// directions. All actual streams are supplied by live providers, not fixtures.
const configBegin=source.indexOf('const QUICK_MIXES={');
const configEnd=source.indexOf('let quickMixRequestId=',configBegin);
assert.ok(configBegin>=0&&configEnd>configBegin);
const configContext={};
runInNewContext(source.slice(configBegin,configEnd).replace('const QUICK_MIXES=','globalThis.QUICK_MIXES='),configContext);
const caucasus=configContext.QUICK_MIXES.caucasus;
assert.ok(caucasus.regions.length>=15);
const codes=caucasus.regions.map(x=>x.id);
for(const expected of ['dag_ru','dag_avar','dag_dargin','dag_lezgin',
 'dag_kumyk','dag_lak','dag_tabasaran','chechnya','ingushetia',
 'ossetia','kabardino','karachay','adygea',
 'south_georgia','south_armenia','south_azerbaijan']) {
 assert.ok(codes.includes(expected),'missing Caucasus search direction: '+expected);
}
assert.ok(caucasus.regions.every(x=>x.queries.length>=2&&x.label.length>2));
const sourceBegin=source.indexOf('function quickMixSearchPlan(');
const sourceEnd=source.indexOf('function setQuickMixStatus(',sourceBegin);
assert.ok(sourceBegin>0&&sourceEnd>sourceBegin);
runInNewContext(source.slice(sourceBegin,sourceEnd),ctx);
const plan=ctx.quickMixSearchPlan(caucasus);
assert.equal(plan.length,caucasus.regions.length);
const mixed=ctx.quickMixSpreadSources([
 {id:1,source:'[AUDIUS]'},{id:2,source:'[AUDIUS]'},
 {id:3,source:'[HITMOZ]'},{id:4,source:'[MUZOFOND]'}],3);
assert.equal(mixed.length,3);
assert.equal(mixed[0].id,1);
assert.equal(mixed[1].id,3);
assert.equal(mixed[2].id,4);
const apiSource=readFileSync(new URL('../api.php',import.meta.url),'utf8');
for(const provider of ['audius','vk_mail','hitmoz','muzo','zvooq','muzvox','muzca']){
 assert.ok(apiSource.includes("'"+provider+"'  =>")||new RegExp("'"+provider+"'\\s*=>").test(apiSource),
    'not all servers queried: '+provider);
}
assert.ok(apiSource.includes('foreach ($urls as $key => $url)'));
assert.ok(source.includes("response?.sources"));
assert.ok(source.includes("_mixRegion:item.region"));
console.log('CAUCASUS_REPUBLICS_AND_ALL_SEVEN_SOURCES_OK');

assert.ok(source.includes('function openCaucasusRadio()'));
assert.ok(source.includes('function startCaucasusRadio(regionId)'));
assert.ok(source.includes('caucasus_selected={title:region.label'));
console.log('CAUCASUS_PICKER_OK');
