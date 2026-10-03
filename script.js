// script.js - V2208 (universal Android streaming resilience)

let serviceWorkerRegistrationPromise = Promise.resolve(null);
if ('serviceWorker' in navigator) {
    serviceWorkerRegistrationPromise = navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then(registration => {
            registration.update().catch(() => {});
            return registration;
        })
        .catch(error => {
            console.warn('Service Worker registration failed:', error);
            return null;
        });
}

// --- GLOBAL VARIABLES ---
let currentUser = null; 
let isRegMode = false; 
let playlists = []; 
let playlist = []; 
let searchPlaylistCache = []; 
let currentIndex = -1; 
let currentTab = 'search';
let searchTimeout; 
let selectedTrackForSave = null;
let activePlIdForUpload = null;
let wakeLock = null;
let editingPlaylistId = null;

let currentSearchQuery = '';
let currentSearchPage = 1;
let isSearchLoading = false;
let hasMoreSearchResults = true;

let isShuffle = false;
let isRepeat = false;

// ПРЕДОТВРАЩЕНИЕ УТЕЧЕК ПАМЯТИ
let currentBlobUrl = null; 
let playWatchdog = null; 
window.skipCounter = 0; // Для предотвращения бесконечного скипа

const SEARCH_HISTORY_KEY = 'dag_search_history';

const colorThemes = {
    brown: { main: '#C06C42', dark: '#8a4b2c', rgb: '192, 108, 66', img: 'images/cover.png' }, 
    red:   { main: '#D32F2F', dark: '#B71C1C', rgb: '211, 47, 47', img: 'images/r.png' },
    green: { main: '#2E7D32', dark: '#1B5E20', rgb: '46, 125, 50', img: 'images/z.png' },
    blue:  { main: '#1976D2', dark: '#0D47A1', rgb: '25, 118, 210', img: 'images/s.png' },
    purple: { main: '#8b00ff', dark: '#4a0082', rgb: '139, 0, 255', img: 'images/f.png' }
};

const mainAudio = document.getElementById('main-audio');
if (mainAudio) { mainAudio.preload = 'auto'; }
const connectionInfo = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

function getNetworkProfile() {
    const info = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const effectiveType = info && info.effectiveType ? String(info.effectiveType) : '';
    const downlink = info && Number(info.downlink) > 0 ? Number(info.downlink) : 0;
    const rtt = info && Number(info.rtt) > 0 ? Number(info.rtt) : 0;
    const saveData = !!(info && info.saveData);
    const offline = navigator.onLine === false;
    const weak = offline || saveData || effectiveType === 'slow-2g' || effectiveType === '2g' ||
        (downlink > 0 && downlink < 1.5) || (rtt > 0 && rtt >= 700);
    const veryWeak = offline || effectiveType === 'slow-2g' ||
        (downlink > 0 && downlink < 0.55) || (rtt > 0 && rtt >= 1400);
    return { effectiveType, downlink, rtt, saveData, offline, weak, veryWeak };
}

function isWeakConnection() {
    return getNetworkProfile().weak;
}

function buildProxyUrl(trackOrUrl, options = {}) {
    const track = typeof trackOrUrl === 'string' ? { url: trackOrUrl } : (trackOrUrl || {});
    if (!track.url) return '';
    const params = new URLSearchParams();
    params.set('url', track.url);
    if (track.source) {
        params.set('source', String(track.source).replace(/[^A-Za-z0-9_\[\]]/g, ''));
    }
    if (options.weak || isWeakConnection()) params.set('weak', '1');
    if (options.norange) params.set('norange', '1');
    if (options.retry) params.set('retry', String(options.retry));
    return 'proxy.php?' + params.toString();
}
const titleEl = document.getElementById('track-title'); 
const artistEl = document.getElementById('track-artist'); 
const listEl = document.getElementById('playlist-container');
const progCurrent = document.getElementById('prog-current'); 
const progBuffer = document.getElementById('prog-buffer'); 
const currTimeEl = document.getElementById('curr-time'); 
const durTimeEl = document.getElementById('dur-time');

// --- УМНОЕ ЦЕЛЕВОЕ КЭШИРОВАНИЕ ---
async function cacheTrackSilently(url) {
    if (!url || !url.startsWith('http') || !navigator.onLine || !('caches' in window)) return;

    // На слабом интернете фоновое скачивание удваивает трафик и мешает
    // текущему воспроизведению. Кэшируем только когда сеть нормальная
    // и аудиопоток прямо сейчас не играет.
    const net = getNetworkProfile();
    if (net.weak || net.saveData || (mainAudio && !mainAudio.paused)) return;

    try {
        const proxyUrl = buildProxyUrl(url);
        const cache = await caches.open('dag-audio-cache');
        const match = await cache.match(proxyUrl);
        if (!match) {
            const res = await fetch(proxyUrl, { cache: 'no-store' });
            if (res.ok) await cache.put(proxyUrl, res.clone());
        }
    } catch (e) {}
}

async function getDeviceCachedAudio(url) {
    if (!url || !url.startsWith('http')) return { url: url, isBlob: false, inCache: false };

    if ('caches' in window) {
        try {
            const cache = await caches.open('dag-audio-cache');
            const normalProxy = buildProxyUrl(url);
            const weakProxy = buildProxyUrl(url, { weak: true });
            const res = (await cache.match(normalProxy)) || (await cache.match(weakProxy));
            if (res) {
                const blob = await res.blob();
                return { url: URL.createObjectURL(blob), isBlob: true, inCache: true };
            }
        } catch(e) {}
    }

    return { url: buildProxyUrl(url, { weak: isWeakConnection() }), isBlob: false, inCache: false };
}

// --- ПОЛНОЭКРАННЫЙ РЕЖИМ (ПО КНОПКЕ) ---
window.toggleFullScreen = function() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            showNotification(`Функция заблокирована устройством`);
        });
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
};

document.addEventListener('fullscreenchange', () => {
    const btnIcon = document.querySelector('button[onclick="toggleFullScreen()"] i');
    if (btnIcon) {
        if (document.fullscreenElement) {
            btnIcon.classList.remove('fa-expand');
            btnIcon.classList.add('fa-compress');
        } else {
            btnIcon.classList.remove('fa-compress');
            btnIcon.classList.add('fa-expand');
        }
    }
});

