<?php
// api.php - V2100 (Slider.kz restored, 4 sources, Robust Deduplication)

ini_set('display_errors', 0); 
ini_set('log_errors', 1);
error_reporting(E_ALL);

if (!class_exists('DOMDocument')) {
    die(json_encode(['error' => 'ОШИБКА ХОСТИНГА: Модуль DOM/libxml не установлен!']));
}

// --- 1. БЕЗОПАСНОСТЬ CORS ---
$allowed_origins = [
    'https://dagstudio.ru',
    'https://player.dagstudio.ru',
    'http://localhost',
    'http://127.0.0.1'
];

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';

if (in_array($origin, $allowed_origins)) {
    header("Access-Control-Allow-Origin: $origin");
    header("Access-Control-Allow-Credentials: true");
}

header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

header('Content-Type: application/json');

// --- 2. НАСТРОЙКА СЕССИИ ---
$lifetime = 2592000;
ini_set('session.gc_maxlifetime', $lifetime);

$sess_dir = __DIR__ . '/sessions';
if (!is_dir($sess_dir)) {
    @mkdir($sess_dir, 0777, true);
}
session_save_path($sess_dir);

$is_secure = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') 
             || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https');

session_set_cookie_params([
    'lifetime' => $lifetime,
    'path' => '/',
    'secure' => $is_secure,
    'httponly' => true,
    'samesite' => 'Lax'
]);

// Важно для скорости! Снимаем блокировку сессии, чтобы параллельные запросы не висли
session_start();
session_write_close();

if (!file_exists('db.php')) {
    echo json_encode(['error' => 'Системная ошибка: конфигурация недоступна']);
    exit;
}
require 'db.php';

// --- 3. ЧТЕНИЕ ДАННЫХ ---
$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (!$data) {
    $action = $_POST['action'] ?? '';
    $data = $_POST; 
} else {
    $action = $data['action'] ?? '';
}

// Открываем сессию обратно только для действий, где она нужна
if (in_array($action, ['login', 'logout', 'check_auth', 'get_data', 'create_playlist', 'rename_playlist', 'delete_playlist', 'add_track', 'delete_track', 'update_theme', 'upload_track', 'register'])) {
    @session_start();
}

