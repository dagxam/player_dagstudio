<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
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
    <link rel="stylesheet" href="modern.css?v=8">
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
            <button class="mobile-menu-btn" onclick="openMenu()" aria-label="Меню"><i class="fas fa-bars"></i></button>
            <button class="menu-btn" onclick="openMenu()" aria-label="Профиль"><i class="fas fa-user"></i></button>
        </div>
    </div>

    <!-- ЛЕВАЯ ЧАСТЬ (ПЛЕЕР) -->
    <div class="left-col">
        <div class="visual-container">
            <div class="loader-overlay" id="loader-overlay"><div class="spinner"></div></div>
            <div class="vinyl-wrapper" id="vinyl-view"><div class="vinyl-img"><img src="images/cover.png" alt="Обложка" id="cover-img"></div></div>
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
            <button class="pl-select-btn" id="btn-pl-select" onclick="openPlaylistSelect()">
                <i class="fas fa-folder-open"></i> ПЛЕЙЛИСТЫ
            </button>
            <button type="button" class="queue-toggle-btn" onclick="openPlaybackQueue()" title="Очередь воспроизведения" aria-label="Очередь воспроизведения"><i class="fas fa-list-ol"></i><span id="queue-count"></span></button>
        </div>

        <nav id="quick-mixes" class="quick-mixes" aria-label="Быстрые музыкальные подборки">
            <span class="quick-mixes-label"><i class="fas fa-bolt"></i> Подборки</span>
            <button type="button" class="quick-mix-btn" data-mix="russian" onclick="startQuickMix('russian')"><i class="fas fa-music"></i> Русская</button>
            <button type="button" class="quick-mix-btn" data-mix="caucasus" onclick="startQuickMix('caucasus')"><i class="fas fa-mountain"></i> Кавказские</button>
            <button type="button" class="quick-mix-btn" data-mix="foreign" onclick="startQuickMix('foreign')"><i class="fas fa-globe"></i> Зарубежные</button>
            <button type="button" class="quick-mix-btn" data-mix="hits" onclick="startQuickMix('hits')"><i class="fas fa-star"></i> Лучшее</button>
            <button type="button" class="quick-mix-btn" data-mix="road" onclick="startQuickMix('road')"><i class="fas fa-car-side"></i> В дорогу</button>
            <button type="button" class="quick-mix-btn" data-mix="rock" onclick="startQuickMix('rock')"><i class="fas fa-guitar"></i> Рок</button>
            <button type="button" class="quick-mix-btn" data-mix="retro" onclick="startQuickMix('retro')"><i class="fas fa-compact-disc"></i> Ретро</button>
        </nav>
        <div id="quick-mix-status" class="quick-mix-status" role="status" aria-live="polite" hidden></div>
        <div class="search-container-wrap" id="search-container-box">
            <input type="text" id="search-input" class="search-input" placeholder="Поиск музыки..." autocomplete="off">
            <div id="search-history" class="search-suggestions"></div>
        </div>
        
        <div class="active-pl-label" id="active-tab-name"></div>

        <div class="playlist-area" id="playlist-container">
            <div style="text-align:center; padding:40px; color:#444;" id="empty-msg">...</div>
        </div>
    </div>
</div>

<!-- МОДАЛЬНЫЕ ОКНА -->
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
        <a id="android-apk-download-btn" class="menu-list-btn" href="https://github.com/dagxam/player_dagstudio/releases/download/android-preview/DAGSTUDIO-PLAYER-Preview.apk" target="_blank" style="text-decoration:none;" rel="noopener noreferrer" download="DAGSTUDIO-PLAYER-Preview.apk"><i class="fab fa-android"></i> Скачать приложение для Android</a>
        <button type="button" class="menu-list-btn" onclick="openCacheDashboard()"><i class="fas fa-hard-drive"></i> Кэш и офлайн-хранилище</button>
        <button type="button" class="menu-list-btn" onclick="openPlayerDiagnostics()"><i class="fas fa-chart-line"></i> Проверка звука и сети</button>
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
<div id="track-manager-modal" class="modal-overlay"><div class="modal-box" style="padding: 30px;"><span class="modal-close" onclick="closeModal('track-manager-modal')">&times;</span><input type="text" id="tm-rename-input" class="tm-rename-input" placeholder="Название плейлиста" onblur="savePlaylistName()"><div class="tm-actions-bar"><button class="tm-act-btn" onclick="showAddLinkUI('link')"><i class="fas fa-link"></i></button><button class="tm-act-btn" onclick="triggerLocalUploadManager()"><i class="fas fa-file-audio"></i></button></div><div id="tm-add-link-area" style="display:none; margin-bottom:15px; background:rgba(255,255,255,0.05); padding:15px; border-radius:12px;"><input type="text" id="tm-link-input" class="auth-input" placeholder="Вставьте ссылку..." style="margin-bottom:10px;"><input type="text" id="tm-link-name" class="auth-input" placeholder="Название трека..." style="margin-bottom:10px;"><button class="modal-btn btn-primary" id="tm-add-confirm-btn">ДОБАВИТЬ</button></div><div id="track-manage-list" class="track-manage-list"></div></div></div>
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
            <button type="button" data-eq-preset="electro">Электро</button>
        </div>
        <div id="eq-bands" class="eq-bands"></div>
        <div class="eq-footer">
            <span><i class="fas fa-circle-info"></i> Настройки сохраняются на этом устройстве</span>
            <button type="button" class="eq-reset-btn" onclick="resetEqualizer()">Сбросить</button>
        </div>
    </div>
</div>

<div id="queue-modal" class="modal-overlay">
    <div class="modal-box utility-modal"><button type="button" class="modal-close" onclick="closeModal('queue-modal')" aria-label="Закрыть">&times;</button>
        <h3 class="modal-title">Очередь воспроизведения</h3>
        <div class="smart-radio-setting">
            <button type="button" class="menu-list-btn smart-radio-toggle" id="smart-radio-queue-btn"
                    onclick="toggleSmartRadio()" aria-pressed="true">
                <i class="fas fa-wand-magic-sparkles"></i> <span id="smart-radio-queue-label">Умное продолжение: включено</span>
            </button>
            <div class="smart-radio-hint">После последнего трека плейлиста — случайные новые песни знакомых исполнителей из сети. Ручная очередь имеет приоритет.</div>
            <div class="smart-radio-hint" id="smart-radio-next-info" aria-live="polite">Подбор начнётся ближе к концу плейлиста.</div>
        </div>
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
        <div class="utility-buttons">
            <button type="button" onclick="downloadCurrentPlaylistOffline()">Сохранить текущий плейлист</button>
            <button type="button" onclick="verifyOfflineCache()">Проверить файлы</button>
            <button type="button" onclick="openCacheDashboard()">Обновить сведения</button>
            <button type="button" onclick="clearOfflineAudioCache()">Очистить аудиокэш</button>
        </div>
    </div>
</div>

<script src="script.js?v=2260" defer></script>

</body>
</html>
