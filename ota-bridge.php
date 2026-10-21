<?php
// DAGSTUDIO PLAYER: read-only OTA metadata for Android's Chromium WebView.
// The versioned ZIP remains on the primary HTTPS host; this endpoint makes
// metadata readable from the app origin (https://localhost) with strict CORS.
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowed = ['https://localhost', 'capacitor://localhost', 'ionic://localhost',
    'https://pl.dagstudio.ru', 'http://localhost'];
if (in_array($origin, $allowed, true)) {
    header('Access-Control-Allow-Origin: '.$origin);
    header('Vary: Origin');
}
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Accept, Content-Type, Cache-Control');
header('Cache-Control: no-store, max-age=0');
header('X-Content-Type-Options: nosniff');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    header('Allow: GET, OPTIONS');
    http_response_code(405);
    exit;
}
header('Content-Type: application/json; charset=utf-8');
$path = __DIR__ . '/ota/DAGSTUDIO-PLAYER-web-version.json';
if (!is_file($path) || !is_readable($path)) {
    http_response_code(503);
    echo json_encode(['error'=>'Манифест OTA пока не опубликован']);
    exit;
}
$data = json_decode((string) file_get_contents($path), true);
if (!is_array($data)
    || !preg_match('/^\d+\.\d+\.\d+$/', (string) ($data['version'] ?? ''))
    || !preg_match('/^[a-f0-9]{64}$/i', (string) ($data['checksum'] ?? ''))
    || !preg_match('~^https://pl\.dagstudio\.ru/ota/DAGSTUDIO-PLAYER-web-\d+\.\d+\.\d+\.zip$~',
        (string) ($data['url'] ?? ''))) {
    http_response_code(503);
    echo json_encode(['error'=>'Некорректный манифест OTA']);
    exit;
}
echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
