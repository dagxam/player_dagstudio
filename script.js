// script.js - V2232 (web + Capacitor native shell)

const DAG_SERVER_ORIGIN = 'https://pl.dagstudio.ru';
const NATIVE_SESSION_KEY = 'dag_native_session';
const IS_NATIVE_APP = window.DAG_NATIVE_APP === true ||
    (!!window.Capacitor && typeof window.Capacitor.getPlatform === 'function' && window.Capacitor.getPlatform() !== 'web');
const NATIVE_PLATFORM = IS_NATIVE_APP && typeof window.Capacitor?.getPlatform === 'function'
    ? window.Capacitor.getPlatform() : 'web';

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
    'https://pl.dagstudio.ru/ota-bridge.php';
const NATIVE_UPDATE_BACKUP_META_URL =
    'https://github.com/dagxam/player_dagstudio/releases/download/android-web/DAGSTUDIO-PLAYER-web-version.json';
const ANDROID_APK_LATEST_URL = 'https://pl.dagstudio.ru/apk/DAGSTUDIO-PLAYER-Preview.apk';
const WEB_BUILD_LABEL = '2317';

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
            connectTimeout: 20000,
            readTimeout: 35000
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

// Only trusted release endpoints can supply executable web bundles.
function trustedOtaDownloadUrl(url) {
    const value = String(url || '');
    return /^https:\/\/pl\.dagstudio\.ru\/ota\/DAGSTUDIO-PLAYER-web-\d+\.\d+\.\d+\.zip$/.test(value) ||
        value === 'https://github.com/dagxam/player_dagstudio/releases/download/android-web/DAGSTUDIO-PLAYER-web.zip';
}
function validOtaManifest(meta) {
    return !!meta && /^\d+\.\d+\.\d+$/.test(String(meta.version || '')) &&
        trustedOtaDownloadUrl(meta.url) &&
        /^[a-f0-9]{64}$/i.test(String(meta.checksum || '')) &&
        (!meta.fallback_url || trustedOtaDownloadUrl(meta.fallback_url));
}
// A Wi-Fi icon or navigator.onLine=true does not prove DNS resolution.
// Keep raw exceptions in the diagnostics, but display a short Russian message.
let lastConnectivityFailure = '';
function isDnsResolutionFailure(error) {
    return /unable to resolve host|no address associated with hostname|unknownhostexception|err_name_not_resolved|name or service not known|temporary failure in name resolution|dns_probe_finished|enotfound|dns lookup failed|failed to resolve|could not resolve host|ошибка dns|dns недоступ|не определяет адреса|серверы обновления недоступны/i
        .test(String(error?.message || error || ''));
}
function explainConnectionFailure(error) {
    if (navigator.onLine === false) return 'Нет подключения к сети. Проверьте Wi-Fi или мобильный интернет.';
    if (isDnsResolutionFailure(error)) return 'Устройство не определяет интернет-адреса (ошибка DNS). Проверьте подключение, настройки DNS и попробуйте другую сеть.';
    const message = String(error?.message || error || '');
    if (/abort|timed?\s*out|timeout|sockettimeout/i.test(message)) return 'Сервер отвечает слишком долго. Проверьте интернет и повторите запрос.';
    if (/\bhttp\s*5\d\d\b/i.test(message)) return 'Сервер временно недоступен. Повторите попытку позже.';
    if (/network|failed to fetch|connectexception|unreachable|connection refused/i.test(message)) return 'Не удаётся связаться с сервером. Проверьте интернет и повторите.';
    return 'Запрос не выполнен. Проверьте интернет и повторите.';
}
function recordConnectivityFailure(error) {
    lastConnectivityFailure = isDnsResolutionFailure(error)
        ? 'DNS: адреса серверов не определяются'
        : String(error?.message || error || 'Ошибка сети').slice(0,130);
}

