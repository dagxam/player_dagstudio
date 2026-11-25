<?php
/**
 * Opt-in licensed music API adapter configuration.
 * Partner provides its OWN authorized HTTPS JSON search service and exact
 * HTTPS audio hostnames; credentials and rights remain with the operator.
 *
 * Never crawl arbitrary web pages, remove DRM or derive audio from embeds.
 */
function dagPartnerConfig(): array {
    $rights = (string)(getenv('DAG_PARTNER_RIGHTS_CONFIRMED') ?: '') === '1';
    $api = trim((string)(getenv('DAG_PARTNER_SEARCH_API_URL') ?: ''));
    $hosts = [];
    foreach (array_slice(explode(',',(string)(getenv('DAG_PARTNER_AUDIO_HOSTS') ?: '')),0,20) as $candidate) {
        $host = strtolower(trim($candidate));
        if (strlen($host)>253 || !preg_match(
            '/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/D', $host)) continue;
        if (!in_array($host,$hosts,true)) $hosts[] = $host;
    }
    $parts = parse_url($api);
    $host = is_array($parts) ? strtolower((string)($parts['host'] ?? '')) : '';
    $valid = $rights && $hosts && is_array($parts) && strlen($api) <= 512 &&
        ($parts['scheme'] ?? '') === 'https' && strlen($host) <= 253 &&
        preg_match('/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/D', $host) &&
        !isset($parts['port']) && !isset($parts['user']) && !isset($parts['pass']) &&
        !isset($parts['query']) && !isset($parts['fragment']) &&
        !filter_var($host,FILTER_VALIDATE_IP);
    return ['enabled' => (bool)$valid, 'url' => $valid ? $api : '', 'audio_hosts' => $hosts];
}

function dagPartnerParse(string $json, array $hosts): array {
    $parsed = json_decode($json,true);
    if (!is_array($parsed) || !is_array($parsed['tracks'] ?? null)) return [];
    $items = [];
    foreach (array_slice($parsed['tracks'],0,40) as $track) {
        if (!is_array($track)) continue;
        $title = mb_substr(trim(strip_tags((string)($track['title'] ?? ''))),0,180);
        $artist = mb_substr(trim(strip_tags((string)($track['artist'] ?? ''))),0,140);
        $url = trim((string)($track['audio_url'] ?? ''));
        $parts = parse_url($url);
        if ($title === '' || $artist === '' || strlen($url)>2048 ||
            !is_array($parts) || ($parts['scheme'] ?? '') !== 'https' ||
            !in_array(strtolower((string)($parts['host'] ?? '')),$hosts,true) ||
            isset($parts['port']) || isset($parts['user']) || isset($parts['pass']) ||
            isset($parts['fragment'])) continue;
        // Explicit operator permission is mandatory. Each record must also
        // expressly be marked as a full, streamable song.
        if (($track['playable'] ?? null) !== true) continue;
        $release = (string)($track['release_date'] ?? '');
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/',$release) ||
            !checkdate((int)substr($release,5,2),(int)substr($release,8,2),(int)substr($release,0,4)) ||
            $release>gmdate('Y-m-d')) $release = '';
        $items[] = [
            'title'=>$title,'artist'=>$artist,
            'url'=>$url,'source'=>'[PARTNER]','type'=>'audio',
            'thumb'=>'images/cover.png','release_date'=>$release
        ];
    }
    return $items;
}
