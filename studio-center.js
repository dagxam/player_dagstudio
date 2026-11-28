/* DAGSTUDIO CC3 — one centered navigation workspace. Never replaces audio. */
(function(){
'use strict';
const root=document.querySelector('.main-container.studio-showcase');
const pane=document.getElementById('right-col-container');
const gallery=document.getElementById('studio-curations');
if(!root||!pane||!gallery||window.studioCenterRender)return;
let view='home',returnView='home',lastMode='home';
const make=(tag,cls,value)=>{
 const el=document.createElement(tag);if(cls)el.className=cls;
 if(value!==undefined)el.textContent=String(value);return el;
};
// Official licensed catalogues are discovery links, NOT unlicensed audio URLs.
// The music itself stays on the publisher's website until a streaming deal
// and an authenticated playback API have been agreed.
const caucasusCatalogues=[
 {title:'Звук-М · новинки',desc:'Официальные премьеры кавказской эстрады',icon:'compact-disc',
  url:'https://zvuk-m.com/category/novinki-muzykalnogo-izdatelstva'},
 {title:'Звук-М · архив',desc:'Релизы прошлых лет, в том числе 2016–2024',icon:'clock-rotate-left',
  url:'https://zvuk-m.com/relizy'},
 {title:'Kavkaz Music · национальные',desc:'Дагестан, Чечня, Ингушетия, Осетия и другие',icon:'mountain',
  url:'https://kavkazmusic.tv/category/premery'},
 {title:'Кавказ Хит · радио',desc:'Эфир: новые и знакомые песни Кавказа',icon:'radio',
  url:'https://kavkazhit.com/'}
];
const worldCatalogues=[
 {title:'Jamendo · независимые',desc:'Официальный каталог и музыка Creative Commons',icon:'headphones',
  url:'https://www.jamendo.com/start'},
 {title:'SoundCloud · новые треки',desc:'Исполнители, ремиксы и независимые релизы',icon:'cloud',
  url:'https://soundcloud.com/discover'},
 {title:'MusicBrainz · дискографии',desc:'Даты релизов и архивы альбомов (без аудио)',icon:'record-vinyl',
  url:'https://musicbrainz.org/'}
];
const officialAudiusCards=[
 {title:'Новые песни · все источники',desc:'Audius с резервом через DAGSTUDIO',icon:'bolt',mode:'latest'},
 {title:'Популярные песни · все источники',desc:'Audius с резервом через DAGSTUDIO',icon:'chart-line',mode:'trending'}
];
function openCaucasusCatalogue(link){
 const allowed=[...caucasusCatalogues,...worldCatalogues].some(item=>item.url===link);
 if(!allowed)return;
 if(window.DAG_NATIVE_BRIDGE?.openExternal){
  window.DAG_NATIVE_BRIDGE.openExternal({url:link}).catch(()=>{
   window.open(link,'_blank','noopener,noreferrer');
  });
 }else window.open(link,'_blank','noopener,noreferrer');
}
const defs=[
  {key:'caucasus',title:'Кавказские',desc:'Новая музыка Кавказа',icon:'mountain',art:'mountains'},
  {key:'russian',title:'Русские',desc:'Русские хиты и новинки',icon:'music',art:'folk'},
  {key:'foreign',title:'Зарубежные',desc:'Мировая музыка сейчас',icon:'globe',art:'artist'},
  {key:'charts',title:'Новые релизы',desc:'Свежие подтверждённые даты первыми',icon:'bolt',art:'hits'}
];
function selectNav(key){
 document.querySelectorAll('#studio-navigation .showcase-nav-btn').forEach(btn=>{
   const yes=btn.dataset.showcase===key;
   btn.classList.toggle('active',yes);
   if(yes)btn.setAttribute('aria-current','page');
   else btn.removeAttribute('aria-current');
 });
}
const bar=make('div','showcase-center-toolbar');
bar.id='showcase-center-toolbar';bar.hidden=true;
const back=make('button','showcase-center-back');back.type='button';
back.setAttribute('aria-label','Вернуться к выбору');
back.appendChild(make('i','fas fa-arrow-left'));
back.appendChild(make('span','','Назад'));
back.addEventListener('click',()=>render(returnView));
const backCaption=make('strong','showcase-center-toolbar-title','Треки');
bar.append(back,backCaption);pane.insertBefore(bar,pane.firstChild);
function galleryHead(mode){
 const heading=make('div','showcase-section-head');
 const row=make('div','showcase-gallery-header');
 if(mode!=='home'){
  const arrow=make('button','showcase-gallery-back');arrow.type='button';
  arrow.setAttribute('aria-label','Назад к подборкам');
  arrow.appendChild(make('i','fas fa-arrow-left'));
  arrow.addEventListener('click',()=>render(mode==='regions'?'collections':'home'));
  row.appendChild(arrow);
 }
 const text=make('div','');
 text.appendChild(make('span','showcase-kicker',mode==='playlists'?'ВАША БИБЛИОТЕКА':
  mode==='regions'?'НАЦИОНАЛЬНАЯ МУЗЫКА':'DAGSTUDIO • МУЗЫКА'));
 text.appendChild(make('h2','',mode==='playlists'?'Мои плейлисты':
  mode==='regions'?'Кавказские':mode==='collections'?'Подборки':'Для тебя'));
 row.appendChild(text);heading.appendChild(row);return heading;
}
function card(info,action,edit){
 const shell=make('div','showcase-curation-card showcase-center-card');
 const button=make('button','showcase-center-card-open');button.type='button';
 button.setAttribute('aria-label','Включить '+info.title);
 const art=make('span','showcase-card-art art-'+(info.art||'hits'));
 const image=info.cover&&typeof playlistCoverUrl==='function'?playlistCoverUrl(info.cover):'';
 if(image){const img=make('img','showcase-card-cover');img.src=image;img.alt='';art.appendChild(img);}
 else art.appendChild(make('i','fas fa-'+(info.icon||'music')));
 const words=make('span','showcase-card-body');
 words.appendChild(make('strong','',info.title));words.appendChild(make('small','',info.desc||''));
 const arrow=make('span','showcase-card-play');arrow.appendChild(make('i','fas fa-chevron-right'));
 button.append(art,words,arrow);button.addEventListener('click',action);
 shell.appendChild(button);
 if(edit){
  const settings=make('button','showcase-center-card-settings');settings.type='button';
  settings.title='Настроить плейлист';settings.setAttribute('aria-label',settings.title+': '+info.title);
  settings.appendChild(make('i','fas fa-gear'));settings.addEventListener('click',edit);
  shell.appendChild(settings);
 }
 return shell;
}

function playlistCountLabel(value,one,few,many){
 const n=Math.max(0,Number(value)||0),last=n%10,hundred=n%100;
 const ending=(hundred>=11&&hundred<=14)?many:last===1?one:last>=2&&last<=4?few:many;
 return n.toLocaleString('ru-RU')+' '+ending;
}
// Playlist cards have their own visual layout; playback and editing still
// call the existing playlist controller and full-screen track manager.
function playlistCard(pl){
 const name=String(pl?.name||'Плейлист');
 const amount=Array.isArray(pl?.tracks)?pl.tracks.length:0;
 const shell=make('article','showcase-playlist-card');
 const open=make('button','showcase-playlist-open');
 open.type='button';open.title='Открыть '+name;
 open.setAttribute('aria-label','Открыть плейлист '+name);
 const art=make('span','showcase-playlist-cover');
 const background=make('span','showcase-playlist-fallback');
 const glyph=typeof playlistIconName==='function'?playlistIconName(pl?.icon):'music';
 background.appendChild(make('i','fas fa-'+glyph));
 art.appendChild(background);
 const cover=pl?.cover&&typeof playlistCoverUrl==='function'?playlistCoverUrl(pl.cover):'';
 if(cover){
   const img=make('img','showcase-playlist-cover-image');
   img.src=cover;img.alt='';img.loading='lazy';img.decoding='async';
   img.addEventListener('error',()=>img.remove(),{once:true});
   art.appendChild(img);
 }
 const hover=make('span','showcase-playlist-hover');
 hover.appendChild(make('i','fas fa-play'));
 art.appendChild(hover);
 const info=make('span','showcase-playlist-info');
 info.appendChild(make('strong','showcase-playlist-name',name));
 info.appendChild(make('small','showcase-playlist-count',playlistCountLabel(amount,'трек','трека','треков')));
 open.append(art,info);
 open.addEventListener('click',()=>openPlaylist(pl));
 const edit=make('button','showcase-playlist-edit');edit.type='button';
 edit.title='Редактировать '+name;
 edit.setAttribute('aria-label',edit.title);
 edit.appendChild(make('i','fas fa-pen'));
 edit.addEventListener('click',()=>{
   if(typeof openTrackManager==='function')openTrackManager(pl.id,pl.name,pl.type);
 });
 shell.append(open,edit);
 return shell;
}

function showTracks(context,label,backTo){
 root.classList.remove('showcase-wave-only');
 view='tracks';returnView=backTo||'collections';
 window.studioShowList?.(context);bar.hidden=false;
 backCaption.textContent=label||'Песни';
 const list=document.querySelector('.playlist-area');
 if(list)list.scrollTop=0;
 selectNav(context==='playlists'?'playlists':context==='charts'?'charts':'collections');
}
function openPlaylist(pl){
  const selected=typeof playlists!=='undefined'?
    playlists.find(item=>String(item.id)===String(pl.id)):null;
  if(!selected){render('playlists');return;}
  showTracks('playlists',selected.name,'playlists');
  if(typeof switchTab==='function')switchTab(selected.id);
}
window.studioCenterOpenPlaylist=function(id){
  const selected=typeof playlists!=='undefined'?
    playlists.find(item=>String(item.id)===String(id)):null;
  if(selected)openPlaylist(selected);
  else render('playlists');
};
function openMixScreen(key,label){
 // Reuse the same actual player and audio queue as My Wave; hide the track
 // browser, but retain its data for Next/Previous and the queue control.
 view='mix';returnView='collections';
 bar.hidden=true;
 root.classList.add('showcase-wave-only');
 root.dataset.activeMix=key;
 const heading=document.querySelector('.showcase-hero-copy h1');
 if(heading)heading.textContent=label||'Подборка';
 selectNav('collections');
}
window.studioMixScreen=openMixScreen;
function showMix(key,label,backTo='collections'){
 openMixScreen(key,label);
 if(typeof startQuickMix==='function')startQuickMix(key);
}
function region(id,label){
 openMixScreen('caucasus_selected',label);
 if(typeof startCaucasusRadio==='function')startCaucasusRadio(id);
}
function browseAudius(mode,label,backTo='collections'){
 showTracks('search',label,backTo);
 window.browseOfficialAudius?.(mode);
}
function render(mode='home'){
 root.classList.remove('showcase-wave-only');
 view=mode;lastMode=mode;
 window.studioShowCurated?.();
 bar.hidden=true;
 gallery.classList.toggle('showcase-playlist-library',mode==='playlists');
 gallery.replaceChildren(galleryHead(mode));
 const grid=make('div',mode==='playlists'?'showcase-curation-list showcase-playlist-grid':'showcase-curation-list');
 if(mode==='playlists'){
  selectNav('playlists');
  const data=(typeof playlists!=='undefined'&&Array.isArray(playlists))?playlists:[];
  const songCount=data.reduce((n,pl)=>n+(Array.isArray(pl?.tracks)?pl.tracks.length:0),0);
  const stats=make('div','showcase-playlist-stats');
  stats.appendChild(make('p','',
    playlistCountLabel(data.length,'плейлист','плейлиста','плейлистов')+' · '+
    playlistCountLabel(songCount,'трек','трека','треков')));
  gallery.appendChild(stats);
  const actions=make('div','showcase-center-actions showcase-playlist-toolbar');
  const create=make('button','showcase-center-action');
  create.type='button';create.classList.add('showcase-playlist-create');create.appendChild(make('i','fas fa-plus'));
  create.appendChild(make('span','','Создать плейлист'));
  create.addEventListener('click',()=>{
   if(!currentUser)openMenu?.();
   else if(typeof openNewPlModal==='function')openNewPlModal();
  });
  const manage=make('button','showcase-center-action');
  manage.type='button';manage.classList.add('showcase-playlist-manage');manage.appendChild(make('i','fas fa-sliders'));
  manage.appendChild(make('span','','Управление'));
  manage.addEventListener('click',()=>{
   if(!currentUser)openMenu?.();
   else if(typeof openManagePlaylists==='function')openManagePlaylists();
  });
  actions.append(create,manage);gallery.appendChild(actions);
  data.forEach(pl=>grid.appendChild(playlistCard(pl)));
  if(!data.length){
   const empty=make('div','showcase-playlist-empty');
   empty.appendChild(make('i','fas fa-music'));
   empty.appendChild(make('strong','', 'Здесь будут ваши плейлисты'));
   empty.appendChild(make('p','',
    typeof currentUser!=='undefined'&&currentUser?
      'Создайте первый плейлист и добавьте любимые треки.':
      'Войдите в аккаунт, чтобы создавать плейлисты и сохранять музыку.'));
   grid.appendChild(empty);
  }
  gallery.appendChild(grid);
 }else{
  selectNav(mode==='home'?'wave':'collections');
  defs.forEach(d=>grid.appendChild(card(d,()=>showMix(d.key,d.title))));
  gallery.appendChild(grid);
  if(mode==='collections'||mode==='home')window.warmInstantMixSelections?.();
 }

 gallery.scrollTop=0;
}
window.studioCenterRender=render;
window.studioCenterMix=(key)=>showMix(key,key==='charts'?'Новые релизы':
 defs.find(x=>x.key===key)?.title||'Подборка','collections');
window.addEventListener('dag-playlists-updated',()=>{if(view==='playlists')render('playlists');});
function openWaveScreen(){
 view='wave';returnView='home';
 bar.hidden=true;
 delete root.dataset.activeMix;
 const heading=document.querySelector('.showcase-hero-copy h1');
 if(heading)heading.textContent='Моя волна';
 root.classList.add('showcase-wave-only');
 selectNav('wave');
 // Update the main Play affordance immediately on navigation, not 1.2s later.
 window.dispatchEvent(new Event('dag-artwork-updated'));
}
window.studioWaveScreen=openWaveScreen;
document.getElementById('showcase-wave')?.addEventListener('click',openWaveScreen);
document.getElementById('vinyl-wave-play')?.addEventListener('click',openWaveScreen);
document.querySelectorAll('#studio-navigation .showcase-nav-btn').forEach(button=>{
 if(button.id!=='showcase-wave')button.addEventListener('click',()=>{
     root.classList.remove('showcase-wave-only');
 });
});
document.addEventListener('click',event=>{
 if(event.target.closest?.('#showcase-search,#showcase-likes,#showcase-offline')){
   root.classList.remove('showcase-wave-only');view='tracks';bar.hidden=true;
 }
},false);
function openSettingsInPane(){
 const settings=document.getElementById('menu-modal');
 if(!settings)return;
 root.classList.remove('showcase-wave-only');
 root.classList.add('showcase-settings-open');
 settings.classList.add('showcase-settings-page','show');
 const box=settings.querySelector('.menu-modal-box');
 if(box)box.scrollTop=0;
 view='settings';
 selectNav('settings');
}
window.studioSettingsPage=openSettingsInPane;
const settingsModal=document.getElementById('menu-modal');
if(settingsModal){
 const watch=new MutationObserver(()=>{
  if(!settingsModal.classList.contains('show')){
   if(settingsModal.classList.contains('showcase-settings-page'))
     settingsModal.classList.remove('showcase-settings-page');
   if(root.classList.contains('showcase-settings-open'))
     root.classList.remove('showcase-settings-open');
  }
 });
 watch.observe(settingsModal,{attributes:true,attributeFilter:['class']});
}
render('home');
window.dispatchEvent(new Event('dag-ui-ready'));
})();
