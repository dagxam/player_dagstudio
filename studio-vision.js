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
  const openSettings = () => invokeNav('settings');

  // Site-wide search affordance: the existing #search-input remains the ONLY
  // input (history, debounce, search sources and pagination are untouched).
  const topbar = el('header', 'vision-topbar');
  const searchTrigger = button('vision-top-search', 'Открыть поиск музыки', 'magnifying-glass', openSearch);
  searchTrigger.appendChild(el('span', '', 'Трек, исполнитель или плейлист'));
  topbar.appendChild(searchTrigger);
  const topActions = el('div', 'vision-top-actions');
  topActions.appendChild(button('vision-top-icon', 'Очередь воспроизведения', 'list-ol',
    () => { if (typeof window.openPlaybackQueue === 'function') window.openPlaybackQueue(); }));
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
  const listen = button('vision-primary', 'Слушать Мою волну', 'play', openWave);
  listen.appendChild(el('span', '', 'Слушать'));
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
  const expand = button('vision-mini-expand', 'Открыть проигрыватель', null, () => {
    root.classList.add('vision-player-expanded');
    updateNav();
  });
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
    ['playlists', 'Плейлисты', 'music', () => invokeNav('playlists')],
    ['likes', 'Нравится', 'heart', () => invokeNav('likes')],
    ['menu', 'Ещё', 'bars', () => document.getElementById('showcase-menu-toggle')?.click()]
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

  const back = button('vision-player-back', 'Вернуться к библиотеке', 'chevron-down', () => {
    root.classList.remove('vision-player-expanded');
    if (root.classList.contains('showcase-wave-only')) openHome();
    updateNav();
  });
  root.appendChild(back);

  function updateNav() {
    const active = document.querySelector('#studio-navigation .showcase-nav-btn.active')?.dataset.showcase;
    const selected = root.classList.contains('showcase-wave-only') ? 'wave'
      : root.classList.contains('vision-player-expanded') ? 'home'
      : (pane.classList.contains('showcase-curated') && active === 'wave') ? 'home'
      : active;
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
