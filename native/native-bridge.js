import { CapacitorHttp } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';

const updater = {
  notifyAppReady: (options) => CapacitorUpdater.notifyAppReady(options),
  download: (options) => CapacitorUpdater.download(options),
  set: (options) => CapacitorUpdater.set(options),
  reload: () => CapacitorUpdater.reload(),
  current: () => CapacitorUpdater.current(),
  list: (options) => CapacitorUpdater.list(options)
};

window.DAG_NATIVE_BRIDGE = {
  httpRequest: (options) => CapacitorHttp.request(options),
  updater
};

// В manual update mode notifyAppReady должен быть вызван в первые секунды запуска.
CapacitorUpdater.notifyAppReady().catch((error) => {
  console.warn('CapacitorUpdater notifyAppReady failed:', error);
});

window.dispatchEvent(new CustomEvent('dag-native-bridge-ready'));
