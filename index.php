<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <title>DAGSTUDIO PLAYER</title>
    <meta name="theme-color" content="#0b0b0b">
    <meta name="application-name" content="DAGSTUDIO PLAYER">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="referrer" content="no-referrer">
    <link rel="manifest" href="/manifest.json?v=2216">
    <link rel="icon" type="image/png" sizes="512x512" href="/images/faviconch.png">
    <link rel="icon" type="image/png" sizes="192x192" href="/images/icon-192.png">
    
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="apple-mobile-web-app-title" content="DAGSTUDIO">
    <link rel="apple-touch-icon" sizes="180x180" href="/images/faviconch.png">
    
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&family=Oswald:wght@400;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    
    <link rel="preload" href="style.css?v=2227" as="style">
    <link rel="stylesheet" href="style.css?v=2227">
    <link rel="stylesheet" href="modern.css?v=16">
    <link rel="stylesheet" href="studio.css?v=6">
    <link rel="stylesheet" href="studio-next.css?v=6">
</head>
<body>

<audio id="main-audio" playsinline preload="auto"></audio>

<div class="main-container">
    
    <div class="header-overlay">
        <div class="header-left">
            <div class="brand-display">DAGSTUDIO <span>PLAYER</span></div>
        </div>
        
        <div class="header-center"></div>

        <div class="header-right">
            <button class="icon-btn header-eq-btn" onclick="openEqualizer()" type="button" aria-label="Эквалайзер" title="Эквалайзер"><i class="fas fa-sliders"></i></button>
            <button id="studio-header-wave" class="studio-top-btn studio-wave-btn" type="button" onclick="openStudioWave()" title="Слушать Мою волну" aria-label="Моя волна"><i class="fas fa-wave-square" aria-hidden="true"></i><span>МОЯ ВОЛНА</span></button>
            <button id="studio-header-likes" class="studio-top-btn" type="button" onclick="openStudioLikes()" title="Мне нравится" aria-label="Мне нравится" aria-pressed="false"><i class="fas fa-heart" aria-hidden="true"></i><span>МНЕ НРАВИТСЯ</span></button>
            <button id="studio-header-offline" class="studio-top-btn studio-offline-btn" type="button" onclick="openOfflineListening()" title="Слушать сохранённые без интернета" aria-label="Офлайн-прослушивание"><i class="fas fa-cloud-arrow-down" aria-hidden="true"></i><span>ОФЛАЙН</span></button>
            <button class="pl-select-btn header-playlists-btn" id="btn-pl-select" onclick="openPlaylistSelect()" type="button" aria-label="Плейлисты" title="Плейлисты">
                <i class="fas fa-folder-open" aria-hidden="true"></i><span class="header-playlists-label">ПЛЕЙЛИСТЫ</span>
            </button>
            <button class="icon-btn header-mixes-btn" id="header-mixes-btn" onclick="openQuickMixes()" type="button" aria-label="Музыкальные подборки" aria-haspopup="dialog" aria-controls="quick-mixes-modal" aria-expanded="false" title="Подборки"><i class="fas fa-layer-group"></i></button>
            <button class="mobile-menu-btn" onclick="openMenu()" aria-label="Меню"><i class="fas fa-bars"></i></button>
            <button class="menu-btn" onclick="openMenu()" aria-label="Профиль"><i class="fas fa-user"></i></button>
        </div>
    </div>

    <!-- ЛЕВАЯ ЧАСТЬ (ПЛЕЕР) -->
    <div class="left-col">
        <div class="visual-container">
            <div class="loader-overlay" id="loader-overlay"><div class="spinner"></div></div>
            <div class="vinyl-wrapper" id="vinyl-view"><div class="vinyl-img"><img src="images/cover.png" alt="Обложка" id="cover-img"></div>
                <button type="button" class="vinyl-wave-play" id="vinyl-wave-play" onclick="openStudioWave()" aria-label="Запустить Мою волну" title="Слушать Мою волну"><i class="fas fa-play" aria-hidden="true"></i></button>
            </div>
        </div>

        <div class="track-info-display">
            <div class="np-title" id="track-title">ВЫБЕРИТЕ ТРЕК</div>
            <div class="np-artist" id="track-artist">DAGSTUDIO PLAYER</div>
            <button type="button" id="now-playing-heart" class="now-playing-heart" onclick="savePlayingTrack()" disabled
                title="Сохранить текущую песню" aria-label="Добавить текущую песню в плейлист"><i class="far fa-heart"></i></button>
        </div>
        
        <div class="progress-area" id="prog-area">
            <div class="progress-bar-wrap"><div class="progress-buffer" id="prog-buffer"></div><div class="progress-current" id="prog-current"></div></div>
            <div class="time-display"><span id="curr-time">0:00</span><span id="dur-time">0:00</span></div>
        </div>
        
        <div class="main-btns">
            <button class="c-btn" id="btn-shuffle" aria-label="Перемешать"><i class="fas fa-shuffle"></i></button>
            <button class="c-btn" id="btn-prev" aria-label="Предыдущий"><i class="fas fa-backward-step"></i></button>
            <button class="play-btn" id="btn-play" onclick="togglePlay()" aria-label="Плей/Пауза"><i class="fas fa-play"></i></button>
            <button class="c-btn" id="btn-next" aria-label="Следующий"><i class="fas fa-forward-step"></i></button>
            <button class="c-btn" id="btn-repeat" aria-label="Повтор"><i class="fas fa-repeat"></i></button>
        </div>
    </div>

    <!-- ПРАВАЯ ЧАСТЬ (СПИСКИ) -->
    <div class="right-col" id="right-col-container">
        <div class="right-col-header">
            <button class="tab-btn active" id="tab-search-btn" onclick="switchTab('search')">
                <i class="fas fa-search"></i> ПОИСК
            </button>
            <button type="button" class="queue-toggle-btn" id="smart-shuffle-btn" onclick="toggleShuffle()" title="Перемешать треки плейлиста" aria-label="Перемешать треки плейлиста"><i class="fas fa-shuffle" aria-hidden="true"></i></button>
        </div>

        <div id="ios-install-banner" class="ios-install-banner" hidden role="region" aria-label="Установка на iPhone">
            <span class="ios-banner-icon"><i class="fab fa-apple"></i></span>
            <span class="ios-banner-copy"><strong>DAGSTUDIO на iPhone</strong><small>Установи на экран «Домой»</small></span>
            <button type="button" class="ios-banner-action" onclick="showIOSInstallGuide()">Как установить</button>
            <button type="button" class="ios-banner-close" onclick="dismissIOSInstallBanner()" aria-label="Скрыть"><i class="fas fa-xmark"></i></button>
        </div>
        <div id="quick-mix-status" class="quick-mix-status" role="status" aria-live="polite" hidden></div>
        <div class="search-container-wrap" id="search-container-box">
            <input type="text" id="search-input" class="search-input" placeholder="Поиск музыки..." autocomplete="off">
            <div id="search-history" class="search-suggestions"></div>
        </div>
        
        <div class="active-pl-label" id="active-tab-name"></div>
        <div class="playlist-download-bar" id="playlist-download-bar" hidden>
            <button type="button" onclick="preparePlaylistDownload()"><i class="fas fa-download"></i> Скачать плейлист</button>
            <span id="playlist-download-state">Для офлайн-прослушивания</span>
        </div>

        <div class="playlist-area" id="playlist-container">
            <div style="text-align:center; padding:40px; color:#444;" id="empty-msg">...</div>
        </div>
    </div>
