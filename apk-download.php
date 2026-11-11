<?php
declare(strict_types=1);
// Fixed, first-party APK file. No user-controlled paths or remote redirects.
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET' &&
    ($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'HEAD') {
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
header('Content-Type: application/vnd.android.package-archive');
header('Content-Disposition: attachment; filename="DAGSTUDIO-PLAYER-Preview.apk"');
header('Content-Length: ' . $size);
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'HEAD') exit;
$stream = fopen($file, 'rb');
if ($stream === false) {
    http_response_code(503);
    exit;
}
while (!feof($stream) && !connection_aborted()) {
    $chunk = fread($stream, 65536);
    if ($chunk === false || $chunk === '') break;
    echo $chunk;
    flush();
}
fclose($stream);