window.downloadTrack = function(index) {
    const track = playlist[index];
    if (!track || !track.url) return;
    const safeTitle = `${track.artist} - ${track.title}`;
    showNotification(`Начинаем скачивание: ${safeTitle}`);
    const downloadUrl = `download.php?url=${encodeURIComponent(track.url)}&title=${encodeURIComponent(safeTitle)}`;
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.setAttribute('download', safeTitle + '.mp3'); 
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
};

// --- УСТАНОВКА ПРИЛОЖЕНИЯ (PWA) ---
// На Chromium-классах браузеров кнопка установки показывается только после
// beforeinstallprompt. Поэтому нажатие всегда сразу открывает НАТИВНОЕ окно
// браузера «Установить / Отмена» без промежуточных окон приложения.
let defPrompt = null;
let appInstalledThisSession = false;

const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
              (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = /Android/i.test(navigator.userAgent);

function isAppStandalone() {
    return appInstalledThisSession ||
        window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: fullscreen)').matches ||
        window.navigator.standalone === true ||
        document.referrer.indexOf('android-app://') === 0;
}

function getBrowserInfo() {
    const ua = navigator.userAgent || '';
    return {
        androidWebView: isAndroid && (/\bwv\b/i.test(ua) || /; wv\)/i.test(ua) ||
            (/Version\/4\.0/i.test(ua) && /Chrome\//i.test(ua))),
        samsung: /SamsungBrowser/i.test(ua),
        yandex: /YaBrowser/i.test(ua),
        edge: /EdgA|EdgiOS|Edg\//i.test(ua),
        firefox: /Firefox|FxiOS/i.test(ua),
        chrome: /Chrome|CriOS/i.test(ua) && !/EdgA|EdgiOS|Edg\/|OPR|Opera|YaBrowser|SamsungBrowser/i.test(ua),
        safari: /Safari/i.test(ua) && !/Chrome|CriOS|Edg|OPR|Opera|YaBrowser|SamsungBrowser|Firefox|FxiOS/i.test(ua),
        mac: /Macintosh|Mac OS X/i.test(ua) && !isIOS,
        windows: /Windows/i.test(ua),
        linux: /Linux/i.test(ua) && !isAndroid
    };
}

function getInstallButton() {
    return document.getElementById('pwa-install-btn');
}

function setInstallButtonState() {
    const btn = getInstallButton();
    if (!btn) return;

    // Единственное условие скрытия кнопки — приложение уже реально запущено
    // как установленное PWA. Пока не установлено, кнопка всегда видна.
    if (isAppStandalone()) {
        btn.style.display = 'none';
        btn.disabled = true;
        btn.dataset.installMode = 'installed';
        return;
    }

    const info = getBrowserInfo();
    btn.style.display = '';
    btn.disabled = false;
    btn.style.opacity = '1';

    if (defPrompt) {
        btn.innerHTML = '<i class="fas fa-mobile-screen-button"></i> Установить приложение';
        btn.dataset.installMode = 'native';
    } else if (isIOS) {
        btn.innerHTML = '<i class="fas fa-square-plus"></i> Добавить на экран Домой';
        btn.dataset.installMode = 'ios';
    } else if (info.safari && info.mac) {
        btn.innerHTML = '<i class="fas fa-square-plus"></i> Добавить в Dock';
        btn.dataset.installMode = 'safari-mac';
    } else {
        btn.innerHTML = '<i class="fas fa-mobile-screen-button"></i> Установить приложение';
        btn.dataset.installMode = 'waiting-native';
    }
}

function showUnsupportedInstallHelp(mode) {
    if (mode === 'ios') {
        const iosModal = document.getElementById('ios-modal');
        if (iosModal) iosModal.classList.add('show');
        return;
    }

    const help = document.getElementById('install-help-text');
    const modal = document.getElementById('android-modal');
    if (!help || !modal) return;

    if (mode === 'safari-mac') {
        help.innerHTML = 'В Safari откройте верхнее меню <b>Файл</b> и выберите <b>«Добавить в Dock»</b>.';
    } else {
        help.innerHTML = 'Этот браузер не предоставляет сайту системное окно установки. Откройте сайт в Chrome, Edge, Яндекс Браузере или Samsung Internet.';
    }
    modal.classList.add('show');
}

window.addEventListener('beforeinstallprompt', function(event) {
    event.preventDefault();
    defPrompt = event;
    setInstallButtonState();
});

window.addEventListener('appinstalled', function() {
    appInstalledThisSession = true;
    defPrompt = null;
    setInstallButtonState();
    showNotification('Приложение установлено.');
});

const standaloneMedia = window.matchMedia('(display-mode: standalone)');
if (standaloneMedia && typeof standaloneMedia.addEventListener === 'function') {
    standaloneMedia.addEventListener('change', setInstallButtonState);
}

window.triggerInstall = function() {
    const btn = getInstallButton();
    const mode = btn ? btn.dataset.installMode : '';

    if (isAppStandalone()) {
        setInstallButtonState();
        return;
    }

    // Важно: prompt() вызывается синхронно из обработчика клика пользователя.
    // Никаких setTimeout, «проверяем установку» и промежуточных модальных окон.
    if (defPrompt) {
        const promptEvent = defPrompt;
        defPrompt = null;
        closeModal('menu-modal');

        try {
            const result = promptEvent.prompt();

            Promise.resolve(result)
                .then(function(choice) {
                    if (choice && choice.outcome === 'accepted') {
                        // appinstalled окончательно скроет кнопку после установки.
                        return;
                    }
                    // Один BeforeInstallPromptEvent можно использовать только один раз.
                    // После отказа ждём, пока браузер снова сам разрешит prompt.
                    setInstallButtonState();
                })
                .catch(function() {
                    setInstallButtonState();
                });
        } catch (error) {
            console.warn('Native PWA install prompt failed:', error);
            setInstallButtonState();
        }
        return;
    }

    closeModal('menu-modal');

    if (mode === 'ios' || mode === 'safari-mac') {
        showUnsupportedInstallHelp(mode);
        return;
    }

    // Кнопка остаётся видимой даже если событие beforeinstallprompt ещё
    // не пришло. Как только браузер разрешит системную установку, следующий
    // клик сразу откроет нативное окно «Установить / Отмена».
    // Сам сайт не может программно создать это системное окно раньше браузера.
    if (!defPrompt) {
        const btnNow = getInstallButton();
        if (btnNow) {
            btnNow.disabled = true;
            btnNow.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Подготовка установки...';
            setTimeout(function() {
                if (!isAppStandalone()) {
                    btnNow.disabled = false;
                    btnNow.innerHTML = '<i class="fas fa-mobile-screen-button"></i> Установить приложение';
                }
            }, 900);
        }
    }
};

serviceWorkerRegistrationPromise.then(function() {
    setInstallButtonState();
});

document.addEventListener('DOMContentLoaded', setInstallButtonState);

// --- API & AUTH ---
async function api(action, data = {}) { 
    data.action = action; 
    try { 
        const res = await fetch('api.php', { 
            method: 'POST', 
            headers: {'Content-Type': 'application/json'}, 
            body: JSON.stringify(data) 
        }); 
        if (!res.ok) { throw new Error(`Server Error: ${res.status}`); }
        const text = await res.text();
        try { return JSON.parse(text); } 
        catch (e) { console.error("JSON Parse Error:", text); return {error: "Ошибка обработки ответа сервера"}; }
    } catch(e) { 
        return {error: "Ошибка сети или сервера."}; 
    } 
}

async function checkAuth() { 
    const res = await api('check_auth'); 
    if (res.logged_in) { 
        currentUser = res.username; 
        if(res.theme) setTheme(res.theme, false);
        await loadUserData(); 
    } 
    else { currentUser = null; await loadUserData(); } 
}

async function loadUserData() { 
    let dbPlaylists = []; 
    if(currentUser) { 
        const data = await api('get_data'); 
        if(!data.error && Array.isArray(data)) dbPlaylists = data; 
    } 
    playlists = [...dbPlaylists]; 
    if(currentTab !== 'search') { 
        const pl = playlists.find(p => p.id == currentTab); 
        if(pl) { playlist = [...pl.tracks]; renderPlaylist(); } 
        else switchTab('search'); 
    } 
}

// --- WAKE LOCK ---
async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator && !mainAudio.paused && !mainAudio.ended) {
            wakeLock = await navigator.wakeLock.request('screen');
        }
    } catch (err) {}
}
function releaseWakeLock() {
    if (wakeLock !== null) {
        wakeLock.release().then(function() { wakeLock = null; }).catch(function() { wakeLock = null; });
    }
}
document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible' && !mainAudio.paused && !mainAudio.ended) {
        requestWakeLock();
    }
});

