package ru.dagstudio.player;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.TimeUnit;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import org.json.JSONObject;

/** Verified HTTPS APK updater, with explicit Android install confirmation. */
final class DAGApkUpdater {
    private static final String META = "https://pl.dagstudio.ru/apk/DAGSTUDIO-PLAYER-native-version.json";
    private static final String PREFIX = "https://pl.dagstudio.ru/apk/DAGSTUDIO-PLAYER-Preview-";
    private static final long MAX_SIZE = 100L * 1024 * 1024;
    private final DAGCarModePlugin plugin;

    DAGApkUpdater(DAGCarModePlugin plugin) { this.plugin = plugin; }

    private OkHttpClient client() {
        return new OkHttpClient.Builder().dns(new DAGServerDns())
            .connectTimeout(25, TimeUnit.SECONDS).readTimeout(90, TimeUnit.SECONDS)
            .callTimeout(0, TimeUnit.SECONDS)
            .followRedirects(false).followSslRedirects(false).build();
    }

    private JSONObject manifest() throws Exception {
        OkHttpClient client = client();
        try {
            Request request = new Request.Builder().url(META)
                .header("Cache-Control", "no-store").build();
            try (Response response = client.newCall(request).execute()) {
                if (!response.isSuccessful() || response.body() == null)
                    throw new IllegalStateException("Сервер APK не отвечает: " + response.code());
                if (response.body().contentLength() > 8192)
                    throw new SecurityException("Слишком большой манифест");
                JSONObject data = new JSONObject(response.body().string());
                String version = data.getString("version");
                String link = data.getString("url");
                String sha = data.getString("sha256");
                if (!version.matches("1\\.0\\.[0-9]+-preview") ||
                    !link.equals(PREFIX + version.replace("-preview","") + ".apk") ||
                    !sha.matches("(?i)[0-9a-f]{64}") || data.getInt("version_code") < 1)
                    throw new SecurityException("Недоверенный источник APK");
                return data;
            }
        } finally { shutdown(client); }
    }

    @SuppressWarnings("deprecation")
    private long version(PackageInfo info) {
        return Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode;
    }

    private long installedCode() throws Exception {
        return version(plugin.getContext().getPackageManager().getPackageInfo(
            plugin.getContext().getPackageName(), 0));
    }

    @SuppressWarnings("deprecation")
    private Signature[] signatures(PackageInfo info) {
        if (Build.VERSION.SDK_INT >= 28)
            return info.signingInfo == null ? null : info.signingInfo.getApkContentsSigners();
        return info.signatures;
    }

    @SuppressWarnings("deprecation")
    private void verify(File apk, long expectedCode) throws Exception {
        PackageManager pm = plugin.getContext().getPackageManager();
        int flags = Build.VERSION.SDK_INT >= 28 ?
            PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        PackageInfo candidate = pm.getPackageArchiveInfo(apk.getAbsolutePath(), flags);
        PackageInfo current = pm.getPackageInfo(plugin.getContext().getPackageName(), flags);
        if (candidate == null || !current.packageName.equals(candidate.packageName) ||
            version(candidate) != expectedCode || expectedCode <= version(current))
            throw new SecurityException("Неверный пакет или версия APK");
        Signature[] a = signatures(current), b = signatures(candidate);
        if (a == null || b == null || a.length != 1 || b.length != 1 ||
            !MessageDigest.isEqual(a[0].toByteArray(), b[0].toByteArray()))
            throw new SecurityException("Подпись APK не совпадает с установленной");
    }

    void check(PluginCall call) {
        new Thread(() -> {
            try {
                JSONObject data = manifest();
                JSObject result = new JSObject();
                result.put("available", data.getLong("version_code") > installedCode());
                result.put("version", data.getString("version"));
                call.resolve(result);
            } catch (Exception e) { call.reject("Ошибка проверки APK: " + e.getMessage(), e); }
        }, "dag-apk-check").start();
    }