</div>

<!-- МОДАЛЬНЫЕ ОКНА -->
<div id="ios-install-modal" class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="ios-install-title" onclick="if(event.target===this)closeModal('ios-install-modal')">
  <div class="modal-box ios-install-modal-box">
    <button type="button" class="modal-close" onclick="closeModal('ios-install-modal')" aria-label="Закрыть">&times;</button>
    <div class="ios-install-heading">
      <div class="ios-install-logo"><i class="fab fa-apple"></i></div>
      <div><span class="quick-mixes-eyebrow">DAGSTUDIO PLAYER</span>
        <h3 class="modal-title" id="ios-install-title">На экран iPhone</h3>
        <p>Как приложение — без IPA и без App Store.</p></div>
    </div>
    <p id="ios-install-other-browser" class="ios-install-other-browser" hidden>Для простого и надёжного способа открой pl.dagstudio.ru в Safari на iPhone.</p>
    <div class="ios-install-steps">
      <div class="ios-install-step"><b>1</b><span><strong>Открой pl.dagstudio.ru в Safari</strong><small>На своём iPhone или iPad.</small></span></div>
      <div class="ios-install-step"><b>2</b><span><strong>Нажми «Поделиться» <i class="fas fa-arrow-up-from-bracket"></i></strong><small>Квадрат со стрелкой в панели Safari.</small></span></div>
      <div class="ios-install-step"><b>3</b><span><strong>Выбери «На экран Домой»</strong><small>При необходимости прокрути список. Затем «Добавить».</small></span></div>
    </div>
    <p class="ios-install-disclaimer"><i class="fas fa-circle-info"></i> С иконки плеер запускается без обычной панели Safari. Фоновая работа и кэш ограничиваются возможностями iOS.</p>
    <button type="button" class="modal-btn btn-primary" onclick="closeModal('ios-install-modal')">ПОНЯТНО</button>
  </div>
