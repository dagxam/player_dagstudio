/* DAGSTUDIO PLAYER — Ethno Console shell.
   UI-only: no new audio element, stream retry, OTA or queue interception. */
(function () {
  'use strict';
  if (document.getElementById('studio-sidebar')) return;
  const root = document.querySelector('.main-container');
  const right = document.getElementById('right-col-container');
  const head = document.querySelector('.right-col-header');
  if (!root || !right || !head || !document.querySelector('.left-col')) return;

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  };
  const btn = (className, label, icon, fn) => {
    const b = el('button', className);
    b.type = 'button';
    if (icon) {
      const i = el('i', 'fas fa-' + icon);
      i.setAttribute('aria-hidden', 'true');
      b.appendChild(i);
    }
    b.appendChild(el('span', '', label));
    b.addEventListener('click', fn);
    return b;
  };
  const sidebar = el('aside','studio-sidebar');
  sidebar.id = 'studio-sidebar';
  sidebar.setAttribute('aria-label','Навигация DAGSTUDIO');
  const logo = el('div','studio-logo');
  const logoImg = el('img');
  logoImg.src = '/images/cover.png';
  logoImg.alt = '';
  logo.appendChild(logoImg);
  const logoCopy = el('div');
  logoCopy.appendChild(el('strong','', 'DAGSTUDIO'));
  logoCopy.appendChild(el('span','', 'PLAYER · Я.ВОЛНА'));
  logo.appendChild(logoCopy);
  sidebar.appendChild(logo);
  sidebar.appendChild(el('div','studio-small','НАВИГАЦИЯ'));
  const nav = el('nav','studio-nav');
  const views = [
    ['wave','Моя волна','wave-square'],
    ['library','Плейлисты','folder-open'],
    ['charts','Обзор и чарты','chart-simple'],
    ['likes','Мне нравится','heart']
  ];
  for (const [view,label,icon] of views) {
    const item = btn('studio-nav-item',label,icon,() => showView(view));
    item.dataset.studioView = view;
    if(view==='wave')item.classList.add('active');
    nav.appendChild(item);
  }
  sidebar.appendChild(nav);
  sidebar.appendChild(el('div','studio-divider'));
  sidebar.appendChild(el('div','studio-small','НАЦИОНАЛЬНЫЕ ПОДБОРКИ'));
  for (const name of ['Аварские песни','Лезгинские ритмы','Кумыкские хиты','Даргинские напевы']) {
    const b = btn('studio-region',name,null,() => {
      if (typeof openCaucasusRadio === 'function') openCaucasusRadio();
    });
    b.appendChild(el('i','fas fa-chevron-right'));
    sidebar.appendChild(b);
  }
  const themeSection = el('div','studio-themes');
  themeSection.appendChild(el('div','studio-small','СТИЛЬ ОФОРМЛЕНИЯ'));
  const themes = el('div','studio-theme-buttons');
  const themeValues = {
    brown:'#c8794e',red:'#d32f2f',green:'#2e7d32',blue:'#1976d2',purple:'#8b00ff'
  };
  for (const [theme,color] of Object.entries(themeValues)) {
    const b=el('button','studio-theme');
    b.type='button';b.title='Тема: '+({brown:'Медь',red:'Красная',green:'Зелёная',blue:'Синяя',purple:'Фиолетовая'}[theme]);
    b.setAttribute('aria-label',b.title);
    b.dataset.studioTheme=theme;
    const dot=el('span','studio-theme-dot');dot.style.background=color;b.appendChild(dot);
    b.addEventListener('click',()=>{if(typeof setTheme==='function')setTheme(theme);syncTheme();});
    themes.appendChild(b);
  }
  themeSection.appendChild(themes);
  sidebar.appendChild(themeSection);
  root.insertBefore(sidebar,root.firstChild);

  // Move the existing live search field: no duplicate listener or search API.
  const search = document.getElementById('search-container-box');
  if(search)head.insertBefore(search,head.firstChild);
  const searchInput=document.getElementById('search-input');
  if(searchInput)searchInput.placeholder='Поиск: трек, исполнитель или жанр…';

  const hero=el('section','studio-hero');
  hero.id='studio-hero';
  const hc=el('div','studio-hero-copy');
  hc.appendChild(el('div','studio-hero-eyebrow','● ПЕРСОНАЛЬНЫЙ МУЗЫКАЛЬНЫЙ ПОТОК · DAGSTUDIO'));
  const h2=el('h2');h2.append('МОЯ ');h2.appendChild(el('span','','ВОЛНА'));hc.appendChild(h2);
  hc.appendChild(el('p','',
    'Музыка под ваше настроение. Рекомендации становятся точнее по мере прослушиваний, пропусков и сохранённых треков.'));
  const heroActions=el('div','studio-hero-actions');
  heroActions.appendChild(btn('studio-hero-primary','Слушать мою волну','play',()=>{
    if(typeof startQuickMix==='function')startQuickMix('wave');
  }));
  heroActions.appendChild(btn('studio-hero-secondary','Настроить волну','sliders',()=>{
    if(typeof openPlaybackQueue==='function')openPlaybackQueue();
  }));
  hc.appendChild(heroActions);hero.appendChild(hc);

  const title=el('h2','studio-section-title');
  title.id='studio-section-title';
  title.textContent='МУЗЫКА И ПОДБОРКИ';
  const area=document.getElementById('playlist-container');
  right.insertBefore(hero, area);
  right.insertBefore(title, area);

  const library=el('section','studio-library');
  library.id='studio-library';
  library.setAttribute('aria-label','Медиатека DAGSTUDIO');
  right.insertBefore(library,area);

  const dock=el('footer','studio-dock');
  dock.setAttribute('aria-label','Строка воспроизведения');
  const dockNow=el('div','studio-dock-now');
  const dockCover=el('img');dockCover.src='/images/cover.png';dockCover.alt='';dockNow.appendChild(dockCover);
  const dockText=el('div','studio-dock-text');
  const dockTitle=el('strong','','Выберите трек');
  const dockArtist=el('small','','DAGSTUDIO PLAYER');
  dockText.appendChild(dockTitle);dockText.appendChild(dockArtist);dockNow.appendChild(dockText);
  dock.appendChild(dockNow);
  const dockControls=el('div','studio-dock-controls');
  const proxyClick=id=>{const target=document.getElementById(id);if(target)target.click();};
  dockControls.appendChild(btn('','Назад','backward-step',()=>proxyClick('btn-prev')));
  const dockPlay=btn('studio-dock-play','Играть','play',()=>proxyClick('btn-play'));
  dockPlay.querySelector('span').hidden=true;
  dockPlay.setAttribute('aria-label','Воспроизведение / пауза');
  dockControls.appendChild(dockPlay);
  dockControls.appendChild(btn('','Вперёд','forward-step',()=>proxyClick('btn-next')));
  const time=el('span','studio-dock-time','0:00');
  const progress=el('div','studio-dock-progress');
  progress.setAttribute('aria-hidden','true');
  const fill=el('span');progress.appendChild(fill);
  dockControls.appendChild(time);dockControls.appendChild(progress);
  dock.appendChild(dockControls);
  const dockActions=el('div','studio-dock-actions');
  dockActions.appendChild(btn('','Эквалайзер','sliders',()=>{if(typeof openEqualizer==='function')openEqualizer();}));
  dockActions.appendChild(btn('','Очередь','list-ol',()=>{if(typeof openPlaybackQueue==='function')openPlaybackQueue();}));
  dockActions.appendChild(btn('','Меню','ellipsis',()=>{if(typeof openMenu==='function')openMenu();}));
  for(const b of dock.querySelectorAll('button')) {
    const label=b.querySelector('span');if(label)label.hidden=true;
    if(!b.hasAttribute('aria-label'))b.setAttribute('aria-label',label?.textContent||'Управление');
  }
  dock.appendChild(dockActions);
  root.appendChild(dock);

  let currentView='wave';
  let likesCache=[];
  let lastPlaylistVersion='';
  function uniqueSavedTracks() {
    const seen=new Set(),out=[];
    if(typeof playlists==='undefined')return out;
    for(const p of playlists)for(const t of (Array.isArray(p.tracks)?p.tracks:[])) {
      if(!t || !t.url)continue;
      const key=(String(t.artist||'')+'|'+String(t.title||'')+'|'+String(t.url)).toLowerCase();
      if(seen.has(key))continue;
      seen.add(key);out.push(t);
    }
    return out;
  }
  function renderLibrary() {
    library.replaceChildren();
    if(currentView==='library') {
      library.appendChild(el('h2','studio-section-title','ВАШИ ПЛЕЙЛИСТЫ'));
      const data=(typeof playlists!=='undefined'&&Array.isArray(playlists))?playlists:[];
      library.appendChild(el('p','studio-library-caption',data.length+' плейлистов. Нажмите на подборку, чтобы открыть её без автоматического запуска.'));
      if(!data.length) {
        library.appendChild(el('p','studio-library-caption','Для сохранения и синхронизации плейлистов войдите в свой аккаунт.'));
        library.appendChild(btn('studio-card-btn','Войти / Управление','user',()=>openMenu()));
      }
      const grid=el('div','studio-library-grid');
      for(const pl of data) {
        const card=el('button','studio-playlist-card');card.type='button';
        const image=el('img');image.alt='';image.src='/images/cover.png';card.appendChild(image);
        const info=el('div');info.appendChild(el('strong','',pl.name||'Плейлист'));
        info.appendChild(el('small','',(Array.isArray(pl.tracks)?pl.tracks.length:0)+' треков'));
        card.appendChild(info);
        card.addEventListener('click',()=>{
          if(typeof switchTab==='function')switchTab(pl.id);
          currentView='tracks'; updateView();
        });
        grid.appendChild(card);
      }
      library.appendChild(grid);
    } else if(currentView==='likes'){
      likesCache=uniqueSavedTracks();
      library.appendChild(el('h2','studio-section-title','СОХРАНЁННЫЕ ПЕСНИ'));
      library.appendChild(el('p','studio-library-caption','Треки из ваших плейлистов: '+likesCache.length+'. Открытие раздела не прерывает воспроизведение.'));
      if(!likesCache.length)library.appendChild(el('p','studio-library-caption','Сохраните понравившиеся песни в плейлист — они появятся здесь.'));
      const grid=el('div','studio-library-grid');
      for(let i=0;i<likesCache.length;i++){
        const t=likesCache[i];
        const card=el('button','studio-playlist-card');card.type='button';
        const img=el('img');img.alt='';img.src=t.thumb||'/images/cover.png';img.onerror=()=>{img.onerror=null;img.src='/images/cover.png';};
        const info=el('div');info.appendChild(el('strong','',t.title||'Без названия'));
        info.appendChild(el('small','',t.artist||'Исполнитель неизвестен'));
        card.appendChild(img);card.appendChild(info);
        card.addEventListener('click',()=>{
          // Preserve original playTrack and its recovery/source selection behaviour.
          playlist=likesCache.slice();currentTab='studio-likes';playTrack(i);
          updateDock();
        });
        grid.appendChild(card);
      }
      library.appendChild(grid);
    }
  }
  function syncTheme(){
    let selected='brown';
    try{selected=localStorage.getItem('dag_theme')||'brown';}catch(e){}
    sidebar.querySelectorAll('[data-studio-theme]').forEach(b=>{
      const active=b.dataset.studioTheme===selected;
      b.classList.toggle('active',active);
      b.setAttribute('aria-pressed',String(active));
    });
  }
  function updateView(){
    const isLibrary=currentView==='library'||currentView==='likes';
    right.classList.toggle('studio-library-active',isLibrary);
    library.classList.toggle('active',isLibrary);
    hero.hidden=currentView!=='wave';
    title.hidden=isLibrary;
    title.textContent=currentView==='charts'?'ОБЗОР И ЧАРТЫ':currentView==='wave'?'ВАШИ ТРЕКИ И РЕКОМЕНДАЦИИ':'МУЗЫКА';
    sidebar.querySelectorAll('[data-studio-view]').forEach(b=>{
      const active=b.dataset.studioView===currentView;
      b.classList.toggle('active',active);b.setAttribute('aria-current',active?'page':'false');
    });
    if(isLibrary)renderLibrary();
  }
  function showView(view) {
    currentView=view;
    if(view==='wave') {
      if(typeof switchTab==='function')switchTab('search');
    } else if(view==='charts'){
      if(typeof startQuickMix==='function')startQuickMix('hits');
    } else if(view==='library'||view==='likes'){
      // UI only: opening a section must not start playback.
    }
    updateView();
  }
  function updateDock() {
    const mainTitle=document.getElementById('track-title');
    const mainArtist=document.getElementById('track-artist');
    if(mainTitle)dockTitle.textContent=mainTitle.textContent||'Выберите трек';
    if(mainArtist)dockArtist.textContent=mainArtist.textContent||'DAGSTUDIO PLAYER';
    const realCover=document.getElementById('cover-img');
    if(realCover&&realCover.getAttribute('src')!==dockCover.getAttribute('src'))dockCover.src=realCover.getAttribute('src');
    const elapsed=document.getElementById('curr-time');
    const percent=document.getElementById('prog-current');
    if(elapsed)time.textContent=elapsed.textContent||'0:00';
    if(percent)fill.style.width=percent.style.width||'0%';
    const realPlay=document.querySelector('#btn-play i');
    const icon=dockPlay.querySelector('i');
    if(icon&&realPlay)icon.className=realPlay.className;
    syncTheme();
    const version=(typeof playlists!=='undefined'&&Array.isArray(playlists))
       ?playlists.map(pl=>String(pl.id)+':'+(pl.tracks?.length||0)).join('|'):'';
    if(version!==lastPlaylistVersion){
      lastPlaylistVersion=version;
      if(currentView==='library'||currentView==='likes')renderLibrary();
    }
  }
  updateView();updateDock();
  // Lightweight mirror only: the primary player remains the sole audio controller.
  const tick=setInterval(()=>{if(!document.hidden)updateDock();},1300);
  window.addEventListener('pagehide',()=>clearInterval(tick),{once:true});
})();
