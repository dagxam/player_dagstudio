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
const menu=node('nav','showcase-menu');const buttons=new Map();
const activate=key=>{
 menu.querySelectorAll('.showcase-nav-btn').forEach(b=>{const match=b.dataset.showcase===key;b.classList.toggle('active',match);
 if(match)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
};
const add=(key,label,icon,fn)=>{
 const b=createButton(label,icon,fn,'showcase-'+key);
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
add('settings','Настройки','gear',()=>{if(typeof openMenu==='function')openMenu();});
nav.appendChild(menu);
const sidebarBottom=node('div','showcase-sidebar-bottom');
sidebarBottom.appendChild(node('span','showcase-sidebar-kicker','В ДОРОГУ С МУЗЫКОЙ'));
sidebarBottom.appendChild(node('strong','', 'Всегда с тобой'));
sidebarBottom.appendChild(node('p','', 'Сохраняйте плейлисты заранее и слушайте без сети.'));
const cacheBtn=node('button','showcase-cache-action','Офлайн-настройки');cacheBtn.type='button';
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
titleArt.appendChild(node('span','showcase-hero-tag','DAGSTUDIO · ПЕРСОНАЛЬНОЕ РАДИО'));
titleArt.appendChild(node('h1','', 'Моя волна'));
titleArt.appendChild(node('div','showcase-audio-glyph','━━　▂▅▆▃▁　━━'));
titleArt.appendChild(node('p','', 'МУЗЫКА, КОТОРАЯ БЛИЖЕ К ТЕБЕ'));
const visual=player.querySelector('.visual-container');if(visual)visual.appendChild(titleArt);
// The scenic artwork belongs to the player, not to an inert screenshot.
// Its decorative layers are styled by the active DAGSTUDIO color theme.
const vinyl=player.querySelector('#vinyl-view');
if(vinyl){
 const landscape=node('img','showcase-sunset-art');landscape.src='images/studio-sunset.svg';
 landscape.alt='';landscape.setAttribute('aria-hidden','true');
 vinyl.insertBefore(landscape,vinyl.firstChild);
 vinyl.setAttribute('aria-label','Оформление текущей композиции');
}
if(visual){
 const ornaments=node('div','showcase-ornament-lines');
 ornaments.setAttribute('aria-hidden','true');
 ornaments.appendChild(node('span','showcase-ornament-left'));
 ornaments.appendChild(node('span','showcase-ornament-right'));
 visual.appendChild(ornaments);
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
listToggle.type='button';listToggle.appendChild(node('i','fas fa-list'));listToggle.appendChild(node('span','', 'Открыть очередь'));
listToggle.addEventListener('click',()=>{showList('wave');if(typeof quickMixCurrent!=='undefined'&&quickMixCurrent?.key)activate(quickMixCurrent.key==='wave'?'wave':'collections');});
player.appendChild(listToggle);
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
window.addEventListener('pagehide',()=>{clearInterval(refresh);observer?.disconnect();},{once:true});
refreshShowcase();showCurated();
// All originals remain reachable via user controls; only their topbar is
// visually hidden on wide screens and retained under the mobile fallback.
document.getElementById('search-input')?.addEventListener('focus',()=>showList('search'));
window.studioShowCurated=showCurated;window.studioShowList=showList;
})();
