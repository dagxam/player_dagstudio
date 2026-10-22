/* DAGSTUDIO Showcase 2026 — interface only; existing audio is the source of truth. */
(function(){
'use strict';
const root=document.querySelector('.main-container'),right=document.getElementById('right-col-container');
const originalHeader=document.querySelector('.header-overlay'),player=document.querySelector('.left-col');
if(!root||!right||!originalHeader||!player||document.getElementById('studio-navigation'))return;
root.classList.add('studio-showcase');
const node=(tag,cls,value)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(value!==undefined)e.textContent=value;return e};
const createButton=(text,icon,fn,id,cls='')=>{
 const e=node('button','showcase-nav-btn '+cls);e.type='button';if(id)e.id=id;
 const i=node('i','fas fa-'+icon);i.setAttribute('aria-hidden','true');e.appendChild(i);e.appendChild(node('span','',text));
 e.addEventListener('click',()=>{
   fn();
   closeMobile();
 });return e;
};
const nav=node('aside','showcase-sidebar');nav.id='studio-navigation';nav.setAttribute('aria-label','Навигация DAGSTUDIO');
const logo=node('div','showcase-brand');
const brandIcon=node('img');brandIcon.src='images/cover.png';brandIcon.alt='';brandIcon.className='showcase-brand-icon';
logo.appendChild(brandIcon);
const brandText=node('div','showcase-brand-text');brandText.appendChild(node('strong','', 'DAGSTUDIO'));brandText.appendChild(node('small','', 'P L A Y E R'));logo.appendChild(brandText);nav.appendChild(logo);
const railToggle=node('button','showcase-rail-toggle');railToggle.type='button';
railToggle.title='Свернуть или развернуть меню';railToggle.setAttribute('aria-label',railToggle.title);
railToggle.appendChild(node('i','fas fa-angles-left'));logo.appendChild(railToggle);
try{if(localStorage.getItem('dag_sidebar_collapsed')==='1')root.classList.add('showcase-nav-collapsed');}catch(e){}
function syncRailToggle(){
 const collapsed=root.classList.contains('showcase-nav-collapsed');
 railToggle.setAttribute('aria-expanded',String(!collapsed));
 railToggle.querySelector('i').className=collapsed?'fas fa-angles-right':'fas fa-angles-left';
}
railToggle.addEventListener('click',()=>{
 root.classList.toggle('showcase-nav-collapsed');
 try{localStorage.setItem('dag_sidebar_collapsed',root.classList.contains('showcase-nav-collapsed')?'1':'0');}catch(e){}
 syncRailToggle();
});syncRailToggle();
const menu=node('nav','showcase-menu');const buttons=new Map();
const activate=key=>{
 menu.querySelectorAll('.showcase-nav-btn').forEach(b=>{const match=b.dataset.showcase===key;b.classList.toggle('active',match);
 if(match)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
};
const add=(key,label,icon,fn)=>{
 const b=createButton(label,icon,fn,'showcase-'+key);
 b.title=label;b.setAttribute('aria-label',label);
 b.dataset.showcase=key;buttons.set(key,b);menu.appendChild(b);return b;
};
let showingCollection=true;
function showCurated(){
 showingCollection=true;right.classList.add('showcase-curated');
 right.classList.remove('showcase-list');
 activate('wave');
}
function showList(key){
 showingCollection=false;
 // Switch away from favourites without losing the existing playing queue.
 if(key!=='likes'&&document.getElementById('studio-header-likes')?.classList.contains('active'))
  window.openStudioLikes?.();
 right.classList.remove('showcase-curated');
 right.classList.add('showcase-list');activate(key);
}
function closeMobile(){
 nav.classList.remove('open');
 document.getElementById('showcase-menu-toggle')?.setAttribute('aria-expanded','false');
}
add('search','Поиск','magnifying-glass',()=>{
 showList('search');if(typeof switchTab==='function')switchTab('search');
 document.getElementById('search-input')?.focus();
});
add('wave','Моя волна','wave-square',()=>{
 showList('wave');window.openStudioWave?.();activate('wave');
});
add('playlists','Плейлисты','music',()=>window.studioCenterRender?.('playlists'));
add('likes','Мне нравится','heart',()=>{
 showList('likes');
 const b=document.getElementById('studio-header-likes');
 if(b&&!b.classList.contains('active'))window.openStudioLikes?.();
});
add('offline','Офлайн','circle-down',()=>{
 showList('offline');window.openOfflineListening?.();
});
add('charts','Чарты','chart-simple',()=>window.studioCenterMix?.('charts'));
add('collections','Подборки','layer-group',()=>window.studioCenterRender?.('collections'));
add('equalizer','Эквалайзер','sliders',()=>{if(typeof openEqualizer==='function')openEqualizer();});
add('settings','Настройки','gear',()=>{if(typeof openMenu==='function')openMenu();window.studioSettingsPage?.();});
nav.appendChild(menu);
menu.addEventListener('click',event=>{
 const chosen=event.target.closest('.showcase-nav-btn');
 if(!chosen || chosen.id==='showcase-settings')return;
 const pane=document.getElementById('menu-modal');
 if(pane?.classList.contains('showcase-settings-page')){
   pane.classList.remove('showcase-settings-page','show');
   root.classList.remove('showcase-settings-open');
 }
});
const sidebarBottom=node('div','showcase-sidebar-bottom');
const roadHead=node('div','showcase-road-heading');
const roadIcon=node('span','showcase-road-icon');
roadIcon.appendChild(node('i','fas fa-route'));
const roadWords=node('div','showcase-road-words');
roadWords.appendChild(node('span','showcase-sidebar-kicker','МУЗЫКА В ДОРОГУ'));
roadWords.appendChild(node('strong','', 'Всегда с тобой'));
roadHead.append(roadIcon,roadWords);sidebarBottom.appendChild(roadHead);
sidebarBottom.appendChild(node('p','', 'Подготовьте песни к поездке без интернета.'));
const cacheBtn=node('button','showcase-cache-action');cacheBtn.type='button';
cacheBtn.appendChild(node('i','fas fa-cloud-arrow-down'));
cacheBtn.appendChild(node('span','', 'Подготовить музыку'));
cacheBtn.appendChild(node('i','fas fa-arrow-right'));
cacheBtn.addEventListener('click',()=>{closeMobile();if(typeof openCacheDashboard==='function')openCacheDashboard();});
sidebarBottom.appendChild(cacheBtn);nav.appendChild(sidebarBottom);
root.insertBefore(nav,root.firstChild);

// The middle panel is the ORIGINAL playlist/search pane with a curated cover.
// Opening a real list reveals the same DOM, controls and scroll/pagination.
const home=node('section','showcase-curations');home.id='studio-curations';
const heading=node('div','showcase-section-head');heading.appendChild(node('div','showcase-kicker','ПОДОБРАНО ДЛЯ ТЕБЯ'));heading.appendChild(node('h2','', 'Для тебя'));
home.appendChild(heading);
const choices=[
 {key:'caucasus',title:'Кавказское настроение',caption:'Музыка наших гор',icon:'mountain',art:'mountains'},
 {key:'wave',title:'В стиле артистов',caption:'Похожие песни и новые имена',icon:'star',art:'artist'},
 {key:'road',title:'В дорогу',caption:'Музыка долгого пути',icon:'route',art:'road'},
 {key:'russian',title:'Народные мотивы',caption:'Тёплое, близкое звучание',icon:'guitar',art:'folk'},
 {key:'retro',title:'Чувства и мысли',caption:'Знакомые мелодии и истории',icon:'heart',art:'retro'},
 {key:'hits',title:'Лучшие композиции',caption:'Хиты и новые открытия',icon:'bolt',art:'hits'}
];
const grid=node('div','showcase-curation-list');
function selectMix(key){
 // Caucasus first asks which republic to play; reveal its list only after selection.
 if(key==='caucasus'){
  document.querySelector('#quick-mixes [data-mix="caucasus"]')?.click();
  return;
 }
 showList(key==='wave'?'wave':'collections');
 if(key==='wave'){window.openStudioWave?.();return;}
 if(typeof startQuickMix==='function')startQuickMix(key);
}
// Covers the selections made inside the original mix and republic dialogs as well
// as cards in the central collection. Both use the same playlists and audio engine.
document.addEventListener('click',event=>{
 const source=event.target.closest?.('#quick-mixes .quick-mix-btn[data-mix]');
 if(source&&source.dataset.mix!=='caucasus')
  showList(source.dataset.mix==='wave'?'wave':'collections');
 if(event.target.closest?.('#caucasus-regions .caucasus-region-btn'))
  showList('collections');
},true);
choices.forEach((entry,i)=>{
 const card=node('button','showcase-curation-card');card.type='button';
 card.setAttribute('aria-label','Включить: '+entry.title);
 const picture=node('span','showcase-card-art art-'+entry.art);
 picture.appendChild(node('i','fas fa-'+entry.icon));
 const body=node('span','showcase-card-body');body.appendChild(node('strong','',entry.title));body.appendChild(node('small','',entry.caption));
 const play=node('span','showcase-card-play');play.appendChild(node('i','fas fa-play'));
 card.append(picture,body,play);card.addEventListener('click',()=>selectMix(entry.key));grid.appendChild(card);
});
home.appendChild(grid);
right.insertBefore(home,right.firstChild);
const openList=node('button','showcase-open-list','Показать список песен');
openList.type='button';openList.addEventListener('click',()=>showList('wave'));
const titleArt=node('div','showcase-hero-copy');
titleArt.appendChild(node('h1','', 'Моя волна'));
const visual=player.querySelector('.visual-container');if(visual)visual.appendChild(titleArt);
// The scenic artwork belongs to the player, not to an inert screenshot.
// Its decorative layers are styled by the active DAGSTUDIO color theme.
const vinyl=player.querySelector('#vinyl-view');
let albumArt=null;
if(vinyl){
 const landscape=node('img','showcase-sunset-art');landscape.src='images/studio-sunset.svg';
 landscape.alt='';landscape.setAttribute('aria-hidden','true');
 vinyl.insertBefore(landscape,vinyl.firstChild);
 albumArt=node('img','showcase-album-art');
 albumArt.alt='';albumArt.setAttribute('aria-hidden','true');
 albumArt.decoding='async';
 landscape.insertAdjacentElement('afterend',albumArt);
 vinyl.setAttribute('aria-label','Оформление текущей композиции');
}
const mini=node('div','showcase-hero-meta');
const now=node('span','showcase-current-label','СЕЙЧАС ИГРАЕТ');
const current=node('strong','', 'DAGSTUDIO PLAYER');
mini.append(now,current);
const trackInfo=player.querySelector('.track-info-display');
if(trackInfo)player.insertBefore(mini,trackInfo);
const collection=node('div','showcase-track-collection','Музыка для тебя');
if(trackInfo)trackInfo.insertAdjacentElement('afterend',collection);
const listToggle=node('button','showcase-list-toggle');
listToggle.type='button';listToggle.setAttribute('aria-haspopup','dialog');listToggle.setAttribute('aria-controls','queue-modal');
listToggle.appendChild(node('i','fas fa-list-ol'));listToggle.appendChild(node('span','', 'Открыть очередь'));
const queueCount=node('span','showcase-queue-pill');queueCount.id='showcase-queue-count';listToggle.appendChild(queueCount);
listToggle.addEventListener('click',()=>{if(typeof openPlaybackQueue==='function')openPlaybackQueue();});
player.appendChild(listToggle);
if(typeof updatePlaybackQueueBadge==='function')updatePlaybackQueueBadge();
const mobileTools=node('div','showcase-mobile-tools');mobileTools.setAttribute('aria-label','Быстрые действия');
const mobileTopbar=node('div','showcase-mobile-topbar');
mobileTopbar.setAttribute('aria-hidden','true');
root.appendChild(mobileTopbar);
const touchAction=(label,icon,fn)=>{
 const b=node('button','showcase-mobile-action');b.type='button';b.title=label;b.setAttribute('aria-label',label);
 b.appendChild(node('i','fas fa-'+icon));b.addEventListener('click',fn);mobileTools.appendChild(b);
};
touchAction('Поиск музыки','magnifying-glass',()=>{
 showList('search');if(typeof switchTab==='function')switchTab('search');
 document.getElementById('search-input')?.focus();
});
touchAction('Подборки','layer-group',()=>window.studioCenterRender?.('collections'));
touchAction('Настройки','gear',()=>{if(typeof openMenu==='function')openMenu();window.studioSettingsPage?.();});
root.appendChild(mobileTools);
const mobileToggle=node('button','showcase-mobile-toggle');mobileToggle.id='showcase-menu-toggle';
mobileToggle.type='button';mobileToggle.setAttribute('aria-label','Открыть навигацию');mobileToggle.setAttribute('aria-expanded','false');
mobileToggle.appendChild(node('i','fas fa-bars'));
mobileToggle.addEventListener('click',()=>{
 const open=!nav.classList.contains('open');
 nav.classList.toggle('open',open);
 mobileToggle.setAttribute('aria-expanded',String(open));
});
root.appendChild(mobileToggle);
const shade=node('div','showcase-mobile-shade');shade.addEventListener('click',closeMobile);root.appendChild(shade);
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMobile();});
// A provider may supply real cover art, or just our default DAGSTUDIO logo.
// Never replace the mountain illustration with a placeholder or broken image.
const placeholderArtwork=/^\/images\/(?:cover|faviconch|icon(?:-192)?|r|f|s|z)\.png$/i;
function trackArtworkSource(track){
 const tab=String(typeof playbackTab==='undefined'?'':playbackTab);
 let playlistCover='';
 try{playlistCover=playlistCoverUrl((playlists||[]).find(pl=>String(pl.id)===tab)?.cover);}catch(e){}
 const raw=String(playlistCover||track?.thumb||'').trim();
 if(!raw)return '';
 try{
  const url=new URL(raw,document.baseURI);
  if(url.protocol!=='https:'&&url.protocol!=='http:')return '';
  if(url.origin===location.origin&&placeholderArtwork.test(url.pathname))return '';
  return url.href;
 }catch(error){return '';}
}
let currentArtworkSource=null,artworkRevision=0;
function refreshAlbumArt(track){
 if(!albumArt)return;
 const source=trackArtworkSource(track);
 if(source===currentArtworkSource)return;
 currentArtworkSource=source;
 const revision=++artworkRevision;
 root.classList.remove('showcase-has-cover');
 albumArt.onload=null;albumArt.onerror=null;
 albumArt.removeAttribute('src');
 if(!source)return;
 albumArt.onload=()=>{
  if(revision===artworkRevision&&albumArt.naturalWidth>0)
   root.classList.add('showcase-has-cover');
 };
 albumArt.onerror=()=>{
  if(revision===artworkRevision)root.classList.remove('showcase-has-cover');
 };
 albumArt.src=source;
}
function refreshShowcase(){
 let name='brown';try{name=localStorage.getItem('dag_theme')||'brown';}catch(e){}
 const img=typeof colorThemes!=='undefined'?colorThemes[name]?.img:null;
 if(img&&brandIcon.getAttribute('src')!==img)brandIcon.src=img;
 root.dataset.showcaseTint=name;
 // Do not infer playback from DOM text alone: playbackPlaylist is authoritative,
 // including a paused or cached track and native Media3 on a car head unit.
 let track=null;
 try{track=playbackPlaylist[currentIndex]||null;}catch(e){}
 const hasTrack=Boolean(track?.url);
 root.classList.toggle('showcase-has-track',hasTrack);
 refreshAlbumArt(hasTrack?track:null);
 const title=document.getElementById('track-title')?.textContent?.trim()||'';
 current.textContent=hasTrack?'ИГРАЕТ СЕЙЧАС':'Ваша музыка';
 if(hasTrack){
  const tab=String(typeof playbackTab==='undefined'?'':playbackTab);
  const selected=tab.startsWith('mix:')?tab.slice(4):tab;
  const labels={caucasus:'Кавказское настроение',wave:'Моя волна',
   road:'В дорогу',russian:'Русские песни',retro:'Ретро',
   hits:'Лучшие композиции',offline:'Офлайн-музыка',
   'studio-likes':'Мне нравится'};
  const prefix=track?.genre?String(track.genre):labels[selected]||'Музыка для тебя';
  collection.textContent=prefix;
 }else{collection.textContent='Персональная музыка DAGSTUDIO';}
 // The prominent wave invitation is shown only before a track is selected.
 titleArt.setAttribute('aria-hidden',String(hasTrack));
 const button=document.getElementById('vinyl-wave-play');
 if(button)button.hidden=hasTrack;
}
const trackTitle=document.getElementById('track-title');
let observer=null;
if(trackTitle){
 observer=new MutationObserver(refreshShowcase);
 observer.observe(trackTitle,{characterData:true,childList:true,subtree:true});
}
const refresh=setInterval(()=>{if(!document.hidden)refreshShowcase();},1200);
window.addEventListener('dag-artwork-updated',refreshShowcase);
window.addEventListener('pagehide',()=>{clearInterval(refresh);observer?.disconnect();},{once:true});
refreshShowcase();showCurated();
// All originals remain reachable via user controls; only their topbar is
// visually hidden on wide screens and retained under the mobile fallback.
document.getElementById('search-input')?.addEventListener('focus',()=>showList('search'));
window.studioShowCurated=showCurated;window.studioShowList=showList;
// Release the boot overlay only after the real three-column navigation exists.
window.dispatchEvent(new Event('dag-ui-ready'));
})();
