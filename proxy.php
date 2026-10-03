<?php
// Универсальный потоковый прокси DAGSTUDIO PLAYER.
// Цель: одинаково устойчиво обслуживать все музыкальные источники на Android,
// включая слабый мобильный интернет и старые WebView.

$url = trim($_GET['url'] ?? '');
$source = strtolower(trim($_GET['source'] ?? ''));
$forceNoRange = (string)($_GET['norange'] ?? '') === '1';
$weakMode = (string)($_GET['weak'] ?? '') === '1';
if ($url === '' || !filter_var($url, FILTER_VALIDATE_URL)) {
    http_response_code(400);
    exit;
}

session_write_close();
@set_time_limit(0);
@ini_set('zlib.output_compression', '0');
if (function_exists('apache_setenv')) @apache_setenv('no-gzip', '1');
header('X-Accel-Buffering: no');
$parts  = parse_url($url);
$scheme = strtolower($parts['scheme'] ?? '');
$host   = strtolower($parts['host'] ?? '');
if (!in_array($scheme, ['http', 'https'], true) || $host === '') {
    http_response_code(400);
    exit;
}

$allowed = [
    'slider.kz', 'ru.hitmoz.org', 'hitmoz.org', 'muzofond.fm', 'zvooq.net',
    'muzvox.org', 'storage.muzvox.org', 'static.muzvox.org', 'muzca.net'
];
$isAllowed = false;
foreach ($allowed as $domain) {
    if ($host === $domain || str_ends_with($host, '.' . $domain)) {
        $isAllowed = true;
        break;
    }
}
if (!$isAllowed) {
    http_response_code(403);
    exit;
}

if (filter_var($host, FILTER_VALIDATE_IP) &&
    !filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
    http_response_code(403);
    exit;
}

$range = trim($_SERVER['HTTP_RANGE'] ?? '');
$forwardRange = '';
if (!$forceNoRange && $range !== '') {
    // Поддерживаем только один byte-range — именно его использует HTML5 audio.
    if (!preg_match('/^bytes=(\d+)-(\d*)$/', $range, $m)) {
        http_response_code(416);
        header('Content-Range: bytes */*');
        exit;
    }
    $forwardRange = 'bytes=' . $m[1] . '-' . $m[2];
}

// Профиль источника: корректный Referer/Origin вместо отправки чужого Origin.
$profiles = [
    'slider.kz'       => ['referer' => 'https://slider.kz/',       'origin' => 'https://slider.kz'],
    'ru.hitmoz.org'   => ['referer' => 'https://ru.hitmoz.org/',   'origin' => 'https://ru.hitmoz.org'],
    'hitmoz.org'      => ['referer' => 'https://hitmoz.org/',      'origin' => 'https://hitmoz.org'],
    'muzofond.fm'     => ['referer' => 'https://muzofond.fm/',     'origin' => 'https://muzofond.fm'],
    'zvooq.net'       => ['referer' => 'https://zvooq.net/',       'origin' => 'https://zvooq.net'],
    'muzvox.org'      => ['referer' => 'https://muzvox.org/',      'origin' => 'https://muzvox.org'],
    'storage.muzvox.org' => ['referer' => 'https://muzvox.org/',   'origin' => 'https://muzvox.org'],
    'static.muzvox.org'  => ['referer' => 'https://muzvox.org/',   'origin' => 'https://muzvox.org'],
    'muzca.net'       => ['referer' => 'https://muzca.net/',       'origin' => 'https://muzca.net'],
];

$profile = $profiles[$host] ?? ['referer' => $scheme . '://' . $host . '/', 'origin' => $scheme . '://' . $host];
$isMuzVox = ($source === 'muzvox' || str_ends_with($host, '.muzvox.org') || $host === 'muzvox.org');

function buildAudioHeaders(bool $useRange, string $range, array $profile): array {
    $headers = [
        'Accept: audio/mpeg,audio/mp4,audio/aac,audio/ogg,audio/*;q=0.9,*/*;q=0.1',
        'Accept-Encoding: identity',
        'Accept-Language: ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        'Referer: ' . $profile['referer'],
        'User-Agent: Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36',
    ];

    // Origin нужен только там, где источник обычно ожидает его.
    if (!empty($profile['origin'])) {
        $headers[] = 'Origin: ' . $profile['origin'];
    }
    if ($useRange && $range !== '') {
        $headers[] = 'Range: ' . $range;
    }
    return $headers;
}

$responseHeaders = [];
$currentStatus = 200;
$headersSent = false;
$bodyStarted = false;
$attemptError = false;

