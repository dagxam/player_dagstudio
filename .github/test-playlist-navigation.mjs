import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const src=readFileSync(new URL('../script.js',import.meta.url),'utf8');
const stage=readFileSync(new URL('../studio-center.js',import.meta.url),'utf8');
const shell=readFileSync(new URL('../studio-next.js',import.meta.url),'utf8');
const engine=readFileSync(new URL('../native/android/DAGAudioEngine.java',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.php',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');

const get=(a,b)=>{const start=src.indexOf(a);const end=src.indexOf(b,start+a.length);assert.ok(start>0&&end>start,a);return src.slice(start,end);};
const element=(tag='div')=>({
  tag,attributes:{},children:[],handlers:{},style:{},
  classList:{values:new Set(),add(v){this.values.add(v)},remove(v){this.values.delete(v)}},
  setAttribute(k,v){this.attributes[k]=v},
  append(...children){this.children.push(...children)},
  appendChild(child){this.children.push(child)},
  replaceChildren(){this.children=[]},
  addEventListener(k,handler){this.handlers[k]=handler}
});
const track={id:100,title:'Мама',artist:'A',url:'https://example.org/song.mp3'};
const playlists=[{id:51,name:'Дорога',tracks:[track]},{id:52,name:'Пустой',tracks:[]}];
const list=element(),modal=element(),opened=[],added=[],played=[];
const ctx={
  currentUser:'test',currentTab:51,playlists,
  document:{createElement:element,getElementById:id=>id==='playlist-select-list'?list:id==='save-modal'?modal:null},
  window:{studioCenterOpenPlaylist:id=>opened.push(id)},
  closeModal:id=>opened.push('close:'+id),
  showNotification:()=>{},switchTab:id=>opened.push('switch:'+id),
  playTrack:index=>played.push(index),addToPlaylist:id=>added.push(id)
};
runInNewContext(get('function openPlaylistSelect(isSaving = false) {','function updatePlayingHeart() {'),ctx);
ctx.openPlaylistSelect(false);
assert.equal(list.children.length,2);
assert.equal(list.children[0].tag,'button','Native buttons support keyboard and touch');
assert.equal(list.children[0].type,'button');
assert.equal(list.children[0].attributes['aria-current'],'true');
assert.ok(list.children[0].children[1].textContent==='1 песен');
list.children[1].handlers.click();
assert.deepEqual(opened,['close:save-modal',52],'Opening the empty playlist displays it without auto-playing');
assert.equal(played.length,0,'Playlist selection must not play the first song unexpectedly');
assert.equal(added.length,0,'Playlist selection must not add a song');
ctx.openPlaylistSelect(true);
list.children[0].handlers.click();
assert.deepEqual(added,[51],'Save-to-playlist behavior remains separate');
assert.equal(played.length,0);
assert.match(stage,/window\.studioCenterOpenPlaylist=function\(id\)/);
assert.match(stage,/String\(item\.id\)===String\(id\)/);
assert.match(shell,/function showCurated\(\)\{[\s\S]*?window\.openStudioLikes\?\.\(\)/);

const tabElements={
  'tab-search-btn':element('button'),
  'btn-pl-select':element('button'),
  'active-tab-name':element(),
  'search-container-box':Object.assign(element(),{parentElement:{classList:{contains:()=>true}}})
};
const nav={
  currentTab:'search',playlists,playlist:[],searchPlaylistCache:[],
  quickMixCurrent:null,quickMixRequestId:0,
  document:{getElementById:id=>tabElements[id]||null},
  renderPlaylist:()=>{},renderQuickMixView:()=>{},
  renderQuickMixButtons:()=>{}
};
runInNewContext(get('function switchTab(id) {','// --- RENDER PLAYLIST'),nav);
nav.switchTab('51');
assert.equal(nav.playlist.length,1,'Select numeric playlist id given as string');
assert.equal(nav.playlist[0].title,'Мама');
assert.equal(tabElements['active-tab-name'].innerText,'ДОРОГА');
nav.switchTab('52');
assert.equal(nav.playlist.length,0,'Empty playlist must also be selectable');

assert.match(engine,/setBufferDurationsMsForStreaming\(35000, 180000, 1500, 4500\)/);
assert.match(src,/async function getStartupCachedAudio\(track, timeoutMs = 420\)/);
assert.match(src,/const cachedEntry = readNativeAudioIndex\(\)\[canonicalTrackUrl\(track\)\]/);
assert.match(src,/timeoutMs = cachedEntry\?\.path \? 800 : Math\.min\(timeoutMs, 220\)/);
assert.match(src,/if \(!NATIVE_MEDIA3_ACTIVE\) \{\s*mainAudio\.pause\(\);\s*mainAudio\.removeAttribute\('src'\)/);
assert.match(html,/script\.js\?v=2334/);
assert.match(sw,/script\.js\?v=2334/);
const sidebarEntries=[...shell.matchAll(/^add\('([^']+)','([^']+)'/gm)]
  .map(([,key,label])=>[key,label]);
assert.deepEqual(sidebarEntries,[
  ['wave','Моя волна'],['playlists','Плейлисты'],
  ['likes','Мне нравится'],['offline','Офлайн'],
  ['collections','Подборки'],['settings','Настройки']
], 'Sidebar must contain exactly six sections in the requested order');
assert.doesNotMatch(shell,/const sidebarBottom=/,
  'No additional promo/actions should appear beneath the navigation');
console.log('PLAYLIST_PICKER_NO_AUTOPLAY_STABLE_ID_LIKES_AND_FAST_MEDIA3_START_OK');
