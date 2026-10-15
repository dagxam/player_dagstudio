// script.js - V2232 (web + Capacitor native shell)

const DAG_SERVER_ORIGIN = 'https://pl.dagstudio.ru';
const NATIVE_SESSION_KEY = 'dag_native_session';
const IS_NATIVE_APP = window.DAG_NATIVE_APP === true ||
    (!!window.Capacitor && typeof window.Capacitor.getPlatform === 'function' && window.Capacitor.getPlatform() !== 'web');

function appServerUrl(path) {
    const value = String(path || '');
    if (/^https?:\/\//i.test(value)) return value;
    if (!IS_NATIVE_APP) return value;
    return DAG_SERVER_ORIGIN + (value.startsWith('/') ? value : '/' + value);
}

function resolveMediaUrl(url) {
    if (url && typeof url === 'object') {
        url = url.url || url.file || '';
    }
    const value = String(url || '').trim();
    if (!value) return '';
    if (/^(https?:|blob:|data:)/i.test(value)) return value;
    if (IS_NATIVE_APP) return DAG_SERVER_ORIGIN + '/' + value.replace(/^\/+/, '');
    return value;
}

function isRemoteMediaUrl(url) {
    return /^https?:\/\//i.test(resolveMediaUrl(url));
}

function isDagServerMedia(url) {
    const value = resolveMediaUrl(url);
    return value.startsWith(DAG_SERVER_ORIGIN + '/uploads/');
}

function shouldProxyMedia(url) {
    const value = resolveMediaUrl(url);
    return /^https?:\/\//i.test(value) && !isDagServerMedia(value);
}

function nativeSessionToken() {
    return IS_NATIVE_APP ? (localStorage.getItem(NATIVE_SESSION_KEY) || '') : '';
}

function getCapacitorPlugin(name) {
    if (!IS_NATIVE_APP || !window.Capacitor || !window.Capacitor.Plugins) return null;
    return window.Capacitor.Plugins[name] || null;
}

async function nativeHttpRequest(options) {
    if (window.DAG_NATIVE_BRIDGE && typeof window.DAG_NATIVE_BRIDGE.httpRequest === 'function') {
        return window.DAG_NATIVE_BRIDGE.httpRequest(options);
    }

    const http = getCapacitorPlugin('CapacitorHttp');
    if (http && typeof http.request === 'function') {
        return http.request(options);
    }

    // Если CapacitorHttp.enabled=true, обычный fetch уже патчится нативной реализацией.
    const response = await fetch(options.url, {
        method: options.method || 'GET',
        headers: options.headers || {},
        body: options.data ? JSON.stringify(options.data) : undefined,
        cache: 'no-store'
    });

    let data;
    const text = await response.text();
    try { data = JSON.parse(text); } catch (e) { data = text; }
    return {
        status: response.status,
        data: data,
        headers: {}
    };
}

const NATIVE_UPDATE_META_URL =
    'https://github.com/dagxam/player_dagstudio/releases/download/android-web/DAGSTUDIO-PLAYER-web-version.json';
const ANDROID_APK_LATEST_URL = 'https://github.com/dagxam/player_dagstudio/releases/download/android-preview/DAGSTUDIO-PLAYER-Preview.apk';
const WEB_BUILD_LABEL = '2252';

let nativeUpdateCheckInFlight = false;
let nativeLastUpdateCheckAt = 0;

function nativeUpdaterBridge() {
    return (window.DAG_NATIVE_BRIDGE && window.DAG_NATIVE_BRIDGE.updater)
        ? window.DAG_NATIVE_BRIDGE.updater
        : getCapacitorPlugin('CapacitorUpdater');
}

async function fetchUpdateJson(url) {
    if (IS_NATIVE_APP) {
        const response = await nativeHttpRequest({
            url: url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(),
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Cache-Control': 'no-cache'
            },
            connectTimeout: 12000,
            readTimeout: 20000
        });

        if (!response || response.status < 200 || response.status >= 300) {
            throw new Error('HTTP ' + (response ? response.status : 0));
        }
        return typeof response.data === 'string'
            ? JSON.parse(response.data)
            : response.data;
    }

    const response = await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), {
        cache: 'no-store',
        headers: { 'Accept': 'application/json' }
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return response.json();
}

async function getNativeAppInfoSafe() {
    if (!IS_NATIVE_APP) {
        return {
            version: 'WEB ' + WEB_BUILD_LABEL,
            build: WEB_BUILD_LABEL,
            native: false
        };
    }

    try {
        if (window.DAG_NATIVE_BRIDGE && typeof window.DAG_NATIVE_BRIDGE.appInfo === 'function') {
            const info = await window.DAG_NATIVE_BRIDGE.appInfo();
            return {
                version: String(info?.version || window.DAG_NATIVE_BUILD_VERSION || 'Preview'),
                build: String(info?.build || ''),
                native: true
            };
        }
    } catch (error) {
        console.warn('Cannot read native app info:', error);
    }

    return {
        version: String(window.DAG_NATIVE_BUILD_VERSION || 'Preview'),
        build: '',
        native: true
    };
}

async function getInstalledBundleVersion() {
    if (!IS_NATIVE_APP) return '';

    const updater = nativeUpdaterBridge();
    if (!updater || typeof updater.current !== 'function') return '';

    try {
        const currentInfo = await updater.current();
        if (currentInfo && currentInfo.bundle && currentInfo.bundle.version) {
            const version = String(currentInfo.bundle.version);
            if (version && version !== 'builtin') return version;
        }
    } catch (error) {
        console.warn('Cannot read current OTA bundle:', error);
    }
    return '';
}

// Не устанавливаем более старую OTA-версию поверх новой.
// Для стандартных номеров X.Y.Z достаточно сравнения чисел по компонентам.
function compareOtaVersions(installed, available) {
    const pattern = /^(\d+)\.(\d+)\.(\d+)$/;
    const current = String(installed || '').match(pattern);
    const next = String(available || '').match(pattern);
    if (!current || !next) return null;
    for (let i = 1; i <= 3; i++) {
        const a = Number(current[i]);
        const b = Number(next[i]);
        if (a !== b) return a > b ? 1 : -1;
    }
    return 0;
}

function configureAndroidDownloadLink() {
    const link = document.getElementById('android-apk-download-btn');
    if (!link) return;
    link.href = ANDROID_APK_LATEST_URL;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('download', 'DAGSTUDIO-PLAYER-Preview.apk');
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', configureAndroidDownloadLink);
} else {
    configureAndroidDownloadLink();
}

function setManualUpdateButtonState(state, text) {
    const btn = document.getElementById('app-update-btn');
    if (!btn) return;

    btn.classList.remove('is-checking', 'is-ready', 'is-current', 'is-error');
    if (state) btn.classList.add(state);

    const icon = btn.querySelector('i');
    const label = btn.querySelector('span');
    if (label && text) label.textContent = text;

    if (icon) {
        icon.className = state === 'is-current'
            ? 'fas fa-circle-check'
            : state === 'is-error'
                ? 'fas fa-triangle-exclamation'
                : 'fas fa-rotate';
    }
    btn.disabled = state === 'is-checking';
}

async function refreshAppVersionInfo() {
    const main = document.getElementById('app-version-text');
    const extra = document.getElementById('app-version-extra');
    if (!main) return;

    const info = await getNativeAppInfoSafe();
    const bundleVersion = await getInstalledBundleVersion();

    if (IS_NATIVE_APP) {
        main.textContent = 'Версия: ' + (info.version || 'Preview');
        const details = [];
        if (info.build) details.push('сборка ' + info.build);
        if (bundleVersion) details.push('OTA ' + bundleVersion);
        extra.textContent = details.join(' · ');
    } else {
        main.textContent = 'Версия сайта: ' + WEB_BUILD_LABEL;
        extra.textContent = 'Android-приложение обновляется отдельно';
    }
}

async function checkNativeLiveUpdate(force = false, manual = false) {
    if (!IS_NATIVE_APP) return { status: 'web' };
    // TEYES CC3 / Android WebView: автоматический updater.set() немедленно
    // перезапускает WebView. Обновление допускаем ТОЛЬКО по нажатию пользователя.
    if (!manual) return { status: 'manual-only' };
    if (nativeUpdateCheckInFlight) return { status: 'busy' };

    const now = Date.now();
    // На слабом интернете автоматическая OTA-загрузка не должна отбирать
    // скорость у музыки. Ручное обновление пользователь запускает сам.
    if (!force && getNetworkProfile().weak && mainAudio && !mainAudio.paused) {
        return { status: 'deferred' };
    }
    if (!force && nativeLastUpdateCheckAt && (now - nativeLastUpdateCheckAt) < 5 * 60 * 1000) {
        return { status: 'throttled' };
    }

    const updater = nativeUpdaterBridge();
    if (!updater) {
        return { status: 'unavailable', error: 'Модуль обновлений недоступен.' };
    }

    nativeUpdateCheckInFlight = true;
    nativeLastUpdateCheckAt = now;

    try {
        if (typeof updater.notifyAppReady === 'function') {
            await updater.notifyAppReady();
        }

        const meta = await fetchUpdateJson(NATIVE_UPDATE_META_URL);
        if (!meta || !meta.version || !meta.url ||
            !/^\d+\.\d+\.\d+$/.test(String(meta.version)) ||
            !/^https:\/\/github\.com\/dagxam\/player_dagstudio\/releases\/download\/android-web\/DAGSTUDIO-PLAYER-web\.zip$/.test(String(meta.url)) ||
            !/^[a-f0-9]{64}$/i.test(String(meta.checksum || ''))) {
            throw new Error('Некорректные данные или контрольная сумма OTA-обновления');
        }

        const installedBundleVersion = await getInstalledBundleVersion();
        const installedVersion = installedBundleVersion || String(window.DAG_NATIVE_BUILD_VERSION || 'builtin');
        const latestVersion = String(meta.version);
        const builtInCommit = String(window.DAG_NATIVE_BUILD_VERSION || '');

        // Свежесобранный APK уже содержит этот же интерфейс; повторный ZIP не нужен.
        const sameBuiltInFiles = !installedBundleVersion && /^[a-f0-9]{40}$/i.test(builtInCommit) &&
            builtInCommit === String(meta.commit || '');
        const order = compareOtaVersions(installedBundleVersion, latestVersion);
        if (sameBuiltInFiles || installedVersion === latestVersion || (order !== null && order >= 0)) {
            return {
                status: 'current',
                installedVersion,
                latestVersion
            };
        }

        if (manual) {
            setManualUpdateButtonState('is-checking', 'Скачиваем обновление…');
        }

        const downloadOptions = {
            url: String(meta.url),
            version: String(meta.version)
        };
        if (meta.checksum) {
            downloadOptions.checksum = String(meta.checksum);
        }

        const bundle = await updater.download(downloadOptions);
        if (!bundle || !bundle.id) {
            throw new Error('Updater did not return bundle id');
        }

        if (manual) {
            setManualUpdateButtonState('is-checking', 'Устанавливаем обновление…');
        }

        // По документации CapacitorUpdater.set() сразу переключает bundle
        // и перезапускает WebView. Код после этой строки может уже не выполниться.
        await updater.set({ id: bundle.id });

        return {
            status: 'updated',
            installedVersion,
            latestVersion: String(meta.version)
        };
    } catch (error) {
        // При временной ошибке разрешаем повторную автоматическую попытку.
        nativeLastUpdateCheckAt = 0;
        console.warn('Native live update skipped:', error);
        return {
            status: 'error',
            error: String(error?.message || error || 'Ошибка обновления')
        };
    } finally {
        nativeUpdateCheckInFlight = false;
    }
}

window.manualUpdateApplication = async function() {
    // Во время музыки ручное обновление тоже не должно внезапно прерывать звук.
    if (IS_NATIVE_APP && mainAudio && !mainAudio.paused && !mainAudio.ended) {
        showNotification('Для обновления сначала нажмите паузу. Музыка не будет прервана без вашего согласия.');
        return;
    }
    setManualUpdateButtonState('is-checking', 'Проверяем обновления…');

    try {
        // В веб/PWA ничего не скачиваем как APK: обновляем Service Worker
        // и перезагружаем приложение с актуальными файлами сайта.
        if (!IS_NATIVE_APP) {
            // Сначала убеждаемся, что сервер доступен. При отсутствии сети
            // офлайн-оболочку не трогаем и не ломаем проигрывание музыки.
            const response = await fetch('/index.php?ota-check=' + Date.now(), {
                cache: 'no-store',
                headers: { 'Cache-Control': 'no-cache' }
            });
            if (!response.ok) throw new Error('Сервер обновлений недоступен: HTTP ' + response.status);

            const registration = await serviceWorkerRegistrationPromise;
            if (registration && typeof registration.update === 'function') {
                // Ошибка проверки SW не должна блокировать прямую загрузку новой версии сайта.
                try { await registration.update(); } catch (error) {
                    console.warn('Service Worker update failed; refreshing site assets directly:', error);
                }
            }

            setManualUpdateButtonState('is-checking', 'Применяем обновление…');
            // Старый SW может отдавать устаревшие script.js/style.css из cache-first.
            // Удаляем ТОЛЬКО кэш интерфейса; загруженные треки и данные не затрагиваем.
            if ('caches' in window) {
                const keys = await caches.keys();
                const shellKeys = keys.filter(function(key) {
                    return key.indexOf('dagstudio-player-shell-') === 0;
                });
                await Promise.all(shellKeys.map(function(key) { return caches.delete(key); }));
            }
            const url = new URL(window.location.href);
            url.searchParams.set('update', Date.now().toString());
            window.location.replace(url.toString());
            return;
        }

        // Нативное Android-приложение обновляется только встроенным OTA bundle.
        // Никаких переходов в браузер и автоматических скачиваний APK.
        const result = await checkNativeLiveUpdate(true, true);

        if (result.status === 'updated') {
            // Обычно сюда управление уже не вернётся: updater.set()
            // сразу перезапускает приложение с новой версией.
            return;
        }

        if (result.status === 'current' || result.status === 'throttled') {
            setManualUpdateButtonState('is-current', 'Установлена последняя версия');
            await refreshAppVersionInfo();
            showNotification('У вас уже установлена последняя версия DAGSTUDIO PLAYER.');
            setTimeout(function() {
                setManualUpdateButtonState('', 'Обновить приложение');
            }, 2600);
            return;
        }

        if (result.status === 'busy') {
            // Автоматическая проверка уже работает: не блокируем кнопку навсегда.
            setManualUpdateButtonState('is-ready', 'Обновление уже выполняется · Проверить ещё раз');
            return;
        }

        if (result.status === 'unavailable') {
            throw new Error('В этой сборке недоступен встроенный модуль обновления.');
        }

        throw new Error(result.error || 'Не удалось проверить обновление');
    } catch (error) {
        console.error('Manual OTA update failed:', error);
        setManualUpdateButtonState('is-error', 'Повторить обновление');
        showNotification('Не удалось обновить приложение автоматически. Проверьте интернет и повторите.');
    }
};

let serviceWorkerRegistrationPromise = Promise.resolve(null);
if (!IS_NATIVE_APP && 'serviceWorker' in navigator) {
    serviceWorkerRegistrationPromise = navigator.serviceWorker
        .register('/sw.js?v=2252', { scope: '/', updateViaCache: 'none' })
        .then(function(registration) {
            registration.update().catch(function() {});
            return registration;
        })
        .catch(function(error) {
            console.warn('Service Worker registration failed:', error);
            return null;
        });

    navigator.serviceWorker.addEventListener('controllerchange', function() {
        if (window.matchMedia('(display-mode: standalone)').matches) return;
        if (sessionStorage.getItem('dag_sw_reloaded_2252') === '1') return;
        sessionStorage.setItem('dag_sw_reloaded_2252', '1');
        window.location.reload();
    });
}

// --- GLOBAL VARIABLES ---
let currentUser = null;
let nativeApiReachable = true;
let isRegMode = false; 
let playlists = []; 
let playlist = []; 
let searchPlaylistCache = []; 
let currentIndex = -1;
// Browsing UI lists must not change the current playback context.
let playbackPlaylist = [];
let playbackTab = 'search';
let playbackWanted = false;
const PLAYBACK_QUEUE_KEY = 'dag_playback_queue_v1';
let playbackQueue = [];
try { const data = JSON.parse(localStorage.getItem(PLAYBACK_QUEUE_KEY) || '[]');
    if (Array.isArray(data)) playbackQueue = data.filter(t => t?.url).slice(0, 50);
} catch (e) {}
let lastManualPauseAt = 0;
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
if (mainAudio) {
    mainAudio.preload = 'auto';
    // Для обычного HTML5-воспроизведения crossOrigin не нужен: весь внешний
    // звук и так идёт через наш proxy.php. На старых Android/WebView этот флаг
    // способен ломать локальные file/content URL и добавлять лишнюю CORS-проверку.
    mainAudio.removeAttribute('crossorigin');
}

