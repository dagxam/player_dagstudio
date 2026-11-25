<?php
declare(strict_types=1);
// Own read-only Hitmos search API. No external URL, tokens or audio data accepted.
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
$origins = [
    'https://pl.dagstudio.ru', 'https://localhost',
    'capacitor://localhost', 'ionic://localhost', 'http://localhost'
];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $origins, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
}
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'OPTIONS') { http_response_code(204); exit; }
if (!in_array($method, ['GET', 'POST'], true)) {
    header('Allow: GET, POST, OPTIONS');
    http_response_code(405);
    echo json_encode(['success' => false, 'status' => 'method_not_allowed']);
    exit;
}
$payload = [];
if ($method === 'POST') {
    $raw = file_get_contents('php://input', false, null, 0, 4096);
    $payload = json_decode((string)$raw, true);
    if (!is_array($payload)) $payload = $_POST;
}
$query = $method === 'GET'
    ? ($_GET['q'] ?? '')
    : ($payload['q'] ?? '');
$page = $method === 'GET'
    ? ($_GET['page'] ?? 1)
    : ($payload['page'] ?? 1);
if (!is_string($query) || !is_scalar($page) || !preg_match('/^[1-3]$/', (string)$page) ||
    mb_strlen(trim($query), 'UTF-8') < 2 || mb_strlen($query, 'UTF-8') > 80) {
    http_response_code(422);
    echo json_encode(['success' => false, 'status' => 'invalid_query', 'data' => []],
        JSON_UNESCAPED_UNICODE);
    exit;
}
require_once __DIR__ . '/hitmos-adapter.php';
echo json_encode(dagHitmosSearch($query, (int)$page),
    JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
