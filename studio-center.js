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
 {key:'caucasus',title:'Кавказские',desc:'Республики и языки',icon:'mountain',art:'mountains'},
 {key:'russian',title:'Русские',desc:'Популярные песни',icon:'music',art:'folk'},
 {key:'foreign',title:'Зарубежные',desc:'Мировые новинки',icon:'globe',art:'artist'},
 {key:'hits',title:'Лучшее',desc:'Любимые хиты',icon:'star',art:'hits'},
 {key:'road',title:'В дорогу',desc:'В путь с музыкой',icon:'route',art:'road'},
 {key:'retro',title:'Ретро',desc:'Знакомые мелодии',icon:'compact-disc',art:'retro'},
 {key:'rock',title:'Рок',desc:'Легенды рока',icon:'guitar',art:'folk'},
 {key:'charts',title:'Новые релизы',desc:'Даты выпуска проверены',icon:'bolt',art:'hits'}
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
 button.setAttribute('aria-label','Открыть '+info.title);
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
 showTracks('playlists',pl.name,'playlists');
 if(typeof switchTab==='function')switchTab(pl.id);
}
function showMix(key,label,backTo='collections'){
 showTracks(key==='charts'?'charts':'collections',label,backTo);
 if(typeof startQuickMix==='function')startQuickMix(key);
}
function region(id,label){
 showTracks('collections',label,'regions');
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
 bar.hidden=true;gallery.replaceChildren(galleryHead(mode));
 const grid=make('div','showcase-curation-list');
 if(mode==='playlists'){
  selectNav('playlists');
  const data=(typeof playlists!=='undefined'&&Array.isArray(playlists))?playlists:[];
  data.forEach(pl=>{
   const total=(pl.tracks||[]).length;
   const icon=typeof playlistIconName==='function'?playlistIconName(pl.icon):'music';
   grid.appendChild(card({title:pl.name||'Плейлист',desc:total+' треков',icon,art:'artist',cover:pl.cover},
    ()=>openPlaylist(pl),()=>typeof openTrackManager==='function'&&openTrackManager(pl.id,pl.name,pl.type)));
  });
  if(!data.length)grid.appendChild(make('p','showcase-center-empty',
   typeof currentUser!=='undefined'&&currentUser?'Плейлистов пока нет. Создайте первый.':
   'Войдите в аккаунт, чтобы увидеть свои плейлисты.'));
  gallery.appendChild(grid);
  const actions=make('div','showcase-center-actions');
  const create=make('button','showcase-center-action');
  create.type='button';create.appendChild(make('i','fas fa-plus'));
  create.appendChild(make('span','','Создать плейлист'));
  create.addEventListener('click',()=>{
   if(!currentUser)openMenu?.();
   else if(typeof openNewPlModal==='function')openNewPlModal();
  });
  const manage=make('button','showcase-center-action');
  manage.type='button';manage.appendChild(make('i','fas fa-sliders'));
  manage.appendChild(make('span','','Управление'));
  manage.addEventListener('click',()=>{
   if(!currentUser)openMenu?.();
   else if(typeof openManagePlaylists==='function')openManagePlaylists();
  });
  actions.append(create,manage);gallery.appendChild(actions);
 }else if(mode==='regions'){
  selectNav('collections');
  const caucasus=typeof QUICK_MIXES!=='undefined'?QUICK_MIXES.caucasus:null;
  const regions=caucasus?[{id:'all',label:'Весь Кавказ'},...caucasus.regions]:[];
  regions.forEach(r=>grid.appendChild(card({
    title:r.label,desc:r.id==='all'?'Все республики':'Поиск песен направления',
    icon:r.id==='all'?'mountain':'music',art:'mountains'
  },()=>region(r.id,r.label))));
  gallery.appendChild(grid);
  const sourcesHead=make('div','showcase-section-head');
  sourcesHead.appendChild(make('span','showcase-kicker','ОФИЦИАЛЬНЫЕ КАТАЛОГИ'));
  sourcesHead.appendChild(make('h2','','Новинки и архивы'));
  sourcesHead.appendChild(make('p','showcase-center-empty',
   'Прослушивание на сайтах правообладателей. Встроенный поиск музыки работает отдельно.'));
  gallery.appendChild(sourcesHead);
  const sourcesGrid=make('div','showcase-curation-list');
  caucasusCatalogues.forEach(item=>sourcesGrid.appendChild(card({
   title:item.title,desc:item.desc,icon:item.icon,art:'mountains'
  },()=>openCaucasusCatalogue(item.url))));
  gallery.appendChild(sourcesGrid);
  const worldHead=make('div','showcase-section-head');
  worldHead.appendChild(make('span','showcase-kicker','ДОПОЛНИТЕЛЬНЫЕ КАТАЛОГИ'));
  worldHead.appendChild(make('h2','','Мировая музыка'));
  gallery.appendChild(worldHead);
  const worldGrid=make('div','showcase-curation-list');
  worldCatalogues.forEach(item=>worldGrid.appendChild(card({
   title:item.title,desc:item.desc,icon:item.icon,art:'artist'
  },()=>openCaucasusCatalogue(item.url))));
  gallery.appendChild(worldGrid);
  const audiusGrid=make('div','showcase-curation-list');
  officialAudiusCards.forEach(item=>audiusGrid.appendChild(card({
   title:item.title,desc:item.desc,icon:item.icon,art:'hits'
  },()=>browseAudius(item.mode,item.title,'regions'))));
  gallery.appendChild(audiusGrid);
 }else{
  selectNav(mode==='collections'?'collections':'wave');
  (mode==='collections'?defs:defs.slice(0,6)).forEach(d=>{
   grid.appendChild(card(d,()=>d.key==='caucasus'?render('regions'):
    showMix(d.key,d.title,d.key==='charts'?'collections':'collections')));
  });
  gallery.appendChild(grid);
  const exploreHead=make('div','showcase-section-head');
  exploreHead.appendChild(make('span','showcase-kicker','ОФИЦИАЛЬНОЕ АУДИО'));
  exploreHead.appendChild(make('h2','','Новые песни и тренды'));
  gallery.appendChild(exploreHead);
  const audiusGrid=make('div','showcase-curation-list');
  officialAudiusCards.forEach(item=>audiusGrid.appendChild(card({
   title:item.title,desc:item.desc,icon:item.icon,art:'hits'
  },()=>browseAudius(item.mode,item.title,mode))));
  gallery.appendChild(audiusGrid);
  const catalogHead=make('div','showcase-section-head');
  catalogHead.appendChild(make('span','showcase-kicker','МИРОВЫЕ КАТАЛОГИ'));
  catalogHead.appendChild(make('h2','','Больше музыки'));
  gallery.appendChild(catalogHead);
  const catalogGrid=make('div','showcase-curation-list');
  worldCatalogues.forEach(item=>catalogGrid.appendChild(card({
   title:item.title,desc:item.desc,icon:item.icon,art:'artist'
  },()=>openCaucasusCatalogue(item.url))));
  gallery.appendChild(catalogGrid);
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
 root.classList.add('showcase-wave-only');
 selectNav('wave');
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
