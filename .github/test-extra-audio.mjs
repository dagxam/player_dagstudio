import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const api=read('api.php'),source=read('open-audio-providers.php');
const proxy=read('proxy.php'),js=read('script.js');
for(const expr of [/dagExtraMusicCommonsApi/,/dagExtraMusicArchiveApi/,
 /dagExtraMusicCommons\(/,/dagExtraMusicArchiveTracks\(/,
 /'commons' => '\[COMMONS\]'/,/'archive' => '\[ARCHIVE\]'/,/AUDIUS_API_KEY/])
 assert.match(api,expr);
assert.match(js,/key:'commons',label:'Wikimedia Commons'/);
assert.match(js,/key:'archive',label:'Internet Archive'/);
assert.match(js,/track\.source !== '\[COMMONS\]'/);
assert.match(js,/track\.source !== '\[ARCHIVE\]'/);
assert.match(source,/creativecommons\\\.org/);
assert.match(source,/CURLOPT_FOLLOWLOCATION=>false/);
assert.match(proxy,/dagArchiveRedirectAllowed/);
assert.match(proxy,/\$source === 'archive'/);
const php=spawnSync('php',['.github/test-extra-audio.php'],{encoding:'utf8'});
if(php.error?.code !== 'ENOENT'){
 assert.equal(php.status,0,php.stderr||php.stdout);
 assert.match(php.stdout,/EXTRA_AUDIO_COMMONS_ARCHIVE_LICENSE_TEST_OK/);
}
console.log('OPEN_MUSIC_COMMONS_ARCHIVE_UNIT_TESTS_OK');
