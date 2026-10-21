import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const code=readFileSync(new URL('../script.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.php',import.meta.url),'utf8');
const endpointStart=code.indexOf('async function api(action, data = {})');
const endpointEnd=code.indexOf('\nfunction renderCurrentPlaylistFromAccountData()',endpointStart);
assert.ok(endpointStart>=0&&endpointEnd>endpointStart,'API function boundaries');

const connStart=code.indexOf('let lastConnectivityFailure =');
const connEnd=code.indexOf('\nasync function fetchOtaManifest()',connStart);
assert.ok(connStart>0&&connEnd>connStart,'DNS utilities');
const ctx={
  navigator:{onLine:true},
  console:{error:()=>{},warn:()=>{}},
  IS_NATIVE_APP:true,
  NATIVE_SESSION_KEY:'test',
  localStorage:{getItem:()=>'',setItem:()=>{},removeItem:()=>{}},
  nativeSessionToken:()=>'',
  nativeApiReachable:false,
  appServerUrl:path=>'https://pl.dagstudio.ru'+path,
  isWeakConnection:()=>false,
  nativeHttpRequest:async()=>{throw new Error('Unable to resolve host "pl.dagstudio.ru": No address associated with hostname')},
};
runInNewContext(code.slice(connStart,connEnd)+code.slice(endpointStart,endpointEnd)+'\nglobalThis.__api=api;',ctx);
const failure=await ctx.__api('search_global',{query:'Miyagi'});
assert.equal(failure.error_code,'dns');
assert.match(failure.error,/DNS/i);
assert.ok(!failure.error.includes('Unable to resolve host'),'Do not leak system exception into UI');
assert.ok(code.includes("if (result?.error) {"),'Search must handle structured API errors');
assert.ok(code.includes("error.error_code = String(result.error_code || 'api')"),'Preserve classified error in search UI');
assert.ok(code.includes("if (response?.error) throw new Error(String(response.error))"),'Source checks must surface API errors');
ctx.nativeHttpRequest=async()=>({status:200,data:{success:true,data:[{title:'ok'}]}});
const success=await ctx.__api('search_global',{query:'Miyagi'});
assert.equal(success.success,true);
assert.equal(success.data[0].title,'ok');
assert.ok(index.includes('id="connectivity-check-btn"'));
assert.ok(index.includes('id="connectivity-check-info"'));
assert.ok(code.includes("['Сайт и API', DAG_SERVER_ORIGIN + '/deploy-version.txt']"));
assert.ok(code.includes("['OTA', NATIVE_UPDATE_META_URL]"));
assert.ok(code.includes("['GitHub', NATIVE_UPDATE_BACKUP_META_URL]"));
console.log('DNS_API_SEARCH_OTA_NETWORK_DIAGNOSTICS_OK');
