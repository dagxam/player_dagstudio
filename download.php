<?php
// download.php - Жесткое принудительное скачивание

if (!isset($_GET['url']) || !isset($_GET['title'])) {
    die('Отсутствуют параметры');
}

$url = $_GET['url'];
$title = $_GET['title'];

if (filter_var($url, FILTER_VALIDATE_URL) === false) {
    die('Неверный URL');
}

// Очищаем имя файла (только безопасные символы)
$filename = preg_replace('/[^a-zA-Z0-9а-яА-ЯёЁ\s\-\_\.]/u', '', $title) . '.mp3';

// Отключаем буферизацию вывода (чтобы файл скачивался сразу, а не копился в памяти сервера)
if (ob_get_level()) {
    ob_end_clean();
}

// ЖЕСТКИЕ ЗАГОЛОВКИ ДЛЯ СКАЧИВАНИЯ
header('Content-Description: File Transfer');
header('Content-Type: application/octet-stream'); // Заставляет браузер качать, а не играть!
header('Content-Disposition: attachment; filename="' . $filename . '"');
header('Content-Transfer-Encoding: binary');
header('Expires: 0');
header('Cache-Control: must-revalidate, post-check=0, pre-check=0');
header('Pragma: public');

session_write_close();

if (extension_loaded('curl')) {
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, false);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');
    curl_exec($ch);
    curl_close($ch);
} else {
    readfile($url);
}
exit;
?>