// --- UI HELPERS ---
function showNotification(msg) { 
    const el = document.getElementById('alert-msg');
    if(el) el.innerText = msg; 
    document.getElementById('alert-modal').classList.add('show'); 
}
function showConfirm(msg, callback) { 
    document.getElementById('confirm-msg').innerText = msg; 
    const yesBtn = document.getElementById('confirm-btn-yes'); 
    const newBtn = yesBtn.cloneNode(true); 
    yesBtn.parentNode.replaceChild(newBtn, yesBtn); 
    newBtn.addEventListener('click', () => { closeModal('confirm-modal'); callback(); }); 
    document.getElementById('confirm-modal').classList.add('show'); 
}
function closeModal(id) { document.getElementById(id).classList.remove('show'); }
function showLoader(show) { 
    const loader = document.getElementById('loader-overlay');
    if(show) loader.classList.add('active'); 
    else loader.classList.remove('active'); 
}

// --- ПЛЕЙЛИСТЫ ---
function openNewPlModal() { 
    document.getElementById('new-tab-name').value = ''; 
    closeModal('manage-pl-modal'); 
    document.getElementById('input-modal').classList.add('show'); 
}

async function submitCreateTab() { 
    const name = document.getElementById('new-tab-name').value.trim(); 
    if(!name) return; 
    if(!currentUser) return showNotification("Авторизуйтесь для создания плейлистов"); 
    const res = await api('create_playlist', { name: name, type: 'standard' }); 
    if (res.success) {
        await loadUserData(); 
        showNotification("Создано");
        closeModal('input-modal'); 
        const pl = playlists.find(p => p.id == res.id);
        if(pl) openTrackManager(pl.id, pl.name, pl.type);
    } else { showNotification(res.error || "Ошибка"); }
}

function openManagePlaylists() { 
    const list = document.getElementById('manage-pl-list'); 
    list.innerHTML = ''; 
    playlists.forEach(pl => { 
        const div = document.createElement('div'); 
        div.className = 'pl-manage-item'; 
        const nameWrap = document.createElement('span');
        nameWrap.className = 'pl-manage-name';
        nameWrap.textContent = pl.name || '';
        const actions = document.createElement('div');
        actions.className = 'pl-manage-actions';
        const editBtn = document.createElement('button');
        editBtn.innerHTML = '<i class="fas fa-pen"></i>';
        editBtn.addEventListener('click', () => openTrackManager(pl.id, pl.name, pl.type));
        const delBtn = document.createElement('button');
        delBtn.innerHTML = '<i class="fas fa-trash"></i>';
        delBtn.addEventListener('click', () => deletePlaylistFromManager(pl.id));
        actions.appendChild(editBtn);
        actions.appendChild(delBtn);
        div.appendChild(nameWrap);
        div.appendChild(actions);
        list.appendChild(div); 
    }); 
    closeModal('menu-modal'); 
    document.getElementById('manage-pl-modal').classList.add('show'); 
}

async function deletePlaylistFromManager(id) {
    showConfirm("Удалить плейлист?", async () => {
        await api('delete_playlist', { id: id });
        await loadUserData();
        openManagePlaylists(); 
        showNotification("Плейлист удален");
        if (currentTab == id) switchTab('search');
    });
}

function openTrackManager(plId, plName, plType) { 
    const pl = playlists.find(p => p.id == plId); 
    editingPlaylistId = plId; 
    document.getElementById('tm-rename-input').value = plName;
    document.getElementById('tm-add-link-area').style.display = 'none';
    renderTrackManagerList(pl); 
    closeModal('manage-pl-modal'); 
    document.getElementById('track-manager-modal').classList.add('show'); 
}

async function savePlaylistName() {
    if(!editingPlaylistId) return;
    const newName = document.getElementById('tm-rename-input').value.trim();
    if(!newName) return;
    const pl = playlists.find(p => p.id == editingPlaylistId);
    if(pl && pl.name !== newName) {
        await api('rename_playlist', { id: editingPlaylistId, name: newName });
        await loadUserData();
        if(currentTab == editingPlaylistId) {
             const label = document.getElementById('active-tab-name');
             if(label) label.innerText = newName.toUpperCase();
        }
    }
}

