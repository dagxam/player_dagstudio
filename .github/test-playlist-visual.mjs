import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const stage=read('studio-center.js');
const css=read('studio-vision.css'),html=read('index.php'),sw=read('sw.js');
const bridge=read('scripts/build-native-web.mjs');
const start=stage.indexOf('function playlistCountLabel(');
const end=stage.indexOf('\nfunction showTracks(',start);
assert.ok(start>0&&end>start,'Playlist-specific UI helper exists');
const actions=[];
const make=(tag,cls='',value)=>({
 tag,cls,textContent:value,children:[],listeners:{},attributes:{},
 append(...nodes){this.children.push(...nodes);},
 appendChild(node){this.children.push(node);return node;},
 setAttribute(key,value){this.attributes[key]=value;},
 addEventListener(type,listener){this.listeners[type]=listener;},
 remove(){this.removed=true;}
});
const ctx={
 make,
 playlistIconName:x=>x||'music',
 playlistCoverUrl:x=>x&&x.startsWith('images/playlist-covers/')?x:'',
 openPlaylist:pl=>actions.push(['open',pl.id]),
 openTrackManager:(id,name,type)=>actions.push(['edit',id,name,type]),
 console
};
runInNewContext(stage.slice(start,end)+'\nglobalThis.card=playlistCard;globalThis.label=playlistCountLabel;',ctx);
const tr=(n,a,b,c)=>ctx.label(n,a,b,c);
assert.equal(tr(1,'трек','трека','треков'),'1 трек');
assert.equal(tr(2,'трек','трека','треков'),'2 трека');
assert.equal(tr(5,'трек','трека','треков'),'5 треков');
assert.equal(tr(11,'трек','трека','треков'),'11 треков');
assert.equal(tr(21,'трек','трека','треков'),'21 трек');
const song={title:'Реальная песня',url:'https://example.org/track.mp3'};
const playlist={id:57,name:'В дорогу',type:'standard',icon:'route',cover:'images/playlist-covers/abc.webp',tracks:[song]};
const card=ctx.card(playlist);
assert.equal(card.tag,'article');
assert.equal(card.cls,'showcase-playlist-card');
assert.equal(card.children.length,2,'Open and edit controls stay separate');
const [open,edit]=card.children;
assert.equal(open.tag,'button');assert.equal(open.type,'button');
assert.equal(edit.tag,'button');assert.equal(edit.type,'button');
assert.match(open.attributes['aria-label'],/В дорогу/);
assert.match(edit.attributes['aria-label'],/Редактировать/);
assert.equal(open.children[0].children[1].tag,'img','Cover uses existing verified URL resolver');
assert.equal(open.children[0].children[1].src,playlist.cover);
assert.equal(open.children[1].children[0].textContent,playlist.name);
assert.equal(open.children[1].children[1].textContent,'1 трек');
open.listeners.click();
edit.listeners.click();
assert.deepEqual(actions,[['open',57],['edit',57,'В дорогу','standard']]);
const plain=ctx.card({id:58,name:'Без обложки',tracks:[]});
assert.equal(plain.children[0].children[0].children.filter(x=>x.tag==='img').length,0);
assert.equal(plain.children[0].children[1].children[1].textContent,'0 треков');
assert.match(stage,/gallery\.classList\.toggle\('showcase-playlist-library',mode==='playlists'\)/);
assert.match(stage,/actions\.append\(create,manage\);gallery\.appendChild\(actions\);[\s\S]*?gallery\.appendChild\(grid\)/);
assert.match(stage,/window\.studioCenterOpenPlaylist=function\(id\)/);
assert.match(stage,/function openPlaylist\(pl\)/);
assert.match(stage,/if\(typeof switchTab==='function'\)switchTab\(selected\.id\)/);
assert.match(stage,/openNewPlModal\(\)/);
assert.match(stage,/openManagePlaylists\(\)/);
assert.match(stage,/openTrackManager\(pl\.id,pl\.name,pl\.type\)/);
for(const selector of [
 '.showcase-playlist-library','.showcase-playlist-grid','.showcase-playlist-card',
 '.showcase-playlist-cover-image','.showcase-playlist-edit','.showcase-playlist-toolbar',
 '.showcase-playlist-empty','.playlist-editor-page','.playlist-editor-tracks',
 '#manage-pl-modal','#save-modal','#input-modal'
])assert.ok(css.includes(selector),'Missing responsive playlist style '+selector);
for(const breakpoint of ['@media(max-width:768px)','@media(max-width:370px)',
 '@media(min-width:769px) and (max-width:1199px)'])assert.ok(css.includes(breakpoint));
assert.match(html,/studio-vision\.css\?v=\d+/);
assert.match(html,/studio-center\.js\?v=7/);
assert.match(sw,/dagstudio-player-shell-v\d+/);
const cssRevision = html.match(/studio-vision\.css\?v=(\d+)/)?.[1];
assert.ok(cssRevision && sw.includes("'/studio-vision.css?v="+cssRevision+"'"));
assert.ok(sw.includes("'/studio-center.js?v=8'"));
assert.match(bridge,/copyFile\(join\(root, 'studio-center\.js'\)/);
assert.match(bridge,/copyFile\(join\(root, 'studio-vision\.css'\)/);
const clean=css.replace(/\/\*[\s\S]*?\*\//g,'');
assert.equal((clean.match(/\{/g)||[]).length,(clean.match(/\}/g)||[]).length);
console.log('PLAYLIST_CARDS_EDIT_CREATE_RESPONSIVE_EDITOR_AND_APP_ASSETS_OK');