const AUDIO_COMPAT_PROFILE = (function() {
    const ua = navigator.userAgent || '';
    const androidMatch = ua.match(/Android\s+(\d+)(?:\.(\d+))?/i);
    const androidMajor = androidMatch ? Number(androidMatch[1]) : 0;
    const android = /Android/i.test(ua);
    const webView = android && (/\bwv\b/i.test(ua) || /;\s*wv\)/i.test(ua) ||
        (/Version\/4\.0/i.test(ua) && /Chrome\//i.test(ua)));
    // Большая часть автомагнитол работает либо на старом Android, либо на
    // системном WebView. Здесь приоритет — надёжный HTML5 Audio без WebAudio.
    // Old Android WebViews need an immediate full (200) stream and shorter retry.
    // Modern CC3 WebViews should keep HTTP byte ranges: full 200 on every start
    // blocks efficient seeking and forces whole-file refetch on reconnect.
    const chromeMatch = ua.match(/(?:Chrome|Chromium)\/(\d+)/i);
    const chromeMajor = chromeMatch ? Number(chromeMatch[1]) : 0;
    const fullFileFallback = android && ((androidMajor > 0 && androidMajor <= 9) ||
        (webView && chromeMajor > 0 && chromeMajor < 92));
    // Keep the EQ guard on all WebViews: WebAudio can break their media element.
    const legacyAndroid = android && (webView || (androidMajor > 0 && androidMajor <= 10));
    return { android, androidMajor, webView, legacyAndroid, fullFileFallback };
})();

function requestAudioPlay() {
    try {
        const result = mainAudio.play();
        // Старые WebView (особенно магнитолы) возвращают undefined вместо Promise.
        if (result && typeof result.then === 'function') return result;
        return Promise.resolve();
    } catch (error) {
        return Promise.reject(error);
    }
}

function clearPlaybackWatchdog() {
    if (playWatchdog) {
        clearTimeout(playWatchdog);
        playWatchdog = null;
    }
}

function armPlaybackWatchdog(token, reason) {
    clearPlaybackWatchdog();
    if (!playbackWanted) return;
    const net = getNetworkProfile();
    let timeout = net.veryWeak ? 60000 : (net.weak ? 45000 : 25000);

    if (AUDIO_COMPAT_PROFILE.fullFileFallback) {
        // На действительно старой магнитоле не крутим загрузку десятки секунд:
        // быстро переходим на совместимый no-Range поток.
        timeout = net.weak ? 18000 : 12000;
    }

    playWatchdog = setTimeout(function() {
        if (token !== currentPlaybackToken || mainAudio.ended || !playbackWanted) return;
        if (mainAudio.readyState < 3 || mainAudio.currentTime <= 0) {
            // Если playbackWanted=true, пользователь не нажимал паузу.
            // Зависший WebView иногда выставляет paused=true самостоятельно.
            recoverCurrentStream(reason || 'startup-timeout');
        }
    }, timeout);
}

const connectionInfo = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

// --- DAGSTUDIO SOUND / ЭКВАЛАЙЗЕР ---
const EQ_STORAGE_KEY = 'dag_equalizer_v1';
const EQ_BANDS = [
    { f: 60, label: '60 Гц', type: 'lowshelf' },
    { f: 150, label: '150 Гц', type: 'peaking' },
    { f: 400, label: '400 Гц', type: 'peaking' },
    { f: 1000, label: '1 кГц', type: 'peaking' },
    { f: 2400, label: '2.4 кГц', type: 'peaking' },
    { f: 6000, label: '6 кГц', type: 'peaking' },
    { f: 12000, label: '12 кГц', type: 'highshelf' }
];
const EQ_PRESETS = {
    flat:    { label: 'Ровный', gains: [0, 0, 0, 0, 0, 0, 0] },
    bass:    { label: 'Бас', gains: [7, 5, 2, 0, -1, -2, -2] },
    vocal:   { label: 'Вокал', gains: [-2, -1, 0, 3, 5, 3, 1] },
    rock:    { label: 'Рок', gains: [4, 2, -1, 1, 3, 4, 3] },
    electro: { label: 'Электро', gains: [6, 4, 0, -1, 2, 5, 6] }
};

let eqState = {
    enabled: true,
    preset: 'flat',
    gains: [...EQ_PRESETS.flat.gains]
};
let eqAudioContext = null;
let eqSourceNode = null;
let eqFilters = [];
let eqMasterGain = null;
let eqGraphReady = false;
let eqGraphFailed = false;

function loadEqualizerState() {
    try {
        const saved = JSON.parse(localStorage.getItem(EQ_STORAGE_KEY) || 'null');
        if (saved && Array.isArray(saved.gains) && saved.gains.length === EQ_BANDS.length) {
            eqState.enabled = saved.enabled !== false;
            eqState.preset = saved.preset || 'custom';
            eqState.gains = saved.gains.map(value => Math.max(-12, Math.min(12, Number(value) || 0)));
        }
    } catch (error) {}
}
loadEqualizerState();

function saveEqualizerState() {
    try {
        localStorage.setItem(EQ_STORAGE_KEY, JSON.stringify(eqState));
    } catch (error) {}
}

function applyEqualizerState() {
    if (!eqGraphReady || !eqFilters.length) return;
    eqFilters.forEach((filter, index) => {
        const gain = eqState.enabled ? Number(eqState.gains[index] || 0) : 0;
        try {
            filter.gain.setTargetAtTime(gain, eqAudioContext.currentTime, 0.025);
        } catch (error) {
            filter.gain.value = gain;
        }
    });
    if (eqMasterGain) {
        const activeBoost = eqState.enabled ? Math.max(...eqState.gains, 0) : 0;
        const compensation = activeBoost >= 6 ? 0.72 : (activeBoost >= 3 ? 0.84 : 0.96);
        try {
            eqMasterGain.gain.setTargetAtTime(compensation, eqAudioContext.currentTime, 0.025);
        } catch (error) {
            eqMasterGain.gain.value = compensation;
        }
    }
}

async function ensureEqualizerGraph() {
    if (!mainAudio || eqGraphFailed) return false;

    // Не подключаем MediaElementSource на старых Android/WebView. Если создание
    // WebAudio-графа там завершится наполовину, <audio> может стать полностью
    // беззвучным до перезагрузки страницы.
    if (AUDIO_COMPAT_PROFILE.legacyAndroid) {
        eqGraphFailed = true;
        return false;
    }
    if (eqGraphReady && eqAudioContext) {
        if (eqAudioContext.state === 'suspended') {
            try { await eqAudioContext.resume(); } catch (error) {}
        }
        return true;
    }

    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
        eqGraphFailed = true;
        return false;
    }

    try {
        eqAudioContext = new AudioContextCtor();
        eqSourceNode = eqAudioContext.createMediaElementSource(mainAudio);
        eqFilters = EQ_BANDS.map((band) => {
            const filter = eqAudioContext.createBiquadFilter();
            filter.type = band.type;
            filter.frequency.value = band.f;
            if (band.type === 'peaking') filter.Q.value = 1.05;
            filter.gain.value = 0;
            return filter;
        });
        eqMasterGain = eqAudioContext.createGain();
        eqMasterGain.gain.value = 0.96;

        let node = eqSourceNode;
        eqFilters.forEach((filter) => {
            node.connect(filter);
            node = filter;
        });
        node.connect(eqMasterGain);
        eqMasterGain.connect(eqAudioContext.destination);

        eqGraphReady = true;
        applyEqualizerState();

        if (eqAudioContext.state === 'suspended') {
            try { await eqAudioContext.resume(); } catch (error) {}
        }
        return true;
    } catch (error) {
        console.warn('Equalizer unavailable:', error);
        eqGraphFailed = true;
        return false;
    }
}

function renderEqualizer() {
    const bands = document.getElementById('eq-bands');
    const power = document.getElementById('eq-power-btn');
    if (!bands || !power) return;

    power.classList.toggle('active', !!eqState.enabled);
    power.setAttribute('aria-pressed', eqState.enabled ? 'true' : 'false');

    bands.innerHTML = '';
    EQ_BANDS.forEach((band, index) => {
        const row = document.createElement('div');
        row.className = 'eq-band';

        const label = document.createElement('div');
        label.className = 'eq-band-label';
        label.textContent = band.label;

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '-12';
        slider.max = '12';
        slider.step = '1';
        slider.value = String(eqState.gains[index] || 0);
        slider.className = 'eq-slider';
        slider.dataset.eqIndex = String(index);

        const value = document.createElement('div');
        value.className = 'eq-band-value';
        const renderValue = () => {
            const num = Number(slider.value || 0);
            value.textContent = (num > 0 ? '+' : '') + num + ' дБ';
        };
        renderValue();

        slider.addEventListener('input', async () => {
            eqState.gains[index] = Number(slider.value || 0);
            eqState.preset = 'custom';
            renderValue();
            saveEqualizerState();
            updateEqualizerPresetButtons();
            await ensureEqualizerGraph();
            applyEqualizerState();
        });

        row.appendChild(label);
        row.appendChild(slider);
        row.appendChild(value);
        bands.appendChild(row);
    });

    updateEqualizerPresetButtons();
}

function updateEqualizerPresetButtons() {
    document.querySelectorAll('[data-eq-preset]').forEach((button) => {
        button.classList.toggle('active', button.dataset.eqPreset === eqState.preset);
    });
}

window.openEqualizer = async function() {
    closeModal('menu-modal');
    renderEqualizer();
    document.getElementById('equalizer-modal').classList.add('show');
    const ok = await ensureEqualizerGraph();
    if (!ok) {
        showNotification('Эквалайзер не поддерживается этим браузером или устройством.');
    }
};

window.toggleEqualizerPower = async function() {
    eqState.enabled = !eqState.enabled;
    saveEqualizerState();
    renderEqualizer();
    await ensureEqualizerGraph();
    applyEqualizerState();
};

window.resetEqualizer = async function() {
    eqState = { enabled: true, preset: 'flat', gains: [...EQ_PRESETS.flat.gains] };
    saveEqualizerState();
    renderEqualizer();
    await ensureEqualizerGraph();
    applyEqualizerState();
};

document.addEventListener('click', async function(event) {
    const button = event.target.closest('[data-eq-preset]');
    if (!button) return;
    const preset = EQ_PRESETS[button.dataset.eqPreset];
    if (!preset) return;
    eqState.enabled = true;
    eqState.preset = button.dataset.eqPreset;
    eqState.gains = [...preset.gains];
    saveEqualizerState();
    renderEqualizer();
    await ensureEqualizerGraph();
    applyEqualizerState();
});


// В старых Android WebView Network Information API может отсутствовать.
// После реального зависания временно используем профиль слабой сети.
let inferredWeakNetworkUntil = 0;
function getNetworkProfile() {
    const info = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const effectiveType = info && info.effectiveType ? String(info.effectiveType) : '';
    const downlink = info && Number(info.downlink) > 0 ? Number(info.downlink) : 0;
    const rtt = info && Number(info.rtt) > 0 ? Number(info.rtt) : 0;
    const saveData = !!(info && info.saveData);
    const offline = navigator.onLine === false;
    const inferredWeak = Date.now() < inferredWeakNetworkUntil;
    const weak = inferredWeak || offline || saveData || effectiveType === 'slow-2g' || effectiveType === '2g' ||
        (downlink > 0 && downlink < 1.5) || (rtt > 0 && rtt >= 700);
    const veryWeak = offline || effectiveType === 'slow-2g' ||
        (downlink > 0 && downlink < 0.55) || (rtt > 0 && rtt >= 1400);
    return { effectiveType, downlink, rtt, saveData, offline, weak, veryWeak, inferredWeak };
}

function isWeakConnection() {
    return getNetworkProfile().weak;
}

function buildProxyUrl(trackOrUrl, options = {}) {
    const track = typeof trackOrUrl === 'string' ? { url: trackOrUrl } : (trackOrUrl || {});
    const resolvedUrl = resolveMediaUrl(track.url);
    if (!resolvedUrl) return '';

    // Файлы, загруженные самим пользователем на pl.dagstudio.ru,
    // в нативном приложении можно воспроизводить напрямую.
    if (isDagServerMedia(resolvedUrl)) return resolvedUrl;

    const params = new URLSearchParams();
    params.set('url', resolvedUrl);
    if (track.source) {
        const normalizedSource = String(track.source).replace(/[^A-Za-z0-9_]/g, '');
        if (normalizedSource) params.set('source', normalizedSource);
    }
    if (options.weak || isWeakConnection()) params.set('weak', '1');
    if (options.norange) params.set('norange', '1');
    if (options.retry) params.set('retry', String(options.retry));
    return appServerUrl('/proxy.php?' + params.toString());
}
const titleEl = document.getElementById('track-title'); 
const artistEl = document.getElementById('track-artist'); 
const listEl = document.getElementById('playlist-container');
const progCurrent = document.getElementById('prog-current'); 
const progBuffer = document.getElementById('prog-buffer'); 
const currTimeEl = document.getElementById('curr-time'); 
const durTimeEl = document.getElementById('dur-time');

// --- УМНОЕ ЦЕЛЕВОЕ КЭШИРОВАНИЕ ---
const NATIVE_AUDIO_INDEX_KEY = 'dag_native_audio_index_v1';
const LOCAL_PLAYLISTS_PREFIX = 'dag_offline_playlists_v2:';
const LEGACY_LOCAL_PLAYLISTS_PREFIX = 'dag_offline_playlists_v1:';
const LAST_NATIVE_USER_KEY = 'dag_last_native_user';
const LAST_DEVICE_USER_KEY = 'dag_last_device_user';

function showDeviceCacheStatus() {
    const label = document.getElementById('device-cache-status');
    if (!label) return;
    if (!currentUser) {
        label.textContent = 'Кэш создаётся отдельно на каждом устройстве после входа в аккаунт.';
        return;
    }
    const all = playlists.reduce((count, pl) => count + (Array.isArray(pl.tracks) ? pl.tracks.length : 0), 0);
    if (IS_NATIVE_APP) {
        const owner = currentCacheOwner();
        const files = Object.values(readNativeAudioIndex()).filter(item =>
            item && item.path && Array.isArray(item.owners) && item.owners.includes(owner));
        label.textContent = 'На этом устройстве: ' + files.length + ' из ' + all +
            ' треков в локальном кэше. На новом устройстве загрузка выполняется заново.';
    } else {
        label.textContent = 'Библиотека: ' + all +
            ' треков. Офлайн-кэш браузера хранится только на этом устройстве.';
    }
}

const nativeCacheQueue = [];
const nativeCacheQueuedUrls = new Set();
let nativeCacheWorkerRunning = false;
let nativeCacheRetryTimer = null;

const webCacheQueue = [];
const webCacheQueuedUrls = new Set();
let webCacheWorkerRunning = false;
let webCacheRetryTimer = null;

// Один сетевой запрос плейлистов за раз. Повтор при ошибке с увеличением интервала.
let playlistSyncPromise = null;
let playlistSyncTimer = null;
let playlistSyncErrors = 0;
let playlistSnapshotOwner = '';

function updatePlaylistSyncStatus(state, text) {
    const el = document.getElementById('playlist-sync-status');
    if (!el) return;
    el.dataset.state = state;
    el.textContent = text;
}
function retryPlaylistSyncLater() {
    if (!currentUser || playlistSyncTimer || navigator.onLine === false) return;
    const delay = Math.min(120000, 8000 * Math.pow(2, Math.min(4, playlistSyncErrors++)));
    playlistSyncTimer = setTimeout(function() {
        playlistSyncTimer = null;
        if (currentUser && navigator.onLine !== false) loadUserData(true).catch(console.warn);
    }, delay);
}

function normalizeCacheTrack(trackOrUrl) {
    if (typeof trackOrUrl === 'string') {
        return { url: trackOrUrl, title: '', artist: '', thumb: '', source: '' };
    }
    const track = trackOrUrl || {};
    return {
        url: track.url || track.file || '',
        title: track.title || '',
        artist: track.artist || '',
        thumb: track.thumb || '',
        source: track.source || ''
    };
}

function canonicalTrackUrl(trackOrUrl) {
    const track = normalizeCacheTrack(trackOrUrl);
    return resolveMediaUrl(track.url);
}

function nativeAudioCacheBridge() {
    return IS_NATIVE_APP && window.DAG_NATIVE_BRIDGE && window.DAG_NATIVE_BRIDGE.audioCache
        ? window.DAG_NATIVE_BRIDGE.audioCache
        : null;
}

