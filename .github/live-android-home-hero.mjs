import puppeteer from 'puppeteer-core';

// The native Android WebView and browsers have short landscape/portrait
// viewports. Never clip the Home hero text or its listening controls.
const browser=await puppeteer.launch({
  executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',
  headless:true,args:['--no-sandbox','--disable-dev-shm-usage']
});
const page=await browser.newPage();
try {
  const viewports=[
    {width:800,height:480}, // TEYES CC3 landscape
    {width:1024,height:600}, // Android tablet
    {width:900,height:360}, // Android landscape, shallow navigation area
    {width:1280,height:480}, // Android widescreen head unit
    {width:390,height:667}, // Android phone
    {width:360,height:480}, // short portrait WebView
    {width:320,height:568} // narrow Android browser with text wrapping
  ];
  for (const viewport of viewports) {
    await page.setViewport(viewport);
    await page.goto((process.env.PLAYER_URL||'https://pl.dagstudio.ru/')+
      '?hero-fit='+Date.now(),{waitUntil:'domcontentloaded',timeout:45000});
    await page.waitForFunction(()=>Boolean(document.querySelector('#vision-home-hero .vision-hero-copy'))&&
      Boolean(document.querySelector('.main-container.vision-ui')),
      {timeout:18000});
    await page.evaluate(() => {
      // Ensure the Home state, even if a previous visit selected another tab.
      window.studioShowCurated?.();
      window.studioCenterRender?.('home');
    });
    await page.waitForFunction(()=>
      document.querySelector('.main-container')?.classList.contains('vision-home-active'),
      {timeout:9000});
    const measured=await page.evaluate(()=>{
      const root=document.querySelector('.main-container');
      const hero=document.getElementById('vision-home-hero');
      const tag=hero.querySelector('.vision-hero-tag');
      const title=hero.querySelector('h1');
      const description=hero.querySelector('p');
      const actions=hero.querySelector('.vision-hero-buttons');
      const pane=root.querySelector(':scope > .right-col');
      const rect=e=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height}};
      return {
        visible:getComputedStyle(hero).display!=='none',
        hero:rect(hero),tag:rect(tag),title:rect(title),description:rect(description),
        actions:rect(actions),overflowY:getComputedStyle(pane).overflowY,
        scroll:hero.scrollHeight,client:hero.clientHeight,
        text:description.textContent,
        actionCount:actions.querySelectorAll('button').length
      };
    });
    const h=measured.hero;
    if(!measured.visible||h.height<125||measured.tag.top<h.top-3||
      measured.description.top<measured.title.bottom-2||
      measured.actions.bottom>h.bottom-1||measured.scroll>measured.client+2||
      measured.actionCount!==2||!measured.text.includes('Бесконечный поток')) {
      throw new Error('MY_WAVE_HERO_CLIPPED_'+viewport.width+'x'+viewport.height+
        ' '+JSON.stringify(measured));
    }
    console.log('ANDROID_MY_WAVE_HERO_FITS',viewport.width+'x'+viewport.height,
      JSON.stringify({card:Math.round(h.height),actionBottom:Math.round(measured.actions.bottom-h.top),
        scroll:measured.scroll,client:measured.client}));
  }
  console.log('ANDROID_WAVE_HOME_HERO_TEXT_AND_BUTTONS_VISIBLE_OK');
} finally {
  await browser.close();
}
