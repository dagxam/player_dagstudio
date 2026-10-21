import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../script.js',import.meta.url),'utf8');
const start=source.indexOf('let lastConnectivityFailure =');
const end=source.indexOf('\nasync function fetchOtaManifest()',start);
assert.ok(start>0 && end>start);
const ctx={navigator:{onLine:true}, console};
runInNewContext(source.slice(start,end),ctx);
assert.equal(ctx.isDnsResolutionFailure('Unable to resolve host "github.com": No address associated with hostname'),true);
assert.equal(ctx.isDnsResolutionFailure('net::ERR_NAME_NOT_RESOLVED'),true);
assert.equal(ctx.isDnsResolutionFailure('Temporary failure in name resolution'),true);
assert.equal(ctx.isDnsResolutionFailure('Ошибка DNS: адреса серверов не определяются'),true);
assert.equal(ctx.isDnsResolutionFailure('HTTP 503'),false);
assert.match(ctx.explainConnectionFailure(new Error('Unable to resolve host "pl.dagstudio.ru"')),/DNS/);
assert.doesNotMatch(ctx.explainConnectionFailure('Unable to resolve host "github.com"'),/Unable to resolve/);
assert.match(ctx.explainConnectionFailure(new Error('Read timed out')),/долго/);
ctx.navigator.onLine=false;
assert.match(ctx.explainConnectionFailure('Network failure'),/Нет подключения/);

assert.ok(source.includes('holder.appendChild(status)'),'Status belongs below the input');
assert.ok(source.includes("recordConnectivityFailure(error);"),'Keep meaningful diagnosis');
assert.ok(source.includes('Проверка источников: '),'Source diagnostic should identify network errors');
assert.ok(source.includes('lastConnectivityFailure'),'Diagnostics should include last failure');
assert.ok(!source.includes("showNotification('Онлайн-обновление не удалось: ' + String(error?.message"),
 'Raw Java exceptions must not be shown to the user');
console.log('NETWORK_DNS_CLASSIFICATION_AND_SEARCH_LAYOUT_OK');
