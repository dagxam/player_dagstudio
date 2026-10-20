package ru.dagstudio.player;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import java.io.File;
import android.os.Build;
import android.os.SystemClock;
import java.lang.ref.WeakReference;
import com.getcapacitor.JSObject;
import android.view.WindowManager;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;

@CapacitorPlugin(name = "DAGCarMode")
public class DAGCarModePlugin extends Plugin {
    private static WeakReference<DAGCarModePlugin> current = new WeakReference<>(null);
    private static String lastMediaAction = "";
    private static long lastMediaCommandAt = 0;
    @Override
    public void load() {
        current = new WeakReference<>(this);
    }

    static synchronized void notifyMediaCommand(String action) {
        long now = SystemClock.elapsedRealtime();
        if (action.equals(lastMediaAction) && now - lastMediaCommandAt < 180) return;
        lastMediaAction = action;
        lastMediaCommandAt = now;
        DAGCarModePlugin plugin = current.get();
        if (plugin == null) return;
        JSObject event = new JSObject();
        event.put("action", action);
        plugin.notifyListeners("mediaButton", event, true);
    }

    static void notifyAudioStatus(JSObject state) {
        DAGCarModePlugin plugin = current.get();
        if (plugin != null) plugin.notifyListeners("audioStatus", state, true);
    }

    private void audioCommand(PluginCall call, String action, boolean foreground) {
        Intent intent = new Intent(getContext(), DAGMediaService.class);
        intent.setAction(action);
        if (foreground && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                getContext().startForegroundService(intent);
                call.resolve();
            } catch (Exception error) { call.reject("Media3 could not start", error); }
        } else {
            try {
                getContext().startService(intent);
                call.resolve();
            } catch (Exception error) { call.reject("Media3 command failed", error); }
        }
    }

    private boolean isAllowedAudioUrl(String url) {
        try {
            Uri uri = Uri.parse(url);
            if ("https".equalsIgnoreCase(uri.getScheme()))
                return "pl.dagstudio.ru".equalsIgnoreCase(uri.getHost());
            if ("file".equalsIgnoreCase(uri.getScheme())) {
                File file = new File(uri.getPath()).getCanonicalFile();
                File data = getContext().getDataDir().getCanonicalFile();
                return file.getPath().startsWith(data.getPath() + File.separator);
            }
        } catch (Exception ignored) {}
        return false;
    }

    @PluginMethod
    public void loadAudio(PluginCall call) {
        String url = call.getString("url", "");
        if (!isAllowedAudioUrl(url)) {
            call.reject("Media3 URL must be a DAGSTUDIO proxy or a private cached file");
            return;
        }
        Intent intent = new Intent(getContext(), DAGMediaService.class);
        intent.setAction(DAGMediaService.ACTION_AUDIO_LOAD);
        intent.putExtra("url", url);
        intent.putExtra("cacheKey", call.getString("cacheKey", ""));
        intent.putExtra("requestId", call.getString("requestId", ""));
        intent.putExtra("positionMs", Math.max(0L, (long)(double)call.getDouble("positionMs", 0.0)));
        intent.putExtra("title", call.getString("title", "DAGSTUDIO PLAYER"));
        intent.putExtra("artist", call.getString("artist", ""));
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                getContext().startForegroundService(intent);
            else getContext().startService(intent);
            call.resolve();
        } catch (Exception error) { call.reject("Media3 could not load the track", error); }
    }

    @PluginMethod
    public void resumeAudio(PluginCall call) {
        audioCommand(call, DAGMediaService.ACTION_AUDIO_RESUME, true);
    }

    @PluginMethod
    public void pauseAudio(PluginCall call) {
        audioCommand(call, DAGMediaService.ACTION_AUDIO_PAUSE, false);
    }

    @PluginMethod
    public void stopAudio(PluginCall call) {
        audioCommand(call, DAGMediaService.ACTION_AUDIO_STOP, false);
    }

    @PluginMethod
    public void seekAudio(PluginCall call) {
        Intent intent = new Intent(getContext(), DAGMediaService.class);
        intent.setAction(DAGMediaService.ACTION_AUDIO_SEEK);
        intent.putExtra("positionMs", Math.max(0L, (long)(double)call.getDouble("positionMs", 0.0)));
        try { getContext().startService(intent); call.resolve(); }
        catch (Exception error) { call.reject("Media3 seek failed", error); }
    }

    @PluginMethod
    public void equalizerAudio(PluginCall call) {
        Intent intent = new Intent(getContext(), DAGMediaService.class);
        intent.setAction(DAGMediaService.ACTION_AUDIO_EQ);
        intent.putExtra("enabled", Boolean.TRUE.equals(call.getBoolean("enabled", false)));
        com.getcapacitor.JSArray gains = call.getArray("gains");
        intent.putExtra("gains", gains == null ? "[]" : gains.toString());
        try { getContext().startService(intent); call.resolve(); }
        catch (Exception error) { call.reject("Media3 equalizer failed", error); }
    }

    @PluginMethod
    public void audioStatus(PluginCall call) {
        call.resolve(DAGAudioEngine.lastStatus());
    }

    @PluginMethod
    public void setMediaState(PluginCall call) {
        boolean playing = Boolean.TRUE.equals(call.getBoolean("playing", false));
        Intent intent = new Intent(getContext(), DAGMediaService.class);
        intent.setAction(DAGMediaService.ACTION_UPDATE);
        intent.putExtra("playing", playing);
        intent.putExtra("title", String.valueOf(call.getString("title", "DAGSTUDIO PLAYER")));
        intent.putExtra("artist", String.valueOf(call.getString("artist", "")));
        try {
            if (playing && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getContext().startForegroundService(intent);
            } else {
                getContext().startService(intent);
            }
            call.resolve();
        } catch (Exception error) {
            call.reject("Android media session could not start", error);
        }
    }

    @PluginMethod
    public void setKeepScreenOn(PluginCall call) {
        final Boolean enabled = call.getBoolean("enabled", false);
        final Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity is unavailable");
            return;
        }
        activity.runOnUiThread(() -> {
            if (Boolean.TRUE.equals(enabled)) {
                activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            } else {
                activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            }
            call.resolve();
        });
    }
}
