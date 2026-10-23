import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const bridge=readFileSync(new URL('../native/native-bridge.js',import.meta.url),'utf8');
const config=JSON.parse(readFileSync(new URL('../capacitor.config.json',import.meta.url),'utf8'));
const php=readFileSync(new URL('../ota-bridge.php',import.meta.url),'utf8');
assert.equal(config.plugins.CapacitorHttp.enabled,false);
assert.match(php,/Access-Control-Allow-Origin/);
const a=bridge.indexOf('let lastHttpTransport ='),b=bridge.indexOf('\nwindow.DAG_NATIVE_BRIDGE =',a);
assert.ok(a>0&&b>a);
let direct=[],capacitor=[],browser=[],legacy=false,failDirect=false,failCapacitor=false;
const ctx={
 URL,AbortController,setTimeout,clearTimeout,console,Set,String,Number,
 hasAndroidMedia3:true,
 DAGCarMode:{readOwnServer:async options=>{
   direct.push(options);
   if(legacy && options.method==='POST' && options.data?.action!=='search_global')
     throw Error('Only read-only search and update checks are allowed');
   if(failDirect)throw Error('verified TLS timeout');
   return {status:200,data:{success:true,logged_in:true,data:[{title:'Native'}]}};
 }},
 CapacitorHttp:{request:async options=>{
   capacitor.push(options);
   if(failCapacitor)throw Error('Unable to resolve host');
   return {status:200,data:{success:true}};
 }},
 fetch:async(url,options)=>{
   browser.push({url,options});
   return {status:200,text:async()=>JSON.stringify({success:true,data:[{title:'WebView'}]})};
 }
};
runInNewContext(bridge.slice(a,b)+
 '\nglobalThis.test={nativeHttpWithBrowserFallback,safeWebviewRead};',ctx);
const run=ctx.test.nativeHttpWithBrowserFallback;
const opts={url:'https://pl.dagstudio.ru/api.php?t=1',method:'POST',
 data:{action:'search_global',query:'Miyagi'},headers:{'Content-Type':'application/json'}};
await run(opts);
assert.equal(direct.length,1);assert.equal(capacitor.length,0);
assert.equal(browser.length,0);
failDirect=true;
const alt=await run(opts);
assert.equal(alt.data.data[0].title,'WebView');
assert.equal(browser.length,1);assert.equal(capacitor.length,0);
await assert.rejects(run({...opts,data:{action:'delete_track'}}),/verified TLS timeout/);
assert.equal(browser.length,1,'Never replay account mutations');
failDirect=false;legacy=true;
await run({...opts,data:{action:'check_auth'}});
assert.equal(capacitor.length,1,'Old signed APK fallback remains compatible');
legacy=false;
assert.equal(ctx.test.safeWebviewRead({...opts,data:{action:'get_data'}}),true);
assert.equal(ctx.test.safeWebviewRead({...opts,data:{action:'update_theme'}}),false);
console.log('CC3_PINNED_PRIMARY_FAST_READ_PROFILE_AND_NO_DUPLICATE_WRITES_OK');