function showAddLinkUI(type) {
    const area = document.getElementById('tm-add-link-area');
    const input = document.getElementById('tm-link-input');
    const btn = document.getElementById('tm-add-confirm-btn');
    area.style.display = 'block';
    document.getElementById('tm-link-name').value = '';
    input.value = '';
    input.placeholder = "Ссылка на аудио/MP3...";
    btn.onclick = () => addLinkToPlaylist(editingPlaylistId);
    input.focus();
}

function triggerLocalUploadManager() {
    activePlIdForUpload = editingPlaylistId;
    document.getElementById('local-file-input').click();
}

function renderTrackManagerList(pl) { 
    const list = document.getElementById('track-manage-list'); 
    list.innerHTML = ''; 
    if(!pl || pl.tracks.length === 0) { 
        const empty = document.createElement('div');
        empty.style.color = '#666'; empty.style.padding = '20px'; empty.style.textAlign = 'center';
        empty.textContent = 'Плейлист пуст'; list.appendChild(empty); return; 
    } 
    pl.tracks.forEach(t => { 
        const div = document.createElement('div'); 
        div.className = 'tm-row'; 
        const info = document.createElement('div');
        info.className = 'tm-info';
        const icon = document.createElement('div');
        icon.className = 'tm-icon';
        icon.innerHTML = `<i class="fas fa-music"></i>`;
        const title = document.createElement('span');
        title.className = 'tm-title'; title.textContent = t.title || '';
        info.appendChild(icon); info.appendChild(title);
        const del = document.createElement('button');
        del.className = 'tm-del'; del.innerHTML = '<i class="fas fa-trash"></i>';
        del.addEventListener('click', () => deleteTrackFromPlaylist(pl.id, t.id));
        div.appendChild(info); div.appendChild(del);
        list.appendChild(div); 
    }); 
}

async function addLinkToPlaylist(plId) { 
    if(!plId) plId = editingPlaylistId;
    const url = document.getElementById('tm-link-input').value.trim();
    const nameVal = document.getElementById('tm-link-name').value.trim() || 'Сетевой трек';
    if(!url) return;
    const trackData = { title: nameVal, artist: 'Web Link', url: url, thumb: '', type: 'audio' };
    await api('add_track', { playlist_id: plId, track: trackData }); 
    await loadUserData();
    document.getElementById('tm-add-link-area').style.display = 'none';
    renderTrackManagerList(playlists.find(p => p.id == plId));
}

async function handleLocalFileSelect(input) { 
    if(input.files.length > 0 && activePlIdForUpload) { 
        showLoader(true); let successCount = 0;
        for (let i = 0; i < input.files.length; i++) {
            const formData = new FormData();
            formData.append('action', 'upload_track');
            formData.append('playlist_id', activePlIdForUpload);
            formData.append('file', input.files[i]);
            try {
                const res = await fetch('api.php', { method: 'POST', body: formData });
                const data = await res.json();
                if(data.success) successCount++;
            } catch(e) {}
        }
        await loadUserData();
        const updatedPl = playlists.find(p => p.id == activePlIdForUpload);
        if (updatedPl) renderTrackManagerList(updatedPl);
        showLoader(false);
        showNotification(`Загружено файлов: ${successCount} из ${input.files.length}`);
    } 
}

async function deleteTrackFromPlaylist(plId, trackId) { 
    await api('delete_track', {track_id: trackId}); 
    await loadUserData(); 
    renderTrackManagerList(playlists.find(p => p.id == plId)); 
}
window.deleteTrackGeneral = async function(trackId, plId) {
    await api('delete_track', {track_id: trackId}); 
    await loadUserData(); 
}

// --- УСТОЙЧИВЫЙ PLAYBACK ДЛЯ СЛАБОЙ СЕТИ ---
let streamRecoveryTimer = null;
let pendingResumeTime = 0;
let currentPlaybackToken = 0;
let networkRetryPending = false;
const MAX_STREAM_RETRIES = 4;

function clearStreamRecoveryTimer() {
    if (streamRecoveryTimer) {
        clearTimeout(streamRecoveryTimer);
        streamRecoveryTimer = null;
    }
}

function restorePendingPosition() {
    if (pendingResumeTime > 1 && isFinite(mainAudio.duration) && mainAudio.duration > 0) {
        const target = Math.min(pendingResumeTime, Math.max(0, mainAudio.duration - 1));
        try { mainAudio.currentTime = target; } catch(e) {}
        pendingResumeTime = 0;
    }
}

function scheduleStreamRecovery(reason, delay) {
    const track = playlist[currentIndex];
    if (!track || !track.url || mainAudio.ended) return;
    clearStreamRecoveryTimer();

    const token = currentPlaybackToken;
    const net = getNetworkProfile();
    const wait = typeof delay === 'number' ? delay : (net.veryWeak ? 26000 : (net.weak ? 16000 : 8000));

    streamRecoveryTimer = setTimeout(function() {
        if (token !== currentPlaybackToken || mainAudio.ended) return;
        recoverCurrentStream(reason);
    }, wait);
}

async function recoverCurrentStream(reason) {
    const track = playlist[currentIndex];
    if (!track || !track.url) return;

    clearStreamRecoveryTimer();

    if (!navigator.onLine && track.url.startsWith('http')) {
        networkRetryPending = true;
        showLoader(true);
        titleEl.textContent = track.title;
        artistEl.textContent = 'Нет сети — ждём восстановления сигнала';
        updateState(false);
        return;
    }

    networkRetryPending = false;
    track._streamRetries = (track._streamRetries || 0) + 1;

    if (track._streamRetries > MAX_STREAM_RETRIES) {
        showLoader(false);
        updateState(false);
        titleEl.textContent = track.title;
        artistEl.textContent = 'Источник временно недоступен';
        // Только после нескольких попыток переходим дальше, и только при наличии сети.
        setTimeout(function() {
            if (playlist[currentIndex] === track && navigator.onLine) playNext();
        }, 3500);
        return;
    }

    const resumeAt = Math.max(
        Number(track._resumeTime || 0),
        isFinite(mainAudio.currentTime) ? Number(mainAudio.currentTime || 0) : 0
    );
    pendingResumeTime = resumeAt > 1 ? resumeAt : 0;

    const retry = track._streamRetries;
    const useNoRange = retry >= 3;
    let retryUrl = track.url;

    if (track.url.startsWith('http')) {
        // Последняя попытка может идти напрямую: это помогает источникам,
        // которые не дружат с relay, но сначала всегда используем наш устойчивый proxy.
        if (retry < MAX_STREAM_RETRIES) {
            retryUrl = buildProxyUrl(track, { weak: true, norange: useNoRange, retry: retry });
        }
    }

    showLoader(true);
    mainAudio.pause();
    mainAudio.src = retryUrl;
    mainAudio.load();

    try {
        await mainAudio.play();
        restorePendingPosition();
        showLoader(false);
        updateState(true);
    } catch (error) {
        if (error && error.name === 'NotAllowedError') {
            showLoader(false);
            updateState(false);
            artistEl.textContent = 'Нажмите ▶ для продолжения';
            return;
        }
        scheduleStreamRecovery('retry-failed', getNetworkProfile().weak ? 5000 : 2500);
    }
}

