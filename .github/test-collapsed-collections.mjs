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
assert.match(html,/studio-vision\.css\?v=3/);
assert.match(html,/studio-vision\.js\?v=2/);
assert.match(sw,/dagstudio-player-shell-v2350/);
assert.ok(sw.includes("'/studio-vision.css?v=3'"));
assert.ok(sw.includes("'/studio-vision.js?v=2'"));
for(const name of ['audius','vk_mail','hitmoz','muzo','zvooq','muzvox','muzca'])
 assert.ok(api.includes("'"+name+"'"),'Search provider: '+name);
assert.match(api,/foreach \(\$urls as \$key => \$url\)/);
assert.match(api,/foreach \(\$order as \$source\)/);
assert.match(health,/LIVE_MATCHING_PROVIDERS/);
assert.match(health,/LIVE_MATCHING_SOURCE_NAMES/);
const stripped=css.replace(/\/\*[\s\S]*?\*\//g,'');
assert.equal((stripped.match(/\{/g)||[]).length,(stripped.match(/\}/g)||[]).length);
console.log('NARROW_SIDEBAR_COLLECTION_CARDS_QUEUE_HIDDEN_MULTI_SOURCE_AUDIT_OK');