</div>
<!-- Подборки собраны в одну кнопку около эквалайзера: без длинной полосы над поиском. -->
<div id="caucasus-radio-modal" class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="caucasus-radio-title" onclick="if(event.target===this)closeModal('caucasus-radio-modal')">
    <div class="modal-box quick-mixes-modal-box caucasus-radio-box">
        <button type="button" class="modal-close" onclick="closeModal('caucasus-radio-modal')" aria-label="Закрыть">&times;</button>
        <div class="quick-mixes-heading">
            <div class="quick-mixes-logo"><i class="fas fa-mountain"></i></div>
            <div><span class="quick-mixes-eyebrow">DAGSTUDIO RADIO</span>
                <h3 class="modal-title" id="caucasus-radio-title">Кавказское радио</h3>
                <p class="quick-mixes-intro">Выбери республику или язык поиска</p></div>
        </div>
        <div id="caucasus-regions" class="caucasus-radio-grid"></div>
        <p class="quick-mixes-footer">Язык песен не определяется автоматически: разделы задают направление поиска.</p>
    </div>
</div>
<div id="quick-mixes-modal" class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="quick-mixes-title" onclick="if(event.target===this)closeModal('quick-mixes-modal')">
    <div class="modal-box quick-mixes-modal-box">
        <button type="button" class="modal-close" onclick="closeModal('quick-mixes-modal')" aria-label="Закрыть подборки">&times;</button>
        <div class="quick-mixes-heading">
            <div class="quick-mixes-logo" aria-hidden="true"><i class="fas fa-layer-group"></i></div>
            <div>
                <div class="quick-mixes-eyebrow">DAGSTUDIO RADIO</div>
                <h3 class="modal-title" id="quick-mixes-title">ПОДБОРКИ</h3>
                <p class="quick-mixes-intro">Выбери настроение — музыка включится автоматически.</p>
            </div>
        </div>
        <div class="quick-mixes-grid" id="quick-mixes">
            <button type="button" class="quick-mix-btn wave-mix-btn" data-mix="wave" onclick="startQuickMix('wave')">
                <span class="mix-icon"><i class="fas fa-wave-square"></i></span><span class="mix-copy"><strong>Моя волна</strong><small>На основе твоих прослушиваний</small></span><i class="fas fa-chevron-right mix-arrow"></i></button>
            <button type="button" class="quick-mix-btn" data-mix="russian" onclick="startQuickMix('russian')">
                <span class="mix-icon" aria-hidden="true"><i class="fas fa-music"></i></span><span class="mix-copy"><strong>Русские</strong><small>Хиты и новинки</small></span><i class="fas fa-chevron-right mix-arrow" aria-hidden="true"></i></button>
            <button type="button" class="quick-mix-btn" data-mix="caucasus" onclick="openCaucasusRadio()">
                <span class="mix-icon" aria-hidden="true"><i class="fas fa-mountain"></i></span><span class="mix-copy"><strong>Кавказские</strong><small>Дагестан и республики Кавказа</small></span><i class="fas fa-chevron-right mix-arrow" aria-hidden="true"></i></button>
            <button type="button" class="quick-mix-btn" data-mix="foreign" onclick="startQuickMix('foreign')">
                <span class="mix-icon" aria-hidden="true"><i class="fas fa-globe"></i></span><span class="mix-copy"><strong>Зарубежные</strong><small>Мировые хиты</small></span><i class="fas fa-chevron-right mix-arrow" aria-hidden="true"></i></button>
            <button type="button" class="quick-mix-btn" data-mix="hits" onclick="startQuickMix('hits')">
                <span class="mix-icon" aria-hidden="true"><i class="fas fa-star"></i></span><span class="mix-copy"><strong>Лучшее</strong><small>Популярное сейчас</small></span><i class="fas fa-chevron-right mix-arrow" aria-hidden="true"></i></button>
            <button type="button" class="quick-mix-btn" data-mix="road" onclick="startQuickMix('road')">
                <span class="mix-icon" aria-hidden="true"><i class="fas fa-car-side"></i></span><span class="mix-copy"><strong>В дорогу</strong><small>Для поездок</small></span><i class="fas fa-chevron-right mix-arrow" aria-hidden="true"></i></button>
            <button type="button" class="quick-mix-btn" data-mix="rock" onclick="startQuickMix('rock')">
                <span class="mix-icon" aria-hidden="true"><i class="fas fa-guitar"></i></span><span class="mix-copy"><strong>Рок</strong><small>Гитары и драйв</small></span><i class="fas fa-chevron-right mix-arrow" aria-hidden="true"></i></button>
            <button type="button" class="quick-mix-btn" data-mix="retro" onclick="startQuickMix('retro')">
                <span class="mix-icon" aria-hidden="true"><i class="fas fa-compact-disc"></i></span><span class="mix-copy"><strong>Ретро</strong><small>Знакомая классика</small></span><i class="fas fa-chevron-right mix-arrow" aria-hidden="true"></i></button>
        </div>
        <div class="quick-mixes-footer"><i class="fas fa-headphones" aria-hidden="true"></i> Поиск по всем подключённым музыкальным источникам. Если один сервер недоступен, используются результаты остальных. Подборки не подтверждают язык исполнения автоматически.</div>
    </div>