mainAudio.addEventListener('playing', function() {
    clearStreamRecoveryTimer();
    showLoader(false);
    networkRetryPending = false;
    window.skipCounter = 0;
    updateState(true);
    requestWakeLock();

    const token = currentPlaybackToken;
    const track = playlist[currentIndex];
    setTimeout(function() {
        if (token === currentPlaybackToken && track === playlist[currentIndex] && !mainAudio.paused) {
            track._streamRetries = 0;
        }
    }, 12000);
});

mainAudio.addEventListener('pause', function() {
    if (!mainAudio.ended) updateState(false);
});

mainAudio.addEventListener('ended', function() {
    clearStreamRecoveryTimer();
    releaseWakeLock();
    if (isRepeat) playTrack(currentIndex); else playNext();
});

mainAudio.addEventListener('waiting', function() {
    if (mainAudio.ended) return;
    showLoader(true);
    if (!mainAudio.paused) scheduleStreamRecovery('waiting');
});

mainAudio.addEventListener('stalled', function() {
    if (mainAudio.ended) return;
    showLoader(true);
    if (!mainAudio.paused) scheduleStreamRecovery('stalled');
});

mainAudio.addEventListener('canplay', function() {
    restorePendingPosition();
    showLoader(false);
});

mainAudio.addEventListener('loadedmetadata', restorePendingPosition);

mainAudio.addEventListener('timeupdate', function() {
    const track = playlist[currentIndex];
    if (track && isFinite(mainAudio.currentTime) && mainAudio.currentTime > 0) {
        track._resumeTime = mainAudio.currentTime;
    }
});

mainAudio.addEventListener('error', function() {
    const track = playlist[currentIndex];
    if (!track || !track.url) return;
    showLoader(true);
    scheduleStreamRecovery('media-error', getNetworkProfile().weak ? 2500 : 1200);
});

window.addEventListener('offline', function() {
    if (currentIndex < 0 || mainAudio.ended) return;
    // Уже буферизованный звук может продолжать играть даже без сети.
    // Не перезапускаем поток, пока буфера хватает.
    if (mainAudio.paused || mainAudio.readyState < 3) {
        networkRetryPending = true;
        showLoader(true);
        artistEl.textContent = 'Сигнал потерян — ждём сеть';
    }
});

window.addEventListener('online', function() {
    if (networkRetryPending && currentIndex >= 0) {
        recoverCurrentStream('network-online');
    }
});

if (connectionInfo && typeof connectionInfo.addEventListener === 'function') {
    connectionInfo.addEventListener('change', function() {
        // Если радиосеть вернулась после провала, продолжаем тот же трек.
        if (networkRetryPending && navigator.onLine) {
            recoverCurrentStream('connection-change');
        }
    });
}

async function playTrack(index) {
    if(index < 0 || index >= playlist.length) return;
    currentIndex = index;
    const track = playlist[index];
    currentPlaybackToken++;
    const token = currentPlaybackToken;

    track._streamRetries = 0;
    track._resumeTime = 0;
    networkRetryPending = false;
    pendingResumeTime = 0;
    clearStreamRecoveryTimer();

    updateActiveTrackInList(index);
    titleEl.textContent = track.title;
    artistEl.textContent = track.artist;
    showLoader(true);

    if ('mediaSession' in navigator) {
        try {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: track.title,
                artist: track.artist,
                album: 'DAGSTUDIO',
                artwork: [{ src: track.thumb || 'images/faviconch.png', sizes: '512x512', type: 'image/png' }]
            });
            navigator.mediaSession.setActionHandler('play', togglePlay);
            navigator.mediaSession.setActionHandler('pause', togglePlay);
            navigator.mediaSession.setActionHandler('previoustrack', playPrev);
            navigator.mediaSession.setActionHandler('nexttrack', playNext);
        } catch(e) {}
    }

    clearTimeout(playWatchdog);

    if (currentBlobUrl) {
        URL.revokeObjectURL(currentBlobUrl);
        currentBlobUrl = null;
    }

    mainAudio.pause();
    mainAudio.removeAttribute('src');
    mainAudio.load();

    try {
        let finalUrl = track.url;
        let isCached = false;

        if (track.url && track.url.startsWith('http')) {
            if (currentTab !== 'search') {
                const cachedRes = await getDeviceCachedAudio(track.url);
                if (token !== currentPlaybackToken) return;

                if (cachedRes.isBlob) {
                    currentBlobUrl = cachedRes.url;
                    finalUrl = currentBlobUrl;
                    isCached = true;
                } else {
                    finalUrl = buildProxyUrl(track, { weak: isWeakConnection() });
                }
            } else {
                finalUrl = buildProxyUrl(track, { weak: isWeakConnection() });
            }
        }

        if (!navigator.onLine && !isCached && track.url && track.url.startsWith('http')) {
            networkRetryPending = true;
            showLoader(true);
            titleEl.textContent = track.title;
            artistEl.textContent = 'Нет сети — начнём автоматически после восстановления';
            updateState(false);
            return;
        }

        mainAudio.src = finalUrl;
        mainAudio.loop = false;
        mainAudio.preload = 'auto';

        const net = getNetworkProfile();
        playWatchdog = setTimeout(function() {
            if (token !== currentPlaybackToken) return;
            if (mainAudio.readyState < 3 && !mainAudio.ended) {
                recoverCurrentStream('startup-timeout');
            }
        }, net.veryWeak ? 60000 : (net.weak ? 45000 : 25000));

        await mainAudio.play();
        if (token !== currentPlaybackToken) return;
        clearTimeout(playWatchdog);
        showLoader(false);
        updateState(true);

    } catch (error) {
        clearTimeout(playWatchdog);
        if (token !== currentPlaybackToken) return;

        if (error && error.name === 'NotAllowedError') {
            showLoader(false);
            updateState(false);
            artistEl.textContent = 'Нажмите ▶ для запуска';
            return;
        }

        scheduleStreamRecovery('play-failed', getNetworkProfile().weak ? 2500 : 1000);
    }
}

