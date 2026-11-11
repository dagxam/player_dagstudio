package ru.dagstudio.player;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.atomic.AtomicBoolean;
import okhttp3.Dns;

/**
 * First-party HTTPS DNS recovery. Resolve pl.dagstudio.ru to an initial known
 * address immediately, while refreshing the system DNS in the background.
 * The URL never changes: OkHttp still verifies the certificate, SNI and
 * hostname of pl.dagstudio.ru for every IP (including newly discovered IPs).
 */
public final class DAGServerDns implements Dns {
    public static final String HOST = "pl.dagstudio.ru";
    public static final String FALLBACK_IP = "188.127.241.85";
    private static final long SUCCESS_TTL_MS = 5 * 60 * 1000L;
    private static final long RETRY_TTL_MS = 30 * 1000L;
    private static final AtomicBoolean resolving = new AtomicBoolean(false);
    private static final ExecutorService resolver = Executors.newSingleThreadExecutor(new ThreadFactory() {
        @Override public Thread newThread(Runnable work) {
            Thread thread = new Thread(work, "dag-verified-dns-refresh");
            thread.setDaemon(true);
            return thread;
        }
    });
    private static volatile List<InetAddress> systemAddresses = Collections.emptyList();
    private static volatile long nextRefreshAt = 0L;

    private static void refreshIfNeeded() {
        long now = android.os.SystemClock.elapsedRealtime();
        if (now < nextRefreshAt || !resolving.compareAndSet(false, true)) return;
        nextRefreshAt = now + RETRY_TTL_MS;
        resolver.execute(() -> {
            try {
                List<InetAddress> discovered = Dns.SYSTEM.lookup(HOST);
                if (!discovered.isEmpty()) {
                    systemAddresses = Collections.unmodifiableList(new ArrayList<>(discovered));
                    nextRefreshAt = android.os.SystemClock.elapsedRealtime() + SUCCESS_TTL_MS;
                }
            } catch (Exception ignored) {
                // Never block the playback or API thread on a broken CC3 DNS.
            } finally {
                resolving.set(false);
            }
        });
    }

    @Override
    public List<InetAddress> lookup(String hostname) throws UnknownHostException {
        if (!HOST.equalsIgnoreCase(hostname)) return Dns.SYSTEM.lookup(hostname);
        refreshIfNeeded();
        InetAddress trusted = InetAddress.getByAddress(
            new byte[] {(byte)188, (byte)127, (byte)241, (byte)85});
        Set<InetAddress> candidates = new LinkedHashSet<>(systemAddresses);
        candidates.add(trusted);
        if (candidates.size() == 1) return Collections.singletonList(trusted);
        return new ArrayList<>(candidates);
    }
}