async function fetchOtaManifest() {
    const attempts = [];
    let dnsFailures = 0;
    for (const endpoint of [NATIVE_UPDATE_META_URL, NATIVE_UPDATE_BACKUP_META_URL]) {
        try {
            const meta = await fetchUpdateJson(endpoint);
            if (!validOtaManifest(meta)) throw new Error('Некорректный манифест обновления');
            return meta;
        } catch (error) {
            recordConnectivityFailure(error);
            if (isDnsResolutionFailure(error)) dnsFailures++;
            attempts.push((endpoint === NATIVE_UPDATE_META_URL ? 'сайт' : 'GitHub') +
                ': ' + String(error?.message || error || 'нет ответа').slice(0,110));
        }
    }
    if (dnsFailures === 2 || navigator.onLine === false) {
        throw new Error('Ошибка DNS: магнитола не определяет адреса серверов. Проверьте интернет и настройки DNS.');
    }
    throw new Error('Серверы обновлений не ответили: ' + attempts.join('; '));
}
async function downloadOtaBundle(updater, meta) {
    const urls = [meta.url];
    if (meta.fallback_url && meta.fallback_url !== meta.url) urls.push(meta.fallback_url);
    const problems = [];
    for (let i = 0; i < urls.length; i++) {
        if (i) setManualUpdateButtonState('is-checking', 'Пробуем запасной сервер…');
        try {
            const bundle = await updater.download({
                url: String(urls[i]),
                version: String(meta.version),
                checksum: String(meta.checksum)
            });
            if (!bundle?.id) throw new Error('Нет идентификатора обновления');
            return bundle;
        } catch (error) {
            recordConnectivityFailure(error);
            problems.push((i ? 'резервный' : 'основной') + ': ' +
                String(error?.message || error || 'загрузка прервана').slice(0,110));
        }
    }
    if (problems.every(line => isDnsResolutionFailure(line))) {
        throw new Error('Ошибка DNS: устройство не определяет адреса серверов обновлений.');
    }
    throw new Error('Не удалось скачать пакет. ' + problems.join('; '));
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
    // This release channel is built for Android only. Never apply its bundle
    // to a future signed iOS container.
    if (NATIVE_PLATFORM === 'ios') return { status: 'ios-release-required' };
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

        const meta = await fetchOtaManifest();
        const installedBundleVersion = await getInstalledBundleVersion();
        const installedVersion = installedBundleVersion || String(window.DAG_NATIVE_BUILD_VERSION || 'builtin');
        const latestVersion = String(meta.version);
        const builtInCommit = String(window.DAG_NATIVE_BUILD_COMMIT || '');

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

        const bundle = await downloadOtaBundle(updater, meta);

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
        if (NATIVE_PLATFORM === 'ios') {
            setManualUpdateButtonState('', 'Обновить приложение');
            showNotification('Для нативной версии iPhone требуется отдельная подписанная iOS-сборка. Android OTA к ней не применяется.');
            return;
        }
        // В веб/PWA ничего не скачиваем как APK: обновляем Service Worker
        // и перезагружаем приложение с актуальными файлами сайта.
        if (!IS_NATIVE_APP) {
            // Сначала убеждаемся, что сервер доступен. При отсутствии сети
            // офлайн-оболочку не трогаем и не ломаем проигрывание музыки.
            // Bound network checks so Windows PWA never spins indefinitely
            // while a CDN, captive portal or DNS resolver is unavailable.
            const probe = new AbortController();
            const probeTimeout = setTimeout(() => probe.abort(), 7500);
            let response;
            try {
                response = await fetch('/index.php?ota-check=' + Date.now(), {
                    cache: 'no-store',
                    headers: { 'Cache-Control': 'no-cache' },
                    signal: probe.signal
                });
            } finally {
                clearTimeout(probeTimeout);
            }
            if (!response.ok) throw new Error('Сервер обновлений недоступен: HTTP ' + response.status);

            // SW check can continue, but must not block a manual PWA refresh.
            const registration = await Promise.race([
                serviceWorkerRegistrationPromise,
                new Promise(resolve => setTimeout(() => resolve(null), 1400))
            ]);
            if (registration && typeof registration.update === 'function') {
                try {
                    await Promise.race([
                        registration.update(),
                        new Promise(resolve => setTimeout(resolve, 1500))
                    ]);
                } catch (error) {
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

        // This button updates the web UI using signed Capgo OTA only.
        // A separate, explicit Download APK menu item handles native updates.
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
        recordConnectivityFailure(error);
        showNotification('Онлайн-обновление не выполнено. ' + explainConnectionFailure(error));
    }
};

let serviceWorkerRegistrationPromise = Promise.resolve(null);
if (!IS_NATIVE_APP && 'serviceWorker' in navigator) {
    serviceWorkerRegistrationPromise = navigator.serviceWorker
        .register('/sw.js?v=2293', { scope: '/', updateViaCache: 'none' })
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
        if (sessionStorage.getItem('dag_sw_reloaded_2293') === '1') return;
        sessionStorage.setItem('dag_sw_reloaded_2293', '1');
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
const PLAYLIST_ICON_OPTIONS = Object.freeze([
    ['music','Музыка'],['heart','Любимые'],['star','Избранное'],
    ['headphones','Наушники'],['car-side','В дорогу'],['mountain','Кавказ'],
    ['fire','Энергия'],['moon','Вечер'],['sun','Лето'],
    ['bolt','Хиты'],['compact-disc','Ретро'],['radio','Радио'],
    ['leaf','Спокойствие'],['guitar','Гитара'],['globe','Мир'],
    ['drum','Ритм'],['microphone','Вокал'],['list','Список']
]);
function playlistIconName(value) {
    return PLAYLIST_ICON_OPTIONS.some(([name])=>name===value)?value:'music';
}
function playlistCoverUrl(value){
    const path=String(value||'').replace(/^\//,'');
    if(!/^images\/playlist-covers\/[a-f0-9]{32}\.(?:jpg|png|webp)$/i.test(path))return '';
    return IS_NATIVE_APP?appServerUrl('/'+path):'/'+path;
}
function renderPlaylistIconPicker(id) {
    const container=document.getElementById('tm-playlist-icons');
    if(!container)return;
    const selected=playlistIconName(playlists.find(p=>String(p.id)===String(id))?.icon);
    container.replaceChildren();
    for(const [icon,label] of PLAYLIST_ICON_OPTIONS){
        const button=document.createElement('button');
        button.type='button';
        button.className='playlist-icon-choice';
        button.title=label;
        button.setAttribute('aria-label',label);
        button.setAttribute('aria-pressed',String(icon===selected));
        button.dataset.icon=icon;
        const image=document.createElement('i');
        image.className='fas fa-'+icon;
        image.setAttribute('aria-hidden','true');
        button.appendChild(image);
        button.addEventListener('click',()=>savePlaylistIcon(id,icon));
        container.appendChild(button);
    }
    const preview=document.getElementById('tm-playlist-icon-preview');
    if(preview)preview.className='fas fa-'+selected;
}
async function savePlaylistIcon(id,icon) {
    const choice=playlistIconName(icon);
    if(!currentUser||!playlists.some(p=>String(p.id)===String(id)))return false;
    const picker=document.getElementById('tm-playlist-icons');
    picker?.querySelectorAll('button').forEach(button=>button.disabled=true);
    try {
        const response=await api('update_playlist_icon',{id,icon:choice});
        if(!response?.success){
            showNotification(response?.error||'Иконка не сохранена');
            return false;
        }
        const pl=playlists.find(p=>String(p.id)===String(id));
        if(pl)pl.icon=choice;
        saveOfflinePlaylistsSnapshot(playlists);
        renderPlaylistIconPicker(id);
        window.dispatchEvent(new Event('dag-playlists-updated'));
        return true;
    } catch(error){
        showNotification('Не удалось сохранить иконку');
        return false;
    } finally {
        picker?.querySelectorAll('button').forEach(button=>button.disabled=false);
    }
}


let currentSearchQuery = '';
let currentSearchPage = 1;
let isSearchLoading = false;
let hasMoreSearchResults = true;

let isShuffle = false;
let isRepeat = false;

// Optional continuous radio after a saved playlist finishes.
// Stored on-device so OTA updates and APK restarts preserve the choice.
const SMART_RADIO_KEY = 'dag_smart_radio_v1';
let smartRadioEnabled = localStorage.getItem(SMART_RADIO_KEY) !== 'off';
let smartRadioBusy = false;
let smartRadioRequestSerial = 0;
let smartRadioSearchCursor = 0;
let smartRadioPrefetch = null;
const smartShufflePlayed = new Set();


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

// Android APK with Media3 uses a native decoder; browsers and older APKs keep HTML5 audio.
const NATIVE_MEDIA3_ACTIVE = IS_NATIVE_APP && window.DAG_MEDIA3_ENABLED === true &&
    typeof window.DAGNativeAudioAdapter === 'function';
const mainAudio = NATIVE_MEDIA3_ACTIVE
    ? new window.DAGNativeAudioAdapter()
    : document.getElementById('main-audio');
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
    // ExoPlayer controls retry and buffering itself. Never tear down its stream
    // because JavaScript timers were throttled while TEYES ran navigation.
    if (NATIVE_MEDIA3_ACTIVE || !playbackWanted) return;
    const net = getNetworkProfile();
    let timeout = net.veryWeak ? 60000 : (net.weak ? 45000 : 25000);

    if (AUDIO_COMPAT_PROFILE.fullFileFallback) {
        // На действительно старой магнитоле не крутим загрузку десятки секунд:
        // быстро переходим на совместимый no-Range поток.
        timeout = net.veryWeak ? 60000 : (net.weak ? 45000 : 22000);
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
const EQ_LIMITER_KEY = 'dag_eq_soft_level_v1';
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
    car:     { label: 'В автомобиле', gains: [4, 3, 0, 1, 2, 1, -1] },
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
let eqDynamicsCompressor = null;
let eqGraphReady = false;
let eqGraphFailed = false;
let nativeEqualizerRestored = false;

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
    if (NATIVE_MEDIA3_ACTIVE) {
        window.DAG_NATIVE_BRIDGE.audioPlayer.equalizer({
            enabled: !!eqState.enabled, gains: eqState.gains
        }).catch(error => console.warn('Native equalizer unavailable:', error));
        return;
    }
    if (!eqGraphReady || !eqFilters.length) return;
    eqFilters.forEach((filter, index) => {
        const gain = eqState.enabled ? Number(eqState.gains[index] || 0) : 0;
        try {
            filter.gain.setTargetAtTime(gain, eqAudioContext.currentTime, 0.025);
        } catch (error) {
            filter.gain.value = gain;
        }
    });
    if(eqDynamicsCompressor){
        const enabled=localStorage.getItem(EQ_LIMITER_KEY)==='on';
        eqDynamicsCompressor.threshold.setTargetAtTime(enabled?-18:0,eqAudioContext.currentTime,.03);
        eqDynamicsCompressor.ratio.setTargetAtTime(enabled?3:1,eqAudioContext.currentTime,.03);
    }
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

function restoreNativeEqualizerAfterPlaybackStart() {
    // Android creates the Media3 audio session on first playback. Restoring
    // the saved preset before that point would start its media service while idle.
    if (!NATIVE_MEDIA3_ACTIVE || nativeEqualizerRestored) return;
    nativeEqualizerRestored = true;
    applyEqualizerState();
}

async function ensureEqualizerGraph() {
    if (NATIVE_MEDIA3_ACTIVE) { applyEqualizerState(); return true; }
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
        eqDynamicsCompressor=eqAudioContext.createDynamicsCompressor();
        eqDynamicsCompressor.threshold.value=0;
        eqDynamicsCompressor.knee.value=14;
        eqDynamicsCompressor.ratio.value=1;
        eqDynamicsCompressor.attack.value=.012;
        eqDynamicsCompressor.release.value=.25;
        node.connect(eqDynamicsCompressor);
        eqDynamicsCompressor.connect(eqMasterGain);
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
    const level=document.getElementById('eq-level-switch');
    const note=document.getElementById('eq-level-note');
    if(level){level.checked=localStorage.getItem(EQ_LIMITER_KEY)==='on';
       level.disabled=NATIVE_MEDIA3_ACTIVE;}
    if(note)note.textContent=NATIVE_MEDIA3_ACTIVE?
       'Встроенный Media3 на Android пока не поддерживает этот режим.':
       'Ограничивает пики. Не является полной LUFS-нормализацией.';
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

window.toggleSoftLeveling = async function(enabled) {
    if(NATIVE_MEDIA3_ACTIVE)return;
    localStorage.setItem(EQ_LIMITER_KEY,enabled?'on':'off');
    await ensureEqualizerGraph();
    applyEqualizerState();
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
    const saveData = !!(info && info.saveData) || trafficSaverEnabled();
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
const OFFLINE_LIMIT_KEY='dag_offline_cache_limit_mb_v1';
const STREAM_ECONOMY_KEY='dag_stream_economy_v1';
function offlineLimitMb(){
    const value=Number(localStorage.getItem(OFFLINE_LIMIT_KEY)||512);
    return [256,512,1024].includes(value)?value:512;
}
function changeOfflineLimit(value){
    if(![256,512,1024].includes(Number(value)))return;
    localStorage.setItem(OFFLINE_LIMIT_KEY,String(value));
    showDeviceCacheStatus();
    openCacheDashboard().catch(()=>{});
}
function nativeCacheUsedBytes(){
    return Object.values(readNativeAudioIndex()).reduce((sum,e)=>sum+
        (e?.path?Math.max(0,Number(e.size)||0):0),0);
}
function offlineStorageAtLimit(){
    // Leave headroom for the next compressed audio file (32 MB worst-case).
    return nativeCacheUsedBytes()+32*1048576>=offlineLimitMb()*1048576;
}
let offlineBatch=null;
const OFFLINE_BATCH_QUEUE_LIMIT=35;
function renderOfflineBatchProgress(extra='') {
    if (!offlineBatch) return;
    const completed=offlineBatch.finished+offlineBatch.failed;
    const message='Офлайн: '+completed+' из '+offlineBatch.total+
        (offlineBatch.failed?' · ошибок: '+offlineBatch.failed:'')+
        (extra?' · '+extra:(completed===offlineBatch.total?' · завершено':''));
    const label=document.getElementById('playlist-download-state');
    if(label)label.textContent=message;
    const bottom=document.getElementById('showcase-download-progress');
    if(bottom)bottom.textContent=message;
    const cache=document.getElementById('cache-progress-info');
    if(cache)cache.textContent=message;
}
function fillOfflineBatchQueue() {
    if (!offlineBatch || offlineBatch.stopped || navigator.onLine === false) return;
    const queue=IS_NATIVE_APP?nativeCacheQueue:webCacheQueue;
    const queued=IS_NATIVE_APP?nativeCacheQueuedUrls:webCacheQueuedUrls;
    while(queue.length<OFFLINE_BATCH_QUEUE_LIMIT && offlineBatch.cursor<offlineBatch.tracks.length) {
        const track=offlineBatch.tracks[offlineBatch.cursor++];
        const url=canonicalTrackUrl(track);
        // An already active/queued download is accounted for by its completion.
        if(queued.has(url))continue;
        if(IS_NATIVE_APP)enqueueNativeTrackCache(track,'playlist');
        else enqueueWebTrackCache(track,'playlist');
        if(!queued.has(url))offlineBatchProgress(url,true);
    }
}
function stopOfflineBatchAtStorageLimit() {
    if(!offlineBatch || offlineBatch.stopped)return;
    offlineBatch.stopped=true;
    const queue=IS_NATIVE_APP?nativeCacheQueue:webCacheQueue;
    const queued=IS_NATIVE_APP?nativeCacheQueuedUrls:webCacheQueuedUrls;
    for(let i=queue.length-1;i>=0;i--) {
        if(queue[i].reason==='playlist'&&offlineBatch.pending.has(queue[i].resolved)) {
            queued.delete(queue[i].resolved);
            queue.splice(i,1);
        }
    }
    offlineBatch.failed+=offlineBatch.pending.size;
    offlineBatch.pending.clear();
    renderOfflineBatchProgress('достигнут лимит '+offlineLimitMb()+' МБ');
}
function offlineBatchProgress(url,failed=false){
    if(!offlineBatch||!offlineBatch.pending.has(url)){
        fillOfflineBatchQueue();
        return;
    }
    offlineBatch.pending.delete(url);
    if(failed)offlineBatch.failed++;
    else offlineBatch.finished++;
    renderOfflineBatchProgress();
    fillOfflineBatchQueue();
}
function toggleTrafficSaver(value){
    localStorage.setItem(STREAM_ECONOMY_KEY,value?'on':'off');
    const input=document.getElementById('traffic-saver-switch');
    if(input)input.checked=!!value;
}
function trafficSaverEnabled(){return localStorage.getItem(STREAM_ECONOMY_KEY)==='on';}
function preparePlaylistDownload(){
    downloadCurrentPlaylistOffline();
}

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
                nativeUrl: file.uri,
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
        !Array.isArray(playbackPlaylist) || playbackPlaylist.length < 2) return;
    const nextIndex = isRepeat ? currentIndex : (currentIndex + 1) % playbackPlaylist.length;
    const nextTrack = playbackPlaylist[nextIndex];
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
    if (IS_NATIVE_APP && reason === 'playlist' && nativeCacheQueue.length >= 35) return;
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

            if(offlineStorageAtLimit()){
                nativeCacheQueuedUrls.delete(job.resolved);
                stopOfflineBatchAtStorageLimit();
                offlineBatchProgress(job.resolved,true);
                const el=document.getElementById('cache-verify-info');
                if(el)el.textContent='Достигнут лимит кэша '+offlineLimitMb()+' МБ. Освободите место или измените лимит.';
                break;
            }
            try {
                if (!await storeNativeTrackNow(job.track, job.reason)) throw new Error('Файл не сохранён');
                nativeCacheQueuedUrls.delete(job.resolved);
                offlineBatchProgress(job.resolved);
                if (job.reason === 'paused-current') notifyPausedCacheReady(job.track);
            } catch (error) {
                job.attempts += 1;
                if (job.attempts < 5) {
                    nativeCacheQueue.push(job);
                    scheduleNativeCacheWorker(Math.min(90000, 6000 * Math.pow(2, job.attempts)));
                    break;
                }
                nativeCacheQueuedUrls.delete(job.resolved);
                offlineBatchProgress(job.resolved,true);
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
            if (!key) continue;
            const entry = await cache.match(key);
            if (!entry) continue;
            const size = (await entry.blob()).size;
            const expected = Number(entry.headers.get('content-length') || 0);
            const mime = (entry.headers.get('content-type') || '').toLowerCase();
            if (size >= 4096 && (!expected || size + 1024 >= expected) &&
                !/text\/html|application\/json|text\/plain/.test(mime)) return true;
            // Do not count an incomplete/HTML response as an offline song.
            await cache.delete(key);
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
                offlineBatchProgress(job.resolved);
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
                offlineBatchProgress(job.resolved,true);
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
    // Automatic preparation is limited to explicitly liked/favorite lists;
    // downloading every playlist silently can exhaust TEYES storage.
    playlists.filter(pl=>/любим|избран|favorite|liked/i.test(String(pl.name||''))).forEach(pl => {
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

// On iOS a Home Screen web app is installed through the system Share menu,
// not via a downloaded IPA or the Android beforeinstallprompt.
const IOS_BANNER_HIDDEN_KEY='dag_ios_banner_dismissed_1';
function showIOSInstallGuide() {
    if(IS_NATIVE_APP)return;
    closeModal('menu-modal');
    const modal=document.getElementById('ios-install-modal');
    if(!modal)return;
    const other=document.getElementById('ios-install-other-browser');
    if(other)other.hidden=!(isIOS&&!getBrowserInfo().safari);
    modal.classList.add('show');
}
function dismissIOSInstallBanner() {
    try {localStorage.setItem(IOS_BANNER_HIDDEN_KEY,'1');}catch(e){}
    document.getElementById('ios-install-banner').hidden=true;
}
function refreshIOSInstallControls() {
    const visible=isIOS&&!IS_NATIVE_APP&&!isAppStandalone();
    const menu=document.getElementById('ios-install-guide-btn');
    const banner=document.getElementById('ios-install-banner');
    if(menu)menu.hidden=!visible;
    if(banner)banner.hidden=!(visible&&localStorage.getItem(IOS_BANNER_HIDDEN_KEY)!=='1');
    const androidApk=document.getElementById('android-apk-download-btn');
    // Never invite iPhone users to download an Android-only APK.
    if(androidApk)androidApk.hidden=isIOS;
}
refreshIOSInstallControls();
window.addEventListener('appinstalled',refreshIOSInstallControls);
if(standaloneMedia?.addEventListener)standaloneMedia.addEventListener('change',refreshIOSInstallControls);


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

        recordConnectivityFailure(e);
        if (e && e.name === 'AbortError') {
            return { error: 'Сервер отвечает слишком долго. Проверьте интернет и повторите.',
                error_code: 'timeout' };
        }
        if (isDnsResolutionFailure(e)) {
            return { error: 'Ошибка DNS: магнитола не может определить адрес pl.dagstudio.ru.',
                error_code: 'dns' };
        }
        if (/SSL|certificate|CERT_/i.test(detail)) {
            return { error: 'Ошибка защищённого соединения с pl.dagstudio.ru.',
                error_code: 'tls' };
        }
        if (/timeout|timed out/i.test(detail)) {
            return { error: 'Сервер pl.dagstudio.ru не ответил вовремя.', error_code: 'timeout' };
        }
        return { error: explainConnectionFailure(e), error_code: 'network' };
    }
}

function renderCurrentPlaylistFromAccountData() {
    // Update the sidebar only when playlist data actually changed (including
    // the last offline snapshot or a fresh server sync).
    window.dispatchEvent(new Event('dag-playlists-updated'));

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
    updatePlayingHeart();
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
        scheduleWaveWarmup();
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
        updatePlayingHeart();
        saveOfflinePlaylistsSnapshot(data);
        renderCurrentPlaylistFromAccountData();
        playlistSyncErrors = 0;
        if (playlistSyncTimer) { clearTimeout(playlistSyncTimer); playlistSyncTimer = null; }
        updatePlaylistSyncStatus('ok', 'Плейлисты синхронизированы · есть локальная копия');
        syncPlaylistOfflineCache();
        showDeviceCacheStatus();
        scheduleWaveWarmup();
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
                thumb:t.thumb, source:t.source, type:t.type || 'audio',
                _smartRadio:!!t._smartRadio
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
renderSmartRadioState();
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
let lastAppNetworkDiagnostics = '';
async function checkPlayerEndpoint(url) {
    const started = Date.now();
    try {
        if (IS_NATIVE_APP) {
            const response = await nativeHttpRequest({
                url: url + (url.includes('?') ? '&' : '?') + 'probe=' + Date.now(),
                method: 'GET',
                headers: { 'Accept':'text/plain,application/json', 'Cache-Control':'no-cache' },
                connectTimeout: 12000, readTimeout: 15000
            });
            const status = Number(response?.status || 0);
            if (status < 200 || status >= 400) return {ok:false,detail:'HTTP ' + status};
        } else {
            const controller = new AbortController();
            const timer = setTimeout(()=>controller.abort(), 18000);
            try {
                const response = await fetch(url + (url.includes('?') ? '&' : '?') + 'probe=' + Date.now(), {
                    signal:controller.signal, cache:'no-store'
                });
                if (!response.ok) return {ok:false,detail:'HTTP ' + response.status};
            } finally { clearTimeout(timer); }
        }
        return {ok:true,detail:'доступен (' + (Date.now()-started) + ' мс)'};
    } catch(error) {
        recordConnectivityFailure(error);
        return {ok:false,dns:isDnsResolutionFailure(error),
            detail: isDnsResolutionFailure(error) ? 'ошибка DNS'
                : explainConnectionFailure(error)};
    }
}
async function testPlayerConnectivity() {
    const out = document.getElementById('connectivity-check-info');
    const button = document.getElementById('connectivity-check-btn');
    if (!out) return;
    if (button) button.disabled = true;
    out.textContent = 'Проверяем соединение с API и сервером обновлений…';
    try {
        const endpoints = [
            ['Сайт и API', DAG_SERVER_ORIGIN + '/deploy-version.txt'],
            ['OTA', NATIVE_UPDATE_META_URL],
            ['GitHub', NATIVE_UPDATE_BACKUP_META_URL]
        ];
        const results = await Promise.all(endpoints.map(async ([label,url])=>
            ({label,...await checkPlayerEndpoint(url)})));
        const dnsCount = results.filter(item=>item.dns).length;
        const reachable = results.filter(item=>item.ok).length;
        lastAppNetworkDiagnostics = 'доступно ' + reachable + '/3';
        const lines = results.map(item=>item.label+': '+(item.ok?'✓ ':'✕ ')+item.detail);
        if (dnsCount >= 2) lines.push('Адреса не определяются на устройстве. Проверьте интернет и DNS; это не ошибка поиска музыкального каталога.');
        else if (!reachable) lines.push('С устройства не удалось связаться с серверами. Попробуйте другую точку доступа.');
        else if (!results[0].ok) lines.push('Нет соединения с API сайта — поиск музыки работать не сможет.');
        else if (!results[1].ok && !results[2].ok) lines.push('Источники OTA недоступны на этом соединении.');
        else lines.push('Соединение с доступными адресами установлено.');
        out.textContent=lines.join('\n');
        refreshPlayerDiagnostics();
    } finally {
        if(button) button.disabled = false;
    }
}

async function probeSourceAudio(track) {
    const url = isDagServerMedia(track?.url) ?
        resolveMediaUrl(track.url) : buildProxyUrl(track, {weak:isWeakConnection(),norange:true});
    if (!url) return {ok:false,code:0};
    const started = Date.now();
    try {
        if (IS_NATIVE_APP) {
            const response = await nativeHttpRequest({
                url, method:'HEAD', connectTimeout:10000, readTimeout:12000,
                headers:{'Cache-Control':'no-cache'}
            });
            const headers = response?.headers || {};
            const contentType=String(headers['content-type'] ||
                headers['Content-Type'] || '').toLowerCase();
            return {ok:[200,206].includes(Number(response?.status)) &&
                contentType.startsWith('audio/'), code:Number(response?.status)||0,
                ms:Date.now()-started};
        }
        const controller = new AbortController();
        const timer=setTimeout(()=>controller.abort(),14000);
        try {
            const response=await fetch(url,{method:'HEAD',signal:controller.signal,cache:'no-store'});
            const type=(response.headers.get('content-type')||'').toLowerCase();
            return {ok:response.ok && type.startsWith('audio/'),
                code:response.status,ms:Date.now()-started};
        } finally { clearTimeout(timer); }
    } catch(e) { return {ok:false,code:0,ms:Date.now()-started}; }
}
async function testMusicSourceHealth() {
    const result=document.getElementById('source-health-info');
    const button=document.getElementById('source-health-test');
    if (!result) return;
    if (button) button.disabled=true;
    result.textContent='Проверяем все 7 источников…';
    const started=Date.now();
    try {
        const response=await api('search_global', {
            query:'Miyagi', page:1, network:getNetworkProfile().weak?'weak':'normal'
        });
        if (response?.error) throw new Error(String(response.error));
        if (!response?.success || !response?.sources) throw new Error('Не получен ответ от поискового API.');
        const sources=[
            {key:'audius',label:'Audius',source:'[AUDIUS]'},
            {key:'vk_mail',label:'VK / Slider',source:'[VK]'},
            {key:'hitmoz',label:'Hitmoz',source:'[HITMOZ]'},
            {key:'muzo',label:'Muzofond',source:'[MUZOFOND]'},
            {key:'zvooq',label:'Zvooq',source:'[ZVOOQ]'},
            {key:'muzvox',label:'MuzVox',source:'[MUZVOX]'},
            {key:'muzca',label:'Muzca',source:'[MUZCA]'}
        ];
        const samples=Array.isArray(response.data)?response.data:[];
        const counts=response.source_counts||{};
        const skipStreams = playbackWanted && bufferedSecondsAhead()<25;
        const lines=sources.map(({key,label,source})=>{
            const info=response.sources[key]||{};
            const count=Number(counts[source])||0;
            const status=info.ok
                ? (count>0?'есть совпадения':'ответ есть, совпадений нет')
                : 'недоступен';
            return label+': поиск '+status+' · '+count+' тр. (HTTP '+
                (Number(info.http)||0)+')';
        });
        const render=()=>{
            result.textContent=['Проверка 7 источников · '+((Date.now()-started)/1000).toFixed(1)+' с',
                ...lines,
                'HTTP 200 — не гарантия аудио. Проверка выполнена из сети сервера DAGSTUDIO.',
                'При слабом сигнале или воспроизведении с малым буфером аудиопроверка пропускается.'
            ].join('\n');
        };
        render();
        if (!skipStreams) {
            // Cap concurrency at three: old sequential seven-HEAD probes could
            // hold the UI up for nearly two minutes on broken providers.
            const pending=sources.map(({source},index)=>{
                const item=samples.find(t=>t?.url&&String(t.source||'').toUpperCase()===source);
                return {index,item};
            }).filter(x=>x.item);
            let cursor=0;
            const worker=async()=>{
                while(cursor<pending.length){
                    const {index,item}=pending[cursor++];
                    const probe=await probeSourceAudio(item);
                    lines[index]+=' · аудио: '+(probe.ok?'отвечает':'ошибка')+
                        ' (HTTP '+probe.code+', '+((probe.ms||0)/1000).toFixed(1)+' с)';
                    render();
                }
            };
            await Promise.all(Array.from({length:Math.min(3,pending.length)},worker));
        }
        const hasMatches=sources.filter(({source})=>Number(counts[source])>0).length;
        lines.push('С результатами по Miyagi: '+hasMatches+' из 7 источников.');
        lines.push('Для других исполнителей результаты могут отличаться. Работа в России без VPN проверяется отдельно на устройстве.');
        render();
        recordPlayerEvent('provider-diagnostics');
    } catch(error) {
        recordConnectivityFailure(error);
        result.textContent='Проверка источников: '+explainConnectionFailure(error);
    } finally { if(button) button.disabled=false; }
}
function copyPlayerDiagnostics() {
    const content=['DAGSTUDIO PLAYER diagnostics',
        document.getElementById('diagnostics-info')?.textContent || '',
        document.getElementById('source-health-info')?.textContent || '',
        document.getElementById('connectivity-check-info')?.textContent || '',
        'Последняя ошибка соединения: '+(lastConnectivityFailure || 'нет')].join('\n');
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
        'Платформа: '+(NATIVE_PLATFORM==='ios'?'iPhone / iPad (Capacitor)':IS_NATIVE_APP?'Android APK':'Браузер / PWA'),
        'Сетевой интерфейс: '+(navigator.onLine?(net.effectiveType||'подключён, доступ в интернет не подтверждён'):'отключён'),
        'Последняя ошибка сети: '+(lastConnectivityFailure || 'нет'),
        'HTTP Android: '+(window.DAG_NATIVE_BRIDGE?.networkTransport?.() || 'нет данных'),
        'Проверка сети: '+(lastAppNetworkDiagnostics || 'ещё не проводилась'),
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
    playTrack(currentIndex,{fromPlayback:true,resumeAt:pos});
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
    if(navigator.onLine===false)return showNotification('Для скачивания нужна сеть.');
    if(!playlist.length)return showNotification('В этом списке нет треков.');
    if(offlineBatch?.pending.size)return showNotification('Загрузка плейлиста уже идёт. Дождитесь завершения.');
    const tracks=playlist.filter(track=>track?.url&&isRemoteMediaUrl(track.url));
    const unique=[],seen=new Set();
    for(const track of tracks){
        const url=canonicalTrackUrl(track);
        if(!url||seen.has(url))continue;
        seen.add(url);
        unique.push(track);
    }
    if(!unique.length)return showNotification('В плейлисте нет доступных для загрузки аудиофайлов.');
    offlineBatch={total:unique.length,finished:0,failed:0,pending:seen,
        tracks:unique,cursor:0,stopped:false};
    const label=document.getElementById('playlist-download-state');
    if(label)label.textContent='Офлайн: 0 из '+unique.length+' · скачиваем по очереди';
    const bottom=document.getElementById('showcase-download-progress');
    if(bottom)bottom.textContent='Офлайн: 0 из '+unique.length+' · скачиваем по очереди';
    const cache=document.getElementById('cache-progress-info');
    if(cache)cache.textContent=label?.textContent||'';
    fillOfflineBatchQueue();
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
                    if (file?.exists && bridge && entry?.path) {
                        await bridge.delete({path:entry.path}).catch(()=>{});
                    }
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
                const mime=(res?.headers.get('content-type')||'').toLowerCase();
                if (size<4096 || (expected && size+1024<expected) ||
                    /text\/html|application\/json|text\/plain/.test(mime)) {
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
    if (nativeCacheWorkerRunning || webCacheWorkerRunning) {
        return showNotification('Дождитесь завершения текущего скачивания перед очисткой.');
    }
    showConfirm('Удалить все скачанные аудиофайлы с этого устройства? Плейлисты и настройки останутся.', async function() {
        if (IS_NATIVE_APP) {
            const bridge=nativeAudioCacheBridge();
            const index=readNativeAudioIndex();
            nativeCacheQueue.length=0; nativeCacheQueuedUrls.clear();
            for (const path of new Set(Object.values(index).map(e=>e?.path).filter(Boolean))) {
                if (bridge) await bridge.delete({path}).catch(()=>{});
            }
            writeNativeAudioIndex({});
            const active = playbackPlaylist[currentIndex];
            if (active) active._playingFromCache = false;
            if (mainAudio?.getAttribute('src')) {
                const current = playbackPlaylist[currentIndex];
                if (current && /^capacitor:|^file:|^https:\/\/localhost\/_capacitor_file_/i.test(mainAudio.src)) {
                    current._resumeTime = Number(mainAudio.currentTime)||Number(current._resumeTime)||0;
                    mainAudio.removeAttribute('src');
                    mainAudio.load();
                }
            }
        } else if ('caches' in window) {
            webCacheQueue.length=0; webCacheQueuedUrls.clear();
            await caches.delete('dag-audio-cache');
        }
        offlineBatch=null;
        await openCacheDashboard();
        const info=document.getElementById('cache-verify-info');
        if(info)info.textContent='Кэш очищен. Плейлисты сохранены.';
    });
}
async function openCacheDashboard() {
    const out=document.getElementById('cache-dashboard-info');
    if(!out)return;
    const saver=document.getElementById('traffic-saver-switch');
    if(saver)saver.checked=trafficSaverEnabled();
    document.getElementById('cache-dashboard-modal').classList.add('show');
    out.textContent='Подсчёт кэша…';
    const urls=new Set();
    playlists.forEach(pl=>(pl.tracks||[]).forEach(t=>{if(t.url)urls.add(canonicalTrackUrl(t));}));
    if(IS_NATIVE_APP) {
        const owner=currentCacheOwner();
        const entries=Object.values(readNativeAudioIndex()).filter(x=>
            x?.path&&Array.isArray(x.owners)&&x.owners.includes(owner));
        const size=entries.reduce((n,x)=>n+(Number(x.size)||0),0);
        const cap=document.getElementById('cache-limit-select');
        if(cap)cap.value=String(offlineLimitMb());
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
function closeModal(id) {
    const element=document.getElementById(id);
    element?.classList.remove('show');
    if(id==='track-manager-modal'){
        if(element)element.hidden=true;
        window.studioCenterRender?.('playlists');
    }
    if(id==='quick-mixes-modal') document.getElementById('header-mixes-btn')?.setAttribute('aria-expanded','false');
}
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
        if(playlistExcludedFromLikes(pl.id))nameWrap.title='Исключён из «Мне нравится»';
        const icon=document.createElement('span');
        icon.className='pl-manage-icon';
        const iconImg=document.createElement('i');
        iconImg.className='fas fa-'+playlistIconName(pl.icon);
        iconImg.setAttribute('aria-hidden','true');
        icon.appendChild(iconImg);
        div.appendChild(icon);
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
    if(!pl)return;
    editingPlaylistId = plId;
    document.getElementById('tm-rename-input').value = plName;
    renderPlaylistIconPicker(plId);
    const linkArea=document.getElementById('tm-add-link-area');
    linkArea.hidden=true;linkArea.style.display='none';
    renderTrackManagerList(pl);
    refreshPlaylistCoverEditor(pl);
    const checkbox=document.getElementById('tm-exclude-likes');
    if(checkbox)checkbox.checked=playlistExcludedFromLikes(plId);
    closeModal('manage-pl-modal'); 
    closeModal('menu-modal');
    const page=document.getElementById('track-manager-modal');
    page.hidden=false;
    page.classList.add('show');
}

function refreshPlaylistCoverEditor(pl){
    const img=document.getElementById('tm-cover-image');
    const placeholder=document.getElementById('tm-cover-placeholder');
    const removal=document.getElementById('tm-cover-remove');
    const cover=playlistCoverUrl(pl?.cover);
    if(img){img.hidden=!cover;if(cover)img.src=cover;else img.removeAttribute('src');}
    if(placeholder)placeholder.hidden=Boolean(cover);
    if(removal)removal.disabled=!cover;
    const status=document.getElementById('tm-cover-status');
    if(status)status.textContent=cover?'Обложка сохранена · используется при воспроизведении':'JPG, PNG или WebP · до 5 МБ';
}
function preparePlaylistCoverData(file){
    return new Promise((resolve,reject)=>{
        const url=URL.createObjectURL(file),img=new Image();
        img.onload=()=>{
            URL.revokeObjectURL(url);
            try{
                const ratio=Math.min(1,720/Math.max(img.naturalWidth,img.naturalHeight));
                const canvas=document.createElement('canvas');
                canvas.width=Math.max(1,Math.round(img.naturalWidth*ratio));
                canvas.height=Math.max(1,Math.round(img.naturalHeight*ratio));
                const context=canvas.getContext('2d');
                if(!context)throw new Error('Canvas unavailable');
                context.drawImage(img,0,0,canvas.width,canvas.height);
                let result=canvas.toDataURL('image/jpeg',.82);
                if(result.length>1850000)result=canvas.toDataURL('image/jpeg',.60);
                if(result.length>1850000)throw new Error('Image too large');
                resolve(result);
            }catch(error){reject(error);}
        };
        img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Invalid image'));};
        img.src=url;
    });
}
async function uploadPlaylistCover(input){
    const file=input.files?.[0];
    if(!file||!editingPlaylistId)return;
    input.value='';
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1048576){
        showNotification('Выберите JPG, PNG или WebP размером до 5 МБ.');return;
    }
    const owner=editingPlaylistId;
    const button=document.getElementById('tm-cover-select');
    const status=document.getElementById('tm-cover-status');
    if(button)button.disabled=true;
    if(status)status.textContent='Подготавливаем фотографию…';
    try{
        const image=await preparePlaylistCoverData(file);
        if(status)status.textContent='Сохраняем обложку…';
        const result=await api('update_playlist_cover',{id:owner,image});
        if(!result?.success)throw new Error(result?.error||'Ошибка сервера');
        const pl=playlists.find(item=>String(item.id)===String(owner));
        if(pl)pl.cover=result.cover;
        saveOfflinePlaylistsSnapshot(playlists);
        if(String(editingPlaylistId)===String(owner))refreshPlaylistCoverEditor(pl);
        window.dispatchEvent(new Event('dag-playlists-updated'));
        window.dispatchEvent(new Event('dag-artwork-updated'));
    }catch(error){
        if(status)status.textContent='Не удалось загрузить изображение';
        showNotification(error?.message||'Не удалось сохранить обложку');
    }finally{if(button)button.disabled=false;}
}
async function removePlaylistCover(){
    const owner=editingPlaylistId;
    if(!owner)return;
    const button=document.getElementById('tm-cover-remove');
    if(button)button.disabled=true;
    try{
        const result=await api('update_playlist_cover',{id:owner,remove:true});
        if(!result?.success)throw new Error(result?.error||'Не удалось сбросить обложку');
        const pl=playlists.find(item=>String(item.id)===String(owner));
        if(pl)pl.cover='';
        saveOfflinePlaylistsSnapshot(playlists);
        refreshPlaylistCoverEditor(pl);
        window.dispatchEvent(new Event('dag-playlists-updated'));
        window.dispatchEvent(new Event('dag-artwork-updated'));
    }catch(error){showNotification(error?.message||'Не удалось сбросить обложку');}
    finally{if(button)button.disabled=false;}
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
        window.dispatchEvent(new Event('dag-playlists-updated'));
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
    area.hidden=false;
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
    const count=document.getElementById('tm-track-count');
    if(count)count.textContent='· '+(pl?.tracks?.length||0);
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
    if (NATIVE_MEDIA3_ACTIVE) return false;
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


const SOURCE_HEALTH_KEY='dag_music_source_health_v1';
function sourceHealthLoad(){
    try{return JSON.parse(localStorage.getItem(SOURCE_HEALTH_KEY)||'{}')||{};}
    catch(e){return {};}
}
function sourceHealthUpdate(track,kind){
    const source=String(track?.source||'UNKNOWN').toUpperCase().slice(0,40),
        all=sourceHealthLoad(),record=all[source]||{success:0,error:0,at:0};
    if(kind==='success')record.success=Math.min(200,(record.success||0)+1);
    else record.error=Math.min(200,(record.error||0)+1);
    record.at=Date.now();all[source]=record;
    try{localStorage.setItem(SOURCE_HEALTH_KEY,JSON.stringify(Object.fromEntries(
        Object.entries(all).sort((a,b)=>(b[1].at||0)-(a[1].at||0)).slice(0,20))));}catch(e){}
}
function sourceHealthScore(source) {
    const r=sourceHealthLoad()[String(source||'UNKNOWN').toUpperCase().slice(0,40)];
    return r?Math.max(-15,Math.min(15,(r.success||0)*2-(r.error||0)*4)):0;
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
    const persisted=!!track.id&&playlists.some(pl=>Array.isArray(pl.tracks)&&
        pl.tracks.some(t=>String(t.id)===String(track.id)));
    const savedArtist = normalizeTrackIdentity(track.artist);

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

    const excluded=new Set([String(track.url||''),...(track._failedAlternateUrls||[])]);
    const ranked=candidates
        .map(candidate=>({candidate,score:scoreReplacementTrack(track,candidate)+
            sourceHealthScore(candidate.source)}))
        .filter(item=>item.score>=(savedArtist?155:85)&&item.candidate?.url&&
            !excluded.has(String(item.candidate.url)))
        .sort((a,b)=>b.score-a.score);

    if (!ranked.length) return false;

    const replacement = ranked[0].candidate;
    const newUrl = String(replacement.url || '').trim();
    if (!newUrl || newUrl === String(track.url || '').trim()) return false;
    if((track._sourceSwitches||0)>=3)return false;
    track._sourceSwitches=(track._sourceSwitches||0)+1;
    track._failedAlternateUrls=[...(track._failedAlternateUrls||[]),String(track.url||'')].slice(-8);

    // Trial-run the URL. A saved playlist is updated only after 12 seconds
    // of successful audio, never merely because a search returned a match.
    track._pendingSaveSource=persisted?{url:newUrl,thumb:replacement.thumb||track.thumb||'',
        source:replacement.source||'',at:Date.now()}:null;
    track.url=newUrl;
    if(replacement.thumb)track.thumb=replacement.thumb;
    track.source=replacement.source||track.source||'';
    track._streamRetries=0;
    track._playingFromCache=false;

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
    if (NATIVE_MEDIA3_ACTIVE && (reason === 'waiting' || reason === 'stalled')) return;
    const track = playbackPlaylist[currentIndex];
    if (!track || !track.url || mainAudio.ended || !playbackWanted) return;
    // Repeated waiting events must not indefinitely postpone the retry.
    if (streamRecoveryTimer) {
        if (reason === 'waiting' || reason === 'stalled') return;
        clearStreamRecoveryTimer();
    }

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
            mainAudio.src = NATIVE_MEDIA3_ACTIVE ? (cached.nativeUrl || cached.url) : cached.url;
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
        const refreshed = (track._sourceSwitches||0)<3 ? await refreshSavedTrackSource(track) : false;
        if (!playbackWanted || token !== currentPlaybackToken ||
            playbackPlaylist[currentIndex] !== track) return;
        if (refreshed && playbackPlaylist[currentIndex] === track) {
            artistEl.textContent = 'Источник обновлён — запускаем…';
            track._streamRetries = 0;
            pendingResumeTime = 0;
            setTimeout(function() {
                if (playbackWanted && playbackPlaylist[currentIndex] === track)
                    playTrack(currentIndex, {fromPlayback:true,recovery:true,resumeAt:resumeAt});
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

    if(track._streamRetries===2&&(track._sourceSwitches||0)<3){
        let changed=false;
        try{changed=await refreshSavedTrackSource(track);}catch(error){
            recordPlayerEvent('alternate-provider-search-failed');}
        if(!playbackWanted||token!==currentPlaybackToken||playbackPlaylist[currentIndex]!==track)return;
        if(changed){
            artistEl.textContent='Другой сервер найден — продолжаем…';
            playTrack(currentIndex,{fromPlayback:true,recovery:true,resumeAt:resumeAt});
            return;
        }
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
    maybePrefetchSmartRadio();

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

function isPrematureTrackEnd(position,duration) {
    const elapsed=Number(position);
    const total=Number(duration);
    if (!Number.isFinite(elapsed) || elapsed < 12) return true;
    // A truncated stream with an unknown duration is not a completed song.
    if (!Number.isFinite(total) || total <= 0) return true;
    return elapsed + 4 < total;
}
function handlePrematureTrackEnd(force=false) {
    const track=playbackPlaylist[currentIndex];
    if (!track || !playbackWanted || !mainAudio.getAttribute('src')) return false;
    const elapsed=Number(mainAudio.currentTime);
    const duration=Number(mainAudio.duration);
    if (!force && !isPrematureTrackEnd(elapsed,duration)) return false;
    recordPlayerEvent('premature-end');
    if (navigator.onLine===false) {
        networkRetryPending=true;
        artistEl.textContent='Нет сети — ждём восстановления этой песни';
        showLoader(false);
    } else if ((track._earlyEndRetries || 0)<5) {
        track._earlyEndRetries=(track._earlyEndRetries||0)+1;
        artistEl.textContent='Поток прервался — продолжаем эту же песню…';
        const token=currentPlaybackToken;
        setTimeout(()=>{
            if (currentPlaybackToken===token && playbackWanted && playbackPlaylist[currentIndex]===track)
                recoverCurrentStream('premature-end').catch(()=>{});
        },Math.min(12000,1200*track._earlyEndRetries));
    } else {
        playbackWanted=false;
        clearStreamRecoveryTimer();
        clearPlaybackWatchdog();
        showLoader(false);
        updateState(false);
        artistEl.textContent='Источник временно недоступен. Нажмите ▶ для повтора.';
        recordPlayerEvent('premature-end-limit');
    }
    return true;
}
mainAudio.addEventListener('prematureend',()=>handlePrematureTrackEnd(true));
mainAudio.addEventListener('ended', function() {
    if (handlePrematureTrackEnd()) return;
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
    if(finishedTrack)tasteRecord('finish',finishedTrack);
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
        maybePrefetchSmartRadio();
        if(mainAudio.currentTime>=10&&track._serverRecordedForUrl!==track.url){
            track._serverRecordedForUrl=track.url;
            sourceHealthUpdate(track,'success');
        }
        if(mainAudio.currentTime>=12&&track._pendingSaveSource&&
            track._pendingSaveSource.url===track.url&&!track._savingNewSource){
            const saved=track._pendingSaveSource;
            track._savingNewSource=true;
            api('update_track_url',{track_id:track.id,url:saved.url,thumb:saved.thumb})
              .then(result=>{
                if(result?.success){
                    const owner=playlists.find(pl=>(pl.tracks||[]).some(t=>String(t.id)===String(track.id)));
                    const original=owner?.tracks?.find(t=>String(t.id)===String(track.id));
                    if(original){original.url=saved.url;original.thumb=saved.thumb;
                        original.source=saved.source;
                        if(currentUser)saveOfflinePlaylistsSnapshot(playlists);}
                    if(track._pendingSaveSource===saved)track._pendingSaveSource=null;
                }
              }).catch(()=>{}).finally(()=>{track._savingNewSource=false;});
        }

        // Count actually heard tracks whether or not they live in a playlist.
        if (mainAudio.currentTime>=10&&track._tasteListenRecordedForUrl!==track.url) {
            track._tasteListenRecordedForUrl=track.url;
            tasteRecord('listen',track);
        }

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
    if(!track._playingFromCache)sourceHealthUpdate(track,'error');
    showLoader(false);
    // Do not skip this song to a different offline track on media errors.
    if (mediaCode === 4 && (track._streamRetries || 0) >= MAX_STREAM_RETRIES) {
        artistEl.textContent = 'Источник не поддерживается на устройстве';
        updateState(false);
        return;
    }
    scheduleStreamRecovery('media-error', getNetworkProfile().weak ? 2500 : 1200);
});

// Offline playback catalog is device-local. It includes music heard from
// searches/radio, not only tracks that happen to be in named playlists.
const OFFLINE_CATALOG_PREFIX='dag_offline_catalog_v1:';
function offlineCatalogKey(){return OFFLINE_CATALOG_PREFIX+String(currentUser||'guest').toLowerCase();}
function offlineCatalogRead(){
    try{const x=JSON.parse(localStorage.getItem(offlineCatalogKey())||'[]');return Array.isArray(x)?x:[];}
    catch(e){return [];}
}
function offlineCatalogRemember(track){
    if(!track?.url||!track?.artist||!track?.title)return;
    const normalized=normalizeCacheTrack(track);
    const previous=offlineCatalogRead().filter(t=>canonicalTrackUrl(t)!==canonicalTrackUrl(normalized));
    previous.unshift({...normalized,lastUsed:Date.now()});
    try{localStorage.setItem(offlineCatalogKey(),JSON.stringify(previous.slice(0,320)));}catch(e){}
}
function offlineCandidateTracks(){
    const seen=new Set(),results=[];
    const add=track=>{
        if(!track?.url||!track.title)return;
        const id=canonicalTrackUrl(track);
        if(!id||seen.has(id))return;
        seen.add(id);results.push(track);
    };
    const index=readNativeAudioIndex(),owner=currentCacheOwner();
    if(IS_NATIVE_APP)for(const row of Object.values(index)){
        if(row?.path&&(!Array.isArray(row.owners)||row.owners.includes(owner)))
            add({title:row.title||'Сохранённая песня',artist:row.artist||'DAGSTUDIO',
                url:row.url,source:row.source||'',thumb:row.thumb||''});
    }
    for(const item of offlineCatalogRead())add(item);
    for(const pl of playlists)for(const t of pl.tracks||[])add(t);
    const state=tasteLoad();
    for(const item of Object.values(state.tracks||{}))if(item?.track)add(item.track);
    const playing=playbackPlaylist[currentIndex];
    if(playing)add(playing);
    return results.slice(0,700);
}
let offlineBuildSerial=0;
async function offlineTrackList(){
    const serial=++offlineBuildSerial,candidates=offlineCandidateTracks(),ready=[];
    for(const track of candidates){
        if(serial!==offlineBuildSerial)return [];
        if(!isRemoteMediaUrl(track.url)){ready.push(track);continue;}
        const cached=await getDeviceCachedAudio(track);
        if(serial!==offlineBuildSerial){
            if(cached?.isBlob)URL.revokeObjectURL(cached.url);
            return [];
        }
        if(cached?.inCache)ready.push(track);
        // getDeviceCachedAudio creates a temporary blob URL for web checks;
        // playTrack obtains a new one only for the actually chosen song.
        if(cached?.isBlob)URL.revokeObjectURL(cached.url);
        if(ready.length>=400)break;
    }
    return ready;
}
function offlineStatus(message){
    const status=document.getElementById('quick-mix-status');
    if(status){status.textContent=message;status.hidden=!message;}
}
async function startOfflineListening(options={}){
    const initialToken=currentPlaybackToken;
    const playing=playbackPlaylist[currentIndex];
    const currentlyWanted=playbackWanted;
    const tracks=await offlineTrackList();
    if(!tracks.length){
        offlineStatus('В памяти нет готовых аудиофайлов. Скачайте плейлист при наличии сети.');
        return false;
    }
    if(options.auto&&(!currentlyWanted||currentPlaybackToken!==initialToken||
        playbackPlaylist[currentIndex]!==playing))return false;
    const existing=playing&&tracks.findIndex(t=>canonicalTrackUrl(t)===canonicalTrackUrl(playing));
    currentTab='offline';
    playlist=tracks;
    renderPlaylist();
    // Keep the actual playback queue in sync with what the user sees.
    const btn=document.getElementById('studio-header-offline');
    if(btn)btn.classList.add('active');
    document.getElementById('studio-header-wave')?.classList.remove('active');
    const label=document.getElementById('active-tab-name');
    if(label){label.textContent='ОФЛАЙН · '+tracks.length+' ПЕСЕН';label.style.display='block';}
    if(existing>=0&&currentlyWanted&&playing?._playingFromCache){
        playbackPlaylist=tracks.slice();playbackTab='offline';currentIndex=existing;
        updateActiveTrackInList(existing);
    }else if(options.autoplay!==false){
        await playTrack(existing>=0?existing:0);
    }
    offlineStatus('Офлайн · '+tracks.length+' проверенных сохранённых треков');
    return true;
}
window.openOfflineListening=function(){return startOfflineListening({autoplay:true});};
window.addEventListener('offline', function() {
    recordPlayerEvent('network-offline');
    if (currentIndex < 0 || mainAudio.ended) return;
    // Keep the selected song and attempt recovery from its own cache.

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
    scheduleWaveWarmup();
    if(radioRetryTimer&&isContinuousRadio()&&playbackWanted){
        clearTimeout(radioRetryTimer);
        radioRetryTimer=null;
        playSmartRadioNext().catch(()=>{});
    }
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
        const selected=targetList[index];
        if(selected){selected._sourceSwitches=0;selected._failedAlternateUrls=[];
            selected._pendingSaveSource=null;}
        recordManualPlaybackTransition();
        playbackPlaylist = [...targetList];
        playbackTab = String(currentTab);
        smartRadioRequestSerial++; // Discard pending suggestions after a manual selection.
        smartRadioPrefetch = null;
        smartShufflePlayed.clear();
        const label=document.getElementById('smart-radio-next-info');
        if (label) label.textContent='Подбор начнётся ближе к концу плейлиста.';
    }
    playbackWanted = true;
    cancelContinuousRadioRetry();
    currentIndex = index;
    if (isShuffle) smartShufflePlayed.add(index);
    // The radio has no song limit, but TEYES must not keep thousands of old
    // audio objects in RAM during a long drive. Retain recent back history.
    if(isContinuousRadio()&&playbackPlaylist.length>150&&currentIndex>100){
        const drop=currentIndex-75;
        playbackPlaylist.splice(0,drop);
        currentIndex-=drop;
        smartShufflePlayed.clear();
    }
    nextTrackPrefetchKey = '';
    streamRecoveryInFlight = false;
    const track = playbackPlaylist[currentIndex];
    offlineCatalogRemember(track);
    if(playbackTab==='mix:wave'&&track?._waveRadio)radioRememberPlayed('wave',track);
    if(playbackTab==='mix:charts')radioRememberPlayed('charts',track);
    currentPlaybackToken++;
    const token = currentPlaybackToken;

    if (!options.recovery) {
        track._streamRetries = 0;
        track._earlyEndRetries = 0;
        track._cachedRecoveryAttempts = 0;
        track._refreshAttempted = false;
    }
    track._serverRecordedForUrl='';
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
    updatePlayingHeart();
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
                artwork: [{ src: playlistCoverUrl(playlists.find(pl=>String(pl.id)===String(playbackTab))?.cover)
                    || track.thumb || 'images/faviconch.png' }]
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
            currentTab!=='offline' && playbackTab!=='offline' &&
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
                finalUrl = NATIVE_MEDIA3_ACTIVE
                    ? (cachedRes.nativeUrl || cachedRes.url) : cachedRes.url;
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
        if (NATIVE_MEDIA3_ACTIVE) {
            window.DAG_ACTIVE_MEDIA_CACHE_KEY = canonicalTrackUrl(track);
            window.DAG_ACTIVE_MEDIA_TITLE = track.title;
            window.DAG_ACTIVE_MEDIA_ARTIST = track.artist;
        }
        mainAudio.src = finalUrl;
        mainAudio.loop = false;
        mainAudio.preload = AUDIO_COMPAT_PROFILE.fullFileFallback ? 'metadata' : 'auto';
        mainAudio.load();

        armPlaybackWatchdog(token, 'startup-timeout');
        await requestAudioPlay();

        if (token !== currentPlaybackToken) return;
        restoreNativeEqualizerAfterPlaybackStart();
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
    // Media3 reports its own real state to the same Android MediaSession.
    if (NATIVE_MEDIA3_ACTIVE) return;
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
    cancelContinuousRadioRetry();
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


// Private, per-account listening profile stored only on this device.
// No listening history is sent to the DAGSTUDIO server by this feature.
const TASTE_STORAGE_PREFIX='dag_taste_v1_';
function tasteOwnerKey() { return String(currentUser||'guest').toLowerCase().slice(0,80); }
function tasteTrackId(track) {
    return normalizeTrackIdentity(track?.artist)+'|'+normalizeTrackIdentity(track?.title);
}
function tasteLoad() {
    try { const t=JSON.parse(localStorage.getItem(TASTE_STORAGE_PREFIX+tasteOwnerKey())||'null');
        return t&&typeof t==='object'&&t.tracks&&t.artists?
            {...t,genres:t.genres||{}}:{tracks:{},artists:{},regions:{},genres:{}}; }
    catch(e){return {tracks:{},artists:{},regions:{},genres:{}};}
}
function tasteSave(state) {
    const trim=(dict,limit)=>Object.fromEntries(Object.entries(dict||{})
        .sort((a,b)=>(b[1].at||0)-(a[1].at||0)).slice(0,limit));
    try {localStorage.setItem(TASTE_STORAGE_PREFIX+tasteOwnerKey(),JSON.stringify({
        tracks:trim(state.tracks,350),artists:trim(state.artists,100),
        regions:trim(state.regions,30),genres:trim(state.genres,25)
    }));}catch(e){}
}
function tasteRecord(kind,track) {
    if(!track?.artist||!track?.title||!['listen','finish','skip','like','dislike'].includes(kind))return;
    const state=tasteLoad(),id=tasteTrackId(track),artist=normalizeTrackIdentity(track.artist);
    if(!id||!artist)return;
    const change=kind==='like'?5:kind==='finish'?3:kind==='listen'?1:kind==='dislike'?-8:-2;
    const now=Date.now();
    const update=(dict,key)=>{
        if(!key)return;
        const obj=dict[key]||{score:0,at:0};
        obj.score=Math.max(-40,Math.min(80,(Number(obj.score)||0)+change));
        obj.at=now;
        dict[key]=obj;
    };
    update(state.tracks,id);update(state.artists,artist);
    // Keep only playable, user-approved or fully completed tracks in the wave.
    // Do not store a listening event as a like; skipped/disliked tracks are excluded.
    const saved=state.tracks[id];
    if(kind==='like'||kind==='finish'||kind==='listen') {
        if(track.url&&/^https?:\/\//i.test(String(track.url))) {
            saved.track={title:String(track.title).slice(0,180),
                artist:String(track.artist).slice(0,120),url:String(track.url),
                thumb:String(track.thumb||'').slice(0,600),
                source:String(track.source||'').slice(0,80),genre:String(track.genre||'').slice(0,65)};
            if(kind!=='listen')saved.positive=true;
            saved[kind]=true;
        }
    } else if(kind==='dislike') {
        saved.positive=false;
    }
    state.artists[artist].label=String(track.artist).slice(0,100);
    const genre=normalizeTrackIdentity(track.genre);
    if(genre&&genre.length>=3&&genre.length<45)update(state.genres,genre);
    if(track._mixRegion)update(state.regions,String(track._mixRegion));
    tasteSave(state);
    const hint=document.getElementById('personal-radio-hint');
    if(hint)hint.textContent='Предпочтения обновлены на этом устройстве';
}
function tastePositiveTracks() {
    const state=tasteLoad(),result=[],seen=new Set();
    function add(track) {
        if(!track?.url||!track.title||!track.artist)return;
        const identity=tasteTrackId(track);
        if(state.tracks?.[identity]?.positive===false)return;
        if(seen.has(identity))return;
        seen.add(identity);result.push(track);
    }
    // Only user-approved or fully heard tracks seed the personal radio.
    // Playlist membership alone does not make the Wave a copy of the library.
    for(const pl of playlists)for(const track of (pl.tracks||[]))
        if(state.tracks?.[tasteTrackId(track)]?.positive)add(track);
    // Complete plays are persisted locally for the current account/device.
    for(const record of Object.values(state.tracks||{}).sort((a,b)=>(b.at||0)-(a.at||0)))
        if((record?.positive||record?.listen)&&record.track)add(record.track);
    return result;
}

// The Wave learns from explicitly included playlists and listening history.
// Excluded playlists are deliberately not used as recommendation seeds.
function waveLibrarySeeds(){
    const learned=tasteLoad(),seeds=[],ids=new Set();
    const append=track=>{
        if(!track?.url||!track?.artist||!track?.title)return;
        const key=tasteTrackId(track);
        if(!key||ids.has(key)||learned.tracks?.[key]?.positive===false)return;
        ids.add(key);seeds.push(track);
    };
    const excludedIds=new Set();
    for(const pl of playlists||[])if(playlistExcludedFromLikes(pl.id))
        for(const t of pl.tracks||[])excludedIds.add(tasteTrackId(t));
    for(const pl of playlists||[])if(!playlistExcludedFromLikes(pl.id))
        for(const track of pl.tracks||[])append(track);
    for(const track of tastePositiveTracks())
        if(!excludedIds.has(tasteTrackId(track)))append(track);
    return seeds;
}
// Persist a bounded play history so reopening a radio station does not keep
// choosing the same first search result. Old entries eventually age out.
const RADIO_RECENT_PREFIX='dag_radio_recent_v2:';
function radioHistoryKey(kind){return RADIO_RECENT_PREFIX+tasteOwnerKey()+':'+kind;}
function radioTrackIdentity(track){return tasteTrackId(track)||canonicalTrackUrl(track);}
function radioRecentTracks(kind){
    try{
        const stored=JSON.parse(localStorage.getItem(radioHistoryKey(kind))||'[]');
        return Array.isArray(stored)?stored.filter(x=>typeof x==='string').slice(0,180):[];
    }catch(e){return [];}
}
function radioRememberPlayed(kind,track){
    const key=radioTrackIdentity(track);
    if(!key)return;
    try{localStorage.setItem(radioHistoryKey(kind),JSON.stringify(
        [key,...radioRecentTracks(kind).filter(item=>item!==key)].slice(0,180)));
    }catch(e){}
}
const WAVE_CURSOR_PREFIX='dag_wave_cursor_v2:';
let waveSearchCursor=0,waveSearchOwner='';
function nextWaveSearchCursor(){
    const owner=tasteOwnerKey();
    if(owner!==waveSearchOwner){
        waveSearchOwner=owner;
        let saved=0;
        try{saved=Number(localStorage.getItem(WAVE_CURSOR_PREFIX+owner));}catch(e){}
        waveSearchCursor=Number.isSafeInteger(saved)&&saved>0?saved:
            Math.floor(Math.random()*59)+1;
    }
    const index=waveSearchCursor++;
    try{localStorage.setItem(WAVE_CURSOR_PREFIX+owner,String(waveSearchCursor));}catch(e){}
    return index;
}
async function radioSearchPage(query,page,net){
    const options={query,page,network:net.weak?'weak':'normal',
        save_data:net.saveData?1:0};
    let response=null;
    try{response=await api('search_global',options);}catch(e){
        if(page===1)throw e;
    }
    // Some providers have only one page. Always try their main page before
    // declaring an idle Wave/Charts station out of music.
    if(page>1&&(!response?.success||!Array.isArray(response.data)||!response.data.length))
        response=await api('search_global',{...options,page:1});
    return response;
}
async function findWaveNextTrack(){
    if(navigator.onLine===false)return null;
    const library=waveLibrarySeeds();
    if(!library.length)return null;
    // Never play a song already saved in any playlist, including excluded
    // collections. Exclusions also keep their performers out of wave seeds.
    const excluded=new Set((playlists||[]).filter(pl=>playlistExcludedFromLikes(pl.id))
        .flatMap(pl=>pl.tracks||[]).map(t=>tasteTrackId(t)));
    const saved=(playlists||[]).flatMap(pl=>pl.tracks||[]);
    const known=[...saved,...playbackPlaylist,...playbackQueue];
    const titles=new Set(known.map(t=>normalizeTrackIdentity(t.artist)+'|'+normalizeTrackIdentity(t.title)));
    const urls=new Set(known.map(t=>String(t.url||'')));
    const seen=track=>!track?.url||excluded.has(tasteTrackId(track))||urls.has(String(track.url))||
        titles.has(normalizeTrackIdentity(track.artist)+'|'+normalizeTrackIdentity(track.title));
    const prior=playbackPlaylist[currentIndex]?.artist||'';
    const history=new Set(radioRecentTracks('wave'));
    let previouslyPlayed=null;
    // Prefer verified recent tracks and other singers; the user shouldn't hear
    // the same performer repeatedly just because a server ranked them first.
    function choose(pool){
        const eligible=quickMixRankTracks(quickMixUnique(pool).filter(t=>!seen(t)),
             {mode:'popular'});
        if(!eligible.length)return null;
        const fresh=eligible.filter(t=>{
            const date=quickMixReleaseTimestamp(t);
            return date&&Date.now()-date<=365*86400000;
        });
        const candidates=fresh.length?fresh:eligible;
        const other=candidates.filter(t=>
            normalizeTrackIdentity(t.artist)!==normalizeTrackIdentity(prior));
        const choices=other.length?other:candidates;
        const unheard=choices.filter(t=>!history.has(radioTrackIdentity(t)));
        if(!unheard.length){
            if(!previouslyPlayed)previouslyPlayed=choices[0];
            return null;
        }
        // Take one of the leading recommendations, not always result #1.
        const shortlist=unheard.slice(0,Math.min(6,unheard.length));
        return shortlist[Math.floor(Math.random()*shortlist.length)]||null;
    }
    // The library supplies search directions only: NEVER use its saved audio
    // as a playable result. Old preference data from excluded playlists must
    // not leak into the queries either.
    const names=[...new Set([
       ...library.map(t=>String(t.artist||'').trim()),
       ...library.map(t=>String(t.genre||'').trim())
    ])].filter(Boolean).slice(0,90);
    if(!names.length)return null;
    const net=getNetworkProfile();
    // Rotate artists and pages so a finished song advances discovery instead of
    // replaying the first search page or repeating only one singer.
    for(let i=0;i<Math.min(net.weak?2:3,names.length);i++){
        const count=nextWaveSearchCursor();
        const query=names[count%names.length];
        const page=1+Math.floor(count/names.length)%12;
        try{
            const response=await radioSearchPage(query,page,net);
            if(response?.success&&Array.isArray(response.data)){
                const found=choose(response.data);
                if(found)return {...found,_smartRadio:true,_waveRadio:true};
            }
        }catch(e){recordPlayerEvent('wave-discovery-error');}
    }
    // Only relax the rotating history after trying other search directions.
    // Without this, a small provider catalog could leave radio permanently idle.
    return previouslyPlayed?{...previouslyPlayed,_smartRadio:true,_waveRadio:true}:null;
}
// Prepare the first recommendation while the player is idle. This is only a
// background discovery/cache hint: audio never starts without a user action.
let waveWarmState=null,waveWarmTimer=null;
function waveWarmCandidateAllowed(track){
    if(!track?._waveRadio||!track.url)return false;
    if(radioRecentTracks('wave').includes(radioTrackIdentity(track)))return false;
    return !(playlists||[]).some(pl=>(pl.tracks||[]).some(saved=>
        canonicalTrackUrl(saved)===canonicalTrackUrl(track)||
        radioTrackIdentity(saved)===radioTrackIdentity(track)));
}
function warmWaveFirstTrack(){
    if(navigator.onLine===false||playbackWanted||!waveLibrarySeeds().length)
        return Promise.resolve(null);
    const owner=tasteOwnerKey();
    if(waveWarmState?.owner===owner){
        if(waveWarmState.candidate&&Date.now()-waveWarmState.at<15*60*1000&&
            waveWarmCandidateAllowed(waveWarmState.candidate))
            return Promise.resolve(waveWarmState.candidate);
        if(waveWarmState.promise)return waveWarmState.promise;
    }
    const state={owner,at:Date.now(),candidate:null,promise:null};
    waveWarmState=state;
    state.promise=findWaveNextTrack().then(candidate=>{
        if(waveWarmState!==state||owner!==tasteOwnerKey())return null;
        state.candidate=waveWarmCandidateAllowed(candidate)?candidate:null;
        if(state.candidate&&!playbackWanted&&navigator.onLine!==false&&
            !getNetworkProfile().weak&&!trafficSaverEnabled())
            cacheTrackSilently(state.candidate,{reason:'next'});
        return state.candidate;
    }).catch(()=>null).finally(()=>{state.promise=null;});
    return state.promise;
}
function scheduleWaveWarmup(){
    clearTimeout(waveWarmTimer);
    waveWarmTimer=setTimeout(()=>{
        if(!document.hidden)warmWaveFirstTrack().catch(()=>{});
    },800);
}
window.addEventListener('dag-library-changed',()=>{
    waveWarmState=null;
    scheduleWaveWarmup();
});

// Explicit library favourites are different from listening-derived Wave.
const LIKES_EXCLUSIONS_PREFIX='dag_likes_exclusions_v1:';
function playlistLikesExclusions(){
    try {
        const x=JSON.parse(localStorage.getItem(LIKES_EXCLUSIONS_PREFIX+tasteOwnerKey())||'{}');
        return x&&typeof x==='object'?x:{};
    }catch(e){return {};}
}
function playlistExcludedFromLikes(id) {
    return playlistLikesExclusions()[String(id)]===true;
}
function setPlaylistExcludedFromLikes(id,excluded) {
    const data=playlistLikesExclusions();
    if(excluded)data[String(id)]=true;
    else delete data[String(id)];
    try{localStorage.setItem(LIKES_EXCLUSIONS_PREFIX+tasteOwnerKey(),JSON.stringify(data));}catch(e){}
    window.dispatchEvent(new CustomEvent('dag-library-changed'));
}
function likedPlaylistTracks(){
    const result=[],known=new Set();
    for(const pl of playlists){
        if(playlistExcludedFromLikes(pl.id))continue;
        for(const t of pl.tracks||[]){
            if(!t?.url)continue;
            const id=tasteTrackId(t)||canonicalTrackUrl(t);
            if(!id||known.has(id))continue;
            known.add(id);result.push(t);
        }
    }
    return result;
}
function tastePreferredArtists(seeds=[]) {
    const state=tasteLoad(),names=new Map();
    for(const [name,data] of Object.entries(state.artists||{}))
        if(data?.label)names.set(name,data.label);
    for(const track of seeds)if(track?.artist&&!track?._smartRadio)
        names.set(normalizeTrackIdentity(track.artist),String(track.artist));
    for(const record of Object.values(state.tracks||{}))if(record?.track?.artist)
        names.set(normalizeTrackIdentity(record.track.artist),String(record.track.artist));
    const sorted=Object.entries(state.artists||{}).sort((a,b)=>b[1].score-a[1].score);
    const ranked=sorted.filter(([name,data])=>data.score>0&&names.has(name)).map(([name])=>names.get(name));
    const current=smartRadioQueryArtists(seeds);
    return [...new Set([...ranked,...current])].filter(Boolean).slice(0,24);
}
function tastePreferredGenres() {
    const state=tasteLoad();
    return Object.entries(state.genres||{}).filter(([,record])=>record.score>=2)
        .sort((a,b)=>b[1].score-a[1].score).slice(0,4).map(([genre])=>genre);
}
function tasteCandidateScore(track,seedArtists=[]) {
    const state=tasteLoad();
    const artist=normalizeTrackIdentity(track?.artist),id=tasteTrackId(track);
    const record=Number(state.tracks?.[id]?.score||0);
    if(record<=-5)return -1000;
    const positiveArtist=Number(state.artists?.[artist]?.score||0);
    const genre=normalizeTrackIdentity(track?.genre);
    const positiveGenre=genre?Number(state.genres?.[genre]?.score||0):0;
    const belongs=seedArtists.some(v=>normalizeTrackIdentity(v)===artist);
    return record*2+positiveArtist*3+positiveGenre*2+(belongs?8:0);
}
function tasteReset() {
    showConfirm('Очистить локальную историю предпочтений на этом устройстве?',()=>{
        localStorage.removeItem(TASTE_STORAGE_PREFIX+tasteOwnerKey());
        const hint=document.getElementById('personal-radio-hint');
        if(hint)hint.textContent='Предпочтения сброшены';
    });
}
function dislikeCurrentTrack() {
    const track=playbackPlaylist[currentIndex];
    if(!track)return;
    tasteRecord('dislike',track);
    const hint=document.getElementById('personal-radio-hint');
    if(hint)hint.textContent='Эту песню реже будем предлагать';
    if(playbackWanted)playNext();
}
function recordManualPlaybackTransition() {
    const previous=playbackPlaylist[currentIndex];
    if(!previous||!playbackWanted||mainAudio.ended)return;
    const secs=Number(mainAudio.currentTime)||0,duration=Number(mainAudio.duration)||0;
    if(secs>=5&&(duration<=0||secs<duration*.5))tasteRecord('skip',previous);
}

// SMART RADIO MATCHER START
function smartRadioNormalize(value) {
    return String(value || '').toLowerCase()
        .replace(/\([^)]*(?:remix|live|cover|instrumental)[^)]*\)/gi, ' ')
        .replace(/[^a-zа-яё0-9]+/gi, ' ').replace(/\s+/g, ' ').trim();
}
function smartRadioArtistTokens(artist) {
    return smartRadioNormalize(artist)
        .split(/\s+/).filter(token => token.length >= 3 &&
            !['feat','featuring','with','the','and','remix','official','music'].includes(token));
}
function smartRadioIdentity(track) {
    return smartRadioNormalize(track?.artist) + '|' + smartRadioNormalize(track?.title);
}
function smartRadioQueryArtists(tracks) {
    const names = [];
    const seen = new Set();
    for (const track of tracks) {
        if (track?._smartRadio || !track?.artist) continue;
        const artist = String(track.artist).split(/\s+(?:feat\.?|ft\.?|featuring)\s+/i)[0]
            .split(/\s*(?:&|,|\/|\s+x\s+)\s*/i)[0].trim();
        const normalized = smartRadioNormalize(artist);
        if (!normalized || seen.has(normalized) || normalized.length < 3) continue;
        seen.add(normalized);
        names.push(artist);
    }
    return names;
}
function smartRadioPickCandidate(candidates, seeds, knownTracks, randomValue = Math.random()) {
    const seedArtists = seeds.filter(t => !t?._smartRadio)
        .flatMap(t => smartRadioArtistTokens(t.artist));
    const seedTokens = new Set(seedArtists);
    if (!seedTokens.size) return null;
    const knownUrls = new Set(knownTracks.map(t => String(t.url || '').trim()));
    const knownNames = new Set(knownTracks.map(smartRadioIdentity));
    const ranked = [];
    for (const track of candidates || []) {
        if (!track?.url || !track?.title || !track?.artist || !/^https?:\/\//i.test(track.url)) continue;
        if (knownUrls.has(String(track.url).trim()) || knownNames.has(smartRadioIdentity(track))) continue;
        const artist = smartRadioArtistTokens(track.artist);
        const shared = artist.filter(token => seedTokens.has(token));
        const taste = tasteCandidateScore(track,seeds.map(s=>s.artist));
        if(taste<=-1000)continue;
        // A recommendation must match a seed artist or a positively learned
        // artist. Do not guess genre similarity from a song title.
        if(!shared.length&&taste<=0)continue;
        const score=shared.length*4+(artist.length===shared.length?2:0)+taste;
        ranked.push({track,score});
    }
    if (!ranked.length) return null;
    ranked.sort((a,b) => b.score - a.score);
    const best = ranked[0].score;
    const shortlist = ranked.filter(entry => entry.score >= best - 4).slice(0, 25);
    const index = Math.min(shortlist.length - 1,
        Math.floor(Math.max(0, Math.min(0.999999, Number(randomValue) || 0)) * shortlist.length));
    return shortlist[index].track;
}
// SMART RADIO MATCHER END

function renderSmartRadioState() {
    const menu = document.getElementById('smart-radio-menu-btn');
    const queue = document.getElementById('smart-radio-queue-btn');
    for (const button of [menu,queue]) {
        if (!button) continue;
        button.setAttribute('aria-pressed',smartRadioEnabled?'true':'false');
        button.classList.toggle('active',smartRadioEnabled);
    }
    const text = smartRadioEnabled ? 'Умное продолжение: включено' : 'Умное продолжение: выключено';
    const menuLabel = document.getElementById('smart-radio-menu-label');
    const queueLabel = document.getElementById('smart-radio-queue-label');
    if (menuLabel) menuLabel.textContent = text;
    if (queueLabel) queueLabel.textContent = text;
}
function toggleSmartRadio() {
    smartRadioEnabled = !smartRadioEnabled;
    localStorage.setItem(SMART_RADIO_KEY,smartRadioEnabled?'on':'off');
    smartRadioRequestSerial++;
    smartRadioPrefetch = null;
    renderSmartRadioState();
    const label=document.getElementById('smart-radio-next-info');
    if(label) label.textContent=smartRadioEnabled?'Похожие песни появятся ближе к концу плейлиста.':'Умное продолжение выключено.';
}
async function findSmartRadioTrack() {
    if (navigator.onLine === false) return null;
    const seeds = playbackPlaylist.filter(t => !t._smartRadio);
    const artists = tastePreferredArtists(seeds);
    const genres=tastePreferredGenres();
    if (!artists.length&&!genres.length) return null;
    const seen = [...playbackPlaylist,...playbackQueue];
    const searches=[...artists,...genres.filter(g=>!artists.some(a=>normalizeTrackIdentity(a)===g))];
    const start = smartRadioSearchCursor++ % searches.length;
    const page = 1 + Math.floor(smartRadioSearchCursor / Math.max(1,searches.length)) % 3;
    const net = getNetworkProfile();
    // No more than three searches on an automatic transition.
    for (let i=0; i<Math.min(3,searches.length); i++) {
        const artist = searches[(start+i)%searches.length];
        const response = await api('search_global',{
            query:artist,page:i===0?page:1,
            network:net.weak?'weak':'normal',save_data:net.saveData?1:0
        });
        if (!response?.success || !Array.isArray(response.data)) continue;
        const picked = smartRadioPickCandidate(response.data,seeds,seen,Math.random());
        if (picked) return {...picked,_smartRadio:true};
    }
    return null;
}
let chartSearchCursor=0,chartSearchOwner='';
function nextChartSearchCursor(){
    const owner=tasteOwnerKey();
    if(owner!==chartSearchOwner){
        chartSearchOwner=owner;
        let saved=0;
        try{saved=Number(localStorage.getItem('dag_chart_cursor_v1:'+owner));}catch(e){}
        chartSearchCursor=Number.isSafeInteger(saved)&&saved>0?saved:
            Math.floor(Math.random()*43)+1;
    }
    const next=chartSearchCursor++;
    try{localStorage.setItem('dag_chart_cursor_v1:'+owner,String(chartSearchCursor));}catch(e){}
    return next;
}
async function findChartNextTrack(){
    if(navigator.onLine===false)return null;
    const config=QUICK_MIXES.charts;
    const queries=[...new Set([`новинки ${new Date().getFullYear()}`,...config.artists])];
    const net=getNetworkProfile();
    const known=[...playbackPlaylist,...playbackQueue];
    const history=new Set(radioRecentTracks('charts'));
    const prior=normalizeTrackIdentity(playbackPlaylist[currentIndex]?.artist);
    let fallback=null;
    for(let i=0;i<Math.min(4,queries.length);i++){
        const cursor=nextChartSearchCursor();
        const query=queries[cursor%queries.length];
        const page=1+Math.floor(cursor/queries.length)%12;
        try{
            const response=await radioSearchPage(query,page,net);
            if(!response?.success||!Array.isArray(response.data))continue;
            const available=quickMixRankTracks(quickMixUnique(response.data,known),config);
            const newToListener=available.filter(t=>!history.has(radioTrackIdentity(t)));
            const distinctArtist=newToListener.filter(t=>normalizeTrackIdentity(t.artist)!==prior);
            const choices=distinctArtist.length?distinctArtist:newToListener;
            const verified=choices.filter(t=>{
                const date=quickMixReleaseTimestamp(t);
                return date&&Date.now()-date<=365*86400000;
            });
            const ranked=verified.length?verified:choices;
            if(ranked.length){
                const shortlist=ranked.slice(0,Math.min(6,ranked.length));
                const picked=shortlist[Math.floor(Math.random()*shortlist.length)];
                return {...picked,_quickMix:true,_smartRadio:true,_chartRadio:true};
            }
            if(!fallback&&available.length)fallback=available[0];
        }catch(e){recordPlayerEvent('charts-discovery-error');}
    }
    // Relax only the rolling history, not the current queue's identities.
    return fallback?{...fallback,_quickMix:true,_smartRadio:true,_chartRadio:true}:null;
}
function isContinuousRadio(){return playbackTab==='mix:wave'||playbackTab==='mix:charts';}
function maybePrefetchSmartRadio() {
    if ((trafficSaverEnabled()&&!isContinuousRadio()) ||
        (!smartRadioEnabled && !isContinuousRadio()) ||
        smartRadioBusy || isRepeat || playbackQueue.length ||
        playbackTab==='search' || navigator.onLine===false || !playbackWanted ||
        currentIndex!==playbackPlaylist.length-1 || !playbackPlaylist[currentIndex]) return;
    if (isShuffle && smartShufflePlayed.size < playbackPlaylist.length) return;
    const duration = Number(mainAudio.duration);
    const position = Number(mainAudio.currentTime);
    if (!Number.isFinite(position) || position < (isContinuousRadio()?0:8))return;
    const remaining=duration-position;
    if(!isContinuousRadio()&&(!Number.isFinite(duration)||duration<=0||
        remaining>95||remaining<0))return;
    // Only search/download when enough of the current song is buffered; on
    // mobile radio we must not trade reliable sound for recommendations.
    if (!playbackPlaylist[currentIndex]._playingFromCache &&
        !isCurrentTrackFullyReady() && bufferedSecondsAhead() < 12) return;
    const token=currentPlaybackToken, serial=smartRadioRequestSerial;
    if (smartRadioPrefetch?.token === token && smartRadioPrefetch.serial === serial) return;
    const state={token,serial,candidate:null,promise:null};
    smartRadioPrefetch=state;
    const info=document.getElementById('smart-radio-next-info');
    if (info) info.textContent='Следующий из сети: подбираем…';
    state.promise=(playbackTab==='mix:wave'?findWaveNextTrack():
        playbackTab==='mix:charts'?findChartNextTrack():findSmartRadioTrack()).then(candidate=>{
        if (smartRadioPrefetch !== state || token!==currentPlaybackToken ||
            serial!==smartRadioRequestSerial ||
            (!smartRadioEnabled&&!isContinuousRadio())) return null;
        state.candidate=candidate;
        if (candidate) {
            if(isContinuousRadio()&&currentIndex===playbackPlaylist.length-1){
                playbackPlaylist.push(candidate);
                state.queued=true;
                if(playbackTab==='mix:charts')addChartRadioTrack(candidate);
                renderPlaybackQueue();
            }
            if (info) info.textContent='Следующий из сети: '+candidate.artist+' — '+candidate.title;
            if (isCurrentTrackFullyReady() ||
                (!getNetworkProfile().weak && bufferedSecondsAhead()>=25)) {
                cacheTrackSilently(candidate,{reason:'next',priority:true});
            }
        } else if (info) info.textContent='Подбор продолжится после текущего трека.';
        return candidate;
    }).catch(()=>{
        if (smartRadioPrefetch===state && info)
            info.textContent='Подбор продолжится после текущего трека.';
        return null;
    });
}
let radioRetryTimer=null,radioRetryAttempts=0;
function cancelContinuousRadioRetry(){
    clearTimeout(radioRetryTimer);
    radioRetryTimer=null;
    radioRetryAttempts=0;
}
function scheduleContinuousRadioRetry(){
    if(!isContinuousRadio()||!playbackWanted||radioRetryTimer)return;
    const token=currentPlaybackToken,serial=smartRadioRequestSerial;
    const mode=playbackTab;
    const delay=Math.min(45000,3500+radioRetryAttempts++*4500);
    radioRetryTimer=setTimeout(()=>{
        radioRetryTimer=null;
        if(playbackWanted&&playbackTab===mode&&
            token===currentPlaybackToken&&serial===smartRadioRequestSerial)
            playSmartRadioNext().catch(()=>{});
    },delay);
}
async function playSmartRadioNext() {
    if (smartRadioBusy) return true;
    if (!smartRadioEnabled&&!isContinuousRadio()) return false;
    if (playbackTab==='search' || !playbackPlaylist.length) return false;
    if(navigator.onLine===false){
        if(!isContinuousRadio())return false;
        showLoader(false);
        const hint=document.getElementById('smart-radio-next-info');
        if(hint)hint.textContent='Ждём интернет для новых песен…';
        scheduleContinuousRadioRetry();
        return true;
    }
    smartRadioBusy=true;
    const prefetched=smartRadioPrefetch;
    // Keep the in-flight search valid until its result is consumed.
    const serial=smartRadioRequestSerial;
    const token=currentPlaybackToken;
    showLoader(true);
    artistEl.textContent='Подбираем похожую музыку из сети…';
    try {
        // Most tracks are selected before the playlist ends. If an earlier
        // network request is still in flight, wait briefly rather than start
        // several competing provider searches on TEYES mobile radio.
        let candidate=prefetched?.candidate || null;
        if(isContinuousRadio()&&prefetched?.queued&&candidate){
            const idx=playbackPlaylist.indexOf(candidate);
            if(idx>currentIndex){
                smartRadioPrefetch=null;cancelContinuousRadioRetry();
                playTrack(idx,{fromPlayback:true,fromSmartRadio:true});
                return true;
            }
        }
        if (!candidate && prefetched?.promise && prefetched.token===token) {
            candidate=await Promise.race([
                prefetched.promise,
                new Promise(resolve=>setTimeout(()=>resolve(null),5500))
            ]);
        }
        // A search can finish and enqueue its result while Next is awaiting
        // that same promise. Consume it once, without duplicating the song.
        if(isContinuousRadio()&&prefetched?.queued&&candidate){
            const queuedIndex=playbackPlaylist.indexOf(candidate);
            if(queuedIndex>currentIndex){
                smartRadioPrefetch=null;cancelContinuousRadioRetry();
                playTrack(queuedIndex,{fromPlayback:true,fromSmartRadio:true});
                return true;
            }
        }
        if (smartRadioPrefetch===prefetched) smartRadioPrefetch=null;
        if (serial!==smartRadioRequestSerial || token!==currentPlaybackToken ||
            (!smartRadioEnabled&&!isContinuousRadio()) || !playbackWanted) return true;
        if (!candidate || (playbackTab==='mix:wave'&&!candidate._waveRadio)||
            (playbackTab==='mix:charts'&&!candidate._chartRadio))
            candidate=playbackTab==='mix:wave'?
                await findWaveNextTrack():playbackTab==='mix:charts'?
                await findChartNextTrack():await findSmartRadioTrack();
        if (serial!==smartRadioRequestSerial || token!==currentPlaybackToken ||
            (!smartRadioEnabled&&!isContinuousRadio()) || !playbackWanted) return true;
        if (candidate) {
            // Keep the current and original list; don't overwrite the browsed playlist.
            // Wave is a continuous radio. Queue the new discovery directly
            // behind the current song and never display the track list.
            playbackPlaylist.push(candidate);
            if (playbackPlaylist.length > 150) {
                const old=playbackPlaylist.findIndex((t,i)=>t._smartRadio && i<currentIndex);
                if (old>=0) { playbackPlaylist.splice(old,1); currentIndex--; }
            }
            const next=document.getElementById('smart-radio-next-info');
            if (next) next.textContent='Сейчас из сети: '+candidate.artist+' — '+candidate.title;
            if(playbackTab==='mix:charts')addChartRadioTrack(candidate);
            recordPlayerEvent('smart-radio-next');
            cancelContinuousRadioRetry();
            playTrack(playbackPlaylist.length-1,{fromPlayback:true,fromSmartRadio:true});
            return true;
        }
        const hint=document.getElementById('smart-radio-next-info');
        if(hint) hint.textContent='Похожих треков пока нет. Повторяем плейлист.';
    } catch(error) {
        if (serial===smartRadioRequestSerial && token===currentPlaybackToken)
            recordPlayerEvent('smart-radio-search-failed');
    } finally {
        smartRadioBusy=false;
    }
    // A personal wave must never fall back to replaying the first library
    // song; let the listener retry after the providers recover.
    if(isContinuousRadio()){
        const label=document.getElementById('smart-radio-next-info');
        if(label)label.textContent='Ищем дальше — новые песни появятся автоматически.';
        showLoader(false);
        scheduleContinuousRadioRetry();
        return true;
    }
    if (serial===smartRadioRequestSerial && token===currentPlaybackToken &&
        playbackWanted && playbackPlaylist.length) {
        playTrack(0,{fromPlayback:true});
    }
    return true;
}
function toggleShuffle() {
    // One tap = actually rearrange the visible playlist (not merely flag the
    // next track as random). The playing audio continues without restarting.
    const visible=Array.isArray(playlist)&&playlist.length>1;
    const source=visible?playlist:playbackPlaylist;
    if(!source||source.length<2){
        // No popups from the shuffle button, even for an empty playlist.
        const status=document.getElementById('quick-mix-status');
        if(status){status.textContent='Для перемешивания нужно минимум две песни.';status.hidden=false;}
        return;
    }
    const playing=playbackPlaylist[currentIndex];
    const matching=visible&&playbackPlaylist.length===playlist.length&&
        playlist.every((t,i)=>canonicalTrackUrl(t)===canonicalTrackUrl(playbackPlaylist[i]));
    const selected=(matching||!visible)?playing:null;
    const rest=source.slice();
    if(selected)rest.splice(rest.indexOf(selected),1);
    for(let i=rest.length-1;i>0;i--){
        const j=Math.floor(Math.random()*(i+1));
        [rest[i],rest[j]]=[rest[j],rest[i]];
    }
    // Avoid a no-op even when a random permutation happens to match.
    const previous=source.slice();
    if(selected)previous.splice(previous.indexOf(selected),1);
    if(rest.length>1&&rest.every((t,i)=>t===previous[i]))
        rest.push(rest.shift());
    const mixed=selected?[selected,...rest]:rest;
    if(visible){
        playlist=mixed;
        if(String(currentTab).startsWith('mix:')&&quickMixCurrent?.key===String(currentTab).slice(4))
            quickMixCurrent.tracks=mixed;
    }
    if(matching||!visible){
        playbackPlaylist=mixed.slice();
        if(selected)currentIndex=0;
        else if(playing)currentIndex=playbackPlaylist.indexOf(playing);
    }
    // This control is a one-shot rearrangement; subsequent Next follows that
    // new visible order. Playback queue and saved server playlists are intact.
    isShuffle=false;
    smartShufflePlayed.clear();
    const button=document.getElementById('btn-shuffle');
    if(button){button.classList.remove('active');button.setAttribute('aria-pressed','false');}
    if(visible)renderPlaylist();
    // Reordering is immediate feedback. Do not open a blocking modal.
}
function toggleRepeat() { isRepeat = !isRepeat; document.getElementById('btn-repeat').classList.toggle('active'); }
function savePlaybackQueue() {
    try { localStorage.setItem(PLAYBACK_QUEUE_KEY, JSON.stringify(playbackQueue)); } catch (e) {}
    updatePlaybackQueueBadge();
    renderPlaybackQueue();
}
function updatePlaybackQueueBadge() {
    const badge = document.getElementById('queue-count');
    if (badge) badge.textContent = playbackQueue.length ? String(playbackQueue.length) : '';
    const pill=document.getElementById('showcase-queue-count');
    if(pill){pill.textContent=playbackQueue.length?String(playbackQueue.length):'0';
        pill.setAttribute('aria-label','В очереди: '+playbackQueue.length);}
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
    const summary=document.getElementById('queue-modal-summary');
    if(summary)summary.textContent=playbackQueue.length
        ?'В очереди '+playbackQueue.length+' песен · перемещайте их большими кнопками ниже'
        :'Добавляйте песни в очередь значком списка у трека.';
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
            btn.className='queue-mini-btn';btn.title=title;btn.setAttribute('aria-label',title);btn.textContent=text;
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
    recordManualPlaybackTransition();
    if (playbackQueue.length) {
        const track=playbackQueue.shift();
        savePlaybackQueue();
        let index=playbackPlaylist.findIndex(t=>canonicalTrackUrl(t)===canonicalTrackUrl(track));
        if (index<0) { index=playbackPlaylist.length; playbackPlaylist.push(track); }
        playTrack(index,{fromPlayback:true});
        return;
    }
    if (!playbackPlaylist.length) return;
    // Continuous stations never wrap to the first song. A buffered result is
    // used immediately; otherwise discovery keeps trying in the background.
    if (isContinuousRadio()) {
        const queued=playbackPlaylist[currentIndex+1];
        if(queued&&(playbackTab==='mix:charts'||queued._waveRadio)){
            smartRadioPrefetch=null;
            cancelContinuousRadioRetry();
            playTrack(currentIndex+1,{fromPlayback:true,fromSmartRadio:true});
        }else playSmartRadioNext();
        return;
    }
    if (isShuffle && playbackPlaylist.length>1) {
        let remaining=playbackPlaylist.map((t,i)=>i).filter(i=>!smartShufflePlayed.has(i));
        if (!remaining.length) {
            if (smartRadioEnabled && playbackTab!=='search' && navigator.onLine!==false) {
                playSmartRadioNext();
                return;
            }
            smartShufflePlayed.clear();
            smartShufflePlayed.add(currentIndex);
            remaining=playbackPlaylist.map((t,i)=>i).filter(i=>i!==currentIndex);
        }
        playTrack(remaining[Math.floor(Math.random()*remaining.length)],{fromPlayback:true});
    } else {
        const next=currentIndex+1;
        if (next>=playbackPlaylist.length) {
            if (smartRadioEnabled && playbackTab!=='search' && navigator.onLine!==false) {
                playSmartRadioNext();
                return;
            }
            playTrack(0,{fromPlayback:true});
        } else playTrack(next,{fromPlayback:true});
    }
}

function playPrev() {
    recordManualPlaybackTransition();
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
    const track = playbackPlaylist[currentIndex];
    if (!track || !mainAudio) return;
    const curr = Math.max(0, Number(mainAudio.currentTime) || 0);
    const dur = Number(mainAudio.duration);
    const knownDuration = Number.isFinite(dur) && dur > 0;
    const seekArea = document.getElementById('prog-area');
    if (seekArea) {
        seekArea.setAttribute('aria-disabled', knownDuration ? 'false' : 'true');
        seekArea.setAttribute('aria-valuenow', String(Math.round(curr)));
        seekArea.setAttribute('aria-valuemax', String(knownDuration ? Math.round(dur) : 0));
    }
    // With an unknown MP3 duration, still show elapsed time instead of 0:00.
    currTimeEl.innerText = formatTime(curr);
    durTimeEl.innerText = knownDuration ? formatTime(dur) : '--:--';
    if (!knownDuration) {
        progCurrent.style.width = '0%';
        progBuffer.style.width = '0%';
        return;
    }
    let bufferedUntil = 0;
    try {
        const ranges = mainAudio.buffered;
        for (let i = 0; i < ranges.length; i++) {
            if (ranges.start(i) <= curr + .25 && ranges.end(i) >= curr) {
                bufferedUntil = Math.max(bufferedUntil, ranges.end(i));
            }
        }
    } catch (error) {}
    const playedPct = Math.min(100, Math.max(0, curr / dur * 100));
    const bufferedPct = Math.min(100, Math.max(playedPct, bufferedUntil / dur * 100));
    progCurrent.style.width = playedPct.toFixed(2) + '%';
    progBuffer.style.width = bufferedPct.toFixed(2) + '%';
}

function formatTime(s) {
    if (!Number.isFinite(Number(s))) return '0:00';
    const time = Math.max(0, Math.floor(Number(s)));
    const m = Math.floor(time / 60);
    const sc = time % 60;
    return m + ':' + (sc < 10 ? '0' : '') + sc;
}

const progressArea = document.getElementById('prog-area');
function seekFromProgressClientX(clientX) {
    const track = playbackPlaylist[currentIndex];
    const duration = Number(mainAudio.duration);
    if (!track || !Number.isFinite(duration) || duration <= 0) return false;
    const bar = progressArea.querySelector('.progress-bar-wrap');
    const rect = bar.getBoundingClientRect();
    if (!rect.width) return false;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const seconds = Math.min(duration - 0.25, Math.max(0, ratio * duration));
    if (!Number.isFinite(seconds)) return false;
    mainAudio.currentTime = seconds;
    track._resumeTime = seconds;
    updateProgress();
    return true;
}
if (progressArea) {
    let dragging = false;
    let pointerHandledAt = 0;
    if (window.PointerEvent) {
        progressArea.addEventListener('pointerdown', event => {
            if (event.button !== 0 && event.pointerType === 'mouse') return;
            dragging = true;
            pointerHandledAt = Date.now();
            try { progressArea.setPointerCapture(event.pointerId); } catch (error) {}
            event.preventDefault();
        });
        // Seek once on release: Android startService() must not be flooded
        // with seek commands while a finger slides across the TEYES display.
        const finish = event => {
            if (!dragging) return;
            dragging = false;
            seekFromProgressClientX(event.clientX);
            pointerHandledAt = Date.now();
        };
        progressArea.addEventListener('pointerup', finish);
        progressArea.addEventListener('pointercancel', () => { dragging = false; });
    }
    // Older Android WebView still gets a normal click/tap.
    progressArea.addEventListener('click', event => {
        if (Date.now() - pointerHandledAt > 400) seekFromProgressClientX(event.clientX);
    });
}
mainAudio.addEventListener('durationchange', updateProgress);
mainAudio.addEventListener('timeupdate', updateProgress);
mainAudio.addEventListener('progress', updateProgress);

// --- GLOBAL SEARCH LOGIC ---
const mainSearchInput = document.getElementById('search-input');
const searchHistoryBox = document.getElementById('search-history');
const searchClearButton = document.getElementById('search-clear-btn');
function syncSearchClearButton() {
    if (searchClearButton) searchClearButton.hidden = !(mainSearchInput?.value || '').trim();
}
searchClearButton?.addEventListener('click', () => {
    if (!mainSearchInput) return;
    mainSearchInput.value = '';
    clearTimeout(searchTimeout);
    clearSearchResults();
    syncSearchClearButton();
    mainSearchInput.focus();
});
mainSearchInput?.addEventListener('input', syncSearchClearButton);
syncSearchClearButton();

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

let searchRequestSerial = 0;
function searchStatus(message, retry = false) {
    const holder = document.getElementById('search-container-box');
    if (!holder || !holder.parentElement) return;
    let status = document.getElementById('dag-search-status');
    if (!status) {
        status = document.createElement('div');
        status.id = 'dag-search-status';
        status.className = 'dag-search-status';
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        holder.appendChild(status);
    }
    status.replaceChildren();
    status.hidden = !message;
    status.classList.toggle('is-error', !!retry);
    status.classList.toggle('is-loading', !!message && !retry && /поиск|ищем|загружаем|проверяем/i.test(message));
    if (!message) return;
    const symbol = document.createElement('i');
    symbol.className = retry ? 'fas fa-circle-exclamation'
        : status.classList.contains('is-loading') ? 'fas fa-spinner fa-spin' : 'fas fa-circle-check';
    symbol.setAttribute('aria-hidden', 'true');
    status.appendChild(symbol);
    const caption = document.createElement('span');
    caption.textContent = message;
    status.appendChild(caption);
    if (retry) {
        const again = document.createElement('button');
        again.type = 'button';
        again.innerHTML = '<i class="fas fa-rotate-right" aria-hidden="true"></i> Повторить';
        again.addEventListener('click', () => performSearch(currentSearchQuery, true));
        status.appendChild(again);
    }
}
function clearSearchResults() {
    searchRequestSerial++;
    isSearchLoading = false;
    currentSearchQuery = '';
    currentSearchPage = 1;
    hasMoreSearchResults = false;
    searchPlaylistCache = [];
    searchStatus('');
    syncSearchClearButton();
    if (currentTab === 'search') {
        playlist = [];
        renderPlaylist();
    }
}
function displaySearchMessage(message) {
    listEl.replaceChildren();
    const caption = document.createElement('p');
    caption.className = 'dag-search-empty';
    caption.textContent = message;
    listEl.appendChild(caption);
}
async function performSearch(rawQuery, save = false) {
    const query = String(rawQuery || '').trim().replace(/\s+/g, ' ');
    clearTimeout(searchTimeout);
    if (!query) { clearSearchResults(); return; }
    const requestId = ++searchRequestSerial;
    if (save && searchHistoryBox) {
        saveSearchQuery(query);
        searchHistoryBox.style.display = 'none';
    }
    try { localStorage.setItem('dag_last_search', query); } catch(error) {}
    currentSearchQuery = query;
    currentSearchPage = 1;
    hasMoreSearchResults = true;
    isSearchLoading = true;
    const root = document.querySelector('.main-container.studio-showcase');
    root?.classList.remove('showcase-wave-only');
    window.studioShowList?.('search');
    if (currentTab !== 'search') switchTab('search');
    displaySearchMessage('Ищем музыку…');
    searchStatus('Поиск по доступным музыкальным источникам…');
    try {
        const net = getNetworkProfile();
        const result = await api('search_global', {
            query, page: 1, network: net.weak ? 'weak' : 'normal',
            save_data: net.saveData ? 1 : 0
        });
        if (requestId !== searchRequestSerial || currentSearchQuery !== query) return;
        if (result?.error) {
            const error = new Error(String(result.error));
            error.error_code = String(result.error_code || 'api');
            throw error;
        }
        const tracks = result?.success && Array.isArray(result.data) ? result.data : null;
        if (!tracks) throw new Error('Сервер поиска вернул некорректный ответ.');
        searchPlaylistCache = tracks;
        playlist = tracks;
        hasMoreSearchResults = tracks.length >= 15;
        renderPlaylist();
        const counts = result.source_counts || {};
        const providersWithSongs = Object.values(counts).filter(value => Number(value) > 0).length;
        if (tracks.length) {
            searchStatus('Найдено: ' + tracks.length +
                ' · источников с результатами: ' + providersWithSongs);
        } else {
            const available = Object.values(result.sources || {}).some(value => value?.ok);
            displaySearchMessage(available
                ? 'По вашему запросу ничего не найдено. Попробуйте указать исполнителя или название.'
                : 'Музыкальные источники сейчас не отвечают.');
            searchStatus(available ? 'Результатов пока нет.' : 'Нет ответа от музыкальных источников.', true);
        }
    } catch(error) {
        if (requestId !== searchRequestSerial) return;
        hasMoreSearchResults = false;
        recordConnectivityFailure(error);
        const message=explainConnectionFailure(error);
        displaySearchMessage(message);
        searchStatus(isDnsResolutionFailure(error)
            ? 'DNS недоступен · проверьте подключение' : 'Не удалось выполнить поиск.', true);
        console.warn('DAGSTUDIO search unavailable:', String(error?.message || error));
    } finally {
        if (requestId === searchRequestSerial) isSearchLoading = false;
    }
}
async function loadMoreSearchResults() {
    if (isSearchLoading || !hasMoreSearchResults || currentTab !== 'search' || !currentSearchQuery) return;
    const requestId = searchRequestSerial;
    const query = currentSearchQuery;
    const page = currentSearchPage + 1;
    isSearchLoading = true;
    const loader = document.createElement('div');
    loader.className = 'more-loader';
    loader.textContent = 'Загружаем следующие песни…';
    listEl.appendChild(loader);
    try {
        const net = getNetworkProfile();
        const result = await api('search_global', {
            query, page, network: net.weak ? 'weak' : 'normal',
            save_data: net.saveData ? 1 : 0
        });
        if (requestId !== searchRequestSerial || currentSearchQuery !== query || currentTab !== 'search') return;
        if (result?.error) throw new Error(String(result.error));
        if (!result?.success || !Array.isArray(result.data)) throw new Error('Следующая страница поиска недоступна.');
        const seen = new Set(playlist.map(track => canonicalTrackUrl(track)));
        const unique = result.data.filter(track => {
            const key = canonicalTrackUrl(track);
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
        if (unique.length) {
            playlist = playlist.concat(unique);
            searchPlaylistCache = playlist;
            currentSearchPage = page;
            renderPlaylist();
            searchStatus('Найдено: ' + playlist.length + ' · поиск продолжается');
        }
        if (result.data.length < 15 || !unique.length) hasMoreSearchResults = false;
    } catch(error) {
        if (requestId === searchRequestSerial) {
            recordConnectivityFailure(error);
            // Keep songs already found; the retry control reruns the search.
            hasMoreSearchResults = false;
            searchStatus('Следующие песни не загрузились · '+explainConnectionFailure(error), true);
        }
    } finally {
        loader.remove();
        if (requestId === searchRequestSerial) isSearchLoading = false;
    }
}

const playlistArea = document.querySelector('.playlist-area');
if(playlistArea) {
    playlistArea.addEventListener('scroll', function() {
        if (this.scrollTop + this.clientHeight >= this.scrollHeight - 160) {
            if (currentTab === 'search' && !isSearchLoading && hasMoreSearchResults)
                loadMoreSearchResults();
            else if (String(currentTab).startsWith('mix:'))loadMoreQuickMix();
        }
    });
}

if(mainSearchInput) {
    mainSearchInput.addEventListener('input', (e) => {
        if(searchHistoryBox) searchHistoryBox.style.display = 'none';
        clearTimeout(searchTimeout);
        // An in-flight answer must not overwrite what the user is typing.
        searchRequestSerial++;
        const query = e.target.value;
        if (!query.trim()) { clearSearchResults(); return; }
        const delay = getNetworkProfile().weak ? 700 : 380;
        searchTimeout = setTimeout(() => { performSearch(query, false); }, delay);
    });
    mainSearchInput.addEventListener('keydown', (e) => { 
        if(e.key === 'Enter') { clearTimeout(searchTimeout); performSearch(e.target.value, true); } 
    });
}


const QUICK_MIXES={
    charts:{title:'Новые релизы · все источники',mode:'recent',autoPlayOnDiscover:false,
        artists:['Zivert','Баста','Miyagi','The Weeknd','Dua Lipa',
          `новинки ${new Date().getFullYear()}`,'new music releases',
          'новые песни','latest songs','новинки России','new pop music',
          'Кавказские новинки','новая музыка','new hip hop','new rock music',
          'Султан Лагучев','Мурат Тхагалегов','Эльмира Магомедова',
          'Зульфия Чотчаева','Роза Мальсагова','Шамиль Кашешов']},
    russian:{title:'Русские',mode:'popular',artists:['Баста','Zivert','Мот','Мияги','Макс Корж','Егор Крид']},
    caucasus:{title:'Кавказские',mode:'popular',regions:[
        // Region labels are search directions, not verified audio-language tags.
        {id:'dag_ru',label:'Дагестан · на русском',queries:[
          'Эльдар Далгатов','Тимур Темиров','Эльмира Магомедова','Зульфия Чотчаева']},
        {id:'dag_avar',label:'Дагестан · аварские',queries:['Зара Гамзатова','аварские']},
        {id:'chechnya',label:'Чечня',queries:[
          'чеченские','Тимур Муцураев','Иман Амирбекова','Увайс Шарипов']},
        {id:'ingushetia',label:'Ингушетия',queries:[
          'ингушские','ингушская','Роза Мальсагова','Зара Аушева']},
        {id:'ossetia',label:'Северная Осетия',queries:[
          'осетинские','осетинская','Мадина Кайтмазова','Амина Дзуцева']},
        {id:'kabardino',label:'Кабардино-Балкария',queries:['кабардинские','балкарские']},
        {id:'karachay',label:'Карачаево-Черкесия',queries:['Ислам Итляшев','карачаевские']},
        {id:'adygea',label:'Адыгея',queries:['адыгейские','Мурат Калакуток']},
        {id:'dag_dargin',label:'Дагестан · даргинские',queries:['даргинские','Фатима Рабаданова']},
        {id:'dag_lezgin',label:'Дагестан · лезгинские',queries:['Мика Рамазанова','лезгинские']},
        {id:'dag_kumyk',label:'Дагестан · кумыкские',queries:['Ислам Айдаров','кумыкские']},
        {id:'dag_lak',label:'Дагестан · лакские',queries:['лакские','лакская']},
        {id:'dag_tabasaran',label:'Дагестан · табасаранские',queries:['табасаранские','табасаранская']},
        {id:'south_georgia',label:'Грузия',queries:['грузинские','Сосо Павлиашвили']},
        {id:'south_armenia',label:'Армения',queries:['армянские','Тата Симонян']},
        {id:'south_azerbaijan',label:'Азербайджан',queries:['азербайджанские','Ройа Айхан']}
    ]},
    foreign:{title:'Зарубежные',mode:'popular',artists:['Taylor Swift','The Weeknd','Dua Lipa','Bruno Mars','Billie Eilish','Lady Gaga']},
    hits:{title:'Лучшее · подборка',mode:'popular',artists:['Баста','Zivert','Miyagi','Ислам Итляшев','The Weeknd','Dua Lipa']},
    road:{title:'В дорогу',mode:'popular',artists:['Кино','Би-2','Сплин','Баста','Zivert','Макс Корж']},
    rock:{title:'Рок',mode:'popular',artists:['Кино','Ария','ДДТ','Сплин','Би-2','Наутилус Помпилиус']},
    retro:{title:'Ретро',mode:'classic',artists:['Руки Вверх','Мираж','Комбинация','Наутилус Помпилиус','Ласковый май','Алла Пугачёва']}
};
let quickMixRequestId=0;
let quickMixCurrent=null;
function quickMixUnique(tracks,known=[]) {
    const urls=new Set(known.map(t=>String(t.url||'')));
    const names=new Set(known.map(t=>normalizeTrackIdentity(t.artist)+'|'+normalizeTrackIdentity(t.title)));
    const result=[];
    for(const track of tracks||[]) {
        if(!track?.url||!track?.title||!track?.artist||!/^https?:\/\//i.test(track.url)) continue;
        const key=normalizeTrackIdentity(track.artist)+'|'+normalizeTrackIdentity(track.title);
        if(urls.has(track.url)||names.has(key))continue;
        urls.add(track.url);names.add(key);result.push({...track,_quickMix:true});
    }
    return result;
}
// Audius exposes real play counters and release dates. Unknown metadata from
// other providers remains unknown rather than being guessed from filenames.
function quickMixReleaseTimestamp(track) {
    const raw=String(track?.release_date||'');
    if(!/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(raw))return 0;
    const parsed=Date.parse(raw.slice(0,10)+'T00:00:00Z');
    return Number.isFinite(parsed)&&parsed>0&&parsed<Date.now()+86400000?parsed:0;
}
function quickMixRank(track,config,sourcePosition=0,now=Date.now()) {
    const plays=Math.max(0,Number(track?.play_count)||0);
    const favorites=Math.max(0,Number(track?.favorite_count)||0);
    const date=quickMixReleaseTimestamp(track);
    const age=date?Math.max(0,(now-date)/86400000):Infinity;
    const popularity=Math.min(65,Math.log10(plays+1)*10+Math.log10(favorites+1)*5);
    const recent=age<365?22*(1-age/730):age<730?11*(1-(age-365)/365):0;
    // Result order remains a fallback for sources without public metrics.
    const relevance=Math.max(0,12-Math.floor(sourcePosition/3));
    if(config?.mode==='classic')
        return popularity+relevance+(age>7*365&&age<Infinity?12:0);
    return popularity+recent+relevance;
}
function quickMixRankTracks(tracks,config) {
    const now=Date.now();
    const ranked=(tracks||[]).map((track,index)=>({
        track,index,score:quickMixRank(track,config,index,now),
        fresh:!!quickMixReleaseTimestamp(track)&&now-quickMixReleaseTimestamp(track)<=365*86400000
    })).sort((a,b)=>b.score-a.score||a.index-b.index);
    if(config?.mode==='recent'){
        // Prefer genuinely dated recent releases; do not invent dates for
        // other providers, and don't silently discard older dated results.
        const verified=ranked.filter(e=>e.fresh)
            .sort((a,b)=>quickMixReleaseTimestamp(b.track)-quickMixReleaseTimestamp(a.track) ||
                  b.score-a.score).map(e=>({...e.track,_releaseVerified:true}));
        const older=ranked.filter(e=>!e.fresh&&quickMixReleaseTimestamp(e.track))
            .sort((a,b)=>quickMixReleaseTimestamp(b.track)-quickMixReleaseTimestamp(a.track))
            .map(e=>({...e.track,_releaseVerified:true}));
        const unknown=ranked.filter(e=>!quickMixReleaseTimestamp(e.track))
            .map(e=>({...e.track,_releaseVerified:false}));
        return [...quickMixDiversify(verified),...quickMixDiversify(older),...quickMixDiversify(unknown)];
    }
    if(config?.mode==='classic')return quickMixDiversify(ranked.map(e=>e.track));
    // New releases first; other songs follow only when dated releases end.
    const fresh=ranked.filter(e=>e.fresh)
        .sort((a,b)=>quickMixReleaseTimestamp(b.track)-quickMixReleaseTimestamp(a.track)||
            b.score-a.score).map(e=>e.track);
    const other=ranked.filter(e=>!e.fresh).map(e=>e.track);
    return [...quickMixDiversify(fresh),...quickMixDiversify(other)];
}
function quickMixDiversify(ordered){
    const buckets=new Map(),result=[];
    for(const track of ordered){
        const artist=normalizeTrackIdentity(track?.artist)||'unknown';
        if(!buckets.has(artist))buckets.set(artist,[]);
        buckets.get(artist).push(track);
    }
    let previous='',safety=0;
    while(result.length<ordered.length && safety++<ordered.length+1){
        let picked=null,score=-1;
        for(const [artist,tracks] of buckets){
            if(!tracks.length)continue;
            const available=artist!==previous?2:0;
            const rank=-ordered.indexOf(tracks[0])/Math.max(1,ordered.length);
            const value=available+rank;
            if(value>score){score=value;picked=artist;}
        }
        if(picked===null)break;
        result.push(buckets.get(picked).shift());
        previous=picked;
    }
    return result;
}
function openQuickMixes() {
    const dialog=document.getElementById('quick-mixes-modal');
    if(!dialog)return;
    // Existing playback continues untouched when opening or closing the list.
    renderQuickMixButtons();
    dialog.classList.add('show');
    const button=document.getElementById('header-mixes-btn');
    if(button)button.setAttribute('aria-expanded','true');
    (dialog.querySelector('.quick-mix-btn.active')||dialog.querySelector('.quick-mix-btn'))?.focus();
}
// Every query uses search_global: the PHP endpoint fans it out across its
// seven configured providers and reports availability per provider. Results
// are merged across providers while keeping different regions represented.
function openCaucasusRadio() {
    closeModal('quick-mixes-modal');
    const root=document.getElementById('caucasus-regions');
    const modal=document.getElementById('caucasus-radio-modal');
    if(!root||!modal)return;
    root.innerHTML='';
    const add=(name,description,id)=>{
        const btn=document.createElement('button');
        btn.type='button';btn.className='caucasus-region-btn';
        const title=document.createElement('strong'),sub=document.createElement('small');
        title.textContent=name;sub.textContent=description;
        btn.append(title,sub);
        btn.onclick=()=>startCaucasusRadio(id);
        root.appendChild(btn);
    };
    add('Весь Кавказ','Все республики и направления','all');
    for(const region of QUICK_MIXES.caucasus.regions)
        add(region.label,'Поиск по исполнителям и названиям',region.id);
    modal.classList.add('show');
}
function startCaucasusRadio(regionId) {
    const config=QUICK_MIXES.caucasus;
    closeModal('caucasus-radio-modal');
    if(regionId==='all')return startQuickMix('caucasus');
    const region=config.regions.find(item=>item.id===regionId);
    if(!region)return;
    QUICK_MIXES.caucasus_selected={title:region.label,mode:'popular',regions:[region]};
    startQuickMix('caucasus_selected');
}
function quickMixSearchPlan(config) {
    if (Array.isArray(config?.regions)) {
        return config.regions.map(region=>({
            region:region.label,queries:[...region.queries],
            id:region.id
        }));
    }
    return (config?.artists||[]).map(artist=>({region:'',queries:[artist],id:artist}));
}
function quickMixSpreadSources(tracks,limit=8) {
    const buckets=new Map();
    for(const track of tracks||[]) {
        const source=String(track.source||'UNKNOWN');
        if(!buckets.has(source))buckets.set(source,[]);
        buckets.get(source).push(track);
    }
    const result=[];
    while(result.length<limit) {
        let added=false;
        for(const queue of buckets.values()) {
            if(queue.length) { result.push(queue.shift());added=true; }
            if(result.length>=limit)break;
        }
        if(!added)break;
    }
    return result;
}
function quickMixSourcesCaption(state) {
    const checked=state?.checkedSources?.size||0;
    const found=state?.activeSources?.size||0;
    return checked?(' · серверов ответили: '+found+'/'+checked):'';
}
function setQuickMixStatus(message) {
    const el=document.getElementById('quick-mix-status');
    if(el){el.textContent=message;el.hidden=!message;}
    const list=document.getElementById('playlist-container');
    if(list && String(currentTab).startsWith('mix:')){
        let state=list.querySelector('.showcase-search-status');
        if(!state){state=document.createElement('div');
            state.className='showcase-search-status';state.setAttribute('role','status');
            list.appendChild(state);
        }
        state.textContent=message||'';
        state.hidden=!message;
    }
}
function addChartRadioTrack(track){
    const state=quickMixCurrent;
    if(!track?.url||state?.key!=='charts')return;
    if(!quickMixUnique([track],state.tracks).length)return;
    state.tracks.push(track);
    if(currentTab==='mix:charts'){
        playlist=state.tracks;
        const pane=document.querySelector('.playlist-area');
        const scroll=pane?.scrollTop||0;
        renderPlaylist();
        if(pane)pane.scrollTop=scroll;
    }
}
function renderQuickMixButtons() {
    document.querySelectorAll('.quick-mix-btn').forEach(btn=>{
        btn.classList.toggle('active',currentTab==='mix:'+btn.dataset.mix);
        // Category buttons stay available while a previous search is running.
        btn.disabled=false;
    });
}
document.addEventListener('keydown',event=>{
    if(event.key!=='Escape' || document.getElementById('alert-modal')?.classList.contains('show'))return;
    const visible=Array.from(document.querySelectorAll('.studio-side-dialog.show'));
    // Confirmation prompts have a higher stacking level than ordinary panels.
    const dialog=document.getElementById('confirm-modal')?.classList.contains('show')
        ?document.getElementById('confirm-modal'):visible[visible.length-1];
    if(!dialog)return;
    event.preventDefault();closeModal(dialog.id);
    if(dialog.id==='quick-mixes-modal'||dialog.id==='caucasus-radio-modal')
        document.getElementById('header-mixes-btn')?.focus();
});
document.querySelectorAll('.studio-side-dialog').forEach(dialog=>{
    dialog.addEventListener('click',event=>{
        if(event.target===dialog)closeModal(dialog.id);
    });
});
function renderQuickMixView() {
    if(!quickMixCurrent)return;
    const search=document.getElementById('search-container-box');
    const label=document.getElementById('active-tab-name');
    if(search)search.style.display=search.parentElement?.classList.contains('right-col-header')?'block':'none';
    if(label){label.textContent=quickMixCurrent.title.toUpperCase();label.style.display='block';}
    document.getElementById('tab-search-btn')?.classList.remove('active');
    document.getElementById('btn-pl-select')?.classList.remove('active');
    playlist=quickMixCurrent.tracks;
    renderPlaylist();
    if(quickMixCurrent.key==='charts' && !playlist.length)
        setQuickMixStatus(quickMixCurrent.loading?'Ищем новые релизы по всем музыкальным источникам…':
            'Нет подтверждённых новинок. Прокрутите вниз для продолжения поиска.');
}
async function startQuickMix(key) {
    const seeds=key==='wave'?waveLibrarySeeds():[];
    // Wave is ONLINE discovery, not a replay of the user's own playlists.
    const waveTracks=[];
    if(key==='wave'){
        if(!seeds.length){
            setQuickMixStatus('Добавьте песни в плейлист или послушайте их до конца — так «Моя волна» изучит вкусы.');
            closeModal('quick-mixes-modal');return;
        }
        QUICK_MIXES.wave={title:'Моя волна',mode:'popular',
            artists:[...new Set([...seeds.map(t=>t.genre),...seeds.map(t=>t.artist)])]
                .filter(Boolean).slice(0,18)};
    }
    const config=QUICK_MIXES[key];
    if(!config)return;
    if(navigator.onLine===false&&!(key==='wave'&&waveTracks.length)) {
        setQuickMixStatus('Для подборок нужен интернет.');return;
    }
    closeModal('quick-mixes-modal');
    const requestId=++quickMixRequestId;
    quickMixCurrent={key,title:config.title,tracks:waveTracks.slice(),loading:true,
        loadingMore:false, pageNumbers:new Map(), exhaustedQueries:new Set(),
        checkedSources:new Set(),activeSources:new Set(),searchedRegions:new Set()};
    if(key==='wave'){
        // Playback starts with the first NEW suggestion from the network.
        // Hide the browser; the giant player remains the only wave UI.
        currentTab='mix:wave';playlist=[];renderQuickMixView();
        setQuickMixStatus('Ищем похожую музыку в сети…');
        const warm=waveWarmState?.owner===tasteOwnerKey()?waveWarmState:null;
        let first=warm?.candidate||null;
        if(!first&&warm?.promise)first=await warm.promise;
        if(first&&!waveWarmCandidateAllowed(first))first=null;
        // Every launch consumes its prepared selection; the next opening
        // searches from the advanced cursor and excludes recent plays.
        waveWarmState=null;
        if(!first)first=await findWaveNextTrack();
        if(requestId!==quickMixRequestId || quickMixCurrent?.key!=='wave')return;
        quickMixCurrent.loading=false;
        if(!first){setQuickMixStatus('Новые похожие композиции пока не найдены. Попробуйте ещё раз.');return;}
        quickMixCurrent.tracks=[first];
        playlist=[first];
        currentTab='mix:wave';
        renderQuickMixView();
        await playTrack(0);
        // Subsequent discoveries populate the next slot as soon as media is
        // playing and buffered; pressing Next then consumes that new slot.
        return;
    }
    // Immediately display this collection instead of keeping the previous
    // playlist on screen while the first remote search is in progress.
    currentTab='mix:'+key;
    playlist=quickMixCurrent.tracks;
    renderQuickMixView();
    renderQuickMixButtons();
    setQuickMixStatus(config.regions?'Ищем песни народов Кавказа…':
        config.mode==='classic'?'Ищем любимую классику…':
        config.mode==='recent'?'Проверяем даты новых релизов на всех музыкальных источниках…':
        'Ищем свежие песни разных исполнителей…');
    let started=waveTracks.length>0;
    if(started){
        currentTab='mix:'+key;
        playlist=quickMixCurrent.tracks;
        renderQuickMixView();
        playTrack(0);
        renderQuickMixButtons();
    }
    if(navigator.onLine===false){
        quickMixCurrent.loading=false;
        setQuickMixStatus('Локальная «Моя волна» · '+waveTracks.length+' сохранённых песен');
        return;
    }
    const batchSize=key==='charts'?5:(getNetworkProfile().weak?1:2);
    const plan=quickMixSearchPlan(config);
    // Publish chart songs as soon as ONE search returns. A slow provider/query
    // must not hold the entire first page blank until Promise.all completes.
    function publishChartResults(item,tracks){
        if(key!=='charts'||requestId!==quickMixRequestId||!tracks?.length)return;
        const newTracks=quickMixSpreadSources(
            quickMixUnique(tracks,quickMixCurrent.tracks),3);
        if(!newTracks.length)return;
        quickMixCurrent.tracks.push(...newTracks);
        quickMixCurrent.tracks=quickMixRankTracks(quickMixCurrent.tracks,config);
        if(playbackTab==='mix:charts'&&playbackWanted){
            const known=new Set(playbackPlaylist.map(t=>canonicalTrackUrl(t)));
            playbackPlaylist.push(...newTracks.filter(t=>!known.has(canonicalTrackUrl(t))));
        }
        started=true;
        if(currentTab==='mix:charts'){
            playlist=quickMixCurrent.tracks;renderPlaylist();
        }
        setQuickMixStatus('Найдено '+quickMixCurrent.tracks.length+
            ' композиций · проверяем другие источники'+quickMixSourcesCaption(quickMixCurrent));
    }
    for(let offset=0;offset<plan.length;offset+=batchSize) {
        if(requestId!==quickMixRequestId)return;
        const batch=plan.slice(offset,offset+batchSize);
        const results=await Promise.all(batch.map(async item=>{
            // A fallback spelling/performer is tried only when the earlier
            // query returned no tracks. Each attempt still fans out to every
            // configured music provider in search_global.
            for(const query of item.queries) {
                if(requestId!==quickMixRequestId)return [];
                try {
                    const net=getNetworkProfile();
                    const response=await api('search_global',{
                        query,page:1,network:net.weak?'weak':'normal',
                        save_data:net.saveData?1:0
                    });
                    if(requestId!==quickMixRequestId)return [];
                    if(response?.sources&&typeof response.sources==='object') {
                        for(const [server,status] of Object.entries(response.sources)) {
                            quickMixCurrent.checkedSources.add(server);
                            if(status?.ok)quickMixCurrent.activeSources.add(server);
                        }
                    }
                    if(response?.success&&Array.isArray(response.data)&&response.data.length) {
                        quickMixCurrent.pageNumbers.set(query,1);
                        const usable=quickMixUnique(response.data);
                        if(usable.length){
                    const ranked=quickMixRankTracks(usable,config);
                    if(ranked.length){
                        const found=ranked.map(track=>({...track,_mixRegion:item.region,
                            _mixSearchQuery:query}));
                        publishChartResults(item,found);
                        return found;
                    }
                }
                    }
                } catch(error) {recordPlayerEvent('quick-mix-search-error');}
            }
            return [];
        }));
        if(requestId!==quickMixRequestId)return;
        if(key==='charts')continue; // Already rendered each completed chart search.
        // Cap each direction so one language or one republic cannot
        // monopolize the Caucasian playlist before others are searched.
        const next=[];
        for(let i=0;i<batch.length;i++){
            const item=batch[i];
            const fresh=quickMixUnique(results[i],[...quickMixCurrent.tracks,...next]);
            const spread=quickMixSpreadSources(fresh,config.regions?4:3);
            if(spread.length){
                next.push(...spread);
                if(item.region)quickMixCurrent.searchedRegions.add(item.region);
            }
        }
        if(!next.length) {
            if(config.regions)setQuickMixStatus('Ищем песни других республик…'+
                quickMixSourcesCaption(quickMixCurrent));
            continue;
        }
        quickMixCurrent.tracks.push(...next);
        quickMixCurrent.tracks=quickMixRankTracks(quickMixCurrent.tracks,config);
        if(!started) {
            started=true;
            currentTab='mix:'+key;
            playlist=quickMixCurrent.tracks;
            renderQuickMixView();
            if(config.autoPlayOnDiscover!==false)playTrack(0);
            renderQuickMixButtons();
        } else {
            if(key!=='wave' && playbackTab==='mix:'+key&&playbackWanted) {
                const urls=new Set(playbackPlaylist.map(t=>t.url));
                playbackPlaylist.push(...next.filter(t=>!urls.has(t.url)));
            }
            if(currentTab==='mix:'+key) {
                playlist=quickMixCurrent.tracks;
                renderPlaylist();
            }
        }
        setQuickMixStatus('Найдено '+quickMixCurrent.tracks.length+' треков'+
            (config.regions?' · направлений: '+quickMixCurrent.searchedRegions.size:'')+
            quickMixSourcesCaption(quickMixCurrent));
    }
    if(requestId!==quickMixRequestId)return;
    quickMixCurrent.loading=false;
    renderQuickMixButtons();
    if(!started)setQuickMixStatus(config.mode==='recent'
        ?'Источники не ответили. Проверьте подключение или попробуйте ещё раз.'
        :'Нет доступных песен. Попробуйте другую подборку.'+
        quickMixSourcesCaption(quickMixCurrent));
    else setQuickMixStatus(key==='charts'
        ?'Найдено '+quickMixCurrent.tracks.length+' треков · с подтверждённой датой: '+
          quickMixCurrent.tracks.filter(t=>t._releaseVerified).length+
          ' · остальные без даты · прокрутите для новых'+quickMixSourcesCaption(quickMixCurrent)
        :'Подборка · '+quickMixCurrent.tracks.length+
          ' треков · прокрутите ниже для новых'+quickMixSourcesCaption(quickMixCurrent));
}
// Background pages advance by query and are merged by both URL and
// artist/title. Never recycle the first-page results on repeated scrolls.
async function loadMoreQuickMix() {
    const state=quickMixCurrent;
    if(!state||state.loading||state.loadingMore||
        currentTab!=='mix:'+state.key||navigator.onLine===false)return;
    if(state.exhausted){
        if(state.key!=='charts')return;
        // Chart providers refresh their catalogues. Once all old pages have
        // been visited, start a fresh rotated pass after a small cooldown.
        if(Date.now()-Number(state.lastRefreshAt||0)<30000)return;
        state.lastRefreshAt=Date.now();
        state.exhausted=false;
        state.exhaustedQueries.clear();
        state.pageNumbers.clear();
        state.nextDirection=Number(state.nextDirection||0)+3;
    }
    state.loadingMore=true;
    const requestId=quickMixRequestId;
    const config=QUICK_MIXES[state.key];
    const directions=quickMixSearchPlan(config);
    const offset=Number(state.nextDirection||0);
    const picks=[];
    for(let attempt=0;attempt<directions.length&&picks.length<2;attempt++){
        const direction=directions[(offset+attempt)%directions.length];
        const query=direction.queries.find(q=>!state.exhaustedQueries.has(q))||'';
        if(query)picks.push({direction,query});
    }
    state.nextDirection=(offset+Math.max(1,picks.length))%Math.max(1,directions.length);
    if(!picks.length){state.exhausted=true;state.loadingMore=false;
        if(state.key==='charts')state.lastRefreshAt=Date.now();
        setQuickMixStatus(state.key==='charts'
            ?'Все страницы проверены. Обновим чарты при следующем поиске.'
            :'Все доступные треки проверены. Можно выбрать другую подборку.');
        return;}
    setQuickMixStatus('Ищем новые песни…');
    const collected=[];
    try {
        for(const {direction,query} of picks){
            if(requestId!==quickMixRequestId||state!==quickMixCurrent)return;
            const page=Math.min(16,(state.pageNumbers.get(query)||1)+1);
            state.pageNumbers.set(query,page);
            if(page>=16)state.exhaustedQueries.add(query);
            try{
                const net=getNetworkProfile();
                const response=await api('search_global',{query,page,
                    network:net.weak?'weak':'normal',save_data:net.saveData?1:0});
                if(requestId!==quickMixRequestId||state!==quickMixCurrent)return;
                if(response?.sources)for(const [server,health] of Object.entries(response.sources)){
                    state.checkedSources.add(server);
                    if(health?.ok)state.activeSources.add(server);
                }
                if(!response?.success||!response.data?.length){
                    state.exhaustedQueries.add(query);continue;
                }
                const fresh=quickMixUnique(response.data,[...state.tracks,...collected])
                    .map(track=>({...track,_mixRegion:direction.region,_mixSearchQuery:query}));
                const ranked=quickMixRankTracks(fresh,config);
                collected.push(...ranked.slice(0,4));
                if(response.data.length<12)state.exhaustedQueries.add(query);
            }catch(err){recordPlayerEvent('quick-mix-more-error');}
        }
        if(requestId!==quickMixRequestId||state!==quickMixCurrent)return;
        const unique=quickMixUnique(collected,state.tracks);
        if(unique.length){
            state.tracks.push(...unique);
            state.tracks=quickMixRankTracks(state.tracks,config);
            if(state.key!=='wave'&&playbackTab==='mix:'+state.key&&playbackWanted){
                const known=new Set(playbackPlaylist.map(t=>canonicalTrackUrl(t)));
                playbackPlaylist.push(...unique.filter(t=>!known.has(canonicalTrackUrl(t))));
            }
            playlist=state.tracks;
            const scroller=document.querySelector('.playlist-area');
            const oldScroll=scroller?.scrollTop||0;
            renderPlaylist();
            if(scroller)scroller.scrollTop=oldScroll;
        }
        state.exhausted=state.exhaustedQueries.size>=directions.reduce((n,d)=>n+d.queries.length,0);
        if(state.exhausted&&state.key==='charts')state.lastRefreshAt=Date.now();
        setQuickMixStatus(unique.length
            ?'Добавлено '+unique.length+' новых треков · всего '+state.tracks.length
            :state.exhausted&&state.key==='charts'
                ?'Пока нет новых релизов. Продолжим поиск при следующем обновлении.'
                :state.exhausted?'Новых песен больше не найдено.'
                :'Продолжите прокрутку — ищем другие релизы.');
    }finally{state.loadingMore=false;}
}
// --- ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК ---
function switchTab(id) {
    const downloadBar=document.getElementById('playlist-download-bar');
    // Offline download belongs after the final playlist track, not above it.
    if(downloadBar)downloadBar.hidden=true;
    if(id==='search'||!String(id).startsWith('mix:')){
        quickMixRequestId++;
        if(quickMixCurrent)quickMixCurrent.loading=false;
    }
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
    } else if(String(id).startsWith('mix:')&&quickMixCurrent?.key===String(id).slice(4)){
        renderQuickMixView();
    } else {
        const pl = playlists.find(p => p.id == id); 
        if(pl) { 
            if(label) { label.innerText = pl.name.toUpperCase(); label.style.display = 'block'; } 
            if(searchContainer) searchContainer.style.display =
                searchContainer.parentElement?.classList.contains('right-col-header')?'block':'none'; 
            if(plSelectBtn) plSelectBtn.classList.add('active'); 
            playlist = [...pl.tracks]; 
            renderPlaylist(); 
        } 
    }
    renderQuickMixButtons();
}

// --- RENDER PLAYLIST С ДИНАМИЧЕСКИМИ ЛОГОТИПАМИ ---
function renderPlaylistOfflineFooter(){
    const selected=playlists.find(p=>String(p.id)===String(currentTab));
    if(!selected||!playlist.length)return;
    const footer=document.createElement('div');
    footer.className='showcase-download-footer';
    footer.id='showcase-download-footer';
    const button=document.createElement('button');
    button.className='showcase-download-button';
    button.type='button';
    button.appendChild(document.createElement('i')).className='fas fa-download';
    button.appendChild(document.createTextNode(' Скачать плейлист для офлайна'));
    button.addEventListener('click',()=>preparePlaylistDownload());
    const status=document.createElement('span');
    status.className='showcase-download-progress';
    status.id='showcase-download-progress';
    status.setAttribute('role','status');
    status.textContent=offlineBatch?.pending.size?
      'Скачивание: '+offlineBatch.finished+' из '+offlineBatch.total:
      'Для поездок без интернета';
    footer.append(button,status);
    listEl.appendChild(footer);
}
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
        // Every track uses the active DAGSTUDIO ornament, so the entire list
        // follows palette changes (including externally sourced tracks).
        let trackThumb = activeThemeImg;
        let isDefaultLogo = true;

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
        if(currentTab === 'search' || currentTab === 'offline' || currentTab === 'studio-likes' || String(currentTab).startsWith('mix:')) {
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
        
        artist.textContent=t.artist||'Неизвестен';
        if(t.source && (currentTab==='search'||String(currentTab).startsWith('mix:'))) {
            const sourceBadge=document.createElement('span');
            sourceBadge.className='source-badge';
            sourceBadge.textContent=t.source;
            artist.appendChild(document.createTextNode(' '));
            artist.appendChild(sourceBadge);
        }
        if(currentTab==='mix:caucasus' && t._mixRegion) {
            const regionBadge=document.createElement('span');
            regionBadge.className='mix-region-badge';
            regionBadge.title='Поисковое направление: '+t._mixRegion+'. Язык исполнения не проверен.';
            regionBadge.textContent=t._mixRegion;
            artist.appendChild(document.createTextNode(' '));
            artist.appendChild(regionBadge);
        }
        
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
    renderPlaylistOfflineFooter();
    if(currentIndex !== -1) updateActiveTrackInList(currentIndex);
    updatePlayingHeart();
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


function updatePlayingHeart() {
    const button=document.getElementById('now-playing-heart');
    if(!button) return;
    const track=playbackPlaylist[currentIndex];
    button.disabled=!track?.url;
    const liked=!!track?.url && playlists.some(pl=>Array.isArray(pl.tracks) &&
        pl.tracks.some(t=>t.url===track.url || (normalizeTrackIdentity(t.title)===normalizeTrackIdentity(track.title) &&
        normalizeTrackIdentity(t.artist)===normalizeTrackIdentity(track.artist))));
    button.classList.toggle('is-liked',liked);
    button.innerHTML=liked?'<i class="fas fa-heart"></i>':'<i class="far fa-heart"></i>';
    button.setAttribute('aria-label',liked?'Добавить в другой плейлист':'Сохранить текущую песню в плейлист');
    button.title=liked?'Есть в плейлисте · добавить в другой':'Сохранить текущую песню';
}
function savePlayingTrack() {
    const track=playbackPlaylist[currentIndex];
    if(!track?.url)return;
    selectedTrackForSave=track;
    openPlaylistSelect(true);
}
function openSaveModal(index) { selectedTrackForSave = playlist[index]; openPlaylistSelect(true); }

async function addToPlaylist(plId) { 
    const track = selectedTrackForSave; const pl = playlists.find(p => p.id == plId); 
    if(pl.tracks.some(t => t.url === track.url)) { showNotification("Уже есть"); return; } 
    const trackData = { title: track.title, artist: track.artist, url: track.url || track.file, thumb: track.thumb, type: 'audio' }; 
    const response = await api('add_track', { playlist_id: plId, track: trackData });
    if (!response.success) return showNotification(response.error || 'Не удалось добавить трек.');
    closeModal('save-modal');
    tasteRecord('like',track);
    const synced = await loadUserData(true);
    updatePlayingHeart();
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
    updatePlayingHeart();
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
        '--theme-tile-top': blendThemeColors('#272d36', main, .33),
        '--theme-tile-bottom': blendThemeColors('#11171e', main, .13),
        '--theme-icon-surface': blendThemeColors('#252c35', main, .44),
        '--theme-icon-edge': blendThemeColors('#45515d', main, .42),
        '--theme-icon-text': blendThemeColors(bright, '#ffffff', .18),
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
    document.querySelectorAll('.theme-dot[data-theme]').forEach(btn => {
        const selected = btn.dataset.theme === themeName;
        btn.classList.toggle('active', selected);
        btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
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
