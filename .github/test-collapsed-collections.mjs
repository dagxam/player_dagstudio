import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const css=read('studio-vision.css'),vision=read('studio-vision.js');
const api=read('api.php'),html=read('index.php'),sw=read('sw.js');
const health=read('.github/workflows/music-sources-smoke.yml');
const last=css.indexOf('DAGSTUDIO / compact rail + curated card stability');
assert.ok(last>0,'Collapsed sidebar override must be last');
const fix=css.slice(last);
for(const fragment of [
 'grid-template-columns:78px minmax(0,1fr)!important',
 'grid-template-columns:78px minmax(0,1fr) minmax(230px,31%)',
 '.showcase-nav-collapsed.showcase-wave-only',
 '.showcase-curations:not(.showcase-playlist-library) .showcase-curation-list',
 'repeat(auto-fill,minmax(180px,1fr))',
 '.showcase-card-art.art-mountains::before',
 '#queue-menu-btn{display:none!important}',
 '.vision-top-actions>.vision-top-icon:first-child{display:grid!important'
])assert.ok(fix.includes(fragment),'Missing compact UI safeguard: '+fragment);
assert.match(fix,/@media\(max-width:768px\)/);
assert.match(fix,/display:inline!important;font-size:\.86rem!important/);
assert.doesNotMatch(vision,/Очередь воспроизведения/,'Queue should not crowd header');
assert.ok(fix.includes('.track-actions .btn-list-action[aria-label="Добавить в очередь"]'),'Song queue icons must be hidden');
assert.match(html,/studio-vision\.css\?v=\d+/);
assert.match(html,/studio-vision\.js\?v=\d+/);
assert.match(sw,/dagstudio-player-shell-v\d+/);
const cssRevision = html.match(/studio-vision\.css\?v=(\d+)/)?.[1];
assert.ok(cssRevision && sw.includes("'/studio-vision.css?v="+cssRevision+"'"));
const jsRevision = html.match(/studio-vision\.js\?v=(\d+)/)?.[1];
assert.ok(jsRevision && sw.includes("'/studio-vision.js?v="+jsRevision+"'"));
for(const name of ['muzo','hitmoz'])
 assert.ok(api.includes("'"+name+"'"),'Search provider: '+name);
assert.match(api,/foreach \(\$urls as \$key => \$url\)/);
assert.match(api,/foreach \(\$order as \$source\)/);
assert.match(health,/Verify Muzofond and Hitmoz/);
assert.match(health,/SAMPLE_AUDIO_SOURCES/);
const stripped=css.replace(/\/\*[\s\S]*?\*\//g,'');
assert.equal((stripped.match(/\{/g)||[]).length,(stripped.match(/\}/g)||[]).length);
console.log('NARROW_SIDEBAR_COLLECTION_CARDS_QUEUE_HIDDEN_TWO_SOURCE_AUDIT_OK');
