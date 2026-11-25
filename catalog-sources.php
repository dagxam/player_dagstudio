<?php
declare(strict_types=1);

/**
 * DAGSTUDIO PLAYER: discovery-only sources for the unified music search.
 * A catalog link is NOT an audio URL. Never return these as playable tracks.
 * Fixed HTTPS hosts only, no redirects, no arbitrary user-provided URLs.
 */
function dagCatalogNormalize(string $value): string {
    return trim(preg_replace('/\s+/u', ' ', html_entity_decode(strip_tags($value), ENT_QUOTES | ENT_HTML5, 'UTF-8')) ?? '');
}
function dagCatalogMatches(string $candidate, array $words): bool {
    $haystack = mb_strtolower(dagCatalogNormalize($candidate), 'UTF-8');
    foreach ($words as $word) {
        if (mb_strpos($haystack, $word) === false) return false;
    }
    return true;
}
function dagCatalogLink(string $candidate, string $domain, string $pattern): string {
    $candidate = trim(html_entity_decode($candidate, ENT_QUOTES | ENT_HTML5, 'UTF-8'));
    if ($candidate === '' || str_starts_with($candidate, '//')) return '';
    if (str_starts_with($candidate, '/')) $candidate = 'https://' . $domain . $candidate;
    $parts = parse_url($candidate);
    if (!is_array($parts) || strtolower($parts['scheme'] ?? '') !== 'https' ||
        strtolower($parts['host'] ?? '') !== $domain ||
        isset($parts['port']) || isset($parts['user']) || isset($parts['pass'])) return '';
    if (!preg_match($pattern, (string)($parts['path'] ?? ''))) return '';
    return 'https://' . $domain . (string)$parts['path'];
}
function dagCatalogHtml(string $html, string $key, array $words): array {
    if ($html === '' || strlen($html) > 800000 || !class_exists('DOMDocument')) return [];
    $definitions = [
        'muzrecord' => ['muzrecord.com', '~^/\d+-[a-z0-9-]+\.html$~i'],
        'hitmos' => ['rus.hitmos.fm', '~^/song/\d+$~'],
        'muzpace' => ['muzpace.net', '~^/mp3/\d+$~']
    ];
    if (!isset($definitions[$key])) return [];
    [$domain, $pathPattern] = $definitions[$key];
    $previous = libxml_use_internal_errors(true);
    try {
        $dom = new DOMDocument();
        if (!@$dom->loadHTML('<?xml encoding="utf-8" ?>' . $html, LIBXML_NONET | LIBXML_NOWARNING | LIBXML_NOERROR)) return [];
        $xp = new DOMXPath($dom);
        $seen = [];
        $results = [];
        foreach ($xp->query('//a[@href]') ?: [] as $anchor) {
            $url = dagCatalogLink((string)$anchor->getAttribute('href'), $domain, $pathPattern);
            if ($url === '' || isset($seen[$url])) continue;
            $title = dagCatalogNormalize((string)($anchor->getAttribute('title') ?: $anchor->textContent));
            if (mb_strlen($title, 'UTF-8') < 3 || mb_strlen($title, 'UTF-8') > 165) continue;
            $context = $title;
            $parent = $anchor->parentNode;
            if ($parent) {
                $parentText = dagCatalogNormalize((string)$parent->textContent);
                if (mb_strlen($parentText, 'UTF-8') <= 260) $context .= ' ' . $parentText;
            }
            // Require every search word; a page HTTP 200 alone does not create a result.
            if (!dagCatalogMatches($context, $words)) continue;
            $seen[$url] = true;
            $results[] = [
                'title' => $title,
                'url' => $url,
                'source' => strtoupper($key),
                'playable' => false,
                'kind' => 'catalog'
            ];
            if (count($results) >= 12) break;
        }
        return $results;
    } finally {
        libxml_clear_errors();
        libxml_use_internal_errors($previous);
    }
}
function dagCatalogWordpress(string $body, string $key, array $words): array {
    $items = json_decode($body, true);
    if (!is_array($items)) return [];
    $domain = $key === 'zvukm' ? 'zvuk-m.com' : 'kavkazmusic.tv';
    $seen = [];
    $results = [];
    foreach (array_slice($items, 0, 20) as $item) {
        if (!is_array($item) || ($item['subtype'] ?? 'post') !== 'post') continue;
        $title = dagCatalogNormalize((string)($item['title'] ?? ''));
        $url = dagCatalogLink((string)($item['url'] ?? ''), $domain, '~^/[^?]+/?$~u');
        if ($title === '' || mb_strlen($title, 'UTF-8') > 170 ||
            $url === '' || !dagCatalogMatches($title, $words) || isset($seen[$url])) continue;
        $seen[$url] = true;
        $results[] = [
            'title' => $title, 'url' => $url,
            'source' => strtoupper($key),
            'playable' => false, 'kind' => 'release'
        ];
        if (count($results) >= 12) break;
    }
    return $results;
}
function dagCatalogSearch(string $rawQuery): array {
    $query = dagCatalogNormalize($rawQuery);
    if (mb_strlen($query, 'UTF-8') < 2 || mb_strlen($query, 'UTF-8') > 80) {
        return ['success' => false, 'error' => 'invalid_query', 'data' => [], 'sources' => []];
    }
    $words = preg_split('/\s+/u', mb_strtolower($query, 'UTF-8'), -1, PREG_SPLIT_NO_EMPTY) ?: [];
    $encoded = rawurlencode($query);
    $targets = [
        'muzrecord' => 'https://muzrecord.com/index.php?do=search&subaction=search&story=' . $encoded,
        'hitmos' => 'https://rus.hitmos.fm/search?q=' . $encoded,
        // The only MuzPace page confirmed to expose real song links without anti-bot redirects.
        'muzpace' => 'https://muzpace.net/playlists/kavkazskaya',
        'zvukm' => 'https://zvuk-m.com/wp-json/wp/v2/search?search=' . $encoded . '&per_page=12',
        'kavkaz' => 'https://kavkazmusic.tv/wp-json/wp/v2/search?search=' . $encoded . '&per_page=12'
    ];
    if (!function_exists('curl_multi_init')) {
        return ['success' => true, 'data' => [], 'sources' => [], 'note' => 'curl_unavailable'];
    }
    $multi = curl_multi_init();
    $channels = [];
    foreach ($targets as $key => $url) {
        $buffer = '';
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => false,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_CONNECTTIMEOUT => 3,
            CURLOPT_TIMEOUT => 7,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_IPRESOLVE => CURL_IPRESOLVE_V4,
            CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
            CURLOPT_USERAGENT => 'DAGSTUDIO-PLAYER-Catalog/1.0',
            CURLOPT_HTTPHEADER => ['Accept: text/html,application/json', 'Accept-Language: ru-RU,ru;q=0.9'],
            CURLOPT_WRITEFUNCTION => static function ($handle, string $chunk) use (&$buffer): int {
                if (strlen($buffer) + strlen($chunk) > 800000) return 0;
                $buffer .= $chunk;
                return strlen($chunk);
            }
        ]);
        curl_multi_add_handle($multi, $ch);
        $channels[$key] = ['handle' => $ch, 'buffer' => &$buffer];
        unset($buffer);
    }
    $active = 0;
    do {
        do { $state = curl_multi_exec($multi, $active); }
        while ($state === CURLM_CALL_MULTI_PERFORM);
        if ($active > 0 && curl_multi_select($multi, 0.2) === -1) usleep(20000);
    } while ($active > 0 && $state === CURLM_OK);
    $bySource = [];
    $statuses = [];
    foreach ($channels as $key => $entry) {
        $ch = $entry['handle'];
        $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $type = strtolower((string)curl_getinfo($ch, CURLINFO_CONTENT_TYPE));
        $valid = $status === 200 && curl_errno($ch) === 0;
        $body = $valid ? (string)$entry['buffer'] : '';
        $items = [];
        if ($valid && str_contains($type, 'html') && in_array($key, ['muzrecord','hitmos','muzpace'], true))
            $items = dagCatalogHtml($body, $key, $words);
        if ($valid && str_contains($type, 'json') && in_array($key, ['zvukm','kavkaz'], true))
            $items = dagCatalogWordpress($body, $key, $words);
        $bySource[$key] = $items;
        $statuses[$key] = ['http' => $status, 'found' => count($items), 'catalog_only' => true];
        curl_multi_remove_handle($multi, $ch);
        curl_close($ch);
    }
    curl_multi_close($multi);
    $data = [];
    // Fair interleaving: no site may drown out a different source.
    for ($i = 0; $i < 12 && count($data) < 40; $i++) {
        $added = false;
        foreach (array_keys($targets) as $key) {
            if (!isset($bySource[$key][$i])) continue;
            $data[] = $bySource[$key][$i];
            $added = true;
            if (count($data) >= 40) break;
        }
        if (!$added) break;
    }
    return ['success' => true, 'data' => $data, 'sources' => $statuses,
        'note' => 'Catalog results link to original sources. Audio is not verified.'];
}