function readNativeAudioIndex() {
    try {
        const parsed = JSON.parse(localStorage.getItem(NATIVE_AUDIO_INDEX_KEY) || '{}');
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
        return {};
    }
}

function writeNativeAudioIndex(index) {
    try {
        localStorage.setItem(NATIVE_AUDIO_INDEX_KEY, JSON.stringify(index || {}));
    } catch (error) {}
}

function currentCacheOwner() {
    return String(
        currentUser ||
        localStorage.getItem(LAST_DEVICE_USER_KEY) ||
        localStorage.getItem(LAST_NATIVE_USER_KEY) ||
        'guest'
    );
}

function playlistSnapshotKey(username = currentUser) {
    return LOCAL_PLAYLISTS_PREFIX + String(username || 'guest');
}

function saveOfflinePlaylistsSnapshot(data) {
    if (!currentUser || !Array.isArray(data)) return;
    try {
        localStorage.setItem(playlistSnapshotKey(), JSON.stringify(data));
        localStorage.setItem(LAST_DEVICE_USER_KEY, String(currentUser));
    } catch (error) {}
}

function loadOfflinePlaylistsSnapshot(username = currentUser) {
    if (!username) return [];
    try {
        const currentKey = playlistSnapshotKey(username);
        let raw = localStorage.getItem(currentKey);

        // Перенос старого локального снимка нативного приложения без потери данных.
        if (raw === null) {
            raw = localStorage.getItem(LEGACY_LOCAL_PLAYLISTS_PREFIX + String(username));
            if (raw !== null) {
                try { localStorage.setItem(currentKey, raw); } catch (error) {}
            }
        }

        const parsed = JSON.parse(raw || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        return [];
    }
}

async function cacheKeyForUrl(url) {
    const value = String(url || '');
    try {
        const data = new TextEncoder().encode(value);
        const digest = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(digest))
            .map(byte => byte.toString(16).padStart(2, '0'))
            .join('');
    } catch (error) {
        let hash = 2166136261;
        for (let i = 0; i < value.length; i++) {
            hash ^= value.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(16).padStart(8, '0');
    }
}

function guessAudioExtension(url) {
    try {
        const pathname = new URL(String(url || ''), DAG_SERVER_ORIGIN).pathname.toLowerCase();
        const match = pathname.match(/\.([a-z0-9]{2,5})$/);
        const ext = match ? match[1] : '';
        return ['mp3','m4a','aac','ogg','opus','wav','flac','mp4','webm'].includes(ext) ? ext : 'mp3';
    } catch (error) {
        return 'mp3';
    }
}

function offlineDownloadUrl(trackOrUrl) {
    const track = normalizeCacheTrack(trackOrUrl);
    const resolved = resolveMediaUrl(track.url);
    if (!resolved) return '';
    if (isDagServerMedia(resolved)) return resolved;
    return buildProxyUrl(track, { norange: true, retry: 0 });
}

async function getNativeCachedAudio(trackOrUrl) {
    const bridge = nativeAudioCacheBridge();
    const resolved = canonicalTrackUrl(trackOrUrl);
    if (!bridge || !resolved) return null;

    const index = readNativeAudioIndex();
    const entry = index[resolved];
    if (!entry || !entry.path) return null;

    try {
        const file = await bridge.get({ path: entry.path });
        if (file && file.exists && file.webUrl) {
            // Older APKs could expose an unfinished download as a cache hit.
            // Reject files smaller than the indexed complete file size.
            const size = Number(file.size || 0);
            const expected = Number(entry.size || 0);
            if (size < 4096 || (expected >= 4096 && size + 1024 < expected)) {
                console.warn('Incomplete native cache entry ignored');
                throw new Error('Native audio cache size mismatch');
            }
            entry.lastAccessAt = Date.now();
            index[resolved] = entry;
            writeNativeAudioIndex(index);
            return {
                url: file.webUrl,
                isBlob: false,
                inCache: true,
                isNativeFile: true,
                path: entry.path,
                size: Number(file.size || entry.size || 0)
            };
        }
    } catch (error) {}

    delete index[resolved];
    writeNativeAudioIndex(index);
    return null;
}

async function storeNativeTrackNow(trackOrUrl, reason = 'played') {
    const bridge = nativeAudioCacheBridge();
    const track = normalizeCacheTrack(trackOrUrl);
    const resolved = canonicalTrackUrl(track);
    if (!bridge || !resolved || !/^https?:\/\//i.test(resolved)) return false;

    const existing = await getNativeCachedAudio(track);
    const index = readNativeAudioIndex();
    const owner = currentCacheOwner();

    if (existing) {
        const old = index[resolved] || {};
        const owners = Array.isArray(old.owners) ? old.owners : [];
        if (!owners.includes(owner)) owners.push(owner);
        index[resolved] = {
            ...old,
            url: resolved,
            title: track.title || old.title || '',
            artist: track.artist || old.artist || '',
            thumb: track.thumb || old.thumb || '',
            source: track.source || old.source || '',
            owners,
            reason: reason === 'playlist' ? 'playlist' : (old.reason || reason),
            lastPlayedAt: reason === 'played' ? Date.now() : Number(old.lastPlayedAt || 0),
            lastAccessAt: Date.now()
        };
        writeNativeAudioIndex(index);
        return true;
    }

    const downloadUrl = offlineDownloadUrl(track);
    if (!downloadUrl) return false;

    const key = await cacheKeyForUrl(resolved);
    const stored = await bridge.download({
        url: downloadUrl,
        key,
        extension: guessAudioExtension(resolved),
        forceRedownload: true,
        // Native FileTransfer receives no browser Network Information API on
        // many head units. Use the inferred weak-network state as well.
        weak: getNetworkProfile().weak
    });

    if (!stored || !stored.exists || !stored.path) return false;

    const latestIndex = readNativeAudioIndex();
    const old = latestIndex[resolved] || {};
    const owners = Array.isArray(old.owners) ? old.owners : [];
    if (!owners.includes(owner)) owners.push(owner);

    latestIndex[resolved] = {
        ...old,
        url: resolved,
        path: stored.path,
        size: Number(stored.size || 0),
        title: track.title || old.title || '',
        artist: track.artist || old.artist || '',
        thumb: track.thumb || old.thumb || '',
        source: track.source || old.source || '',
        owners,
        reason: reason === 'playlist' ? 'playlist' : (old.reason || reason),
        cachedAt: Date.now(),
        lastPlayedAt: reason === 'played' ? Date.now() : Number(old.lastPlayedAt || 0),
        lastAccessAt: Date.now()
    };
    writeNativeAudioIndex(latestIndex);
    showDeviceCacheStatus();
    return true;
}

// Следующий трек готовим только когда текущий файл уже целиком в буфере
// либо воспроизводится из локального кэша: не забираем скорость у текущего трека.
let nextTrackPrefetchKey = '';
function isCurrentTrackFullyReady() {
    const active = playbackPlaylist[currentIndex];
    if (!active || mainAudio.paused || mainAudio.ended) return false;
    if (active._playingFromCache) return true;
    const duration = Number(mainAudio.duration);
    if (!Number.isFinite(duration) || duration <= 0) return false;
    try {
        const buffered = mainAudio.buffered;
        for (let i = 0; i < buffered.length; i++) {
            if (buffered.start(i) <= 1 && buffered.end(i) >= duration - 1.5) return true;
        }
    } catch (error) {}
    return false;
}

function maybePrecacheNextTrack() {
    if (!isCurrentTrackFullyReady() || navigator.onLine === false || isShuffle ||
        !Array.isArray(playlist) || playlist.length < 2) return;
    const nextIndex = isRepeat ? currentIndex : (currentIndex + 1) % playlist.length;
    const nextTrack = playlist[nextIndex];
    if (!nextTrack || !isRemoteMediaUrl(nextTrack.url)) return;
    const key = String(currentPlaybackToken) + ':' + nextIndex + ':' + canonicalTrackUrl(nextTrack);
    if (nextTrackPrefetchKey === key) return;
    nextTrackPrefetchKey = key;
    cacheTrackSilently(nextTrack, { reason: 'next', priority: true });
}

function scheduleNativeCacheWorker(delay = 0) {
    if (IS_NATIVE_APP && window.DAG_CAR_APP_ACTIVE === false) return;
    clearTimeout(nativeCacheRetryTimer);
    nativeCacheRetryTimer = setTimeout(function() {
        processNativeCacheQueue();
    }, Math.max(0, delay));
}

function enqueueNativeTrackCache(trackOrUrl, reason = 'played', priority = false) {
    if (!IS_NATIVE_APP || !nativeAudioCacheBridge()) return;

    const track = normalizeCacheTrack(trackOrUrl);
    const resolved = canonicalTrackUrl(track);
    if (!resolved) return;
    if (nativeCacheQueuedUrls.has(resolved)) {
        if (reason === 'next' || reason === 'paused-current') {
            const index = nativeCacheQueue.findIndex(job => job.resolved === resolved);
            if (index >= 0) {
                const job = nativeCacheQueue.splice(index, 1)[0];
                job.reason = reason;
                nativeCacheQueue.unshift(job);
                scheduleNativeCacheWorker(0);
            }
        }
        return;
    }

    // Ограничиваем число задач в RAM на TEYES; текущий/следующий трек не блокируем.
    if (IS_NATIVE_APP && reason === 'playlist' && nativeCacheQueue.length >= 80) return;
    nativeCacheQueuedUrls.add(resolved);
    const job = { track, reason, attempts: 0, resolved };
    if (priority) nativeCacheQueue.unshift(job);
    else nativeCacheQueue.push(job);
    scheduleNativeCacheWorker(0);
}

async function processNativeCacheQueue() {
    if (!IS_NATIVE_APP || nativeCacheWorkerRunning || !nativeAudioCacheBridge() ||
        window.DAG_CAR_APP_ACTIVE === false) return;
    if (navigator.onLine === false) return;

    if (!playbackWanted && Date.now() - lastManualPauseAt < 90000 &&
        nativeCacheQueue[0]?.reason !== 'paused-current') {
        scheduleNativeCacheWorker(90000 - (Date.now() - lastManualPauseAt));
        return;
    }
    if (mainAudio && !mainAudio.paused && !isCurrentTrackFullyReady()) {
        scheduleNativeCacheWorker(15000);
        return;
    }

    nativeCacheWorkerRunning = true;
    try {
        while (nativeCacheQueue.length > 0 && navigator.onLine !== false &&
            window.DAG_CAR_APP_ACTIVE !== false) {
            if (mainAudio && !mainAudio.paused && !isCurrentTrackFullyReady()) {
                scheduleNativeCacheWorker(15000);
                break;
            }

            const job = nativeCacheQueue.shift();
            if (!job) break;
            if (mainAudio && !mainAudio.paused && job.reason !== 'next') {
                nativeCacheQueue.unshift(job);
                scheduleNativeCacheWorker(15000);
                break;
            }

            try {
                if (!await storeNativeTrackNow(job.track, job.reason)) throw new Error('Файл не сохранён');
                nativeCacheQueuedUrls.delete(job.resolved);
                if (job.reason === 'paused-current') notifyPausedCacheReady(job.track);
            } catch (error) {
                job.attempts += 1;
                if (job.attempts < 5) {
                    nativeCacheQueue.push(job);
                    scheduleNativeCacheWorker(Math.min(90000, 6000 * Math.pow(2, job.attempts)));
                    break;
                }
                nativeCacheQueuedUrls.delete(job.resolved);
                console.warn('Audio cache download failed:', job.resolved, error);
            }
        }
    } finally {
        nativeCacheWorkerRunning = false;
    }
}

function scheduleWebCacheWorker(delay = 0) {
    clearTimeout(webCacheRetryTimer);
    webCacheRetryTimer = setTimeout(function() {
        processWebCacheQueue();
    }, Math.max(0, delay));
}

function enqueueWebTrackCache(trackOrUrl, reason = 'playlist', priority = false) {
    if (IS_NATIVE_APP || !('caches' in window)) return;

    const track = normalizeCacheTrack(trackOrUrl);
    const resolved = canonicalTrackUrl(track);
    if (!resolved || !/^https?:\/\//i.test(resolved)) return;
    if (webCacheQueuedUrls.has(resolved)) {
        if (reason === 'next' || reason === 'paused-current') {
            const index = webCacheQueue.findIndex(job => job.resolved === resolved);
            if (index >= 0) {
                const job = webCacheQueue.splice(index, 1)[0];
                job.reason = reason;
                webCacheQueue.unshift(job);
                scheduleWebCacheWorker(0);
            }
        }
        return;
    }

    webCacheQueuedUrls.add(resolved);
    const job = { track, reason, attempts: 0, resolved };
    if (priority) webCacheQueue.unshift(job);
    else webCacheQueue.push(job);
    scheduleWebCacheWorker(priority ? 0 : 400);
}

async function webTrackAlreadyCached(trackOrUrl) {
    if (!('caches' in window)) return false;
    const track = normalizeCacheTrack(trackOrUrl);
    const resolved = canonicalTrackUrl(track);
    if (!resolved) return false;

    try {
        const cache = await caches.open('dag-audio-cache');
        const candidates = [];
        if (isDagServerMedia(resolved)) candidates.push(resolved);
        if (shouldProxyMedia(track)) {
            candidates.push(buildProxyUrl(track, { norange: true }));
            candidates.push(buildProxyUrl(track));
            candidates.push(buildProxyUrl(track, { weak: true }));
        }

        for (const key of candidates) {
            if (key && await cache.match(key)) return true;
        }
    } catch (error) {}
    return false;
}

async function processWebCacheQueue() {
    if (IS_NATIVE_APP || webCacheWorkerRunning || !('caches' in window)) return;
    if (navigator.onLine === false) return;

    // Кэширование плейлистов никогда не должно мешать текущему воспроизведению.
    if (!playbackWanted && Date.now() - lastManualPauseAt < 90000 &&
        webCacheQueue[0]?.reason !== 'paused-current') {
        scheduleWebCacheWorker(90000 - (Date.now() - lastManualPauseAt));
        return;
    }
    if (mainAudio && !mainAudio.paused && !isCurrentTrackFullyReady()) {
        scheduleWebCacheWorker(12000);
        return;
    }

    webCacheWorkerRunning = true;
    try {
        while (webCacheQueue.length > 0 && navigator.onLine !== false) {
            if (mainAudio && !mainAudio.paused && !isCurrentTrackFullyReady()) {
                scheduleWebCacheWorker(12000);
                break;
            }

            const job = webCacheQueue.shift();
            if (!job) break;
            if (mainAudio && !mainAudio.paused && job.reason !== 'next') {
                webCacheQueue.unshift(job);
                scheduleWebCacheWorker(12000);
                break;
            }

            try {
                if (!await webTrackAlreadyCached(job.track)) {
                    const resolved = canonicalTrackUrl(job.track);
                    const cacheUrl = isDagServerMedia(resolved)
                        ? resolved
                        : buildProxyUrl(job.track, { norange: true });

                    const response = await fetch(cacheUrl, {
                        cache: 'no-store',
                        credentials: 'same-origin'
                    });

                    // Кэшируем только целый аудиофайл, а не частичный Range или HTML-ошибку.
                    const mime = (response.headers.get('content-type') || '').toLowerCase();
                    if (!response.ok || response.status !== 200 ||
                        /text\/html|application\/json|text\/plain/.test(mime)) {
                        throw new Error('Некорректный аудиопоток: HTTP ' + response.status);
                    }

                    // Read the complete body first. CacheStorage must never see
                    // a truncated response after a radio handover.
                    const blob = await response.blob();
                    const expected = Number(response.headers.get('content-length') || 0);
                    if (blob.size < 4096 || (expected > 0 && blob.size + 1024 < expected)) {
                        throw new Error('Незавершённая загрузка аудио');
                    }
                    const cache = await caches.open('dag-audio-cache');
                    await cache.put(cacheUrl, new Response(blob, {
                        status: 200, headers: response.headers
                    }));
                }

                webCacheQueuedUrls.delete(job.resolved);
                if (job.reason === 'paused-current') notifyPausedCacheReady(job.track);

                // На слабой сети качаем строго по одному треку и даём каналу передышку.
                if (getNetworkProfile().weak) {
                    scheduleWebCacheWorker(2500);
                    break;
                }
            } catch (error) {
                job.attempts += 1;
                if (job.attempts < 5) {
                    webCacheQueue.push(job);
                    scheduleWebCacheWorker(Math.min(90000, 5000 * Math.pow(2, job.attempts)));
                    break;
                }
                webCacheQueuedUrls.delete(job.resolved);
                console.warn('PWA audio cache download failed:', job.resolved, error);
            }
        }
    } finally {
        webCacheWorkerRunning = false;
    }
}

async function cacheTrackSilently(trackOrUrl, options = {}) {
    const track = normalizeCacheTrack(trackOrUrl);
    const resolvedUrl = canonicalTrackUrl(track);
    if (!resolvedUrl || !/^https?:\/\//i.test(resolvedUrl) || navigator.onLine === false) return;

    if (IS_NATIVE_APP) {
        enqueueNativeTrackCache(track, options.reason || 'played', !!options.priority);
        return;
    }

    if (!('caches' in window)) return;

    // В PWA всегда используем одну последовательную очередь: так фоновая
    // синхронизация не забивает слабый интернет магнитолы параллельными загрузками.
    enqueueWebTrackCache(track, options.reason || 'played', !!options.priority);
}

async function getDeviceCachedAudio(trackOrUrl) {
    const track = normalizeCacheTrack(trackOrUrl);
    const resolvedUrl = canonicalTrackUrl(track);
    if (!resolvedUrl) return { url: resolvedUrl, isBlob: false, inCache: false };

    if (IS_NATIVE_APP) {
        const nativeCached = await getNativeCachedAudio(track);
        if (nativeCached) return nativeCached;

        return {
            url: shouldProxyMedia(track)
                ? buildProxyUrl(track, { weak: isWeakConnection() })
                : resolvedUrl,
            isBlob: false,
            inCache: false
        };
    }

    if (!/^https?:\/\//i.test(resolvedUrl)) {
        return { url: resolvedUrl, isBlob: false, inCache: false };
    }

    if ('caches' in window) {
        try {
            const cache = await caches.open('dag-audio-cache');
            const direct = isDagServerMedia(resolvedUrl) ? resolvedUrl : '';
            const noRangeProxy = buildProxyUrl(track, { norange: true });
            const normalProxy = buildProxyUrl(track);
            const weakProxy = buildProxyUrl(track, { weak: true });
            const res = (direct ? await cache.match(direct) : null) ||
                (noRangeProxy ? await cache.match(noRangeProxy) : null) ||
                (await cache.match(normalProxy)) ||
                (await cache.match(weakProxy));
            if (res) {
                const blob = await res.blob();
                const expected = Number(res.headers.get('content-length') || 0);
                if (blob.size >= 4096 && (!expected || blob.size + 1024 >= expected)) {
                    return { url: URL.createObjectURL(blob), isBlob: true, inCache: true };
                }
                console.warn('Incomplete PWA audio cache entry ignored');
            }
        } catch(e) {}
    }

    return {
        url: shouldProxyMedia(track)
            ? buildProxyUrl(track, { weak: isWeakConnection() })
            : resolvedUrl,
        isBlob: false,
        inCache: false
    };
}

function isUrlStillInAnyPlaylist(trackOrUrl) {
    const resolved = canonicalTrackUrl(trackOrUrl);
    if (!resolved) return false;
    return playlists.some(pl => Array.isArray(pl.tracks) &&
        pl.tracks.some(track => canonicalTrackUrl(track) === resolved));
}

async function deleteDeviceCachedTrack(trackOrUrl, force = false) {
    const track = normalizeCacheTrack(trackOrUrl);
    const resolved = canonicalTrackUrl(track);
    if (!resolved) return false;

    if (!force && isUrlStillInAnyPlaylist(track)) return false;

    if (IS_NATIVE_APP) {
        const bridge = nativeAudioCacheBridge();
        const index = readNativeAudioIndex();
        const entry = index[resolved];

        if (entry) {
            const owner = currentCacheOwner();
            const owners = Array.isArray(entry.owners) ? entry.owners : [];
            const remainingOwners = owners.filter(item => item !== owner);

            if (!force && remainingOwners.length > 0) {
                entry.owners = remainingOwners;
                index[resolved] = entry;
                writeNativeAudioIndex(index);
                return false;
            }

            if (bridge && entry.path) {
                try { await bridge.delete({ path: entry.path }); } catch (error) {}
            }
        }

        delete index[resolved];
        writeNativeAudioIndex(index);
        return true;
    }

    if ('caches' in window) {
        try {
            const cache = await caches.open('dag-audio-cache');
            await cache.delete(resolved);
            await cache.delete(buildProxyUrl(track));
            await cache.delete(buildProxyUrl(track, { weak: true }));
            await cache.delete(buildProxyUrl(track, { norange: true }));
        } catch (error) {}
    }
    return true;
}

function syncPlaylistOfflineCache() {
    if (navigator.onLine === false) return;

    // Просим браузер хранить кэш устойчивее к автоматической очистке.
    if (!IS_NATIVE_APP && navigator.storage && typeof navigator.storage.persist === 'function') {
        navigator.storage.persist().catch(function() {});
    }

    const seen = new Set();
    playlists.forEach(pl => {
        (pl.tracks || []).forEach(track => {
            const resolved = canonicalTrackUrl(track);
            if (!resolved || seen.has(resolved)) return;
            seen.add(resolved);

            if (IS_NATIVE_APP) {
                enqueueNativeTrackCache(track, 'playlist', false);
            } else {
                enqueueWebTrackCache(track, 'playlist', false);
            }
        });
    });
}

function getOfflineCachedTracks() {
    if (!IS_NATIVE_APP) return [];
    const owner = currentCacheOwner();
    const index = readNativeAudioIndex();

    return Object.values(index)
        .filter(entry => {
            if (!entry || !entry.url || !entry.path) return false;
            const owners = Array.isArray(entry.owners) ? entry.owners : [];
            return owners.includes(owner);
        })
        .sort((a, b) =>
            Number(b.lastPlayedAt || b.lastAccessAt || b.cachedAt || 0) -
            Number(a.lastPlayedAt || a.lastAccessAt || a.cachedAt || 0)
        )
        .map(entry => ({
            title: entry.title || 'Сохранённый трек',
            artist: entry.artist || 'DAGSTUDIO',
            url: entry.url,
            thumb: entry.thumb || '',
            source: entry.source || 'OFFLINE',
            type: 'audio',
            _offlineCached: true
        }));
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
    const downloadUrl = appServerUrl(`/download.php?url=${encodeURIComponent(resolveMediaUrl(track.url))}&title=${encodeURIComponent(safeTitle)}`);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.setAttribute('download', safeTitle + '.mp3'); 
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
};

// --- УСТАНОВКА ПРИЛОЖЕНИЯ (PWA) ---
// Надёжная схема: используем только фактически поддерживаемый браузером
// beforeinstallprompt. Экспериментальные install API намеренно не используем.
let defPrompt = null;
let appInstalledThisSession = false;
let installBusy = false;

const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
              (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = /Android/i.test(navigator.userAgent);

function isAppStandalone() {
    return IS_NATIVE_APP || appInstalledThisSession ||
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

    if (isAppStandalone()) {
        btn.style.display = 'none';
        btn.disabled = true;
        return;
    }

    btn.style.display = '';
    btn.disabled = installBusy;
    btn.style.opacity = installBusy ? '0.7' : '1';
    btn.innerHTML = installBusy
        ? '<i class="fas fa-spinner fa-spin"></i> Открываем установку...'
        : '<i class="fas fa-mobile-screen-button"></i> Установить приложение';
}

function showInstallHelpForCurrentBrowser() {
    const info = getBrowserInfo();

    if (isIOS) {
        const iosModal = document.getElementById('ios-modal');
        if (iosModal) iosModal.classList.add('show');
        return;
    }

    const help = document.getElementById('install-help-text');
    const modal = document.getElementById('android-modal');
    if (!help || !modal) {
        showNotification('Используйте команду установки в меню браузера.');
        return;
    }

    if (info.yandex && isAndroid) {
        help.innerHTML =
            '<b>Яндекс Браузер не передал странице системный install prompt.</b><br><br>' +
            'Нажмите меню браузера <b>⋮</b> → <b>«Добавить ярлык»</b> / <b>«Добавить на домашний экран»</b> → <b>«Добавить»</b>.';
    } else if (info.yandex && (info.windows || info.mac || info.linux)) {
        help.innerHTML =
            '<b>Установка в Яндекс Браузере выполняется через Умную строку.</b><br><br>' +
            'Справа в Умной строке выберите <b>«Установить как приложение»</b> и подтвердите установку.';
    } else if (info.androidWebView) {
        help.innerHTML =
            '<b>Встроенный браузер Android / WebView не даёт сайту системный install prompt.</b><br><br>' +
            'Откройте pl.dagstudio.ru в Chrome, Edge, Яндекс Браузере или Samsung Internet.';
    } else if (info.safari && info.mac) {
        help.innerHTML = 'В Safari выберите <b>Файл → Добавить в Dock</b>.';
    } else if (info.firefox && (info.windows || info.mac || info.linux)) {
        help.innerHTML =
            'Firefox на компьютере не предоставляет системный PWA install prompt. ' +
            'Используйте Chrome, Edge или функцию установки сайта в самом браузере.';
    } else if (isAndroid) {
        help.innerHTML =
            'Откройте меню браузера <b>⋮</b> и выберите <b>«Установить приложение»</b> или <b>«Добавить на главный экран»</b>.';
    } else {
        help.innerHTML =
            'Браузер не передал странице системный install prompt. Используйте встроенную команду браузера ' +
            '<b>«Установить приложение»</b> / <b>«Добавить сайт как приложение»</b>.';
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
    installBusy = false;
    setInstallButtonState();
});

const standaloneMedia = window.matchMedia('(display-mode: standalone)');
if (standaloneMedia && typeof standaloneMedia.addEventListener === 'function') {
    standaloneMedia.addEventListener('change', setInstallButtonState);
}

window.triggerInstall = async function() {
    if (installBusy || isAppStandalone()) {
        setInstallButtonState();
        return;
    }

    if (isIOS) {
        closeModal('menu-modal');
        showInstallHelpForCurrentBrowser();
        return;
    }

    if (!defPrompt) {
        closeModal('menu-modal');
        showInstallHelpForCurrentBrowser();
        return;
    }

    installBusy = true;
    setInstallButtonState();

    const promptEvent = defPrompt;
    defPrompt = null;

    // prompt() вызывается непосредственно из пользовательского клика.
    closeModal('menu-modal');

    try {
        const result = await promptEvent.prompt();
        let choice = result && result.outcome ? result : null;

        if (!choice && promptEvent.userChoice) {
            choice = await promptEvent.userChoice;
        }

        if (choice && choice.outcome === 'accepted') {
            // appinstalled скроет кнопку после фактической установки.
        }
    } catch (error) {
        console.warn('PWA install prompt failed:', error);
        showInstallHelpForCurrentBrowser();
    } finally {
        installBusy = false;
        setInstallButtonState();
    }
};

// PWA-кнопка установки удалена из интерфейса: остаётся только APK-загрузка.

// --- API & AUTH ---
async function api(action, data = {}) {
    const payload = Object.assign({}, data, { action: action });
    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    };

    const sessionToken = nativeSessionToken();
    if (sessionToken) headers['X-DAG-Session'] = sessionToken;

    try {
        let parsed;

        if (IS_NATIVE_APP) {
            const response = await nativeHttpRequest({
                url: appServerUrl('/api.php?t=' + Date.now()),
                method: 'POST',
                headers: headers,
                data: payload,
                connectTimeout: action === 'search_global' ? 16000 : (isWeakConnection() ? 16000 : 10000),
                readTimeout: action === 'search_global' ? 45000 : (isWeakConnection() ? 30000 : 15000)
            });

            if (!response || response.status < 200 || response.status >= 300) {
                throw new Error('HTTP ' + (response ? response.status : 0));
            }

            parsed = typeof response.data === 'string'
                ? JSON.parse(response.data)
                : response.data;
        } else {
            const controller = new AbortController();
            const timeout = setTimeout(function() {
                controller.abort();
            }, action === 'search_global' ? 45000 : (isWeakConnection() ? 30000 : 15000));

            try {
                const res = await fetch(appServerUrl('/api.php?t=' + Date.now()), {
                    method: 'POST',
                    credentials: 'same-origin',
                    cache: 'no-store',
                    headers: headers,
                    body: JSON.stringify(payload),
                    signal: controller.signal
                });

                const text = await res.text();
                if (!res.ok) {
                    throw new Error('HTTP ' + res.status + ': ' + text.slice(0, 180));
                }
                parsed = JSON.parse(text);
            } finally {
                clearTimeout(timeout);
            }
        }

        if (IS_NATIVE_APP) {
            nativeApiReachable = true;
        }

        if (IS_NATIVE_APP && (action === 'login' || action === 'register') && parsed && parsed.session_token) {
            localStorage.setItem(NATIVE_SESSION_KEY, String(parsed.session_token));
        }
        if (IS_NATIVE_APP && action === 'logout') {
            localStorage.removeItem(NATIVE_SESSION_KEY);
        }

        return parsed || {};
    } catch (e) {
        console.error('API request failed:', action, e);
        if (IS_NATIVE_APP) {
            nativeApiReachable = false;
        }

        const detail = String(
            (e && (e.message || e.error || (e.data && e.data.message))) || e || ''
        );

        if (e && e.name === 'AbortError') {
            return { error: 'Сервер отвечает слишком долго. Проверьте интернет и повторите.' };
        }

        if (/UnknownHost|NAME_NOT_RESOLVED|resolve host|dns|No address associated/i.test(detail)) {
            return { error: 'Не найден сервер pl.dagstudio.ru. Ошибка DNS или интернет-соединения.' };
        }

        if (/SSL|certificate|CERT_/i.test(detail)) {
            return { error: 'Не удалось установить защищённое соединение с pl.dagstudio.ru.' };
        }

        if (/timeout|timed out/i.test(detail)) {
            return { error: 'Сервер pl.dagstudio.ru не ответил вовремя.' };
        }

        return {
            error: 'Ошибка соединения с сервером.' + (detail ? ' ' + detail.slice(0, 140) : '')
        };
    }
}

function renderCurrentPlaylistFromAccountData() {
    if (currentTab !== 'search') {
        const pl = playlists.find(p => p.id == currentTab);
        if (pl) {
            playlist = [...(pl.tracks || [])];
            renderPlaylist();
        } else {
            switchTab('search');
        }
    }
}

function hydrateCachedAccount(username) {
    if (!username) return false;
    const cached = loadOfflinePlaylistsSnapshot(username);
    if (!Array.isArray(cached)) return false;

    currentUser = username;
    playlists = [...cached];
    playlistSnapshotOwner = username;
    renderCurrentPlaylistFromAccountData();
    return cached.length > 0;
}

async function checkAuth() {
    const lastKnownUser = String(
        localStorage.getItem(LAST_DEVICE_USER_KEY) ||
        localStorage.getItem(LAST_NATIVE_USER_KEY) ||
        ''
    );

    // Сразу показываем последнюю локальную копию аккаунта. Проверка сервера идёт
    // следом и обновит её, но медленный интернет больше не оставляет пустой экран.
    if (lastKnownUser) {
        hydrateCachedAccount(lastKnownUser);
        restoreNativePlaybackSnapshot();
    }

    if (navigator.onLine === false && lastKnownUser) {
        currentUser = lastKnownUser;
        return;
    }

    const res = await api('check_auth');

    if (res && res.logged_in) {
        currentUser = res.username;
        localStorage.setItem(LAST_DEVICE_USER_KEY, currentUser);
        if (IS_NATIVE_APP) {
            localStorage.setItem(LAST_NATIVE_USER_KEY, currentUser);
        }
        if (res.theme) setTheme(res.theme, false);
        await loadUserData();
        restoreNativePlaybackSnapshot();
        return;
    }

    // Сетевой сбой не уничтожает локальный профиль/плейлисты.
    if (res && res.error && lastKnownUser) {
        currentUser = lastKnownUser;
        hydrateCachedAccount(lastKnownUser);
        return;
    }

    currentUser = null;
    localStorage.removeItem(LAST_DEVICE_USER_KEY);
    if (IS_NATIVE_APP) {
        localStorage.removeItem(NATIVE_SESSION_KEY);
        localStorage.removeItem(LAST_NATIVE_USER_KEY);
    }
    playlists = [];
    renderCurrentPlaylistFromAccountData();
}

async function loadUserData(force = false) {
    const username = currentUser;
    if (!username) return false;
    // При смене учётной записи сначала показываем снимок с устройства.
    if (playlistSnapshotOwner !== username) {
        const local = loadOfflinePlaylistsSnapshot(username);
        playlists = Array.isArray(local) ? [...local] : [];
        playlistSnapshotOwner = username;
        renderCurrentPlaylistFromAccountData();
    }
    if (navigator.onLine === false) {
        updatePlaylistSyncStatus('error', 'Нет сети · используем локальные плейлисты');
        return false;
    }
    // Старый ответ не может перезаписать более поздний — запросы сериализованы.
    if (playlistSyncPromise) {
        const previous = await playlistSyncPromise;
        if (!force || currentUser !== username) return previous;
    }
    updatePlaylistSyncStatus('', 'Синхронизация плейлистов…');
    const promise = (async function() {
        const data = await api('get_data');
        if (username !== currentUser) return false;
        if (!Array.isArray(data)) {
            updatePlaylistSyncStatus('error', 'Сбой синхронизации · локальная копия сохранена');
            if (data?.error !== 'Auth required') retryPlaylistSyncLater();
            return false;
        }
        // Локальную копию заменяем только полным успешным ответом сервера.
        playlists = [...data];
        playlistSnapshotOwner = username;
        saveOfflinePlaylistsSnapshot(data);
        renderCurrentPlaylistFromAccountData();
        playlistSyncErrors = 0;
        if (playlistSyncTimer) { clearTimeout(playlistSyncTimer); playlistSyncTimer = null; }
        updatePlaylistSyncStatus('ok', 'Плейлисты синхронизированы · есть локальная копия');
        syncPlaylistOfflineCache();
        showDeviceCacheStatus();
        return true;
    })();
    playlistSyncPromise = promise;
    try { return await promise; }
    finally { if (playlistSyncPromise === promise) playlistSyncPromise = null; }
}

window.manualSyncPlaylists = async function() {
    if (!currentUser) return showNotification('Войдите для синхронизации плейлистов');
    const button = document.getElementById('playlist-sync-btn');
    if (button) button.disabled = true;
    try {
        const ok = await loadUserData(true);
        if (!ok && navigator.onLine !== false) {
            showNotification('Сервер недоступен. Локальные плейлисты сохранены, повторим синхронизацию.');
        }
    } finally { if (button) button.disabled = false; }
};

// --- TEYES CC3: native screen wake + лёгкая фиксация позиции трека ---
const DAG_PLAYBACK_SNAPSHOT_KEY = 'dag_car_last_play_v1';
let dagLastPlaybackSnapshotAt = 0;
let dagRestorePosition = null;
function saveNativePlaybackSnapshot(force = false) {
    if (!IS_NATIVE_APP || currentIndex < 0 || !playbackPlaylist[currentIndex]) return;
    if (!force && Date.now() - dagLastPlaybackSnapshotAt < 10000) return;
    dagLastPlaybackSnapshotAt = Date.now();
    const track = playbackPlaylist[currentIndex];
    try {
        localStorage.setItem(DAG_PLAYBACK_SNAPSHOT_KEY, JSON.stringify({
            playlistId: String(playbackTab), url: String(track.url || ''),
            position: Number.isFinite(mainAudio.currentTime) ? Math.max(0, mainAudio.currentTime) : 0,
            wasPlaying: !!playbackWanted,
            tracks: playbackPlaylist.slice(0, 100).map(t => ({
                id:t.id, title:t.title, artist:t.artist, url:t.url,
                thumb:t.thumb, source:t.source, type:t.type || 'audio'
            })),
            savedAt: Date.now()
        }));
    } catch (error) {}
}
function restoreNativePlaybackSnapshot() {
    if (!IS_NATIVE_APP || currentIndex >= 0) return;
    try {
        const saved = JSON.parse(localStorage.getItem(DAG_PLAYBACK_SNAPSHOT_KEY) || 'null');
        if (!saved || !saved.url || !saved.savedAt || Date.now() - saved.savedAt > 3 * 86400000) return;
        const pl = playlists.find(item => String(item.id) === String(saved.playlistId));
        if (pl) switchTab(pl.id);
        const tracks = Array.isArray(saved.tracks) ? saved.tracks.filter(t => t?.url).slice(0, 100) :
            (pl?.tracks || []).filter(t => t?.url);
        if (!tracks.length) return;
        const index = tracks.findIndex(t => t.url === saved.url);
        if (index < 0) return;
        playbackPlaylist = tracks;
        playbackTab = String(saved.playlistId || 'search');
        currentIndex = index;
        // Process recreation never autoplays: explicit Play continues at snapshot position.
        playbackWanted = false;
        dagRestorePosition = { url:saved.url, position:Math.max(0,Number(saved.position)||0) };
        playbackPlaylist[index]._resumeTime = dagRestorePosition.position;
        titleEl.textContent = tracks[index].title || 'Сохранённый трек';
        artistEl.textContent = (tracks[index].artist || '') + ' · нажмите ▶ для продолжения';
        updateActiveTrackInList(index);
        updatePlaybackQueueBadge();
    } catch (error) { console.warn('Playback snapshot restore unavailable'); }
}

function setNativeCarKeepAwake(enabled) {
    const screen = window.DAG_NATIVE_BRIDGE && window.DAG_NATIVE_BRIDGE.screen;
    if (IS_NATIVE_APP && screen && typeof screen.setKeepScreenOn === 'function') {
        screen.setKeepScreenOn({ enabled: !!enabled }).catch(function() {});
    }
}
let nativeResumeCheck = null;
window.addEventListener('dag-native-state', function(event) {
    const active = !!event.detail?.isActive;
    clearTimeout(nativeResumeCheck);
    nativeResumeCheck = null;
    if (!active) {
        saveNativePlaybackSnapshot(true);
        clearTimeout(nativeCacheRetryTimer);
        nativeCacheRetryTimer = null;
    } else {
        updateProgress();
        scheduleNativeCacheWorker(2500);
        if (!mainAudio.paused) requestWakeLock();
        const token = currentPlaybackToken;
        nativeResumeCheck = setTimeout(function() {
            if (token !== currentPlaybackToken || !playbackWanted ||
                !playbackPlaylist[currentIndex] || streamRecoveryInFlight) return;
            if (mainAudio.paused || mainAudio.error || playbackIsFrozen()) {
                recoverCurrentStream('android-resume');
            }
        }, 2300);
    }
});
window.addEventListener('pagehide', function() { saveNativePlaybackSnapshot(true); });

// --- WAKE LOCK ---
async function requestWakeLock() {
    setNativeCarKeepAwake(true);
    try {
        if ('wakeLock' in navigator && !mainAudio.paused && !mainAudio.ended) {
            wakeLock = await navigator.wakeLock.request('screen');
        }
    } catch (err) {}
}
function releaseWakeLock() {
    setNativeCarKeepAwake(false);
    if (wakeLock !== null) {
        wakeLock.release().then(function() { wakeLock = null; }).catch(function() { wakeLock = null; });
    }
}
document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible' && !mainAudio.paused && !mainAudio.ended) {
        requestWakeLock();
    }
});

if (mainAudio) {
    mainAudio.addEventListener('pause', function() {
        // Не начинаем новый сетевой запрос из-за кнопки «Пауза».
        if (playbackWanted || Date.now() - lastManualPauseAt < 90000) return;
        if (IS_NATIVE_APP) scheduleNativeCacheWorker(500);
        else scheduleWebCacheWorker(500);
    });
    mainAudio.addEventListener('ended', function() {
        if (IS_NATIVE_APP) scheduleNativeCacheWorker(500);
        else scheduleWebCacheWorker(500);
    });
}

window.addEventListener('online', function() {
    if (currentUser) {
        loadUserData(true).catch(function() {});
    }
    if (IS_NATIVE_APP) scheduleNativeCacheWorker(500);
    else scheduleWebCacheWorker(500);
});

updatePlaybackQueueBadge();
// --- ДИАГНОСТИКА / ТАЙМЕР / СОСТОЯНИЕ КЭША ---
let sleepTimerAt = 0;
let sleepAfterCurrent = false;
function updateSleepTimerLabel() {
    const el=document.getElementById('sleep-timer-state');
    if(!el)return;
    el.textContent=sleepAfterCurrent?'После текущего трека':
        sleepTimerAt?'Осталось '+Math.max(0,Math.ceil((sleepTimerAt-Date.now())/60000))+' мин':'Выключен';
}
function setSleepTimer(value) {
    sleepAfterCurrent=value==='end';
    sleepTimerAt=typeof value==='number'&&value>0?Date.now()+value*60000:0;
    updateSleepTimerLabel();
}
function openSleepTimer() {
    updateSleepTimerLabel();document.getElementById('sleep-modal').classList.add('show');
}
setInterval(function(){
    if(sleepTimerAt && Date.now()>=sleepTimerAt) {
        setSleepTimer(0);
        if(playbackWanted)pausePlayback();
        showNotification('Таймер сна завершил воспроизведение.');
    } else if(sleepTimerAt)updateSleepTimerLabel();
},12000);
const playerEventLog = [];
function recordPlayerEvent(reason, code = 0) {
    playerEventLog.push({at:new Date().toLocaleTimeString('ru-RU'),
        reason:String(reason || 'unknown').slice(0,50), code:Number(code)||0});
    if (playerEventLog.length > 16) playerEventLog.shift();
}
function openPlayerDiagnostics() {
    refreshPlayerDiagnostics();document.getElementById('diagnostics-modal').classList.add('show');
}
async function testMusicSourceHealth() {
    const result=document.getElementById('source-health-info');
    const button=document.getElementById('source-health-test');
    if (!result) return;
    if (button) button.disabled=true;
    result.textContent='Проверяем поиск у подключённых источников…';
    const started=Date.now();
    try {
        const response=await api('search_global', {
            query:'Miyagi', page:1, network:getNetworkProfile().weak?'weak':'normal'
        });
        if (!response?.success || !response?.sources) throw new Error('No search API response');
        const labels={audius:'Audius',vk_mail:'VK / Slider',hitmoz:'Hitmoz',
            muzo:'Muzofond',zvooq:'Zvooq',muzvox:'Muzvox',muzca:'Muzca'};
        const output=['Проверка поиска · '+((Date.now()-started)/1000).toFixed(1)+' с'];
        for (const [key,label] of Object.entries(labels)) {
            const info=response.sources[key] || {};
            output.push(label+': '+(info.ok ? 'ответ получен' : 'недоступен')+
                ' · HTTP '+(Number(info.http)||0));
        }
        output.push('Проверка поиска не подтверждает воспроизведение каждого файла.');
        result.textContent=output.join('\n');
    } catch(error) {
        result.textContent='Не удалось проверить источники: нет соединения или ответа сервера.';
    } finally { if(button) button.disabled=false; }
}
function copyPlayerDiagnostics() {
    const content=['DAGSTUDIO PLAYER diagnostics',
        document.getElementById('diagnostics-info')?.textContent || '',
        document.getElementById('source-health-info')?.textContent || ''].join('\n');
    if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(content).then(
            ()=>showNotification('Диагностика скопирована без ссылок на треки и токенов.'),
            ()=>showNotification('Не удалось скопировать отчёт.'));
    } else showNotification('Буфер обмена недоступен на этом устройстве.');
}
function refreshPlayerDiagnostics() {
    const el=document.getElementById('diagnostics-info');
    if(!el)return;
    const net=getNetworkProfile(),track=playbackPlaylist[currentIndex];
    el.textContent=[
        'Платформа: '+(IS_NATIVE_APP?'Android APK':'Браузер / PWA'),
        'Соединение: '+(navigator.onLine?(net.effectiveType||'доступно'):'отсутствует'),
        'Воспроизведение: '+(playbackWanted?(mainAudio.paused?'загрузка':'играет'):'пауза'),
        'Готовность: '+mainAudio.readyState+' из 4',
        'Буфер впереди: '+bufferedSecondsAhead().toFixed(1)+' с',
        'Офлайн: '+(track?._playingFromCache?'да':'нет'),
        'Источник: '+(track?.source||'не выбран'),
        'Повторные подключения: '+(track?._streamRetries||0),
        'Зависания потока: '+playbackHealth.stalls,
        'Восстановления: '+playbackHealth.recoveries,
        'Последняя причина: '+(playbackHealth.lastReason||'нет'),
        'Прогресс звука: '+(lastMediaAdvanceAt ? Math.round((Date.now()-lastMediaAdvanceAt)/1000)+' с назад' : 'нет данных'),
        'Ошибка аудио: '+(mainAudio.error?.code||'нет'),
        'Очередь: '+playbackQueue.length,
        'Активный список: '+playbackPlaylist.length+' треков',
        'Последние события: '+(playerEventLog.length ? playerEventLog.map(x=>x.at+' '+x.reason+
            (x.code?' ('+x.code+')':'')).join(' | ') : 'нет')
    ].join('\\n');
}
function retryCurrentTrackManually() {
    if(currentIndex<0)return;
    closeModal('diagnostics-modal');
    const pos=Number(mainAudio.currentTime||playbackPlaylist[currentIndex]._resumeTime||0);
    playTrack(currentIndex,{resumeAt:pos});
}
const cacheDownloadProgress = { bytes:0, total:0, downloading:false };
window.addEventListener('dag-cache-progress', event => {
    const state = event.detail || {};
    cacheDownloadProgress.bytes = Math.max(0, Number(state.bytes) || 0);
    cacheDownloadProgress.total = Math.max(0, Number(state.total) || 0);
    cacheDownloadProgress.downloading = !!state.downloading;
    const label = document.getElementById('cache-progress-info');
    if (label) {
        label.textContent = state.downloading ?
            'Скачивание: ' + (cacheDownloadProgress.bytes / 1048576).toFixed(1) + ' МБ' +
            (cacheDownloadProgress.total ? ' из ' + (cacheDownloadProgress.total / 1048576).toFixed(1) + ' МБ' : '') :
            'Фоновое скачивание не выполняется';
    }
});
function downloadCurrentPlaylistOffline() {
    if (navigator.onLine === false) return showNotification('Для скачивания нужна сеть.');
    if (!playlist.length) return showNotification('В этом списке нет треков.');
    let count = 0;
    for (const track of playlist) {
        if (!track?.url || !isRemoteMediaUrl(track.url)) continue;
        if (IS_NATIVE_APP) enqueueNativeTrackCache(track, 'playlist', false);
        else enqueueWebTrackCache(track, 'playlist', false);
        count++;
    }
    showNotification('Добавлено в очередь кэширования: ' + count + '. Загрузка выполняется в фоне по одному файлу.');
}
async function verifyOfflineCache() {
    const result = document.getElementById('cache-verify-info');
    if (!result) return;
    result.textContent = 'Проверяем сохранённые файлы…';
    let checked=0, removed=0;
    if (IS_NATIVE_APP) {
        const bridge=nativeAudioCacheBridge(),index=readNativeAudioIndex();
        for (const [url,entry] of Object.entries(index)) {
            checked++;
            try {
                const file = entry?.path && bridge ? await bridge.get({path:entry.path}) : null;
                if (!file?.exists || Number(file.size || 0) < 4096 ||
                    Number(file.size || 0) + 1024 < Number(entry.size || 0)) {
                    delete index[url]; removed++;
                }
            } catch(e) { delete index[url]; removed++; }
        }
        writeNativeAudioIndex(index);
    } else if ('caches' in window) {
        try {
            const store=await caches.open('dag-audio-cache');
            for (const key of await store.keys()) {
                checked++;
                const res=await store.match(key);
                const size=(await res?.blob())?.size || 0;
                const expected=Number(res?.headers.get('content-length') || 0);
                if (size<4096 || (expected && size+1024<expected)) {
                    await store.delete(key); removed++;
                }
            }
        } catch(e) { result.textContent='Кэш браузера недоступен';return; }
    }
    result.textContent='Проверено: '+checked+' · повреждённых записей удалено: '+removed;
    showDeviceCacheStatus();
}
function clearOfflineAudioCache() {
    if (playbackWanted) return showNotification('Поставьте музыку на паузу перед очисткой.');
    showConfirm('Удалить все скачанные аудиофайлы с этого устройства? Плейлисты и настройки останутся.', async function() {
        if (IS_NATIVE_APP) {
            const bridge=nativeAudioCacheBridge();
            const index=readNativeAudioIndex();
            nativeCacheQueue.length=0; nativeCacheQueuedUrls.clear();
            for (const path of new Set(Object.values(index).map(e=>e?.path).filter(Boolean))) {
                if (bridge) await bridge.delete({path}).catch(()=>{});
            }
            writeNativeAudioIndex({});
        } else if ('caches' in window) {
            webCacheQueue.length=0; webCacheQueuedUrls.clear();
            await caches.delete('dag-audio-cache');
        }
        await openCacheDashboard();
        const info=document.getElementById('cache-verify-info');
        if(info)info.textContent='Кэш очищен. Плейлисты сохранены.';
    });
}
async function openCacheDashboard() {
    const out=document.getElementById('cache-dashboard-info');
    if(!out)return;
    document.getElementById('cache-dashboard-modal').classList.add('show');
    out.textContent='Подсчёт кэша…';
    const urls=new Set();
    playlists.forEach(pl=>(pl.tracks||[]).forEach(t=>{if(t.url)urls.add(canonicalTrackUrl(t));}));
    if(IS_NATIVE_APP) {
        const owner=currentCacheOwner();
        const entries=Object.values(readNativeAudioIndex()).filter(x=>
            x?.path&&Array.isArray(x.owners)&&x.owners.includes(owner));
        const size=entries.reduce((n,x)=>n+(Number(x.size)||0),0);
        out.textContent='На этом устройстве: '+entries.length+' из '+urls.size+
            ' треков в плейлистах. Размер: '+(size/1048576).toFixed(1)+
            ' МБ. На новой магнитоле или телефоне кэш создаётся отдельно.';
    } else {
        try {
            const store=await caches.open('dag-audio-cache');
            const keys=await store.keys();
            out.textContent='В этом браузере: '+keys.length+
                ' файлов; '+urls.size+' треков в плейлистах. Кэш хранится локально.';
        } catch(e){out.textContent='Нет доступа к кэшу браузера.';}
    }
}
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
        const synced = await loadUserData(true);
        showNotification(synced ? 'Плейлист создан' : 'Плейлист создан на сервере. Список обновится при синхронизации.');
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
        const deleting = playlists.find(p => p.id == id);
        const deletingTracks = deleting && Array.isArray(deleting.tracks)
            ? deleting.tracks.map(track => normalizeCacheTrack(track))
            : [];

        const response = await api('delete_playlist', { id: id });
        if (!response.success) {
            showNotification(response.error || 'Не удалось удалить плейлист. Изменения не сохранены.');
            return;
        }
        playlists = playlists.filter(p => String(p.id) !== String(id));
        saveOfflinePlaylistsSnapshot(playlists);
        renderCurrentPlaylistFromAccountData();
        await loadUserData(true);

        for (const track of deletingTracks) {
            await deleteDeviceCachedTrack(track, false);
        }

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
        const response = await api('rename_playlist', { id: editingPlaylistId, name: newName });
        if (!response.success) {
            document.getElementById('tm-rename-input').value = pl.name;
            showNotification(response.error || 'Не удалось переименовать плейлист.');
            return;
        }
        pl.name = newName;
        saveOfflinePlaylistsSnapshot(playlists);
        await loadUserData(true);
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
    const response = await api('add_track', { playlist_id: plId, track: trackData });
    if (!response.success) return showNotification(response.error || 'Не удалось добавить трек.');
    const synced = await loadUserData(true);
    cacheTrackSilently(trackData, { reason: 'playlist', priority: true });
    document.getElementById('tm-add-link-area').style.display = 'none';
    if (synced) renderTrackManagerList(playlists.find(p => p.id == plId));
    else showNotification('Трек добавлен на сервер, список обновится при следующей синхронизации.');
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
                const uploadHeaders = {};
                const sessionToken = nativeSessionToken();
                if (sessionToken) uploadHeaders['X-DAG-Session'] = sessionToken;

                const res = await fetch(appServerUrl('/api.php'), {
                    method: 'POST',
                    credentials: IS_NATIVE_APP ? 'omit' : 'same-origin',
                    cache: 'no-store',
                    headers: uploadHeaders,
                    body: formData
                });
                const data = await res.json();
                if(data.success) successCount++;
            } catch(e) {}
        }
        await loadUserData(true);
        const updatedPl = playlists.find(p => p.id == activePlIdForUpload);
        if (updatedPl) renderTrackManagerList(updatedPl);
        showLoader(false);
        showNotification(`Загружено файлов: ${successCount} из ${input.files.length}`);
    } 
}

