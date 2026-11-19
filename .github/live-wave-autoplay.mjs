import puppeteer from 'puppeteer-core';

const browser=await puppeteer.launch({
 executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,
 args:['--no-sandbox','--disable-dev-shm-usage'] // Keep normal autoplay rules.
});
const page=await browser.newPage();
const errors=[];
page.on('pageerror',e=>errors.push(String(e)));
try{
 await page.setViewport({width:1250,height:760});
 await page.evaluateOnNewDocument(()=>{
   try{sessionStorage.setItem('dag_sw_reloaded_2293','1');}catch(e){}
 });
 await page.goto((process.env.PLAYER_URL||'https://pl.dagstudio.ru/')+
   '?wave_one_tap='+Date.now(),{waitUntil:'domcontentloaded',timeout:45000});
 await page.waitForFunction(()=>typeof openStudioWave==='function'&&
   typeof findWaveNextTrack==='function'&&
   !!document.getElementById('showcase-wave'),{timeout:16000});
 await page.evaluate(()=>{
   // Use playable local PCM fixtures, NOT a made-up music provider result.
   // This isolates browser gesture permission and the playback queue from
   // external services (which have separate health monitoring).
   const wav=seconds=>{
     const count=Math.round(seconds*8000),buf=new Uint8Array(44+count),
       view=new DataView(buf.buffer);
     const ascii=(pos,value)=>{for(let i=0;i<value.length;i++)buf[pos+i]=value.charCodeAt(i);};
     ascii(0,'RIFF');view.setUint32(4,36+count,true);ascii(8,'WAVE');
     ascii(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);
     view.setUint16(22,1,true);view.setUint32(24,8000,true);view.setUint32(28,8000,true);
     view.setUint16(32,1,true);view.setUint16(34,8,true);
     ascii(36,'data');view.setUint32(40,count,true);
     buf.fill(128,44); // silent PCM, only for functional tests
     let raw='';for(let i=0;i<buf.length;i+=8000)
       raw+=String.fromCharCode(...buf.subarray(i,i+8000));
     return 'data:audio/wav;base64,'+btoa(raw);
   };
   const tracks=[
     {title:'One tap fixture A',artist:'Fixture singer A',url:wav(14.5),
       _waveRadio:true,_smartRadio:true},
     {title:'Continuous fixture B',artist:'Fixture singer B',url:wav(15),
       _waveRadio:true,_smartRadio:true}
   ];
   playlists=[];playbackPlaylist=[];playbackQueue=[];currentIndex=-1;
   playbackWanted=false;quickMixCurrent=null;waveWarmState=null;isRepeat=true;
   window.__waveMockRequests=0;
   findWaveNextTrack=()=>new Promise(resolve=>{
     const next=window.__waveMockRequests++;
     setTimeout(()=>resolve(tracks[Math.min(next,1)]),next===0?3500:400);
   });
 });
 await page.click('#showcase-wave');
 const immediate=await page.evaluate(()=>({
   chosen:quickMixCurrent?.key,loading:quickMixCurrent?.loading,
   want:playbackWanted,silent:mainAudio.src.startsWith('data:audio/wav;base64,'),
   loop:mainAudio.loop
 }));
 console.log('ONE_TAP_IMMEDIATE',JSON.stringify(immediate));
 if(immediate.chosen!=='wave'||!immediate.loading||!immediate.silent||
    !immediate.want||!immediate.loop)
   throw new Error('Wave did not prime music synchronously with the first click');
 await page.waitForFunction(()=>playbackTab==='mix:wave'&&
   playbackPlaylist[currentIndex]?.title==='One tap fixture A'&&
   playbackWanted&&mainAudio.currentTime>0.35&&!mainAudio.paused,
   {timeout:12500,polling:150});
 console.log('ONE_TAP_FIRST_AUDIO',JSON.stringify(await page.evaluate(()=>({
   song:playbackPlaylist[currentIndex]?.title,seconds:mainAudio.currentTime,
   wanted:playbackWanted,paused:mainAudio.paused
 }))));
 // Inspect the exact user-requested fullscreen layout with the live player.
 await page.evaluate(()=>{
   document.getElementById('track-title').textContent=
     'Deep House Music, Сборник новинок, Современная Танцевальная Музыка';
   document.getElementById('track-artist').textContent=
     'Deep House Music · Танцевальные новинки';
   updatePlayingHeart();
 });
 const layout=async(viewport)=>{
   await page.setViewport(viewport);
   await new Promise(resolve=>setTimeout(resolve,200));
   return page.evaluate(()=>{
     const title=document.getElementById('track-title'),
       artist=document.getElementById('track-artist'),
       heart=document.getElementById('now-playing-heart'),
       plus=document.getElementById('wave-add-playlist-btn'),
       area=document.querySelector('.left-col .track-info-display'),
       txt=heart.querySelector('.np-like-label'),root=document.querySelector('.main-container');
     const pos=el=>{const r=el.getBoundingClientRect();return {
       x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom};};
     const width=innerWidth;
     const t=pos(title),h=pos(heart),p=pos(plus),a=pos(area);
     return {width,display:getComputedStyle(area).display,
       font:getComputedStyle(title).fontFamily,titleSize:parseFloat(getComputedStyle(title).fontSize),
       title:t,artist:pos(artist),heart:h,plus:p,area:a,
       label:txt?.textContent,labelVisible:!!txt&&getComputedStyle(txt).display!=='none',
       likeAccessible:heart.getAttribute('aria-label'),
       plusAccessible:plus.getAttribute('aria-label'),
       plusVisible:getComputedStyle(plus).display!=='none',
       fullscreen:root.classList.contains('showcase-wave-only'),
       noOverflow:document.documentElement.scrollWidth<=width+3,
       actionsBesideTitle:width>768?p.right<=t.x+7&&h.x>=t.right-7:true,
       mobileActionsBelow:width<=768?p.y>=t.bottom-4&&h.y>=t.bottom-4:true,
       buttonsInBounds:p.x>=0&&h.x>=0&&h.right<=width+3};
   });
 };
 const wide=await layout({width:1250,height:760});
 console.log('WAVE_PREMIUM_DESKTOP',JSON.stringify(wide));
 if(wide.display!=='grid'||!wide.fullscreen||!wide.noOverflow||
    wide.titleSize<23||!wide.font.includes('Manrope')||
    !wide.labelVisible||wide.label!=='Нравится трек'||
    !wide.plusVisible||!wide.actionsBesideTitle||!wide.buttonsInBounds)
   throw new Error('Premium desktop now-playing layout regression');
 const mobile=await layout({width:390,height:844});
 console.log('WAVE_PREMIUM_MOBILE',JSON.stringify(mobile));
 if(mobile.display!=='grid'||!mobile.noOverflow||
    mobile.titleSize<17||!mobile.labelVisible||!mobile.mobileActionsBelow||
    !mobile.buttonsInBounds||!mobile.plusVisible)
   throw new Error('Premium mobile now-playing layout regression');
 const car=await layout({width:800,height:480});
 console.log('WAVE_PREMIUM_CAR',JSON.stringify(car));
 if(car.display!=='grid'||!car.noOverflow||car.titleSize<17||
    !car.labelVisible||!car.actionsBesideTitle||!car.buttonsInBounds)
   throw new Error('Car now-playing layout regression');
 await page.setViewport({width:1250,height:760});

 await page.waitForFunction(()=>playbackTab==='mix:wave'&&currentIndex>0&&
   playbackPlaylist[currentIndex]?.title==='Continuous fixture B'&&
   playbackWanted&&!mainAudio.paused&&mainAudio.currentTime>0.25,
   {timeout:26000,polling:150});
 console.log('ONE_TAP_CONTINUOUS_NEXT',JSON.stringify(await page.evaluate(()=>({
   currentIndex,song:playbackPlaylist[currentIndex]?.title,
   seconds:mainAudio.currentTime,wanted:playbackWanted,paused:mainAudio.paused,
   requests:window.__waveMockRequests
 }))));
 if(errors.length)throw new Error('Browser runtime errors: '+errors.join('; '));
 console.log('WAVE_ONE_CLICK_AND_AUTOMATIC_NEXT_PASS');
}finally{
 await browser.close();
}