</div>

<div id="alert-modal" class="modal-overlay"><div class="modal-box"><span class="modal-close" onclick="closeModal('alert-modal')">&times;</span><h3 class="modal-title">УВЕДОМЛЕНИЕ</h3><p style="color:#ccc; margin-bottom:30px; font-size:1.1rem; line-height:1.5;" id="alert-msg">Сообщение</p><button class="modal-btn btn-primary" onclick="closeModal('alert-modal')">OK</button></div></div>
<div id="confirm-modal" class="modal-overlay"><div class="modal-box"><span class="modal-close" onclick="closeModal('confirm-modal')">&times;</span><h3 class="modal-title">ПОДТВЕРЖДЕНИЕ</h3><p style="color:#ccc; margin-bottom:30px; font-size:1.1rem;" id="confirm-msg">Вы уверены?</p><div style="display:flex; gap:15px;"><button class="modal-btn btn-danger" onclick="closeModal('confirm-modal')">НЕТ</button><button class="modal-btn btn-primary" id="confirm-btn-yes">ДА</button></div></div></div>

<div id="menu-modal" class="modal-overlay">
    <div class="modal-box menu-modal-box">
        <span class="modal-close" onclick="closeModal('menu-modal')" aria-label="Закрыть меню">&times;</span>
        <div class="menu-modal-heading"><i class="fas fa-sliders"></i> МЕНЮ DAGSTUDIO PLAYER</div>
        <div class="menu-layout">
            <section class="menu-account-column" aria-label="Профиль"><div class="menu-column-label">Профиль и плейлисты</div>
                <div id="auth-section">
            <h3 class="modal-title" id="auth-title">ВХОД</h3>
            <div class="auth-form">
                <div class="auth-group"><input type="text" id="auth-name" class="auth-input" placeholder="Ваш логин"><i class="fas fa-user auth-icon"></i></div>
                <div class="auth-group"><input type="password" id="auth-pass" class="auth-input" placeholder="Ваш пароль"><i class="fas fa-lock auth-icon"></i></div>
                <button id="auth-submit-btn" class="modal-btn btn-primary" onclick="handleAuth()">ВОЙТИ</button>
                <div class="auth-toggle" onclick="toggleAuthMode()">Нет аккаунта? Зарегистрироваться</div>
            </div>
        </div>
        
        <div id="user-section" style="display:none;">
            <div class="user-card"><div class="user-avatar"><i class="fas fa-user"></i></div><div class="user-details"><div class="user-name" id="user-name-disp">USER</div><div class="user-status">DAGSTUDIO MEMBER</div></div></div>
            <button class="menu-list-btn" onclick="openManagePlaylists()"><i class="fas fa-list"></i> Управление плейлистами</button>
            <button id="playlist-sync-btn" class="menu-list-btn" onclick="manualSyncPlaylists()" type="button"><i class="fas fa-arrows-rotate"></i><span>Синхронизировать плейлисты</span></button>
            <div id="playlist-sync-status" class="playlist-sync-status" role="status" aria-live="polite">Плейлисты сохранены на устройстве</div>
            <div class="theme-selector-wrapper">
                <div class="theme-lbl">ЦВЕТ ТЕМЫ:</div>
                <div class="theme-options">
                    <button class="theme-dot" style="background:#C06C42;" onclick="setTheme('brown')"></button>
                    <button class="theme-dot" style="background:#D32F2F;" onclick="setTheme('red')"></button>
                    <button class="theme-dot" style="background:#2E7D32;" onclick="setTheme('green')"></button>
                    <button class="theme-dot" style="background:#1976D2;" onclick="setTheme('blue')"></button>
                    <button class="theme-dot" style="background:#8b00ff;" onclick="setTheme('purple')"></button>
                </div>
            </div>
            <button class="modal-btn btn-dark" onclick="handleLogout()" style="margin-top:25px;">ВЫЙТИ ИЗ АККАУНТА</button>
        </div>
            </section>
            <section class="menu-action-column" aria-label="Приложение"><div class="menu-column-label">Приложение</div>
                <button id="app-update-btn" class="menu-list-btn app-update-btn app-update-btn-top" onclick="manualUpdateApplication()" type="button">
            <i class="fas fa-rotate"></i>
            <span>Обновить приложение</span>
        </button>
        <button type="button" id="ios-install-guide-btn" class="menu-list-btn" onclick="showIOSInstallGuide()" hidden><i class="fab fa-apple"></i> Установить на iPhone</button>
        <a id="android-apk-download-btn" class="menu-list-btn" href="https://github.com/dagxam/player_dagstudio/releases/download/android-preview/DAGSTUDIO-PLAYER-Preview.apk" target="_blank" style="text-decoration:none;" rel="noopener noreferrer" download="DAGSTUDIO-PLAYER-Preview.apk"><i class="fab fa-android"></i> Скачать приложение для Android</a>
        <button type="button" class="menu-list-btn" onclick="openCacheDashboard()"><i class="fas fa-hard-drive"></i> Кэш и офлайн-хранилище</button>
        <button type="button" class="menu-list-btn" onclick="openPlayerDiagnostics()"><i class="fas fa-chart-line"></i> Проверка звука и сети</button>
        <button type="button" class="menu-list-btn" id="queue-menu-btn" onclick="openPlaybackQueue()"><i class="fas fa-list-ol"></i> Очередь воспроизведения <span id="queue-count"></span></button>
        <button type="button" class="menu-list-btn" onclick="dislikeCurrentTrack()"><i class="fas fa-thumbs-down"></i> Не нравится текущая песня</button>
        <button type="button" class="menu-list-btn" onclick="tasteReset()"><i class="fas fa-eraser"></i> Сбросить музыкальные предпочтения</button>
        <button type="button" class="menu-list-btn smart-radio-toggle" id="smart-radio-menu-btn"
                onclick="toggleSmartRadio()" aria-pressed="true" title="Автоматически подбирать похожие песни после плейлиста">
            <i class="fas fa-wand-magic-sparkles"></i> <span id="smart-radio-menu-label">Умное продолжение: включено</span>
        </button>
        <button type="button" class="menu-list-btn" onclick="openSleepTimer()"><i class="fas fa-moon"></i> Таймер сна</button>
        <div id="device-cache-status" class="playlist-sync-status" role="status" aria-live="polite">Кэш сохраняется отдельно на каждом устройстве.</div>
        <div class="app-version-footer" id="app-version-footer">
            <div class="app-version-main"><i class="fas fa-code-branch"></i> <span id="app-version-text">Версия: определяем…</span></div>
            <div class="app-version-extra" id="app-version-extra"></div>
        </div>
            </section>
        </div>
    </div>