async function deleteTrackFromPlaylist(plId, trackId) {
    const plBefore = playlists.find(p => p.id == plId);
    const deletedTrack = plBefore && Array.isArray(plBefore.tracks)
        ? plBefore.tracks.find(track => String(track.id) === String(trackId))
        : null;

    const response = await api('delete_track', {track_id: trackId});
    if (!response.success) return showNotification(response.error || 'Не удалось удалить трек.');
    if (plBefore) plBefore.tracks = (plBefore.tracks || []).filter(t => String(t.id) !== String(trackId));
    saveOfflinePlaylistsSnapshot(playlists);
    renderCurrentPlaylistFromAccountData();
    await loadUserData(true);

    if (deletedTrack) await deleteDeviceCachedTrack(deletedTrack, false);
    renderTrackManagerList(playlists.find(p => p.id == plId));
}

window.deleteTrackGeneral = async function(trackId, plId) {
    const plBefore = playlists.find(p => p.id == plId);
    const deletedTrack = plBefore && Array.isArray(plBefore.tracks)
        ? plBefore.tracks.find(track => String(track.id) === String(trackId))
        : null;

    const response = await api('delete_track', {track_id: trackId});
    if (!response.success) return showNotification(response.error || 'Не удалось удалить трек.');
    if (plBefore) plBefore.tracks = (plBefore.tracks || []).filter(t => String(t.id) !== String(trackId));
    saveOfflinePlaylistsSnapshot(playlists);
    renderCurrentPlaylistFromAccountData();
    await loadUserData(true);

    if (deletedTrack) await deleteDeviceCachedTrack(deletedTrack, false);
}

