import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';

const browser=await puppeteer.launch({
  executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',
  headless:true,args:['--no-sandbox','--disable-dev-shm-usage']
});
try{
  for(const viewport of [
    {width:1280,height:800},{width:1024,height:600},
    {width:800,height:480},{width:390,height:844},{width:320,height:568}
  ]){
    const page=await browser.newPage();
    await page.setViewport(viewport);
    const faults=[];page.on('pageerror',err=>faults.push(err.message));
    const response=await page.goto((process.env.PLAYER_URL||'https://pl.dagstudio.ru/')+
      '?visualizer-smoke='+Date.now(),{waitUntil:'domcontentloaded',timeout:45000});
    await page.waitForFunction(()=>!!document.querySelector('.main-container.vision-ui')&&
      document.querySelectorAll('[data-viz-palette]').length===9,{
        timeout:20000
      });
    const result=await page.evaluate(async()=>{
      const root=document.querySelector('.main-container');
      const settings=document.querySelector('.vision-viz-settings');
      const menu=document.getElementById('menu-modal');
      const preview=document.getElementById('vision-viz-preview');
      const stage=document.querySelector('.vision-viz-stage');
      const theme=localStorage.getItem('dag_theme')||'brown';
      const clicks=()=>[...document.querySelectorAll('[data-viz-palette]')];
      const state=()=>JSON.parse(localStorage.getItem('dag_visualizer_settings_v1')||'null');
      if(!settings||!preview||!stage||!menu)throw Error('Required visualization UI missing');
      if(!state()){
        const themeButton=clicks().find(b=>b.dataset.vizPalette==='theme');
        const match=()=>settings.style.getPropertyValue('--viz-selected-color')===
          getComputedStyle(document.documentElement).getPropertyValue('--theme-bright').trim();
        if(themeButton?.getAttribute('aria-pressed')!=='true'||!match())
          throw Error('Visualization must default to player theme color');
        if(typeof window.setTheme==='function'){
          window.setTheme('blue',false);
          if(!match())throw Error('Theme change did not recolor visualization preview');
          window.setTheme(theme,false);
        }
      }
      menu.classList.add('show');
      const card=settings.getBoundingClientRect(),w=window.innerWidth;
      if(card.width<160||card.left<0||card.right>w+2)
        throw Error('Settings card out of viewport '+JSON.stringify({w,card:card.toJSON()}));
      const marks=preview.querySelectorAll('.vision-viz-preview-mark').length;
      if(marks!==17)throw Error('Preview not initialized: '+marks);
      for(const color of ['mint','rose','ocean','ice','white','copper','violet','theme']){
        const button=clicks().find(b=>b.dataset.vizPalette===color);
        button.click();
        if(state()?.color!==color||button.getAttribute('aria-pressed')!=='true')
          throw Error('Palette selection failed '+color);
        if(clicks().filter(b=>b.getAttribute('aria-pressed')==='true').length!==1)
          throw Error('More than one palette selected');
      }
      const input=document.getElementById('vision-viz-custom-color');
      input.value='#25c9d4';
      input.dispatchEvent(new Event('input',{bubbles:true}));
      const persisted=state();
      if(persisted?.color!=='custom'||persisted?.customColor!=='#25C9D4')
        throw Error('Custom color not persisted '+JSON.stringify(persisted));
      if(settings.style.getPropertyValue('--viz-selected-color')!=='#25C9D4')
        throw Error('Preview custom color differs from saved color');
      if(localStorage.getItem('dag_theme')!==theme &&
         !(theme==='brown'&&!localStorage.getItem('dag_theme')))
         throw Error('Visualizer changed global player palette');
      for(const mode of ['bars','wave','circle','pulse','particles']){
        const control=document.getElementById('vision-viz-mode');
        control.value=mode;control.dispatchEvent(new Event('change',{bubbles:true}));
        if(preview.dataset.vizMode!==mode||state().mode!==mode)
          throw Error('Preview mode mismatch '+mode);
      }
      const mode=document.getElementById('vision-viz-mode');
      mode.value='off';mode.dispatchEvent(new Event('change',{bubbles:true}));
      if(!preview.classList.contains('is-off') ||
         !document.getElementById('vision-viz-status').classList.contains('is-off'))
        throw Error('Off mode does not stop preview');
      mode.value='bars';mode.dispatchEvent(new Event('change',{bubbles:true}));
      // Modal and fullscreen are separate views: check the background without
      // changing the user's real play queue or triggering audio.
      menu.classList.remove('show');
      root.classList.add('vision-player-expanded');
      await new Promise(resolve=>setTimeout(resolve,180));
      if(!root.classList.contains('vision-viz-visible'))
        throw Error('Visualizer not activated in expanded player');
      const css=getComputedStyle(stage);
      if(css.backgroundImage!=='none'||
         css.backgroundColor!=='rgba(0, 0, 0, 0)'||
         css.boxShadow!=='none'||css.borderTopWidth!=='0px')
        throw Error('Black visualizer panel remains: '+JSON.stringify({
          bg:css.backgroundImage,color:css.backgroundColor,
          shadow:css.boxShadow,border:css.borderTopWidth
        }));
      const canvas=stage.querySelector('canvas');
      if(!canvas||!canvas.width||!canvas.height)
        throw Error('Visualizer canvas not rendering');
      const bounds=stage.getBoundingClientRect();
      if(bounds.width<50||bounds.height<60||bounds.right>window.innerWidth+2)
        throw Error('Expanded visualizer clipped '+JSON.stringify(bounds.toJSON()));
      root.classList.remove('vision-player-expanded');
      return {viewport:window.innerWidth+'x'+window.innerHeight,
        choices:clicks().length,previewMarks:marks,customColor:persisted.customColor,
        transparent:true,stageSize:[Math.round(bounds.width),Math.round(bounds.height)],
        themeUnchanged:true};
    });
    assert.equal(faults.length,0,'Browser errors '+faults.join('; '));
    console.log('VISUALIZER_PALETTE_AND_TRANSPARENT_STAGE_OK',JSON.stringify(result));
    await page.close();
  }
  console.log('VISUALIZER_ANDROID_TEYES_MOBILE_DESKTOP_SETTINGS_SUCCESS');
}finally{await browser.close();}
