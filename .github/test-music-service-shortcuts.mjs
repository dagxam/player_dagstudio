import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const nav=read('studio-next.js');
const css=read('studio-sidebar-modern.css');
const html=read('index.php');
const sw=read('sw.js');
const script=read('script.js');
for(const [label,href] of [
  ['Яндекс Музыка','https://music.yandex.ru/'],
  ['YouTube Music','https://music.youtube.com/']
]){
  assert.ok(nav.includes("'"+label+"'"),label+' missing from sidebar');
  assert.ok(nav.includes("'"+href+"'"),'Official destination missing: '+href);
}
assert.match(nav,/link\.target='_blank'/);
assert.match(nav,/link\.rel='noopener noreferrer'/);
assert.match(nav,/window\.DAG_NATIVE_BRIDGE\?\.openExternal/);
assert.match(nav,/link\.href=url/);
assert.match(nav,/showcase-external-service/);
assert.match(css,/showcase-service-heading/);
assert.match(html,/studio-next\.js\?v=21/);
assert.match(html,/studio-sidebar-modern\.css\?v=8/);
assert.match(html,/script\.js\?v=2380/);
assert.match(sw,/dagstudio-player-shell-v2397/);
assert.match(sw,/script\.js\?v=2380/);
assert.match(script,/WEB_BUILD_LABEL = '2380'/);
assert.doesNotMatch(nav,/youtube-dl|yt-dlp|extractor|youtube[_-]proxy/i);
console.log('OFFICIAL_YANDEX_AND_YOUTUBE_MUSIC_SIDEBAR_LINKS_OK');