// --- УСТОЙЧИВЫЙ PLAYBACK ДЛЯ СЛАБОЙ СЕТИ ---
let streamRecoveryTimer = null;
// Точное измерение продвижения времени звука, а не только состояния буфера.
let lastMediaAdvanceAt = 0;
let lastMediaPosition = 0;
const playbackHealth = { stalls: 0, recoveries: 0, lastReason: '', lastRecoveryAt: 0 };
function resetMediaAdvanceClock(position = 0) {
    lastMediaAdvanceAt = Date.now();
    lastMediaPosition = Math.max(0, Number(position) || 0);
}
function recordMediaAdvance() {
    const position = Number(mainAudio.currentTime);
    if (!Number.isFinite(position)) return;
    if (Math.abs(position - lastMediaPosition) >= .18) resetMediaAdvanceClock(position);
}
function playbackIsFrozen() {
    if (!playbackWanted || mainAudio.ended || currentIndex < 0 ||
        (document.hidden && !IS_NATIVE_APP)) return false;
    // A background Android WebView can throttle JS. Do not restart its audio
    // just because timer callbacks ran late while navigation was on screen.
    if (document.hidden) return false;
    const wait = getNetworkProfile().veryWeak ? 50000 : (getNetworkProfile().weak ? 35000 : 21000);
    return lastMediaAdvanceAt > 0 && Date.now() - lastMediaAdvanceAt > wait;
}
let pendingResumeTime = 0;
let currentPlaybackToken = 0;
let networkRetryPending = false;
const MAX_STREAM_RETRIES = 4;