</div>

<div id="manage-pl-modal" class="modal-overlay"><div class="modal-box"><span class="modal-close" onclick="closeModal('manage-pl-modal')">&times;</span><h3 class="modal-title">ПЛЕЙЛИСТЫ</h3><div id="manage-pl-list" class="playlist-list"></div><button class="modal-btn btn-primary" onclick="openNewPlModal()">+ СОЗДАТЬ ПЛЕЙЛИСТ</button></div></div>
<div id="track-manager-modal" class="modal-overlay"><div class="modal-box" style="padding: 30px;"><span class="modal-close" onclick="closeModal('track-manager-modal')">&times;</span><input type="text" id="tm-rename-input" class="tm-rename-input" placeholder="Название плейлиста" onblur="savePlaylistName()">
    <div class="playlist-icon-editor" aria-label="Оформление плейлиста">
        <div class="playlist-icon-editor-head">
            <span class="playlist-icon-editor-preview"><i id="tm-playlist-icon-preview" class="fas fa-music" aria-hidden="true"></i></span>
            <span><strong>Иконка плейлиста</strong><small>Выберите символ — он появится в левом меню и сохранится в вашем аккаунте</small></span>
        </div>
        <div id="tm-playlist-icons" class="playlist-icon-grid" role="group" aria-label="Иконки плейлиста"></div>
    </div>

    <label class="studio-likes-exclusion" for="tm-exclude-likes">
        <input type="checkbox" id="tm-exclude-likes" onchange="setPlaylistExcludedFromLikes(editingPlaylistId,this.checked)">
        <span><strong>Исключить из «Мне нравится»</strong><small>Треки останутся в плейлисте, но не появятся в общей подборке любимых песен. Выбор сохраняется на этом устройстве.</small></span>
    </label><div class="tm-actions-bar"><button class="tm-act-btn" onclick="showAddLinkUI('link')"><i class="fas fa-link"></i></button><button class="tm-act-btn" onclick="triggerLocalUploadManager()"><i class="fas fa-file-audio"></i></button></div><div id="tm-add-link-area" style="display:none; margin-bottom:15px; background:rgba(255,255,255,0.05); padding:15px; border-radius:12px;"><input type="text" id="tm-link-input" class="auth-input" placeholder="Вставьте ссылку..." style="margin-bottom:10px;"><input type="text" id="tm-link-name" class="auth-input" placeholder="Название трека..." style="margin-bottom:10px;"><button class="modal-btn btn-primary" id="tm-add-confirm-btn">ДОБАВИТЬ</button></div><div id="track-manage-list" class="track-manage-list"></div></div></div>
