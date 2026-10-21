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
import java.net.URL;
import java.util.concurrent.TimeUnit;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okhttp3.MediaType;
import org.json.JSONObject;

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

    /**
     * One strictly read-only HTTPS fallback when both Android CapacitorHttp
     * and Chromium have failed DNS resolution. OkHttp resolves only the owned
     * origin using DAGServerDns, preserving TLS hostname verification.
     */
    @PluginMethod
    public void readOwnServer(PluginCall call) {
        final String value = call.getString("url", "");
        final String method = call.getString("method", "GET").toUpperCase(java.util.Locale.ROOT);
        final JSObject data = call.getObject("data", new JSObject());
        try {
            URL uri = new URL(value);
            String path = uri.getPath();
            if (!"https".equalsIgnoreCase(uri.getProtocol()) ||
                    !DAGServerDns.HOST.equalsIgnoreCase(uri.getHost()) ||
                    (uri.getPort() != -1 && uri.getPort() != 443)) {
                call.reject("Only the official DAGSTUDIO HTTPS server is allowed");
                return;
            }
            boolean safeGet = "GET".equals(method) &&
                    ("/ota-bridge.php".equals(path) || "/deploy-version.txt".equals(path));
            boolean safePost = "POST".equals(method) && "/api.php".equals(path) &&
                    "search_global".equals(data.optString("action", ""));
            if (!safeGet && !safePost) {
                call.reject("Only read-only search and update checks are allowed");
                return;
            }
            new Thread(() -> {
                OkHttpClient client = new OkHttpClient.Builder()
                    .dns(new DAGServerDns())
                    .connectTimeout(18, TimeUnit.SECONDS)
                    .readTimeout(45, TimeUnit.SECONDS)
                    .callTimeout(55, TimeUnit.SECONDS)
                    .followRedirects(false)
                    .followSslRedirects(false)
                    .build();
                try {
                    Request.Builder builder = new Request.Builder()
                        .url(value)
                        .header("Accept", "application/json, text/plain")
                        .header("User-Agent", "DAGSTUDIO-PLAYER/TEYES");
                    if (safePost) {
                        builder.post(RequestBody.create(
                            data.toString(), MediaType.parse("application/json; charset=utf-8")));
                    } else {
                        builder.get();
                    }
                    try (Response response = client.newCall(builder.build()).execute()) {
                        String body = response.body() == null ? "" : response.body().string();
                        JSObject answer = new JSObject();
                        answer.put("status", response.code());
                        answer.put("transport", "server-ip-tls-verified");
                        try { answer.put("data", new JSONObject(body)); }
                        catch (Exception ignored) { answer.put("data", body); }
                        call.resolve(answer);
                    }
                } catch (Exception error) {
                    call.reject("Official HTTPS server is unreachable via DNS fallback", error);
                } finally {
                    client.dispatcher().executorService().shutdown();
                    client.connectionPool().evictAll();
                }
            }, "dag-network-recovery").start();
        } catch (Exception error) {
            call.reject("Invalid official server request", error);
        }
    }

    @PluginMethod
    public void checkApkUpdate(PluginCall call) {
        new DAGApkUpdater(this).check(call);
    }

    @PluginMethod
    public void installApkUpdate(PluginCall call) {
        new DAGApkUpdater(this).install(call);
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
