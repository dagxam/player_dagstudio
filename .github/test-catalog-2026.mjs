import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {runInNewContext} from 'node:vm';
const read = path => readFileSync(new URL('../'+path, import.meta.url), 'utf8');
const code=read('script.js'),index=read('index.php'),api=read('api.php');
const bridge=read('native/native-bridge.js'),native=read('native/android/DAGCarModePlugin.java');
assert.match(api, /action === 'catalog_2026'/);
assert.match(api, /catalog-2026\.php/);
assert.match(bridge, /'catalog_2026'/);
assert.match(native, /"catalog_2026"/);
assert.match(index, /script\.js\?v=2375/);
assert.match(code, /function catalog2026Match\(track,editorial\)/);
assert.match(code, /enrichMixFrom2026Catalog\(key,requestId,publishMixResults\)/);
assert.match(code, /catalog_published_date:seed\.published_date/);
const start=code.indexOf('function catalog2026Match(track,editorial) {');
const end=code.indexOf('\nasync function enrichMixFrom2026Catalog(',start);
assert.ok(start>0&&end>start);
const context={normalizeTrackIdentity:s=>String(s||'').trim().toLowerCase()};
runInNewContext(code.slice(start,end)+'\nglobalThis.match=catalog2026Match;',context);
assert.equal(context.match(
  {url:'https://music.test/1.mp3',artist:'Зульфия Чотчаева',title:'Лето'},
  {artist:'Зульфия Чотчаева',title:'Лето'}),true);
assert.equal(context.match(
  {url:'https://music.test/1.mp3',artist:'Зульфия Чотчаева',title:'Другое'},
  {artist:'Зульфия Чотчаева',title:'Лето'}),false);
assert.equal(context.match(
  {url:'',artist:'Певица',title:'Песня'},
  {artist:'Певица',title:'Песня'}),false);
const php=spawnSync('php',['.github/test-catalog-2026.php'],{encoding:'utf8'});
if (php.error?.code==='ENOENT'){
  console.log('PHP unavailable here; PHP fixtures run in Deploy workflow');
}else{
  assert.equal(php.status,0,php.stderr||php.stdout);
  assert.match(php.stdout,/CATALOG_2026_SOURCES_RELEASE_DATES_URL_SECURITY_OK/);
}
console.log('CATALOG_2026_EDITORIAL_LOOKUP_STRICT_PLAYABILITY_OK');
