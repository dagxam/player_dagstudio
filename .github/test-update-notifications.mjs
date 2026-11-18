import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const js = read('script.js');
const html = read('index.php');
const css = read('studio-next.css');
const sw = read('sw.js');
const deploy = read('.github/workflows/deploy.yml');
const apkWorkflow = read('.github/workflows/build-android.yml');
const otaWorkflow = read('.github/workflows/build-web-update.yml');

const start = js.indexOf('function webCommitChanged(');
const end = js.indexOf('async function findAvailableAppUpdate(', start);
assert.ok(start > 0 && end > start, 'Pure version guards are available');
const ctx = {
  validOtaManifest: m => !!m?.version,
  compareOtaVersions: (a,b) => Number(a.split('.').at(-1)) - Number(b.split('.').at(-1))
};
runInNewContext(js.slice(start, end), ctx);
const a = 'a'.repeat(40), b = 'b'.repeat(40);
assert.equal(ctx.webCommitChanged(a, a), false, 'No prompt on same web commit');
assert.equal(ctx.webCommitChanged(a, b), true, 'Prompt on a newly deployed web commit');
assert.equal(ctx.webCommitChanged('dev', b), false, 'Unstamped HTML should not show a false update');
const meta = {version:'1000.0.20',commit:b};
assert.equal(ctx.nativeOtaChanged('1000.0.19', a, meta), true, 'Newer OTA bundle offered');
assert.equal(ctx.nativeOtaChanged('1000.0.20', a, meta), false, 'Installed OTA not reoffered');
assert.equal(ctx.nativeOtaChanged('1000.0.21', a, meta), false, 'No OTA downgrade');
assert.equal(ctx.nativeOtaChanged('', b, meta), false, 'APK with matching commit is current');
assert.equal(ctx.nativeOtaChanged('', a, meta), true, 'Older built-in bundle offered OTA');

for(const id of ['app-update-modal','app-update-title','app-update-apply-btn',
                 'app-update-available-message','app-update-available-version']) {
  assert.ok(html.includes('id="' + id + '"'), 'Missing dialog element ' + id);
}
assert.match(html, /name="dag-build-commit" content="__DAG_BUILD_COMMIT__"/);
assert.match(css, /#app-update-modal\.show/);
assert.match(js, /async function offerNativeUpdateOnLaunch\(/);
assert.match(js, /\.register\('\/sw\.js\?v=2359'/,
 'Service Worker must request current update shell');
assert.match(js, /setTimeout\(\(\) => offerNativeUpdateOnLaunch\(true\)/,
 'Check for updates soon after startup');
assert.match(js, /sessionStorage\.setItem\(DAG_UPDATE_DISMISS_KEY, offeredUpdate\.key\)/,
 'Dismiss only for the current session, reoffer on a later launch');
assert.match(js, /if \(update\) presentAvailableAppUpdate\(update\)/,
 'Never prompt without a real new version');
assert.match(js, /function findAvailableAppUpdate\(/);
assert.match(js, /installer\.check\(\)/);
assert.match(js, /await installer\.install\(\)/);
assert.match(js, /await checkNativeLiveUpdate\(true, true\)/);
assert.match(js, /DAG_UPDATE_DISMISS_KEY/);
assert.match(js, /window\.manualUpdateApplication\(\)/);
assert.match(js, /window\.addEventListener\('online'/);
assert.doesNotMatch(js, /sessionStorage\.setItem\('dag_sw_reloaded_/,
  'No automatic audio-interrupting SW reload');
assert.match(sw, /url\.pathname === '\/deploy-version\.txt'\) return/);
assert.match(deploy, /Missing deployment build identity/);
assert.match(deploy, /deploy-version\.txt/);
assert.match(apkWorkflow, /node \.github\/test-update-notifications\.mjs/);
assert.match(otaWorkflow, /node \.github\/test-update-notifications\.mjs/);
console.log('UPDATE_PROMPTS_WEB_PWA_APK_OTA_NO_AUTOPLAY_INTERRUPTION_OK');
