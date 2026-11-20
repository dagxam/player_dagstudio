import puppeteer from 'puppeteer-core';

// Regression: clicking the DAGSTUDIO logo opens the current-player presentation.
// Collapsing / reopening the sidebar must never make .left-col disappear.
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
try {
  await page.setViewport({width:1400,height:900});
  await page.goto((process.env.PLAYER_URL || 'https://pl.dagstudio.ru/') +
    '?sidebar-player-test=' + Date.now(), {waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForFunction(() => {
    const root = document.querySelector('.main-container.studio-showcase.vision-ui');
    return root && document.querySelector('.showcase-sidebar .showcase-brand-text strong') &&
      document.querySelector('.showcase-rail-toggle') &&
      document.querySelector('.main-container>.left-col');
  }, {timeout:20000});

  const currentState = async () => page.evaluate(() => {
    const root=document.querySelector('.main-container.studio-showcase');
    const rail=document.querySelector('.showcase-sidebar');
    const panel=root.querySelector(':scope > .left-col');
    const rect=panel.getBoundingClientRect();
    const railRect=rail.getBoundingClientRect();
    const styles=getComputedStyle(panel);
    return {
      expanded:root.classList.contains('vision-player-expanded'),
      collapsed:root.classList.contains('showcase-nav-collapsed'),
      wave:root.classList.contains('showcase-wave-only'),
      panel:{x:rect.x,right:rect.right,w:rect.width,h:rect.height,display:styles.display,visibility:styles.visibility},
      rail:{right:railRect.right,w:railRect.width},
      viewport:innerWidth,
      index:typeof currentIndex !== 'undefined' ? currentIndex : null,
      queue:typeof playbackPlaylist !== 'undefined' ? playbackPlaylist.length : null,
      wanted:typeof playbackWanted !== 'undefined' ? playbackWanted : null
    };
  });
  const visible = (state,label) => {
    const p=state.panel;
    if(!state.expanded || p.display==='none' || p.visibility==='hidden' ||
      p.w < Math.min(250,(state.viewport-78)*.6) || p.h < 200 ||
      p.x < state.rail.right-8 || p.right > state.viewport+4) {
      throw new Error(label+' full player is offscreen or hidden: '+JSON.stringify(state));
    }
  };

  for (const viewport of [{width:1400,height:900},{width:1024,height:600},{width:800,height:480}]) {
    await page.setViewport(viewport);
    // A fresh session must begin with an expanded navigation rail.
    await page.evaluate(() => {
      const root=document.querySelector('.main-container');
      root.classList.remove('showcase-nav-collapsed','showcase-wave-only','vision-player-expanded');
    });
    await page.click('.showcase-sidebar .showcase-brand-text strong');
    const open=await currentState();
    visible(open,'After logo click '+viewport.width);
    await page.click('.showcase-rail-toggle');
    const compact=await currentState();
    visible(compact,'After collapsing menu '+viewport.width);
    if(!compact.collapsed || compact.rail.w>90 ||
      compact.index!==open.index || compact.queue!==open.queue || compact.wanted!==open.wanted)
      throw new Error('Collapse changed playback or did not collapse menu: '+JSON.stringify(compact));
    // A Wave-only class from the previous view can be present at the same time.
    // The expanded-player layout must still win while the nav is collapsed.
    await page.evaluate(()=>document.querySelector('.main-container').classList.add('showcase-wave-only'));
    const fromWave=await currentState();
    visible(fromWave,'Expanded from Wave with collapsed menu '+viewport.width);
    await page.click('.showcase-rail-toggle');
    const reopened=await currentState();
    visible(reopened,'After expanding menu '+viewport.width);
    if(reopened.collapsed || reopened.index!==open.index || reopened.queue!==open.queue)
      throw new Error('Reopening menu changed the player state: '+JSON.stringify(reopened));
    console.log('BRAND_SIDEBAR_PLAYER_VISIBLE',viewport.width,JSON.stringify({
      openWidth:Math.round(open.panel.w),collapsedWidth:Math.round(compact.panel.w),
      waveWidth:Math.round(fromWave.panel.w),reopenedWidth:Math.round(reopened.panel.w)
    }));
  }
  if(errors.length)throw new Error('Browser errors: '+errors.join('; '));
  console.log('BRAND_PLAYER_SURVIVES_SIDEBAR_COLLAPSE_DESKTOP_TEYES_OK');
} finally {
  await browser.close();
}
