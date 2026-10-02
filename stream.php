<?php
// stream.php - V2 (Fix 502 Bad Gateway & Added Range Support)

$url = $_GET['url'] ?? '';

if (empty($url) || filter_var($url, FILTER_VALIDATE_URL) === false) {
    header("HTTP/1.1 400 Bad Request");
    exit;
}

// Обязательно закрываем сессию, чтобы другие запросы не зависали в ожидании
session_write_close(); 

// Заголовки для аудиопотока
header('Content-Type: audio/mp4'); // Apple Music отдает m4a, но браузеры отлично играют и mp3 с этим заголовком
header('Accept-Ranges: bytes');
header('Cache-Control: no-cache');
// Заголовок Transfer-Encoding удален, так как он вызывал ошибку 502

$ch = curl_init($url);

// Поддержка перемотки трека (передаем заголовок Range от браузера к источнику)
if (isset($_SERVER['HTTP_RANGE'])) {
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Range: ' . $_SERVER['HTTP_RANGE']]);
    http_response_code(206); // Устанавливаем статус "Частичное содержимое"
}

curl_setopt($ch, CURLOPT_RETURNTRANSFER, false); // Поток льется напрямую пользователю
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

curl_exec($ch);
curl_close($ch);
?>