function updateActiveTrackInList(index) {
    const rows = document.querySelectorAll('.track-row');
    rows.forEach(r => r.classList.remove('active'));
    if(rows[index]) {
        rows[index].classList.add('active');
        rows[index].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function togglePlay() {
    const track = playlist[currentIndex];
    if(!track) return;

    window.skipCounter = 0;

    if(mainAudio.paused) {
        if (!mainAudio.src || mainAudio.src.endsWith('null') || mainAudio.src === window.location.href) {
            playTrack(currentIndex);
            return;
        }

        mainAudio.play().then(function() {
            updateState(true);
            requestWakeLock();
        }).catch(function(error) {
            updateState(false);
            if (error && error.name === 'NotAllowedError') {
                artistEl.textContent = 'Нажмите ▶ ещё раз для запуска';
                return;
            }
            scheduleStreamRecovery('manual-play-failed', 1000);
        });
    } else {
        clearStreamRecoveryTimer();
        mainAudio.pause();
        releaseWakeLock();
        updateState(false);
    }
}

function updateState(playing) { 
    const btn = document.getElementById('btn-play'); 
    if(playing) { btn.innerHTML = '<i class="fas fa-pause"></i>'; document.querySelector('.vinyl-wrapper').classList.add('spinning'); startProgressLoop(); } 
    else { btn.innerHTML = '<i class="fas fa-play" style="padding-left:5px;"></i>'; document.querySelector('.vinyl-wrapper').classList.remove('spinning'); stopProgressLoop(); } 
}

function toggleShuffle() { isShuffle = !isShuffle; document.getElementById('btn-shuffle').classList.toggle('active'); }
function toggleRepeat() { isRepeat = !isRepeat; document.getElementById('btn-repeat').classList.toggle('active'); }
function playNext() { 
    if (isShuffle) {
        if(playlist.length > 1) {
            let r = Math.floor(Math.random() * playlist.length);
            while(r === currentIndex && playlist.length > 1) { r = Math.floor(Math.random() * playlist.length); }
            playTrack(r);
        } else { playTrack(0); }
    } else {
        let n = currentIndex + 1; if(n >= playlist.length) n = 0; playTrack(n); 
    }
}
function playPrev() { let p = currentIndex - 1; if(p < 0) p = playlist.length - 1; playTrack(p); }

document.getElementById('btn-shuffle').onclick = toggleShuffle;
document.getElementById('btn-repeat').onclick = toggleRepeat;
document.getElementById('btn-next').onclick = playNext; 
document.getElementById('btn-prev').onclick = playPrev; 

let animationFrameId;

function startProgressLoop() { stopProgressLoop(); function loop() { updateProgress(); animationFrameId = requestAnimationFrame(loop); } loop(); }
function stopProgressLoop() { if (animationFrameId) { cancelAnimationFrame(animationFrameId); animationFrameId = null; } }

function updateProgress() { 
    if (document.hidden) return; 
    let curr = 0, dur = 0, buf = 0; 
    const track = playlist[currentIndex]; 
    if(!track) return;

    if(mainAudio) { 
        curr = mainAudio.currentTime; dur = mainAudio.duration; 
        if(mainAudio.buffered.length > 0) try { buf = (mainAudio.buffered.end(mainAudio.buffered.length - 1) / dur) * 100; } catch(e) {} 
        if((buf === 0 || buf < (curr/dur)*100) && !mainAudio.paused && mainAudio.currentTime > 0) { buf = ((curr / dur) * 100) + 10; if(buf > 100) buf = 100; } 
    } 

    // Защита от NaN
    if(isFinite(dur) && dur > 0 && isFinite(curr)) { 
        const pct = (curr / dur) * 100; 
        progCurrent.style.width = pct.toFixed(2) + '%'; 
        progBuffer.style.width = buf.toFixed(2) + '%'; 
        currTimeEl.innerText = formatTime(curr); 
        durTimeEl.innerText = formatTime(dur); 
    } else {
        currTimeEl.innerText = "0:00"; 
        durTimeEl.innerText = "0:00"; 
    }
}

function formatTime(s) { 
    if(isNaN(s) || !isFinite(s)) return "0:00";
    const m = Math.floor(s / 60); const sc = Math.floor(s % 60); return m + ":" + (sc < 10 ? '0' : '') + sc; 
}

document.getElementById('prog-area').onclick = function(e) { 
    const track = playlist[currentIndex]; if(track) { 
        const rect = this.getBoundingClientRect(); 
        const pos = (e.clientX - rect.left) / rect.width; 
        const seekTo = pos * mainAudio.duration; 
        if(isFinite(seekTo)) {
            mainAudio.currentTime = seekTo; 
            updateProgress(); 
        }
    } 
};

// --- GLOBAL SEARCH LOGIC ---
const mainSearchInput = document.getElementById('search-input'); 
const searchHistoryBox = document.getElementById('search-history');

function saveSearchQuery(query) { 
    if(!query || query.length < 2) return; 
    let history = JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || '[]'); 
    history = history.filter(item => item !== query); 
    history.unshift(query); 
    if(history.length > 8) history.pop(); 
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history)); 
}

function showSearchHistory() {
    if(!mainSearchInput || !searchHistoryBox) return;
    let history = JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || '[]'); 
    if(history.length === 0) { searchHistoryBox.style.display = 'none'; return; }
    searchHistoryBox.innerHTML = '';
    history.forEach(q => { 
        const div = document.createElement('div'); div.className = 'search-suggestion-item'; 
        const icon = document.createElement('i'); icon.className = 'fas fa-history';
        const span = document.createElement('span'); span.textContent = q;
        div.appendChild(icon); div.appendChild(span);
        div.onclick = () => { mainSearchInput.value = q; performSearch(q); searchHistoryBox.style.display = 'none'; }; 
        searchHistoryBox.appendChild(div); 
    }); 
    searchHistoryBox.style.display = 'block'; 
}

if(mainSearchInput) mainSearchInput.addEventListener('focus', showSearchHistory); 
document.addEventListener('click', (e) => { 
    if (mainSearchInput && searchHistoryBox && !mainSearchInput.contains(e.target) && !searchHistoryBox.contains(e.target)) { searchHistoryBox.style.display = 'none'; } 
});

