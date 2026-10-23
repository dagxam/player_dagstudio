import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const load=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const php=load('api.php'), proxy=load('proxy.php');
const official=load('music-official.php'), js=load('script.js'), center=load('studio-center.js');
const html=load('index.php'), sw=load('sw.js');
assert.match(php,/official_audius_feed/);
assert.match(php,/require __DIR__ \. '\/music-official\.php'/);
assert.match(php,/discoveryprovider\.audius\.co/);
assert.match(php,/audius_secondary/);
assert.match(php,/JAMENDO_CLIENT_ID/);
assert.match(php,/jamendo_enabled/);
assert.match(php,/storage\.jamendo\.com/);
assert.match(php,/isset\(\$info\['port'\]\)/);
assert.match(php,/'\[JAMENDO\]' => \[\]/);
assert.match(official,/\/v1\/tracks\/latest/);
assert.match(official,/\/v1\/tracks\/trending/);
assert.match(official,/is_stream_gated/);
assert.match(official,/is_scheduled_release/);
assert.match(official,/CURLOPT_SSL_VERIFYPEER => true/);
assert.match(official,/CURLOPT_SSL_VERIFYHOST => 2/);
assert.match(proxy,/'storage\.jamendo\.com'/);
assert.match(proxy,/'discoveryprovider\.audius\.co'/);
assert.match(js,/window\.browseOfficialAudius = async function/);
assert.match(js,/startQuickMix\(mode==='latest'\?'charts':'hits'\)/);
assert.match(js,/переключаемся на резервные источники/);
assert.match(js,/official_audius_feed/);
assert.match(js,/t\.source !== '\[JAMENDO\]'/);
assert.match(js,/creativecommons\\.org/);
assert.match(center,/worldCatalogues/);
assert.match(center,/officialAudiusCards/);
assert.match(center,/openCaucasusCatalogue/);
for(const url of [
 'https://zvuk-m.com/category/novinki-muzykalnogo-izdatelstva',
 'https://zvuk-m.com/relizy',
 'https://kavkazmusic.tv/category/premery',
 'https://kavkazhit.com/',
 'https://www.jamendo.com/start',
 'https://soundcloud.com/discover',
 'https://musicbrainz.org/'
]) assert.ok(center.includes(url),url);
assert.match(html,/script\.js\?v=2319/);
assert.match(html,/studio-center\.js\?v=6/);
assert.match(sw,/script\.js\?v=2319/);
console.log('OFFICIAL_MUSIC_FEED_JAMENDO_OPT_IN_CATALOGS_CC_ATTRIBUTION_OK');
