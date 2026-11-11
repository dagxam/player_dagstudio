import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(resolve(root, p), 'utf8');
const digest = p => createHash('sha256').update(readFileSync(resolve(root,p))).digest('hex');

assert.ok(existsSync(resolve(root, 'www/index.html')), 'Build www/ with npm run native:web first');
for (const resource of ['script.js','studio.js','studio-next.js','studio-center.js',
  'style.css','modern.css','studio.css','studio-next.css','studio-touch.css']) {
  assert.equal(digest(resource), digest('www/'+resource), 'APK/OTA differs from website: '+resource);
}
assert.equal(digest('native/native-audio-adapter.js'),digest('www/native-audio-adapter.js'));
const website = read('index.php');
const app = read('www/index.html');
const browserScript = read('script.js');
const otaScript = read('www/script.js');
const serviceWorker = read('sw.js');
const label = browserScript.match(/const WEB_BUILD_LABEL = '(\d+)'/)?.[1];
assert.ok(label, 'Missing web build label');
assert.equal(otaScript.match(/const WEB_BUILD_LABEL = '(\d+)'/)?.[1], label);
assert.ok(website.includes('script.js?v='+label));
assert.ok(serviceWorker.includes("'/script.js?v="+label+"'"), 'PWA precache version differs');
for (const id of ['studio-header-wave','studio-header-likes','btn-pl-select','quick-mixes-modal',
   'cache-dashboard-modal','track-title','track-artist']) {
  assert.ok(website.includes('id="'+id+'"'), 'Website UI missing '+id);
  assert.ok(app.includes('id="'+id+'"'), 'APK UI missing '+id);
}
assert.ok(!website.includes('id="studio-header-offline"'));
assert.ok(!app.includes('id="studio-header-offline"'));
assert.ok(app.includes('window.DAG_NATIVE_APP = true'));
assert.ok(app.includes("src = 'script.js'"), 'APK must load the same controller');
assert.ok(app.includes('native-bridge.js'));
console.log('WEB_APK_OTA_UI_AND_SCRIPT_PARITY_OK '+label);