async function performSearch(query, save = false) { 
    if(!query) return; 
    if(save && searchHistoryBox) { saveSearchQuery(query); searchHistoryBox.style.display = 'none'; } 
    localStorage.setItem('dag_last_search', query); 
    currentSearchQuery = query; currentSearchPage = 1; hasMoreSearchResults = true;
    
    listEl.innerHTML = '<div class="search-loader-box"><div class="search-spinner"></div><div style="margin-top:15px; font-size:0.9rem; color:#666;">Ищем музыку...</div></div>'; 
    try {
        isSearchLoading = true;
        const result = await api('search_global', { query: query, page: currentSearchPage });
        isSearchLoading = false;
        
        if (result.success && result.data) {
            playlist = result.data; searchPlaylistCache = result.data; renderPlaylist(); 
            if(result.data.length === 0) { listEl.innerHTML = '<div style="color:#888; padding:20px; text-align:center;">Ничего не найдено</div>'; hasMoreSearchResults = false; } else if (result.data.length < 15) { hasMoreSearchResults = false; }
        } else { listEl.innerHTML = '<div style="color:#888; padding:20px; text-align:center;">Ошибка поиска</div>'; }
    } catch(e) { isSearchLoading = false; listEl.innerHTML = '<div style="color:#888; padding:20px; text-align:center;">Ошибка сети</div>'; } 
}

async function loadMoreSearchResults() {
    if (isSearchLoading || !hasMoreSearchResults || currentTab !== 'search') return;
    isSearchLoading = true; currentSearchPage++;
    
    const loader = document.createElement('div'); loader.className = 'more-loader';
    loader.innerHTML = '<div class="spinner" style="width:20px; height:20px; margin: 15px auto;"></div>';
    listEl.appendChild(loader);

    try {
        const result = await api('search_global', { query: currentSearchQuery, page: currentSearchPage });
        loader.remove();
        if (result.success && result.data && result.data.length > 0) {
            playlist = playlist.concat(result.data); searchPlaylistCache = playlist; renderPlaylist(); 
            if (result.data.length < 10) hasMoreSearchResults = false;
        } else { hasMoreSearchResults = false; }
    } catch(e) { loader.remove(); hasMoreSearchResults = false; }
    isSearchLoading = false;
}

const playlistArea = document.querySelector('.playlist-area');
if(playlistArea) {
    playlistArea.addEventListener('scroll', function() {
        if (currentTab === 'search' && !isSearchLoading && hasMoreSearchResults) {
            if (this.scrollTop + this.clientHeight >= this.scrollHeight - 100) { loadMoreSearchResults(); }
        }
    });
}

if(mainSearchInput) {
    mainSearchInput.addEventListener('input', (e) => { 
        if(searchHistoryBox) searchHistoryBox.style.display = 'none'; 
        clearTimeout(searchTimeout); 
        searchTimeout = setTimeout(() => { performSearch(e.target.value, false); }, 400); 
    });
    mainSearchInput.addEventListener('keydown', (e) => { 
        if(e.key === 'Enter') { clearTimeout(searchTimeout); performSearch(e.target.value, true); } 
    });
}

// --- ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК ---
function switchTab(id) { 
    currentTab = id; 
    const searchBtn = document.getElementById('tab-search-btn'); 
    const plSelectBtn = document.getElementById('btn-pl-select'); 
    const label = document.getElementById('active-tab-name'); 
    const searchContainer = document.getElementById('search-container-box'); 

    if (searchBtn) searchBtn.classList.remove('active'); 
    if (plSelectBtn) plSelectBtn.classList.remove('active'); 
    
    if(id === 'search') { 
        if(label) label.style.display = 'none'; 
        if(searchContainer) searchContainer.style.display = 'block'; 
        if(searchBtn) searchBtn.classList.add('active'); 
        playlist = searchPlaylistCache; 
        renderPlaylist(); 
    } else { 
        const pl = playlists.find(p => p.id == id); 
        if(pl) { 
            if(label) { label.innerText = pl.name.toUpperCase(); label.style.display = 'block'; } 
            if(searchContainer) searchContainer.style.display = 'none'; 
            if(plSelectBtn) plSelectBtn.classList.add('active'); 
            playlist = [...pl.tracks]; 
            renderPlaylist(); 
        } 
    } 
}

// --- RENDER PLAYLIST С ДИНАМИЧЕСКИМИ ЛОГОТИПАМИ ---
function renderPlaylist() { 
    listEl.innerHTML = ''; 
    const fragment = document.createDocumentFragment();
    
    let currentThemeName = localStorage.getItem('dag_theme') || 'brown';
    let activeThemeImg = colorThemes[currentThemeName] ? colorThemes[currentThemeName].img : 'images/cover.png';

    if (playlist.length === 0) {
        let msg = "Нет треков";
        if (currentTab === 'search') msg = "Используйте поиск";
        
        listEl.innerHTML = `<div style="text-align:center; padding:40px; color:#444;">${msg}</div>`;
        return;
    }

    playlist.forEach((t, i) => { 
        const div = document.createElement('div'); div.className = 'track-row ' + (i === currentIndex ? 'active' : ''); 
        let iconHtml = '';
        let trackThumb = t.thumb;
        let isDefaultLogo = false;

        if (!trackThumb || trackThumb.includes('images/cover.png') || trackThumb.includes('images/r.png') || trackThumb.includes('images/z.png') || trackThumb.includes('images/s.png') || trackThumb.includes('images/f.png')) {
            trackThumb = activeThemeImg;
            isDefaultLogo = true;
        }

        if(trackThumb) {
            let imgClass = isDefaultLogo ? "theme-aware-thumb" : "";
            iconHtml = `<img src="${trackThumb}" class="${imgClass}" loading="lazy" decoding="async" style="width:48px; height:48px; border-radius:50%; object-fit:cover; margin-right:12px;" alt="">`;
        } else {
            iconHtml = `<div class="track-icon-box link" style="margin-right:12px;"><i class="fas fa-music"></i></div>`;
        }
        
        const downloadBtn = (t.url && t.url.startsWith('http')) 
            ? `<button class="btn-list-action" style="margin-right: 5px;" title="Скачать" onclick="event.stopPropagation(); window.downloadTrack(${i})"><i class="fas fa-download"></i></button>` 
            : '';

        let actionBtn = ''; 
        if(currentTab === 'search') { 
            const isLiked = playlists.some(pl => pl.tracks.some(track => track.url === t.url)); 
            const likeClass = isLiked ? 'fas fa-heart liked' : 'far fa-heart'; 
            actionBtn = `
                ${downloadBtn}
                <button class="btn-list-action ${likeClass}" title="В плейлист" onclick="event.stopPropagation(); openSaveModal(${i})"></button>
            `; 
        } else { 
            actionBtn = `
                ${downloadBtn}
                <button class="btn-list-action del" title="Удалить" onclick="event.stopPropagation(); window.deleteTrackGeneral('${t.id}', '${currentTab}')"><i class="fas fa-trash"></i></button>
            `; 
        } 
        div.innerHTML = '';

        const left = document.createElement('div'); left.className = 'track-left';
        const title = document.createElement('div'); title.className = 't-title'; title.textContent = t.title || '';
        const artist = document.createElement('div'); artist.className = 't-artist'; 
        
        let sourceHtml = (currentTab === 'search' && t.source) ? `<span class="source-badge">${t.source}</span>` : '';
        artist.innerHTML = `${t.artist || 'Неизвестен'} ${sourceHtml}`;
        
        left.appendChild(title); left.appendChild(artist);

        const actions = document.createElement('div'); actions.className = 'track-actions'; actions.innerHTML = actionBtn;
        const iconWrap = document.createElement('div'); iconWrap.innerHTML = iconHtml;

        div.appendChild(iconWrap.firstChild); div.appendChild(left); div.appendChild(actions);
        div.onclick = () => { playTrack(i); }; 
        fragment.appendChild(div); 
    }); 
    listEl.appendChild(fragment);
    if(currentIndex !== -1) updateActiveTrackInList(currentIndex);
}

