<?php
declare(strict_types=1);
// First-party, fixed-path signed APK download: no user-controlled file names.
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method !== 'GET' && $method !== 'HEAD') {
    header('Allow: GET, HEAD');
    http_response_code(405);
    exit;
}
$file = __DIR__ . '/apk/DAGSTUDIO-PLAYER-Preview.apk';
if (!is_file($file) || !is_readable($file)) {
    http_response_code(503);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'APK temporarily unavailable';
    exit;
}
$size = filesize($file);
if ($size === false || $size <= 0) {
    http_response_code(503);
    exit;
}
$start = 0;
$end = $size - 1;
$range = trim((string) ($_SERVER['HTTP_RANGE'] ?? ''));
if ($range !== '') {
    // A single byte range allows Android browsers to resume interrupted
    // downloads over a weak car-mobile connection without re-fetching 14 MB.
    if (!preg_match('/^bytes=(\\d*)-(\\d*)$/D', $range, $parts) ||
        ($parts[1] === '' && $parts[2] === '')) {
        header('Content-Range: bytes */' . $size);
        http_response_code(416);
        exit;
    }
    if ($parts[1] === '') {
        $suffix = (int) $parts[2];
        if ($suffix <= 0) {
            header('Content-Range: bytes */' . $size);
            http_response_code(416);
            exit;
        }
        $start = max(0, $size - $suffix);
    } else {
        $start = (int) $parts[1];
        if ($parts[2] !== '') $end = min($end, (int) $parts[2]);
    }
    if ($start >= $size || $start > $end) {
        header('Content-Range: bytes */' . $size);
        http_response_code(416);
        exit;
    }
}
$handle = fopen($file, 'rb');
if ($handle === false) {
    http_response_code(503);
    exit;
}
if ($start !== 0 && fseek($handle, $start) !== 0) {
    fclose($handle);
    http_response_code(503);
    exit;
}
if ($range !== '') {
    http_response_code(206);
    header('Content-Range: bytes ' . $start . '-' . $end . '/' . $size);
}
header('Content-Type: application/vnd.android.package-archive');
header('Content-Disposition: attachment; filename="DAGSTUDIO-PLAYER-Preview.apk"');
header('Accept-Ranges: bytes');
header('Content-Length: ' . ($end - $start + 1));
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
if ($method === 'HEAD') {
    fclose($handle);
    exit;
}
$remaining = $end - $start + 1;
while ($remaining > 0 && !feof($handle) && !connection_aborted()) {
    $chunk = fread($handle, min(65536, $remaining));
    if ($chunk === false || $chunk === '') break;
    echo $chunk;
    $remaining -= strlen($chunk);
    flush();
}
fclose($handle);
