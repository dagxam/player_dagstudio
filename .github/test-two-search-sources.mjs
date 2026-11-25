import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const api = read('api.php');
const js = read('script.js');
const html = read('index.php');
const css = read('search-polish.css');
const sw = read('sw.js');

const begin = api.indexOf("elseif ($action === 'search_global')");
const end = api.indexOf("\nelse {", begin);
assert.ok(begin >= 0 && end > begin, 'The unified search endpoint must exist');
const search = api.slice(begin, end);
const sources = /\$urls\s*=\s*\[([\s\S]*?)\];/.exec(search)?.[1];
assert.ok(sources, 'Unified search source list must exist');
assert.deepEqual([...sources.matchAll(/'([a-z_]+)'\s*=>/g)].map(m => m[1]),
  ['muzo', 'hitmoz'], 'No third music provider may receive a query');
assert.match(sources, /muzofond\.fm\/search\//);
assert.match(sources, /ru\.hitmoz\.org\/search\?q=/);

const grouped = /\$by_source\s*=\s*\[([\s\S]*?)\];/.exec(search)?.[1];
assert.ok(grouped, 'Source result groups must exist');
assert.deepEqual([...grouped.matchAll(/'\[([A-Z]+)\]'\s*=>/g)].map(m=>m[1]),
  ['MUZOFOND', 'HITMOZ'], 'Only the approved providers may reach results');
assert.match(search, /\$order = \['\[MUZOFOND\]', '\[HITMOZ\]'\]/);
assert.match(search, /'muzo' => '\[MUZOFOND\]'/);
assert.match(search, /'hitmoz' => '\[HITMOZ\]'/);
assert.match(search, /'matching_tracks'/);
assert.match(search, /'audio_verified' => false/);
assert.match(search, /'search_complete'/);
for (const legacy of ['audius','jamendo','partner','hitmos','commons','archive',
    'openverse','zvooq','vk_mail','muzvox','muzca'])
  assert.doesNotMatch(search, new RegExp("['\\\"]" + legacy + "['\\\"]"),
    'Unexpected active provider: ' + legacy);

const diagnostic = /const knownSources\s*=\s*\{([\s\S]*?)\};/.exec(js)?.[1];
assert.ok(diagnostic);
assert.deepEqual([...diagnostic.matchAll(/([a-z]+):\{label:/g)].map(m=>m[1]),
  ['muzo','hitmoz'], 'The diagnostics should show only two sources');
assert.match(js, /\['MUZOFOND'\]/);
assert.match(js, /\['HITMOZ'\]/);
assert.match(css, /\.dag-search-card/);
assert.match(html, /search-polish\.css\?v=/);
assert.match(html, /Только Muzofond и Hitmoz/);
assert.match(sw, /search-polish\.css\?v=/);
console.log('UNIFIED_SEARCH_MUZOFOND_HITMOZ_ONLY_AND_CARDS_OK');
