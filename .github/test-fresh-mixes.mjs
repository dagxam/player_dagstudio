import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const code=read('script.js');
const begin=code.indexOf('function quickMixReleaseTimestamp(');
const end=code.indexOf('function setQuickMixStatus(',begin);
assert.ok(begin>0&&end>begin,'Release sorting and collection discovery helpers exist');
const ctx={normalizeTrackIdentity:value=>String(value||'').toLocaleLowerCase().trim()};
runInNewContext(code.slice(begin,end),ctx);
const year=new Date().getUTCFullYear();
const thisYear=new Date().toISOString().slice(0,10);
const song=(artist,title,date,idx)=>({
 artist,title,url:'https://music.example.net/'+idx+'.mp3',
 source:'[MUZOFOND]',release_date:date||''
});
const nowA=song('А','Свежая А',thisYear,1);
const olderA=song('А','Ещё А',year+'-01-01',2);
const nowB=song('Б','Свежая Б',thisYear,3);
const previous=song('В','Прошлый год',(year-1)+'-12-31',4);
const archival=song('Г','Архив',(year-3)+'-06-01',5);
const unknown=song('Д','Новинки '+year,null,6);
const sorted=ctx.quickMixRankTracks([unknown,olderA,previous,nowA,archival,nowB],
 {mode:'popular'});
assert.equal(sorted.length,6);
assert.equal(JSON.stringify(Array.from(sorted.slice(0,3),t=>t.artist).sort()),JSON.stringify(['А','А','Б']));
assert.notEqual(sorted[0].artist,sorted[1].artist,
 'Within the newest year, different performers should alternate');
assert.equal(JSON.stringify(Array.from(sorted.slice(3),t=>t.artist)),JSON.stringify(['В','Г','Д']),
 'Strict descending year order; unverified songs last');
const strictDay = ctx.quickMixRankTracks([
 song('А','Вчера','2026-11-17',101),
 song('Б','Январь','2026-01-12',102),
 song('А','Позавчера','2026-11-16',103),
 song('В','Без даты',null,104)
],{mode:'popular'});
assert.deepEqual(Array.from(strictDay,t=>t.title),
 ['Вчера','Позавчера','Январь','Без даты'],
 'Verified release day must outrank older songs of the same year; undated last');
assert.ok(sorted.slice(0,5).every(t=>t._releaseVerified===true));
assert.equal(sorted[5]._releaseVerified,false,
 'A year written in the track title must not become release metadata');
assert.equal(ctx.quickMixReleaseTimestamp({release_date:'2024'}),0);
assert.equal(ctx.quickMixReleaseTimestamp({release_date:'unknown'}),0);
assert.equal(ctx.quickMixReleaseTimestamp({release_date:'2026-02-30'}),0,
 'Impossible calendar dates must not be ranked as real releases');
assert.equal(ctx.quickMixReleaseTimestamp({release_date:'2024-13-01'}),0);
assert.equal(ctx.quickMixReleaseTimestamp({release_date:'2024-02-29'}),Date.parse('2024-02-29T00:00:00Z'));
const recent=ctx.quickMixRankTracks([unknown,archival,nowB,previous],{mode:'recent'});
assert.equal(recent[0].title,nowB.title);
assert.equal(recent[1].title,previous.title);
assert.equal(recent[2].title,archival.title);
assert.equal(recent[3].title,unknown.title);
const spread=ctx.quickMixSpreadSources([
 song('Один','1',null,10),song('Один','2',null,11),
 song('Другой','3',null,12),song('Другой','4',null,13)
],4);
assert.equal(spread.length,4);
assert.notEqual(spread[0].artist,spread[1].artist,
 'Even one working source must show several artists when available');

