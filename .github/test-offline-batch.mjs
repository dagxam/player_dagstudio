import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../script.js', import.meta.url), 'utf8');
const core = source.slice(source.indexOf('let offlineBatch=null;'),
  source.indexOf('function toggleTrafficSaver('));
const action = source.slice(source.indexOf('function downloadCurrentPlaylistOffline()'),
  source.indexOf('async function verifyOfflineCache()'));
assert.ok(core.startsWith('let offlineBatch=null;') && action.startsWith('function downloadCurrentPlaylistOffline()'));

function createHarness(count) {
  const labels = new Map();
  const messages = [];
  const queue = [];
  const queued = new Set();
  const state = {
    IS_NATIVE_APP: true,
    navigator: {onLine: true},
    document: {getElementById(id) {
      if (!labels.has(id)) labels.set(id, {textContent: ''});
      return labels.get(id);
    }},
    playlist: Array.from({length: count}, (_,i) => ({
      title: 'Song '+i, url: 'https://example.org/audio/'+i+'.mp3'
    })),
    isRemoteMediaUrl: url => /^https:/.test(url),
    canonicalTrackUrl: track => track.url,
    nativeCacheQueue: queue,
    nativeCacheQueuedUrls: queued,
    webCacheQueue: [],
    webCacheQueuedUrls: new Set(),
    enqueueNativeTrackCache(track, reason) {
      if (queued.has(track.url)) return;
      queued.add(track.url);
      queue.push({resolved:track.url,reason,track});
    },
    enqueueWebTrackCache() { throw Error('Unexpected web job'); },
    showNotification: message => messages.push(message),
    offlineLimitMb: () => 256,
    console
  };
  runInNewContext(core+'\n'+action, state);
  return {state,queue,queued,labels,messages};
}

const {state,queue,queued,labels,messages} = createHarness(83);
runInNewContext('downloadCurrentPlaylistOffline()',state);
assert.equal(queue.length,35,'RAM queue is bounded');
assert.match(labels.get('playlist-download-state').textContent,/0 из 83/);
runInNewContext('downloadCurrentPlaylistOffline()',state);
assert.equal(messages.length,1,'second click cannot reset active progress');
const downloaded = [];
while(queue.length) {
  const job = queue.shift();
  queued.delete(job.resolved);
  downloaded.push(job.resolved);
  state.completedUrl = job.resolved;
  runInNewContext('offlineBatchProgress(completedUrl)',state);
  assert.ok(queue.length<=35,'queue must never exceed the configured cap');
}
assert.equal(downloaded.length,83,'all unique tracks are eventually enqueued');
assert.equal(new Set(downloaded).size,83);
assert.match(labels.get('playlist-download-state').textContent,/83 из 83.*завершено/);

const stopped=createHarness(50);
runInNewContext('downloadCurrentPlaylistOffline()',stopped.state);
runInNewContext('stopOfflineBatchAtStorageLimit()',stopped.state);
assert.equal(stopped.queue.length,0,'remaining offline jobs removed at storage limit');
assert.equal(stopped.queued.size,0,'queued URL set must also be cleared');
assert.match(stopped.labels.get('playlist-download-state').textContent,
  /50 из 50 · ошибок: 50 · достигнут лимит 256 МБ/);
console.log('OFFLINE_BATCH_OK', {tracks:downloaded.length,queueLimit:35});