function openPlaylistSelect(isSaving = false) { 
    if(!currentUser) return showNotification("Сначала войдите!"); 
    const list = document.getElementById('playlist-select-list'); 
    list.innerHTML = ''; 
    playlists.forEach(pl => { 
        const btn = document.createElement('div'); btn.className = 'playlist-select-btn'; 
        const nameSpan = document.createElement('span'); nameSpan.textContent = pl.name || '';
        btn.appendChild(nameSpan);
        btn.addEventListener('click', () => { 
            if(isSaving) addToPlaylist(pl.id); 
            else { closeModal('save-modal'); switchTab(pl.id); if(pl.tracks.length > 0) { playlist = [...pl.tracks]; playTrack(0); } } 
        }); 
        list.appendChild(btn); 
    }); 
    document.getElementById('save-modal').classList.add('show'); 
}

function openSaveModal(index) { selectedTrackForSave = playlist[index]; openPlaylistSelect(true); }

async function addToPlaylist(plId) { 
    const track = selectedTrackForSave; const pl = playlists.find(p => p.id == plId); 
    if(pl.tracks.some(t => t.url === track.url)) { showNotification("Уже есть"); return; } 
    const trackData = { title: track.title, artist: track.artist, url: track.url || track.file, thumb: track.thumb, type: 'audio' }; 
    await api('add_track', { playlist_id: plId, track: trackData }); 
    closeModal('save-modal'); 
    showNotification("Добавлено! Кэшируем для оффлайна..."); 
    await loadUserData(); 
    
    // Как только трек добавлен в плейлист, даем команду на его кэширование в фоне!
    if (navigator.onLine && trackData.url.startsWith('http')) {
        cacheTrackSilently(trackData.url);
    }
}

function openMenu() { if (currentUser) { document.getElementById('auth-section').style.display = 'none'; document.getElementById('user-section').style.display = 'block'; document.getElementById('user-name-disp').innerText = currentUser; } else { document.getElementById('auth-section').style.display = 'block'; document.getElementById('user-section').style.display = 'none'; } document.getElementById('menu-modal').classList.add('show'); }
function toggleAuthMode() { isRegMode = !isRegMode; const title = document.getElementById('auth-title'); const btn = document.querySelector('#auth-section button'); const toggle = document.querySelector('.auth-toggle'); if (isRegMode) { title.innerText = "РЕГИСТРАЦИЯ"; btn.innerText = "СОЗДАТЬ АККАУНТ"; toggle.innerText = "Уже есть аккаунт? Войти"; } else { title.innerText = "ВХОД"; btn.innerText = "ВОЙТИ"; toggle.innerText = "Нет аккаунта? Зарегистрироваться"; } }

async function handleAuth() { 
    const name = document.getElementById('auth-name').value.trim(); const pass = document.getElementById('auth-pass').value.trim(); 
    if(!name || !pass) return showNotification("Введите данные"); 
    const action = isRegMode ? 'register' : 'login'; 
    const res = await api(action, {name, pass}); 
    if(res.success) { 
        if(isRegMode) { showNotification("Регистрация успешна!"); toggleAuthMode(); } 
        else { currentUser = res.username; closeModal('menu-modal'); if(res.theme) setTheme(res.theme, false); await loadUserData(); showNotification("Добро пожаловать, " + res.username + "!"); } 
    } else { showNotification(res.error || "Ошибка сервера"); } 
}
async function handleLogout() { await api('logout'); currentUser = null; playlists = []; playlist = []; switchTab('search'); closeModal('menu-modal'); }

function preloadThemeImages() { Object.values(colorThemes).forEach(theme => { const img = new Image(); img.src = theme.img; }); }
preloadThemeImages();

function setTheme(themeName, save = true) {
    if(!colorThemes[themeName]) return;
    const t = colorThemes[themeName]; const root = document.documentElement;
    root.style.setProperty('--accent-color', t.main); root.style.setProperty('--accent-dark', t.dark); root.style.setProperty('--accent-rgb', t.rgb);
    const glowColor = t.main + '80'; root.style.setProperty('--accent-glow', glowColor);
    
    const coverImg = document.getElementById('cover-img'); 
    if(coverImg) coverImg.src = t.img;
    
    document.querySelectorAll('.theme-aware-thumb').forEach(img => { img.src = t.img; });

    localStorage.setItem('dag_theme', themeName);
    if(save && currentUser) { api('update_theme', {theme: themeName}); }
    document.querySelectorAll('.theme-dot').forEach(btn => { btn.classList.remove('active'); if(btn.getAttribute('onclick').includes(themeName)) { btn.classList.add('active'); } });
}

function loadTheme() { const saved = localStorage.getItem('dag_theme') || 'brown'; setTheme(saved, false); }

loadTheme();
checkAuth();