const cfgBegin=code.indexOf('const QUICK_MIXES={');
const cfgEnd=code.indexOf('let quickMixRequestId=0;',cfgBegin);
assert.ok(cfgBegin>=0&&cfgEnd>cfgBegin);
const meta={};
runInNewContext(code.slice(cfgBegin,cfgEnd).replace('const QUICK_MIXES=','globalThis.QUICK_MIXES='),meta);
const configs=meta.QUICK_MIXES;
assert.ok(configs.russian.queries.length>=4);
assert.ok(configs.russian.artists.length>=12);
assert.equal(configs.russian.mode,'popular');
const rusPlan=ctx.quickMixSearchPlan(configs.russian);
assert.equal(rusPlan[0].kind,'theme');
assert.equal(rusPlan[1].kind,'artist');
assert.equal(rusPlan[2].kind,'theme');
assert.notEqual(rusPlan[1].queries[0],rusPlan[3].queries[0]);
assert.ok(configs.foreign.queries.length>=2);
assert.ok(configs.hits.queries.length>=2);
assert.ok(configs.road.queries.length>=2);
assert.ok(configs.rock.queries.length>=2);
assert.equal(configs.retro.mode,'classic','Retro still serves classic music');
const regions=ctx.quickMixSearchPlan(configs.caucasus);
assert.equal(regions.length,configs.caucasus.russianQueries.length+
 configs.caucasus.regions.length-1);
assert.equal(regions[0].kind,'caucasus-russian');
assert.ok(regions.slice(0,configs.caucasus.russianQueries.length)
 .every(direction=>direction.kind==='caucasus-russian'));
assert.ok(regions.slice(configs.caucasus.russianQueries.length)
 .every(direction=>direction.kind==='caucasus-national'));
const caucasusTrack=(name,release_date,russian,idx)=>({
 artist:'Исполнитель '+idx,title:name,url:'https://example.org/caucasus-'+idx+'.mp3',
 release_date,_caucasusRussianSearch:russian
});
const priorities=ctx.quickMixRankTracks([
 caucasusTrack('Национальная старая',year-1+'-09-12',false,1),
 caucasusTrack('Русская без даты','',true,2),
 caucasusTrack('Национальная новая',thisYear,false,3),
 caucasusTrack('Русская старая',year-1+'-01-10',true,4),
 caucasusTrack('Русская новая',thisYear,true,5)
],configs.caucasus);
assert.equal(JSON.stringify(priorities.map(t=>t.title)),JSON.stringify([
 'Русская новая','Национальная новая','Русская старая',
 'Национальная старая','Русская без даты'
]),'2026 Caucasus in Russian precedes 2026 national; older and undated follow');
const oneRegion=ctx.quickMixSearchPlan({regions:[configs.caucasus.regions[0]],
 splitRegionQueries:true});
assert.ok(oneRegion.length>=4,'A single republic searches several performers');
assert.ok(new Set(Array.from(oneRegion,d=>d.queries[0])).size>=4);
assert.ok(oneRegion.some(d=>d.kind==='artist'));
assert.match(code,/splitRegionQueries:true,regions:\[region\]/);
assert.ok(regions.length>=15);
for(const region of regions){
 assert.ok(region.queries.length>=(region.kind==='caucasus-russian'?1:2));
 assert.ok(!/^(Зара Гамзатова|Эльдар Далгатов|Ислам Итляшев|Мика Рамазанова)$/.test(region.queries[0]),
  'Start Caucasus discovery with styles and republics, not one singer');
}
assert.match(code,/function publishMixResults\(item,tracks\)/);
assert.match(code,/publishMixResults\(item,found\)/);
assert.match(code,/mode,network:net\.weak\?'weak':'normal'/);
assert.match(code,/const batchSize=key==='charts'\?4:\(getNetworkProfile\(\)\.weak\?2:3\)/);
assert.match(code,/Promise\.all\(batch\.map\(async item=>/);
assert.match(code,/const pageResults=await Promise\.all\(picks\.map\(async/);
assert.match(code,/state\.pageNumbers\.get\(query\)\|\|0\)\+1/);
assert.match(code,/requestedQueries=new Set\(\)/);
const php=read('api.php');
for(const provider of ['muzo','hitmoz'])
 assert.ok(php.includes("'"+provider+"'"),'Approved search provider: '+provider);
assert.match(php,/foreach \(\$urls as \$key => \$url\)/);
assert.match(php,/'search_complete'/);
console.log('FRESH_VERIFIED_RELEASE_YEARS_DIVERSE_RUSSIAN_CAUCASUS_FAST_MIX_SEARCH_OK');
