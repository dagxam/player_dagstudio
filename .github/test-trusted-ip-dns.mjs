import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const dns=readFileSync(new URL('../native/android/DAGServerDns.java',import.meta.url),'utf8');
const plugin=readFileSync(new URL('../native/android/DAGCarModePlugin.java',import.meta.url),'utf8');
const player=readFileSync(new URL('../native/android/DAGAudioEngine.java',import.meta.url),'utf8');
const bridge=readFileSync(new URL('../native/native-bridge.js',import.meta.url),'utf8');
const gradle=readFileSync(new URL('./workflows/build-android.yml',import.meta.url),'utf8');
assert.match(dns,/FALLBACK_IP = "188.127.241.85"/);
assert.match(dns,/Collections\.singletonList\(trusted\)/);
assert.match(dns,/Dns\.SYSTEM\.lookup\(hostname\)/);
assert.match(plugin,/new DAGServerDns\(\)/);
assert.match(plugin,/DAGServerDns\.HOST\.equalsIgnoreCase\(uri\.getHost\(\)\)/);
assert.match(plugin,/"search_global", "official_audius_feed", "check_auth", "get_data"/);
assert.match(plugin,/builder\.header\("X-DAG-Session", sessionToken\)/);
assert.match(plugin,/sessionToken\.matches/);
assert.match(plugin,/followRedirects\(false\)/);
assert.doesNotMatch(plugin,/setHostnameVerifier|trustAll|hostnameVerifier\(/);
assert.match(player,/OkHttpDataSource\.Factory\(streamClient\)/);
assert.match(gradle,/cp native\/android\/DAGServerDns\.java/);
let calls=[],webCalls=0,nativeCalls=0,networkFailure=false,legacy=false;
const context={
 URL,AbortController,setTimeout,clearTimeout,console,Set,String,Number,
 hasAndroidMedia3:true,
 CapacitorHttp:{request:async()=>{nativeCalls++;throw Error('Unable to resolve host');}},
 fetch:async()=>{webCalls++;throw Error('Browser DNS failed');},
 DAGCarMode:{readOwnServer:async o=>{
   calls.push(o);
   if(legacy && o.data?.action!=='search_global' && o.method==='POST')
      throw Error('Only read-only search and update checks are allowed');
   if(networkFailure)throw Error('TLS timeout');
   return {status:200,data:{success:true,logged_in:true,theme:'purple',
      data:[{title:'Miyagi'}]},transport:'server-ip-tls-verified'};
 }}
};
const start=bridge.indexOf('let lastHttpTransport ='),end=bridge.indexOf('\nwindow.DAG_NATIVE_BRIDGE =',start);
assert.ok(start>0&&end>start);
runInNewContext(bridge.slice(start,end)+
 '\nglobalThis.test={nativeHttpWithBrowserFallback,safeWebviewRead,ownServerRequest};',context);
const {nativeHttpWithBrowserFallback:safeHttp,safeWebviewRead,ownServerRequest}=context.test;
const search={url:'https://pl.dagstudio.ru/api.php?t=1',method:'POST',
 data:{action:'search_global',query:'Miyagi'},headers:{'Content-Type':'application/json'}};
const songs=await safeHttp(search);
assert.equal(songs.data.data[0].title,'Miyagi');
assert.equal(calls.length,1);
assert.equal(nativeCalls,0);
assert.equal(webCalls,0,'Search must prefer verified HTTPS/IP without 3 DNS timeouts');
assert.equal(safeWebviewRead({...search,data:{action:'get_data'}}),true);
assert.equal(safeWebviewRead({...search,data:{action:'delete_track'}}),false);
const profile=await safeHttp({...search,data:{action:'check_auth'},
 headers:{'X-DAG-Session':'12345678901234567890'}});
assert.equal(profile.data.theme,'purple');
assert.equal(calls[1].sessionToken,'12345678901234567890');
networkFailure=true;
await assert.rejects(safeHttp({...search,data:{action:'update_theme',theme:'red'}}),/TLS timeout/);
assert.equal(calls.length,3,'A mutation is never replayed after a network failure');
assert.equal(webCalls,0,'No mutation retries through WebView');
networkFailure=false;
const version=await safeHttp({url:'https://pl.dagstudio.ru/ota-bridge.php',method:'GET'});
assert.equal(version.status,200);
assert.equal(calls.length,4);
assert.equal(ownServerRequest({...search,url:'https://evil.test/api.php'}),false);
assert.equal(ownServerRequest({...search,url:'http://pl.dagstudio.ru/api.php'}),false);
await assert.rejects(safeHttp({...search,url:'https://evil.test/api.php'}),/Unable to resolve host/);
assert.equal(calls.length,4);
console.log('PINNED_IP_FAST_SEARCH_SESSION_PROFILE_AND_OTA_TLS_OK');