<div id="save-modal" class="modal-overlay"><div class="modal-box"><span class="modal-close" onclick="closeModal('save-modal')">&times;</span><h3 class="modal-title">ВЫБРАТЬ ПЛЕЙЛИСТ</h3><div id="playlist-select-list" class="playlist-list"></div></div></div>
<div id="input-modal" class="modal-overlay"><div class="modal-box" style="padding-top: 30px;"><span class="modal-close" onclick="closeModal('input-modal')">&times;</span><h3 class="modal-title" style="margin-bottom: 20px;">НОВЫЙ ПЛЕЙЛИСТ</h3><input type="text" id="new-tab-name" class="auth-input" placeholder="Введите название..." style="margin-bottom: 25px; text-align:center; font-weight:bold;"><button class="modal-btn btn-dark" onclick="submitCreateTab()" style="padding: 12px; font-size: 0.9rem;">СОЗДАТЬ ПЛЕЙЛИСТ</button></div></div>

<input type="file" id="local-file-input" multiple accept="audio/*" style="display:none;" onchange="handleLocalFileSelect(this)">
<div id="equalizer-modal" class="modal-overlay">
    <div class="modal-box equalizer-modal-box">
        <span class="modal-close" onclick="closeModal('equalizer-modal')">&times;</span>
        <div class="eq-head">
            <div>
                <div class="eq-kicker">DAGSTUDIO SOUND</div>
                <h3 class="modal-title eq-title">ЭКВАЛАЙЗЕР</h3>
            </div>
            <button id="eq-power-btn" class="eq-power-btn" type="button" onclick="toggleEqualizerPower()" aria-pressed="true">
                <i class="fas fa-power-off"></i>
            </button>
        </div>
        <div class="eq-subtitle">Настройте звук под музыку и акустику устройства</div>
        <div id="eq-presets" class="eq-presets">
            <button type="button" data-eq-preset="flat">Ровный</button>
            <button type="button" data-eq-preset="bass">Бас</button>
            <button type="button" data-eq-preset="vocal">Вокал</button>
            <button type="button" data-eq-preset="rock">Рок</button>
            <button type="button" data-eq-preset="car">В автомобиле</button>
            <button type="button" data-eq-preset="electro">Электро</button>
        </div>
        <div id="eq-bands" class="eq-bands"></div>
        <label class="offline-economy eq-level-setting"><input id="eq-level-switch" type="checkbox" onchange="toggleSoftLeveling(this.checked)"> Мягкое выравнивание громкости</label>
        <p id="eq-level-note" class="eq-level-note">Ограничение пиков звука в браузере.</p>
        <div class="eq-footer">
            <span><i class="fas fa-circle-info"></i> Настройки сохраняются на этом устройстве</span>
            <button type="button" class="eq-reset-btn" onclick="resetEqualizer()">Сбросить</button>
        </div>
    </div>
