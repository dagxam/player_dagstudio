<?php
// Exact HTTPS stream domains explicitly approved for a licensed Hitmos feed.
// Never trust a host name merely because the external JSON API supplies it.
function dagHitmosAudioHosts(): array {
    static $hosts = null;
    if ($hosts !== null) return $hosts;
    $hosts = [];
    foreach (array_slice(explode(',', (string)(getenv('HITMOS_AUDIO_HOSTS') ?: '')), 0, 20) as $candidate) {
        $host = strtolower(trim($candidate));
        if (strlen($host) > 253 ||
            !preg_match('/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/D', $host)) continue;
        if (!in_array($host, $hosts, true)) $hosts[] = $host;
    }
    return $hosts;
}
