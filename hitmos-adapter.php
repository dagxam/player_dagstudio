<?php
declare(strict_types=1);

/**
 * DAGSTUDIO PLAYER — conservative adapter for ru.hitmos.site.
 * It does not bypass HTTP 403, does not use browser impersonation, and
 * accepts only explicit HTTPS audio URLs from approved hosts.
 * A discovered audio URL is NOT proof of a playable/licensed stream.
 */
require_once __DIR__ . '/hitmos-config.php';

function dagHitmosSearchUrl(string $query, int $page = 1): string {
    $query = trim(preg_replace('/\s+/u', ' ', $query) ?? '');
    $page = max(1, min(3, $page));
    return 'https://ru.hitmos.site/search?q=' . rawurlencode($query) . '&page=' . $page;
}

function dagHitmosAudioUrl(string $candidate): string {
    $candidate = trim(html_entity_decode($candidate, ENT_QUOTES | ENT_HTML5, 'UTF-8'));
    if ($candidate === '' || str_starts_with($candidate, '//')) return '';
    if (str_starts_with($candidate, '/')) {
        $candidate = 'https://ru.hitmos.site' . $candidate;
    }
    $parts = parse_url($candidate);
    if (!is_array($parts) || strtolower($parts['scheme'] ?? '') !== 'https' ||
        !empty($parts['user']) || !empty($parts['pass']) || isset($parts['port']) ||
        !empty($parts['fragment'])) return '';

    $host = strtolower((string)($parts['host'] ?? ''));
    $allowed = array_merge(['ru.hitmos.site'], dagHitmosAudioHosts());
    if (!in_array($host, $allowed, true)) return '';
    $path = (string)($parts['path'] ?? '');
    if (!preg_match('/\.(?:mp3|m4a|aac|ogg|opus|wav)$/iD', $path)) return '';
    return $candidate;
}

function dagHitmosParseHtml(string $html, string $query): array {
    if ($html === '' || strlen($html) > 1200000 || !class_exists('DOMDocument')) return [];
    $previous = libxml_use_internal_errors(true);
    try {
        $dom = new DOMDocument();
        if (!@$dom->loadHTML('<?xml encoding="utf-8" ?>' . $html, LIBXML_NONET | LIBXML_NOWARNING | LIBXML_NOERROR)) {
            return [];
        }
        $xpath = new DOMXPath($dom);
        // Only recognizable track elements are considered. An arbitrary link
        // on a homepage, blocked page or captcha is never returned as music.
        $nodes = $xpath->query("//li[contains(concat(' ', normalize-space(@class), ' '), ' tracks__item ')] | //*[@data-hitmos-track]");
        $results = [];
        $seen = [];
        $words = preg_split('/\s+/u', mb_strtolower(trim($query), 'UTF-8'), -1, PREG_SPLIT_NO_EMPTY) ?: [];
        foreach ($nodes ?: [] as $node) {
            $titleNode = $xpath->query(".//*[contains(concat(' ', normalize-space(@class), ' '), ' track__title ')] | .//*[@data-title]", $node)->item(0);
            $artistNode = $xpath->query(".//*[contains(concat(' ', normalize-space(@class), ' '), ' track__desc ')] | .//*[@data-artist]", $node)->item(0);
            $linkNode = $xpath->query(".//a[contains(concat(' ', normalize-space(@class), ' '), ' track__download-btn ')] | .//*[@data-url]", $node)->item(0);
            if (!$titleNode || !$linkNode) continue;
            $title = trim(preg_replace('/\s+/u', ' ', $titleNode->getAttribute('data-title') ?: $titleNode->textContent) ?? '');
            $artist = $artistNode ? trim(preg_replace('/\s+/u', ' ', $artistNode->getAttribute('data-artist') ?: $artistNode->textContent) ?? '') : '';
            $candidate = $linkNode->getAttribute('data-url') ?: $linkNode->getAttribute('href');
            $url = dagHitmosAudioUrl($candidate);
            if ($title === '' || $url === '' || mb_strlen($title) > 180) continue;
            $haystack = mb_strtolower($title . ' ' . $artist, 'UTF-8');
            $matches = true;
            foreach ($words as $word) {
                if (mb_strpos($haystack, $word) === false) { $matches = false; break; }
            }
            if (!$matches || isset($seen[$url])) continue;
            $seen[$url] = true;
            $results[] = [
                'title' => $title,
                'artist' => $artist !== '' ? mb_substr($artist, 0, 160) : 'Неизвестен',
                'url' => $url,
                'type' => 'audio',
                'thumb' => 'images/cover.png',
                'source' => '[HITMOS]'
            ];
            if (count($results) >= 25) break;
        }
        return $results;
    } finally {
        libxml_clear_errors();
        libxml_use_internal_errors($previous);
    }
}

function dagHitmosSearch(string $query, int $page = 1): array {
    $query = trim(preg_replace('/\s+/u', ' ', strip_tags($query)) ?? '');
    if (mb_strlen($query, 'UTF-8') < 2 || mb_strlen($query, 'UTF-8') > 80 || $page < 1 || $page > 3) {
        return [
            'success' => false, 'provider' => 'Hitmos.site', 'status' => 'invalid_query',
            'upstream_http' => 0, 'count' => 0, 'audio_verified' => false, 'data' => []
        ];
    }
    $http = 0;
    $body = '';
    $curlError = '';
    $contentType = '';
    if (!function_exists('curl_init')) {
        $curlError = 'curl_not_installed';
    } else {
        $ch = curl_init(dagHitmosSearchUrl($query, $page));
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => false,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_CONNECTTIMEOUT => 3,
            CURLOPT_TIMEOUT => 9,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_HTTPHEADER => ['Accept: text/html,application/xhtml+xml', 'Accept-Language: ru-RU,ru;q=0.9'],
            CURLOPT_USERAGENT => 'DAGSTUDIO-PLAYER-Hitmos-Adapter/1.0',
            CURLOPT_WRITEFUNCTION => static function ($ch, string $chunk) use (&$body): int {
                if (strlen($body) + strlen($chunk) > 1200000) return 0;
                $body .= $chunk;
                return strlen($chunk);
            }
        ]);
        $ok = curl_exec($ch);
        $http = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $contentType = strtolower((string)curl_getinfo($ch, CURLINFO_CONTENT_TYPE));
        if ($ok === false) $curlError = 'transport_error';
        curl_close($ch);
    }
    $data = ($http === 200 && $curlError === '' && str_contains($contentType, 'html'))
        ? dagHitmosParseHtml($body, $query) : [];
    if ($http === 403 || $http === 401 || $http === 429) $status = 'blocked';
    elseif ($curlError !== '' || $http === 0) $status = 'unreachable';
    elseif ($http >= 300 && $http < 400) $status = 'redirect_unsupported';
    elseif ($http !== 200) $status = 'upstream_error';
    elseif (empty($data)) $status = 'no_playable_tracks';
    else $status = 'candidates_found';
    return [
        'success' => $status === 'candidates_found',
        'provider' => 'Hitmos.site',
        'status' => $status,
        'upstream_http' => $http,
        'count' => count($data),
        // No audio is declared working before an independent stream/Range check.
        'audio_verified' => false,
        'data' => $data
    ];
}
