package ru.dagstudio.player;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.Collections;
import java.util.List;
import okhttp3.Dns;

/**
 * Verified HTTPS IP preference for the DAGSTUDIO-owned origin. The trusted
 * address is used directly, avoiding Android DNS for this hostname.
 * OkHttp keeps the original URL hostname for
 * SNI, hostname validation and certificate-chain verification.
 *
 * This is not a general DNS bypass and does not disable TLS checks. If hosting
 * moves, the fallback IP must be refreshed in the next signed native release.
 */
public final class DAGServerDns implements Dns {
    public static final String HOST = "pl.dagstudio.ru";
    public static final String FALLBACK_IP = "188.127.241.85";

    @Override
    public List<InetAddress> lookup(String hostname) throws UnknownHostException {
        if (!HOST.equalsIgnoreCase(hostname)) return Dns.SYSTEM.lookup(hostname);
        InetAddress trusted = InetAddress.getByAddress(
            new byte[] {(byte)188, (byte)127, (byte)241, (byte)85});
        // Avoid waiting on the broken CC3 DNS resolver at all for our origin.
        // TLS still validates the certificate against "pl.dagstudio.ru".
        return Collections.singletonList(trusted);
    }
}
