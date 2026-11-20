import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source = readFileSync(new URL('../script.js',import.meta.url),'utf8');
const start=source.indexOf('async function refreshSavedTrackSource(track) {');
const end=source.indexOf('\nfunction clearStreamRecoveryTimer()',start);
assert.ok(start>0 && end>start,'Playlist source recovery exists');
const func=source.slice(start,end);
assert.ok(func.includes('track._sourceCandidates'), 'Alternates must be kept between failed starts');
assert.ok(!func.includes('if (!track || track._refreshAttempted'),
    'One exhausted search must not permanently prevent trying subsequent provider results');
const proxyStart=source.indexOf('function shouldProxyMedia(trackOrUrl) {');
const proxyEnd=source.indexOf('\nfunction nativeSessionToken()',proxyStart);
assert.ok(proxyStart>0 && proxyEnd>proxyStart);
const proxyCtx={
  resolveMediaUrl:value=>String(value?.url || value || ''),
  isDagServerMedia:value=>String(value||'').startsWith('https://pl.dagstudio.ru/uploads/'),
  URL
};
runInNewContext(source.slice(proxyStart,proxyEnd)+
  '\nglobalThis.needsRelay=shouldProxyMedia;',proxyCtx);
assert.equal(proxyCtx.needsRelay('https://api.audius.co/v1/tracks/123/stream'),true);
assert.equal(proxyCtx.needsRelay('https://cs1-1.vkuseraudio.net/audio.mp3'),false,
  'External VK CDN URLs must bypass a proxy that would always reject them with 403');
assert.equal(proxyCtx.needsRelay('https://my.music-cdn.example/song.mp3'),false);
assert.equal(proxyCtx.needsRelay('https://fake.slider.kz.attacker.example/track.mp3'),false,
  'Relay allowlist may not match a spoofed hostname suffix');
assert.equal(proxyCtx.needsRelay('https://cdn.slider.kz/track.mp3'),true);
assert.equal(proxyCtx.needsRelay('https://pl.dagstudio.ru/uploads/song.mp3'),false);

const original='https://old.example/song.mp3';
const matches=[
  {title:'Лезгинка',artist:'Исполнитель',url:'https://audius.example/one.mp3',source:'[AUDIUS]'},
  {title:'Лезгинка',artist:'Исполнитель',url:'https://backup.example/two.mp3',source:'[VK]'},
  {title:'Лезгинка',artist:'Исполнитель',url:'https://another.example/three.mp3',source:'[JAMENDO]'}
];
let requestCount=0;
let requested=[];
const saved={id:73,title:'Лезгинка',artist:'Исполнитель',url:original,source:'[OLD]'};
const context={
  navigator:{onLine:true},
  playlists:[{tracks:[{id:73,url:original}]}],
  artistEl:{textContent:''},
  normalizeTrackIdentity:v=>String(v||'').trim().toLowerCase(),
  isWeakConnection:()=>false,
  sourceHealthScore:()=>0,
  scoreReplacementTrack:(saved,other)=>
    saved.title===other.title&&saved.artist===other.artist?170:-1,
  api:async (action,payload)=>{
    assert.equal(action,'search_global');
    requestCount++;requested.push(payload.query);
    return {data:matches};
  },
  console
};
runInNewContext(func+'\nglobalThis.refresh = refreshSavedTrackSource;',context);
assert.equal(await context.refresh(saved),true);
assert.equal(saved.url,matches[0].url);
assert.equal(saved._pendingSaveSource.url,matches[0].url);
assert.equal(await context.refresh(saved),true,'Second source must be available after first fails');
assert.equal(saved.url,matches[1].url);
assert.equal(await context.refresh(saved),true,'Third source must be available after second fails');
assert.equal(saved.url,matches[2].url);
assert.equal(await context.refresh(saved),false,'Keep a hard cap on provider switches');
assert.equal(requestCount,1,'Reuse ranked alternatives without repeated full provider searches');
assert.equal(saved._failedAlternateUrls.length,3);
assert.equal(context.playlists[0].tracks[0].url,original,
  'Do not modify persisted playlist until actual playback confirms a source');
const offline={...saved,_sourceSwitches:0,url:original};
context.navigator.onLine=false;
assert.equal(await context.refresh(offline),false,'Offline must not trigger provider search');
context.navigator.onLine=true;
requestCount=0;
context.api=async(action,payload)=>{
  requested.push(payload.query);requestCount++;
  return {data:payload.query==='Исполнитель Лезгинка'?
    [{title:'Другая песня',artist:'Исполнитель',url:'https://wrong.example/song.mp3'}]:
    [matches[0]]};
};
const titleSearch={id:73,title:'Лезгинка',artist:'Исполнитель',url:original};
assert.equal(await context.refresh(titleSearch),true,
 'Only when full query has no exact matches, title-only discovery may recover a saved song');
assert.deepEqual(requested.slice(-2),['Исполнитель Лезгинка','Лезгинка']);
assert.equal(requestCount,2);
requestCount=0;requested=[];
context.api=async(action,payload)=>{
  requestCount++;requested.push(payload.query);
  return {data:payload.query==='Исполнитель Лезгинка'?
    [{...matches[0],url:original}]:[matches[1]]};
};
const oldOnly={id:73,title:'Лезгинка',artist:'Исполнитель',url:original};
assert.equal(await context.refresh(oldOnly),true,
  'A query returning ONLY the expired URL must fall back to searching by title');
assert.equal(oldOnly.url,matches[1].url);
assert.equal(requestCount,2);
console.log('SAVED_PLAYLIST_EXPIRED_LINK_MULTIPLE_PROVIDERS_EXACT_MATCH_AND_OFFLINE_GUARDS_OK');
