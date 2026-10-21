package ru.dagstudio.player;

import android.content.Context;
import android.media.audiofx.Equalizer;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.datasource.DefaultDataSource;
import androidx.media3.datasource.okhttp.OkHttpDataSource;
import okhttp3.OkHttpClient;
import java.util.concurrent.TimeUnit;
import androidx.media3.datasource.cache.CacheDataSource;
import androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor;
import androidx.media3.datasource.cache.SimpleCache;
import androidx.media3.database.StandaloneDatabaseProvider;
import androidx.media3.exoplayer.DefaultLoadControl;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.exoplayer.upstream.DefaultLoadErrorHandlingPolicy;
import com.getcapacitor.JSObject;
import org.json.JSONArray;
import java.io.File;

/**
 * Android-only audio engine. The website still uses HTML5 Audio.
 * Stream buffering and a bounded on-disk cache run outside the WebView.
 */
public final class DAGAudioEngine {
    private static final long DISK_CACHE_BYTES = 160L * 1024L * 1024L;
    private static JSObject lastStatus = new JSObject();
    private final ExoPlayer player;
    private final SimpleCache cache;
    private Equalizer equalizer;
    private JSONArray eqGains = new JSONArray();
    private boolean eqEnabled;
    private boolean hasSource;
    private String lastError = "";
    private String playbackRequestId = "";
    private final Runnable statusListener;

