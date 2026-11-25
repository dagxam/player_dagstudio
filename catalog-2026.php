<?php
/**
 * DAGSTUDIO release discovery 2026.
 *
 * Metadata-only adapters for MusicBrainz (public catalog) and Kavkaz Music
 * (official publisher's public releases). NEVER extract hidden audio links,
 * private API tokens, DRM streams or download editorial pages as audio.
 * Only verified, separately authorized audio results may enter playback.
 */
declare(strict_types=1);

function dagCatalogIsSafeUrl(string $url): bool {
    $parts = parse_url($url);
    if (!is_array($parts) || ($parts['scheme'] ?? '') !== 'https' ||
        isset($parts['port']) || isset($parts['user']) || isset($parts['pass']) ||
        isset($parts['fragment']) || filter_var($parts['host'] ?? '', FILTER_VALIDATE_IP)) return false;
    $host = strtolower((string)($parts['host'] ?? ''));
    $path = (string)($parts['path'] ?? '/');
    return ($host === 'musicbrainz.org' && $path === '/ws/2/release/') ||
        ($host === 'kavkazmusic.tv' && (
            $path === '/category/trackcards/feed/' ||
            $path === '/category/trackcards/'));
}

function dagCatalogFetch(string $url): string {
    if (!dagCatalogIsSafeUrl($url) || !function_exists('curl_init')) return '';
    $buffer = '';
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_CONNECTTIMEOUT => 3,
        CURLOPT_TIMEOUT => 6,
        CURLOPT_SSL_VERIFYPEER => true, CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_IPRESOLVE => CURL_IPRESOLVE_V4,
        CURLOPT_ENCODING => '',
        CURLOPT_USERAGENT => 'DAGSTUDIO-PLAYER/1.0 (https://pl.dagstudio.ru; music release metadata)',
        CURLOPT_HTTPHEADER => ['Accept: application/json,application/rss+xml,application/xml,text/html;q=0.8'],
        CURLOPT_WRITEFUNCTION => static function($handle, string $chunk) use (&$buffer): int {
            if (strlen($buffer) + strlen($chunk) > 600000) return 0;
            $buffer .= $chunk;
            return strlen($chunk);
        }
    ]);
    curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $err = curl_errno($ch);
    curl_close($ch);
    return $status === 200 && $err === 0 ? $buffer : '';
}

function dagCatalogValidDate(string $date): bool {
    if (!preg_match('/^(2026)-(\d{2})-(\d{2})$/', $date, $m)) return false;
    return checkdate((int)$m[2], (int)$m[3], 2026) &&
        $date <= gmdate('Y-m-d');
}

function dagCatalogRelease(string $title, string $artist, string $url, string $provider,
                           string $releaseDate = '', string $published = ''): ?array {
    $title = trim(strip_tags($title));
    $artist = trim(strip_tags($artist));
    if ($title === '' || $artist === '' || mb_strlen($title) > 180 ||
        mb_strlen($artist) > 140 || !filter_var($url, FILTER_VALIDATE_URL)) return null;
    $host = strtolower((string)(parse_url($url, PHP_URL_HOST) ?: ''));
    if (!in_array($host, ['musicbrainz.org','kavkazmusic.tv'], true) ||
        strtolower((string)parse_url($url, PHP_URL_SCHEME)) !== 'https') return null;
    $released = dagCatalogValidDate($releaseDate) ? $releaseDate : '';
    $publication = dagCatalogValidDate($published) ? $published : '';
    if (!$released && !$publication) return null;
    return [
        'title' => $title, 'artist' => $artist,
        'release_date' => $released, 'published_date' => $publication,
        'source_url' => $url, 'catalog_source' => $provider,
        'playable' => false, 'audio_url' => null
    ];
}

