import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const source=read('openverse-provider.php');
const api=read('api.php'),proxy=read('proxy.php'),js=read('script.js');
assert.match(source,/function dagOpenverseTracks/);
assert.match(api,/api\.openverse\.org\/v1\/audio/);
assert.match(api,/dagOpenverseTracks\(\$openverseData\)/);
assert.match(proxy,/CURLOPT_FOLLOWLOCATION => \$source !== 'hitmos' && \$source !== 'openverse'/);
assert.match(js,/key:'openverse',label:'Openverse \(CC\)'/);
assert.match(js,/Wikimedia Commons/);
const item={
 title:'Caucasus folk test',creator:'Folk musician',
 category:'music',license:'by',
 license_url:'https://creativecommons.org/licenses/by/4.0/',
 url:'https://upload.wikimedia.org/wikipedia/commons/a/ab/folk.ogg',
 foreign_landing_url:'https://commons.wikimedia.org/wiki/File:folk.ogg'
};
const fixture={results:[item,{...item,license:'by-nc'},
 {...item,category:'sound_effect'}, {...item,license_url:'https://fake.example.com'},
 {...item,url:'https://upload.wikimedia.org.evil.example.com/fake.ogg'},
 {...item,url:'http://upload.wikimedia.org/wikipedia/commons/a/ab/folk.ogg'},
 {...item,url:'https://upload.wikimedia.org/wikipedia/commons/a/ab/file.html'}]};
const expr='require "openverse-provider.php";$input=json_decode(stream_get_contents(STDIN),true);echo json_encode(dagOpenverseTracks($input),JSON_UNESCAPED_UNICODE);';
const run=spawnSync('php',['-r',expr],{input:JSON.stringify(fixture),cwd:root,encoding:'utf8'});
assert.equal(run.status,0,run.stderr);
const tracks=JSON.parse(run.stdout);
assert.equal(tracks.length,1);
assert.equal(tracks[0].source,'[OPENVERSE]');
assert.equal(tracks[0].release_date,'');
assert.equal(tracks[0].license_url,item.license_url);
console.log('OPENVERSE_LICENSED_WIKIMEDIA_AUDIO_SEARCH_READY');