    void install(PluginCall call) {
        new Thread(() -> {
            File part = null;
            try {
                if (Build.VERSION.SDK_INT >= 26 &&
                    !plugin.getContext().getPackageManager().canRequestPackageInstalls()) {
                    Activity activity = plugin.getActivity();
                    if (activity != null) activity.runOnUiThread(() ->
                        activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                            Uri.parse("package:" + plugin.getContext().getPackageName()))));
                    call.reject("Разрешите установку из DAGSTUDIO PLAYER и нажмите обновить ещё раз.");
                    return;
                }
                JSONObject data = manifest();
                long remote = data.getLong("version_code");
                if (remote <= installedCode()) {
                    JSObject ok = new JSObject();
                    ok.put("status", "current");
                    call.resolve(ok);
                    return;
                }
                File dir = new File(plugin.getContext().getCacheDir(), "dag-updates");
                if (!dir.isDirectory() && !dir.mkdirs())
                    throw new IllegalStateException("Нет каталога для APK");
                part = new File(dir, "download.part");
                File apk = new File(dir, "DAGSTUDIO-PLAYER-update.apk");
                if (part.exists() && !part.delete())
                    throw new IllegalStateException("Невозможно удалить старый файл");
                OkHttpClient http = client();
                MessageDigest md = MessageDigest.getInstance("SHA-256");
                long total = 0;
                try {
                    try (Response response = http.newCall(
                            new Request.Builder().url(data.getString("url")).build()).execute()) {
                        if (!response.isSuccessful() || response.body() == null)
                            throw new IllegalStateException("Не удалось скачать APK: HTTP " + response.code());
                        if (response.body().contentLength() > MAX_SIZE)
                            throw new SecurityException("Размер APK превышен");
                        try (InputStream input = response.body().byteStream();
                             FileOutputStream output = new FileOutputStream(part)) {
                            byte[] buffer = new byte[32768];
                            int count;
                            while ((count = input.read(buffer)) != -1) {
                                total += count;
                                if (total > MAX_SIZE) throw new SecurityException("APK слишком большой");
                                md.update(buffer, 0, count);
                                output.write(buffer, 0, count);
                            }
                            output.getFD().sync();
                        }
                    }
                } finally { shutdown(http); }
                StringBuilder sha = new StringBuilder();
                for (byte b : md.digest()) sha.append(String.format(Locale.ROOT,"%02x", b & 255));
                if (total < 1048576 || !sha.toString().equalsIgnoreCase(data.getString("sha256")))
                    throw new SecurityException("APK повреждён: неверный размер или SHA-256");
                verify(part, remote);
                if (apk.exists() && !apk.delete()) throw new IllegalStateException("Не удалось удалить старый APK");
                if (!part.renameTo(apk)) throw new IllegalStateException("Не удалось сохранить проверенный APK");
                part = null;
                Activity activity = plugin.getActivity();
                if (activity == null) throw new IllegalStateException("Окно установщика недоступно");
                Uri file = FileProvider.getUriForFile(plugin.getContext(),
                    plugin.getContext().getPackageName() + ".dagstudio.updates", apk);
                activity.runOnUiThread(() -> {
                    try {
                        Intent intent = new Intent(Intent.ACTION_VIEW);
                        intent.setDataAndType(file,"application/vnd.android.package-archive");
                        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        activity.startActivity(intent);
                        JSObject result = new JSObject();
                        result.put("status","installer-opened");
                        call.resolve(result);
                    } catch (Exception e) { call.reject("Ошибка запуска системного установщика", e); }
                });
            } catch (Exception e) {
                if (part != null) part.delete();
                call.reject("Ошибка обновления Android: " + e.getMessage(), e);
            }
        }, "dag-apk-install").start();
    }

    private static void shutdown(OkHttpClient client) {
        client.dispatcher().executorService().shutdown();
        client.connectionPool().evictAll();
    }
}
