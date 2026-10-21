import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { FileTransfer } from '@capacitor/file-transfer';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';

const DAGCarMode = registerPlugin('DAGCarMode');
const hasAndroidMedia3 = Capacitor.getPlatform() === 'android';
const updater = {
  notifyAppReady: (options) => CapacitorUpdater.notifyAppReady(options),
  download: (options) => CapacitorUpdater.download(options),
  set: (options) => CapacitorUpdater.set(options),
  reload: () => CapacitorUpdater.reload(),
  current: () => CapacitorUpdater.current(),
  list: (options) => CapacitorUpdater.list(options)
};

const AUDIO_CACHE_DIR = 'audio-cache';

async function ensureAudioCacheDir() {
  try {
    await Filesystem.mkdir({
      directory: Directory.Data,
      path: AUDIO_CACHE_DIR,
      recursive: true
    });
  } catch (error) {
    const text = String(error?.message || error || '');
    if (!/exist/i.test(text)) throw error;
  }
}

function safeExtension(ext) {
  const clean = String(ext || 'mp3').toLowerCase().replace(/[^a-z0-9]/g, '');
  return ['mp3','m4a','aac','ogg','opus','wav','flac','mp4','webm'].includes(clean) ? clean : 'mp3';
}

async function audioCachePath(key, ext) {
  await ensureAudioCacheDir();
  return `${AUDIO_CACHE_DIR}/${String(key).replace(/[^a-f0-9]/gi, '')}.${safeExtension(ext)}`;
}

async function statCached(path) {
  try {
    const stat = await Filesystem.stat({
      directory: Directory.Data,
      path
    });
    // Do not expose a partially downloaded audio file as a complete offline entry.
    if (!stat || Number(stat.size || 0) < 4096) return null;

    const uriInfo = await Filesystem.getUri({
      directory: Directory.Data,
      path
    });
    return {
      exists: true,
      path,
      size: Number(stat.size || 0),
      uri: uriInfo.uri,
      webUrl: Capacitor.convertFileSrc(uriInfo.uri)
    };
  } catch (error) {
    return null;
  }
}

