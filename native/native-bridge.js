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
    if (!stat || Number(stat.size || 0) < 1) return null;

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
    if (!url || !key) throw new Error('audioCache.download: url/key required');

    const path = await audioCachePath(key, options?.extension);
    const existing = await statCached(path);
    if (existing && !options?.forceRedownload) return existing;
    if (existing && options?.forceRedownload) {
      await Filesystem.deleteFile({ directory: Directory.Data, path }).catch(() => {});
    }

    const uriInfo = await Filesystem.getUri({
      directory: Directory.Data,
      path
    });

    try {
      try {
        await FileTransfer.downloadFile({ url, path: uriInfo.uri, headers: options?.headers || {}, progress: false });
      } catch (error) {
        // Fallback для старого Android. Частично созданный файл удаляем.
        await Filesystem.deleteFile({ directory: Directory.Data, path }).catch(() => {});
        await Filesystem.downloadFile({ url, path, directory: Directory.Data, recursive: true, headers: options?.headers || {} });
      }
      const stored = await statCached(path);
      if (!stored || stored.size < 1024) throw new Error('Downloaded audio is incomplete');
      return stored;
    } catch (error) {
      await Filesystem.deleteFile({ directory: Directory.Data, path }).catch(() => {});
      throw error;
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
App.addListener('backButton', () => {
  window.dispatchEvent(new Event('dag-android-back'));
}).catch(error => console.warn('Android back handler unavailable:', error));

CapacitorUpdater.notifyAppReady().catch((error) => {
  console.warn('CapacitorUpdater notifyAppReady failed:', error);
});

window.dispatchEvent(new CustomEvent('dag-native-bridge-ready'));
