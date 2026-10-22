import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const center=readFileSync(new URL('../studio-center.js',import.meta.url),'utf8');
const player=readFileSync(new URL('../script.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.php',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const urls=[
 'https://zvuk-m.com/muzykalnye-premery',
 'https://zvuk-m.com/relizy',
 'https://kavkazmusic.tv/category/premery',
 'https://kavkazhit.com/'
];
for(const url of urls)assert.ok(center.includes(url),url);
assert.match(center,/caucasusCatalogues\.forEach/);
assert.match(center,/openCaucasusCatalogue/);
assert.match(center,/window\.DAG_NATIVE_BRIDGE\.openExternal/);
assert.match(center,/Встроенный поиск музыки работает отдельно/);
assert.match(player,/Эльмира Магомедова/);
assert.match(player,/Роза Мальсагова/);
assert.match(player,/Мадина Кайтмазова/);
assert.match(html,/studio-center\.js\?v=5/);
assert.match(sw,/studio-center\.js\?v=5/);
assert.match(player,/const WEB_BUILD_LABEL = '2317'/);
console.log('CAUCASUS_PUBLISHER_CATALOG_DISCOVERY_AND_SEARCH_SEEDS_OK');
