import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const js = readFileSync(new URL('../script.js', import.meta.url), 'utf8');
const showcase = readFileSync(new URL('../studio-next.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.php', import.meta.url), 'utf8');
const stylesheet = readFileSync(new URL('../studio-touch.css', import.meta.url), 'utf8');
const api = readFileSync(new URL('../api.php', import.meta.url), 'utf8');

function sourceBetween(source, start, end) {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first);
  assert(first >= 0 && last > first, `Missing ${start}`);
  return source.slice(first, last);
}

const getCoverUrl = sourceBetween(js, 'function playlistCoverUrl(value)', 'function renderPlaylistIconPicker(');
const getArtwork = sourceBetween(showcase, 'function trackArtworkSource(track)', 'let currentArtworkSource=');
const makeContext = native => ({
  IS_NATIVE_APP: native,
  appServerUrl: path => 'https://pl.dagstudio.ru' + path,
  URL,
  location: { origin: 'https://pl.dagstudio.ru' },
  document: { baseURI: 'https://pl.dagstudio.ru/' },
  playbackTab: 42,
  playlists: [{ id: 42, cover: 'images/playlist-covers/' + 'a'.repeat(32) + '.webp' }],
  placeholderArtwork: /^\/images\/(?:cover|faviconch)\.png$/i
});

for (const native of [false, true]) {
  const ctx = makeContext(native);
  runInNewContext(getCoverUrl + '\n' + getArtwork, ctx);
  const expected = (native ? 'https://pl.dagstudio.ru' : '') + '/images/playlist-covers/' + 'a'.repeat(32) + '.webp';
  assert.equal(ctx.playlistCoverUrl(ctx.playlists[0].cover), expected);
  assert.equal(ctx.trackArtworkSource({ thumb: 'https://example.com/song.jpg' }),
    'https://pl.dagstudio.ru/images/playlist-covers/' + 'a'.repeat(32) + '.webp');

  ctx.playbackTab = 'wave';
  assert.equal(ctx.trackArtworkSource({ thumb: 'https://example.com/song.jpg' }), 'https://example.com/song.jpg');
  assert.equal(ctx.trackArtworkSource({ thumb: '/images/cover.png' }), '');
  for (const bad of [
    'https://evil.example/image.jpg',
    'images/playlist-covers/../../etc/passwd',
    'images/playlist-covers/' + 'a'.repeat(32) + '.svg',
    'images/playlist-covers/' + 'a'.repeat(32) + '.png?fake=1'
  ]) assert.equal(ctx.playlistCoverUrl(bad), '');
}

assert.match(html, /<main id="track-manager-modal" class="playlist-editor-page"/);
assert.match(html, /id="tm-cover-file" accept="image\/jpeg,image\/png,image\/webp"/);
assert.match(html, /id="tab-search-btn"[^>]*aria-label="Поиск музыки"/);
assert.match(showcase, /classList\.toggle\('showcase-nav-collapsed'\)/);
assert.match(showcase, /touchAction\('Настройки','gear'/);
assert.match(stylesheet, /\.playlist-editor-page\.show\{display:block\}/);
assert.match(stylesheet, /#queue-modal \.queue-mini-btn/);
assert.match(api, /elseif \(\$action === 'update_playlist_cover'\)/);
assert.match(api, /WHERE id = \? AND user_id = \?/);
assert.match(api, /getimagesizefromstring\(\$bytes\)/);

console.log('Playlist cover URL security, preferred playback art, editor and touch UI tests passed.');
