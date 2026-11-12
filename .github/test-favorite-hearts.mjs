import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const src=readFileSync(new URL('../script.js',import.meta.url),'utf8');
const api=readFileSync(new URL('../api.php',import.meta.url),'utf8');
const db=readFileSync(new URL('../db.php',import.meta.url),'utf8');
const studio=readFileSync(new URL('../studio.js',import.meta.url),'utf8');
const between=(a,b)=>{
  const from=src.indexOf(a),to=src.indexOf(b,from+a.length);
  assert.ok(from>=0 && to>from,'Missing section: '+a);
  return src.slice(from,to);
};
assert.match(api,/elseif \(\$action === 'set_favorite'\)/);
assert.match(api,/\$pdo->beginTransaction\(\)/);
assert.match(api,/\$pdo->commit\(\)/);
assert.match(api,/\$pdo->rollBack\(\)/);
assert.match(db,/idx_playlists_one_favorites_per_user/);
assert.match(src,/onclick="event.stopPropagation\(\); toggleFavoriteTrack\(\$\{i\}\)"/);
assert.match(src,/onclick="event.stopPropagation\(\); openSaveModal\(\$\{i\}\)"/);
assert.match(src,/aria-pressed="\$\{isLiked\?'true':'false'\}"/);
assert.match(studio,/отмечено сердечком/);

const track={title:'Мама',artist:'Исполнитель',url:'https://example.org/song.mp3',thumb:''};
const regular={id:11,type:'standard',name:'Дорога',tracks:[track]};
const button={
  disabled:false,innerHTML:'',title:'',attributes:{},
  classList:{toggle(){}},
  setAttribute(k,v){this.attributes[k]=v;}
};
const calls=[];
let rendered=0;
const ctx={
  playlists:[regular],playlist:[track],searchPlaylistCache:[track],
  playbackPlaylist:[track],currentIndex:0,currentTab:'search',
  currentUser:'smoke-user',favoriteToggleInFlight:new Set(),
  normalizeTrackIdentity:v=>String(v||'').toLowerCase().trim(),
  tasteTrackId:t=>String(t?.artist||'').toLowerCase()+'|'+String(t?.title||'').toLowerCase(),
  canonicalTrackUrl:t=>String(t?.url||''),
  document:{
    getElementById:id=>id==='now-playing-heart'?button:null,
    querySelector:()=>null
  },
  window:{dispatchEvent:()=>{}},
  CustomEvent:class {constructor(type){this.type=type;}},
  renderPlaylist:()=>{rendered++;},
  showNotification:msg=>calls.push(['notification',msg]),
  saveOfflinePlaylistsSnapshot:()=>{},
  loadUserData:async ()=>true,
  tasteRecord:kind=>calls.push(['taste',kind]),
  tasteLoad:()=>({tracks:{},artists:{}}),tasteSave:()=>{},
  api:async (action,params)=>{
    assert.equal(action,'set_favorite');
    calls.push(['api',params.liked]);
    return {success:true,liked:params.liked,playlist_id:99,track_id:params.liked?301:null};
  }
};
runInNewContext(between('function favoritePlaylist(){','function tastePreferredArtists('),ctx);
runInNewContext(between('function updatePlayingHeart() {','function openMenu() {'),ctx);
assert.equal(ctx.isFavoriteTrack(track),false,'Ordinary playlist is not a favorite');
assert.equal(ctx.likedPlaylistTracks().length,0,'Likes are explicitly selected');
await ctx.savePlayingTrack();
assert.equal(ctx.isFavoriteTrack(track),true,'First heart tap likes');
assert.equal(ctx.likedPlaylistTracks().length,1);
assert.equal(ctx.playlists[0].type,'favorites');
assert.equal(ctx.playlists.find(p=>p.id===11).tracks.length,1,'Original playlist stays intact');
assert.equal(button.attributes['aria-pressed'],'true');
await ctx.window.toggleFavoriteTrack(0);
assert.equal(ctx.isFavoriteTrack(track),false,'Second heart tap unlikes');
assert.equal(ctx.likedPlaylistTracks().length,0);
assert.equal(ctx.playlists.find(p=>p.id===11).tracks.length,1,'Unheart never deletes a normal playlist entry');
assert.equal(button.attributes['aria-pressed'],'false');
assert.deepEqual(calls.filter(row=>row[0]==='api').map(row=>row[1]),[true,false]);
assert.ok(rendered>0);
ctx.currentTab='mix:wave';
const previous=rendered;
await ctx.savePlayingTrack();
assert.equal(rendered,previous,'Heart tap must not redraw full-screen Wave');
assert.equal(ctx.isFavoriteTrack(track),true);
const alternate={...track,url:'https://another.example.org/version.mp3'};
assert.equal(ctx.isFavoriteTrack(alternate),true,'Same artist and title from another provider is liked');
await ctx.setTrackFavorite(alternate,true);
assert.equal(calls.filter(row=>row[0]==='api').length,3,'Idempotent add does not duplicate');

const events=[];
const sync={
  playlists:[regular],currentTab:'mix:wave',playlist:[track],
  searchPlaylistCache:[track],
  window:{dispatchEvent:e=>events.push(e.type)},
  Event:class {constructor(type){this.type=type;}},
  CustomEvent:class {constructor(type){this.type=type;}},
  renderPlaylist:()=>events.push('render'),
  switchTab:()=>events.push('switch'),
  likedPlaylistTracks:()=>[track]
};
runInNewContext(between('function renderCurrentPlaylistFromAccountData() {','function hydrateCachedAccount('),sync);
sync.renderCurrentPlaylistFromAccountData();
assert.equal(sync.currentTab,'mix:wave');
assert.ok(!events.includes('switch')&&!events.includes('render'),
  'Refreshing library cannot interrupt Wave');
sync.currentTab='offline';sync.renderCurrentPlaylistFromAccountData();
assert.ok(!events.includes('switch'),'Offline screen remains unchanged');
sync.currentTab='studio-likes';sync.renderCurrentPlaylistFromAccountData();
assert.ok(events.includes('render'),'Likes refresh after sync');
console.log('FAVORITES_TOGGLE_ACCOUNT_AND_WAVE_NO_INTERRUPTION_OK');
