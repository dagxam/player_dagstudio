package ru.dagstudio.player;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.Collections;
import java.util.List;
import okhttp3.Dns;

/**
 * DNS-only recovery for the DAGSTUDIO-owned HTTPS origin. A verified server
 * address observed during deployment is used only when Android's resolver
 * reports UnknownHostException. OkHttp keeps the original URL hostname for
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
        try {
            return Dns.SYSTEM.lookup(hostname);
        } catch (UnknownHostException dnsFailure) {
            if (!HOST.equalsIgnoreCase(hostname)) throw dnsFailure;
            return Collections.singletonList(
                InetAddress.getByAddress(new byte[] {(byte)188, (byte)127, (byte)241, (byte)85})
            );
        }
    }
}
