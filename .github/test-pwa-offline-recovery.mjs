import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const sw = read('sw.js');
const app = read('script.js');

const updateStart = app.indexOf('window.manualUpdateApplication = async function()');
const updateEnd = app.indexOf('let serviceWorkerRegistrationPromise', updateStart);
assert.ok(updateStart >= 0 && updateEnd > updateStart);
const manualUpdate = app.slice(updateStart, updateEnd);
assert.doesNotMatch(manualUpdate, /caches\.delete\(|shellKeys|dagstudio-player-shell-/,
  'Manual update must not delete the only working offline copy before reload');

const listeners = {};
const storage = new Map();
const origin = 'https://pl.dagstudio.ru';
const shell = version => '<!doctype html><html><button id="app-update-btn">Обновить</button>' +
  '<script src="script.js?v=' + version + '" defer></script></html>';
const ctx = {
  self: {
    location: { origin },
    addEventListener: (event, callback) => { listeners[event] = callback; }
  },
  caches: {
    match: async key => storage.get(String(key))?.clone(),
    open: async () => ({
      put: async (key, response) => { storage.set(String(key), response.clone()); },
      match: async key => storage.get(String(key))?.clone()
    })
  },
  Response, URL, console,
  setTimeout: (callback, ms) => setTimeout(callback, Math.min(ms, 15)),
  fetch: async () => { throw new Error('offline'); }
};
runInNewContext(sw, ctx);
assert.equal(typeof listeners.fetch, 'function');
assert.equal(ctx.isPlayerShellHtml(shell('2400-deadbeefcafe')), true,
  'Old service worker must accept legitimate HTML from a newer deployment');
assert.equal(ctx.isPlayerShellHtml('<h1>Service Unavailable</h1>'), false,
  'Do not cache a server error as application HTML');
assert.equal(ctx.isPlayerShellHtml(shell('invalid')), false);
const navigate = async () => {
  let handled;
  listeners.fetch({
    request: {
      url: origin + '/?source=pwa', method: 'GET', mode: 'navigate',
      destination: 'document', headers: { has: () => false }
    },
    respondWith: promise => { handled = promise; },
    waitUntil: () => {}
  });
  assert.ok(handled, 'Navigation must be handled');
  return handled;
};

storage.set('/', new Response(shell('2360'), { status: 200 }));
let response = await navigate();
assert.equal(response.status, 200, 'Offline must use cached root if index.php is absent');
assert.match(await response.text(), /script\.js\?v=2360/);

storage.clear();
ctx.fetch = async () => new Response(shell('2400-deadbeefcafe'), { status: 200 });
response = await navigate();
assert.equal(response.status, 200, 'New release HTML must be accepted by old worker');
assert.ok(storage.has('/index.php') && storage.has('/'),
  'Successful navigation must preserve both offline entrypoints');

storage.clear();
ctx.fetch = async () => { throw new Error('DNS'); };
response = await navigate();
assert.equal(response.status, 503, 'No saved shell and offline remains an actual error');
assert.match(await response.text(), /Повторить/);
console.log('PWA_OFFLINE_SHELL_PRESERVATION_DNS_RECOVERY_AND_NEXT_RELEASE_OK');
