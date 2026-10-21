import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const script = readFileSync(new URL('../script.js', import.meta.url), 'utf8');
const native = readFileSync(new URL('../scripts/build-native-web.mjs', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('./workflows/build-web-update.yml', import.meta.url), 'utf8');
const start = script.indexOf('function trustedOtaDownloadUrl(');
const end = script.indexOf('\nasync function getNativeAppInfoSafe(', start);
assert.ok(start > 0 && end > start, 'Trusted OTA helpers must exist');

const github = 'https://github.com/dagxam/player_dagstudio/releases/download/android-web/DAGSTUDIO-PLAYER-web.zip';
const main = 'https://pl.dagstudio.ru/ota/DAGSTUDIO-PLAYER-web-1000.0.155.zip';
const meta = {version:'1000.0.155',url:main,fallback_url:github,checksum:'c'.repeat(64)};
let requested = [];
let mode = 'site-ok';
const windowContext = {
    NATIVE_UPDATE_META_URL:'https://pl.dagstudio.ru/ota-bridge.php',
    NATIVE_UPDATE_BACKUP_META_URL:'https://github.com/dagxam/player_dagstudio/releases/download/android-web/DAGSTUDIO-PLAYER-web-version.json',
    fetchUpdateJson:async url => {
        requested.push(url);
        if (mode === 'site-failed' && url.includes('pl.dagstudio.ru')) throw Error('HTTP 503');
        return meta;
    },
    setManualUpdateButtonState:()=>{},
    console,Number,String,Array,Error
};
runInNewContext(script.slice(start,end),windowContext);
assert.equal(windowContext.trustedOtaDownloadUrl(main),true);
assert.equal(windowContext.trustedOtaDownloadUrl(github),true);
assert.equal(windowContext.trustedOtaDownloadUrl('https://other.example/evil.zip'),false);
assert.equal(windowContext.validOtaManifest(meta),true);
assert.equal(windowContext.validOtaManifest({...meta,checksum:'bad'}),false);
assert.equal(windowContext.validOtaManifest({...meta,url:'http://pl.dagstudio.ru/ota/evil.zip'}),false);
assert.equal(windowContext.validOtaManifest({...meta,fallback_url:'https://other.example/bad.zip'}),false);
assert.equal((await windowContext.fetchOtaManifest()).url,main);
assert.equal(requested.length,1,'primary domain must be tried first');

mode='site-failed';requested=[];
assert.equal((await windowContext.fetchOtaManifest()).url,main);
assert.equal(requested.length,2,'fall back to GitHub metadata when site is down');

const downloadAttempts=[];
const bundle=await windowContext.downloadOtaBundle({
    download:async options => {
        downloadAttempts.push(options);
        if(options.url===main)throw Error('connection timeout');
        return {id:'bundle-123'};
    }
},meta);
assert.equal(bundle.id,'bundle-123');
assert.equal(downloadAttempts.length,2);
assert.equal(downloadAttempts[0].checksum,meta.checksum);
assert.equal(downloadAttempts[1].url,github);
assert.ok(script.includes('window.DAG_NATIVE_BUILD_COMMIT'));
assert.ok(native.includes('window.DAG_NATIVE_BUILD_COMMIT'));
assert.ok(script.includes("https://pl.dagstudio.ru/ota-bridge.php"));
assert.ok(workflow.includes('ota-publish/DAGSTUDIO-PLAYER-web-version.json'));
assert.ok(workflow.includes('Verify primary OTA manifest and ZIP from public URL'));
assert.ok(workflow.includes('server-dir: /www/pl.dagstudio.ru/ota/'));
console.log('OTA_PRIMARY_FALLBACK_CHECKSUM_AND_BUILD_GUARDS_OK');
