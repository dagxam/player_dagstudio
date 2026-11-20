import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';

const browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',
  headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
  for(const viewport of [{width:1280,height:800},{width:1024,height:600},
      {width:800,height:480},{width:390,height:844},{width:320,height:568}]){
    const page=await browser.newPage();
    const pageErrors=[];
    page.on('pageerror',e=>pageErrors.push(String(e?.message||e)));
    await page.setViewport(viewport);
    const navigation=await page.goto((process.env.PLAYER_URL||'https://pl.dagstudio.ru/')+
      '?song-actions='+Date.now(),{waitUntil:'domcontentloaded',timeout:45000});
    try{
      await page.waitForFunction(()=>Boolean(document.querySelector('.main-container.vision-ui'))&&
        typeof renderPlaylist==='function'&&typeof openSaveModal==='function',
        {timeout:12000});
    }catch(error){
      const state=await page.evaluate(()=>({
        ready:document.readyState,
        title:document.title,root:document.querySelector('.main-container')?.className,
        rows:document.querySelectorAll('.track-row').length,
        render:typeof renderPlaylist,save:typeof openSaveModal,
        scripts:[...document.scripts].map(s=>s.src).filter(Boolean).slice(-6)
      }));
      throw new Error('SONG_ACTIONS_BOOT_FAILED '+viewport.width+'x'+viewport.height+
        ' status='+navigation?.status()+' '+JSON.stringify({state,pageErrors})+
        ' reason='+String(error?.message||error));
    }
    // Allow the real app's asynchronous account/bootstrap callbacks to finish
    // before installing isolated test fixtures. Short TEYES viewports can
    // otherwise finish restoring cached account state mid-scenario.
    await page.waitForFunction(()=>document.readyState==='complete',{timeout:15000});
    await new Promise(resolve=>setTimeout(resolve,800));
    const result=await page.evaluate(async()=>{
      const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
      const root=document.querySelector('.main-container');
      const prior={user:currentUser,pls:playlists,list:playlist,tab:currentTab,
        played:playbackPlaylist,index:currentIndex,api,loadUserData,playTrack,
        webQueue:enqueueWebTrackCache,remember:offlineCatalogRemember};
      const t={id:1,title:'Моя тестовая песня',artist:'DAGSTUDIO Тест',
        url:'https://api.audius.co/v1/tracks/demo/stream',thumb:'',source:'[AUDIUS]'};
      let calls=[],playCalls=0,layouts=[],downloads=[];
      enqueueWebTrackCache=(track,reason,priority)=>{
        downloads.push({track,reason,priority});
      };
      offlineCatalogRemember=()=>{};
      try{
        currentUser='ci-song-actions';
        playlists=[
          {id:301,type:'standard',name:'Дорога',tracks:[]},
          {id:302,type:'standard',name:'Другой',tracks:[{...t}]},
          {id:303,type:'favorites',name:'Мне нравится',tracks:[]}
        ];
        playlist=[t];playbackPlaylist=[t];currentIndex=0;
        api=async(action,data)=>{
          calls.push({action,data});
          if(action==='create_playlist')return {success:true,id:304};
          if(action==='add_track')return {success:true};
          if(action==='set_favorite')return {success:true,playlist_id:303,track_id:99};
          return {error:'Unexpected smoke API: '+action};
        };
        loadUserData=async()=>true;
        playTrack=async()=>{playCalls++};
        // All of the actual list render modes must expose the same controls.
        for(const tab of ['search','mix:wave','mix:caucasus','studio-likes','offline',301,303]){
          // Authentication/playlist hydration is asynchronous on short WebViews:
          // keep each scenario's fixture independent of background app boot.
          currentTab=tab;playlist=[t];renderPlaylist();
          const row=document.querySelector('#playlist-container .track-row');
          if(!row)throw new Error('Missing row '+tab+' '+JSON.stringify({
            listed:playlist.length,showing:listEl.children.length,
            currentTab,connected:listEl.isConnected,
            rows:document.querySelectorAll('.track-row').length
          }));
          const add=row.querySelector('.track-action-save');
          const download=row.querySelector('.track-action-download');
          if(!add||!download)throw new Error('Missing actions '+tab);
          const actions=row.querySelector('.track-actions');
          const rect=el=>el.getBoundingClientRect();
          const rr=rect(row),ar=rect(actions),tr=rect(row.querySelector('.track-left'));
          const noClipping=ar.left>=rr.left-2&&ar.right<=rr.right+2&&
             tr.left>=rr.left-2&&tr.right<=rr.right+2&&
             (ar.top>=tr.bottom-2||ar.left>=tr.right-2);
          if(!noClipping)throw new Error('Actions overlap '+tab+':'+JSON.stringify({
            row:[rr.left,rr.right],actions:[ar.left,ar.right,ar.top,ar.bottom],
            title:[tr.left,tr.right,tr.top,tr.bottom]}));
          layouts.push({tab,buttons:actions.querySelectorAll('button').length,
            noClipping});
          // A button click must not bubble into the playTrack handler.
          if(tab==='search'){
            download.click();
            if(downloads.length!==1||downloads[0].track!==t||
               downloads[0].reason!=='manual'||!downloads[0].priority)
               throw new Error('List download did not queue selected track');
            add.click();
            if(!document.getElementById('save-modal').classList.contains('show'))
              throw new Error('Playlist selection failed to open');
            const btn=[...document.querySelectorAll('#playlist-select-list .playlist-select-btn')]
              .find(b=>b.getAttribute('aria-label')==='Добавить песню в Дорога');
            if(!btn||btn.disabled)throw new Error('Destination not selectable');
            const already=[...document.querySelectorAll('#playlist-select-list .playlist-select-btn')]
              .find(b=>b.getAttribute('aria-label')==='Добавить песню в Другой');
            if(!already?.disabled||!already.textContent.includes('Уже добавлено'))
              throw new Error('Duplicate destination not marked');
            btn.click();await wait(45);
            if(!calls.some(c=>c.action==='add_track'&&c.data.playlist_id===301&&
                c.data.track.title===t.title&&c.data.track.url===t.url))
              throw new Error('Wrong add_track payload');
            if(document.getElementById('save-modal').classList.contains('show'))
              throw new Error('Playlist picker did not close on success');
            if(playCalls!==0)throw new Error('Saving a song launched playback');
          }
        }
        currentTab='search';playlist=[t];openSaveModal(0);
        const create=document.querySelector('#playlist-select-list .playlist-save-create');
        if(!create)throw new Error('Missing create playlist form');
        create.querySelector('input').value='Новый тестовый';
        create.querySelector('button').click();await wait(55);
        if(!calls.some(c=>c.action==='create_playlist'&&c.data.name==='Новый тестовый')||
           !calls.some(c=>c.action==='add_track'&&c.data.playlist_id===304))
           throw new Error('New playlist was not populated with the selected song '+JSON.stringify({
             actions:calls.map(x=>({action:x.action,pl:x.data?.playlist_id,name:x.data?.name})),
             selected:selectedTrackForSave?.title,user:currentUser,
             modal:document.getElementById('save-modal')?.className,
             disabled:create.querySelector('button')?.disabled
           }));
        if(document.getElementById('save-modal').classList.contains('show'))
           throw new Error('Picker not closed after creating playlist');
        // Buttons act on playbackPlaylist (not an unrelated visible playlist).
        root.classList.add('showcase-wave-only');
        playbackTab='mix:wave';
        updatePlayingHeart();
        const plus=document.getElementById('wave-add-playlist-btn');
        const dl=document.getElementById('wave-download-btn');
        const tools=document.querySelector('.wave-track-tools');
        if(!plus||plus.hidden||plus.disabled||!dl||dl.hidden||dl.disabled||
           getComputedStyle(tools).display==='none')
           throw new Error('Fullscreen Wave actions are unavailable');
        const r=tools.getBoundingClientRect(),title=document.getElementById('track-title').getBoundingClientRect();
        dl.click();
        if(downloads.length!==2||downloads[1].track!==t)
           throw new Error('Wave download did not queue currently playing track');
        if(r.width<60||r.right>window.innerWidth+1)throw new Error('Fullscreen tools not in viewport');
        // This click must not bubble to the touch drawer's backdrop handler.
        // Previously the picker opened and immediately closed on TEYES/tablet.
        plus.click();
        if(selectedTrackForSave?.url!==t.url ||
           selectedTrackForSave?.title!==t.title ||
           !document.getElementById('save-modal').classList.contains('show'))
           throw new Error('Wave add chose the wrong track '+JSON.stringify({
             selected:selectedTrackForSave?.url,expected:t.url,
             selectedTitle:selectedTrackForSave?.title,expectedTitle:t.title,
             active:playbackPlaylist[currentIndex]?.url,
             modal:document.getElementById('save-modal').className,
             wave:root.classList.contains('showcase-wave-only')
           }));
        closeModal('save-modal');
        root.classList.remove('showcase-wave-only');
        root.classList.add('vision-player-expanded');
        updatePlayingHeart();
        if(plus.hidden||dl.hidden)throw new Error('Expanded player controls missing');
        closeModal('save-modal');
        return {viewport:window.innerWidth+'x'+window.innerHeight,
          layouts,added:calls.filter(c=>c.action==='add_track').length,
          create:calls.filter(c=>c.action==='create_playlist').length,
          fullScreen:true,downloads:downloads.length,playCalls};
      }finally{
        closeModal('save-modal');root.classList.remove('showcase-wave-only','vision-player-expanded');
        currentUser=prior.user;playlists=prior.pls;playlist=prior.list;
        currentTab=prior.tab;playbackPlaylist=prior.played;currentIndex=prior.index;
        api=prior.api;loadUserData=prior.loadUserData;playTrack=prior.playTrack;
        enqueueWebTrackCache=prior.webQueue;offlineCatalogRemember=prior.remember;
      }
    });
    assert.equal(result.playCalls,0);
    assert.equal(result.downloads,2);
    assert.equal(result.layouts.length,7);
    assert.equal(result.added,2);
    assert.equal(result.create,1);
    console.log('SONG_ACTIONS_LIVE_OK',JSON.stringify(result));
    await page.close();
  }
  console.log('SONG_ACTIONS_PLAYLIST_LIKES_WAVE_MIX_SEARCH_ANDROID_TEYES_OK');
}finally{await browser.close();}
