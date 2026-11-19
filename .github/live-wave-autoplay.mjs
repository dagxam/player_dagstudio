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