</div>


<div id="queue-modal" class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="queue-modal-title">
    <div class="modal-box utility-modal studio-queue-dialog">
        <button type="button" class="modal-close" onclick="closeModal('queue-modal')" aria-label="Закрыть очередь">&times;</button>
        <h3 class="modal-title" id="queue-modal-title"><i class="fas fa-list-ol"></i> Очередь воспроизведения</h3>
        <p class="studio-queue-hint">Здесь можно изменить порядок добавленных в очередь песен. Перемешивание треков выполняется отдельной кнопкой над списком.</p>
        <div id="queue-list" class="queue-list"></div>
        <button class="modal-btn btn-dark" type="button" onclick="clearPlaybackQueue()">Очистить очередь</button>
    </div>
</div>
<div id="sleep-modal" class="modal-overlay">
    <div class="modal-box utility-modal"><button type="button" class="modal-close" onclick="closeModal('sleep-modal')" aria-label="Закрыть">&times;</button>
        <h3 class="modal-title">Таймер сна</h3><p id="sleep-timer-state" class="utility-info">Выключен</p>
        <div class="utility-buttons">
            <button type="button" onclick="setSleepTimer(15)">15 минут</button>
            <button type="button" onclick="setSleepTimer(30)">30 минут</button>
            <button type="button" onclick="setSleepTimer(60)">60 минут</button>
            <button type="button" onclick="setSleepTimer('end')">После этой песни</button>
            <button type="button" onclick="setSleepTimer(0)">Отключить таймер</button>
        </div>
    </div>