// --- ЛОГИКА АВТОРИЗАЦИИ И БАЗЫ ДАННЫХ ---
if ($action === 'register') {
    $name = trim(preg_replace('/\s+/', ' ', strip_tags($data['name'] ?? '')));
    $pass = trim($data['pass'] ?? '');
    
    if (mb_strlen($name) < 3) { echo json_encode(['error' => 'Имя должно быть не менее 3 символов']); exit; }
    if (mb_strlen($pass) < 4) { echo json_encode(['error' => 'Пароль должен быть не менее 4 символов']); exit; }
    
    $passHash = password_hash($pass, PASSWORD_DEFAULT);
    try {
        $stmt = $pdo->prepare("SELECT id FROM users WHERE LOWER(username) = LOWER(?)");
        $stmt->execute([$name]);
        if ($stmt->fetch()) { echo json_encode(['error' => 'Это имя уже занято']); exit; }
        
        $stmt = $pdo->prepare("INSERT INTO users (username, password, theme) VALUES (?, ?, 'brown')");
        if ($stmt->execute([$name, $passHash])) {
            $userId = (int)$pdo->lastInsertId();
            session_regenerate_id(true);
            $_SESSION['user_id'] = $userId;
            $_SESSION['username'] = $name;
            echo json_encode([
                'success' => true,
                'username' => $name,
                'theme' => 'brown'
            ]);
        } else {
            echo json_encode(['error' => 'Ошибка базы данных. Попробуйте позже.']);
        }
    } catch (Exception $e) { echo json_encode(['error' => 'Внутренняя ошибка сервера.']); }
}
elseif ($action === 'login') {
    $name = trim($data['name'] ?? '');
    $pass = $data['pass'] ?? '';
    try {
        $stmt = $pdo->prepare("SELECT * FROM users WHERE LOWER(username) = LOWER(?)");
        $stmt->execute([$name]);
        $user = $stmt->fetch();
        if ($user && password_verify($pass, $user['password'])) {
            session_regenerate_id(true);
            $_SESSION['user_id'] = $user['id'];
            $_SESSION['username'] = $user['username'];
            echo json_encode(['success' => true, 'username' => $user['username'], 'theme' => $user['theme'] ?? 'brown']);
        } else { echo json_encode(['error' => 'Неверный логин или пароль']); }
    } catch (Exception $e) { echo json_encode(['error' => 'Произошла внутренняя ошибка сервера.']); }
}
elseif ($action === 'logout') { session_destroy(); echo json_encode(['success' => true]); }
elseif ($action === 'check_auth') {
    if (isset($_SESSION['user_id'])) {
        try {
            $stmt = $pdo->prepare("SELECT theme FROM users WHERE id = ?");
            $stmt->execute([$_SESSION['user_id']]);
            $res = $stmt->fetch();
            echo json_encode(['logged_in' => true, 'username' => $_SESSION['username'], 'theme' => $res ? $res['theme'] : 'brown']);
        } catch (Exception $e) { echo json_encode(['logged_in' => false]); }
    } else { echo json_encode(['logged_in' => false]); }
}
elseif ($action === 'update_theme') {
    if (!isset($_SESSION['user_id'])) exit;
    try {
        $stmt = $pdo->prepare("UPDATE users SET theme = ? WHERE id = ?");
        $stmt->execute([strip_tags($data['theme'] ?? 'brown'), $_SESSION['user_id']]);
        echo json_encode(['success' => true]);
    } catch (Exception $e) { echo json_encode(['error' => 'Ошибка обновления темы.']); }
}
elseif ($action === 'get_data') {
    if (!isset($_SESSION['user_id'])) { echo json_encode(['error' => 'Auth required']); exit; }
    try {
        $stmt = $pdo->prepare("SELECT * FROM playlists WHERE user_id = ?");
        $stmt->execute([$_SESSION['user_id']]);
        $playlists = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $trackStmt = $pdo->prepare("SELECT * FROM tracks WHERE playlist_id = ?");
        foreach ($playlists as &$pl) {
            $trackStmt->execute([$pl['id']]);
            $pl['tracks'] = $trackStmt->fetchAll(PDO::FETCH_ASSOC);
            $pl['source'] = 'db'; 
        }
        echo json_encode($playlists);
    } catch (Exception $e) { echo json_encode(['error' => 'Ошибка получения данных.']); }
}
elseif ($action === 'create_playlist') {
    if (!isset($_SESSION['user_id'])) { echo json_encode(['error' => 'Нет авторизации']); exit; }
    try {
        $type = in_array($data['type'] ?? '', ['standard', 'links']) ? $data['type'] : 'standard';
        $stmt = $pdo->prepare("INSERT INTO playlists (user_id, name, type) VALUES (?, ?, ?)");
        $stmt->execute([$_SESSION['user_id'], strip_tags(trim($data['name'] ?? 'Новый плейлист')), $type]);
        echo json_encode(['success' => true, 'id' => $pdo->lastInsertId()]);
    } catch (Exception $e) { echo json_encode(['error' => 'Ошибка создания плейлиста.']); }
}
elseif ($action === 'rename_playlist') {
    if (!isset($_SESSION['user_id'])) exit;
    try {
        $stmt = $pdo->prepare("UPDATE playlists SET name = ? WHERE id = ? AND user_id = ?");
        $stmt->execute([strip_tags(trim($data['name'] ?? '')), $data['id'], $_SESSION['user_id']]);
        echo json_encode(['success' => true]);
    } catch (Exception $e) { echo json_encode(['error' => 'Ошибка переименования.']); }
}
elseif ($action === 'delete_playlist') {
    if (!isset($_SESSION['user_id'])) exit;
    try {
        $stmt = $pdo->prepare("DELETE FROM playlists WHERE id = ? AND user_id = ?");
        $stmt->execute([$data['id'], $_SESSION['user_id']]);
        echo json_encode(['success' => true]);
    } catch (Exception $e) { echo json_encode(['error' => 'Ошибка удаления.']); }
}
elseif ($action === 'add_track') {
    if (!isset($_SESSION['user_id'])) exit;
    $playlist_id = $data['playlist_id'] ?? null; $t = $data['track'] ?? null;
    if (!$playlist_id || !is_array($t)) { echo json_encode(['error' => 'Некорректные данные']); exit; }
    try {
        $chk = $pdo->prepare("SELECT 1 FROM playlists WHERE id = ? AND user_id = ?");
        $chk->execute([$playlist_id, $_SESSION['user_id']]);
        if (!$chk->fetchColumn()) { echo json_encode(['error' => 'Доступ запрещён']); exit; }

        $stmt = $pdo->prepare("INSERT INTO tracks (playlist_id, title, artist, url, thumb, type) VALUES (?, ?, ?, ?, ?, ?)");
        $stmt->execute([
            $playlist_id, 
            mb_substr(strip_tags($t['title'] ?? ''), 0, 200), 
            mb_substr(strip_tags($t['artist'] ?? ''), 0, 200), 
            mb_substr(strip_tags($t['url'] ?? ''), 0, 2000), 
            mb_substr(strip_tags($t['thumb'] ?? ''), 0, 2000), 
            mb_substr(strip_tags($t['type'] ?? 'audio'), 0, 50)
        ]);
        echo json_encode(['success' => true]);
    } catch (Exception $e) { echo json_encode(['error' => 'Ошибка добавления трека.']); }
}
elseif ($action === 'delete_track') {
    if (!isset($_SESSION['user_id'])) exit;
    try {
        $stmt = $pdo->prepare("DELETE FROM tracks WHERE id = ? AND playlist_id IN (SELECT id FROM playlists WHERE user_id = ?)");
        $stmt->execute([$data['track_id'], $_SESSION['user_id']]);
        echo json_encode($stmt->rowCount() > 0 ? ['success' => true] : ['error' => 'Ошибка удаления: трек не найден.']);
    } catch (Exception $e) { echo json_encode(['error' => 'Системная ошибка удаления.']); }
}
elseif ($action === 'upload_track') {
    if (!isset($_SESSION['user_id'])) { echo json_encode(['error' => 'Auth required']); exit; }
    
    $playlist_id = $_POST['playlist_id'] ?? null;
    
    $chk = $pdo->prepare("SELECT 1 FROM playlists WHERE id = ? AND user_id = ?");
    $chk->execute([$playlist_id, $_SESSION['user_id']]);
    if (!$chk->fetchColumn()) { echo json_encode(['error' => 'Доступ запрещён']); exit; }

    if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
        echo json_encode(['error' => 'Ошибка загрузки файла']); exit;
    }

    $upload_dir = __DIR__ . '/uploads/';
    if (!is_dir($upload_dir)) @mkdir($upload_dir, 0777, true);

    $file_info = pathinfo($_FILES['file']['name']);
    $ext = mb_strtolower($file_info['extension'] ?? '');
    $allowed_ext = ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'];
    
    if (!in_array($ext, $allowed_ext)) {
        echo json_encode(['error' => 'Недопустимый формат файла']); exit;
    }

    $new_filename = uniqid('track_') . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
    $dest = $upload_dir . $new_filename;

    if (move_uploaded_file($_FILES['file']['tmp_name'], $dest)) {
        $title = mb_substr(strip_tags($file_info['filename']), 0, 200);
        $url = 'uploads/' . $new_filename; 

        $stmt = $pdo->prepare("INSERT INTO tracks (playlist_id, title, artist, url, thumb, type) VALUES (?, ?, 'Загруженный файл', ?, 'images/cover.png', 'audio')");
        $stmt->execute([$playlist_id, $title, $url]);

        echo json_encode(['success' => true]);
    } else {
        echo json_encode(['error' => 'Ошибка сохранения файла на сервере']);
    }
}