const audioCache = {
  async get(options) {
    const path = String(options?.path || '');
    if (!path) return { exists: false };
    const current = await statCached(path);
    if (current) return current;
    // Recover a previously valid file if Android interrupted a swap after ACC-off.
    const backup = await statCached(path + '.backup');
    if (backup) {
      try {
        await Filesystem.deleteFile({directory:Directory.Data,path}).catch(()=>{});
        await Filesystem.rename({
          from:path+'.backup',to:path,directory:Directory.Data,toDirectory:Directory.Data
        });
        return (await statCached(path)) || {exists:false,path};
      } catch(e) {}
    }
    return { exists: false, path };
  },

  async download(options) {
    const url = String(options?.url || '');
    const key = String(options?.key || '');
    if (!/^https?:\/\//i.test(url) || !/^[a-f0-9]{8,128}$/i.test(key)) {
      throw new Error('audioCache.download: invalid url/key');
    }

    const path = await audioCachePath(key, options?.extension);
    const existing = await statCached(path);
    if (existing && !options?.forceRedownload) return existing;

    // NEVER write directly to the final audio path: another playback request
    // could see a partly written file and confuse it with an offline cache hit.
    const stagingPath = path + '.downloading';
    await Filesystem.deleteFile({ directory: Directory.Data, path: stagingPath }).catch(() => {});
    const stagingUri = await Filesystem.getUri({
      directory: Directory.Data,
      path: stagingPath
    });

    // Slow mobile radio handovers often take longer than default read timeout.
    // These are inactivity timeouts, not total-track download time limits.
    const weak = options?.weak === true;
    const connectTimeout = weak ? 45000 : 20000;
    const readTimeout = weak ? 120000 : 60000;

    let progressListener = null;
    let expectedBytes = 0;
    try {
      try {
        progressListener = await FileTransfer.addListener('progress', data => {
          const total = Number(data?.contentLength || 0);
          const received = Number(data?.bytes || 0);
          if (total > 0) expectedBytes = Math.max(expectedBytes, total);
          window.dispatchEvent(new CustomEvent('dag-cache-progress', {
            detail: { bytes: received, total, downloading: true }
          }));
        });
        await FileTransfer.downloadFile({
          url, path: stagingUri.uri, headers: options?.headers || {}, progress: true,
          connectTimeout, readTimeout
        });
      } catch (error) {
        // Legacy Android fallback, still staged. Do not touch a valid old cache.
        await Filesystem.deleteFile({ directory: Directory.Data, path: stagingPath }).catch(() => {});
        await Filesystem.downloadFile({
          url, path: stagingPath, directory: Directory.Data, recursive: true,
          headers: options?.headers || {}
        });
      }
      const staged = await statCached(stagingPath);
      if (!staged || (expectedBytes > 0 && staged.size + 1024 < expectedBytes)) {
        throw new Error('Audio download is empty or incomplete');
      }

      // Keep the previous valid file until the replacement is verified.
      // A power interruption during publication can be recovered by audioCache.get().
      const backupPath = path + '.backup';
      let backedUp = false;
      if (existing) {
        await Filesystem.deleteFile({directory:Directory.Data,path:backupPath}).catch(()=>{});
        await Filesystem.rename({
          from:path,to:backupPath,directory:Directory.Data,toDirectory:Directory.Data
        });
        backedUp = true;
      } else if (options?.forceRedownload) {
        await Filesystem.deleteFile({directory:Directory.Data,path}).catch(()=>{});
      }
      try {
        await Filesystem.rename({
          from: stagingPath, to: path,
          directory: Directory.Data, toDirectory: Directory.Data
        });
        const stored = await statCached(path);
        if (!stored) throw new Error('Cached file was not published');
        if (backedUp) await Filesystem.deleteFile({
          directory:Directory.Data,path:backupPath
        }).catch(()=>{});
        return stored;
      } catch (publishError) {
        if (backedUp) {
          await Filesystem.deleteFile({directory:Directory.Data,path}).catch(()=>{});
          await Filesystem.rename({
            from:backupPath,to:path,directory:Directory.Data,toDirectory:Directory.Data
          }).catch(()=>{});
        }
        throw publishError;
      }
    } catch (error) {
      await Filesystem.deleteFile({ directory: Directory.Data, path: stagingPath }).catch(() => {});
      throw error;
    } finally {
      if (progressListener) await progressListener.remove().catch(() => {});
      window.dispatchEvent(new CustomEvent('dag-cache-progress', {
        detail: { bytes: 0, total: 0, downloading: false }
      }));
    }
  },

  async delete(options) {
    const path = String(options?.path || '');
    if (!path) return { deleted: false };
    try {
      await Filesystem.deleteFile({
        directory: Directory.Data,
        path
      });
      return { deleted: true };
    } catch (error) {
      return { deleted: false };
    }
  }
};