function normalizeTrackIdentity(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/\[[^\]]+\]/g, ' ')
        .replace(/[^a-zа-яё0-9]+/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function scoreReplacementTrack(saved, candidate) {
    const savedTitle = normalizeTrackIdentity(saved.title);
    const savedArtist = normalizeTrackIdentity(saved.artist);
    const title = normalizeTrackIdentity(candidate.title);
    const artist = normalizeTrackIdentity(candidate.artist);

    // Never substitute a remix or a similarly named recording.
    if (!savedTitle || title !== savedTitle ||
        (savedArtist && artist !== savedArtist)) return -1;

    let score = 0;
    if (title === savedTitle) score += 100;
    else if (title.includes(savedTitle) || savedTitle.includes(title)) score += 55;

    if (savedArtist && artist) {
        if (artist === savedArtist) score += 70;
        else if (artist.includes(savedArtist) || savedArtist.includes(artist)) score += 35;
    }

    // Audius хранит стабильный ID трека и лучше подходит для долгоживущего плейлиста.
    if (String(candidate.source || '').toUpperCase().includes('AUDIUS')) score += 8;

    return score;
}

async function refreshSavedTrackSource(track) {
    if (!track || track._refreshAttempted || navigator.onLine === false) return false;
    track._refreshAttempted = true;
    const persisted = playbackTab !== 'search' && !!track.id;

    const query = [track.artist, track.title].filter(Boolean).join(' ').trim();
    if (!query) return false;

    artistEl.textContent = 'Обновляем источник трека…';

    const result = await api('search_global', {
        query: query,
        page: 1,
        network: isWeakConnection() ? 'weak' : 'normal'
    });

    const candidates = result && Array.isArray(result.data) ? result.data : [];
    if (!candidates.length) return false;

    const ranked = candidates
        .map(candidate => ({ candidate, score: scoreReplacementTrack(track, candidate) }))
        .filter(item => item.score >= (savedArtist ? 170 : 100) && item.candidate && item.candidate.url)
        .sort((a, b) => b.score - a.score);

    if (!ranked.length) return false;

    const replacement = ranked[0].candidate;
    const newUrl = String(replacement.url || '').trim();
    if (!newUrl || newUrl === String(track.url || '').trim()) return false;

    // Временный результат поиска не имеет track.id: обновляем только в памяти.
    // Постоянный плейлист исправляем на сервере, чтобы ссылка работала и на других устройствах.
    if (persisted) {
        const update = await api('update_track_url', {
            track_id: track.id,
            url: newUrl,
            thumb: replacement.thumb || track.thumb || ''
        });
        if (!update || update.success !== true) return false;
    }

    track.url = newUrl;
    if (replacement.thumb) track.thumb = replacement.thumb;
    track.source = replacement.source || track.source || '';
    track._streamRetries = 0;
    track._playingFromCache = false;

    // Синхронизируем тот же объект в пользовательском списке и локальном снимке.
    const ownerPlaylist = playlists.find(pl =>
        Array.isArray(pl.tracks) && pl.tracks.some(t => String(t.id) === String(track.id))
    );
    if (ownerPlaylist) {
        const stored = ownerPlaylist.tracks.find(t => String(t.id) === String(track.id));
        if (stored) {
            stored.url = newUrl;
            if (replacement.thumb) stored.thumb = replacement.thumb;
            stored.source = replacement.source || stored.source || '';
        }
    }
    if (currentUser) saveOfflinePlaylistsSnapshot(playlists);

    return true;
}

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

let streamRecoveryInFlight = false;

function bufferedSecondsAhead() {
    try {
        const time = mainAudio.currentTime || 0;
        const ranges = mainAudio.buffered;
        for (let i = 0; i < ranges.length; i++) {
            if (ranges.start(i) <= time + 0.25 && ranges.end(i) >= time) {
                return Math.max(0, ranges.end(i) - time);
            }
        }
    } catch (error) {}
    return 0;
}

function scheduleStreamRecovery(reason, delay) {
    const track = playbackPlaylist[currentIndex];
    if (!track || !track.url || mainAudio.ended || !playbackWanted) return;
    clearStreamRecoveryTimer();

    const token = currentPlaybackToken;
    const net = getNetworkProfile();
    let wait = typeof delay === 'number' ? delay : (net.veryWeak ? 26000 : (net.weak ? 16000 : 8000));

    if (reason === 'waiting' || reason === 'stalled') {
        // На 2G колебания буфера нормальны. Не обрываем поток через 4 секунды.
        wait = net.veryWeak ? 26000 : (net.weak ? 18000 : 13000);
    } else if (typeof delay !== 'number' && AUDIO_COMPAT_PROFILE.legacyAndroid) {
        wait = net.weak ? 12000 : 8000;
    }

    streamRecoveryTimer = setTimeout(function() {
        if (token !== currentPlaybackToken || mainAudio.ended || !playbackWanted) return;
        if ((reason === 'waiting' || reason === 'stalled') &&
            bufferedSecondsAhead() > 1 && !playbackIsFrozen()) {
            // Buffered audio can still be progressing: do not tear it down.
            showLoader(false);
            return;
        }
        recoverCurrentStream(reason);
    }, wait);
}

async function recoverCurrentStream(reason) {
    const track = playbackPlaylist[currentIndex];
    if (!track || !track.url || streamRecoveryInFlight || !playbackWanted) return;
    if ((reason === 'waiting' || reason === 'stalled') &&
        bufferedSecondsAhead() > 1 && !playbackIsFrozen()) return;
    streamRecoveryInFlight = true;
    if (reason !== 'network-offline' && reason !== 'network-online') {
        inferredWeakNetworkUntil = Date.now() + 180000;
    }
    playbackHealth.recoveries += 1;
    playbackHealth.lastReason = String(reason || 'unknown');
    playbackHealth.lastRecoveryAt = Date.now();
    recordPlayerEvent('recovery:'+String(reason||'unknown'));

    try {
    await recoverCurrentStreamInternal(reason, track);
    } finally {
        streamRecoveryInFlight = false;
    }
}

async function recoverCurrentStreamInternal(reason, track) {
    clearStreamRecoveryTimer();
    const token = currentPlaybackToken;
    if (!playbackWanted || playbackPlaylist[currentIndex] !== track) return;
    resetMediaAdvanceClock(mainAudio.currentTime);

    const resumeAt = Math.max(
        Number(track._resumeTime || 0),
        isFinite(mainAudio.currentTime) ? Number(mainAudio.currentTime || 0) : 0
    );
    pendingResumeTime = resumeAt > 1 ? resumeAt : 0;

    // При пропадании сети или ошибке потока сначала пробуем локальную копию.
    if (isRemoteMediaUrl(track.url)) {
        const cached = track._cachedRecoveryAttempts >= 2 && navigator.onLine !== false
            ? null : await getDeviceCachedAudio(track);
        if (!playbackWanted || token !== currentPlaybackToken ||
            playbackPlaylist[currentIndex] !== track) return;
        if (cached && cached.inCache) {
            track._cachedRecoveryAttempts = (track._cachedRecoveryAttempts || 0) + 1;
            networkRetryPending = false;
            track._playingFromCache = true;

            showLoader(true);
            mainAudio.pause();
            mainAudio.src = cached.url;
            mainAudio.load();

            try {
                armPlaybackWatchdog(currentPlaybackToken, 'cache-recovery-timeout');
                await requestAudioPlay();
                restorePendingPosition();
                artistEl.textContent = track.artist || 'Офлайн';
                return;
            } catch (error) {
                console.warn('Local cached playback recovery failed:', error);
            }
        }
    }

    if (!navigator.onLine && isRemoteMediaUrl(track.url)) {
        networkRetryPending = true;
        showLoader(false);
        titleEl.textContent = track.title;
        artistEl.textContent = 'Нет сети и локальной копии этого трека';
        updateState(false);
        return;
    }

    networkRetryPending = false;
    track._playingFromCache = false;
    track._streamRetries = (track._streamRetries || 0) + 1;

    if (track._streamRetries > MAX_STREAM_RETRIES) {
        // Для сохранённого трека сначала восстанавливаем устаревшую ссылку.
        // Только если найти новый источник не удалось, оставляем трек остановленным.
        const refreshed = await refreshSavedTrackSource(track);
        if (!playbackWanted || token !== currentPlaybackToken ||
            playbackPlaylist[currentIndex] !== track) return;
        if (refreshed && playbackPlaylist[currentIndex] === track) {
            artistEl.textContent = 'Источник обновлён — запускаем…';
            track._streamRetries = 0;
            pendingResumeTime = 0;
            setTimeout(function() {
                if (playbackPlaylist[currentIndex] === track) playTrack(currentIndex, {fromPlayback:true});
            }, 150);
            return;
        }

        playbackWanted = false;
        clearPlaybackWatchdog();
        showLoader(false);
        updateState(false);
        releaseWakeLock();
        syncCarNativeMedia(false);
        titleEl.textContent = track.title;
        artistEl.textContent = 'Источник временно недоступен';
        return;
    }

    const retry = track._streamRetries;
    const useNoRange = AUDIO_COMPAT_PROFILE.fullFileFallback || retry >= 2;
    let retryUrl = resolveMediaUrl(track.url);

    if (shouldProxyMedia(track)) {
        retryUrl = buildProxyUrl(track, {
            weak: true,
            norange: useNoRange,
            retry: retry
        });
    }

    showLoader(true);
    mainAudio.pause();
    mainAudio.src = retryUrl;
    mainAudio.load();

    try {
        armPlaybackWatchdog(currentPlaybackToken, 'retry-timeout');
        await requestAudioPlay();
        if (!playbackWanted || token !== currentPlaybackToken) return;
        // Состояние "играет" ставит только реальное событие playing.
        // Это важно для старых WebView, где play() возвращает undefined.
        restorePendingPosition();
    } catch (error) {
        clearPlaybackWatchdog();
        if (!playbackWanted || token !== currentPlaybackToken) return;
        if (error && error.name === 'NotAllowedError') {
            playbackWanted = false;
            showLoader(false);
            updateState(false);
            artistEl.textContent = 'Нажмите ▶ для продолжения';
            return;
        }
        scheduleStreamRecovery('retry-failed', getNetworkProfile().weak ? 5000 : 2500);
    }
}

mainAudio.addEventListener('playing', function() {
    if (!playbackWanted) { mainAudio.pause(); showLoader(false); return; }
    resetMediaAdvanceClock(mainAudio.currentTime);
    clearStreamRecoveryTimer();
    clearPlaybackWatchdog();
    showLoader(false);
    networkRetryPending = false;
    window.skipCounter = 0;
    updateState(true);
    requestWakeLock();
    syncCarNativeMedia(true);
    maybePrecacheNextTrack();

    const token = currentPlaybackToken;
    const track = playbackPlaylist[currentIndex];
    const playingStartedAt = Number(mainAudio.currentTime) || 0;
    setTimeout(function() {
        // Событие playing без продвижения позиции не должно сбрасывать
        // лимит повторных подключений при последовательных зависаниях.
        if (token === currentPlaybackToken && track === playbackPlaylist[currentIndex] &&
            !mainAudio.paused && (Number(mainAudio.currentTime) || 0) - playingStartedAt >= 8) {
            track._streamRetries = 0;
        }
    }, 12000);

    // Прослушанный онлайн-трек автоматически сохраняется на устройстве.
    if (track && navigator.onLine !== false && isRemoteMediaUrl(track.url) && !track._playingFromCache) {
        setTimeout(function() {
            if (token === currentPlaybackToken && track === playbackPlaylist[currentIndex] &&
                isFinite(mainAudio.currentTime) && mainAudio.currentTime >= 5) {
                cacheTrackSilently(track, { reason: 'played', priority: true });
            }
        }, 6000);
    }
});

mainAudio.addEventListener('pause', function() {
    if (!mainAudio.ended) {
        updateState(false);
        releaseWakeLock();
        syncCarNativeMedia(false);
        saveNativePlaybackSnapshot(true);
    }
});

mainAudio.addEventListener('ended', function() {
    if (sleepAfterCurrent || (sleepTimerAt && Date.now() >= sleepTimerAt)) {
        sleepAfterCurrent = false;sleepTimerAt = 0;
        // Останавливаем и нативный Android-сервис, иначе он держит CPU awake.
        pausePlayback();
        updateSleepTimerLabel();
        showNotification('Воспроизведение остановлено по таймеру сна.');
        return;
    }
    clearStreamRecoveryTimer();
    releaseWakeLock();
    syncCarNativeMedia(false);
    saveNativePlaybackSnapshot(true);

    const finishedTrack = playbackPlaylist[currentIndex];
    if (finishedTrack && navigator.onLine !== false && isRemoteMediaUrl(finishedTrack.url)) {
        cacheTrackSilently(finishedTrack, { reason: 'played', priority: true });
    }

    if (isRepeat) playTrack(currentIndex, {fromPlayback:true}); else playNext();
});

mainAudio.addEventListener('waiting', function() {
    if (mainAudio.ended) return;
    playbackHealth.stalls += 1;
    if (mainAudio.paused) return;
    if (bufferedSecondsAhead() <= 1) showLoader(true);
    scheduleStreamRecovery('waiting');
});

mainAudio.addEventListener('stalled', function() {
    if (mainAudio.ended) return;
    playbackHealth.stalls += 1;
    if (mainAudio.paused) return;
    if (bufferedSecondsAhead() <= 1) showLoader(true);
    scheduleStreamRecovery('stalled');
});

mainAudio.addEventListener('canplay', function() {
    restorePendingPosition();
    showLoader(false);
});

mainAudio.addEventListener('loadedmetadata', restorePendingPosition);
// Passive, low-frequency supervisor: detects a genuinely frozen playhead.
// Never restarts while hidden: old CC3 WebViews throttle JS in navigation apps.
setInterval(function() {
    if (playbackIsFrozen() && !streamRecoveryInFlight && !streamRecoveryTimer) {
        playbackHealth.stalls += 1;
        scheduleStreamRecovery('frozen-playhead', 200);
    }
}, 5000);
mainAudio.addEventListener('progress', maybePrecacheNextTrack);
mainAudio.addEventListener('canplaythrough', maybePrecacheNextTrack);

mainAudio.addEventListener('timeupdate', function() {
    recordMediaAdvance();
    const track = playbackPlaylist[currentIndex];
    if (track && isFinite(mainAudio.currentTime) && mainAudio.currentTime > 0) {
        track._resumeTime = mainAudio.currentTime;
        saveNativePlaybackSnapshot();

        // Дополнительная страховка: после 8 секунд онлайн-прослушивания
        // ставим трек в очередь постоянного кэша только один раз за запуск.
        if (IS_NATIVE_APP && navigator.onLine !== false && mainAudio.currentTime >= 8 &&
            isRemoteMediaUrl(track.url) && !track._playingFromCache && !track._cacheQueuedForPlay) {
            track._cacheQueuedForPlay = true;
            cacheTrackSilently(track, { reason: 'played', priority: true });
        }
    }
});

mainAudio.addEventListener('error', function() {
    const track = playbackPlaylist[currentIndex];
    if (!track || !track.url) return;
    const mediaCode = mainAudio.error?.code || 0;
    console.warn('Audio media error', { code: mediaCode, source: track.source || '', retries: track._streamRetries || 0 });
    recordPlayerEvent('media-error',mediaCode);
    showLoader(false);
    if (mediaCode === 4 && (track._streamRetries || 0) >= MAX_STREAM_RETRIES) {
        artistEl.textContent = 'Источник не поддерживается на устройстве';
        updateState(false);
        return;
    }
    scheduleStreamRecovery('media-error', getNetworkProfile().weak ? 2500 : 1200);
});

window.addEventListener('offline', function() {
    recordPlayerEvent('network-offline');
    if (currentIndex < 0 || mainAudio.ended) return;

    const track = playbackPlaylist[currentIndex];
    if (track && track._playingFromCache) return;

    // Если текущего сетевого буфера уже недостаточно, сразу переключаемся
    // на сохранённый локальный файл, если он есть.
    if (mainAudio.paused || mainAudio.readyState < 3) {
        recoverCurrentStream('network-offline');
    } else {
        networkRetryPending = true;
        artistEl.textContent = 'Сигнал потерян — используем буфер';
    }
});

window.addEventListener('online', function() {
    recordPlayerEvent('network-online');
    nativeApiReachable = true;
    scheduleNativeCacheWorker(500);
    if (playbackWanted && networkRetryPending && currentIndex >= 0 &&
        (mainAudio.paused || mainAudio.readyState < 2)) {
        recoverCurrentStream('network-online');
    } else if (mainAudio.readyState >= 3 && !mainAudio.paused) {
        networkRetryPending = false;
    }
});

if (connectionInfo && typeof connectionInfo.addEventListener === 'function') {
    connectionInfo.addEventListener('change', function() {
        // Если радиосеть вернулась после провала, продолжаем тот же трек.
        if (playbackWanted && networkRetryPending && navigator.onLine &&
            (mainAudio.paused || mainAudio.readyState < 2)) {
            recoverCurrentStream('connection-change');
        }
        if (navigator.onLine !== false) {
            scheduleNativeCacheWorker(1000);
        }
    });
}

async function playTrack(index, options = {}) {
    const targetList = options.fromPlayback ? playbackPlaylist : playlist;
    if(index < 0 || index >= targetList.length) return;
    if (!options.fromPlayback) {
        playbackPlaylist = [...targetList];
        playbackTab = String(currentTab);
    }
    playbackWanted = true;
    currentIndex = index;
    nextTrackPrefetchKey = '';
    streamRecoveryInFlight = false;
    const track = playbackPlaylist[index];
    currentPlaybackToken++;
    const token = currentPlaybackToken;

    track._streamRetries = 0;
    track._cachedRecoveryAttempts = 0;
    track._refreshAttempted = false;
    resetMediaAdvanceClock();
    const nativeResume = Number(options.resumeAt) > 0 ? Number(options.resumeAt) :
        (IS_NATIVE_APP && dagRestorePosition && dagRestorePosition.url === track.url ? dagRestorePosition.position : 0);
    dagRestorePosition = null;
    track._resumeTime = nativeResume;
    track._playingFromCache = false;
    track._cacheQueuedForPlay = false;
    networkRetryPending = false;
    pendingResumeTime = nativeResume;
    clearStreamRecoveryTimer();
    clearPlaybackWatchdog();

    updateActiveTrackInList(index);
    titleEl.textContent = track.title;
    artistEl.textContent = track.artist;
    showLoader(true);
    updateState(false);

    if ('mediaSession' in navigator) {
        try {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: track.title,
                artist: track.artist,
                album: 'DAGSTUDIO',
                artwork: [{ src: track.thumb || 'images/faviconch.png', sizes: '512x512', type: 'image/png' }]
            });
            navigator.mediaSession.setActionHandler('play', function() { if (!playbackWanted) resumePlayback(); });
            navigator.mediaSession.setActionHandler('pause', function() { if (playbackWanted) pausePlayback(); });
            navigator.mediaSession.setActionHandler('previoustrack', playPrev);
            navigator.mediaSession.setActionHandler('nexttrack', playNext);
        } catch(e) {}
    }

    if (currentBlobUrl) {
        URL.revokeObjectURL(currentBlobUrl);
        currentBlobUrl = null;
    }

    mainAudio.pause();
    mainAudio.removeAttribute('src');
    mainAudio.load();

    let finalUrl = resolveMediaUrl(track.url);
    try {
        let isCached = false;

        const immediateLegacyStart =
            AUDIO_COMPAT_PROFILE.fullFileFallback &&
            navigator.onLine !== false &&
            track.url &&
            isRemoteMediaUrl(track.url);

        if (immediateLegacyStart) {
            // Не теряем пользовательский жест на ожидании CacheStorage/IndexedDB.
            // Старому WebView сразу отдаём самый совместимый полный поток.
            track._playingFromCache = false;
            finalUrl = shouldProxyMedia(track)
                ? buildProxyUrl(track, { weak: isWeakConnection(), norange: true, retry: 0 })
                : resolveMediaUrl(track.url);
        } else if (track.url && isRemoteMediaUrl(track.url)) {
            const cachedRes = await getDeviceCachedAudio(track);
            if (token !== currentPlaybackToken) return;

            if (cachedRes.inCache) {
                finalUrl = cachedRes.url;
                isCached = true;
                track._playingFromCache = true;

                if (cachedRes.isBlob) {
                    currentBlobUrl = cachedRes.url;
                }
            } else {
                track._playingFromCache = false;
                finalUrl = shouldProxyMedia(track)
                    ? buildProxyUrl(track, {
                        weak: isWeakConnection(),
                        norange: AUDIO_COMPAT_PROFILE.fullFileFallback
                    })
                    : resolveMediaUrl(track.url);
            }
        }

        if (!navigator.onLine && !isCached && track.url && isRemoteMediaUrl(track.url)) {
            networkRetryPending = true;
            showLoader(false);
            titleEl.textContent = track.title;
            artistEl.textContent = 'Нет сети и трек ещё не сохранён на устройстве';
            updateState(false);
            return;
        }

        if (token !== currentPlaybackToken || !playbackWanted) return;
        mainAudio.src = finalUrl;
        mainAudio.loop = false;
        mainAudio.preload = AUDIO_COMPAT_PROFILE.fullFileFallback ? 'metadata' : 'auto';
        mainAudio.load();

        armPlaybackWatchdog(token, 'startup-timeout');
        await requestAudioPlay();

        if (token !== currentPlaybackToken) return;
        // Не рисуем ложное состояние воспроизведения. Событие playing
        // само выключит loader и включит анимацию только когда пошёл звук.
    } catch (error) {
        clearPlaybackWatchdog();
        if (token !== currentPlaybackToken) return;

        console.warn('Audio startup failed', { reason: String(error?.message || error || ''), url: finalUrl?.split('?')[0] });
        if (error && error.name === 'NotAllowedError') {
            playbackWanted = false;
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
    const current = playbackPlaylist[currentIndex];
    if (!current) return;
    const visibleIndex = playlist.findIndex(t => canonicalTrackUrl(t) === canonicalTrackUrl(current));
    if (visibleIndex >= 0 && rows[visibleIndex]) rows[visibleIndex].classList.add('active');
}

function syncCarNativeMedia(playing) {
    const media = window.DAG_NATIVE_BRIDGE?.media;
    if (!IS_NATIVE_APP || !media || typeof media.update !== 'function') return;
    const track = playbackPlaylist[currentIndex];
    media.update({playing: !!playing, title: track?.title || 'DAGSTUDIO PLAYER',
        artist: track?.artist || ''}).catch(function(error) {
        console.warn('Android media service unavailable:', error);
    });
}
let lastAndroidButton = {action:'', at:0};
window.addEventListener('dag-android-media-button', function(event) {
    const action = String(event.detail?.action || '');
    const now = Date.now();
    if (lastAndroidButton.action === action && now - lastAndroidButton.at < 200) return;
    lastAndroidButton = {action, at:now};
    if (action === 'play' && !playbackWanted) resumePlayback();
    else if (action === 'pause' && playbackWanted) pausePlayback();
    else if (action === 'next' && (playbackPlaylist.length || playbackQueue.length)) playNext();
    else if (action === 'previous' && playbackPlaylist.length) playPrev();
    else if (action === 'toggle' && playbackPlaylist.length) togglePlay();
});
function notifyPausedCacheReady(track) {
    if (playbackWanted || currentIndex < 0 || !track ||
        canonicalTrackUrl(playbackPlaylist[currentIndex]) !== canonicalTrackUrl(track)) return;
    artistEl.textContent = 'Трек сохранён в кэше · нажмите ▶';
}
function pausePlayback() {
    if (!playbackWanted) return;
    playbackWanted = false;
    lastManualPauseAt = Date.now();
    lastMediaAdvanceAt = 0;
    currentPlaybackToken++; // ignore delayed cache responses / retry callbacks
    clearStreamRecoveryTimer();
    clearPlaybackWatchdog();
    const incomplete = mainAudio.readyState < 2;
    const position = Number.isFinite(mainAudio.currentTime) ? mainAudio.currentTime : 0;
    const pausedTrack = playbackPlaylist[currentIndex];
    mainAudio.pause();
    if (incomplete) {
        const track = playbackPlaylist[currentIndex];
        if (track) track._resumeTime = Math.max(Number(track._resumeTime) || 0, position);
        mainAudio.removeAttribute('src');
        mainAudio.load(); // abort a stuck WebView network request
    }
    showLoader(false);
    updateState(false);
    releaseWakeLock();
    syncCarNativeMedia(false);
    saveNativePlaybackSnapshot(true);
    // Пауза останавливает зависший запрос воспроизведения, но запускает
    // отдельное скачивание текущей композиции в кэш без автозапуска.
    if (pausedTrack && isRemoteMediaUrl(pausedTrack.url) && navigator.onLine !== false &&
        !pausedTrack._playingFromCache) {
        artistEl.textContent = 'Пауза · сохраняем трек для офлайн-прослушивания…';
        cacheTrackSilently(pausedTrack, { reason: 'paused-current', priority: true });
    }
}
function resumePlayback() {
    const track = playbackPlaylist[currentIndex];
    if (!track) return;
    playbackWanted = true;
    resetMediaAdvanceClock(mainAudio.currentTime);
    window.skipCounter = 0;
    if (eqGraphReady && eqAudioContext && eqAudioContext.state === 'suspended') {
        try { eqAudioContext.resume(); } catch (e) {}
    }
    if (!mainAudio.getAttribute('src') || mainAudio.error || mainAudio.networkState === 3) {
        playbackWanted = false;
        playTrack(currentIndex, { fromPlayback:true, resumeAt:Number(track._resumeTime || 0) });
        return;
    }
    showLoader(true);
    updateState(false);
    const token = currentPlaybackToken;
    armPlaybackWatchdog(token, 'manual-play-timeout');
    requestAudioPlay().catch(function(error) {
        if (token !== currentPlaybackToken || !playbackWanted) return;
        clearPlaybackWatchdog();
        showLoader(false);
        if (error && error.name === 'NotAllowedError') {
            playbackWanted = false;
            updateState(false);
            artistEl.textContent = 'Нажмите ▶ ещё раз для запуска';
        } else {
            scheduleStreamRecovery('manual-play-failed', 1500);
        }
    });
}
function togglePlay() {
    if (!playbackPlaylist[currentIndex]) return;
    if (playbackWanted) pausePlayback(); else resumePlayback();
}
function updateState(playing) {
    const btn = document.getElementById('btn-play');
    // A loading stream can have audio.paused=true; second tap must PAUSE, not play again.
    const pauseIcon = !!playing || playbackWanted;
    btn.innerHTML = pauseIcon ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play" style="padding-left:5px;"></i>';
    btn.setAttribute('aria-label', pauseIcon ? 'Пауза / остановить загрузку' : 'Воспроизвести');
    document.querySelector('.vinyl-wrapper').classList.toggle('spinning', !!playing);
    if (playing) startProgressLoop(); else stopProgressLoop();
}

function toggleShuffle() { isShuffle = !isShuffle; document.getElementById('btn-shuffle').classList.toggle('active'); }
function toggleRepeat() { isRepeat = !isRepeat; document.getElementById('btn-repeat').classList.toggle('active'); }
function savePlaybackQueue() {
    try { localStorage.setItem(PLAYBACK_QUEUE_KEY, JSON.stringify(playbackQueue)); } catch (e) {}
    updatePlaybackQueueBadge();
    renderPlaybackQueue();
}
function updatePlaybackQueueBadge() {
    const badge = document.getElementById('queue-count');
    if (badge) badge.textContent = playbackQueue.length ? String(playbackQueue.length) : '';
}
function queueTrack(index) {
    const track = playlist[index];
    if (!track?.url) return;
    if (playbackQueue.length >= 50) return showNotification('В очереди не больше 50 треков.');
    playbackQueue.push({ title:track.title || 'Трек', artist:track.artist || '',
        url:track.url, thumb:track.thumb || '', source:track.source || '',type:'audio' });
    savePlaybackQueue();
}
function playQueuedTrack(index) {
    if (index < 0 || index >= playbackQueue.length) return;
    const track = playbackQueue.splice(index, 1)[0];
    savePlaybackQueue();
    let target = playbackPlaylist.findIndex(t => canonicalTrackUrl(t) === canonicalTrackUrl(track));
    if (target < 0) { target = playbackPlaylist.length; playbackPlaylist.push(track); }
    playTrack(target, {fromPlayback:true});
    closeModal('queue-modal');
}
function renderPlaybackQueue() {
    const list = document.getElementById('queue-list');
    if (!list) return;
    list.replaceChildren();
    if (!playbackQueue.length) {
        const p = document.createElement('p');p.className='queue-empty';
        p.textContent='Очередь пуста. Добавляйте треки значком списка.';
        list.appendChild(p);return;
    }
    playbackQueue.forEach((track,i)=>{
        const row=document.createElement('div');row.className='queue-row';
        const label=document.createElement('span');label.className='queue-name';
        label.textContent=(i+1)+'. '+track.title+(track.artist ? ' — '+track.artist : '');
        const make=(text,title,disabled,action)=>{
            const btn=document.createElement('button');btn.type='button';
            btn.className='queue-mini-btn';btn.title=title;btn.textContent=text;
            btn.disabled=disabled;btn.onclick=action;return btn;
        };
        row.append(label,
            make('↑','Выше',i===0,()=>{[playbackQueue[i-1],playbackQueue[i]]=[playbackQueue[i],playbackQueue[i-1]];savePlaybackQueue();}),
            make('↓','Ниже',i===playbackQueue.length-1,()=>{[playbackQueue[i],playbackQueue[i+1]]=[playbackQueue[i+1],playbackQueue[i]];savePlaybackQueue();}),
            make('▶','Играть сейчас',false,()=>playQueuedTrack(i)),
            make('×','Убрать',false,()=>{playbackQueue.splice(i,1);savePlaybackQueue();}));
        list.appendChild(row);
    });
}
function openPlaybackQueue() {
    renderPlaybackQueue();
    document.getElementById('queue-modal').classList.add('show');
}
function clearPlaybackQueue() {
    playbackQueue.length=0;savePlaybackQueue();
}
function playNext() {
    if (playbackQueue.length) {
        const track = playbackQueue.shift();
        savePlaybackQueue();
        let index = playbackPlaylist.findIndex(t => canonicalTrackUrl(t) === canonicalTrackUrl(track));
        if (index < 0) { index = playbackPlaylist.length; playbackPlaylist.push(track); }
        playTrack(index, {fromPlayback:true});
        return;
    }
    if (!playbackPlaylist.length) return;
    if (isShuffle && playbackPlaylist.length > 1) {
        let r = Math.floor(Math.random() * playbackPlaylist.length);
        while (r === currentIndex) r = Math.floor(Math.random() * playbackPlaylist.length);
        playTrack(r, {fromPlayback:true});
    } else {
        let n = currentIndex + 1;
        if (n >= playbackPlaylist.length) n = 0;
        playTrack(n, {fromPlayback:true});
    }
}
function playPrev() {
    if (!playbackPlaylist.length) return;
    const p = currentIndex <= 0 ? playbackPlaylist.length - 1 : currentIndex - 1;
    playTrack(p, {fromPlayback:true});
}

document.getElementById('btn-shuffle').onclick = toggleShuffle;
document.getElementById('btn-repeat').onclick = toggleRepeat;
document.getElementById('btn-next').onclick = playNext; 
document.getElementById('btn-prev').onclick = playPrev; 

let progressTimer = null;
function startProgressLoop() {
    stopProgressLoop();
    updateProgress();
    progressTimer = setInterval(function() { if (!document.hidden) updateProgress(); }, 400);
}
function stopProgressLoop() {
    if (progressTimer !== null) { clearInterval(progressTimer); progressTimer = null; }
}

function updateProgress() { 
    if (document.hidden) return; 
    let curr = 0, dur = 0, buf = 0; 
    const track = playbackPlaylist[currentIndex]; 
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
    const track = playbackPlaylist[currentIndex]; if(track) { 
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
        const net = getNetworkProfile();
        const result = await api('search_global', {
            query: query,
            page: currentSearchPage,
            network: net.weak ? 'weak' : 'normal',
            save_data: net.saveData ? 1 : 0
        });
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
        const net = getNetworkProfile();
        const result = await api('search_global', {
            query: currentSearchQuery,
            page: currentSearchPage,
            network: net.weak ? 'weak' : 'normal',
            save_data: net.saveData ? 1 : 0
        });
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
        const delay = getNetworkProfile().weak ? 750 : 400;
        searchTimeout = setTimeout(() => { performSearch(e.target.value, false); }, delay); 
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
        const div = document.createElement('div'); div.className = 'track-row ' + (playbackPlaylist[currentIndex] && canonicalTrackUrl(t) === canonicalTrackUrl(playbackPlaylist[currentIndex]) ? 'active' : ''); 
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
        
        const downloadBtn = (t.url && isRemoteMediaUrl(t.url)) 
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
        const queueBtn = document.createElement('button');
        queueBtn.type='button';queueBtn.className='btn-list-action';
        queueBtn.title='Играть следующей';queueBtn.setAttribute('aria-label','Добавить в очередь');
        queueBtn.innerHTML='<i class="fas fa-list-ol"></i>';
        queueBtn.onclick=function(event){event.stopPropagation();queueTrack(i);};
        actions.insertBefore(queueBtn,actions.firstChild);
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
    const response = await api('add_track', { playlist_id: plId, track: trackData });
    if (!response.success) return showNotification(response.error || 'Не удалось добавить трек.');
    closeModal('save-modal');
    const synced = await loadUserData(true);
    showNotification(synced
        ? 'Трек добавлен! Сохраним его офлайн при доступном интернете.'
        : 'Трек добавлен на сервер. Список обновится после восстановления сети.'); 
    
    // Как только трек добавлен в плейлист, даем команду на его кэширование в фоне!
    if (navigator.onLine && isRemoteMediaUrl(trackData.url)) {
        cacheTrackSilently(trackData, { reason: 'playlist', priority: true });
    }
}

function openMenu() {
    showDeviceCacheStatus();
    if (currentUser) {
        if (navigator.onLine === false) updatePlaylistSyncStatus('error', 'Нет сети · используем локальные плейлисты');
        document.getElementById('auth-section').style.display = 'none';
        document.getElementById('user-section').style.display = 'block';
        document.getElementById('user-name-disp').innerText = currentUser;
    } else {
        document.getElementById('auth-section').style.display = 'block';
        document.getElementById('user-section').style.display = 'none';
    }

    document.getElementById('menu-modal').classList.add('show');
    refreshAppVersionInfo();
}
function toggleAuthMode() { isRegMode = !isRegMode; const title = document.getElementById('auth-title'); const btn = document.querySelector('#auth-section button'); const toggle = document.querySelector('.auth-toggle'); if (isRegMode) { title.innerText = "РЕГИСТРАЦИЯ"; btn.innerText = "СОЗДАТЬ АККАУНТ"; toggle.innerText = "Уже есть аккаунт? Войти"; } else { title.innerText = "ВХОД"; btn.innerText = "ВОЙТИ"; toggle.innerText = "Нет аккаунта? Зарегистрироваться"; } }

async function handleAuth() {
    const nameEl = document.getElementById('auth-name');
    const passEl = document.getElementById('auth-pass');
    const submitBtn = document.getElementById('auth-submit-btn');
    const name = nameEl ? nameEl.value.trim() : '';
    const pass = passEl ? passEl.value : '';

    if(!name || !pass) {
        showNotification('Введите логин и пароль');
        return;
    }

    const action = isRegMode ? 'register' : 'login';
    const oldText = submitBtn ? submitBtn.innerHTML : '';

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + (isRegMode ? 'СОЗДАЁМ...' : 'ВХОД...');
    }

    try {
        const res = await api(action, { name: name, pass: pass });

        if (res && res.success) {
            // Сервер после регистрации сразу создаёт сессию, поэтому вход и
            // регистрация завершаются одинаково и без промежуточного тупика.
            currentUser = res.username || name;
            if (currentUser) {
                localStorage.setItem(LAST_DEVICE_USER_KEY, currentUser);
                if (IS_NATIVE_APP) {
                    localStorage.setItem(LAST_NATIVE_USER_KEY, currentUser);
                }
            }
            isRegMode = false;
            closeModal('menu-modal');

            if (res.theme) setTheme(res.theme, false);
            await loadUserData();
            showNotification(action === 'register'
                ? 'Аккаунт создан. Вы вошли в DAGSTUDIO PLAYER.'
                : 'Добро пожаловать, ' + currentUser + '!');
            return;
        }

        showNotification((res && res.error) ? res.error : 'Не удалось выполнить вход.');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = isRegMode ? 'СОЗДАТЬ АККАУНТ' : 'ВОЙТИ';
        }
    }
}

