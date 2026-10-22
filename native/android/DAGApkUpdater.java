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
import java.io.FileInputStream;
import java.io.IOException;
import android.os.SystemClock;
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
    private static final long MANIFEST_TTL_MS = 90_000L;
    private static final Object META_LOCK = new Object();
    private static JSONObject lastManifest;
    private static long lastManifestAt;


    DAGApkUpdater(DAGCarModePlugin plugin) { this.plugin = plugin; }

    private OkHttpClient client() {
        return new OkHttpClient.Builder().dns(new DAGServerDns())
            .connectTimeout(15, TimeUnit.SECONDS).readTimeout(45, TimeUnit.SECONDS)
            .callTimeout(210, TimeUnit.SECONDS)
            .followRedirects(false).followSslRedirects(false).build();
    }

    private JSONObject manifest() throws Exception {
        synchronized (META_LOCK) {
            if (lastManifest != null &&
                SystemClock.elapsedRealtime() - lastManifestAt < MANIFEST_TTL_MS) {
                return new JSONObject(lastManifest.toString());
            }
        }
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
                synchronized (META_LOCK) {
                    lastManifest = new JSONObject(data.toString());
                    lastManifestAt = SystemClock.elapsedRealtime();
                }
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

    private void progress(String status, long bytes, long total) {
        JSObject event = new JSObject();
        event.put("state", status);
        event.put("bytes", bytes);
        event.put("total", total);
        event.put("percent", total > 0 ? Math.min(100, (int)(bytes * 100 / total)) : -1);
        plugin.emitApkUpdateProgress(event);
    }

    /** Resume only a version-specific partial APK from our own HTTPS host. */
    private File download(JSONObject data, File dir) throws Exception {
        final String expectedHash = data.getString("sha256").toLowerCase(Locale.ROOT);
        final File part = new File(dir, expectedHash + ".part");
        File[] old = dir.listFiles();
        if (old != null) for (File candidate : old) {
            if (candidate.getName().endsWith(".part") && !candidate.equals(part)) candidate.delete();
        }
        if (part.length() > MAX_SIZE) part.delete();
        final String url = data.getString("url");
        Exception lastError = null;
        final long deadline = SystemClock.elapsedRealtime() + 360_000L;
        for (int attempt = 1; attempt <= 3; attempt++) {
            if (SystemClock.elapsedRealtime() > deadline)
                throw new IOException("Превышено время загрузки. Повторите обновление.");
            long offset = part.isFile() ? part.length() : 0;
            if (offset >= 1048576L) {
                // Already downloaded completely? The entire SHA must match before installing.
                if (verifiedSha(part, expectedHash)) {
                    progress("verifying", offset, offset);
                    return part;
                }
            }
            if (attempt > 1) progress("retrying", offset, 0);
            OkHttpClient http = client();
            try {
                Request.Builder builder = new Request.Builder().url(url)
                    .header("Cache-Control", "no-store").header("Accept-Encoding", "identity");
                if (offset > 0) builder.header("Range", "bytes=" + offset + "-");
                try (Response response = http.newCall(builder.build()).execute()) {
                    int code = response.code();
                    if (code == 416 && offset > 0) {
                        // Stale or incomplete cached range; retry a clean full download.
                        part.delete();
                        throw new IOException("Частичный APK устарел: повторяем с начала");
                    }
                    if (code >= 500 || code == 408 || code == 429)
                        throw new IOException("Сервер временно недоступен: HTTP " + code);
                    if ((code != 200 && code != 206) || response.body() == null)
                        throw new SecurityException("Неверный ответ сервера APK: HTTP " + code);
                    boolean append = offset > 0 && code == 206;
                    if (code == 206) {
                        String contentRange = response.header("Content-Range", "");
                        if (!contentRange.startsWith("bytes " + offset + "-"))
                            throw new SecurityException("Неправильный Content-Range APK");
                    }
                    if (!append) offset = 0;
                    long length = response.body().contentLength();
                    long fullLength = length < 0 ? -1 : offset + length;
                    if (fullLength > MAX_SIZE) throw new SecurityException("APK слишком большой");
                    // A range request must get exactly a matching Content-Range;
                    // servers without Range support can safely restart from zero.
                    long downloaded = offset;
                    long lastReport = 0;
                    try (InputStream input = response.body().byteStream();
                         FileOutputStream output = new FileOutputStream(part, append)) {
                        progress("downloading", downloaded, fullLength);
                        byte[] buffer = new byte[65536];
                        int n;
                        while ((n = input.read(buffer)) != -1) {
                            downloaded += n;
                            if (downloaded > MAX_SIZE) throw new SecurityException("APK слишком большой");
                            output.write(buffer, 0, n);
                            long now = SystemClock.elapsedRealtime();
                            if (now - lastReport >= 450) {
                                progress("downloading", downloaded, fullLength);
                                lastReport = now;
                            }
                            if (now > deadline)
                                throw new IOException("Превышено время загрузки APK");
                        }
                        output.getFD().sync();
                    }
                    progress("verifying", downloaded, fullLength);
                    if (downloaded < 1048576L || (fullLength > 0 && downloaded != fullLength))
                        throw new IOException("Загрузка APK прервалась");
                }
                if (!verifiedSha(part, expectedHash)) {
                    part.delete();
                    throw new SecurityException("Контрольная сумма APK не совпала");
                }
                return part;
            } catch (IOException error) {
                lastError = error; // Keep partial file for HTTP Range resume.
                if (attempt == 3) break;
                try { Thread.sleep(attempt * 500L); }
                catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    throw new IOException("Загрузка прервана", interrupted);
                }
            } finally {
                shutdown(http);
            }
        }
        throw lastError == null ? new IOException("Не удалось скачать APK") : lastError;
    }

    private boolean verifiedSha(File file, String expected) throws Exception {
        if (!file.isFile() || file.length() < 1048576L || file.length() > MAX_SIZE) return false;
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (FileInputStream input = new FileInputStream(file)) {
            byte[] buffer = new byte[65536];
            int n;
            while ((n = input.read(buffer)) != -1) digest.update(buffer, 0, n);
        }
        StringBuilder actual = new StringBuilder(64);
        for (byte value : digest.digest())
            actual.append(String.format(Locale.ROOT, "%02x", value & 255));
        return actual.toString().equals(expected);
    }

    void install(PluginCall call) {
        new Thread(() -> {
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
                File part = download(data, dir);
                progress("verifying", part.length(), part.length());
                verify(part, remote); // Validate package and the installed signing certificate.
                File apk = new File(dir, "DAGSTUDIO-PLAYER-update.apk");
                if (apk.exists() && !apk.delete())
                    throw new IllegalStateException("Не удалось удалить старый APK");
                if (!part.renameTo(apk))
                    throw new IllegalStateException("Не удалось сохранить проверенный APK");
                Activity activity = plugin.getActivity();
                if (activity == null) throw new IllegalStateException("Окно установщика недоступно");
                Uri uri = FileProvider.getUriForFile(plugin.getContext(),
                    plugin.getContext().getPackageName() + ".dagstudio.updates", apk);
                progress("installing", apk.length(), apk.length());
                activity.runOnUiThread(() -> {
                    try {
                        Intent intent = new Intent(Intent.ACTION_VIEW);
                        intent.setDataAndType(uri, "application/vnd.android.package-archive");
                        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        activity.startActivity(intent);
                        JSObject result = new JSObject();
                        result.put("status", "installer-opened");
                        call.resolve(result);
                    } catch (Exception e) { call.reject("Ошибка запуска системного установщика", e); }
                });
            } catch (Exception e) {
                call.reject("Ошибка обновления Android: " + e.getMessage(), e);
            }
        }, "dag-apk-install").start();
    }

    private static void shutdown(OkHttpClient client) {
        client.dispatcher().executorService().shutdown();
        client.connectionPool().evictAll();
    }
}
