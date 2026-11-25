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