function dagCatalogMusicBrainz(array $payload): array {
    $out = [];
    foreach (array_slice($payload['releases'] ?? [], 0, 50) as $release) {
        if (!is_array($release) || (string)($release['country'] ?? '') !== 'RU') continue;
        $date = (string)($release['date'] ?? '');
        if (!dagCatalogValidDate($date)) continue;
        $artist = '';
        foreach ($release['artist-credit'] ?? [] as $piece) {
            if (!is_array($piece)) continue;
            $artist .= (string)($piece['name'] ?? ($piece['artist']['name'] ?? ''));
            $artist .= (string)($piece['joinphrase'] ?? '');
        }
        $id = (string)($release['id'] ?? '');
        if (!preg_match('/^[a-f0-9-]{36}$/i', $id)) continue;
        // Russian language / script, not merely a release distributed in RU.
        $russian = (string)($release['text-representation']['language'] ?? '') === 'rus' ||
            preg_match('/[А-Яа-яЁё]/u', $artist . (string)($release['title'] ?? ''));
        if (!$russian) continue;
        $item = dagCatalogRelease((string)($release['title'] ?? ''), $artist,
            'https://musicbrainz.org/release/' . $id, 'musicbrainz',
            $date);
        if ($item !== null) $out[] = $item;
    }
    return $out;
}

