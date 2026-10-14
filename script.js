// script.js - V2218 (web + Capacitor native shell)

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

let nativeUpdateCheckInFlight = false;
let nativeLastUpdateCheckAt = 0;

async function checkNativeLiveUpdate(force = false) {
    if (!IS_NATIVE_APP || nativeUpdateCheckInFlight) return;

    const now = Date.now();
    if (!force && nativeLastUpdateCheckAt && (now - nativeLastUpdateCheckAt) < 5 * 60 * 1000) {
        return;
    }

    nativeUpdateCheckInFlight = true;
    nativeLastUpdateCheckAt = now;

    const updater = (window.DAG_NATIVE_BRIDGE && window.DAG_NATIVE_BRIDGE.updater)
        ? window.DAG_NATIVE_BRIDGE.updater
        : getCapacitorPlugin('CapacitorUpdater');
    if (!updater) return;

    try {
        if (typeof updater.notifyAppReady === 'function') {
            await updater.notifyAppReady();
        }

        const metaResponse = await nativeHttpRequest({
            url: NATIVE_UPDATE_META_URL + '?t=' + Date.now(),
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Cache-Control': 'no-cache'
            },
            connectTimeout: 10000,
            readTimeout: 15000
        });

        if (!metaResponse || metaResponse.status < 200 || metaResponse.status >= 300) return;

        const meta = typeof metaResponse.data === 'string'
            ? JSON.parse(metaResponse.data)
            : metaResponse.data;

        if (!meta || !meta.version || !meta.url) return;

        let installedVersion = String(window.DAG_NATIVE_BUILD_VERSION || '');

        if (typeof updater.current === 'function') {
            try {
                const currentInfo = await updater.current();
                if (currentInfo && currentInfo.bundle && currentInfo.bundle.version) {
                    installedVersion = String(currentInfo.bundle.version);
                }
            } catch (error) {
                console.warn('Cannot read current native bundle version:', error);
            }
        }

        if (installedVersion === String(meta.version)) return;

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

        // set() выбирает новый bundle; reload() сразу перезапускает web-слой.
        await updater.set({ id: bundle.id });

        if (typeof updater.reload === 'function') {
            await updater.reload();
        }
    } catch (error) {
        console.warn('Native live update skipped:', error);
    } finally {
        nativeUpdateCheckInFlight = false;
    }
}

let serviceWorkerRegistrationPromise = Promise.resolve(null);
if (!IS_NATIVE_APP && 'serviceWorker' in navigator) {
    serviceWorkerRegistrationPromise = navigator.serviceWorker
        .register('/sw.js?v=2223', { scope: '/', updateViaCache: 'none' })
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
        if (sessionStorage.getItem('dag_sw_reloaded_2223') === '1') return;
        sessionStorage.setItem('dag_sw_reloaded_2223', '1');
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
    mainAudio.crossOrigin = 'anonymous';
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
const LOCAL_PLAYLISTS_PREFIX = 'dag_offline_playlists_v1:';
const LAST_NATIVE_USER_KEY = 'dag_last_native_user';

const nativeCacheQueue = [];
const nativeCacheQueuedUrls = new Set();
let nativeCacheWorkerRunning = false;
let nativeCacheRetryTimer = null;

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
    return String(currentUser || localStorage.getItem(LAST_NATIVE_USER_KEY) || 'guest');
}

function playlistSnapshotKey(username = currentUser) {
    return LOCAL_PLAYLISTS_PREFIX + String(username || 'guest');
}

function saveOfflinePlaylistsSnapshot(data) {
    if (!IS_NATIVE_APP || !currentUser || !Array.isArray(data)) return;
    try {
        localStorage.setItem(playlistSnapshotKey(), JSON.stringify(data));
    } catch (error) {}
}