</div>
<div id="diagnostics-modal" class="modal-overlay">
    <div class="modal-box utility-modal"><button type="button" class="modal-close" onclick="closeModal('diagnostics-modal')" aria-label="Закрыть">&times;</button>
        <h3 class="modal-title">Состояние плеера</h3><pre id="diagnostics-info" class="diagnostics-info"></pre>
        <div class="utility-buttons">
            <button type="button" onclick="refreshPlayerDiagnostics()">Обновить данные</button>
            <button type="button" onclick="retryCurrentTrackManually()">Переподключить трек</button>
            <button id="source-health-test" type="button" onclick="testMusicSourceHealth()">Проверить источники</button>
            <button type="button" onclick="copyPlayerDiagnostics()">Копировать отчёт</button>
        </div>
        <pre id="source-health-info" class="diagnostics-info"></pre>
    </div>
</div>
<div id="cache-dashboard-modal" class="modal-overlay">
    <div class="modal-box utility-modal"><button type="button" class="modal-close" onclick="closeModal('cache-dashboard-modal')" aria-label="Закрыть">&times;</button>
        <h3 class="modal-title">Кэш устройства</h3><p class="utility-info" id="cache-dashboard-info">Проверяем…</p>
        <p class="utility-info" id="cache-progress-info">Фоновое скачивание не выполняется</p>
        <p class="utility-info" id="cache-verify-info"></p>
        <div class="offline-settings">
            <label for="cache-limit-select">Лимит кэша (на Android)</label>
            <select id="cache-limit-select" onchange="changeOfflineLimit(this.value)">
                <option value="256">256 МБ</option><option value="512" selected>512 МБ</option>
                <option value="1024">1024 МБ</option>
            </select>
            <label class="offline-economy"><input type="checkbox" id="traffic-saver-switch" onchange="toggleTrafficSaver(this.checked)"> Экономить мобильный трафик</label>
            <p>Режим экономии сокращает фоновые запросы. Битрейт зависит от музыкального источника.</p>
        </div>
        <div class="utility-buttons">
            <button type="button" onclick="downloadCurrentPlaylistOffline()">Сохранить текущий плейлист</button>
            <button type="button" onclick="verifyOfflineCache()">Проверить файлы</button>
            <button type="button" onclick="openCacheDashboard()">Обновить сведения</button>
            <button type="button" onclick="clearOfflineAudioCache()">Очистить аудиокэш</button>
        </div>
    </div>
</div>

<script src="script.js?v=2288" defer></script>
<script src="studio.js?v=4" defer></script>
<script src="studio-next.js?v=5" defer></script>

</body>
</html>
