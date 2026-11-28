import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const js=read('script.js'),html=read('index.php'),sw=read('sw.js');
const start=js.indexOf('async function findAvailableAppUpdate()');
const end=js.indexOf('\nfunction presentAvailableAppUpdate(',start);
assert.ok(start>=0&&end>start);
const auto=js.slice(start,end);
assert.ok(auto.indexOf("kind: 'ota'") < auto.indexOf("kind: 'apk'"),
  'Check web OTA before native APK');
const begin=js.indexOf('window.manualUpdateApplication = async function()');
const finish=js.indexOf('\n// Use the device',begin);
assert.ok(begin>=0&&finish>begin);
const manual=js.slice(begin,finish);
assert.ok(manual.indexOf('const otaResult = await checkNativeLiveUpdate(true, true)') <
  manual.indexOf('const installer = window.DAG_NATIVE_BRIDGE?.apkInstaller'),
  'Try OTA before Android installer');
assert.match(manual,/if \(otaResult\.status === 'updated'\) return/);
assert.match(manual,/const result = otaResult/);
assert.doesNotMatch(manual,/const result = await checkNativeLiveUpdate\(true, true\)/);
assert.match(js,/if \(!manual\) return \{ status: 'manual-only' \}/);
assert.match(html,/script\.js\?v=2391/);
assert.match(sw,/dagstudio-player-shell-v2408/);
assert.match(js,/WEB_BUILD_LABEL = '2391'/);
assert.match(js,/\.register\('\/sw\.js\?v=2408'/);
console.log('ANDROID_OTA_FIRST_APK_FALLBACK_PRESERVE_AUDIO_OK');
