import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const dns=readFileSync(new URL('../native/android/DAGServerDns.java',import.meta.url),'utf8');
const plugin=readFileSync(new URL('../native/android/DAGCarModePlugin.java',import.meta.url),'utf8');
const player=readFileSync(new URL('../native/android/DAGAudioEngine.java',import.meta.url),'utf8');
const bridge=readFileSync(new URL('../native/native-bridge.js',import.meta.url),'utf8');
const gradle=readFileSync(new URL('./workflows/build-android.yml',import.meta.url),'utf8');

assert.ok(dns.includes('DAGServerDns implements Dns'));
assert.ok(dns.includes('FALLBACK_IP = "188.127.241.85"'));
assert.ok(dns.includes('Dns.SYSTEM.lookup(hostname)'));
assert.ok(dns.includes('HOST.equalsIgnoreCase(hostname)'));
assert.ok(plugin.includes('public void readOwnServer(PluginCall call)'));
assert.ok(plugin.includes('new DAGServerDns()'));
assert.ok(plugin.includes('new URL(value)'));
assert.ok(plugin.includes('DAGServerDns.HOST.equalsIgnoreCase(uri.getHost())'));
assert.ok(plugin.includes('"search_global".equals(data.optString("action", ""))'));
assert.ok(plugin.includes('followRedirects(false)'));
assert.ok(!plugin.includes('hostnameVerifier((hostname, session) -> true'));
assert.ok(!plugin.includes('setHostnameVerifier'));
assert.ok(!plugin.includes('trustAll'));
assert.ok(player.includes('OkHttpDataSource.Factory(streamClient)'));
assert.ok(player.includes('new DAGServerDns()'));
assert.ok(gradle.includes('media3-datasource-okhttp:1.11.1'));
assert.ok(gradle.includes('cp native/android/DAGServerDns.java'));

let pinnedCalls=0,webCalls=0;
const context={
 URL,AbortController,setTimeout,clearTimeout,console,
 hasAndroidMedia3:true,
 CapacitorHttp:{request:async()=>{throw new Error('Unable to resolve host "pl.dagstudio.ru"');}},
 fetch:async()=>{webCalls++;throw new TypeError('Failed to fetch');},
 DAGCarMode:{readOwnServer:async options=>{
  pinnedCalls++;
  return {status:200,data:{success:true,data:[{title:'Miyagi'}]},transport:'server-ip-tls-verified'};
 }}
};
const start=bridge.indexOf('let lastHttpTransport ='),end=bridge.indexOf('\nwindow.DAG_NATIVE_BRIDGE =',start);
assert.ok(start>0 && end>start);
runInNewContext(bridge.slice(start,end)+
 '\nglobalThis.test={nativeHttpWithBrowserFallback,safeWebviewRead};',context);
const read={url:'https://pl.dagstudio.ru/api.php?t=1',method:'POST',
 data:{action:'search_global',query:'Miyagi'}};
const result=await context.test.nativeHttpWithBrowserFallback(read);
assert.equal(result.status,200);assert.equal(pinnedCalls,1);assert.equal(webCalls,1);
assert.equal(result.data.data[0].title,'Miyagi');
await assert.rejects(context.test.nativeHttpWithBrowserFallback({
 ...read,data:{action:'delete_track'}}),/Unable to resolve host/);
assert.equal(pinnedCalls,1,'Do not repeat account or playlist mutations');
const updated=await context.test.nativeHttpWithBrowserFallback({
 url:'https://pl.dagstudio.ru/ota-bridge.php',method:'GET'});
assert.equal(updated.status,200);assert.equal(pinnedCalls,2);
await assert.rejects(context.test.nativeHttpWithBrowserFallback({
 url:'https://example.com/api.php',method:'POST',data:{action:'search_global'}}),/Unable to resolve host/);
assert.equal(pinnedCalls,2,'Never connect to unknown hosts through pinned route');
console.log('PINNED_DNS_SEARCH_OTA_MEDIA3_SECURITY_AND_CC3_FALLBACK_OK');
