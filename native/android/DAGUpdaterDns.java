package ru.dagstudio.player;

import android.util.Log;
import java.lang.reflect.Field;
import okhttp3.OkHttpClient;

/**
 * Capgo 8.53.0 routes OTA ZIP downloads through DownloadService.sharedClient.
 * Preserve its existing HTTPS enforcement, redirect policy, timeouts, cookie
 * isolation, interceptors and certificate checks; change DNS resolution only.
 * If a future Capgo version removes the field, fail closed: the original
 * updater still works with normal DNS and logs this compatibility issue.
 */
public final class DAGUpdaterDns {
    private DAGUpdaterDns() {}

    public static boolean install() {
        try {
            Class<?> service = Class.forName("ee.forgr.capacitor_updater.DownloadService");
            Field field = service.getDeclaredField("sharedClient");
            field.setAccessible(true);
            synchronized (service) {
                Object value = field.get(null);
                if (!(value instanceof OkHttpClient)) return false;
                OkHttpClient previous = (OkHttpClient) value;
                if (previous.dns() instanceof DAGServerDns) return true;
                // newBuilder() retains Capgo's security interceptors, normal TLS
                // hostname validation and all other updater configuration.
                field.set(null, previous.newBuilder().dns(new DAGServerDns()).build());
            }
            return true;
        } catch (Exception error) {
            Log.w("DAGSTUDIO-OTA", "Capgo DNS adapter unavailable", error);
            return false;
        }
    }
}