$sendHeaders = static function() use (&$responseHeaders, &$currentStatus, &$headersSent) {
    if ($headersSent) return true;

    $status = (int)$currentStatus;
    if ($status < 200 || $status > 599) $status = 200;

    $contentType = '';
    foreach ($responseHeaders as $name => $value) {
        if (strtolower($name) === 'content-type') {
            $contentType = strtolower(trim(explode(';', $value)[0]));
            break;
        }
    }

    // Не превращаем HTML-страницу ошибки/антибота в "MP3".
    $validType = ($contentType === '' || str_starts_with($contentType, 'audio/') ||
        in_array($contentType, ['application/octet-stream', 'application/mp3', 'binary/octet-stream'], true));

    if ($status >= 400 || !$validType) {
        return false;
    }

    http_response_code($status);

    $allowedResponse = [
        'content-type', 'content-length', 'content-range', 'accept-ranges',
        'etag', 'last-modified', 'expires', 'cache-control'
    ];
    foreach ($responseHeaders as $name => $value) {
        if (in_array(strtolower($name), $allowedResponse, true)) {
            header($name . ': ' . $value);
        }
    }

    if (!array_key_exists('accept-ranges', array_change_key_case($responseHeaders, CASE_LOWER))) {
        header('Accept-Ranges: bytes');
    }
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: no-store');
    header('X-DAG-Stream: 1');
    if (isset($_GET['weak']) && (string)$_GET['weak'] === '1') {
        header('X-DAG-Network-Mode: weak');
    }
    $headersSent = true;
    return true;
};

$runAttempt = function(bool $useRange) use (
    $url, $forwardRange, $profile, $weakMode, &$responseHeaders, &$currentStatus,
    &$headersSent, &$bodyStarted, &$attemptError, $sendHeaders
) {
    $responseHeaders = [];
    $currentStatus = 200;
    $headersSent = false;
    $bodyStarted = false;
    $attemptError = false;

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => false,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 5,
        // На слабой мобильной сети даём DNS/TCP/TLS и паузам радиосети больше времени.
        CURLOPT_CONNECTTIMEOUT => $weakMode ? 15 : 8,
        CURLOPT_TIMEOUT => 0,
        CURLOPT_LOW_SPEED_LIMIT => $weakMode ? 32 : 128,
        CURLOPT_LOW_SPEED_TIME => $weakMode ? 45 : 20,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
        CURLOPT_IPRESOLVE => CURL_IPRESOLVE_V4,
        CURLOPT_TCP_KEEPALIVE => 1,
        CURLOPT_TCP_KEEPIDLE => $weakMode ? 10 : 20,
        CURLOPT_TCP_KEEPINTVL => $weakMode ? 5 : 10,
        CURLOPT_DNS_CACHE_TIMEOUT => 300,
        CURLOPT_NOSIGNAL => 1,
        CURLOPT_BUFFERSIZE => $weakMode ? 8192 : 16384,
        CURLOPT_HTTPHEADER => buildAudioHeaders($useRange, $forwardRange, $profile),
        CURLOPT_HEADERFUNCTION => function($ch, $line) use (&$responseHeaders, &$currentStatus) {
            $trim = trim($line);
            if ($trim === '') return strlen($line);

            if (preg_match('/^HTTP\/\S+\s+(\d+)/i', $trim, $m)) {
                $currentStatus = (int)$m[1];
                // Каждый новый HTTP-ответ после redirect начинается заново.
                $responseHeaders = [];
                return strlen($line);
            }

            if (strpos($line, ':') !== false) {
                [$name, $value] = explode(':', $line, 2);
                $name = trim($name);
                $value = trim($value);
                if ($name !== '') $responseHeaders[$name] = $value;
            }
            return strlen($line);
        },
        CURLOPT_WRITEFUNCTION => function($ch, $data) use (&$bodyStarted, &$attemptError, $sendHeaders) {
            if (!$bodyStarted) {
                if (!$sendHeaders()) {
                    $attemptError = true;
                    // Важно: если заголовки ещё не ушли клиенту, можно сделать
                    // второй запрос без Range.
                    return 0;
                }
                $bodyStarted = true;
            }

            echo $data;
            if (function_exists('ob_flush')) @ob_flush();
            flush();
            return strlen($data);
        },
    ]);

    $result = curl_exec($ch);
    $errno = curl_errno($ch);
    $httpCode = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $contentType = (string)curl_getinfo($ch, CURLINFO_CONTENT_TYPE);

    if ($contentType && !isset($responseHeaders['Content-Type'])) {
        $responseHeaders['Content-Type'] = explode(';', $contentType)[0];
    }
    if (!$headersSent && $httpCode > 0) {
        $currentStatus = $httpCode;
    }
    if (!$headersSent && !$attemptError) {
        $sendHeaders();
    }

    curl_close($ch);

    if ($attemptError || $errno || $httpCode >= 400) return false;
    return $headersSent;
};

// Сначала используем Range — это правильный режим для HTML5 audio и перемотки.
// Если источник не умеет Range или возвращает 416/неаудио, повторяем БЕЗ Range.
$ok = $runAttempt(!$forceNoRange && $forwardRange !== '');
if (!$ok && !$forceNoRange && $forwardRange !== '' && !headers_sent()) {
    $ok = $runAttempt(false);
}

if (!$ok && !headers_sent()) {
    http_response_code(502);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Audio source unavailable';
}
exit;
?>
