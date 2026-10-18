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
 art.appendChild(make('i','fas fa-'+(info.icon||'music')));
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
   grid.appendChild(card({title:pl.name||'Плейлист',desc:total+' треков',icon,art:'artist'},
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
 }else{
  selectNav(mode==='collections'?'collections':'wave');
  (mode==='collections'?defs:defs.slice(0,6)).forEach(d=>{
   grid.appendChild(card(d,()=>d.key==='caucasus'?render('regions'):
    showMix(d.key,d.title,d.key==='charts'?'collections':'collections')));
  });
  gallery.appendChild(grid);
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
 const themes=settings.querySelector('.theme-selector-wrapper');
 const action=settings.querySelector('.menu-action-column');
 if(themes&&action&&!action.contains(themes))action.prepend(themes);
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
})();