async function handleLogout() {
    await api('logout');
    currentUser = null;
    localStorage.removeItem(LAST_DEVICE_USER_KEY);
    if (IS_NATIVE_APP) {
        localStorage.removeItem(LAST_NATIVE_USER_KEY);
    }
    playlists = [];
    playlist = [];
    switchTab('search');
    closeModal('menu-modal');
}

function preloadThemeImages() {
    // На магнитолах с ограниченной RAM не декодируем сразу пять изображений тем.
    const images = IS_NATIVE_APP
        ? [(colorThemes[localStorage.getItem('dag_theme')] || colorThemes.brown).img]
        : Object.values(colorThemes).map(theme => theme.img);
    images.forEach(src => { const img = new Image(); img.src = src; });
}
preloadThemeImages();

// Общая цветовая система интерфейса: один тон управляет ВСЕМИ поверхностями.
// Рассчитана на старые Android WebView (без CSS color-mix / OKLCH).
function hexRgb(color) {
    const normalized = String(color || '').replace('#', '');
    const hex = normalized.length === 3
        ? normalized.split('').map(ch => ch + ch).join('')
        : normalized;
    return [0, 2, 4].map(pos => parseInt(hex.slice(pos, pos + 2), 16) || 0);
}
function rgbHex(rgb) {
    return '#' + rgb.map(value => Math.max(0, Math.min(255, Math.round(value)))
        .toString(16).padStart(2, '0')).join('');
}
function blendThemeColors(base, tint, intensity) {
    const first = hexRgb(base);
    const second = hexRgb(tint);
    return rgbHex(first.map((v, i) => v * (1 - intensity) + second[i] * intensity));
}
function applyThemePalette(themeName) {
    const theme = colorThemes[themeName] || colorThemes.brown;
    const root = document.documentElement;
    const main = theme.main;
    const bright = blendThemeColors(main, '#ffffff', .36);
    const middle = blendThemeColors(main, '#ffffff', .2);
    const mutedText = blendThemeColors('#a6b0b9', main, .14);
    const header = blendThemeColors('#141a20', main, .12);
    const shades = {
        '--accent-color': main,
        '--accent-dark': theme.dark,
        '--accent-rgb': theme.rgb,
        '--accent-glow': 'rgba(' + theme.rgb + ', .27)',
        '--main-color': main,
        '--dark-color': theme.dark,
        '--theme-rgb': theme.rgb,
        '--theme-bright': bright,
        '--theme-bright-rgb': hexRgb(bright).join(', '),
        '--theme-middle': middle,
        '--theme-page': blendThemeColors('#090c0f', main, .055),
        '--theme-body-a': blendThemeColors('#171c22', main, .12),
        '--theme-body-b': blendThemeColors('#0b1015', main, .085),
        '--theme-shell-a': blendThemeColors('#171d23', main, .18),
        '--theme-shell-b': blendThemeColors('#0c1014', main, .095),
        '--theme-header': header,
        '--theme-header-rgb': hexRgb(header).join(', '),
        '--theme-left-a': blendThemeColors('#171b20', main, .2),
        '--theme-left-b': blendThemeColors('#12171c', main, .12),
        '--theme-right-a': blendThemeColors('#10151a', main, .13),
        '--theme-right-b': blendThemeColors('#0c1115', main, .085),
        '--theme-modal-a': blendThemeColors('#222a30', main, .2),
        '--theme-modal-b': blendThemeColors('#13181d', main, .12),
        '--theme-surface': blendThemeColors('#20272d', main, .19),
        '--theme-surface-hover': blendThemeColors('#303a43', main, .23),
        '--theme-control': blendThemeColors('#1b2229', main, .18),
        '--theme-control-hover': blendThemeColors('#313940', main, .22),
        '--theme-field': blendThemeColors('#141b20', main, .14),
        '--theme-field-focus': blendThemeColors('#1c242a', main, .17),
        '--theme-border': blendThemeColors('#35404b', main, .25),
        '--theme-outline': blendThemeColors('#47535c', main, .31),
        '--theme-muted': mutedText,
        '--theme-bright-text': blendThemeColors('#f1f5f8', main, .065),
        '--theme-on-accent': '#101317',
        '--bg-color': blendThemeColors('#0b0e11', main, .1),
        '--card-bg': blendThemeColors('#11161b', main, .15),
        '--panel-bg': blendThemeColors('#151b21', main, .17),
        '--border-color': blendThemeColors('#2a343d', main, .2),
        '--text-color': blendThemeColors('#f5f6f8', main, .055),
        '--text-muted': mutedText
    };
    Object.keys(shades).forEach(key => root.style.setProperty(key, shades[key]));
    root.dataset.dagTheme = themeName;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', shades['--theme-page']);
}
function setTheme(themeName, save = true) {
    if(!colorThemes[themeName]) return;
    const t = colorThemes[themeName]; const root = document.documentElement;
    applyThemePalette(themeName);

    const coverImg = document.getElementById('cover-img'); 
    if(coverImg) coverImg.src = t.img;
    
    document.querySelectorAll('.theme-aware-thumb').forEach(img => { img.src = t.img; });

    localStorage.setItem('dag_theme', themeName);
    if(save && currentUser) { api('update_theme', {theme: themeName}); }
    document.querySelectorAll('.theme-dot').forEach(btn => { btn.classList.remove('active'); if(btn.getAttribute('onclick').includes(themeName)) { btn.classList.add('active'); } });
}

function loadTheme() { const saved = localStorage.getItem('dag_theme') || 'brown'; setTheme(saved, false); }

loadTheme();

window.openMenu = openMenu;
window.toggleAuthMode = toggleAuthMode;
window.handleAuth = handleAuth;
window.handleLogout = handleLogout;

['auth-name', 'auth-pass'].forEach(function(id) {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener('keydown', function(event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                handleAuth();
            }
        });
    }
});

checkAuth();

if (IS_NATIVE_APP) {
    // Никаких фоновых OTA-скачиваний и updater.set() по таймеру или при возврате
    // из сна магнитолы: OTA запускается только кнопкой меню.
    window.addEventListener('dag-android-back', function() {
        const overlays = Array.from(document.querySelectorAll('.modal-overlay.show'));
        if (overlays.length) closeModal(overlays[overlays.length - 1].id);
        else if (currentTab !== 'search') switchTab('search');
        // Главное окно не закрываем по случайной аппаратной кнопке "Назад".
    });
}