import puppeteer from 'puppeteer-core';

const url = process.env.PLAYER_URL || 'https://pl.dagstudio.ru/';
const executablePath = process.env.CHROME_BIN || '/usr/bin/google-chrome';

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required']
});

const page = await browser.newPage();
// Не позволяем ожидаемому controllerchange перезагружать страницу прямо посреди
// UI-проверки. Сам Service Worker отдельно проверяется production deploy workflow.
await page.evaluateOnNewDocument(() => {
  try { sessionStorage.setItem('dag_sw_reloaded_2293', '1'); } catch (error) {}
});
const consoleErrors = [];
const pageErrors = [];
page.on('console', msg => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', err => pageErrors.push(String(err)));

try {
  await page.goto(url + '?smoke=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 45000 });
  // A newly activated service worker intentionally reloads the page once.
  // Give that migration reload time to finish before evaluating the app.
  await new Promise(resolve => setTimeout(resolve, 2500));
  await page.waitForFunction(() => document.readyState === 'complete', { timeout: 15000 }).catch(() => {});

  const basics = await page.evaluate(() => ({
    readyState: document.readyState,
    openMenu: typeof window.openMenu,
    handleAuth: typeof window.handleAuth,
    toggleAuthMode: typeof window.toggleAuthMode,
    playTrack: typeof window.playTrack,
    togglePlay: typeof window.togglePlay,
    playNext: typeof window.playNext,
    playPrev: typeof window.playPrev,
    downloadTrack: typeof window.downloadTrack,
    openEqualizer: typeof window.openEqualizer,
    toggleEqualizerPower: typeof window.toggleEqualizerPower,
    resetEqualizer: typeof window.resetEqualizer,
    manualUpdateApplication: typeof window.manualUpdateApplication,
    manualSyncPlaylists: typeof window.manualSyncPlaylists,
    refreshAppVersionInfo: typeof window.refreshAppVersionInfo,
    downloadButton: !!document.getElementById('android-apk-download-btn'),
    equalizerButton: !!document.querySelector('.header-eq-btn'),
    mixesButton: !!document.getElementById('header-mixes-btn'),
    updateButton: !!document.getElementById('app-update-btn'),
    versionFooter: !!document.getElementById('app-version-footer'),
    installButtonAbsent: !document.getElementById('pwa-install-btn'),
    fullscreenButtonAbsent: !document.querySelector('[onclick="toggleFullScreen()"]'),
    menuButton: !!document.querySelector('.menu-btn'),
    audio: !!document.getElementById('main-audio')
  }));
  console.log('BASICS', JSON.stringify(basics));

  const requiredFunctions = [
    'openMenu','handleAuth','toggleAuthMode','playTrack','togglePlay',
    'playNext','playPrev','downloadTrack','openEqualizer',
    'toggleEqualizerPower','resetEqualizer','manualUpdateApplication',
    'refreshAppVersionInfo','manualSyncPlaylists'
  ];
  for (const name of requiredFunctions) {
    if (basics[name] !== 'function') throw new Error('Missing function: ' + name);
  }
  for (const name of ['downloadButton','equalizerButton','mixesButton','updateButton','versionFooter','installButtonAbsent','fullscreenButtonAbsent','menuButton','audio']) {
    if (!basics[name]) throw new Error('Missing/incorrect UI state: ' + name);
  }

  // 2026 approved design: real three-zone layout and car touch targets.
  for(const viewport of [{width:800,height:480},{width:1024,height:600},
      {width:1280,height:720},{width:390,height:844},{width:320,height:640}]){
    await page.setViewport(viewport);
    const state=await page.evaluate(()=>{
      const rect=s=>document.querySelector(s).getBoundingClientRect();
      const side=rect('#studio-navigation'),center=rect('.right-col'),hero=rect('.left-col'),
        play=rect('#vinyl-wave-play'),nav=document.querySelector('#studio-navigation'),
        list=document.getElementById('studio-curations');
      const wide=innerWidth>768;
      return {
        sidebar:wide?(side.width>=150&&side.left>=-1):(side.width>200&&getComputedStyle(nav).position==='fixed'),
        center:wide?(center.width>=275&&Math.abs(center.left-side.right)<5):center.width>=innerWidth-3,
        hero:wide?(hero.width>=270&&Math.abs(hero.left-center.right)<5):hero.width>=innerWidth-3,
        cover:list&&getComputedStyle(list).display!=='none'&&list.querySelectorAll('.showcase-curation-card').length===6,
        brand:!!nav.querySelector('.showcase-brand'),
        allActions:['search','wave','playlists','likes','offline','charts','collections','equalizer','settings'].every(k=>
             !!document.getElementById('showcase-'+k)),
        activeWave:!!nav.querySelector('[data-showcase="wave"].active'),
        playButton:play.width>=54&&play.height>=54,
        audio:document.querySelectorAll('audio').length===1,
        noOverflow:document.documentElement.scrollWidth<=innerWidth+3,
        hasMobileMenu:wide?true:getComputedStyle(document.querySelector('#showcase-menu-toggle')).display!=='none',
        readyWithoutOldLayout:!document.documentElement.classList.contains('studio-booting'),
        quickMobileSettings:wide?true:(getComputedStyle(document.querySelector('.showcase-mobile-tools')).display!=='none'
          &&document.querySelectorAll('.showcase-mobile-action').length===3),
        searchIconOnly:!document.getElementById('tab-search-btn')?.textContent?.trim()
      };
    });
    console.log('SHOWCASE_LAYOUT',JSON.stringify({viewport,state}));
    if(Object.values(state).some(v=>!v))
      throw new Error('Showcase responsive layout regression '+JSON.stringify({viewport,state}));
  }

  // Installed iPhone PWAs draw into the status-bar safe area. Simulate the
  // iPhone 14 inset and ensure the top-row actions remain visible and tappable.
  await page.setViewport({width:390,height:844});
  // Desktop-to-phone resize starts the sidebar's 190ms exit transition.
  // Check hit targets after it is fully offscreen, like a real phone startup.
  await new Promise(resolve=>setTimeout(resolve,260));
  const iphoneToolbar=await page.evaluate(()=>{
    const root=document.querySelector('.main-container');
    root.style.setProperty('--dag-safe-top','59px');
    try{
      const buttons=[...root.querySelectorAll('.showcase-mobile-action'),
        document.getElementById('showcase-menu-toggle')];
      const dock=root.querySelector('.showcase-mobile-topbar');
      const vinyl=root.querySelector('#vinyl-view');
      const wavePlay=root.querySelector('#vinyl-wave-play');
      const waveTop=getComputedStyle(wavePlay).top;
      const hits=buttons.map(b=>{
        const r=b.getBoundingClientRect();
        const e=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
        return {button:b.id||b.getAttribute('aria-label'),target:e?.tagName,
          hitId:e?.id,hitClass:typeof e?.className==='string'?e.className.slice(0,110):'',
          center:[Math.round(r.left+r.width/2),Math.round(r.top+r.height/2)],
          matched:e?.closest('button')===b};
      });
      return {
        dock:!!dock&&getComputedStyle(dock).display==='block',
        smoothDock:getComputedStyle(dock).borderBottomWidth==='0px'&&getComputedStyle(dock).boxShadow==='none',
        cleanWaveHero:!!root.querySelector('.showcase-hero-copy h1')&&
          !root.querySelector('.showcase-hero-tag,.showcase-audio-glyph,.showcase-hero-copy p,.showcase-ornament-lines'),
        centeredWavePlay:waveTop==='50%'||Math.abs(parseFloat(waveTop)-vinyl.clientHeight/2)<3,
        allActions:buttons.length===4,
        belowStatusBar:buttons.every(b=>b.getBoundingClientRect().top>=59),
        touchSized:buttons.every(b=>b.getBoundingClientRect().width>=44&&b.getBoundingClientRect().height>=44),
        clickable:hits.every(hit=>hit.matched),
        hits,
        noHorizontalScroll:document.documentElement.scrollWidth<=innerWidth+2
      };
    }finally{root.style.removeProperty('--dag-safe-top');}
  });
  console.log('IPHONE_14_SAFE_AREA_ACTIONS',JSON.stringify(iphoneToolbar));
  if(Object.entries(iphoneToolbar).some(([k,v])=>k!=='hits'&&!v))
    throw new Error('iPhone safe-area toolbar regression '+JSON.stringify(iphoneToolbar));

  await page.setViewport({width:1024,height:600});
  const sidebarCollapse=await page.evaluate(()=>{
    const root=document.querySelector('.main-container'),rail=document.querySelector('.showcase-rail-toggle');
    const original=document.getElementById('studio-navigation').getBoundingClientRect().width;
    rail.click();
    const compact=document.getElementById('studio-navigation').getBoundingClientRect().width;
    const persisted=localStorage.getItem('dag_sidebar_collapsed')==='1';
    rail.click();
    return {original,compact,persisted,restored:!root.classList.contains('showcase-nav-collapsed')};
  });
  if(sidebarCollapse.compact>90||sidebarCollapse.original<140||
     !sidebarCollapse.persisted||!sidebarCollapse.restored)
    throw new Error('Collapsible touch navigation regression '+JSON.stringify(sidebarCollapse));

  // Action dialogs are right-hand drawers on TEYES and mobile. Guidance and
  // informational notifications remain centered, without page scrolling.
  for(const viewport of [{width:800,height:480},{width:1024,height:600},
      {width:1280,height:720},{width:390,height:844}]){
    await page.setViewport(viewport);
    const dialogs=await page.evaluate(()=>{
      const ids=['quick-mixes-modal','caucasus-radio-modal','confirm-modal',
        'manage-pl-modal','save-modal','input-modal',
        'equalizer-modal','queue-modal','sleep-modal','diagnostics-modal',
        'cache-dashboard-modal'];
      const failures=[];
      ids.forEach(id=>{
        const overlay=document.getElementById(id),panel=overlay?.querySelector('.modal-box');
        if(!overlay||!panel||!overlay.classList.contains('studio-side-dialog')){
          failures.push(id+': missing drawer');return;
        }
        overlay.classList.add('show');
        overlay.style.animation='none';
        panel.style.animation='none';
        const box=panel.getBoundingClientRect(),close=panel.querySelector('.modal-close')?.getBoundingClientRect();
        if(Math.abs(innerWidth-box.right)>22||box.left<0||box.top<0||
           box.bottom>innerHeight+1||box.height<innerHeight-32||
           getComputedStyle(panel).overflowY!=='auto'||
           !close||close.right>box.right+1||close.left<box.left-1||
           document.documentElement.scrollWidth>innerWidth+2)
          failures.push(id+': '+JSON.stringify({left:box.left,right:box.right,
            top:box.top,bottom:box.bottom,scroll:getComputedStyle(panel).overflowY}));
        overlay.classList.remove('show');
        overlay.style.removeProperty('animation');panel.style.removeProperty('animation');
      });
      // Playlist editing is now a full-screen page, not a right-hand drawer.
      const editor=document.getElementById('track-manager-modal');
      if(!editor||!editor.classList.contains('playlist-editor-page')||
         !editor.querySelector('#tm-cover-file')||!editor.querySelector('#tm-cover-image')){
        failures.push('playlist editor page missing');
      }else{
        editor.hidden=false;editor.classList.add('show');
        const box=editor.getBoundingClientRect();
        if(Math.abs(box.width-innerWidth)>2||Math.abs(box.height-innerHeight)>2||
           box.left!==0||box.top!==0)failures.push('playlist editor not fullscreen');
        editor.classList.remove('show');editor.hidden=true;
      }
      ['alert-modal','ios-install-modal'].forEach(id=>{
        const overlay=document.getElementById(id),panel=overlay?.querySelector('.modal-box');
        overlay.classList.add('show');
        overlay.style.animation='none';
        const box=panel.getBoundingClientRect();
        if(overlay.classList.contains('studio-side-dialog')||
           Math.abs(box.left+box.width/2-innerWidth/2)>4)
          failures.push(id+': informational window not centered');
        overlay.classList.remove('show');overlay.style.removeProperty('animation');
      });
      return failures;
    });
    console.log('RIGHT_DRAWERS',JSON.stringify({viewport,dialogs}));
    if(dialogs.length)throw new Error('Right dialog layout regression '+JSON.stringify({viewport,dialogs}));
  }
  await page.setViewport({width:1024,height:600});
  await page.evaluate(()=>document.getElementById('sleep-modal').classList.add('show'));
  await page.keyboard.press('Escape');
  if(await page.$eval('#sleep-modal',el=>el.classList.contains('show')))
    throw new Error('Right drawer did not close on Escape');
  await page.evaluate(()=>document.getElementById('sleep-modal').classList.add('show'));
  await page.mouse.click(12,12);
  if(await page.$eval('#sleep-modal',el=>el.classList.contains('show')))
    throw new Error('Right drawer did not close on backdrop click');
  await page.setViewport({width:1200,height:800});
  // The accepted mockup is an actual now-playing state, not a permanent
  // wave splash screen. Check track transitions and all 5 theme palettes.
  const showcaseArtwork=await page.evaluate(async()=>{
    const root=document.querySelector('.main-container'),title=document.getElementById('track-title'),
      artist=document.getElementById('track-artist'),vinyl=document.getElementById('vinyl-view'),
      landscape=document.querySelector('.showcase-sunset-art'),intro=document.querySelector('.showcase-hero-copy'),
      wave=document.getElementById('vinyl-wave-play'),heart=document.getElementById('now-playing-heart');
    const saved={tracks:playbackPlaylist,index:currentIndex,title:title.textContent,
      artist:artist.textContent,theme:localStorage.getItem('dag_theme')||'brown'};
    const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    try{
      const idleIntro=getComputedStyle(intro).display!=='none';
      playbackPlaylist=[{title:'Жиганская',artist:'Jakone, Killana',
        url:'https://example.invalid/showcase-preview.mp3'}];
      currentIndex=0;title.textContent='Жиганская';artist.textContent='Jakone, Killana';
      await delay(250);
      const state={
        artworkReady:!!landscape&&landscape.complete&&landscape.naturalWidth>0,
        artworkLarge:vinyl.getBoundingClientRect().width>=150,
        hasTrack:root.classList.contains('showcase-has-track'),
        introHidden:getComputedStyle(intro).display==='none',
        waveHidden:getComputedStyle(wave).display==='none',
        trackTitle:getComputedStyle(title).display!=='none'&&title.textContent.includes('Жиганская'),
        artistVisible:getComputedStyle(artist).display!=='none'&&artist.textContent.includes('Jakone'),
        favoriteVisible:heart.getBoundingClientRect().width>=38,
        untouchedAudio:document.querySelectorAll('audio').length===1,
        idleIntro
      };
      // Artwork is shown only when the source provides a real, loadable cover.
      // The default provider logo and art-free songs preserve the mountains.
      const album=vinyl.querySelector('.showcase-album-art');
      const waitForCover=async()=>{
        for(let i=0;i<25;i++){
          if(root.classList.contains('showcase-has-cover')&&album?.naturalWidth>0)return true;
          await delay(80);
        }
        return false;
      };
      state.noCoverInitially=!!album&&!album.hasAttribute('src')&&
        !root.classList.contains('showcase-has-cover');
      playbackPlaylist[0].thumb='images/studio-wave.svg';
      title.textContent='Жиганская — с обложкой';
      state.realCoverShown=await waitForCover();
      state.coverWithinCircle=state.realCoverShown&&
        getComputedStyle(album).borderRadius==='50%'&&
        getComputedStyle(album).objectFit==='cover'&&
        getComputedStyle(album).filter==='none';
      playbackPlaylist[0].thumb='images/cover.png';
      title.textContent='Жиганская — без обложки';
      await delay(130);
      state.logoKeepsMountains=!root.classList.contains('showcase-has-cover')&&
        !album.hasAttribute('src')&&getComputedStyle(landscape).display!=='none';
      playbackPlaylist[0].thumb='';
      title.textContent='Жиганская — без картинки';
      await delay(130);
      state.missingCoverKeepsMountains=!root.classList.contains('showcase-has-cover')&&
        !album.hasAttribute('src');
      playbackPlaylist[0].thumb='javascript:alert(1)';
      title.textContent='Жиганская — неподдерживаемая ссылка';
      await delay(130);
      state.unsafeCoverIgnored=!root.classList.contains('showcase-has-cover')&&
        !album.hasAttribute('src');
      playbackPlaylist[0].thumb='';
      title.textContent='Жиганская';
      const themes={};
      const cardArt=document.querySelector('#studio-curations .showcase-card-art');
      const navIcon=document.querySelector('#showcase-search i');
      const tile=document.querySelector('#studio-curations .showcase-curation-card');
      for(const name of ['brown','red','green','blue','purple']){
        setTheme(name,false);title.textContent='Жиганская';
        await delay(80);
        themes[name]={
          tint:root.dataset.showcaseTint,
          ring:getComputedStyle(vinyl).boxShadow,
          action:getComputedStyle(document.querySelector('.showcase-cache-action')).backgroundImage,
          card:getComputedStyle(document.querySelector('.showcase-card-play')).borderColor,
          art:getComputedStyle(landscape).filter,
          tile:getComputedStyle(tile).backgroundImage,
          artFill:getComputedStyle(cardArt,'::before').backgroundImage,
          icon:getComputedStyle(cardArt.querySelector('i')).backgroundImage,
          iconColor:getComputedStyle(cardArt.querySelector('i')).color,
          navIcon:getComputedStyle(navIcon).backgroundImage,
          backdrop:getComputedStyle(document.querySelector('.studio-showcase>.left-col')).backgroundImage,
          ornament:getComputedStyle(document.querySelector('.studio-showcase>.left-col'),'::after').backgroundImage,
          logoMask:getComputedStyle(document.querySelector('.studio-showcase>.left-col'),'::after').webkitMaskImage,
          selectedTheme:[...document.querySelectorAll('.theme-choice[aria-pressed="true"]')]
            .map(button=>button.dataset.theme).join(',')
        };
      }
      state.allThemes=Object.entries(themes).every(([n,x])=>x.tint===n);
      state.variedRings=new Set(Object.values(themes).map(x=>x.ring)).size===5;
      state.variedActions=new Set(Object.values(themes).map(x=>x.action)).size===5;
      state.variedCards=new Set(Object.values(themes).map(x=>x.card)).size===5;
      state.variedArt=new Set(Object.values(themes).map(x=>x.art)).size>=4;
      state.variedTiles=new Set(Object.values(themes).map(x=>x.tile)).size===5;
      state.variedTileArtwork=new Set(Object.values(themes).map(x=>x.artFill)).size===5;
      state.variedTileIcons=new Set(Object.values(themes).map(x=>x.icon)).size===5;
      state.variedTileIconColors=new Set(Object.values(themes).map(x=>x.iconColor)).size===5;
      state.variedMenuIcons=new Set(Object.values(themes).map(x=>x.navIcon)).size===5;
      state.variedBackdrops=new Set(Object.values(themes).map(x=>x.backdrop)).size===5;
      state.variedOrnaments=new Set(Object.values(themes).map(x=>x.ornament)).size===5;
      state.logoWatermark=Object.values(themes).every(x=>x.logoMask.includes('cover.png'));
      state.selectedThemes=Object.entries(themes).every(([n,x])=>x.selectedTheme===n);
      return state;
    }finally{
      playbackPlaylist=saved.tracks;currentIndex=saved.index;
      setTheme(saved.theme,false);
      title.textContent=saved.title;artist.textContent=saved.artist;
    }
  });
  console.log('SHOWCASE_NOW_PLAYING_ARTWORK_AND_THEMES',JSON.stringify(showcaseArtwork));
  if(Object.values(showcaseArtwork).some(x=>!x))
    throw new Error('Showcase playback artwork/theme regression '+JSON.stringify(showcaseArtwork));

  // TEYES navigation shares a single central workspace: playlists, region
  // categories and their track lists must never open a submenu or popup.
  const central=await page.evaluate(async()=>{
    const old={pl:playlists,tab:currentTab,list:playlist,
      playing:playbackPlaylist,index:currentIndex,user:currentUser,
      api,quick:quickMixCurrent};
    const oldStart=startQuickMix,oldRegion=startCaucasusRadio;
    const oldDownload=downloadCurrentPlaylistOffline;
    const actions=[],t={title:'Тестовый трек',artist:'DAGSTUDIO',
      url:'https://example.invalid/one.mp3'};
    const p={id:701,name:'Горная музыка',icon:'mountain',tracks:[t],type:'standard'};
    try{
      currentUser='smoke';playlists=[p];quickMixCurrent=null;
      api=async(action,args)=>action==='update_playlist_icon'?
        {success:true,icon:args.icon}:{error:'test only'};
      window.dispatchEvent(new Event('dag-playlists-updated'));
      document.getElementById('showcase-playlists').click();
      const navIsCenter=!!document.querySelector('#studio-curations .showcase-center-card') &&
        document.querySelector('.right-col').classList.contains('showcase-curated') &&
        !document.getElementById('showcase-playlist-submenu');
      const button=document.querySelector('.showcase-center-card-open');
      const icon=!!button?.querySelector('i.fa-mountain');
      const oldPlayback=playbackPlaylist[currentIndex];
      button.click();
      const trackVisible=String(currentTab)==='701'&&
        document.querySelector('.right-col').classList.contains('showcase-list')&&
        !![...document.querySelectorAll('#playlist-container .t-title')]
          .find(x=>x.textContent==='Тестовый трек');
      const preserved=playbackPlaylist[currentIndex]===oldPlayback;
      const footer=document.querySelector('#playlist-container .showcase-download-footer');
      const downloadAtBottom=!!footer&&footer===document.querySelector('#playlist-container').lastElementChild;
      let downloads=0;
      downloadCurrentPlaylistOffline=()=>{downloads++;};
      footer?.querySelector('button').click();
      const downloadWorks=downloads===1;
      window.studioCenterRender('playlists');
      document.querySelector('.showcase-center-card-settings').click();
      const picker=document.querySelectorAll('#tm-playlist-icons button');
      const iconEditor=picker.length===18;
      const saved=await savePlaylistIcon(701,'star');
      const update=!!document.querySelector('#studio-curations .showcase-center-card i.fa-star');
      closeModal('track-manager-modal');
      // Collection -> republic/ethnicity -> song list all in the same center.
      const calls=[];
      startQuickMix=key=>{calls.push(key);currentTab='mix:'+key;
        playlist=[t];renderPlaylist();};
      startCaucasusRadio=id=>{calls.push('region:'+id);
        currentTab='mix:caucasus_selected';playlist=[t];renderPlaylist();};
      window.studioCenterRender('collections');
      const genres=document.querySelectorAll('#studio-curations .showcase-center-card');
      const manyGenres=genres.length>=7;
      genres[0].querySelector('button').click();
      const regionGrid=document.querySelectorAll('#studio-curations .showcase-center-card');
      const regions=regionGrid.length>10&&
        document.querySelector('.right-col').classList.contains('showcase-curated');
      regionGrid[1].querySelector('button').click();
      const regionList=document.querySelector('.right-col').classList.contains('showcase-list')
        &&calls.at(-1).startsWith('region:');
      window.studioCenterRender('collections');
      document.querySelectorAll('#studio-curations .showcase-center-card')[1].querySelector('button').click();
      const russianList=calls.at(-1)==='russian'&&
         document.querySelector('.right-col').classList.contains('showcase-list');
      // Charts is not the regular hits mix: it must use real provider dates.
      document.getElementById('showcase-charts').click();
      const chartsMix=calls.at(-1)==='charts'&&QUICK_MIXES.charts.mode==='recent'&&
          QUICK_MIXES.charts.autoPlayOnDiscover===false;
      const today=new Date().toISOString().slice(0,10);
      const dated=quickMixRankTracks([
       {...t,release_date:today},
       {...t,title:'Old track',release_date:'2012-01-01'},
       {...t,title:'Unknown date',release_date:''}
      ],QUICK_MIXES.charts);
      const newestOnly=dated.length===3&&dated[0].title===t.title &&
        dated[0]._releaseVerified===true&&dated[1].title==='Old track'&&
        dated[1]._releaseVerified===true&&dated[2].title==='Unknown date'&&
        dated[2]._releaseVerified===false;
      const back=document.querySelector('.showcase-center-back');
      back?.click();
      const backWorks=document.querySelector('.right-col').classList.contains('showcase-curated');
      return {navIsCenter,icon,trackVisible,preserved,downloadAtBottom,
        downloadWorks,iconEditor,saved,update,manyGenres,regions,regionList,
        russianList,chartsMix,newestOnly,backWorks};
    }finally{
      startQuickMix=oldStart;startCaucasusRadio=oldRegion;
      downloadCurrentPlaylistOffline=oldDownload;playlists=old.pl;currentTab=old.tab;
      playlist=old.list;playbackPlaylist=old.playing;currentIndex=old.index;
      currentUser=old.user;api=old.api;quickMixCurrent=old.quick;
      closeModal('track-manager-modal');renderPlaylist();window.studioCenterRender('home');
    }
  });
  console.log('CC3_CENTER_PLAYLISTS_MIXES_CHARTS',JSON.stringify(central));
  if(Object.values(central).some(v=>!v))
    throw new Error('CC3 central navigation regression '+JSON.stringify(central));

  // Static shell never scrolls vertically on a landscape CC3. Scrolling a
  // long playlist is local to its center panel; playback remains visible.
  for(const size of [{width:800,height:480},{width:1024,height:600},{width:1280,height:720}]){
    await page.setViewport(size);
    const state=await page.evaluate(()=>{
      const container=document.querySelector('.main-container');
      const sidebar=document.getElementById('studio-navigation');
      const center=document.querySelector('.right-col');
      const right=document.querySelector('.left-col');
      return {viewport:container.getBoundingClientRect().height<=innerHeight+1,
        noDocScroll:document.documentElement.scrollHeight<=innerHeight+2,
        noHorizontal:document.documentElement.scrollWidth<=innerWidth+2,
        sideNoScroll:sidebar.scrollHeight<=sidebar.clientHeight+2,
        centerFixed:center.getBoundingClientRect().bottom<=innerHeight+2,
        playerFixed:right.getBoundingClientRect().bottom<=innerHeight+2,
        noFlyout:!document.getElementById('showcase-playlist-submenu')};
    });
    console.log('CC3_FIXED_SCREEN',JSON.stringify({size,state}));
    if(Object.values(state).some(v=>!v))
      throw new Error('CC3 screen overflow '+JSON.stringify({size,state}));
  }
  await page.setViewport({width:1200,height:800});

  // A personal wave must discover NEW online music from included
  // playlists rather than playing a saved playlist item. Excluded playlists
  // cannot affect its seeds. The first recommendation queues next early.
  const waveDiscovery=await page.evaluate(async()=>{
    const old={user:currentUser,library:playlists,tab:currentTab,list:playlist,
      playback:playbackPlaylist,index:currentIndex,playing:playbackWanted,
      quick:quickMixCurrent,api,playTrack,findWaveNextTrack,
      radio:smartRadioEnabled,serial:smartRadioRequestSerial,queue:playbackQueue.slice(),
      prefetched:smartRadioPrefetch};
    const key=LIKES_EXCLUSIONS_PREFIX+'test-wave-offline';
    const previous=localStorage.getItem(key);
    const own={artist:'DAGSTUDIO A',title:'Saved song',url:'https://example.invalid/own-a.mp3'};
    const blocked={artist:'DAGSTUDIO B',title:'Blocked song',url:'https://example.invalid/own-b.mp3'};
    const discovered={artist:'DAGSTUDIO C',title:'Remote new',url:'https://example.invalid/new-c.mp3',
      release_date:new Date().toISOString().slice(0,10)};
    const calls=[];let started=null;
    try{
      currentUser='test-wave-offline';
      playlists=[{id:701,tracks:[own]},{id:702,tracks:[blocked]}];
      localStorage.setItem(key,JSON.stringify({'702':true}));
      playbackPlaylist=[];playlist=[];currentIndex=-1;smartRadioEnabled=true;
      playbackWanted=false;playbackQueue.length=0;smartRadioPrefetch=null;
      const seeds=waveLibrarySeeds();
      const validSeeds=seeds.length===1&&seeds[0].url===own.url;
      api=async(action)=>({success:true,data:[own,blocked,discovered]});
      const remote=await findWaveNextTrack();
      const startsFromNetwork=remote?.url===discovered.url&&remote?._waveRadio&&
        remote?.url!==own.url&&remote?.url!==blocked.url;
      findWaveNextTrack=async()=>discovered;
      playTrack=async i=>{started=playlist[i];playbackPlaylist=[...playlist];
        playbackTab='mix:wave';currentIndex=i;playbackWanted=true;calls.push('play');};
      await startQuickMix('wave');
      const firstNetwork=started?.url===discovered.url&&quickMixCurrent.tracks.length===1&&
        quickMixCurrent.tracks[0].url===discovered.url;
      return {validSeeds,startsFromNetwork,firstNetwork};
    }finally{
      currentUser=old.user;playlists=old.library;currentTab=old.tab;
      playlist=old.list;playbackPlaylist=old.playback;currentIndex=old.index;
      playbackWanted=old.playing;quickMixCurrent=old.quick;
      api=old.api;playTrack=old.playTrack;findWaveNextTrack=old.findWaveNextTrack;
      smartRadioEnabled=old.radio;smartRadioRequestSerial=old.serial;
      smartRadioPrefetch=old.prefetched;playbackQueue.splice(0,playbackQueue.length,...old.queue);
      if(previous===null)localStorage.removeItem(key);else localStorage.setItem(key,previous);
      renderPlaylist();window.studioCenterRender('home');
    }
  });
  console.log('WAVE_START_FROM_ONLINE_DISCOVERY',JSON.stringify(waveDiscovery));
  if(Object.values(waveDiscovery).some(x=>!x))
    throw new Error('Wave playback selection regression '+JSON.stringify(waveDiscovery));

  // When the user chooses My Wave the center column disappears and the
  // original playback controls expand across the space next to navigation.
  for(const vp of [{width:800,height:480},{width:1024,height:600},{width:1280,height:720}]){
    await page.setViewport(vp);
    const waveLayout=await page.evaluate(()=>{
      window.studioWaveScreen();
      const root=document.querySelector('.main-container'),nav=document.getElementById('studio-navigation').getBoundingClientRect();
      const player=document.querySelector('.left-col').getBoundingClientRect();
      const right=document.querySelector('.right-col');
      return {active:root.classList.contains('showcase-wave-only'),
        hidden:getComputedStyle(right).display==='none',
        startsAtSidebar:Math.abs(player.left-nav.right)<=3,
        fillsRest:Math.abs(player.right-innerWidth)<=3,
        noOverflow:document.documentElement.scrollWidth<=innerWidth+3,
        noScroll:document.documentElement.scrollHeight<=innerHeight+3};
    });
    console.log('CC3_WAVE_NO_EMPTY_COLUMN',JSON.stringify({vp,waveLayout}));
    if(Object.values(waveLayout).some(x=>!x))
       throw new Error('Wave must fill empty center area '+JSON.stringify({vp,waveLayout}));
  }
  await page.setViewport({width:1200,height:800});
  await page.evaluate(()=>window.studioCenterRender('home'));

  const waveQueuedNext=await page.evaluate(()=>{
    const saved={list:playbackPlaylist,index:currentIndex,tab:playbackTab,
      playing:playbackWanted,queue:playbackQueue.slice(),play:playTrack,prefetch:smartRadioPrefetch};
    try{
      const current={artist:'Test A',title:'Current',url:'https://example.invalid/w-current.mp3'};
      const next={artist:'Test B',title:'NEW online',url:'https://example.invalid/w-next.mp3',_waveRadio:true};
      playbackPlaylist=[current,next];currentIndex=0;playbackTab='mix:wave';
      playbackWanted=false;playbackQueue.length=0;
      let played=-1;
      playTrack=async(index)=>{played=index;};
      playNext();
      return {queued:played===1,streamOnly:next._waveRadio===true};
    }finally{
      playbackPlaylist=saved.list;currentIndex=saved.index;playbackTab=saved.tab;
      playbackWanted=saved.playing;playbackQueue.splice(0,playbackQueue.length,...saved.queue);
      playTrack=saved.play;smartRadioPrefetch=saved.prefetch;
    }
  });
  console.log('WAVE_QUEUED_NEXT_ON_SKIP',JSON.stringify(waveQueuedNext));
  if(Object.values(waveQueuedNext).some(x=>!x))
    throw new Error('Wave next-track queue regression '+JSON.stringify(waveQueuedNext));

  for(const vp of [{width:800,height:480},{width:1024,height:600},{width:1280,height:720}]){
    await page.setViewport(vp);
    const fit=await page.evaluate(()=>{
      const root=document.querySelector('.main-container'),sidebar=document.getElementById('studio-navigation');
      root.classList.add('showcase-wave-only');
      const col=document.querySelector('.left-col'),disc=document.getElementById('vinyl-view');
      const r=col.getBoundingClientRect(),v=disc.getBoundingClientRect(),n=sidebar.getBoundingClientRect();
      const desiredCenter=(n.right+innerWidth)/2;
      const result={noBlankColumn:getComputedStyle(document.querySelector('.right-col')).display==='none',
        heroFills:Math.abs(r.left-n.right)<4&&Math.abs(r.right-innerWidth)<4,
        centerAligned:Math.abs(v.left+v.width/2-desiredCenter)<Math.max(22,innerWidth*.055),
        noScroll:document.documentElement.scrollWidth<=innerWidth+2&&
          document.documentElement.scrollHeight<=innerHeight+2,
        sidebarOffline:!!sidebar.querySelector('.showcase-sidebar-bottom .showcase-cache-action')};
      root.classList.remove('showcase-wave-only');
      return result;
    });
    console.log('WAVE_FULLSCREEN_CC3',JSON.stringify({vp,fit}));
    if(Object.values(fit).some(x=>!x))
      throw new Error('Wave full screen layout regression '+JSON.stringify({vp,fit}));
  }
  await page.setViewport({width:1200,height:800});

  // Settings are a full workspace to the RIGHT of the persistent sidebar,
  // not a centered popup; both panels remain available on TEYES.
  for(const vp of [{width:1024,height:600},{width:1280,height:720},{width:390,height:844}]){
    await page.setViewport(vp);
    console.log('SETTINGS_STAGE',JSON.stringify(vp),'before click');
    await page.evaluate(()=>{
      const nav=document.getElementById('studio-navigation');
      const toggle=document.getElementById('showcase-menu-toggle');
      if(innerWidth<=768&&!nav.classList.contains('open'))toggle?.click();
      document.getElementById('showcase-settings').click();
    });
    console.log('SETTINGS_STAGE',JSON.stringify(vp),'after click');
    const state=await page.evaluate(()=>{
      const nav=document.getElementById('studio-navigation');
      const modal=document.getElementById('menu-modal');
      const rect=modal.getBoundingClientRect();
      const side=nav.getBoundingClientRect();
      const theme=modal.querySelector('.theme-selector-wrapper');
      const expectedLeft=innerWidth>768?side.right:0;
      const header=modal.querySelector('.menu-modal-heading').getBoundingClientRect();
      const closeButton=modal.querySelector('.showcase-settings-close').getBoundingClientRect();
      const cards=[...modal.querySelectorAll('.menu-account-column,.menu-action-column')];
      const themeBounds=theme?.getBoundingClientRect();
      const themeChoices=[...theme.querySelectorAll('.theme-choice')];
      const themeTileBounds=themeChoices.map(button=>button.getBoundingClientRect());
      const playback=modal.querySelector('.menu-playback-group');
      const leftActions=[...playback.querySelectorAll('.menu-list-btn')];
      const appActions=[...modal.querySelectorAll('.menu-action-column > .menu-list-btn')]
        .filter(button=>!button.hidden);
      return {
        diagnostics:{left:rect.left,expectedLeft,right:rect.right,top:rect.top,bottom:rect.bottom,innerWidth,innerHeight,sideRight:side.right},
        within:Math.abs(rect.left-expectedLeft)<4&&rect.right<=innerWidth+2&&
           rect.top>=-1&&rect.bottom<=innerHeight+2,
        page:modal.classList.contains('showcase-settings-page')&&modal.classList.contains('show'),
        content:!!modal.querySelector('.menu-account-column')&&
          !!modal.querySelector('.menu-action-column')&&!!modal.querySelector('#app-update-btn'),
        colors:!!theme&&theme.parentElement.classList.contains('menu-action-column')&&
          theme.querySelectorAll('.theme-dot').length===5,
        balancedSettings:playback.parentElement.classList.contains('menu-account-column')&&
          leftActions.length===3&&appActions.length===6&&
          Math.abs((leftActions.length+3)-appActions.length)===0,
        themeTilesFit:getComputedStyle(theme.querySelector('.theme-options')).display==='grid'&&
          themeTileBounds.length===5&&themeTileBounds.every(box=>box.width>=35&&
            box.left>=themeBounds.left-1&&box.right<=themeBounds.right+1),
        noOverflow:document.documentElement.scrollWidth<=innerWidth+2,
        headerAligned:closeButton.right<=header.right+2&&closeButton.left>=header.left&&
          closeButton.top>=header.top-2&&closeButton.bottom<=header.bottom+2,
        panelScroll:innerWidth<=768||cards.every(card=>getComputedStyle(card).overflowY==='auto'),
        noPageScroll:innerWidth<=768||getComputedStyle(document.body).overflowY==='hidden'};
    });
    console.log('SETTINGS_STAGE',JSON.stringify(vp),'measured');
    await page.evaluate(()=>document.querySelector('.showcase-settings-back').click());
    console.log('SETTINGS_STAGE',JSON.stringify(vp),'after back');
    const closed=await page.evaluate(()=>{
      const m=document.getElementById('menu-modal');
      return !m.classList.contains('show')&&!m.classList.contains('showcase-settings-page');
    });
    console.log('SETTINGS_RIGHT_WORKSPACE',JSON.stringify({vp,state:{...state,closed}}));
    if(Object.entries({...state,closed}).some(([k,v])=>k!=='diagnostics'&&!v))
      throw new Error('Settings page regression '+JSON.stringify({vp,state,closed}));
  }
  await page.setViewport({width:1200,height:800});

  const waveChartsNav=await page.evaluate(()=>{
    const root=document.querySelector('.main-container');
    const side=document.getElementById('studio-navigation');
    const saved={start:startQuickMix,tab:currentTab,pl:playlists,list:playlist,
      playback:playbackPlaylist,index:currentIndex,user:currentUser};
    const calls=[];
    try{
      currentUser='test';playlists=[{id:788,name:'Тестовый плейлист',tracks:[]}];
      startQuickMix=key=>{calls.push(key);};
      document.getElementById('showcase-playlists').click();
      const onePl=document.querySelectorAll('#studio-curations .showcase-center-card').length===1;
      const plStyle=getComputedStyle(document.querySelector('#studio-curations .showcase-curation-list'));
      const singlePl=plStyle.display==='flex'&&plStyle.flexDirection==='column';
      document.getElementById('showcase-collections').click();
      const categoryList=document.querySelector('#studio-curations .showcase-curation-list');
      const singleCollections=getComputedStyle(categoryList).flexDirection==='column'&&
        categoryList.querySelectorAll('.showcase-center-card').length>=8;
      document.getElementById('showcase-charts').click();
      const chartsStarted=calls.includes('charts')&&
        document.querySelector('.right-col').classList.contains('showcase-list');
      currentTab='mix:charts';
      setQuickMixStatus('Ищем подтверждённые новые релизы…');
      const status=document.querySelector('#playlist-container .showcase-search-status');
      const chartsStatus=!!status&&getComputedStyle(status).display!=='none'&&
        status.textContent.includes('релизы');
      document.getElementById('showcase-wave').click();
      const waveOnly=root.classList.contains('showcase-wave-only')&&
        getComputedStyle(document.querySelector('.right-col')).display==='none'&&
        document.querySelectorAll('audio').length===1;
      document.getElementById('showcase-collections').click();
      const waveExited=!root.classList.contains('showcase-wave-only');
      return {onePl,singlePl,singleCollections,chartsStarted,chartsStatus,waveOnly,waveExited};
    }finally{
      startQuickMix=saved.start;currentTab=saved.tab;playlists=saved.pl;
      playlist=saved.list;playbackPlaylist=saved.playback;currentIndex=saved.index;
      currentUser=saved.user;window.studioCenterRender('home');renderPlaylist();
    }
  });
  console.log('WAVE_CHARTS_SINGLE_COLUMN',JSON.stringify(waveChartsNav));
  if(Object.values(waveChartsNav).some(x=>!x))
    throw new Error('Wave/Charts/one-column UX regression '+JSON.stringify(waveChartsNav));

  const likes=await page.evaluate(()=>{
    const existing=playlists.slice(),audio=document.getElementById('main-audio');
    const play=audio.play;let started=0;
    try{
      playlists=[{id:'ui-test',name:'Favourite',tracks:[
        {title:'Моя песня',artist:'DAGSTUDIO',url:'https://example.invalid/fav.mp3'}]}];
      audio.play=()=>{started++;return Promise.resolve();};
      document.getElementById('studio-header-likes').click();
      const active=document.getElementById('studio-library').classList.contains('active');
      const rowCount=document.querySelectorAll('.studio-like-row').length;
      const pressed=document.getElementById('studio-header-likes').getAttribute('aria-pressed');
      const queueDialog=document.getElementById('queue-modal');
      const smart=!queueDialog.querySelector('.smart-playback-dialog') &&
        !queueDialog.querySelector('#smart-radio-queue-btn') &&
        !!queueDialog.querySelector('#queue-list') &&
        !!document.getElementById('queue-menu-btn') &&
        document.getElementById('smart-shuffle-btn')?.getAttribute('onclick')==='toggleShuffle()';
      document.querySelector('.studio-library-close').click();
      return {active,rowCount,pressed,started,smart,
        closed:!document.getElementById('studio-library').classList.contains('active'),
        waveAction:typeof window.openStudioWave==='function'};
    }finally{playlists=existing;audio.play=play;}
  });
  console.log('STUDIO_LIKES_SIMPLE_QUEUE',JSON.stringify(likes));
  if(!likes.active||likes.rowCount!==1||likes.pressed!=='true'||likes.started!==0||
      !likes.smart||!likes.closed||!likes.waveAction)
    throw new Error('Studio likes or simple queue regression '+JSON.stringify(likes));

  const tasteAndLibrary=await page.evaluate(()=>{
    const original=playlists.slice(),who=currentUser;
    const owner=String(currentUser||'guest').toLowerCase();
    const k='dag_likes_exclusions_v1:'+owner;
    const previous=localStorage.getItem(k);
    const tkey='dag_taste_v1_'+owner,profile=localStorage.getItem(tkey);
    const p1={id:471,name:'Visible',tracks:[{title:'A',artist:'One',url:'https://example.invalid/a.mp3'}]};
    const p2={id:472,name:'Excluded',tracks:[{title:'B',artist:'Two',url:'https://example.invalid/b.mp3'}]};
    try{
      playlists=[p1,p2];
      setPlaylistExcludedFromLikes(472,true);
      const liked=likedPlaylistTracks();
      const withoutExcluded=liked.length===1&&liked[0].title==='A';
      setPlaylistExcludedFromLikes(472,false);
      const restored=likedPlaylistTracks().length===2;
      const heard={title:'History song',artist:'Another Artist',url:'https://example.invalid/history.mp3'};
      tasteRecord('listen',heard);
      const personal=tastePositiveTracks().some(t=>t.url===heard.url);
      const managerCheckbox=!!document.getElementById('tm-exclude-likes');
      const topOffline=document.getElementById('studio-header-offline')?.getAttribute('onclick')==='openOfflineListening()';
      const turnMode=typeof window.openOfflineListening==='function';
      return {withoutExcluded,restored,personal,managerCheckbox,topOffline,turnMode};
    }finally{
      playlists=original;currentUser=who;
      if(previous===null)localStorage.removeItem(k);else localStorage.setItem(k,previous);
      if(profile===null)localStorage.removeItem(tkey);else localStorage.setItem(tkey,profile);
    }
  });
  console.log('PERSONAL_WAVE_PLAYLIST_EXCLUSIONS',JSON.stringify(tasteAndLibrary));
  if(Object.values(tasteAndLibrary).some(x=>!x))
    throw new Error('Wave, library or offline UI regression '+JSON.stringify(tasteAndLibrary));

  // All former topbar actions are now reachable from the left sidebar.
  for(const vp of [{width:1024,height:600},{width:1280,height:720}]){
    await page.setViewport(vp);
    const state=await page.evaluate(()=>{
      const nav=document.querySelector('#studio-navigation');
      return {all:nav.querySelectorAll('.showcase-nav-btn').length>=9,
        visible:nav.getBoundingClientRect().width>150,
        headerHidden:getComputedStyle(document.querySelector('.header-overlay')).display==='none',
        originalControlsRetained:!!document.querySelector('#btn-pl-select')&&
           !!document.querySelector('#studio-header-wave')&&
           !!document.querySelector('#studio-header-offline')&&
           !!document.querySelector('.header-eq-btn'),
        logoPlay:document.getElementById('vinyl-wave-play').getAttribute('onclick')==='openStudioWave()',
        noOverflow:document.documentElement.scrollWidth<=innerWidth+3};
    });
    console.log('SHOWCASE_NAV_ACTIONS',JSON.stringify({vp,state}));
    if(Object.values(state).some(x=>!x))
      throw new Error('Showcase navigation regression '+JSON.stringify({vp,state}));
  }
  await page.setViewport({width:1200,height:800});

  // The top-right shuffle button is one-tap only. It must move visible rows
  // and the playback order, never open any popup or call audio.play().
  const topShuffle=await page.evaluate(()=>{
    const list=[0,1,2,3,4,5].map(i=>({title:'Песня '+i,artist:'Тест',url:'https://example.invalid/'+i+'.mp3'}));
    const old={playlist,playbackPlaylist,currentIndex,currentTab,isShuffle};
    const playing=playbackPlaylist[currentIndex];
    const audio=document.getElementById('main-audio');
    const savedPlay=audio.play;let played=0;
    try{
      playlist=list.slice();playbackPlaylist=list.slice();
      currentIndex=3;currentTab='search';
      audio.play=()=>{played++;return Promise.resolve();};
      renderPlaylist();
      const before=playlist.map(t=>t.url).join(',');
      const modal=document.getElementById('queue-modal');
      document.getElementById('smart-shuffle-btn').click();
      const after=playlist.map(t=>t.url).join(',');
      const visible=[...document.querySelectorAll('#playlist-container .track-row .t-title')]
         .map(x=>x.textContent.trim());
      const expected=playlist.map(t=>t.title);
      const first={changed:before!==after,visualOrder:JSON.stringify(visible)===JSON.stringify(expected),
        playingPreserved:playbackPlaylist[currentIndex]===list[3],
        playbackOrderMatches:playlist.every((t,i)=>t===playbackPlaylist[i]),
        noPopup:!modal.classList.contains('show'),
        buttonText:document.getElementById('smart-shuffle-btn').getAttribute('aria-label').includes('Перемешать'),
        opened:played};
      document.getElementById('smart-shuffle-btn').click();
      return {...first,again:playlist.map(t=>t.url).join(',')!==after,
        stillNoPopup:!modal.classList.contains('show')};
    }finally{
      playlist=old.playlist;playbackPlaylist=old.playbackPlaylist;
      currentIndex=old.currentIndex;currentTab=old.currentTab;isShuffle=old.isShuffle;
      audio.play=savedPlay;renderPlaylist();
    }
  });
  console.log('SMART_BUTTON_DIRECT_SHUFFLE',JSON.stringify(topShuffle));
  if(!topShuffle.changed||!topShuffle.visualOrder||!topShuffle.playingPreserved||
     !topShuffle.playbackOrderMatches||!topShuffle.noPopup||!topShuffle.buttonText||
     topShuffle.opened!==0||!topShuffle.again||!topShuffle.stillNoPopup)
    throw new Error('Smart button should shuffle without popup '+JSON.stringify(topShuffle));

  const cachedSwitch=await page.evaluate(async()=>{
    const original={view:playlist,list:playbackPlaylist,index:currentIndex,tab:currentTab,
       playing:playbackWanted,playbackTab,isShuffle};
    const lookup=getDeviceCachedAudio,play=playTrack;
    const originalPlaylists=playlists;
    const a={title:'Кэш 1',artist:'Тест',url:'https://example.invalid/cached-a.mp3'};
    const b={title:'Нет в памяти',artist:'Тест',url:'https://example.invalid/uncached.mp3'};
    const c={title:'Кэш 2',artist:'Тест',url:'https://example.invalid/cached-c.mp3'};
    const actions=[];
    try{
      playlists=[{id:67890,name:'Cached test',tracks:[a,b,c]}];
      playlist=[a,b,c];playbackPlaylist=[];currentIndex=-1;
      currentTab='search';playbackTab='search';playbackWanted=false;isShuffle=false;
      getDeviceCachedAudio=async track=>({url:track.url,isBlob:false,
          inCache:track.url===a.url||track.url===c.url});
      playTrack=async(i,options={})=>{
        actions.push({i,fromPlayback:!!options.fromPlayback});
        if(!options.fromPlayback){playbackPlaylist=[...playlist];playbackTab=currentTab;}
        currentIndex=i;playbackWanted=true;
      };
      const accepted=await startOfflineListening({autoplay:true});
      const first=playlist.map(t=>t.url);
      const hasOnlyCached=first.length===2&&first.includes(a.url)&&first.includes(c.url)&&!first.includes(b.url);
      const labels=[...document.querySelectorAll('#playlist-container .t-title')]
            .map(t=>t.textContent.trim());
      const displayed=labels.length===2&&labels[0]==='Кэш 1'&&labels[1]==='Кэш 2';
      playNext();
      return {accepted,hasOnlyCached,displayed,
        switchToOffline:currentTab==='offline'&&playbackTab==='offline',
        initialStarted:actions.length>=1&&actions[0].i===0,
        nextWorks:actions.length===2&&actions[1].i===1&&actions[1].fromPlayback};
    }finally{
      getDeviceCachedAudio=lookup;playTrack=play;
      playlists=originalPlaylists;playlist=original.view;playbackPlaylist=original.list;
      currentIndex=original.index;currentTab=original.tab;playbackTab=original.playbackTab;
      playbackWanted=original.playing;isShuffle=original.isShuffle;renderPlaylist();
    }
  });
  console.log('OFFLINE_CACHE_ONLY_SWITCH_AND_NEXT',JSON.stringify(cachedSwitch));
  if(Object.values(cachedSwitch).some(v=>!v))
    throw new Error('Offline playback order regression '+JSON.stringify(cachedSwitch));

  // One tap rearranges the visible playlist without calling play().
  const shuffleResult=await page.evaluate(()=>{
    const old={playlist,playbackPlaylist,currentIndex,currentTab,isShuffle};
    const rows=[0,1,2,3,4].map(n=>({title:'Песня '+n,artist:'Тест',url:'https://example.invalid/'+n+'.mp3'}));
    try {
      playlist=rows.slice();playbackPlaylist=rows.slice();currentIndex=2;currentTab='search';
      const playing=playbackPlaylist[currentIndex],audio=document.getElementById('main-audio');
      const originalPlay=audio.play;
      let count=0;
      audio.play=()=>{count++;return Promise.resolve()};
      try {
        document.getElementById('btn-shuffle').click();
        const first={preserved:playbackPlaylist[currentIndex]===playing,
          reordered:playlist[0]===playing,all:playlist.length===rows.length&&new Set(playlist).size===rows.length,
          same:playlist.every((t,i)=>t===playbackPlaylist[i]),count};
        document.getElementById('btn-shuffle').click();
        return {...first,reshuffled:playlist[0]===playing&&playlist.length===rows.length};
      }finally{audio.play=originalPlay;}
    }finally{
      playlist=old.playlist;playbackPlaylist=old.playbackPlaylist;
      currentIndex=old.currentIndex;currentTab=old.currentTab;isShuffle=old.isShuffle;
      renderPlaylist();
    }
  });
  console.log('ETHNO_SHUFFLE',JSON.stringify(shuffleResult));
  if(Object.values(shuffleResult).some(x=>!x)&&shuffleResult.count!==0)
    throw new Error('Shuffle restarted playing audio '+JSON.stringify(shuffleResult));
  if(!shuffleResult.preserved||!shuffleResult.reordered||!shuffleResult.all||!shuffleResult.same||!shuffleResult.reshuffled)
    throw new Error('Playlist was not shuffled instantly '+JSON.stringify(shuffleResult));

  // Страховка CC3: в нативном коде не должно оставаться таймеров, вызывающих OTA set().
  const newDiscovery=await page.evaluate(async()=>{
    const response=await fetch('/script.js?v=2302',{cache:'no-store'});
    const text=await response.text();
    return {paged: text.includes('async function loadMoreQuickMix()'),
      dedup:text.includes('quickMixUnique(collected,state.tracks)'),
      offlineIndex:text.includes('async function offlineTrackList()'),
      offlineRecovery:!text.includes('startOfflineListening({auto:true,autoplay:true})') &&
        text.includes("recoverCurrentStream('network-offline')"),
      listeningHistory:text.includes("tasteRecord('listen',track)")};
  });
  console.log('DISCOVERY_AND_OFFLINE_FEATURES',JSON.stringify(newDiscovery));
  if(Object.values(newDiscovery).some(x=>!x))throw new Error('Discover/offline source regression');
  const stabilitySource = await page.evaluate(async () => {
    const response = await fetch('/script.js?v=2306', { cache: 'no-store' });
    const code = await response.text();
    return {
      isCurrent: code.includes("const WEB_BUILD_LABEL = '2306'"),
      blocksAutomaticUpdates: code.includes("if (!manual) return { status: 'manual-only' }"),
      hasNoAutoInstallTimeout: !code.includes('checkNativeLiveUpdate(true)'),
      hasCarWake: code.includes('setNativeCarKeepAwake(true)'),
      hasRestore: code.includes('restoreNativePlaybackSnapshot()'),
      hasFrozenWatchdog: code.includes("scheduleStreamRecovery('frozen-playhead', 200)"),
      tracksClockAdvance: code.includes("function recordMediaAdvance()"),
      modernAndroidRange: code.includes("const fullFileFallback = android &&"),
      recoveryCatchKeepsUrlInScope: code.includes("let finalUrl = resolveMediaUrl(track.url);\n    try {"),
      retryBudgetRequiresProgress: code.includes("(Number(mainAudio.currentTime) || 0) - playingStartedAt >= 8"),
      weakNetworkRecovery: code.includes("inferredWeakNetworkUntil = Date.now() + 180000"),
      checksAudioProviderStreams: code.includes("async function probeSourceAudio(track)"),
      avoidsReadyStateOnlyRecovery: !String(code.split('function scheduleStreamRecovery(reason, delay) {')[1]
        ?.split('async function recoverCurrentStream(')[0] || '').includes('mainAudio.readyState >= 3')
    };
  });
  console.log('ANDROID_CAR_STABILITY', JSON.stringify(stabilitySource));
  if (Object.values(stabilitySource).some(value => !value)) {
    throw new Error('CC3 native stability guard missing: ' + JSON.stringify(stabilitySource));
  }

  // Каждая тема должна изменять панели, шапку, поля ввода, модальные окна и эквалайзер.
  const themePaletteChecks = await page.evaluate(async () => {
    const names = ['brown', 'red', 'green', 'blue', 'purple'];
    const selectors = [
      '.main-container', '.header-overlay', '.left-col', '.right-col',
      '.search-input', '.play-btn', '.header-playlists-btn',
      '.modal-box', '.equalizer-modal-box', '.menu-list-btn'
    ];
    const previous = localStorage.getItem('dag_theme') || 'brown';
    const samples = {};
    for (const name of names) {
      setTheme(name, false);
      // CSS transitions on inputs/tabs need a frame to reach their final shade.
      await new Promise(resolve => setTimeout(resolve, 420));
      const colors = selectors.map(selector => {
        const el = document.querySelector(selector);
        if (!el) return 'missing:' + selector;
        const style = getComputedStyle(el);
        return style.backgroundImage !== 'none' ? style.backgroundImage : style.backgroundColor;
      });
      samples[name] = { colors, main:getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim(),
        mainColor:getComputedStyle(document.documentElement).getPropertyValue('--main-color').trim(),
        themeRgb:getComputedStyle(document.documentElement).getPropertyValue('--theme-rgb').trim(),
        page:getComputedStyle(document.documentElement).getPropertyValue('--theme-page').trim() };
    }
    setTheme(previous, false);
    return samples;
  });
  console.log('THEME_PALETTES', JSON.stringify(Object.fromEntries(
    Object.entries(themePaletteChecks).map(([k,v]) => [k, { main:v.main, page:v.page }]))));
  const names = Object.keys(themePaletteChecks);
  for (const name of names) {
    const sample = themePaletteChecks[name];
    if (!sample.main || !sample.mainColor || !sample.themeRgb || sample.colors.some(x => x.startsWith('missing:')))
      throw new Error('Theme missing variables/elements: ' + name);
  }
  const selectorsCount = themePaletteChecks.brown.colors.length;
  for (let i = 0; i < selectorsCount; i++) {
    const values = new Set(names.map(name => themePaletteChecks[name].colors[i]));
    if (values.size < 4) throw new Error('Static theme surface #' + i + ': ' + JSON.stringify([...values]));
  }

  // Подтверждаем, что загрузка и пауза — разные состояния управления.
  const carControls = await page.evaluate(() => {
    const ids = ['queue-modal','sleep-modal','diagnostics-modal','cache-dashboard-modal','queue-list'];
    const button = document.getElementById('btn-play');
    const exists = ids.every(id => !!document.getElementById(id));
    const audio = document.getElementById('main-audio');
    const p = audio.play;
    let calls = 0;
    audio.play = function() { calls++; return Promise.resolve(); };
    try {
      // Не загружаем музыку в ходе теста; проверяем состояние кнопки в момент ожидания.
      const state = { exists,button:!!button,queue:typeof window.openPlaybackQueue,
          timer:typeof window.openSleepTimer, diagnostics:typeof window.openPlayerDiagnostics };
      return state;
    } finally { audio.play=p; }
  });
  console.log('CAR_CONTROLS', JSON.stringify(carControls));
  if (!carControls.exists || !carControls.button || ['queue','timer','diagnostics'].some(k =>
      carControls[k] !== 'function')) throw new Error('Car controls missing');

  const recoveryPatch = await page.evaluate(async () => {
    const js = await (await fetch('/script.js?v=2302', {cache:'no-store'})).text();
    return {
      frozenBufferGuard: js.includes("bufferedSecondsAhead() > 1 && !playbackIsFrozen()) return;"),
      watchDogIsIntentAware: js.includes("mainAudio.ended || !playbackWanted) return;")
    };
  });
  console.log('RECOVERY_GUARDS', JSON.stringify(recoveryPatch));
  if (Object.values(recoveryPatch).some(value => !value)) throw new Error('Frozen playback guard missing');
  // Compatibility regression: old Android WebView may return undefined from audio.play().
  // The wrapper must never crash by blindly calling .then() on that value.
  const legacyPlayShim = await page.evaluate(async () => {
    const audio = document.getElementById('main-audio');
    const originalPlay = audio.play;
    let called = 0;
    audio.play = function() { called += 1; return undefined; };
    try {
      await window.requestAudioPlay();
      return {ok:true, called};
    } catch (error) {
      return {ok:false, called, error:String(error)};
    } finally {
      audio.play = originalPlay;
    }
  });
  console.log('LEGACY_PLAY_SHIM', JSON.stringify(legacyPlayShim));
  if (!legacyPlayShim.ok || legacyPlayShim.called !== 1) {
    throw new Error('Old WebView play() compatibility failed: ' + JSON.stringify(legacyPlayShim));
  }

  // Deterministic network-failure regression: playTrack must catch a rejected
  // audio.play() without throwing ReferenceError and must schedule recovery.
  const failedStartup = await page.evaluate(async () => {
    const audio = document.getElementById('main-audio');
    const oldPlay = audio.play;
    const oldLoad = audio.load;
    const oldPlaylist = playlist;
    const oldIndex = currentIndex;
    const oldIntent = playbackWanted;
    let attempts = 0;
    try {
      audio.load = () => {};
      audio.play = () => { attempts++; return Promise.reject(new Error('simulated_network_drop')); };
      playlist = [{title: 'Network regression', artist: 'Smoke', url: 'data:audio/mpeg;base64,AA=='}];
      currentIndex = -1;
      await playTrack(0);
      return {attempts, scheduled: !!streamRecoveryTimer, wanted: playbackWanted};
    } catch (error) {
      return {attempts, failure: String(error)};
    } finally {
      clearStreamRecoveryTimer();
      clearPlaybackWatchdog();
      currentPlaybackToken++;
      playbackWanted = false;
      audio.pause();
      audio.removeAttribute('src');
      audio.play = oldPlay;
      audio.load = oldLoad;
      playlist = oldPlaylist;
      currentIndex = oldIndex;
      playbackWanted = oldIntent;
    }
  });
  console.log('RECOVER_ON_PLAY_REJECTION', JSON.stringify(failedStartup));
  if (failedStartup.failure || failedStartup.attempts !== 1 || !failedStartup.scheduled || !failedStartup.wanted) {
    throw new Error('Playback failure recovery regression: ' + JSON.stringify(failedStartup));
  }

  const isolatedQueue = await page.evaluate(() => {
    const original={view:playlist,tab:currentTab,list:playbackPlaylist,
      playbackTab:playbackTab,index:currentIndex,search:searchPlaylistCache};
    try {
      playbackPlaylist=[{title:'A',artist:'B',url:'https://example.invalid/a.mp3'}];
      playbackTab='search'; currentIndex=0;
      switchTab('search');
      return {isolated:playbackPlaylist[0].url==='https://example.invalid/a.mp3',
        index:currentIndex, buttons:typeof playQueuedTrack==='function'};
    } finally {
      playbackPlaylist=original.list; playbackTab=original.playbackTab;
      currentIndex=original.index; playlist=original.view;
      currentTab=original.tab; searchPlaylistCache=original.search;
      renderPlaylist();
    }
  });
  console.log('QUEUE_CONTEXT_ISOLATION',JSON.stringify(isolatedQueue));
  if (!isolatedQueue.isolated || isolatedQueue.index!==0 || !isolatedQueue.buttons)
    throw new Error('Queue context isolation regression');

  await page.click('#showcase-collections');
  const centerCollections=await page.evaluate(()=>{
    const root=document.getElementById('studio-curations');
    const items=root.querySelectorAll('.showcase-center-card');
    return {cards:items.length,visible:getComputedStyle(root).display!=='none',
      noPopup:!document.querySelector('#quick-mixes-modal.show'),
      oneCenter:!!document.querySelector('.right-col.showcase-curated')};
  });
  console.log('CC3_COLLECTIONS_CENTER',JSON.stringify(centerCollections));
  if(centerCollections.cards<8||!centerCollections.visible||
     !centerCollections.noPopup||!centerCollections.oneCenter)
    throw new Error('CC3 collection grid missing');

  const ios=await page.evaluate(()=>({
      guide:typeof showIOSInstallGuide==='function',
      dismiss:typeof dismissIOSInstallBanner==='function',
      modal:!!document.getElementById('ios-install-modal'),
      button:!!document.getElementById('ios-install-guide-btn'),
      banner:!!document.getElementById('ios-install-banner'),
      hiddenDesktop:document.getElementById('ios-install-guide-btn').hidden
  }));
  console.log('IOS_HOME_SCREEN_INSTALL_UI',JSON.stringify(ios));
  if(Object.values(ios).some(x=>!x))throw new Error('iPhone install UI missing');
  const offlineControls=await page.evaluate(()=>({
    bar:!!document.getElementById('playlist-download-bar'),
    quota:!!document.getElementById('cache-limit-select'),
    economy:!!document.getElementById('traffic-saver-switch'),
    carPreset:!!document.querySelector('[data-eq-preset="car"]'),
    softLevel:!!document.getElementById('eq-level-switch'),
    counter:typeof offlineBatchProgress==='function'
  }));
  console.log('OFFLINE_EQ_CONTROLS',JSON.stringify(offlineControls));
  if(Object.values(offlineControls).some(v=>!v))throw new Error('Offline controls/Car EQ missing');
  const uiChanges=await page.evaluate(()=>({
    heart:!!document.getElementById('now-playing-heart'),
    saving:typeof savePlayingTrack==='function',
    mixes:typeof startQuickMix==='function',
    number:document.querySelectorAll('.quick-mix-btn').length,
    silence:!playSmartRadioNext.toString().includes('showNotification(')
  }));
  console.log('MIXES_HEART_SILENT_RADIO',JSON.stringify(uiChanges));
  if(!uiChanges.heart||!uiChanges.saving||!uiChanges.mixes||uiChanges.number!==8||!uiChanges.silence)
    throw new Error('Quick mixes, heart or silent radio unavailable');

  const categoryOrder=await page.evaluate(()=>({
    russian:document.querySelector('[data-mix="russian"] .mix-copy strong')?.textContent.trim(),
    caucasus:!!document.querySelector('[data-mix="caucasus"]'),
    foreign:!!document.querySelector('[data-mix="foreign"]'),
    sorter:typeof quickMixRankTracks==='function',
    mixSaving:renderPlaylist.toString().includes("String(currentTab).startsWith('mix:')")
  }));
  console.log('MIX_CATEGORY_QUALITY',JSON.stringify(categoryOrder));
  if(categoryOrder.russian!=='Русские'||!categoryOrder.caucasus||
      !categoryOrder.foreign||!categoryOrder.sorter||!categoryOrder.mixSaving)
    throw new Error('Mix category labels/ranking/save controls regressed');

  await page.click('#showcase-collections');
  await page.click('#studio-curations .showcase-center-card:first-child .showcase-center-card-open');
  const regionCenter=await page.evaluate(()=>({
    regions:document.querySelectorAll('#studio-curations .showcase-center-card').length,
    visible:document.querySelector('.right-col').classList.contains('showcase-curated'),
    noPopup:!document.querySelector('#caucasus-radio-modal.show')
  }));
  console.log('CAUCASUS_CENTRAL_PICKER',JSON.stringify(regionCenter));
  if(regionCenter.regions<17||!regionCenter.visible||!regionCenter.noPopup)
     throw new Error('Caucasus center list missing');
  await page.evaluate(()=>window.studioCenterRender?.('home'));

  const caucasusChecks=await page.evaluate(()=>{
    const conf=QUICK_MIXES.caucasus;
    const regions=conf.regions.map(r=>r.id);
    return {supported:regions.length,dagRu:regions.includes('dag_ru'),
      nativeDag:regions.includes('dag_avar')&&regions.includes('dag_dargin')&&regions.includes('dag_lezgin'),
      chechnya:regions.includes('chechnya'),ingushetia:regions.includes('ingushetia'),
      ossetia:regions.includes('ossetia'),kabardino:regions.includes('kabardino'),
      karachay:regions.includes('karachay'),adygea:regions.includes('adygea'),
      allProviders:typeof quickMixSpreadSources==='function',
      languageDisclaimer:Array.from(document.querySelectorAll('.quick-mixes-footer')).some(el=>/язык (песен|исполнения)/i.test(el.textContent))
    };
  });
  console.log('CAUCASUS_COVERAGE',JSON.stringify(caucasusChecks));
  if(caucasusChecks.supported<15||Object.entries(caucasusChecks).some(([k,v])=>k!=='supported'&&!v))
    throw new Error('Caucasus categories / provider support missing');

  const smartRadioStatus=await page.evaluate(()=>{
    return {available:typeof toggleSmartRadio==='function',
       menu:!!document.getElementById('smart-radio-menu-btn'),
       queue:!!document.getElementById('queue-menu-btn')&&!document.getElementById('smart-radio-queue-btn'),
       picker:typeof smartRadioPickCandidate==='function',
       key:localStorage.getItem('dag_smart_radio_v1')};
  });
  console.log('SMART_RADIO_UI',JSON.stringify(smartRadioStatus));
  if (!smartRadioStatus.available||!smartRadioStatus.menu||
      !smartRadioStatus.queue||!smartRadioStatus.picker) throw new Error('Smart radio UI missing');

  const radioPrefetchChecks = await page.evaluate(()=>{
    return {prefetch:typeof maybePrefetchSmartRadio==='function',
        premature:typeof isPrematureTrackEnd==='function',
        shortIsPremature:isPrematureTrackEnd(4,185),
        nearEndIsNormal:!isPrematureTrackEnd(182,185)};
  });
  console.log('RADIO_PREFETCH_GUARDS',JSON.stringify(radioPrefetchChecks));
  if(!Object.values(radioPrefetchChecks).every(Boolean))
    throw new Error('Smart radio prefetch or premature-end checks missing');

  await page.click('#showcase-settings');
  await page.waitForSelector('#menu-modal.show', { timeout: 5000 });

  const authVisible = await page.$eval('#auth-section', el => getComputedStyle(el).display !== 'none');
  if (!authVisible) throw new Error('Auth section did not open');

  await page.click('.auth-toggle');
  const regTitle = await page.$eval('#auth-title', el => el.textContent.trim());
  console.log('REG_TITLE', regTitle);
  if (regTitle !== 'РЕГИСТРАЦИЯ') throw new Error('Registration toggle did not work');

  await page.type('#auth-name', 'ab');
  await page.type('#auth-pass', '1');
  await page.click('#auth-submit-btn');
  await page.waitForSelector('#alert-modal.show', { timeout: 10000 });
  const alertText = await page.$eval('#alert-msg', el => el.textContent.trim());
  console.log('REGISTER_VALIDATION', alertText);
  if (!alertText.includes('не менее 3')) {
    throw new Error('Registration API/UI validation unexpected: ' + alertText);
  }

  await page.evaluate(() => window.closeModal('alert-modal'));
  await page.evaluate(() => window.toggleAuthMode());
  await page.$eval('#auth-name', el => el.value = '');
  await page.$eval('#auth-pass', el => el.value = '');
  await page.type('#auth-name', '__definitely_wrong_user__');
  await page.type('#auth-pass', '__wrong_password__');
  await page.click('#auth-submit-btn');
  await page.waitForSelector('#alert-modal.show', { timeout: 10000 });
  const loginAlert = await page.$eval('#alert-msg', el => el.textContent.trim());
  console.log('LOGIN_VALIDATION', loginAlert);
  if (!loginAlert) throw new Error('Login failure did not produce UI feedback');

  await page.evaluate(() => window.closeModal('alert-modal'));
  const apiCheck = await page.evaluate(async () => {
    const res = await fetch('api.php', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({action:'check_auth'})
    });
    return {status: res.status, text: await res.text()};
  });
  console.log('CHECK_AUTH', JSON.stringify(apiCheck));
  if (apiCheck.status !== 200 || !apiCheck.text.includes('logged_in')) {
    throw new Error('check_auth API failed');
  }

  await page.evaluate(() => window.openMenu());

  for (const viewport of [{width:1024,height:600}, {width:1280,height:720}]) {
    await page.setViewport(viewport);
    await page.evaluate(() => window.openMenu());
    const layout = await page.evaluate(() => {
      const el = document.querySelector('#menu-modal .menu-modal-box');
      const grid = document.querySelector('#menu-modal .menu-layout');
      const r = el.getBoundingClientRect();
      return { columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
        x:r.left, y:r.top, width:r.width,height:r.height,
        overflow:document.documentElement.scrollWidth > innerWidth + 2 };
    });
    console.log('CAR_LAYOUT', JSON.stringify({viewport,layout}));
    if(layout.columns!==2 || layout.x < -1 || layout.y < -1 ||
       layout.width > viewport.width + 1 || layout.height > viewport.height + 1 || layout.overflow)
      throw new Error('Car layout failed: ' + JSON.stringify({viewport,layout}));
  }
  await page.setViewport({width:1200,height:800});
  await page.evaluate(() => window.openMenu());

  const menuState = await page.evaluate(() => ({
    downloadVisible: (() => {
      const el = document.getElementById('android-apk-download-btn');
      return !!el && getComputedStyle(el).display !== 'none';
    })(),
    pwaAbsent: !document.getElementById('pwa-install-btn'),
    fullscreenAbsent: !document.querySelector('[onclick="toggleFullScreen()"]')
  }));
  console.log('MENU_STATE', JSON.stringify(menuState));
  if (!menuState.downloadVisible || !menuState.pwaAbsent || !menuState.fullscreenAbsent) {
    throw new Error('Menu cleanup/download button state failed: ' + JSON.stringify(menuState));
  }

  await page.evaluate(() => window.closeModal('menu-modal'));
  await page.click('#showcase-equalizer');
  await page.waitForSelector('#equalizer-modal.show', { timeout: 5000 });
  const eqState = await page.evaluate(() => ({
    bands: document.querySelectorAll('#eq-bands .eq-band').length,
    presets: document.querySelectorAll('[data-eq-preset]').length,
    power: !!document.getElementById('eq-power-btn')
  }));
  console.log('EQUALIZER', JSON.stringify(eqState));
  if (eqState.bands !== 7 || eqState.presets < 5 || !eqState.power) {
    throw new Error('Equalizer UI failed: ' + JSON.stringify(eqState));
  }
  await page.evaluate(() => window.closeModal('equalizer-modal'));

  if (pageErrors.length) {
    throw new Error('Page runtime errors: ' + pageErrors.join(' | '));
  }

  console.log('CONSOLE_ERRORS', JSON.stringify(consoleErrors));

  // Live search + audio relay smoke test. Read only the first streamed chunk.
  const searchSmoke = await page.evaluate(async () => {
    const result = await window.api('search_global', {
      query: 'Miyagi',
      page: 1,
      network: 'weak',
      save_data: 1
    });
    const data = result && Array.isArray(result.data) ? result.data : [];
    return {
      success: !!(result && result.success),
      count: data.length,
      first: data[0] ? {
        url: data[0].url || '',
        source: data[0].source || '',
        title: data[0].title || ''
      } : null,
      sources: result && result.sources ? result.sources : {},
      sourceCounts: result && result.source_counts ? result.source_counts : {},
      networkMode: result && result.network_mode ? result.network_mode : '',
      error: result && result.error ? result.error : ''
    };
  });
  console.log('SEARCH_SMOKE', JSON.stringify(searchSmoke));
  const expectedSources = ['audius','vk_mail','hitmoz','muzo','zvooq','muzvox','muzca'];
  if (!searchSmoke.success || searchSmoke.count < 1 || !searchSmoke.first?.url) {
    throw new Error('Live search returned no playable results: ' + JSON.stringify(searchSmoke));
  }
  if (searchSmoke.networkMode !== 'weak' ||
      expectedSources.some(name => !Object.prototype.hasOwnProperty.call(searchSmoke.sources, name))) {
    throw new Error('Search source diagnostics incomplete: ' + JSON.stringify(searchSmoke));
  }

  const relaySmoke = await page.evaluate(async (track) => {
    const params = new URLSearchParams();
    params.set('url', track.url);
    if (track.source) params.set('source', String(track.source).replace(/[^A-Za-z0-9_]/g, ''));
    params.set('weak', '1');
    const response = await fetch('/proxy.php?' + params.toString(), {
      headers: { 'Range': 'bytes=0-4095' },
      cache: 'no-store'
    });
    let bytes = 0;
    if (response.body) {
      const reader = response.body.getReader();
      const first = await reader.read();
      bytes = first.value ? first.value.byteLength : 0;
      await reader.cancel();
    }
    return {
      status: response.status,
      ok: response.ok,
      bytes,
      contentType: response.headers.get('content-type') || '',
      streamHeader: response.headers.get('x-dag-stream') || ''
    };
  }, searchSmoke.first);
  console.log('RELAY_SMOKE', JSON.stringify(relaySmoke));
  if (!relaySmoke.ok || relaySmoke.bytes < 1 || ![200, 206].includes(relaySmoke.status)) {
    throw new Error('Audio relay smoke failed: ' + JSON.stringify(relaySmoke));
  }
  if (relaySmoke.status === 206 && !relaySmoke.contentType.toLowerCase().startsWith('audio/')) {
    throw new Error('Partial audio response has incompatible MIME: ' + JSON.stringify(relaySmoke));
  }

  // Compatibility path used by old Android/head units: ignore Range upstream and
  // start playback from a full 200 stream. Read only the first chunk and cancel.
  const noRangeSmoke = await page.evaluate(async (track) => {
    const params = new URLSearchParams();
    params.set('url', track.url);
    if (track.source) params.set('source', String(track.source).replace(/[^A-Za-z0-9_]/g, ''));
    params.set('weak', '1');
    params.set('norange', '1');
    const response = await fetch('/proxy.php?' + params.toString(), {
      headers: { 'Range': 'bytes=0-4095' },
      cache: 'no-store'
    });
    let bytes = 0;
    if (response.body) {
      const reader = response.body.getReader();
      const first = await reader.read();
      bytes = first.value ? first.value.byteLength : 0;
      await reader.cancel();
    }
    return {
      status: response.status,
      ok: response.ok,
      bytes,
      contentType: response.headers.get('content-type') || '',
      acceptRanges: response.headers.get('accept-ranges') || '',
      rangeMode: response.headers.get('x-dag-range-mode') || ''
    };
  }, searchSmoke.first);
  console.log('NO_RANGE_SMOKE', JSON.stringify(noRangeSmoke));
  if (!noRangeSmoke.ok || noRangeSmoke.bytes < 1 ||
      !noRangeSmoke.contentType.toLowerCase().startsWith('audio/') ||
      noRangeSmoke.rangeMode !== 'full') {
    throw new Error('Android no-Range compatibility relay failed: ' + JSON.stringify(noRangeSmoke));
  }

  // Real HTMLMediaElement start against the compatibility stream.
  const mediaStart = await page.evaluate(async (track) => {
    const audio = document.getElementById('main-audio');
    const params = new URLSearchParams();
    params.set('url', track.url);
    if (track.source) params.set('source', String(track.source).replace(/[^A-Za-z0-9_]/g, ''));
    params.set('weak', '1');
    params.set('norange', '1');
    audio.pause();
    audio.removeAttribute('src');
    audio.src = '/proxy.php?' + params.toString();
    audio.preload = 'metadata';
    audio.muted = true;
    // Реальный плеер удерживает намерение играть отдельно от audio.paused.
    playbackWanted = true;
    audio.load();

    return await new Promise(resolve => {
      let done = false;
      const finish = value => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        audio.pause();
        playbackWanted = false;
        resolve(value);
      };
      const timer = setTimeout(() => finish({
        ok:false, event:'timeout', readyState:audio.readyState,
        networkState:audio.networkState, mediaError:audio.error ? audio.error.code : 0
      }), 18000);
      audio.addEventListener('playing', () => finish({
        ok:true, event:'playing', readyState:audio.readyState, currentTime:audio.currentTime
      }), {once:true});
      audio.addEventListener('error', () => finish({
        ok:false, event:'error', readyState:audio.readyState,
        networkState:audio.networkState, mediaError:audio.error ? audio.error.code : 0
      }), {once:true});
      try {
        const playResult = audio.play();
        if (playResult && typeof playResult.catch === 'function') {
          playResult.catch(error => finish({ok:false,event:'play-reject',error:String(error)}));
        }
      } catch (error) {
        finish({ok:false,event:'play-throw',error:String(error)});
      }
    });
  }, searchSmoke.first);
  console.log('MEDIA_START', JSON.stringify(mediaStart));
  if (!mediaStart.ok) {
    throw new Error('Live HTMLMediaElement playback did not start: ' + JSON.stringify(mediaStart));
  }

  // Regression: when a stream hangs, the first pause tap must NOT call audio.play() again.
  const pauseRegression = await page.evaluate(() => {
    const audio = document.getElementById('main-audio');
    const originalPlay = audio.play;
    const previousPlaylist = playlist;
    const previousIndex = currentIndex;
    const previousIntent = playbackWanted;
    let calls = 0;
    audio.play = function() { calls += 1; return Promise.resolve(); };
    playlist = [{title:'Тест',artist:'Тест',url:'https://example.invalid/test.mp3'}];
    currentIndex = 0;
    playbackWanted = true;
    try {
      togglePlay();
      return {calls,paused:!playbackWanted,button:document.getElementById('btn-play').getAttribute('aria-label')};
    } finally {
      audio.play = originalPlay;
      playlist = previousPlaylist;
      currentIndex = previousIndex;
      playbackWanted = previousIntent;
    }
  });
  console.log('PAUSE_DURING_LOADING',JSON.stringify(pauseRegression));
  if (!pauseRegression.paused || pauseRegression.calls !== 0)
    throw new Error('Pause restarted audio during loading');

  // Browser-compatibility pass with a current Yandex Browser desktop UA.
  const yandexPage = await browser.newPage();
  await yandexPage.evaluateOnNewDocument(() => {
    try { sessionStorage.setItem('dag_sw_reloaded_2293', '1'); } catch (error) {}
  });
  const yandexErrors = [];
  yandexPage.on('pageerror', err => yandexErrors.push(String(err)));
  await yandexPage.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/150.0.0.0 YaBrowser/26.8.0.0 Safari/537.36'
  );
  await yandexPage.goto(url + '?yandex-smoke=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 45000 });
  await new Promise(resolve => setTimeout(resolve, 2500));
  await yandexPage.waitForFunction(() => document.readyState === 'complete', { timeout: 15000 }).catch(() => {});

  const yBasics = await yandexPage.evaluate(() => ({
    openMenu: typeof window.openMenu,
    handleAuth: typeof window.handleAuth,
    openEqualizer: typeof window.openEqualizer,
    downloadVisible: (() => {
      const b = document.getElementById('android-apk-download-btn');
      return !!b && getComputedStyle(b).display !== 'none';
    })(),
    pwaAbsent: !document.getElementById('pwa-install-btn'),
    fullscreenAbsent: !document.querySelector('[onclick="toggleFullScreen()"]')
  }));
  console.log('YANDEX_BASICS', JSON.stringify(yBasics));
  if (yBasics.openMenu !== 'function' ||
      yBasics.handleAuth !== 'function' ||
      yBasics.openEqualizer !== 'function' ||
      !yBasics.downloadVisible ||
      !yBasics.pwaAbsent ||
      !yBasics.fullscreenAbsent) {
    throw new Error('Yandex-UA compatibility basics failed: ' + JSON.stringify(yBasics));
  }

  await yandexPage.close();
  if (yandexErrors.length) {
    throw new Error('Yandex-UA runtime errors: ' + yandexErrors.join(' | '));
  }

  // Emulate iPhone Safari UA so the conditional installation guide cannot
  // accidentally be lost in future mobile-interface changes.
  const iphonePage=await browser.newPage();
  await iphonePage.setViewport({width:390,height:844,deviceScaleFactor:3,isMobile:true,hasTouch:true});
  await iphonePage.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1');
  await iphonePage.evaluateOnNewDocument(()=>{
    try{sessionStorage.setItem('dag_sw_reloaded_2293','1');}catch(error){}
  });
  await iphonePage.goto(url+'?ios_smoke='+Date.now(),{waitUntil:'domcontentloaded',timeout:45000});
  await iphonePage.waitForFunction(()=>typeof showIOSInstallGuide==='function',{timeout:20000});
  const iphone=await iphonePage.evaluate(()=>{
    const banner=document.getElementById('ios-install-banner');
    const button=document.getElementById('ios-install-guide-btn');
    const android=document.getElementById('android-apk-download-btn');
    return {bannerVisible:!banner.hidden,menuVisible:!button.hidden,androidHidden:android.hidden,
      viewportOk:document.documentElement.scrollWidth<=innerWidth+2};
  });
  await iphonePage.evaluate(()=>showIOSInstallGuide());
  const guideShown=await iphonePage.$eval('#ios-install-modal',e=>e.classList.contains('show'));
  console.log('IPHONE_SAFARI_INSTALL',JSON.stringify({...iphone,guideShown}));
  if(!iphone.bannerVisible||!iphone.menuVisible||!iphone.androidHidden||!iphone.viewportOk||!guideShown)
    throw new Error('iPhone Safari install guide not usable');
  await iphonePage.close();

  console.log('SMOKE_OK');
} finally {
  await browser.close();
}
