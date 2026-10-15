package ru.dagstudio.player;

import android.app.Activity;
import android.content.Intent;
import android.os.Build;
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
    @Override
    public void load() {
        current = new WeakReference<>(this);
    }

    static void notifyMediaCommand(String action) {
        DAGCarModePlugin plugin = current.get();
        if (plugin == null) return;
        JSObject event = new JSObject();
        event.put("action", action);
        plugin.notifyListeners("mediaButton", event, true);
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