// --- УМНЫЙ ГЛОБАЛЬНЫЙ ПОИСК (4 ЛУЧШИХ ИСТОЧНИКА) ---
elseif ($action === 'search_global') {
    $query_raw = isset($data['query']) ? $data['query'] : ($_POST['query'] ?? '');
    $query_encode = urlencode(strip_tags(trim($query_raw)));
    
    $query_lower = mb_strtolower(trim(strip_tags($query_raw)));
    $query_words = array_filter(explode(' ', $query_lower));
    
    $page = isset($data['page']) ? (int)$data['page'] : 1;
    if ($page < 1) $page = 1;

    if (empty($query_encode)) {
        echo json_encode(['success' => true, 'data' => []]);
        exit;
    }

    // ВЕРНУЛИ КАЗАХСКИЙ САЙТ (VK) ПО ПРОСЬБЕ ПОЛЬЗОВАТЕЛЯ
    $urls = [
        'vk_mail' => "https://slider.kz/vk_auth.php?q=" . $query_encode . "&page=" . $page,
        'hitmoz'  => "https://ru.hitmoz.org/search?q=" . $query_encode,
        'muzo'    => "https://muzofond.fm/search/" . $query_encode . "?page=" . $page,
        'zvooq'   => "https://zvooq.net/search/" . $query_encode,
        'muzvox'  => "https://muzvox.org/search/" . $query_encode,
        'muzca'   => "https://muzca.net/index.php?do=search&subaction=search&story=" . $query_encode
    ];

    $multi = curl_multi_init();
    $channels = [];

    foreach ($urls as $key => $url) {
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 3); 
        curl_setopt($ch, CURLOPT_TIMEOUT, 6); 
        curl_setopt($ch, CURLOPT_ENCODING, '');
        curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language: ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
            'Cache-Control: no-cache',
        ]);
        
        curl_multi_add_handle($multi, $ch);
        $channels[$key] = $ch;
    }

    $active = null;
    do {
        curl_multi_exec($multi, $active);
        curl_multi_select($multi);
    } while ($active > 0);

    $responses = [];
    foreach ($channels as $key => $ch) {
        $responses[$key] = curl_multi_getcontent($ch);
        curl_multi_remove_handle($multi, $ch);
        curl_close($ch);
    }
    curl_multi_close($multi);

    $raw_results = [];

    // Парсер: Slider.kz (VK)
    if (!empty($responses['vk_mail'])) {
        $data_decoded = json_decode($responses['vk_mail'], true);
        if (!empty($data_decoded['audios'])) {
            foreach ($data_decoded['audios'] as $tracks) {
                if (is_array($tracks)) {
                    foreach ($tracks as $track) {
                        if (!empty($track['url'])) {
                            $full_title = $track['tit_art'] ?? 'Неизвестный трек';
                            $parts = explode(' - ', $full_title, 2);
                            $raw_results[] = [
                                'title' => trim($parts[1] ?? $parts[0]),
                                'artist' => trim(isset($parts[1]) ? $parts[0] : 'Неизвестен'),
                                'url' => $track['url'],
                                'type' => 'audio',
                                'thumb' => 'images/cover.png',
                                'source' => '[VK]'
                            ];
                        }
                    }
                }
            }
        }
    }

    // Парсер: Hitmoz
    if (!empty($responses['hitmoz']) && strpos($responses['hitmoz'], 'tracks__item') !== false) {
        libxml_use_internal_errors(true);
        $dom = new DOMDocument();
        @$dom->loadHTML('<?xml encoding="utf-8" ?>' . $responses['hitmoz']);
        $xpath = new DOMXPath($dom);
        $track_nodes = $xpath->query("//li[contains(@class, 'tracks__item')]");
        if ($track_nodes) {
            foreach ($track_nodes as $node) {
                $title_node = $xpath->query(".//div[contains(@class, 'track__title')]", $node)->item(0);
                $artist_node = $xpath->query(".//div[contains(@class, 'track__desc')]", $node)->item(0);
                $link_node = $xpath->query(".//a[contains(@class, 'track__download-btn')]", $node)->item(0);
                if ($title_node && $link_node) {
                    $url = trim($link_node->getAttribute('href'));
                    if (!empty($url) && strpos($url, 'http') !== 0) {
                        $url = 'https://ru.hitmoz.org' . (strpos($url, '/') === 0 ? '' : '/') . $url;
                    }
                    $raw_results[] = [
                        'title' => trim($title_node->textContent),
                        'artist' => $artist_node ? trim($artist_node->textContent) : 'Неизвестен',
                        'url' => $url,
                        'type' => 'audio',
                        'thumb' => 'images/cover.png',
                        'source' => '[HITMOZ]'
                    ];
                }
            }
        }
        libxml_clear_errors();
    }

    // Парсер: Muzofond
    if (!empty($responses['muzo'])) {
        libxml_use_internal_errors(true);
        $dom = new DOMDocument();
        @$dom->loadHTML('<?xml encoding="utf-8" ?>' . $responses['muzo']);
        $xpath = new DOMXPath($dom);
        $track_nodes = $xpath->query("//li[contains(@class, 'item')]");
        if ($track_nodes) {
            foreach ($track_nodes as $node) {
                $play_node = $xpath->query(".//*[@data-url]", $node)->item(0);
                $artist_node = $xpath->query(".//*[contains(@class, 'artist')]", $node)->item(0);
                $title_node = $xpath->query(".//*[contains(@class, 'track')]", $node)->item(0);
                if ($play_node && $title_node) {
                    $url = trim($play_node->getAttribute('data-url'));
                    if (!empty($url) && strpos($url, 'http') !== 0) {
                        $url = 'https://muzofond.fm' . (strpos($url, '/') === 0 ? '' : '/') . $url;
                    }
                    if (!empty($url)) {
                        $raw_results[] = [
                            'title' => trim($title_node->textContent),
                            'artist' => $artist_node ? trim($artist_node->textContent) : 'Неизвестен',
                            'url' => $url,
                            'type' => 'audio',
                            'thumb' => 'images/cover.png',
                            'source' => '[MUZOFOND]'
                        ];
                    }
                }
            }
        }
        libxml_clear_errors();
    }

    // Парсер: Zvooq.net
    if (!empty($responses['zvooq'])) {
        libxml_use_internal_errors(true);
        $dom = new DOMDocument();
        @$dom->loadHTML('<?xml encoding="utf-8" ?>' . $responses['zvooq']);
        $xpath = new DOMXPath($dom);
        $track_nodes = $xpath->query("//*[contains(@class, 'track') or contains(@class, 'item')]");
        if ($track_nodes) {
            foreach ($track_nodes as $node) {
                $title_node = $xpath->query(".//*[contains(@class, 'title') or contains(@class, 'name')]", $node)->item(0);
                $artist_node = $xpath->query(".//*[contains(@class, 'artist')]", $node)->item(0);
                $link_node = $xpath->query(".//*[@data-url] | .//a[contains(@href, '.mp3')]", $node)->item(0);
                
                if ($title_node && $link_node) {
                    $url = $link_node->hasAttribute('data-url') ? $link_node->getAttribute('data-url') : $link_node->getAttribute('href');
                    if (!empty($url) && strpos($url, 'http') !== 0) {
                        $url = 'https://zvooq.net' . (strpos($url, '/') === 0 ? '' : '/') . $url;
                    }
                    if (!empty($url) && strpos($url, 'javascript') === false) {
                        $raw_results[] = [
                            'title' => trim($title_node->textContent),
                            'artist' => $artist_node ? trim($artist_node->textContent) : 'Неизвестен',
                            'url' => $url,
                            'type' => 'audio',
                            'thumb' => 'images/cover.png',
                            'source' => '[ZVOOQ]'
                        ];
                    }
                }
            }
        }
        libxml_clear_errors();
    }


    // Парсер: MuzVox. Обрабатываем как прямые MP3-ссылки, так и ссылки
    // на страницу скачивания/прослушивания. Это дополнительный источник и
    // не влияет на четыре старых парсера.
    if (!empty($responses['muzvox'])) {
        libxml_use_internal_errors(true);
        $dom = new DOMDocument();
        @$dom->loadHTML('<?xml encoding="utf-8" ?>' . $responses['muzvox']);
        $xpath = new DOMXPath($dom);
        $nodes = $xpath->query("//a[@href]");
        if ($nodes) {
            foreach ($nodes as $a) {
                $href = trim($a->getAttribute('href'));
                if ($href === '') continue;
                $hrefLower = mb_strtolower($href, 'UTF-8');
                if (strpos($hrefLower, '.mp3') === false && strpos($hrefLower, 'download') === false) continue;

                $url = $href;
                if (strpos($url, '//') === 0) $url = 'https:' . $url;
                elseif (strpos($url, 'http') !== 0) $url = 'https://muzvox.org' . (strpos($url, '/') === 0 ? '' : '/') . $url;

                $container = $xpath->query("ancestor::*[self::li or self::article or self::div][1]", $a)->item(0);
                $text = $container ? trim(preg_replace('/\\s+/u', ' ', $container->textContent)) : trim($a->textContent);
                $title = trim($a->textContent);
                $artist = 'Неизвестен';

                if ($text !== '' && preg_match('/^(.+?)\\s+[-–—]\\s+(.+?)(?:\\s+(?:слушать|скачать)\\b.*)?$/iu', $text, $m)) {
                    $artist = trim($m[1]);
                    $title = trim($m[2]);
                }
                if ($title === '' || mb_strlen($title) > 250) continue;

                $raw_results[] = [
                    'title' => $title,
                    'artist' => $artist,
                    'url' => $url,
                    'type' => 'audio',
                    'thumb' => 'images/cover.png',
                    'source' => '[MUZVOX]'
                ];
            }
        }
        libxml_clear_errors();
    }

    // Парсер: Muzca. DLE-поиск возвращает ссылки на страницы треков.
    // Сначала собираем карточки, затем параллельно открываем только найденные
    // страницы и извлекаем реальный MP3. При проблемах Muzca остальные источники
    // продолжают работать независимо.
    if (!empty($responses['muzca'])) {
        libxml_use_internal_errors(true);
        $dom = new DOMDocument();
        @$dom->loadHTML('<?xml encoding="utf-8" ?>' . $responses['muzca']);
        $xpath = new DOMXPath($dom);
        $detailUrls = [];
        foreach ($xpath->query("//a[@href]") as $a) {
            $href = trim($a->getAttribute('href'));
            if ($href === '') continue;
            $abs = $href;
            if (strpos($abs, '//') === 0) $abs = 'https:' . $abs;
            elseif (strpos($abs, 'http') !== 0) $abs = 'https://muzca.net' . (strpos($abs, '/') === 0 ? '' : '/') . $abs;
            if (preg_match('~/[0-9]+-[^/?#]+\\.html(?:\\?.*)?$~iu', $abs)) {
                $detailUrls[$abs] = trim(preg_replace('/\\s+/u', ' ', $a->textContent));
            }
        }
        libxml_clear_errors();

        $detailUrls = array_slice($detailUrls, 0, 12, true);
        if ($detailUrls) {
            $m2 = curl_multi_init();
            $detailChannels = [];
            foreach ($detailUrls as $du => $anchorText) {
                $ch = curl_init($du);
                curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
                curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
                curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
                curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 2);
                curl_setopt($ch, CURLOPT_TIMEOUT, 5);
                curl_setopt($ch, CURLOPT_ENCODING, '');
                curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36');
                curl_setopt($ch, CURLOPT_HTTPHEADER, ['Accept: text/html,application/xhtml+xml', 'Accept-Language: ru-RU,ru;q=0.9']);
                curl_multi_add_handle($m2, $ch);
                $detailChannels[$du] = $ch;
            }
            $active2 = null;
            do {
                curl_multi_exec($m2, $active2);
                if ($active2) curl_multi_select($m2, 0.25);
            } while ($active2 > 0);

            foreach ($detailChannels as $du => $ch) {
                $html = curl_multi_getcontent($ch);
                curl_multi_remove_handle($m2, $ch);
                curl_close($ch);
                if (!$html) continue;

                libxml_use_internal_errors(true);
                $d = new DOMDocument();
                @$d->loadHTML('<?xml encoding="utf-8" ?>' . $html);
                $xp = new DOMXPath($d);
                $mp3 = $xp->query("//a[contains(translate(@href,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'), '.mp3')]")->item(0);
                if (!$mp3) {
                    $mp3 = $xp->query("//*[@data-url and contains(translate(@data-url,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'), '.mp3')]")->item(0);
                }
                if ($mp3) {
                    $audioUrl = $mp3->hasAttribute('data-url') ? trim($mp3->getAttribute('data-url')) : trim($mp3->getAttribute('href'));
                    if ($audioUrl !== '') {
                        if (strpos($audioUrl, '//') === 0) $audioUrl = 'https:' . $audioUrl;
                        elseif (strpos($audioUrl, 'http') !== 0) $audioUrl = 'https://muzca.net' . (strpos($audioUrl, '/') === 0 ? '' : '/') . $audioUrl;
                        $h1 = $xp->query('//h1')->item(0);
                        $heading = $h1 ? trim(preg_replace('/\\s+/u', ' ', $h1->textContent)) : ($detailUrls[$du] ?? '');
                        $heading = preg_replace('/\\s+».*$/u', '', $heading);
                        $artist = 'Неизвестен';
                        $title = $heading;
                        if (preg_match('/^(.+?)\\s+-\\s+(.+)$/u', $heading, $mm)) {
                            $artist = trim($mm[1]);
                            $title = trim($mm[2]);
                        }
                        if ($title !== '') {
                            $raw_results[] = [
                                'title' => $title,
                                'artist' => $artist,
                                'url' => $audioUrl,
                                'type' => 'audio',
                                'thumb' => 'images/cover.png',
                                'source' => '[MUZCA]'
                            ];
                        }
                    }
                }
                libxml_clear_errors();
            }
            curl_multi_close($m2);
        }
    }

    // --- ФИЛЬТРАЦИЯ И ДЕДУПЛИКАЦИЯ ПО КАЖДОМУ ИСТОЧНИКУ ---
    // Один и тот же трек на разных сайтах НЕ удаляется.
    $by_source = [
        '[VK]' => [],
        '[HITMOZ]' => [],
        '[MUZOFOND]' => [],
        '[ZVOOQ]' => [],
        '[MUZVOX]' => [],
        '[MUZCA]' => []
    ];

    foreach ($raw_results as $r) {
        $title = trim($r['title'] ?? '');
        $artist = trim($r['artist'] ?? '');
        if ($title === '' || empty($r['url'])) continue;

        $full_str = $title . ' ' . $artist;
        $full_str_lower = mb_strtolower($full_str, 'UTF-8');
        $title_lower = mb_strtolower($title, 'UTF-8');
        $artist_lower = mb_strtolower($artist, 'UTF-8');

        $match = true;
        foreach ($query_words as $word) {
            $word = trim($word);
            if ($word !== '' && mb_strpos($full_str_lower, $word) === false) {
                $match = false;
                break;
            }
        }
        if (!$match) continue;

        $source = $r['source'] ?? '';
        if (!isset($by_source[$source])) continue;

        $r['_url_key'] = sha1((string)$r['url']);
        $r['relevance'] = 0;
        if ($title_lower === $query_lower) $r['relevance'] += 10000;
        elseif (mb_strpos($title_lower, $query_lower) === 0) $r['relevance'] += 5000;
        elseif ($artist_lower === $query_lower) $r['relevance'] += 3000;
        elseif (mb_strpos($title_lower, $query_lower) !== false) $r['relevance'] += 500;

        $by_source[$source][] = $r;
    }

    foreach ($by_source as $source => &$items) {
        $seen_urls = [];
        $unique = [];
        foreach ($items as $item) {
            $key = $item['_url_key'];
            if (isset($seen_urls[$key])) continue;
            $seen_urls[$key] = true;
            unset($item['_url_key']);
            $unique[] = $item;
        }
        usort($unique, function($a, $b) {
            return (($b['relevance'] ?? 0) <=> ($a['relevance'] ?? 0));
        });
        $items = array_slice($unique, 0, 25);
    }
    unset($items);

    $order = ['[VK]', '[HITMOZ]', '[MUZOFOND]', '[ZVOOQ]', '[MUZVOX]', '[MUZCA]'];
    $positions = array_fill_keys($order, 0);
    $final_output = [];
    while (count($final_output) < 50) {
        $added = false;
        foreach ($order as $source) {
            $pos = $positions[$source];
            if (isset($by_source[$source][$pos])) {
                $item = $by_source[$source][$pos++];
                $positions[$source] = $pos;
                unset($item['relevance']);
                $final_output[] = $item;
                $added = true;
                if (count($final_output) >= 50) break;
            }
        }
        if (!$added) break;
    }

    echo json_encode(['success' => true, 'data' => $final_output], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

else {
    echo json_encode(['error' => 'Unknown action']);
}
?>