    public DAGAudioEngine(Context context, Runnable statusListener) {
        this.statusListener = statusListener;
        cache = new SimpleCache(new File(context.getCacheDir(), "media3-audio-v1"),
            new LeastRecentlyUsedCacheEvictor(DISK_CACHE_BYTES),
            new StandaloneDatabaseProvider(context));
        // The native player must use the same verified DNS fallback as the
        // search API, otherwise music would still fail after search recovers.
        OkHttpClient streamClient = new OkHttpClient.Builder()
            .dns(new DAGServerDns())
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .followRedirects(false)
            .followSslRedirects(false)
            .build();
        OkHttpDataSource.Factory http = new OkHttpDataSource.Factory(streamClient)
            .setUserAgent("DAGSTUDIO-PLAYER/Media3");
        DefaultDataSource.Factory upstream = new DefaultDataSource.Factory(context, http);
        CacheDataSource.Factory source = new CacheDataSource.Factory()
            .setCache(cache)
            .setUpstreamDataSourceFactory(upstream)
            .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR);
        DefaultLoadControl control = new DefaultLoadControl.Builder()
            .setBufferDurationsMs(30000, 150000, 3000, 6000)
            .setPrioritizeTimeOverSizeThresholds(true)
            .setBackBuffer(15000, true)
            .build();
        player = new ExoPlayer.Builder(context)
            .setLoadControl(control)
            .setMediaSourceFactory(new DefaultMediaSourceFactory(source)
                .setLoadErrorHandlingPolicy(new DefaultLoadErrorHandlingPolicy(5)))
            .setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(C.USAGE_MEDIA)
                .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(), true)
            .setHandleAudioBecomingNoisy(true)
            .build();
        player.addListener(new Player.Listener() {
            @Override public void onPlaybackStateChanged(int state) { publish(); }
            @Override public void onIsPlayingChanged(boolean playing) { publish(); }
            @Override public void onPlayWhenReadyChanged(boolean ready, int reason) { publish(); }
            @Override public void onAudioSessionIdChanged(int audioSessionId) {
                refreshEqualizer(audioSessionId);
            }
            @Override public void onPlayerError(PlaybackException error) {
                lastError = "Media3 " + error.errorCode;
                publish();
            }
        });
        publish();
    }

    public void load(String url, String cacheKey, long startMs, String requestId) {
        lastError = "";
        playbackRequestId = requestId == null ? "" : requestId;
        hasSource = true;
        MediaItem.Builder item = new MediaItem.Builder().setUri(Uri.parse(url));
        if (url.startsWith("https://") && cacheKey != null && !cacheKey.isEmpty()) {
            item.setCustomCacheKey(cacheKey);
        }
        player.setMediaItem(item.build());
        if (startMs > 0) player.seekTo(startMs);
        player.prepare();
        player.play();
        publish();
    }

    public void play() {
        if (hasSource) player.play();
        publish();
    }

    public void pause() { player.pause(); publish(); }

    public void stop() {
        player.stop();
        player.clearMediaItems();
        hasSource = false;
        lastError = "";
        playbackRequestId = "";
        publish();
    }

    public void seek(long ms) {
        if (hasSource) player.seekTo(Math.max(0L, ms));
        publish();
    }

    public boolean isPlayingOrLoading() {
        return hasSource && player.getPlayWhenReady() &&
            player.getPlaybackState() != Player.STATE_ENDED;
    }

    public void setEqualizer(boolean enabled, String gainsJson) {
        eqEnabled = enabled;
        try { eqGains = new JSONArray(gainsJson == null ? "[]" : gainsJson); }
        catch (Exception ignored) { eqGains = new JSONArray(); }
        refreshEqualizer(player.getAudioSessionId());
    }

    private void refreshEqualizer(int sessionId) {
        if (equalizer != null) {
            try { equalizer.release(); } catch (Exception ignored) {}
            equalizer = null;
        }
        if (!eqEnabled || sessionId == C.AUDIO_SESSION_ID_UNSET || sessionId == 0) return;
        try {
            equalizer = new Equalizer(0, sessionId);
            short[] range = equalizer.getBandLevelRange();
            int min = range[0], max = range[1];
            int[] frequencies = {60, 150, 400, 1000, 2400, 6000, 12000};
            for (short band = 0; band < equalizer.getNumberOfBands(); band++) {
                int centerHz = equalizer.getCenterFreq(band) / 1000;
                int closest = 0;
                for (int i = 1; i < frequencies.length; i++) {
                    if (Math.abs(frequencies[i] - centerHz) <
                        Math.abs(frequencies[closest] - centerHz)) closest = i;
                }
                double db = eqGains.optDouble(closest, 0.0);
                int level = (int)Math.round(db * 100.0);
                equalizer.setBandLevel(band, (short)Math.max(min, Math.min(max, level)));
            }
            equalizer.setEnabled(true);
        } catch (Exception unsupported) {
            if (equalizer != null) {
                try { equalizer.release(); } catch (Exception ignored) {}
                equalizer = null;
            }
        }
    }

    public JSObject status() {
        JSObject state = new JSObject();
        int mode = player.getPlaybackState();
        state.put("engine", "media3");
        state.put("hasSource", hasSource);
        state.put("requestId", playbackRequestId);
        state.put("playing", player.isPlaying());
        state.put("playWhenReady", player.getPlayWhenReady());
        state.put("state", mode == Player.STATE_BUFFERING ? "buffering" :
            mode == Player.STATE_READY ? "ready" :
            mode == Player.STATE_ENDED ? "ended" : "idle");
        state.put("positionMs", Math.max(0L, player.getCurrentPosition()));
        state.put("durationMs", Math.max(0L, player.getDuration()));
        state.put("bufferedPositionMs", Math.max(0L, player.getBufferedPosition()));
        state.put("error", lastError);
        return state;
    }

    // Media3 does not dispatch onPlaybackStateChanged as the playhead advances.
    // Publish a lightweight position snapshot regularly while the service lives,
    // otherwise the WebView progress bar and seeking UI stay frozen.
    public void publishProgress() {
        JSObject status = status();
        synchronized (DAGAudioEngine.class) { lastStatus = status; }
        DAGCarModePlugin.notifyAudioStatus(status);
    }

    private void publish() {
        publishProgress();
        statusListener.run();
    }

    public static synchronized JSObject lastStatus() { return lastStatus; }

    public void release() {
        if (equalizer != null) {
            try { equalizer.release(); } catch (Exception ignored) {}
            equalizer = null;
        }
        player.release();
        cache.release();
    }
}
