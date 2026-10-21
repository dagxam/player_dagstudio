import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const native=readFileSync(new URL('../native/native-bridge.js',import.meta.url),'utf8');
const config=JSON.parse(readFileSync(new URL('../capacitor.config.json',import.meta.url),'utf8'));
const php=readFileSync(new URL('../ota-bridge.php',import.meta.url),'utf8');
assert.equal(config.plugins.CapacitorHttp.enabled,false,'WebView fetch must not be overwritten');
const start=native.indexOf('let lastHttpTransport =');
const end=native.indexOf('\nwindow.DAG_NATIVE_BRIDGE =',start);
assert.ok(start>0 && end>start, 'Fallback must be defined in native JS bundle');
assert.ok(php.includes("'https://localhost'") && php.includes('Access-Control-Allow-Origin'));
assert.ok(php.includes('DAGSTUDIO-PLAYER-web-version.json'));

let nativeRequests=[],browserRequests=[];
let nativeFail=true;
const ctx={
  URL, AbortController, setTimeout, clearTimeout, console,
  CapacitorHttp:{request:async options=>{
    nativeRequests.push(options);
    if(nativeFail)throw new Error('Unable to resolve host "pl.dagstudio.ru": No address associated with hostname');
    return {status:200,data:{success:true,data:[{title:'ok'}]}};
  }},
  fetch:async (url,options)=>{
    browserRequests.push({url,options});
    return {status:200,text:async()=>JSON.stringify({success:true,data:[{title:'Miyagi'}]})};
  }
};
runInNewContext(native.slice(start,end)+'\nglobalThis.__test={nativeDnsError,safeWebviewRead,nativeHttpWithBrowserFallback};',ctx);
const {nativeDnsError,safeWebviewRead,nativeHttpWithBrowserFallback}=ctx.__test;
const search={url:'https://pl.dagstudio.ru/api.php?t=1',method:'POST',data:{action:'search_global',query:'Miyagi'},headers:{'Content-Type':'application/json'},readTimeout:45000};
assert.equal(nativeDnsError('Unable to resolve host "github.com"'),true);
assert.equal(safeWebviewRead(search),true);
assert.equal(safeWebviewRead({...search,data:{action:'delete_playlist'}}),false,'No duplicate writes');
assert.equal(safeWebviewRead({...search,url:'https://example.com/api.php'}),false,'No attacker host');
assert.equal(safeWebviewRead({url:'https://pl.dagstudio.ru/ota-bridge.php',method:'GET'}),true);
const songs=await nativeHttpWithBrowserFallback(search);
assert.equal(songs.status,200);
assert.equal(songs.data.data[0].title,'Miyagi');
assert.equal(ctx.__test.nativeHttpWithBrowserFallback?browserRequests.length:0,1);
assert.equal(browserRequests[0].options.credentials,'omit');
assert.equal(browserRequests[0].options.mode,'cors');
assert.equal(JSON.parse(browserRequests[0].options.body).action,'search_global');
await assert.rejects(nativeHttpWithBrowserFallback({...search,data:{action:'add_track'}}),/Unable to resolve host/);
assert.equal(browserRequests.length,1,'Mutations never use browser fallback');
const meta=await nativeHttpWithBrowserFallback({url:'https://pl.dagstudio.ru/ota-bridge.php',method:'GET'});
assert.equal(meta.status,200);
assert.equal(browserRequests.length,2);
nativeFail=false;
await nativeHttpWithBrowserFallback(search);
assert.equal(browserRequests.length,2,'Native success avoids fallback');
console.log('CC3_NATIVE_DNS_WEBVIEW_READ_ONLY_FALLBACK_OK');
