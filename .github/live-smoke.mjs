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
  try { sessionStorage.setItem('dag_sw_reloaded_2280', '1'); } catch (error) {}
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

  // Проверяем знакомую двухколоночную компоновку после обновления оформления.
  for (const viewport of [{width:1024,height:600}, {width:1280,height:720}, {width:390,height:844}, {width:320,height:640}, {width:375,height:667}]) {
    await page.setViewport(viewport);
    const layout = await page.evaluate(() => {
      const root = document.querySelector('.main-container');
      const left = document.querySelector('.left-col').getBoundingClientRect();
      const right = document.querySelector('.right-col').getBoundingClientRect();
      const eq = document.querySelector('.header-eq-btn').getBoundingClientRect();
      const sheet = !!document.querySelector('link[href^="modern.css"]');
      return {
        modern: sheet, oldSidebarRemoved: !document.querySelector('.app-sidebar'),
        noOrnamentalStrip: !document.querySelector('.ornament-footer'),
        leftX:left.x, rightX:right.x, leftWidth:left.width,
        eqVisible:eq.width>=28,
        mixesVisible:(()=>{const btn=document.getElementById('header-mixes-btn');const r=btn.getBoundingClientRect();return r.width>=38&&r.left>=0&&r.right<=innerWidth;})(),
        mixesBesidePlaylists:(()=>{const r=document.getElementById('header-mixes-btn').getBoundingClientRect();const p=document.getElementById('btn-pl-select').getBoundingClientRect();return r.left>=p.right-2&&r.left-p.right<=24;})(),
        oldMixStripeAbsent:!document.querySelector('.right-col > .quick-mixes'),
        eqWidth:eq.width,
        eqStyle:getComputedStyle(document.querySelector('.header-eq-btn')).display,
        eqParentWidth:document.querySelector('.header-right').getBoundingClientRect().width,
        eqParentDisplay:getComputedStyle(document.querySelector('.header-right')).display,
        pageOverflow:document.documentElement.scrollWidth > innerWidth + 2,
        width:root.getBoundingClientRect().width
      };
    });
    console.log('MODERN_CLASSIC_LAYOUT', JSON.stringify({viewport,layout}));
    if (!layout.modern || !layout.oldSidebarRemoved || !layout.noOrnamentalStrip || !layout.eqVisible || !layout.mixesVisible || !layout.mixesBesidePlaylists || !layout.oldMixStripeAbsent ||
        layout.pageOverflow || layout.width > viewport.width + 2 ||
        (viewport.width > 768 && layout.rightX < layout.leftX + layout.leftWidth - 5))
      throw new Error('Classic modern layout invalid: ' + JSON.stringify({viewport,layout}));
  }
  await page.setViewport({width:1200,height:800});

  for(const viewport of [{width:320,height:640},{width:375,height:667},{width:390,height:844}]) {
    await page.setViewport(viewport);
    const layout=await page.evaluate(()=>{
      const rect=s=>document.querySelector(s).getBoundingClientRect();
      const artwork=rect('.visual-container'),title=rect('.track-info-display'),buttons=rect('.main-btns'),
          right=rect('.right-col'),list=rect('.playlist-area');
      return {artworkVisible:artwork.width>=50&&artwork.height>=50,
          besideArt:title.left>=artwork.right-3,controlsFit:buttons.right<=innerWidth+2,
          scrollableList:list.height>=85,compactPlayer:right.top<395,
          noOverflow:document.documentElement.scrollWidth<=innerWidth+2};
    });
    console.log('PHONE_MINI_PLAYER',JSON.stringify({viewport,layout}));
    if(Object.values(layout).some(x=>!x))throw new Error('Phone layout regression '+JSON.stringify({viewport,layout}));
  }
  await page.setViewport({width:1200,height:800});

  // Studio 2026: real navigation, one playback engine, usable car display widths.
  for (const viewport of [{width:800,height:480},{width:1024,height:600},{width:1280,height:720},{width:390,height:844}]) {
    await page.setViewport(viewport);
    const v=await page.evaluate(()=>{
      const rect=s=>document.querySelector(s).getBoundingClientRect();
      const side=rect('#studio-sidebar'),left=rect('.left-col'),right=rect('.right-col'),
            dock=rect('.studio-dock');
      return {sideVisible:side.width>70&&getComputedStyle(document.querySelector('#studio-sidebar')).display!=='none',
        leftVisible:left.width>175,contentVisible:right.width>255,
        nonOverlapping:left.right<=right.left+4,
        sidebarOrder:side.right<=left.left+4,
        dockVisible:dock.height>35&&getComputedStyle(document.querySelector('.studio-dock')).display!=='none',
        searchInHeader:document.getElementById('search-container-box').parentElement.classList.contains('right-col-header'),
        oneAudio:document.querySelectorAll('audio').length===1,
        noOverflow:document.documentElement.scrollWidth<=innerWidth+2};
    });
    console.log('STUDIO_CAR_LAYOUT',JSON.stringify({viewport,v}));
    if(!v.leftVisible||!v.contentVisible||(viewport.width>768&&!v.nonOverlapping)||!v.searchInHeader||!v.oneAudio||!v.noOverflow||
       (viewport.width>930&&(!v.sideVisible||!v.sidebarOrder||!v.dockVisible))||
       (viewport.width<=768&&(v.sideVisible||v.dockVisible)))
      throw new Error('Studio responsive regression '+JSON.stringify({viewport,v}));
  }
  await page.setViewport({width:1200,height:800});
  const studioLibrary=await page.evaluate(()=>{
    const previousPlaylists=playlists,previousTab=currentTab,previousPlaylist=playlist,previousIndex=currentIndex;
    const spy=document.getElementById('main-audio').play;
    let starts=0;
    document.getElementById('main-audio').play=()=>{starts++;return Promise.resolve();};
    try{
      playlists=[{id:'studio-test-1',name:'Тестовый плейлист',tracks:[{title:'Тест',artist:'DAGSTUDIO',url:'https://example.invalid/track.mp3'}]}];
      document.querySelector('[data-studio-view="library"]').click();
      const shown=document.getElementById('studio-library').classList.contains('active');
      const count=document.querySelectorAll('.studio-playlist-card').length;
      const active=document.querySelector('[data-studio-view="library"]').getAttribute('aria-current');
      document.querySelector('[data-studio-view="wave"]').click();
      return {shown,count,active,starts,restored:!document.getElementById('studio-library').classList.contains('active')};
    }finally{
      playlists=previousPlaylists;currentTab=previousTab;playlist=previousPlaylist;currentIndex=previousIndex;
      document.getElementById('main-audio').play=spy;
    }
  });
  console.log('STUDIO_PLAYLISTS',JSON.stringify(studioLibrary));
  if(!studioLibrary.shown||studioLibrary.count!==1||studioLibrary.active!=='page'||
    studioLibrary.starts!==0||!studioLibrary.restored)
    throw new Error('Studio playlists UI regression '+JSON.stringify(studioLibrary));
  await page.setViewport({width:1200,height:800});

  // Playlists remains the original button, relocated beside the equalizer.
  for (const vp of [{width:1024,height:600},{width:1280,height:720},{width:390,height:844},{width:320,height:640}]) {
    await page.setViewport(vp);
    const check=await page.evaluate(()=>{
      const pl=document.getElementById('btn-pl-select');
      const eq=document.querySelector('.header-eq-btn');
      const area=document.querySelector('.header-right');
      const pos=pl.getBoundingClientRect(),equalizer=eq.getBoundingClientRect();
      return {
        one:document.querySelectorAll('#btn-pl-select').length===1,
        header:pl.parentElement===area,
        removedFromSearch:!document.querySelector('.right-col-header #btn-pl-select'),
        adjacent:eq.nextElementSibling===pl,
        visible:pos.width>=38&&pos.height>=38&&pos.left>=0&&pos.right<=innerWidth+1,
        functional:pl.getAttribute('onclick')==='openPlaylistSelect()',
        label:pl.getAttribute('aria-label')==='Плейлисты',
        compact:innerWidth>768||getComputedStyle(pl.querySelector('.header-playlists-label')).display==='none',
        eqVisible:equalizer.width>=38&&equalizer.right<=innerWidth+1,
        noOverflow:document.documentElement.scrollWidth<=innerWidth+2
      };
    });
    console.log('PLAYLISTS_BESIDE_EQ',JSON.stringify({viewport:vp,check}));
    if(Object.values(check).some(x=>!x))
      throw new Error('Playlists header regression '+JSON.stringify({viewport:vp,check}));
  }
  await page.setViewport({width:1200,height:800});

  // UI refinements: one full-width topbar, actual mixes, themed round swatches.
  for (const viewport of [{width:1024,height:600},{width:1280,height:720},{width:390,height:844}]) {
    await page.setViewport(viewport);
    const value=await page.evaluate(()=>{
      const header=document.querySelector('.header-overlay').getBoundingClientRect();
      const mixes=[...document.querySelectorAll('#quick-mixes .quick-mix-btn[data-mix]')].map(b=>b.dataset.mix);
      const side=[...document.querySelectorAll('.studio-sidebar .studio-region[data-mix]')].map(b=>b.dataset.mix);
      const swatch=document.querySelector('.studio-theme');
      const isCar=innerWidth>768;
      return {headerFull:isCar?(header.left<=1&&header.width>=innerWidth-2):true,
        brandInTopBar:!!document.querySelector('.header-overlay .studio-header-logo'),
        noSidebarLogo:!document.querySelector('.studio-sidebar .studio-logo'),
        noCharts:!document.querySelector('[data-studio-view="charts"]'),
        sameMixes:JSON.stringify(side)===JSON.stringify(mixes)&&side.length>=7,
        swatchRound:isCar?getComputedStyle(swatch).borderRadius.includes('50%'):true,
        dockIconsOnly:isCar?[...document.querySelectorAll('.studio-dock-actions button span')].every(s=>getComputedStyle(s).display==='none'):true,
        noOverflow:document.documentElement.scrollWidth<=innerWidth+2};
    });
    console.log('ETHNO_REFINEMENTS',JSON.stringify({viewport,value}));
    if(Object.values(value).some(x=>!x))
      throw new Error('Ethno refinements regression '+JSON.stringify({viewport,value}));
  }
  await page.setViewport({width:1200,height:800});

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
  const stabilitySource = await page.evaluate(async () => {
    const response = await fetch('/script.js?v=2280', { cache: 'no-store' });
    const code = await response.text();
    return {
      isCurrent: code.includes("const WEB_BUILD_LABEL = '2280'"),
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
    const js = await (await fetch('/script.js?v=2280', {cache:'no-store'})).text();
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

  await page.click('#header-mixes-btn');
  await page.waitForSelector('#quick-mixes-modal.show',{timeout:5000});
  const dialogState=await page.evaluate(()=>{
    const dialog=document.getElementById('quick-mixes-modal');
    const b=document.getElementById('header-mixes-btn');
    const buttons=[...dialog.querySelectorAll('.quick-mix-btn')];
    return {open:dialog.classList.contains('show'),expanded:b.getAttribute('aria-expanded'),
      choices:buttons.length,allWithinDialog:buttons.every(x=>dialog.contains(x)),
      oldStripGone:!document.querySelector('.right-col > .quick-mixes')};
  });
  console.log('QUICK_MIX_DIALOG_OPEN',JSON.stringify(dialogState));
  if(!dialogState.open||dialogState.expanded!=='true'||dialogState.choices!==8||
      !dialogState.allWithinDialog||!dialogState.oldStripGone)
    throw new Error('Quick mix dialog open/layout failed');
  await page.click('#quick-mixes-modal .modal-close');
  const closed=await page.evaluate(()=>!document.getElementById('quick-mixes-modal').classList.contains('show')&&
    document.getElementById('header-mixes-btn').getAttribute('aria-expanded')==='false');
  if(!closed) throw new Error('Quick mix dialog did not close');

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

  await page.click('#header-mixes-btn');
  await page.click('#quick-mixes [data-mix="caucasus"]');
  const regionModal=await page.evaluate(()=>({
    opened:document.getElementById('caucasus-radio-modal').classList.contains('show'),
    regions:document.querySelectorAll('#caucasus-regions .caucasus-region-btn').length
  }));
  console.log('CAUCASUS_RADIO_PICKER',JSON.stringify(regionModal));
  if(!regionModal.opened||regionModal.regions<17)throw new Error('Caucasus picker missing');
  await page.click('#caucasus-radio-modal .modal-close');

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
       queue:!!document.getElementById('smart-radio-queue-btn'),
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

  await page.click('.menu-btn');
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
  await page.click('.header-eq-btn');
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
    try { sessionStorage.setItem('dag_sw_reloaded_2280', '1'); } catch (error) {}
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
    try{sessionStorage.setItem('dag_sw_reloaded_2280','1');}catch(error){}
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
