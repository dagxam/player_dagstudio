import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { FileTransfer } from '@capacitor/file-transfer';

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
    if (existing) return existing;

    const uriInfo = await Filesystem.getUri({
      directory: Directory.Data,
      path
    });

    await FileTransfer.downloadFile({
      url,
      path: uriInfo.uri,
      headers: options?.headers || {},
      progress: false
    });

    const stored = await statCached(path);
    if (!stored) throw new Error('Audio file was not stored after download');
    return stored;
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
  audioCache
};

CapacitorUpdater.notifyAppReady().catch((error) => {
  console.warn('CapacitorUpdater notifyAppReady failed:', error);
});

window.dispatchEvent(new CustomEvent('dag-native-bridge-ready'));
