/* DAGSTUDIO PLAYER — car-friendly two-column shell.
 * Presentation only: the existing player, Media3 and OTA remain untouched. */
(function () {
  'use strict';
  const root=document.querySelector('.main-container');
  const right=document.getElementById('right-col-container');
  const head=document.querySelector('.right-col-header');
  const headerBrand=document.querySelector('.header-overlay .header-left');
  const trackArea=document.getElementById('playlist-container');
  if(!root||!right||!head||!headerBrand||!trackArea||document.getElementById('studio-library'))return;
  const el=(tag,cls,value)=>{
    const node=document.createElement(tag);
    if(cls)node.className=cls;
    if(value!==undefined)node.textContent=String(value);
    return node;
  };
  function themeCover(){
    try {const theme=localStorage.getItem('dag_theme')||'brown';
      return (typeof colorThemes!=='undefined'&&colorThemes[theme]?.img)||'images/cover.png';
    }catch(e){return 'images/cover.png';}
  }
  const headerLogo=el('img','studio-header-logo');
  headerLogo.src=themeCover();headerLogo.alt='';
  headerBrand.insertBefore(headerLogo,headerBrand.firstChild);
  // Keep the search card outside the legacy action header.
  // Placing a full-width card beside fixed-width buttons causes clipped
  // blue controls on TEYES and desktop in the modern showcase layout.
  const search=document.getElementById('search-container-box');
  const heading=search?.querySelector('.dag-search-heading');
  const shuffle=head.querySelector('#smart-shuffle-btn');
  if(heading&&shuffle){
    const actions=el('div','dag-search-heading-actions');
    const subtitle=heading.querySelector('small');
    if(subtitle)actions.appendChild(subtitle);
    actions.appendChild(shuffle); // Move the same button; keep its click handler.
    heading.appendChild(actions);
  }
  const searchInput=document.getElementById('search-input');
  if(searchInput)searchInput.placeholder='Поиск: трек, исполнитель или жанр…';

  const library=el('section','studio-library');
  library.id='studio-library';
  library.setAttribute('aria-label','Мне нравится — ваша музыка');
  right.insertBefore(library,trackArea);
  const likesButton=document.getElementById('studio-header-likes');
  const waveButton=document.getElementById('studio-header-wave');
  let showingLikes=false,libraryFingerprint='',coverName='';
  function savedSongs(){
    if(typeof likedPlaylistTracks==='function')return likedPlaylistTracks();
    const known=new Set(),tracks=[];
    for(const pl of playlists||[])for(const t of pl.tracks||[]){
      if(!t?.url)continue;
      const key=String(t.artist)+'|'+String(t.title);
      if(!known.has(key)){known.add(key);tracks.push(t);}
    }
    return tracks;
  }
  function hideLikes(){
    showingLikes=false;
    library.classList.remove('active');
    right.classList.remove('studio-library-active');
    likesButton?.classList.remove('active');
    likesButton?.setAttribute('aria-pressed','false');
  }
  function renderLikes(){
    library.replaceChildren();
    const songs=savedSongs();
    const title=el('div','studio-library-top');
    const copy=el('div');
    copy.appendChild(el('span','studio-library-eyebrow','ВАША МУЗЫКА'));
    copy.appendChild(el('h2','studio-library-heading','Мне нравится'));
    copy.appendChild(el('p','studio-library-caption',
      songs.length+' треков · из ваших плейлистов'));
    title.appendChild(copy);
    const close=el('button','studio-library-close');
    close.type='button';close.title='Вернуться к списку';close.setAttribute('aria-label','Вернуться к трекам');
    close.appendChild(el('i','fas fa-xmark'));
    close.addEventListener('click',hideLikes);title.appendChild(close);
    library.appendChild(title);
    if(!songs.length) {
      const empty=el('div','studio-library-empty');
      empty.appendChild(el('i','far fa-heart'));
      empty.appendChild(el('strong','','Здесь появятся любимые песни'));
      empty.appendChild(el('p','',
        'Добавьте песни в плейлист и убедитесь, что он не исключён из «Мне нравится».'));
      library.appendChild(empty);return;
    }
    const list=el('div','studio-liked-list');
    const image=themeCover();
    songs.forEach((track,index)=>{
      const card=el('button','studio-like-row');
      card.type='button';card.title='Слушать '+String(track.title||'трек');
      const thumb=el('img','theme-aware-thumb');thumb.alt='';thumb.src=image;
      const info=el('div','studio-like-text');
      info.appendChild(el('strong','',track.title||'Без названия'));
      info.appendChild(el('small','',track.artist||'Неизвестный исполнитель'));
      card.append(thumb,info,el('i','fas fa-play studio-like-play'));
      card.addEventListener('click',()=>{
        hideLikes();
        playlist=songs.slice();currentTab='studio-likes';
        renderPlaylist();playTrack(index);
      });
      list.appendChild(card);
    });
    library.appendChild(list);
  }
  window.openStudioLikes=function(){
    if(showingLikes){hideLikes();return;}
    showingLikes=true;renderLikes();
    library.classList.add('active');right.classList.add('studio-library-active');
    likesButton?.classList.add('active');likesButton?.setAttribute('aria-pressed','true');
    waveButton?.classList.remove('active');
  };
  window.openStudioWave=function(){
    hideLikes();
    waveButton?.classList.add('active');
    document.getElementById('studio-header-offline')?.classList.remove('active');
    if(typeof startQuickMix==='function')startQuickMix('wave');
  };
  // Return to the real list when a user searches, chooses a playlist or starts
  // a mix. No replacement of the existing source-switching/audio functions.
  document.addEventListener('click',event=>{
    const target=event.target.closest?.('#tab-search-btn,.quick-mix-btn,.playlist-select-btn,.studio-library-close');
    if(target){hideLikes();waveButton?.classList.remove('active');
        document.getElementById('studio-header-offline')?.classList.remove('active');}
  },true);
  searchInput?.addEventListener('focus',()=>{
    if(showingLikes){hideLikes();if(typeof switchTab==='function')switchTab('search');}
  });
  let lastData='';
  function synchronize(){
    if(document.hidden)return;
    const cover=themeCover();
    if(cover!==coverName){coverName=cover;headerLogo.src=cover;
      library.querySelectorAll('img.theme-aware-thumb').forEach(img=>img.src=cover);}
    if(!showingLikes)return;
    const songs=savedSongs();
    const signature=songs.map(s=>String(s.artist)+'|'+String(s.title)+'|'+String(s.url)).join('~');
    if(signature!==lastData){lastData=signature;renderLikes();}
  }
  window.addEventListener('dag-library-changed',()=>{lastData='';if(showingLikes)renderLikes();});
  synchronize();
  const heartbeat=setInterval(synchronize,1600);
  window.addEventListener('pagehide',()=>clearInterval(heartbeat),{once:true});
})();