function loadOfflinePlaylistsSnapshot(username = currentUser) {
    if (!IS_NATIVE_APP || !username) return [];
    try {
        const parsed = JSON.parse(localStorage.getItem(playlistSnapshotKey(username)) || '[]');
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
        extension: guessAudioExtension(resolved)
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
    return true;
}

function scheduleNativeCacheWorker(delay = 0) {
    clearTimeout(nativeCacheRetryTimer);
    nativeCacheRetryTimer = setTimeout(function() {
        processNativeCacheQueue();
    }, Math.max(0, delay));
}

function enqueueNativeTrackCache(trackOrUrl, reason = 'played', priority = false) {
    if (!IS_NATIVE_APP || !nativeAudioCacheBridge()) return;

    const track = normalizeCacheTrack(trackOrUrl);
    const resolved = canonicalTrackUrl(track);
    if (!resolved || nativeCacheQueuedUrls.has(resolved)) return;

    nativeCacheQueuedUrls.add(resolved);
    const job = { track, reason, attempts: 0, resolved };
    if (priority) nativeCacheQueue.unshift(job);
    else nativeCacheQueue.push(job);
    scheduleNativeCacheWorker(0);
}

async function processNativeCacheQueue() {
    if (!IS_NATIVE_APP || nativeCacheWorkerRunning || !nativeAudioCacheBridge()) return;
    if (navigator.onLine === false) return;

    if (getNetworkProfile().weak && mainAudio && !mainAudio.paused) {
        scheduleNativeCacheWorker(15000);
        return;
    }

    nativeCacheWorkerRunning = true;
    try {
        while (nativeCacheQueue.length > 0 && navigator.onLine !== false) {
            if (getNetworkProfile().weak && mainAudio && !mainAudio.paused) {
                scheduleNativeCacheWorker(15000);
                break;
            }

            const job = nativeCacheQueue.shift();
            if (!job) break;

            try {
                await storeNativeTrackNow(job.track, job.reason);
                nativeCacheQueuedUrls.delete(job.resolved);
            } catch (error) {
                job.attempts += 1;
                if (job.attempts < 3) {
                    nativeCacheQueue.push(job);
                    scheduleNativeCacheWorker(job.attempts * 10000);
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

async function cacheTrackSilently(trackOrUrl, options = {}) {
    const track = normalizeCacheTrack(trackOrUrl);
    const resolvedUrl = canonicalTrackUrl(track);
    if (!resolvedUrl || !/^https?:\/\//i.test(resolvedUrl) || navigator.onLine === false) return;

    if (IS_NATIVE_APP) {
        enqueueNativeTrackCache(track, options.reason || 'played', !!options.priority);
        return;
    }

    if (!('caches' in window)) return;

    const net = getNetworkProfile();
    if (net.weak || net.saveData || (mainAudio && !mainAudio.paused)) return;

    try {
        const cacheUrl = isDagServerMedia(resolvedUrl)
            ? resolvedUrl
            : buildProxyUrl(track, { norange: true });
        const cache = await caches.open('dag-audio-cache');
        const match = await cache.match(cacheUrl);
        if (!match) {
            const res = await fetch(cacheUrl, { cache: 'no-store' });
            if (res.ok) await cache.put(cacheUrl, res.clone());
        }
    } catch (e) {}
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
            const normalProxy = buildProxyUrl(track);
            const weakProxy = buildProxyUrl(track, { weak: true });
            const res = (direct ? await cache.match(direct) : null) ||
                (await cache.match(normalProxy)) ||
                (await cache.match(weakProxy));
            if (res) {
                const blob = await res.blob();
                return { url: URL.createObjectURL(blob), isBlob: true, inCache: true };
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
    if (!IS_NATIVE_APP || navigator.onLine === false) return;
    const seen = new Set();
    playlists.forEach(pl => {
        (pl.tracks || []).forEach(track => {
            const resolved = canonicalTrackUrl(track);
            if (!resolved || seen.has(resolved)) return;
            seen.add(resolved);
            enqueueNativeTrackCache(track, 'playlist', false);
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
                connectTimeout: action === 'search_global' ? 15000 : 10000,
                readTimeout: action === 'search_global' ? 30000 : 15000
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
            }, action === 'search_global' ? 30000 : 15000);

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

async function checkAuth() {
    const lastNativeUser = IS_NATIVE_APP
        ? String(localStorage.getItem(LAST_NATIVE_USER_KEY) || '')
        : '';

    if (IS_NATIVE_APP && navigator.onLine === false && lastNativeUser) {
        currentUser = lastNativeUser;
        await loadUserData();
        return;
    }

    const res = await api('check_auth');

    if (res && res.logged_in) {
        currentUser = res.username;
        if (IS_NATIVE_APP && currentUser) {
            localStorage.setItem(LAST_NATIVE_USER_KEY, currentUser);
        }
        if(res.theme) setTheme(res.theme, false);
        await loadUserData();
        return;
    }

    // При временной сетевой ошибке не выкидываем пользователя из нативного
    // приложения: офлайн-плейлисты и локальная музыка должны остаться доступны.
    if (IS_NATIVE_APP && res && res.error && lastNativeUser) {
        currentUser = lastNativeUser;
        await loadUserData();
        return;
    }

    currentUser = null;
    if (IS_NATIVE_APP) {
        localStorage.removeItem(NATIVE_SESSION_KEY);
        localStorage.removeItem(LAST_NATIVE_USER_KEY);
    }
    await loadUserData();
}

async function loadUserData() {
    let dbPlaylists = [];
    let loadedFromServer = false;

    if(currentUser) {
        if (navigator.onLine !== false && (!IS_NATIVE_APP || nativeApiReachable)) {
            const data = await api('get_data');
            if(!data.error && Array.isArray(data)) {
                dbPlaylists = data;
                loadedFromServer = true;
                saveOfflinePlaylistsSnapshot(dbPlaylists);
            }
        }

        if (!loadedFromServer && IS_NATIVE_APP) {
            dbPlaylists = loadOfflinePlaylistsSnapshot(currentUser);
        }
    }

    playlists = [...dbPlaylists];

    if (IS_NATIVE_APP) {
        if (navigator.onLine !== false) {
            syncPlaylistOfflineCache();
        }

        if (currentTab === 'search' && navigator.onLine === false) {
            const offlineTracks = getOfflineCachedTracks();
            if (offlineTracks.length > 0) {
                searchPlaylistCache = offlineTracks;
                playlist = [...offlineTracks];
                renderPlaylist();
            }
        }
    }

    if(currentTab !== 'search') {
        const pl = playlists.find(p => p.id == currentTab);
        if(pl) {
            playlist = [...pl.tracks];
            renderPlaylist();
        } else {
            switchTab('search');
        }
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
        const deleting = playlists.find(p => p.id == id);
        const deletingTracks = deleting && Array.isArray(deleting.tracks)
            ? deleting.tracks.map(track => normalizeCacheTrack(track))
            : [];

        await api('delete_playlist', { id: id });
        await loadUserData();

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
    cacheTrackSilently(trackData, { reason: 'playlist', priority: true });
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
        await loadUserData();
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

    await api('delete_track', {track_id: trackId});
    await loadUserData();

    if (deletedTrack) {
        await deleteDeviceCachedTrack(deletedTrack, false);
    }

    renderTrackManagerList(playlists.find(p => p.id == plId));
}

window.deleteTrackGeneral = async function(trackId, plId) {
    const plBefore = playlists.find(p => p.id == plId);
    const deletedTrack = plBefore && Array.isArray(plBefore.tracks)
        ? plBefore.tracks.find(track => String(track.id) === String(trackId))
        : null;

    await api('delete_track', {track_id: trackId});
    await loadUserData();

    if (deletedTrack) {
        await deleteDeviceCachedTrack(deletedTrack, false);
    }
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

    const resumeAt = Math.max(
        Number(track._resumeTime || 0),
        isFinite(mainAudio.currentTime) ? Number(mainAudio.currentTime || 0) : 0
    );
    pendingResumeTime = resumeAt > 1 ? resumeAt : 0;

    // При пропадании сети или ошибке потока сначала пробуем локальную копию.
    if (isRemoteMediaUrl(track.url)) {
        const cached = await getDeviceCachedAudio(track);
        if (cached && cached.inCache) {
            networkRetryPending = false;
            track._playingFromCache = true;

            showLoader(true);
            mainAudio.pause();
            mainAudio.src = cached.url;
            mainAudio.load();

            try {
                await mainAudio.play();
                restorePendingPosition();
                showLoader(false);
                updateState(true);
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
        showLoader(false);
        updateState(false);
        titleEl.textContent = track.title;
        artistEl.textContent = 'Источник временно недоступен';
        setTimeout(function() {
            if (playlist[currentIndex] === track && navigator.onLine) playNext();
        }, 3500);
        return;
    }

    const retry = track._streamRetries;
    const useNoRange = retry >= 3;
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

    // Прослушанный онлайн-трек автоматически сохраняется на устройстве.
    if (track && navigator.onLine !== false && isRemoteMediaUrl(track.url) && !track._playingFromCache) {
        setTimeout(function() {
            if (token === currentPlaybackToken && track === playlist[currentIndex] &&
                isFinite(mainAudio.currentTime) && mainAudio.currentTime >= 5) {
                cacheTrackSilently(track, { reason: 'played', priority: true });
            }
        }, 6000);
    }
});

mainAudio.addEventListener('pause', function() {
    if (!mainAudio.ended) updateState(false);
});

mainAudio.addEventListener('ended', function() {
    clearStreamRecoveryTimer();
    releaseWakeLock();

    const finishedTrack = playlist[currentIndex];
    if (finishedTrack && navigator.onLine !== false && isRemoteMediaUrl(finishedTrack.url)) {
        cacheTrackSilently(finishedTrack, { reason: 'played', priority: true });
    }

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
    const track = playlist[currentIndex];
    if (!track || !track.url) return;
    showLoader(true);
    scheduleStreamRecovery('media-error', getNetworkProfile().weak ? 2500 : 1200);
});

window.addEventListener('offline', function() {
    if (currentIndex < 0 || mainAudio.ended) return;

    const track = playlist[currentIndex];
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
    nativeApiReachable = true;
    scheduleNativeCacheWorker(500);
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
        if (navigator.onLine !== false) {
            scheduleNativeCacheWorker(1000);
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
    track._playingFromCache = false;
    track._cacheQueuedForPlay = false;
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
        let finalUrl = resolveMediaUrl(track.url);
        let isCached = false;

        if (track.url && isRemoteMediaUrl(track.url)) {
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
                    ? buildProxyUrl(track, { weak: isWeakConnection() })
                    : resolveMediaUrl(track.url);
            }
        }

        if (!navigator.onLine && !isCached && track.url && isRemoteMediaUrl(track.url)) {
            networkRetryPending = true;
            showLoader(true);
            titleEl.textContent = track.title;
            artistEl.textContent = 'Нет сети и трек ещё не сохранён на устройстве';
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
    ensureEqualizerGraph();
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
    if (navigator.onLine && isRemoteMediaUrl(trackData.url)) {
        cacheTrackSilently(trackData, { reason: 'playlist', priority: true });
    }
}

function openMenu() { if (currentUser) { document.getElementById('auth-section').style.display = 'none'; document.getElementById('user-section').style.display = 'block'; document.getElementById('user-name-disp').innerText = currentUser; } else { document.getElementById('auth-section').style.display = 'block'; document.getElementById('user-section').style.display = 'none'; } document.getElementById('menu-modal').classList.add('show'); }
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
            if (IS_NATIVE_APP && currentUser) {
                localStorage.setItem(LAST_NATIVE_USER_KEY, currentUser);
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
    if (IS_NATIVE_APP) {
        localStorage.removeItem(LAST_NATIVE_USER_KEY);
    }
    playlists = [];
    playlist = [];
    switchTab('search');
    closeModal('menu-modal');
}

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
    setTimeout(function() {
        checkNativeLiveUpdate(true);
    }, 1200);

    // Вторая попытка после запуска полезна на слабом мобильном интернете.
    setTimeout(function() {
        checkNativeLiveUpdate(true);
    }, 10000);

    // При возврате в приложение повторяем проверку, но не чаще раза в 5 минут.
    document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'visible') {
            setTimeout(function() {
                checkNativeLiveUpdate(false);
            }, 600);
        }
    });
}