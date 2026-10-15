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
  try { sessionStorage.setItem('dag_sw_reloaded_2241', '1'); } catch (error) {}
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
  for (const name of ['downloadButton','equalizerButton','updateButton','versionFooter','installButtonAbsent','fullscreenButtonAbsent','menuButton','audio']) {
    if (!basics[name]) throw new Error('Missing/incorrect UI state: ' + name);
  }

  // Проверяем знакомую двухколоночную компоновку после обновления оформления.
  for (const viewport of [{width:1024,height:600}, {width:1280,height:720}, {width:390,height:844}]) {
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
        eqWidth:eq.width,
        eqStyle:getComputedStyle(document.querySelector('.header-eq-btn')).display,
        eqParentWidth:document.querySelector('.header-right').getBoundingClientRect().width,
        eqParentDisplay:getComputedStyle(document.querySelector('.header-right')).display,
        pageOverflow:document.documentElement.scrollWidth > innerWidth + 2,
        width:root.getBoundingClientRect().width
      };
    });
    console.log('MODERN_CLASSIC_LAYOUT', JSON.stringify({viewport,layout}));
    if (!layout.modern || !layout.oldSidebarRemoved || !layout.noOrnamentalStrip || !layout.eqVisible ||
        layout.pageOverflow || layout.width > viewport.width + 2 ||
        (viewport.width > 768 && layout.rightX < layout.leftX + layout.leftWidth - 5))
      throw new Error('Classic modern layout invalid: ' + JSON.stringify({viewport,layout}));
  }
  await page.setViewport({width:1200,height:800});

  // Страховка CC3: в нативном коде не должно оставаться таймеров, вызывающих OTA set().
  const stabilitySource = await page.evaluate(async () => {
    const response = await fetch('/script.js?v=2241', { cache: 'no-store' });
    const code = await response.text();
    return {
      isCurrent: code.includes("const WEB_BUILD_LABEL = '2241'"),
      blocksAutomaticUpdates: code.includes("if (!manual) return { status: 'manual-only' }"),
      hasNoAutoInstallTimeout: !code.includes('checkNativeLiveUpdate(true)'),
      hasCarWake: code.includes('setNativeCarKeepAwake(true)'),
      hasRestore: code.includes('restoreNativePlaybackSnapshot()')
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
      '.search-input', '.play-btn', '.tab-btn.active',
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
    audio.load();

    return await new Promise(resolve => {
      let done = false;
      const finish = value => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        audio.pause();
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

  // Browser-compatibility pass with a current Yandex Browser desktop UA.
  const yandexPage = await browser.newPage();
  await yandexPage.evaluateOnNewDocument(() => {
    try { sessionStorage.setItem('dag_sw_reloaded_2241', '1'); } catch (error) {}
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

  console.log('SMOKE_OK');
} finally {
  await browser.close();
}
