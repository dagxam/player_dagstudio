/* DAGSTUDIO VISION / presentation only.
 * Do not create audio, change playlists or replace any existing controller.
 * All controls below call the already installed DAGSTUDIO actions.
 */
(() => {
  'use strict';
  const root = document.querySelector('.main-container.studio-showcase');
  const pane = document.getElementById('right-col-container');
  const gallery = document.getElementById('studio-curations');
  if (!root || !pane || !gallery || document.getElementById('vision-home-hero')) return;
  root.classList.add('vision-ui');

  const el = (tag, cls = '', text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const icon = name => {
    const i = el('i', 'fas fa-' + name);
    i.setAttribute('aria-hidden', 'true');
    return i;
  };
  const button = (className, title, glyph, handler) => {
    const b = el('button', className);
    b.type = 'button';
    b.title = title;
    b.setAttribute('aria-label', title);
    if (glyph) b.appendChild(icon(glyph));
    b.addEventListener('click', handler);
    return b;
  };
  const invokeNav = key => document.getElementById('showcase-' + key)?.click();
  const openHome = () => {
    root.classList.remove('vision-player-expanded');
    if (typeof window.studioCenterRender === 'function') window.studioCenterRender('home');
    else window.studioShowCurated?.();
    updateNav();
  };
  const openSearch = () => {
    root.classList.remove('vision-player-expanded');
    invokeNav('search');
    document.getElementById('search-input')?.focus();
  };
  const openWave = () => {
    root.classList.remove('vision-player-expanded');
    invokeNav('wave');
    updateNav();
  };
  // Brand marks are decorative only; selecting a track or using the mini-player
  // opens the full player. The logo/text never acts as a navigation link.
  const brand = document.querySelector('.showcase-sidebar .showcase-brand');
  const playingPanel = document.querySelector('.main-container.studio-showcase > .left-col');
  const expandPlayer = () => {
    root.classList.add('vision-player-expanded');
    updateNav();
    refreshVisualizer();
  };
  window.studioExpandPlayer = expandPlayer;
  const collapsePlayer = () => {
    root.classList.remove('vision-player-expanded');
    updateNav();
    refreshVisualizer();
  };
  // Mobile brand remains visible but is deliberately noninteractive.
  const mobileBrand = el('div', 'vision-top-brand');
  const mobileBrandImage = el('img', 'vision-top-brand-art');
  mobileBrandImage.alt = '';
  mobileBrandImage.src = brand?.querySelector('img')?.getAttribute('src') || 'images/cover.png';
  mobileBrand.append(mobileBrandImage, el('span', '', 'DAGSTUDIO'));

  // Lightweight context label above the same artwork/controls as My Wave.
  const playerHead = el('div', 'vision-now-head');
  // One subtle caption; the real track and artist provide the information.
  playerHead.append(el('span', 'vision-now-kicker', 'СЕЙЧАС ИГРАЕТ'));
  playingPanel?.insertBefore(playerHead, playingPanel.firstChild);
  const swipeHint = el('div', 'vision-swipe-hint');
  swipeHint.append(icon('arrow-left'), el('span', '', 'Влево — следующий · вправо — предыдущий'), icon('arrow-right'));
  playingPanel?.appendChild(swipeHint);

  // Visuals are deliberately independent of MediaElementSource and Media3.
  // There must be only one audio pipeline: the existing EQ and native player.
  const VISUALIZER_KEY = 'dag_visualizer_settings_v1';
  const VISUALIZER_OPTIONS = {
    mode: ['bars','wave','circle','pulse','particles','off'],
    intensity: ['soft','normal','strong'],
    color: ['theme','copper','violet','ocean','mint','rose','ice','white','custom'],
    quality: ['auto','smooth','economy','off']
  };
  const visualizerDefaults = {mode:'bars',intensity:'normal',color:'violet',quality:'auto',customColor:'#BFA7FF'};
  const normalizeVisualizerSettings = candidate => {
    const cfg = {};
    for (const [key, allowed] of Object.entries(VISUALIZER_OPTIONS)) {
      cfg[key] = allowed.includes(candidate?.[key]) ? candidate[key] : visualizerDefaults[key];
    }
    const raw = String(candidate?.customColor || '');
    cfg.customColor = /^#[0-9a-fA-F]{6}$/.test(raw) ? raw.toUpperCase() : visualizerDefaults.customColor;
    return cfg;
  };
  let visualizerSettings = visualizerDefaults;
  try {
    visualizerSettings = normalizeVisualizerSettings(JSON.parse(localStorage.getItem(VISUALIZER_KEY) || 'null'));
  } catch (_) {}
  const visualContainer = playingPanel?.querySelector('.visual-container');
  const vizStage = el('div', 'vision-viz-stage');
  vizStage.setAttribute('role','img');
  vizStage.setAttribute('aria-label','Декоративная анимация текущего воспроизведения');
  const vizCanvas = document.createElement('canvas');
  vizCanvas.className = 'vision-viz-canvas';
  vizCanvas.setAttribute('aria-hidden','true');
  vizStage.appendChild(vizCanvas);
  visualContainer?.appendChild(vizStage);
  const vizContext = vizCanvas.getContext?.('2d', {alpha:true});
  const vizPreview = document.getElementById('vision-viz-preview');
  const vizPreviewArt = vizPreview?.querySelector('.vision-viz-preview-art');
  const vizSettingsCard = document.querySelector('.vision-viz-settings');
  const vizColorButtons = [...document.querySelectorAll('[data-viz-palette]')];
  const vizCustomColor = document.getElementById('vision-viz-custom-color');
  const vizStatus = document.getElementById('vision-viz-status');
  // CSS preview: lightweight on low-power Android head units, no second audio/canvas pipeline.
  if(vizPreviewArt){
    for(let i=0;i<17;i++){
      const mark=el('span','vision-viz-preview-mark');
      const level=.35+.65*Math.abs(Math.sin(i*1.13+.8));
      mark.style.setProperty('--viz-i',String(i));
      mark.style.setProperty('--viz-level',String(level));
      mark.style.setProperty('--viz-angle',(i*360/17).toFixed(2)+'deg');
      mark.style.setProperty('--viz-dot-x',(50+Math.cos(i*2.39996)*Math.sqrt((i+.5)/17)*38).toFixed(1)+'%');
      mark.style.setProperty('--viz-dot-y',(50+Math.sin(i*2.39996)*Math.sqrt((i+.5)/17)*34).toFixed(1)+'%');
      mark.style.height=Math.round(24+level*52)+'px';
      mark.style.animationDelay=(-i*.073).toFixed(3)+'s';
      vizPreviewArt.appendChild(mark);
    }
  }
  const visualizerAudio = document.getElementById('main-audio');
  const vizInputs = {
    mode: document.getElementById('vision-viz-mode'),
    intensity: document.getElementById('vision-viz-intensity'),
    color: document.getElementById('vision-viz-color'),
    quality: document.getElementById('vision-viz-quality')
  };
  let vizFrame = 0;
  let vizPrevious = 0;
  let vizPhase = 0;
  const isVisualPlaybackActive = () => {
    // The visible play button is also updated by native Media3.
    const button = document.getElementById('btn-play');
    const playIcon = button?.querySelector('i');
    if (playIcon?.classList?.contains('fa-pause')) return true;
    if (playIcon?.classList?.contains('fa-play')) return false;
    return !!visualizerAudio && !visualizerAudio.paused;
  };
  const visualizerReduced = () => {
    const memory = Number(navigator.deviceMemory || 0);
    const threads = Number(navigator.hardwareConcurrency || 0);
    const saving = !!navigator.connection?.saveData;
    return (memory > 0 && memory <= 2) || (threads > 0 && threads <= 2) || saving;
  };
  const visualizerFrameRate = () => {
    if (visualizerSettings.quality === 'off') return 0;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return 5;
    if (visualizerSettings.quality === 'economy' ||
        (visualizerSettings.quality === 'auto' && visualizerReduced())) return 18;
    return visualizerSettings.quality === 'smooth' ? 45 : 30;
  };
  const visualizerActive = () => root.classList.contains('vision-player-expanded') &&
    visualizerSettings.mode !== 'off' && visualizerFrameRate() > 0 && !document.hidden;
  const VISUALIZER_COLORS = Object.freeze({
    copper:'#FFB978',violet:'#D2A1FF',ocean:'#83DCE9',
    mint:'#78EACB',rose:'#FF88BC',ice:'#A7CFFF',white:'#F5F7FF'
  });
  const visualizerColor = () => {
    if(visualizerSettings.color==='custom')return visualizerSettings.customColor;
    if(visualizerSettings.color!=='theme')
      return VISUALIZER_COLORS[visualizerSettings.color]||VISUALIZER_COLORS.violet;
    const styles=window.getComputedStyle(root);
    return styles.getPropertyValue('--theme-bright').trim()||'#FFB978';
  };
  const roundedVisualizerRect = (ctx,x,y,w,h,r) => {
    const radius = Math.min(r,w/2,h/2);
    ctx.beginPath();
    ctx.moveTo(x+radius,y);
    ctx.lineTo(x+w-radius,y); ctx.quadraticCurveTo(x+w,y,x+w,y+radius);
    ctx.lineTo(x+w,y+h-radius); ctx.quadraticCurveTo(x+w,y+h,x+w-radius,y+h);
    ctx.lineTo(x+radius,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-radius);
    ctx.lineTo(x,y+radius); ctx.quadraticCurveTo(x,y,x+radius,y);
    ctx.closePath();
  };
  const visualizerEnergy = (i,t,active) => {
    if (!active) return .045;
    const strength = {soft:.62,normal:1,strong:1.38}[visualizerSettings.intensity] || 1;
    // A lightweight decorative rhythm (not an FFT measurement of the audio).
    const pulse = Math.abs(Math.sin(t*1.7 + i*.65)*Math.cos(t*.62-i*.29));
    const shimmer = .15*Math.abs(Math.sin(t*4.1+i*1.13));
    return Math.min(1, (.11+.76*pulse+shimmer)*strength);
  };
  const drawVisualizer = (stamp) => {
    if (!vizContext || !visualizerActive() || !vizStage.isConnected) return;
    const rect = vizStage.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return;
    const rate = visualizerFrameRate();
    if (vizPrevious && stamp-vizPrevious < 1000/rate) return;
    const elapsed = vizPrevious ? Math.min(.08,(stamp-vizPrevious)/1000) : 0;
    vizPrevious=stamp;
    const playing = isVisualPlaybackActive();
    if (playing && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
      vizPhase += elapsed * 2.8;
    const ratio = Math.min(window.devicePixelRatio || 1,
      rate <= 18 ? 1 : 1.5);
    const width = Math.round(rect.width * ratio);
    const height = Math.round(rect.height * ratio);
    if (vizCanvas.width !== width || vizCanvas.height !== height) {
      vizCanvas.width = width;
      vizCanvas.height = height;
    }
    const ctx = vizContext;
    ctx.setTransform(ratio,0,0,ratio,0,0);
    const w=rect.width,h=rect.height,cx=w/2,cy=h/2;
    ctx.clearRect(0,0,w,h);
    const color=visualizerColor();
    const mode=visualizerSettings.mode;
    const quality=rate <= 18;
    ctx.save();
    // Slight internal aura, not a giant background painting over the album.
    const aura=ctx.createRadialGradient(cx,cy,8,cx,cy,Math.min(w,h)*.57);
    aura.addColorStop(0,color);
    aura.addColorStop(1,'transparent');
    ctx.save();ctx.globalAlpha=.11;ctx.fillStyle=aura;ctx.fillRect(0,0,w,h);ctx.restore();
    ctx.shadowColor=color;
    ctx.shadowBlur=quality ? 5 : 14;
    if (mode==='bars') {
      const n=quality?24:40;
      const gap=Math.max(3, Math.min(8,w/(n*3.5)));
      const usable=Math.min(w*.8,520);
      const bw=Math.max(2,(usable-gap*(n-1))/n);
      const start=cx-usable/2;
      for(let i=0;i<n;i++){
        const e=visualizerEnergy(i,vizPhase,playing);
        const bh=Math.max(4, e*h*.62);
        ctx.globalAlpha=.55+.4*e;
        ctx.fillStyle=color;
        roundedVisualizerRect(ctx,start+i*(bw+gap),cy-bh/2,bw,bh,bw/2);
        ctx.fill();
      }
    } else if (mode==='wave') {
      for(let j=0;j<3;j++) {
        ctx.beginPath();ctx.lineWidth=4-j;
        ctx.strokeStyle=color;ctx.globalAlpha=.76-j*.2;
        const base=h*.1 + j*h*.05;
        for(let x=0;x<=w;x+=quality?7:4) {
          const fade=Math.pow(Math.max(0,1-Math.abs(x-cx)/(w*.53)),1.25);
          const amp=playing?base:3;
          const y=cy+Math.sin((x/w)*Math.PI*(5+j) + vizPhase*(1.6+j*.32)+j)*fade*amp;
          if(x===0)ctx.moveTo(x,y); else ctx.lineTo(x,y);
        }
        ctx.stroke();
      }
    } else if (mode==='circle') {
      const count=quality?48:84, radius=Math.min(w,h)*.25;
      for(let i=0;i<count;i++){
        const a=i/count*Math.PI*2-Math.PI/2;
        const e=visualizerEnergy(i,vizPhase,playing);
        const extra=5+e*Math.min(w,h)*.19;
        ctx.lineWidth=quality?3.2:2.6;ctx.lineCap='round';
        ctx.strokeStyle=color;ctx.globalAlpha=.3+.65*e;
        ctx.beginPath();
        ctx.moveTo(cx+Math.cos(a)*radius,cy+Math.sin(a)*radius);
        ctx.lineTo(cx+Math.cos(a)*(radius+extra),cy+Math.sin(a)*(radius+extra));
        ctx.stroke();
      }
      ctx.lineWidth=2;ctx.globalAlpha=.43;
      ctx.beginPath();ctx.arc(cx,cy,radius*.84,0,Math.PI*2);ctx.stroke();
    } else if (mode==='pulse') {
      const e=visualizerEnergy(3,vizPhase,playing);
      const maxRadius=Math.min(w,h)*.42;
      for(let i=3;i>=0;i--){
        ctx.beginPath();ctx.lineWidth=2+i*.8;
        ctx.globalAlpha=.13+(3-i)*.12;
        ctx.strokeStyle=color;
        ctx.arc(cx,cy,Math.max(8,maxRadius*(.28+i*.2+e*.08)),0,Math.PI*2);
        ctx.stroke();
      }
      ctx.globalAlpha=.63;ctx.fillStyle=color;
      ctx.beginPath();ctx.arc(cx,cy,maxRadius*(.17+e*.065),0,Math.PI*2);ctx.fill();
    } else if (mode==='particles') {
      const count=quality?32:70;
      const maxRadius=Math.min(w,h)*.44;
      for(let i=0;i<count;i++){
        const theta=i*2.39996+(playing?vizPhase*.21:0);
        const radial=Math.sqrt((i+.5)/count)*maxRadius;
        const e=visualizerEnergy(i,vizPhase,playing);
        const x=cx+Math.cos(theta)*radial, y=cy+Math.sin(theta)*radial*.72;
        ctx.globalAlpha=.35+e*.55;ctx.fillStyle=color;
        ctx.beginPath();ctx.arc(x,y,1.6+e*3.5,0,Math.PI*2);ctx.fill();
      }
    }
    ctx.restore();
  };
  const visualizerTick = stamp => {
    vizFrame = 0;
    if (!visualizerActive()) { vizPrevious=0; return; }
    drawVisualizer(stamp);
    vizFrame = window.requestAnimationFrame(visualizerTick);
  };
  function refreshVisualizer() {
    const expanded = root.classList.contains('vision-player-expanded');
    const visible = expanded && visualizerSettings.mode !== 'off' &&
      visualizerFrameRate()>0 && !!vizContext;
    if (root.classList.contains('vision-viz-visible') !== visible)
      root.classList.toggle('vision-viz-visible',visible);
    if (visible && !document.hidden && !vizFrame) {
      vizPrevious=0; vizFrame=window.requestAnimationFrame(visualizerTick);
    }
    if ((!visible || document.hidden) && vizFrame) {
      window.cancelAnimationFrame(vizFrame);vizFrame=0;vizPrevious=0;
    }
  }
  const syncVisualizerControls=()=>{
    for(const [key,item] of Object.entries(vizInputs))if(item)item.value=visualizerSettings[key];
    if(vizCustomColor)vizCustomColor.value=visualizerSettings.customColor;
    for(const btn of vizColorButtons){
      const active=btn.dataset.vizPalette===visualizerSettings.color;
      btn.classList.toggle('is-selected',active);
      btn.setAttribute('aria-pressed',String(active));
    }
    const color=visualizerColor();
    vizSettingsCard?.style.setProperty('--viz-selected-color',color);
    vizPreview?.style.setProperty('--viz-selected-color',color);
    if(vizPreview)vizPreview.dataset.vizMode=visualizerSettings.mode;
    const off=visualizerSettings.mode==='off'||visualizerSettings.quality==='off';
    vizPreview?.classList.toggle('is-off',off);
    if(vizStatus){
      vizStatus.textContent=off?'ВЫКЛЮЧЕНА':'ВКЛЮЧЕНА';
      vizStatus.classList.toggle('is-off',off);
    }
  };
  const updateVizSettings=patch=>{
    visualizerSettings=normalizeVisualizerSettings({...visualizerSettings,...patch});
    try{localStorage.setItem(VISUALIZER_KEY,JSON.stringify(visualizerSettings));}catch(_){}
    window.DAG_PROFILE_SYNC?.change('visualizer',visualizerSettings);
    syncVisualizerControls();
    refreshVisualizer();
  };
  for(const [name,control] of Object.entries(vizInputs)){
    if(!control)continue;
    control.addEventListener('change',()=>updateVizSettings({[name]:control.value}));
  }
  for(const btn of vizColorButtons){
    btn.addEventListener('click',()=>{
      updateVizSettings({color:btn.dataset.vizPalette});
      if(btn.dataset.vizPalette==='custom')vizCustomColor?.focus();
    });
  }
  vizCustomColor?.addEventListener('input',()=>{
    updateVizSettings({color:'custom',customColor:vizCustomColor.value});
  });
  window.addEventListener('dag-profile-visualizer',event=>{
    visualizerSettings=normalizeVisualizerSettings(event.detail?.value);
    syncVisualizerControls();
    refreshVisualizer();
  });
  syncVisualizerControls();
  document.addEventListener('visibilitychange',refreshVisualizer,{passive:true});
  window.addEventListener('pagehide', () => {
    if(vizFrame)window.cancelAnimationFrame(vizFrame);
    vizFrame=0;
  },{once:true});
  // Sidebar navigation closes the fullscreen view without stopping audio.
  const vizWatch = new MutationObserver(refreshVisualizer);
  vizWatch.observe(root,{attributes:true,attributeFilter:['class']});
  refreshVisualizer();

  // Decorative cover layers must not start browser image-drag instead of swiping.
  playingPanel?.querySelectorAll('.visual-container img').forEach(img => { img.draggable = false; });
  playingPanel?.addEventListener('dragstart', event => {
    if (root.classList.contains('vision-player-expanded') &&
        event.target.closest?.('.visual-container, .track-info-display')) event.preventDefault();
  });

  // Horizontal gestures work on touch devices and mouse/trackpad pointer drags.
  // Vertical scrolling and taps on controls are never interpreted as a swipe.
  const swipeDirection = (dx, dy) =>
    Math.abs(dx) >= 60 && Math.abs(dx) > Math.abs(dy) * 1.45 ? (dx < 0 ? 'next' : 'prev') : '';
  let swipeStart = null;
  let switching = false;
  const canSwipe = target => root.classList.contains('vision-player-expanded') &&
    target?.closest?.('.visual-container, .track-info-display') &&
    !target.closest('button, a, input, .progress-area, .main-btns') &&
    typeof playbackPlaylist !== 'undefined' && playbackPlaylist.length > 0 &&
    typeof currentIndex !== 'undefined' && currentIndex >= 0;
  const resetSwipe = () => {
    swipeStart = null;
    playingPanel?.classList.remove('vision-swipe-dragging');
    playingPanel?.style.removeProperty('--vision-swipe-x');
  };
  const finishSwipe = (dx, dy) => {
    resetSwipe();
    if (switching) return;
    const direction = swipeDirection(dx, dy);
    if (!direction) return;
    switching = true;
    playingPanel.classList.remove('vision-swipe-next', 'vision-swipe-prev');
    void playingPanel.offsetWidth;
    playingPanel.classList.add(direction === 'next' ? 'vision-swipe-next' : 'vision-swipe-prev');
    try {
      // Reuse the original commands: playlist, shuffled order, playback queue,
      // smart radio and native audio remain the source of truth.
      if (direction === 'next') window.playNext?.();
      else window.playPrev?.();
    } finally {
      window.setTimeout(() => {
        playingPanel.classList.remove('vision-swipe-next', 'vision-swipe-prev');
        switching = false;
      }, 340);
    }
  };
  if ('PointerEvent' in window) {
    playingPanel?.addEventListener('pointerdown', event => {
      resetSwipe();
      if (switching || event.isPrimary === false ||
          (event.pointerType === 'mouse' && event.button !== 0) || !canSwipe(event.target)) return;
      swipeStart = {id:event.pointerId, x:event.clientX, y:event.clientY};
      try { playingPanel.setPointerCapture?.(event.pointerId); } catch (_) {}
    });
    playingPanel?.addEventListener('pointermove', event => {
      if (!swipeStart || swipeStart.id !== event.pointerId) return;
      const dx = event.clientX - swipeStart.x;
      const dy = event.clientY - swipeStart.y;
      if (Math.abs(dx) < 8 || Math.abs(dx) <= Math.abs(dy) * 1.3) return;
      playingPanel.classList.add('vision-swipe-dragging');
      playingPanel.style.setProperty('--vision-swipe-x', Math.max(-110, Math.min(110, dx)) + 'px');
    });
    playingPanel?.addEventListener('pointerup', event => {
      if (!swipeStart || swipeStart.id !== event.pointerId) return;
      const {x, y} = swipeStart;
      finishSwipe(event.clientX - x, event.clientY - y);
    });
    playingPanel?.addEventListener('pointercancel', resetSwipe);
    playingPanel?.addEventListener('lostpointercapture', () => {
      if (swipeStart) resetSwipe();
    });
  } else {
    // Older Android WebViews without Pointer Events.
    playingPanel?.addEventListener('touchstart', event => {
      resetSwipe();
      if (switching || event.touches.length !== 1 || !canSwipe(event.target)) return;
      swipeStart = {x:event.touches[0].clientX, y:event.touches[0].clientY};
    }, {passive:true});
    playingPanel?.addEventListener('touchend', event => {
      if (!swipeStart || !event.changedTouches.length) return;
      const {x, y} = swipeStart;
      finishSwipe(event.changedTouches[0].clientX - x, event.changedTouches[0].clientY - y);
    }, {passive:true});
    playingPanel?.addEventListener('touchcancel', resetSwipe, {passive:true});
  }
  const openSettings = () => invokeNav('settings');

  // Site-wide search affordance: the existing #search-input remains the ONLY
  // input (history, debounce, search sources and pagination are untouched).
  const topbar = el('header', 'vision-topbar');
  topbar.appendChild(mobileBrand);
  const searchTrigger = button('vision-top-search', 'Открыть поиск музыки', 'magnifying-glass', openSearch);
  searchTrigger.appendChild(el('span', '', 'Трек, исполнитель или плейлист'));
  // Relocate the ORIGINAL input instead of creating a second search engine.
  // Event handlers, history, paging and source fetches stay attached.
  const originalSearch = document.getElementById('search-container-box');
  if (originalSearch) {
    originalSearch.classList.add('vision-unified-search');
    topbar.appendChild(originalSearch);
  } else topbar.appendChild(searchTrigger);
  const topActions = el('div', 'vision-top-actions');
  // Queue management remains internal; keep the topbar focused on essential navigation.
  topActions.appendChild(button('vision-top-icon', 'Настройки', 'gear', openSettings));
  const menu = button('vision-top-icon vision-menu-icon', 'Открыть разделы', 'bars',
    () => document.getElementById('showcase-menu-toggle')?.click());
  topActions.appendChild(menu);
  topbar.appendChild(topActions);
  pane.insertBefore(topbar, pane.firstChild);

  // A genuine, responsive hero with a vector mountain scene from this app.
  const hero = el('section', 'vision-home-hero');
  hero.id = 'vision-home-hero';
  hero.setAttribute('aria-labelledby', 'vision-home-title');
  const image = el('img', 'vision-hero-scene');
  image.src = 'images/vision-hero.svg';
  image.alt = '';
  image.decoding = 'async';
  hero.appendChild(image);
  const veil = el('div', 'vision-hero-veil');
  hero.appendChild(veil);
  const body = el('div', 'vision-hero-copy');
  const tag = el('span', 'vision-hero-tag');
  tag.appendChild(icon('wave-square'));
  tag.appendChild(document.createTextNode(' ТВОЯ МУЗЫКА'));
  body.appendChild(tag);
  const title = el('h1', '', 'Моя волна');
  title.id = 'vision-home-title';
  body.appendChild(title);
  body.appendChild(el('p', '', 'Бесконечный поток музыки, подобранный под твой вкус.'));
  const buttons = el('div', 'vision-hero-buttons');
  const listen = button('vision-primary', 'Открыть Мою волну', 'play', openWave);
  listen.appendChild(el('span', '', 'Открыть'));
  buttons.appendChild(listen);
  const tune = button('vision-hero-settings', 'Открыть музыкальные подборки', 'sliders',
    () => { if (typeof window.openQuickMixes === 'function') window.openQuickMixes(); });
  buttons.appendChild(tune);
  body.appendChild(buttons);
  hero.appendChild(body);
  pane.insertBefore(hero, gallery);

  const quick = el('section', 'vision-quick');
  const quickHead = el('div', 'vision-section-title');
  quickHead.appendChild(el('h2', '', 'Сегодня для тебя'));
  quick.appendChild(quickHead);
  const shortcuts = el('div', 'vision-quick-grid');
  const options = [
    ['Для тебя', 'Твоя музыка', 'heart', () => window.studioCenterRender?.('playlists'), 'personal'],
    ['Популярное', 'Любимые хиты', 'fire', () => window.studioCenterMix?.('hits'), 'hits'],
    ['Новинки', 'Новые открытия', 'star', () => window.studioCenterMix?.('charts'), 'latest'],
    ['В дорогу', 'Для путешествий', 'route', () => window.studioCenterMix?.('road'), 'road']
  ];
  for (const [name, hint, glyph, action, tone] of options) {
    const item = button('vision-quick-card vision-' + tone, name, glyph, action);
    const words = el('span', 'vision-quick-words');
    words.append(el('strong', '', name), el('small', '', hint));
    item.appendChild(words);
    shortcuts.appendChild(item);
  }
  quick.appendChild(shortcuts);
  pane.insertBefore(quick, gallery);

  // Render only real account playlists. No fake track names, counts or media.
  const shelf = el('section', 'vision-library');
  shelf.id = 'vision-library';
  const shelfHead = el('div', 'vision-section-title');
  shelfHead.appendChild(el('h2', '', 'Твои плейлисты'));
  const openAll = button('vision-text-action', 'Открыть все плейлисты', 'chevron-right',
    () => window.studioCenterRender?.('playlists'));
  openAll.prepend(document.createTextNode('Все плейлисты '));
  shelfHead.appendChild(openAll);
  shelf.appendChild(shelfHead);
  const shelfList = el('div', 'vision-playlists');
  shelf.appendChild(shelfList);
  pane.insertBefore(shelf, gallery);

  function getLibrary() {
    try {
      // playlists is the original shared library store in script.js.
      return typeof playlists !== 'undefined' && Array.isArray(playlists) ? playlists : [];
    } catch (_) { return []; }
  }
  function refreshLibrary() {
    shelfList.replaceChildren();
    const data = getLibrary().filter(x => x && x.type !== 'favorites').slice(0, 8);
    if (!data.length) {
      const empty = button('vision-empty-library', 'Открыть плейлисты', 'plus',
        () => window.studioCenterRender?.('playlists'));
      empty.appendChild(el('span', '', 'Плейлисты появятся здесь после входа или создания'));
      shelfList.appendChild(empty);
      return;
    }
    for (const entry of data) {
      const action = button('vision-playlist-card', 'Открыть плейлист ' + String(entry.name || ''),
        null, () => window.studioCenterOpenPlaylist?.(entry.id));
      const art = el('span', 'vision-playlist-art');
      let cover = '';
      try { cover = typeof playlistCoverUrl === 'function' ? playlistCoverUrl(entry.cover) : ''; }
      catch (_) {}
      if (cover) {
        const img = el('img'); img.src = cover; img.alt = ''; img.loading = 'lazy';
        art.appendChild(img);
      } else art.appendChild(icon('music'));
      const txt = el('span', 'vision-playlist-info');
      txt.appendChild(el('strong', '', String(entry.name || 'Плейлист')));
      txt.appendChild(el('small', '', (Array.isArray(entry.tracks) ? entry.tracks.length : 0) + ' треков'));
      action.append(art, txt, icon('play'));
      shelfList.appendChild(action);
    }
  }
  window.addEventListener('dag-playlists-updated', refreshLibrary);
  window.addEventListener('dag-library-changed', refreshLibrary);
  refreshLibrary();

  // A compact, view-only mini player for smartphones. The original audio
  // element, playTrack(), updateProgress(), queue and Media3 stay authoritative.
  const mini = el('div', 'vision-mini-player');
  mini.id = 'vision-mini-player';
  mini.setAttribute('aria-label', 'Сейчас играет');
  // The compact bar shows the current song; only the header brand opens fullscreen.
  const expand = el('div', 'vision-mini-expand');
  expand.setAttribute('aria-label', 'Текущий трек');
  const miniArt = el('img', 'vision-mini-art');
  miniArt.src = 'images/studio-sunset.svg';
  miniArt.alt = '';
  expand.appendChild(miniArt);
  const miniLabels = el('span', 'vision-mini-labels');
  const miniTitle = el('strong', '', 'DAGSTUDIO PLAYER');
  const miniArtist = el('small', '', 'Музыка для тебя');
  miniLabels.append(miniTitle, miniArtist);
  expand.appendChild(miniLabels);
  mini.appendChild(expand);
  const miniPlay = button('vision-mini-control', 'Плей или пауза', 'play', () => {
    if (typeof window.togglePlay === 'function') window.togglePlay();
  });
  mini.appendChild(miniPlay);
  mini.appendChild(button('vision-mini-control vision-mini-next', 'Следующий трек', 'forward-step', () => {
    if (typeof window.playNext === 'function') window.playNext();
  }));
  root.appendChild(mini);

  const mobileNav = el('nav', 'vision-bottom-nav');
  mobileNav.setAttribute('aria-label', 'Основная навигация');
  const bottomItems = [
    ['home', 'Главная', 'house', openHome],
    ['wave', 'Моя волна', 'wave-square', openWave],
    ['playlists', 'Плейлисты', 'music', () => { collapsePlayer(); invokeNav('playlists'); }],
    ['likes', 'Нравится', 'heart', () => { collapsePlayer(); invokeNav('likes'); }],
    ['menu', 'Ещё', 'bars', () => {
      // Return to the library layout before opening the existing drawer;
      // the sidebar is intentionally hidden behind the fullscreen player.
      collapsePlayer();
      root.classList.remove('showcase-wave-only');
      document.getElementById('showcase-menu-toggle')?.click();
      updateNav();
    }]
  ];
  const bottomMap = new Map();
  for (const [key, name, glyph, handler] of bottomItems) {
    const item = button('vision-bottom-item', name, glyph, handler);
    item.dataset.vision = key;
    item.appendChild(el('span', '', name));
    mobileNav.appendChild(item);
    bottomMap.set(key, item);
  }
  root.appendChild(mobileNav);

  // A real Back action. Track lists keep their previous search/playlist view;
  // full-screen Wave and collection mixes return to their originating section.
  // No audio, queue, shuffle, or track state is changed by navigation.
  const goBackFromPlayer = () => {
    const isFullMix = root.classList.contains('showcase-wave-only');
    const fromCollection = Boolean(root.dataset.activeMix);
    collapsePlayer();
    if (isFullMix) {
      delete root.dataset.activeMix;
      root.classList.remove('showcase-wave-only');
      const destination = fromCollection ? 'collections' : 'home';
      if (typeof window.studioCenterRender === 'function')
        window.studioCenterRender(destination);
      else window.studioShowCurated?.();
    }
    updateNav();
  };
  const back = button('vision-player-back', 'Назад', 'arrow-left', goBackFromPlayer);
  back.appendChild(el('span', 'vision-back-label', 'Назад'));
  root.appendChild(back);

  function updateNav() {
    const active = document.querySelector('#studio-navigation .showcase-nav-btn.active')?.dataset.showcase;
    const selected = root.classList.contains('showcase-wave-only') ? 'wave'
      : root.classList.contains('vision-player-expanded')
        ? (active === 'wave' ? 'wave' : 'current')
      : (pane.classList.contains('showcase-curated') && active === 'wave') ? 'home'
      : active;
    root.classList.toggle('vision-home-active', selected === 'home');
    for (const [key, item] of bottomMap) {
      const on = selected === key;
      item.classList.toggle('active', on);
      if (on) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    }
  }
  function updateMini() {
    const trackTitle = document.getElementById('track-title')?.textContent?.trim() || '';
    const artist = document.getElementById('track-artist')?.textContent?.trim() || '';
    miniTitle.textContent = trackTitle || 'DAGSTUDIO PLAYER';
    miniArtist.textContent = artist || 'Твоя музыка';
    const original = document.getElementById('btn-play');
    const paused = Boolean(original?.querySelector('.fa-play')) ||
      original?.getAttribute('aria-label') === 'Плей';
    miniPlay.replaceChildren(icon(paused ? 'play' : 'pause'));
    miniPlay.setAttribute('aria-label', paused ? 'Воспроизвести' : 'Пауза');
  }
  const watch = new MutationObserver(() => { updateMini(); updateNav(); });
  for (const id of ['track-title', 'track-artist', 'btn-play', 'studio-navigation']) {
    const target = document.getElementById(id);
    if (target) watch.observe(target, {childList: true, subtree: true, attributes: id === 'studio-navigation'});
  }
  const audio = document.getElementById('main-audio');
  audio?.addEventListener('play', updateMini);
  audio?.addEventListener('pause', updateMini);
  window.addEventListener('dag-native-state', updateMini);
  window.addEventListener('pagehide', () => watch.disconnect(), {once: true});
  updateMini();
  updateNav();
})();