// On some CC3 firmwares Android's native DNS resolver fails while Chromium
// WebView can access the exact same HTTPS site. Retry only idempotent reads
// in the WebView network stack, never account/playlist writes.
let lastHttpTransport = 'native';
function nativeDnsError(error) {
  return /unable to resolve host|unknownhost|name_not_resolved|no address associated|dns|enotfound|name or service not known|failed to resolve/i
    .test(String(error?.message || error || ''));
}
function safeWebviewRead(options) {
  const method = String(options?.method || 'GET').toUpperCase();
  let url;
  try { url = new URL(String(options?.url || '')); } catch(e) { return false; }
  if (url.protocol !== 'https:' || url.hostname !== 'pl.dagstudio.ru' || url.port) return false;
  if (method === 'GET')
    return url.pathname === '/ota-bridge.php' || url.pathname === '/api.php' ||
      url.pathname === '/deploy-version.txt';
  if (method !== 'POST' || url.pathname !== '/api.php') return false;
  // Read-only music search only. A write could have succeeded before the
  // native connection dropped; transparently repeating it would be unsafe.
  const data = options?.data || {};
  return data && typeof data === 'object' && data.action === 'search_global';
}
async function browserNetworkRead(options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(),
    Math.min(Math.max(Number(options?.readTimeout) || 25000,10000),55000));
  try {
    const method = String(options?.method || 'GET').toUpperCase();
    const response = await fetch(String(options.url), {
      method,
      mode:'cors', credentials:'omit',
      headers: options?.headers || {},
      body: method === 'POST' ? JSON.stringify(options.data || {}) : undefined,
      cache:'no-store',
      signal:controller.signal
    });
    const raw = await response.text();
    let data;
    try { data=JSON.parse(raw); } catch(e) { data=raw; }
    return {status:response.status,data,headers:{},transport:'webview'};
  } finally { clearTimeout(timeout); }
}
async function nativeHttpWithBrowserFallback(options) {
  try {
    const response=await CapacitorHttp.request(options);
    lastHttpTransport='native';
    return response;
  } catch(error) {
    if (!nativeDnsError(error) || !safeWebviewRead(options)) throw error;
    try {
      const response=await browserNetworkRead(options);
      lastHttpTransport='webview-fallback';
      return response;
    } catch(webError) {
      // Final route for TEYES firmware with broken Android + WebView DNS.
      // The native plugin keeps HTTPS SNI/certificate checks for the domain.
      if (hasAndroidMedia3 && typeof DAGCarMode.readOwnServer === 'function') {
        try {
          const safe = safeWebviewRead(options);
          if (safe) {
            const response=await DAGCarMode.readOwnServer({
              url: String(options.url),
              method: String(options?.method || 'GET'),
              data: options?.data || {}
            });
            lastHttpTransport='trusted-ip-tls';
            return response;
          }
        } catch(pinnedError) {
          throw new Error('Server connection failed via DNS, WebView and verified HTTPS IP: ' +
            String(pinnedError?.message || pinnedError).slice(0,110));
        }
      }
      const reason=String(webError?.message || webError || '').slice(0,100);
      throw new Error('Native DNS failed; WebView fallback: '+reason);
    }
  }
}

window.DAG_NATIVE_BRIDGE = {
  httpRequest: nativeHttpWithBrowserFallback,
  networkTransport: () => lastHttpTransport,
  updater,
  audioCache,
  screen: {
    setKeepScreenOn: (options) => hasAndroidMedia3
      ? DAGCarMode.setKeepScreenOn(options) : Promise.resolve({ supported: false })
  },
  media: {
    update: (options) => hasAndroidMedia3
      ? DAGCarMode.setMediaState(options) : Promise.resolve({ supported: false })
  },
  audioPlayer: {
    load: options => DAGCarMode.loadAudio(options),
    resume: () => DAGCarMode.resumeAudio(),
    pause: () => DAGCarMode.pauseAudio(),
    stop: () => DAGCarMode.stopAudio(),
    seek: options => DAGCarMode.seekAudio(options),
    equalizer: options => DAGCarMode.equalizerAudio(options),
    // Reject on iOS: the shell must select its HTML5 audio element, never
    // initialize the Android-only Media3 adapter.
    status: () => hasAndroidMedia3 ? DAGCarMode.audioStatus()
      : Promise.reject(new Error('Media3 is Android-only'))
  },
  appInfo: () => App.getInfo(),
  openExternal: (options) => Browser.open({
    url: String(options?.url || ''),
    toolbarColor: '#0b0b0b'
  })
};

window.DAG_CAR_APP_ACTIVE = true;
App.addListener('appStateChange', (state) => {
  window.DAG_CAR_APP_ACTIVE = !!state.isActive;
  window.dispatchEvent(new CustomEvent('dag-native-state', { detail: { isActive: !!state.isActive } }));
}).catch(error => console.warn('Android lifecycle hook unavailable:', error));
if (hasAndroidMedia3) {
  DAGCarMode.addListener('mediaButton', event => {
    window.dispatchEvent(new CustomEvent('dag-android-media-button',
      {detail: {action: String(event?.action || '')}}));
  }).catch(error => console.warn('Media button listener unavailable:', error));
  DAGCarMode.addListener('audioStatus', state => {
    window.dispatchEvent(new CustomEvent('dag-native-audio-status', {detail: state}));
  }).catch(error => console.warn('Media3 status listener unavailable:', error));
  App.addListener('backButton', () => {
    window.dispatchEvent(new Event('dag-android-back'));
  }).catch(error => console.warn('Android back handler unavailable:', error));
}

CapacitorUpdater.notifyAppReady().catch((error) => {
  console.warn('CapacitorUpdater notifyAppReady failed:', error);
});

window.dispatchEvent(new CustomEvent('dag-native-bridge-ready'));
