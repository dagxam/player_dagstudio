import puppeteer from 'puppeteer-core';

const url = process.env.PLAYER_URL || 'https://player.dagstudio.ru/';
const executablePath = process.env.CHROME_BIN || '/usr/bin/google-chrome';

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});

const page = await browser.newPage();
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
    triggerInstall: typeof window.triggerInstall,
    playTrack: typeof window.playTrack,
    togglePlay: typeof window.togglePlay,
    playNext: typeof window.playNext,
    playPrev: typeof window.playPrev,
    downloadTrack: typeof window.downloadTrack,
    installButton: !!document.getElementById('pwa-install-btn'),
    menuButton: !!document.querySelector('.menu-btn'),
    audio: !!document.getElementById('main-audio')
  }));
  console.log('BASICS', JSON.stringify(basics));

  for (const [key, value] of Object.entries(basics)) {
    if (key === 'readyState') continue;
    if (key.endsWith('Button') || key === 'audio') {
      if (!value) throw new Error('Missing UI element: ' + key);
    } else if (value !== 'function') {
      throw new Error('Missing function: ' + key + ' = ' + value);
    }
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
  const installVisible = await page.$eval('#pwa-install-btn', el => getComputedStyle(el).display !== 'none' && !el.disabled);
  console.log('INSTALL_BUTTON_VISIBLE', installVisible);
  if (!installVisible) throw new Error('Install button is not visible/enabled when app is not standalone');

  await page.click('#pwa-install-btn');
  await new Promise(resolve => setTimeout(resolve, 1200));

  const afterInstallClick = await page.evaluate(() => ({
    menuOpen: document.getElementById('menu-modal').classList.contains('show'),
    helpOpen: document.getElementById('android-modal').classList.contains('show'),
    installButtonText: document.getElementById('pwa-install-btn')?.textContent?.trim() || ''
  }));
  console.log('INSTALL_CLICK_RESULT', JSON.stringify(afterInstallClick));

  if (pageErrors.length) {
    throw new Error('Page runtime errors: ' + pageErrors.join(' | '));
  }

  console.log('CONSOLE_ERRORS', JSON.stringify(consoleErrors));

  // Browser-compatibility pass with a current Yandex Browser desktop UA.
  const yandexPage = await browser.newPage();
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
    triggerInstall: typeof window.triggerInstall,
    buttonVisible: (() => {
      const b = document.getElementById('pwa-install-btn');
      return !!b && getComputedStyle(b).display !== 'none' && !b.disabled;
    })()
  }));
  console.log('YANDEX_BASICS', JSON.stringify(yBasics));
  if (yBasics.openMenu !== 'function' || yBasics.handleAuth !== 'function' ||
      yBasics.triggerInstall !== 'function' || !yBasics.buttonVisible) {
    throw new Error('Yandex-UA compatibility basics failed');
  }

  await yandexPage.evaluate(() => window.openMenu());
  await yandexPage.click('#pwa-install-btn');
  await new Promise(resolve => setTimeout(resolve, 800));
  const yInstall = await yandexPage.evaluate(() => ({
    helpOpen: document.getElementById('android-modal').classList.contains('show'),
    iosOpen: document.getElementById('ios-modal').classList.contains('show'),
    menuOpen: document.getElementById('menu-modal').classList.contains('show')
  }));
  console.log('YANDEX_INSTALL_RESULT', JSON.stringify(yInstall));
  if (!yInstall.helpOpen && !yInstall.iosOpen) {
    // Headless Chrome does not emit a real install prompt in this test,
    // so the Yandex-specific fallback must be visible instead of doing nothing.
    throw new Error('Yandex install button produced no visible result');
  }

  await yandexPage.close();
  if (yandexErrors.length) {
    throw new Error('Yandex-UA runtime errors: ' + yandexErrors.join(' | '));
  }

  console.log('SMOKE_OK');
} finally {
  await browser.close();
}
