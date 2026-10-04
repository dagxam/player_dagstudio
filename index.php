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
    
    <link rel="preload" href="style.css?v=2217" as="style">
    <link rel="stylesheet" href="style.css?v=2217">
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
            <button class="icon-btn" onclick="toggleFullScreen()" aria-label="Полный экран" title="На весь экран"><i class="fas fa-expand"></i></button>
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
        </div>

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
    <div class="modal-box">
        <span class="modal-close" onclick="closeModal('menu-modal')">&times;</span>
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
            <div class="user-card"><div class="user-avatar"><i class="fas fa-user"></i></div><div class="user-details"><div class="user-name" id="user-name-disp">USER</div></div></div>
            <button class="menu-list-btn" onclick="openManagePlaylists()"><i class="fas fa-list"></i> Управление плейлистами</button>
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
        <button id="pwa-install-btn" class="menu-list-btn pwa-install-btn" onclick="triggerInstall()" style="margin-top:18px;" aria-live="polite"><i class="fas fa-mobile-screen-button"></i> Установить приложение</button>
    </div>
</div>

<div id="manage-pl-modal" class="modal-overlay"><div class="modal-box"><span class="modal-close" onclick="closeModal('manage-pl-modal')">&times;</span><h3 class="modal-title">ПЛЕЙЛИСТЫ</h3><div id="manage-pl-list" class="playlist-list"></div><button class="modal-btn btn-primary" onclick="openNewPlModal()">+ СОЗДАТЬ ПЛЕЙЛИСТ</button></div></div>
<div id="track-manager-modal" class="modal-overlay"><div class="modal-box" style="padding: 30px;"><span class="modal-close" onclick="closeModal('track-manager-modal')">&times;</span><input type="text" id="tm-rename-input" class="tm-rename-input" placeholder="Название плейлиста" onblur="savePlaylistName()"><div class="tm-actions-bar"><button class="tm-act-btn" onclick="showAddLinkUI('link')"><i class="fas fa-link"></i></button><button class="tm-act-btn" onclick="triggerLocalUploadManager()"><i class="fas fa-file-audio"></i></button></div><div id="tm-add-link-area" style="display:none; margin-bottom:15px; background:rgba(255,255,255,0.05); padding:15px; border-radius:12px;"><input type="text" id="tm-link-input" class="auth-input" placeholder="Вставьте ссылку..." style="margin-bottom:10px;"><input type="text" id="tm-link-name" class="auth-input" placeholder="Название трека..." style="margin-bottom:10px;"><button class="modal-btn btn-primary" id="tm-add-confirm-btn">ДОБАВИТЬ</button></div><div id="track-manage-list" class="track-manage-list"></div></div></div>
<div id="save-modal" class="modal-overlay"><div class="modal-box"><span class="modal-close" onclick="closeModal('save-modal')">&times;</span><h3 class="modal-title">ВЫБРАТЬ ПЛЕЙЛИСТ</h3><div id="playlist-select-list" class="playlist-list"></div></div></div>
<div id="input-modal" class="modal-overlay"><div class="modal-box" style="padding-top: 30px;"><span class="modal-close" onclick="closeModal('input-modal')">&times;</span><h3 class="modal-title" style="margin-bottom: 20px;">НОВЫЙ ПЛЕЙЛИСТ</h3><input type="text" id="new-tab-name" class="auth-input" placeholder="Введите название..." style="margin-bottom: 25px; text-align:center; font-weight:bold;"><button class="modal-btn btn-dark" onclick="submitCreateTab()" style="padding: 12px; font-size: 0.9rem;">СОЗДАТЬ ПЛЕЙЛИСТ</button></div></div>

<input type="file" id="local-file-input" multiple accept="audio/*" style="display:none;" onchange="handleLocalFileSelect(this)">
<div id="ios-modal" class="modal-overlay">
    <div class="modal-box">
        <span class="modal-close" onclick="closeModal('ios-modal')">&times;</span>
        <h3 class="modal-title">УСТАНОВКА НА IPHONE / IPAD</h3>
        <p style="color:#ccc; margin:10px 0 20px; line-height:1.6; text-align:left;">
            Нажмите <b>«Поделиться»</b> <i class="fas fa-arrow-up-from-bracket"></i> и выберите <b>«На экран Домой»</b>.<br><br>
            На старых версиях iOS/iPadOS, где этот пункт недоступен в стороннем браузере, откройте сайт в <b>Safari</b>.
        </p>
        <button class="modal-btn btn-primary" onclick="closeModal('ios-modal')">ПОНЯТНО</button>
    </div>
</div>
<div id="android-modal" class="modal-overlay">
    <div class="modal-box">
        <span class="modal-close" onclick="closeModal('android-modal')">&times;</span>
        <h3 class="modal-title">УСТАНОВКА ПРИЛОЖЕНИЯ</h3>
        <div id="install-help-text" style="color:#ccc; margin:10px 0 20px; line-height:1.65; font-size:1rem; text-align:left;"></div>
        <button class="modal-btn btn-primary" onclick="closeModal('android-modal')">ПОНЯТНО</button>
    </div>
</div>

<script src="script.js?v=2216" defer></script>

</body>
</html>