function dagCatalogSplitTitle(string $title): array {
    $title = trim(html_entity_decode(strip_tags($title), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
    $title = preg_replace('/\s+/u',' ', $title);
    // Official editorial convention: "Artist. «Song»" (do not infer from body).
    if (preg_match('/^(.{2,115}?)\.\s*[«"](.{1,175}?)[»"]/u', $title, $m))
        return [trim($m[1]), trim($m[2])];
    if (preg_match('/^(.{2,115}?)\s+[—–-]\s+(.{1,175})$/u', $title, $m))
        return [trim($m[1]), trim($m[2])];
    return ['', ''];
}

function dagCatalogKavkazRSS(string $xml): array {
    if (!class_exists('DOMDocument') || trim($xml) === '') return [];
    $doc = new DOMDocument();
    $prior = libxml_use_internal_errors(true);
    $loaded = $doc->loadXML($xml, LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING);
    libxml_clear_errors();
    libxml_use_internal_errors($prior);
    if (!$loaded) return [];
    $xpath = new DOMXPath($doc);
    $out = [];
    foreach ($xpath->query('//item') as $node) {
        $name = trim((string)$xpath->evaluate('string(title)', $node));
        [$artist, $title] = dagCatalogSplitTitle($name);
        $link = trim((string)$xpath->evaluate('string(link)', $node));
        $stamp = trim((string)$xpath->evaluate('string(pubDate)', $node));
        $time = $stamp ? strtotime($stamp) : false;
        $date = $time ? gmdate('Y-m-d', $time) : '';
        $item = dagCatalogRelease($title, $artist, $link, 'kavkaz_music', '', $date);
        if ($item !== null) $out[] = $item;
    }
    return $out;
}

function dagCatalogKavkazHTML(string $html): array {
    if (!class_exists('DOMDocument') || $html === '') return [];
    $doc = new DOMDocument();
    $prior = libxml_use_internal_errors(true);
    $loaded = $doc->loadHTML('<?xml encoding="UTF-8"?>' . $html,
        LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING);
    libxml_clear_errors();
    libxml_use_internal_errors($prior);
    if (!$loaded) return [];
    $xp = new DOMXPath($doc);
    $out = [];
    // Only editorial article cards. Never interpret unrelated footer links as songs.
    foreach ($xp->query('//article') as $article) {
        $link = $xp->query('.//h2//a[@href] | .//h3//a[@href] | .//h4//a[@href]', $article)->item(0);
        if (!$link) continue;
        [$artist, $title] = dagCatalogSplitTitle((string)$link->textContent);
        $href = trim((string)$link->getAttribute('href'));
        $timeNode = $xp->query('.//time', $article)->item(0);
        $date = $timeNode ? substr((string)$timeNode->getAttribute('datetime'), 0, 10) : '';
        if (!dagCatalogValidDate($date)) {
            $plain = preg_replace('/\s+/u', ' ', (string)$article->textContent);
            if (preg_match('/\b(\d{2})\.(\d{2})\.(2026)\b/u', $plain, $m))
                $date = $m[3] . '-' . $m[2] . '-' . $m[1];
        }
        $item = dagCatalogRelease($title, $artist, $href, 'kavkaz_music', '', $date);
        if ($item !== null) $out[] = $item;
    }
    return $out;
}

function dagCatalogFromProvider(string $category): array {
    if ($category === 'caucasus') {
        $xml = dagCatalogFetch('https://kavkazmusic.tv/category/trackcards/feed/');
        $items = dagCatalogKavkazRSS($xml);
        if ($items) return $items;
        return dagCatalogKavkazHTML(
            dagCatalogFetch('https://kavkazmusic.tv/category/trackcards/'));
    }
    // MusicBrainz release search has a documented 1 req/s IP limit.
    // One long-lived cache entry per region prevents bursts during user search.
    $query = 'country:RU AND lang:rus AND primarytype:single AND date:[2026-01-01 TO '.gmdate('Y-m-d').']';
    $url = 'https://musicbrainz.org/ws/2/release/?' . http_build_query([
        'query' => $query, 'fmt' => 'json', 'limit' => 50
    ], '', '&', PHP_QUERY_RFC3986);
    $json = json_decode(dagCatalogFetch($url), true);
    return is_array($json) ? dagCatalogMusicBrainz($json) : [];
}

function dagCatalog2026(string $category): array {
    if (!in_array($category,['russian','caucasus'],true)) return [];
    $key = 'dagmusic-2026-' . $category . '.json';
    $cache = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $key;
    $maxAge = 4 * 3600;
    $cached = null;
    if (is_file($cache)) {
        $data = @file_get_contents($cache);
        if (is_string($data) && strlen($data) < 90000) {
            $decoded = json_decode($data,true);
            if (is_array($decoded) && is_array($decoded['items'] ?? null))
                $cached = $decoded;
        }
    }
    if ($cached && time() - (int)($cached['at'] ?? 0) < $maxAge)
        return $cached['items'];
    $lockPath = $cache . '.lock';
    $lock = @fopen($lockPath, 'c');
    if ($lock && !flock($lock, LOCK_EX | LOCK_NB)) {
        fclose($lock);
        return $cached['items'] ?? [];
    }
    try {
        // Negative result cache also protects upstream services from outages.
        // Never query MusicBrainz more than once a second from this worker.
        $ratePath = dirname($cache) . '/dagmusic-mb-last-request';
        if ($category === 'russian' && is_file($ratePath) &&
            time() - (int)@file_get_contents($ratePath) < 2) {
            return $cached['items'] ?? [];
        }
        if ($category === 'russian') @file_put_contents($ratePath, (string)time(), LOCK_EX);
        $items = dagCatalogFromProvider($category);
        $unique = [];
        foreach ($items as $item) {
            $id = mb_strtolower($item['artist'].'|'.$item['title'],'UTF-8');
            if (!isset($unique[$id])) $unique[$id] = $item;
        }
        $items = array_slice(array_values($unique),0,40);
        usort($items,static function($a,$b) {
            return strcmp(($b['release_date'] ?: $b['published_date']),
                ($a['release_date'] ?: $a['published_date']));
        });
        $encoded = json_encode(['at'=>time(),'items'=>$items], JSON_UNESCAPED_UNICODE);
        if (is_string($encoded)) @file_put_contents($cache,$encoded,LOCK_EX);
        return $items ?: ($cached['items'] ?? []);
    } finally {
        if ($lock) { flock($lock,LOCK_UN);fclose($lock); }
    }
}

if (!defined('DAG_CATALOG_LIBRARY_ONLY')) {
    $category = (string)($data['category'] ?? '');
    if (!in_array($category,['russian','caucasus'],true)) {
        http_response_code(400);
        echo json_encode(['error'=>'Unknown discovery category']);
        return;
    }
    $items = dagCatalog2026($category);
    header('Cache-Control: public, max-age=180');
    echo json_encode([
        'success'=>true,'data'=>$items,'category'=>$category,
        'year'=>2026,'playable_count'=>0,
        'source_status'=>count($items)?'metadata_available':'provider_unavailable',
        'note'=>'Catalog metadata only. A matching authorized full audio stream is required for playback.'
    ],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
}
