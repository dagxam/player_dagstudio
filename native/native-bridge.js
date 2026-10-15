import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { FileTransfer } from '@capacitor/file-transfer';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';

const DAGCarMode = registerPlugin('DAGCarMode');
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
    return (await statCached(path)) || { exists: false, path };
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

      // Atomic rename publishes only a completed download.
      // On Android this stays within Directory.Data on the same filesystem.
      if (existing || options?.forceRedownload) {
        await Filesystem.deleteFile({ directory: Directory.Data, path }).catch(() => {});
      }
      await Filesystem.rename({
        from: stagingPath, to: path,
        directory: Directory.Data, toDirectory: Directory.Data
      });
      const stored = await statCached(path);
      if (!stored) throw new Error('Cached file was not published');
      return stored;
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

window.DAG_NATIVE_BRIDGE = {
  httpRequest: (options) => CapacitorHttp.request(options),
  updater,
  audioCache,
  screen: {
    setKeepScreenOn: (options) => DAGCarMode.setKeepScreenOn(options)
  },
  media: {
    update: (options) => DAGCarMode.setMediaState(options)
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
DAGCarMode.addListener('mediaButton', event => {
  window.dispatchEvent(new CustomEvent('dag-android-media-button',
    {detail: {action: String(event?.action || '')}}));
}).catch(error => console.warn('Media button listener unavailable:', error));
App.addListener('backButton', () => {
  window.dispatchEvent(new Event('dag-android-back'));
}).catch(error => console.warn('Android back handler unavailable:', error));

CapacitorUpdater.notifyAppReady().catch((error) => {
  console.warn('CapacitorUpdater notifyAppReady failed:', error);
});

window.dispatchEvent(new CustomEvent('dag-native-bridge-ready'));