/**
 * Dedicated playback integration. Unlike discovery-only metadata, every track
 * contains an explicit HTTPS MP3 URL from an exact approved audio host and
 * must pass a byte-Range response probe before being sent to the player.
 */
function dagPlayableAudioUrl(string $candidate, string $source): string {
    $candidate = html_entity_decode(trim($candidate), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    if (strlen($candidate) > 1100) return '';
    $p = parse_url($candidate);
    if (!is_array($p) || strtolower((string)($p['scheme'] ?? '')) !== 'https' ||
        isset($p['port']) || isset($p['user']) || isset($p['pass']) || isset($p['fragment'])) return '';
    $host = strtolower((string)($p['host'] ?? ''));
    $allowed = match ($source) {
        'muzrecord' => $host === 's.muzrecord.com' &&
            str_starts_with((string)($p['path'] ?? ''), '/mp3/'),
        'muzpace' => $host === 'cdn.muzpace.net' &&
            str_starts_with((string)($p['path'] ?? ''), '/dll/'),
        'hitmos' => (bool)preg_match('/^plc[0-9]{1,3}\.hitmos\.fm$/D', $host),
        default => false
    };
    if (!$allowed || !preg_match('/\.mp3$/iD', (string)($p['path'] ?? ''))) return '';
    return $candidate;
}
function dagPlayableMake(string $title, string $artist, string $url, string $source, array $words): ?array {
    $title = dagCatalogNormalize($title);
    $artist = dagCatalogNormalize($artist);
    $url = dagPlayableAudioUrl($url, $source);
    if (!$url || $title === '' || $artist === '' ||
        mb_strlen($title, 'UTF-8') > 180 || mb_strlen($artist, 'UTF-8') > 160 ||
        !dagCatalogMatches($title . ' ' . $artist, $words)) return null;
    return [
        'title' => $title, 'artist' => $artist, 'url' => $url,
        'type' => 'audio', 'thumb' => 'images/cover.png',
        'source' => '[' . strtoupper($source) . ']'
    ];
}
function dagPlayableParseHtml(string $body, string $source, array $words): array {
    if ($body === '' || strlen($body) > 850000) return [];
    $result = [];
    $seen = [];
    if ($source === 'hitmos') {
        // Hitmos embeds track metadata and "play" MP3 in a serialized React
        // response, not in the visible song anchors. No download or bypass API.
        $normal = str_replace('\\"', '"', $body);
        preg_match_all('~\{"id":\d+,"title":"((?:\\\\.|[^"\\\\])*)","artist":"((?:\\\\.|[^"\\\\])*)","duration":\d+,"play":"(https://plc[0-9]+\.hitmos\.fm/[^"]+\.mp3)"~u',
            $normal, $matches, PREG_SET_ORDER);
        foreach ($matches as $m) {
            $title = json_decode('"' . $m[1] . '"') ?: $m[1];
            $artist = json_decode('"' . $m[2] . '"') ?: $m[2];
            $row = dagPlayableMake((string)$title, (string)$artist, $m[3], $source, $words);
            if (!$row || isset($seen[$row['url']])) continue;
            $seen[$row['url']] = true;
            $result[] = $row;
            if (count($result) >= 14) break;
        }
        return $result;
    }
    if (!class_exists('DOMDocument')) return [];
    $previous = libxml_use_internal_errors(true);
    try {
        $dom = new DOMDocument();
        if (!@$dom->loadHTML('<?xml encoding="utf-8" ?>' . $body,
            LIBXML_NONET | LIBXML_NOWARNING | LIBXML_NOERROR)) return [];
        $xp = new DOMXPath($dom);
        // Both sites publish the audio URL and artist/title as data attributes.
        $selector = $source === 'muzrecord' ? '//*[@data-track and @data-title and @data-artist]'
            : '//*[@data-url and @data-title and @data-artist]';
        foreach ($xp->query($selector) ?: [] as $element) {
            $row = dagPlayableMake(
                $element->getAttribute('data-title'),
                $element->getAttribute('data-artist'),
                $element->getAttribute($source === 'muzrecord' ? 'data-track' : 'data-url'),
                $source, $words
            );
            if (!$row || isset($seen[$row['url']])) continue;
            $seen[$row['url']] = true;
            $result[] = $row;
            if (count($result) >= 14) break;
        }
    } finally {
        libxml_clear_errors();
        libxml_use_internal_errors($previous);
    }
    return $result;
}
function dagVerifyPlayableRanges(array $candidates): array {
    if (!function_exists('curl_multi_init') || !$candidates) return [];
    $mh = curl_multi_init();
    $handles = [];
    foreach (array_slice($candidates, 0, 32) as $i => $candidate) {
        $bytes = 0;
        $ch = curl_init($candidate['url']);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => false, CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_CONNECTTIMEOUT => 3, CURLOPT_TIMEOUT => 5,
            CURLOPT_RANGE => '0-511', CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_SSL_VERIFYPEER => true, CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_IPRESOLVE => CURL_IPRESOLVE_V4,
            CURLOPT_USERAGENT => 'DAGSTUDIO-PLAYER-Range-Check/1.0',
            CURLOPT_HTTPHEADER => ['Accept: audio/mpeg'],
            CURLOPT_WRITEFUNCTION => static function ($ch, string $chunk) use (&$bytes): int {
                $bytes += strlen($chunk);
                return $bytes <= 1024 ? strlen($chunk) : 0;
            }
        ]);
        curl_multi_add_handle($mh, $ch);
        $handles[] = ['handle' => $ch, 'row' => $candidate, 'count' => &$bytes];
        unset($bytes);
    }
    $active = 0;
    do {
        do { $state = curl_multi_exec($mh, $active); }
        while ($state === CURLM_CALL_MULTI_PERFORM);
        if ($active > 0 && curl_multi_select($mh, 0.12) === -1) usleep(20000);
    } while ($active > 0 && $state === CURLM_OK);
    $verified = [];
    foreach ($handles as $entry) {
        $ch = $entry['handle'];
        $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $type = strtolower((string)curl_getinfo($ch, CURLINFO_CONTENT_TYPE));
        $n = (int)$entry['count'];
        if ($status === 206 && curl_errno($ch) === 0 && $n >= 128 &&
            str_starts_with($type, 'audio/')) $verified[] = $entry['row'];
        curl_multi_remove_handle($mh, $ch);
        curl_close($ch);
    }
    curl_multi_close($mh);
    return $verified;
}
function dagSearchPlayableCatalogs(string $rawQuery): array {
    $query = dagCatalogNormalize($rawQuery);
    if (mb_strlen($query, 'UTF-8') < 2 || mb_strlen($query, 'UTF-8') > 80) {
        return ['success' => false, 'data' => [], 'sources' => [], 'error' => 'invalid_query'];
    }
    if (!function_exists('curl_multi_init'))
        return ['success' => true, 'data' => [], 'sources' => [], 'error' => 'curl_unavailable'];
    $words = preg_split('/\s+/u', mb_strtolower($query, 'UTF-8'), -1, PREG_SPLIT_NO_EMPTY) ?: [];
    $encoded = rawurlencode($query);
    $targets = [
        'muzrecord' => 'https://muzrecord.com/index.php?do=search&subaction=search&story=' . $encoded,
        'hitmos' => 'https://rus.hitmos.fm/search?q=' . $encoded,
        'muzpace' => 'https://muzpace.net/playlists/kavkazskaya'
    ];
    $multi = curl_multi_init();
    $requests = [];
    foreach ($targets as $name => $url) {
        $buf = '';
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => false, CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_CONNECTTIMEOUT => 3, CURLOPT_TIMEOUT => 8,
            CURLOPT_SSL_VERIFYPEER => true, CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_IPRESOLVE => CURL_IPRESOLVE_V4,
            CURLOPT_USERAGENT => 'DAGSTUDIO-PLAYER-SourceAvailabilityProbe/1.0',
            CURLOPT_HTTPHEADER => ['Accept: text/html,application/xhtml+xml', 'Accept-Language: ru-RU,ru;q=0.9'],
            CURLOPT_WRITEFUNCTION => static function ($ch, string $chunk) use (&$buf): int {
                if (strlen($buf) + strlen($chunk) > 850000) return 0;
                $buf .= $chunk;
                return strlen($chunk);
            }
        ]);
        curl_multi_add_handle($multi, $ch);
        $requests[$name] = ['handle' => $ch, 'body' => &$buf];
        unset($buf);
    }
    $active = 0;
    do {
        do { $state = curl_multi_exec($multi, $active); }
        while ($state === CURLM_CALL_MULTI_PERFORM);
        if ($active > 0 && curl_multi_select($multi, 0.15) === -1) usleep(20000);
    } while ($active > 0 && $state === CURLM_OK);
    $statuses = [];
    $candidates = [];
    foreach ($requests as $name => $entry) {
        $ch = $entry['handle'];
        $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $valid = $status === 200 && curl_errno($ch) === 0;
        $found = $valid ? dagPlayableParseHtml((string)$entry['body'], $name, $words) : [];
        $statuses[$name] = [
            'http' => $status,
            'candidates' => count($found), 'verified' => 0
        ];
        // Limit work, especially when Hitmos returns hundreds of matches.
        $candidates = array_merge($candidates, array_slice($found, 0, 10));
        curl_multi_remove_handle($multi, $ch);
        curl_close($ch);
    }
    curl_multi_close($multi);
    // Avoid duplicate URLs if HTML / React data repeat the same candidate.
    $urls = [];
    $unique = [];
    foreach ($candidates as $entry) {
        if (isset($urls[$entry['url']])) continue;
        $urls[$entry['url']] = true;
        $unique[] = $entry;
    }
    $verified = dagVerifyPlayableRanges($unique);
    $bySource = [];
    foreach ($verified as $entry) {
        $key = strtolower(trim((string)$entry['source'], '[]'));
        $statuses[$key]['verified']++;
        $bySource[$key][] = $entry;
    }
    $data = [];
    for ($i = 0; $i < 10 && count($data) < 30; $i++) {
        foreach (array_keys($targets) as $key) {
            if (isset($bySource[$key][$i])) $data[] = $bySource[$key][$i];
        }
    }
    return ['success' => true, 'data' => $data,
        'sources' => $statuses, 'audio_verified' => true];
}
