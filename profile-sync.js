// Per-account preference sync. Only small metadata crosses devices; audio files stay local.
(function() {
  'use strict';
  const KEYS = new Set([
    'equalizer','soft_leveling','rainbow_speed','smart_radio','traffic_saver',
    'visualizer','taste','likes_exclusions','search_history'
  ]);
  const PREFIX = 'dag_cloud_profile_v1:';
  const LAST_OWNER = 'dag_cloud_profile_last_owner_v1';
  let api = null, getUser = () => null, read = () => undefined;
  let apply = () => {}, status = () => {};
  let owner = '', entries = {}, epoch = 0, sequence = 0;
  let pulled = null, flushing = null, flushTimer = null, lastPull = 0;
  const username = value => String(value || '').trim().toLowerCase().slice(0, 80);
  const clone = value => {
    try { return JSON.parse(JSON.stringify(value)); } catch (_) { return undefined; }
  };
  const valid = (key, value) => {
    if (!KEYS.has(key) || value === undefined || value === null) return false;
    if (['smart_radio','traffic_saver','soft_leveling'].includes(key)) return typeof value === 'boolean';
    if (key === 'rainbow_speed') return Number.isInteger(value) && value >= 4 && value <= 60;
    if (key === 'search_history') return Array.isArray(value) && value.length <= 8 &&
      value.every(item => typeof item === 'string' && item.length <= 120);
    if (typeof value !== 'object' || Array.isArray(value)) return false;
    const encoded = JSON.stringify(value);
    return encoded.length <= (key === 'taste' ? 160000 : key === 'likes_exclusions' ? 18000 : 1900);
  };
  const snapshotKey = name => PREFIX + name;
  const save = () => {
    if (!owner) return;
    try {
      localStorage.setItem(snapshotKey(owner), JSON.stringify(entries));
    } catch (_) {}
  };
  const show = message => { try { status(message); } catch (_) {} };
  const schedule = delay => {
    if (flushTimer) clearTimeout(flushTimer);
    if (!owner || !api) return;
    flushTimer = setTimeout(() => { flushTimer = null; flush().catch(() => {}); }, delay);
  };
  const change = (key, value) => {
    if (!valid(key, value)) return false;
    const signedIn = username(getUser());
    if (!owner || signedIn !== owner) return false;
    entries[key] = {
      value: clone(value), revision: Math.max(0, Number(entries[key]?.revision) || 0),
      dirty: true, seq: ++sequence
    };
    save();
    schedule(key === 'taste' ? 6000 : 900);
    return true;
  };
  async function flush() {
    if (flushing) return flushing;
    const current = owner, generation = epoch;
    if (!current || !api || navigator.onLine === false || username(getUser()) !== current) return false;
    flushing = (async () => {
      for (const key of KEYS) {
        const entry = entries[key];
        if (!entry?.dirty || !valid(key, entry.value)) continue;
        let attempts = 0;
        while (attempts++ < 3) {
          if (owner !== current || epoch !== generation || username(getUser()) !== current) return false;
          const seq = entry.seq;
          const response = await api('save_profile_setting', {
            key, value: clone(entry.value), expected_revision: entry.revision || 0
          });
          if (owner !== current || epoch !== generation) return false;
          if (response?.success && Number.isInteger(response.revision)) {
            entry.revision = response.revision;
            if (entry.seq === seq) entry.dirty = false;
            save();
            break;
          }
          if (response?.conflict && Number.isInteger(response.setting?.revision)) {
            entry.revision = response.setting.revision;
            save();
            continue; // User's explicit local change wins only after CAS validation.
          }
          show('Настройки сохранены на устройстве · повторим синхронизацию');
          return false;
        }
      }
      show('Настройки профиля синхронизированы');
      return true;
    })();
    try { return await flushing; }
    finally {
      flushing = null;
      if (owner === current && Object.values(entries).some(item => item?.dirty))
        schedule(12000);
    }
  }
  async function pull(force = false) {
    const current = owner, generation = epoch;
    if (!current || !api || navigator.onLine === false || username(getUser()) !== current) return false;
    if (pulled) return pulled;
    if (!force && Date.now() - lastPull < 60000) return true;
    lastPull = Date.now();
    pulled = (async () => {
      const result = await api('get_profile_settings');
      if (owner !== current || epoch !== generation) return false;
      if (!result?.success || !result.settings || typeof result.settings !== 'object') {
        lastPull = 0;
        show('Настройки сохранены локально · сервер недоступен');
        return false;
      }
      for (const key of KEYS) {
        const remote = result.settings[key];
        const record = entries[key];
        if (remote && valid(key, remote.value) && Number.isInteger(remote.revision) && remote.revision > 0) {
          if (record?.dirty) {
            record.revision = remote.revision; // Retain deliberate unsent local changes.
          } else if (!record || record.revision !== remote.revision ||
                     JSON.stringify(record.value) !== JSON.stringify(remote.value)) {
            entries[key] = {value: clone(remote.value), revision: remote.revision, dirty: false, seq: ++sequence};
            apply(key, clone(remote.value));
          }
        } else if (record && valid(key, record.value) && !record.dirty) {
          // Migrate an existing device's local preference only if the account
          // has never stored that key in the cloud.
          record.revision = 0;
          record.dirty = true;
          record.seq = ++sequence;
        }
      }
      save();
      if (Object.values(entries).some(item => item?.dirty)) schedule(1200);
      show('Настройки профиля загружены из аккаунта');
      return true;
    })();
    try { return await pulled; }
    finally { pulled = null; }
  }
  async function start(rawUser) {
    const name = username(rawUser);
    if (!name) return false;
    if (name !== owner) {
      if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
      ++epoch;
      const previous = localStorage.getItem(LAST_OWNER);
      owner = name;
      entries = {};
      const saved = localStorage.getItem(snapshotKey(name));
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
            for (const key of KEYS) {
              const item = parsed[key];
              if (item && valid(key, item.value))
                entries[key] = {value: clone(item.value),
                  revision: Math.max(0, Number(item.revision) || 0),
                  dirty: item.dirty === true, seq: ++sequence};
            }
        } catch (_) {}
      }
      for (const key of KEYS) {
        if (entries[key]) {
          apply(key, clone(entries[key].value));
          continue;
        }
        // Taste and exclusions are already stored under the account name.
        // Preserve account B's existing offline preferences when switching
        // from account A; global display settings must instead reset.
        const accountScoped = key === 'taste' || key === 'likes_exclusions';
        const local = (!previous || previous === name || accountScoped)
          ? read(key) : undefined;
        if (valid(key, local)) {
          entries[key] = {value: clone(local), revision: 0, dirty: false, seq: ++sequence};
        } else if (previous && previous !== name) {
          apply(key, undefined);
        }
      }
      save();
      localStorage.setItem(LAST_OWNER, name);
      lastPull = 0;
    }
    return pull(true);
  }
  function signOut() {
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    ++epoch;
    owner = '';
    entries = {};
    lastPull = 0;
  }
  window.DAG_PROFILE_SYNC = {
    configure(options) {
      api = options.api;
      getUser = options.getUser;
      read = options.read;
      apply = options.apply;
      status = options.status || status;
    },
    start, change, refresh: pull, flush, signOut,
    activeUser: () => owner
  };
})();