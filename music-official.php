<?php
// First-party public Audius feed. No credentials and no HTML scraping.
$mode = (string)($data['mode'] ?? 'latest');
if (!in_array($mode, ['latest', 'trending'], true)) {
    echo json_encode(['success'=>false,'error'=>'Неизвестный режим каталога']); return;
}
$page = max(1, min(15, (int)($data['page'] ?? 1)));
$limit = 24;
$path = $mode === 'latest' ? '/v1/tracks/latest' : '/v1/tracks/trending';
$params = http_build_query(['limit'=>$limit,'offset'=>($page-1)*$limit], '', '&', PHP_QUERY_RFC3986);
$hosts = ['api.audius.co', 'discoveryprovider.audius.co'];
$tracks = [];
$usedHost = '';
foreach ($hosts as $host) {
    $ch = curl_init('https://' . $host . $path . '?' . $params);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_SSL_VERIFYPEER => true, CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_CONNECTTIMEOUT => 4, CURLOPT_TIMEOUT => 8,
        CURLOPT_ENCODING => '', CURLOPT_IPRESOLVE => CURL_IPRESOLVE_WHATEVER,
        CURLOPT_HTTPHEADER => ['Accept: application/json']
    ]);
    $body = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($status !== 200 || !is_string($body) || strlen($body)>2500000) continue;
    $json = json_decode($body,true);
    if (!is_array($json['data'] ?? null) || !count($json['data'])) continue;
    $tracks = $json['data'];
    $usedHost = $host;
    break;
}
$items = [];
if ($usedHost !== '') {
    foreach ($tracks as $t) {
        if (!is_array($t) || !is_scalar($t['id'] ?? null)) continue;
        if (!empty($t['is_stream_gated']) || !empty($t['is_scheduled_release'])) continue;
        $id = (string)$t['id'];
        if (!preg_match('/^[A-Za-z0-9_-]{3,160}$/',$id)) continue;
        $name = trim((string)($t['title'] ?? ''));
        if (!$name) continue;
        $thumb = 'images/cover.png';
        foreach (['480x480','150x150','1000x1000'] as $size) {
            if (!empty($t['artwork'][$size]) && is_string($t['artwork'][$size])) {
                $thumb = $t['artwork'][$size];
                break;
            }
        }
        $items[]=[
            'title'=>$name,
            'artist'=>trim((string)($t['user']['name'] ?? 'Неизвестен')),
            'url'=>'https://'.$usedHost.'/v1/tracks/'.rawurlencode($id).'/stream',
            'type'=>'audio','thumb'=>$thumb,'source'=>'[AUDIUS]',
            'release_date'=>is_string($t['release_date'] ?? null) ? $t['release_date'] : '',
            'genre'=>trim((string)($t['genre'] ?? '')),
            'play_count'=>max(0,(int)($t['play_count'] ?? 0))
        ];
    }
}
echo json_encode([
    'success' => $usedHost!=='',
    'data' => $items,'mode'=>$mode,'page'=>$page,
    'provider' => $usedHost ? 'audius' : 'unavailable',
    'error' => $usedHost ? null : 'Официальный API Audius временно недоступен.'
],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
