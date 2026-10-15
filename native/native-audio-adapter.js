(function() {
  'use strict';
  /**
   * HTMLMediaElement-compatible transport facade for the existing player UI.
   * The real Android decoder, buffering and disk cache live in Media3.
   * Browsers never load this file and continue using their native <audio>.
   */
  class DAGNativeAudioAdapter extends EventTarget {
    constructor() {
      super();
      this._src = '';
      this._loaded = '';
      this._position = 0;
      this._duration = 0;
      this._buffered = 0;
      this._wanted = false;
      this._playing = false;
      this._state = 'idle';
      this._ended = false;
      this._prematureEndNotified = false;
      this._error = null;
      this._volume = 1;
      this.preload = 'auto';
      this.loop = false;
      this._lastSeek = 0;
      window.addEventListener('dag-native-audio-status', e => this._update(e.detail || {}));
      this._poll = setInterval(() => {
        if (!this._loaded) return;
        window.DAG_NATIVE_BRIDGE?.audioPlayer?.status()
          .then(data => this._update(data || {}))
          .catch(() => {});
      }, 900);
    }
    addEventListener(...args) { return super.addEventListener(...args); }
    _emit(name) { this.dispatchEvent(new Event(name)); }
    get src() { return this._src; }
    set src(value) {
      this._src = String(value || '');
      this._ended = false;
      this._prematureEndNotified = false;
      this._error = null;
      this._position = 0;
      this._duration = 0;
      this._buffered = 0;
      this._loaded = '';
      this._state = 'idle';
    }
    get currentTime() { return this._position; }
    set currentTime(seconds) {
      const time = Math.max(0, Number(seconds) || 0);
      this._position = time;
      if (this._loaded) {
        this._lastSeek = Date.now();
        window.DAG_NATIVE_BRIDGE?.audioPlayer?.seek({positionMs: time * 1000}).catch(() => {});
      }
      this._emit('timeupdate');
    }
    get duration() { return this._duration; }
    get buffered() {
      const end = this._buffered;
      return {length: end > 0 ? 1 : 0, start: () => 0, end: () => end};
    }
    get paused() { return !this._wanted; }
    get ended() { return this._ended; }
    get error() { return this._error; }
    get readyState() { return this._state === 'ready' ? 4 : (this._state === 'buffering' ? 2 : 0); }
    get networkState() { return this._error ? 3 : 1; }
    get volume() { return this._volume; }
    set volume(value) { this._volume = Math.max(0, Math.min(1, Number(value) || 0)); }
    getAttribute(name) { return name === 'src' ? (this._src || null) : null; }
    removeAttribute(name) {
      if (name !== 'src') return;
      this._src = '';
      this._loaded = '';
      this._wanted = false;
      this._playing = false;
      this._state = 'idle';
      window.DAG_NATIVE_BRIDGE?.audioPlayer?.stop().catch(() => {});
    }
    load() { /* Native decoder is prepared when play() is requested. */ }
    async play() {
      if (!this._src) throw new Error('Audio source is not set');
      const bridge = window.DAG_NATIVE_BRIDGE?.audioPlayer;
      if (!bridge) throw new Error('Media3 is unavailable');
      this._wanted = true;
      this._ended = false;
      this._error = null;
      if (this._loaded !== this._src) {
        this._loaded = this._src;
        this._state = 'buffering';
        this._emit('waiting');
        try {
          await bridge.load({
            url: this._src,
            cacheKey: window.DAG_ACTIVE_MEDIA_CACHE_KEY || '',
            title: window.DAG_ACTIVE_MEDIA_TITLE || 'DAGSTUDIO PLAYER',
            artist: window.DAG_ACTIVE_MEDIA_ARTIST || '',
            positionMs: this._position * 1000
          });
        } catch (error) {
          this._loaded = '';
          this._wanted = false;
          this._error = {code: 2};
          throw error;
        }
      } else {
        await bridge.resume();
      }
    }
    pause() {
      const wasPlaying = this._wanted;
      this._wanted = false;
      this._playing = false;
      if (wasPlaying) this._emit('pause');
      window.DAG_NATIVE_BRIDGE?.audioPlayer?.pause().catch(() => {});
    }
    _update(data) {
      if (!this._loaded) return;
      if (!data.hasSource) return;
      const oldState = this._state;
      const wasPlaying = this._playing;
      const state = String(data.state || 'idle');
      this._state = state;
      if (Number.isFinite(Number(data.durationMs)) && Number(data.durationMs) > 0) {
        const oldDuration = this._duration;
        this._duration = Number(data.durationMs) / 1000;
        if (!oldDuration) this._emit('loadedmetadata');
        if (oldDuration !== this._duration) this._emit('durationchange');
      }
      if (Number.isFinite(Number(data.positionMs)) && Date.now() - this._lastSeek > 650) {
        const next = Number(data.positionMs) / 1000;
        if (Math.abs(next - this._position) > 0.12) {
          this._position = next;
          this._emit('timeupdate');
        }
      }
      if (Number.isFinite(Number(data.bufferedPositionMs))) {
        const oldBuffered = this._buffered;
        this._buffered = Math.max(this._position, Number(data.bufferedPositionMs) / 1000);
        if (Math.abs(oldBuffered - this._buffered) > 0.5) this._emit('progress');
      }
      if (data.error) {
        this._error = {code: 2, message: String(data.error)};
        this._emit('error');
        return;
      }
      if (state === 'ready' && oldState !== 'ready') {
        this._emit('canplay');
        this._emit('progress');
      } else if (state === 'buffering' && oldState !== 'buffering' && this._wanted) {
        this._emit('waiting');
      }
      this._playing = !!data.playing;
      if (this._playing && !wasPlaying && this._wanted) this._emit('playing');
      if (state === 'ended' && !this._ended) {
        // Media3 can finish a truncated HTTP stream (or report the previous
        // source's terminal state) after only a few seconds. Let the app retry
        // the current track rather than silently skip to the next one.
        const tooEarly = this._position < 12 ||
          (this._duration > 0 && this._position + 4 < this._duration);
        if (tooEarly) {
          this._playing = false;
          if (!this._prematureEndNotified) {
            this._prematureEndNotified = true;
            this._emit('prematureend');
          }
        } else {
          this._ended = true;
          this._playing = false;
          this._wanted = false;
          this._emit('ended');
        }
      }
    }
  }
  window.DAGNativeAudioAdapter = DAGNativeAudioAdapter;
})();
