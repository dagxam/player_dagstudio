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
    'https://pl.dagstudio.ru',
    'https://localhost',
    'capacitor://localhost',
    'ionic://localhost',
    'http://localhost',
    'http://127.0.0.1'
];

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';

if (in_array($origin, $allowed_origins)) {
    header("Access-Control-Allow-Origin: $origin");
    header("Access-Control-Allow-Credentials: true");
}

header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, X-DAG-Session");

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

// Нативный Capacitor-клиент передаёт тот же PHP session id в отдельном заголовке.
// Это не зависит от third-party cookies внутри Android/iOS WebView.
$native_session_id = trim($_SERVER['HTTP_X_DAG_SESSION'] ?? '');
if ($native_session_id !== '' && preg_match('/^[A-Za-z0-9,-]{16,128}$/', $native_session_id)) {
    session_id($native_session_id);
}

// Важно для скорости! Снимаем блокировку сессии, чтобы параллельные запросы не висли
session_start();
session_write_close();

if (!file_exists('db.php')) {
    echo json_encode(['error' => 'Системная ошибка: конфигурация недоступна']);
    exit;
}
require 'db.php';
// Unified search uses only Muzofond and Hitmoz. Other integrations are not loaded.

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
if (in_array($action, ['login', 'logout', 'check_auth', 'get_data', 'create_playlist', 'rename_playlist', 'update_playlist_icon', 'update_playlist_cover', 'delete_playlist', 'add_track', 'set_favorite', 'update_track_url', 'delete_track', 'update_theme', 'upload_track', 'register', 'get_profile_settings', 'save_profile_setting'])) {
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
                'theme' => 'brown',
                'session_token' => session_id()
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
            echo json_encode([
                'success' => true,
                'username' => $user['username'],
                'theme' => $user['theme'] ?? 'brown',
                'session_token' => session_id()
            ]);
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
// Settings are account-scoped and versioned independently. A stale phone
// cannot blindly replace preferences updated more recently on the PC.
elseif ($action === 'get_profile_settings') {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        http_response_code(405); echo json_encode(['error' => 'Method not allowed']); exit;
    }
    if (!isset($_SESSION['user_id'])) {
        http_response_code(401); echo json_encode(['error' => 'Auth required']); exit;
    }
    try {
        $stmt = $pdo->prepare("SELECT setting_key, setting_value, revision FROM profile_settings WHERE user_id = ?");
        $stmt->execute([(int)$_SESSION['user_id']]);
        $settings = [];
        $known = is_array($data['known_revisions'] ?? null) ? $data['known_revisions'] : [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $key = $row['setting_key'];
            $revision = (int)$row['revision'];
            if (isset($known[$key]) && is_int($known[$key]) && $known[$key] === $revision) {
                $settings[$key] = ['revision' => $revision, 'unchanged' => true];
                continue;
            }
            $value = json_decode($row['setting_value']);
            if (json_last_error() !== JSON_ERROR_NONE) continue;
            $settings[$key] = ['value' => $value, 'revision' => $revision];
        }
        header('Cache-Control: no-store');
        echo json_encode(['success' => true, 'settings' => (object)$settings], JSON_UNESCAPED_UNICODE);
    } catch (Exception $e) {
        error_log('Profile settings read: ' . $e->getMessage());
        http_response_code(500); echo json_encode(['error' => 'Ошибка синхронизации профиля']);
    }
}
elseif ($action === 'save_profile_setting') {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        http_response_code(405); echo json_encode(['error' => 'Method not allowed']); exit;
    }
    if (!isset($_SESSION['user_id'])) {
        http_response_code(401); echo json_encode(['error' => 'Auth required']); exit;
    }
    $limits = [
        'equalizer' => 2048, 'soft_leveling' => 24, 'rainbow_speed' => 24,
        'smart_radio' => 24, 'traffic_saver' => 24, 'visualizer' => 2048,
        'taste' => 220000, 'likes_exclusions' => 20000, 'search_history' => 3000
    ];
    $key = (string)($data['key'] ?? '');
    $expected = $data['expected_revision'] ?? null;
    $value = $data['value'] ?? null;
    $simple = in_array($key, ['soft_leveling','smart_radio','traffic_saver'], true);
    $object = in_array($key, ['equalizer','visualizer','taste','likes_exclusions'], true);
    $array = $key === 'search_history';
    $valid = isset($limits[$key]) && is_int($expected) &&
        $expected >= 0 && $expected < 2147483647 &&
        ($simple ? is_bool($value) : ($object ? is_array($value) &&
            (!array_is_list($value) || ($key === 'likes_exclusions' && $value === [])) : ($array ? is_array($value) &&
            array_is_list($value) : ($key === 'rainbow_speed' &&
            is_int($value) && $value >= 4 && $value <= 60))));
    if (!$valid) {
        http_response_code(400); echo json_encode(['error' => 'Invalid setting']); exit;
    }
    $encoded = $key === 'likes_exclusions' && $value === [] ? '{}' :
        json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($encoded === false || strlen($encoded) > $limits[$key]) {
        http_response_code(413); echo json_encode(['error' => 'Setting too large']); exit;
    }
    try {
        $pdo->exec('BEGIN IMMEDIATE');
        $read = $pdo->prepare("SELECT setting_value, revision FROM profile_settings WHERE user_id = ? AND setting_key = ?");
        $read->execute([(int)$_SESSION['user_id'], $key]);
        $stored = $read->fetch(PDO::FETCH_ASSOC);
        $actual = $stored ? (int)$stored['revision'] : 0;
        if ($actual !== $expected) {
            $pdo->rollBack();
            echo json_encode(['success' => false, 'conflict' => true, 'setting' => [
                'value' => $stored ? json_decode($stored['setting_value']) : null,
                'revision' => $actual
            ]], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $next = $actual + 1;
        if ($actual === 0) {
            $insert = $pdo->prepare("INSERT INTO profile_settings (user_id, setting_key, setting_value, revision) VALUES (?, ?, ?, ?)");
            $insert->execute([(int)$_SESSION['user_id'], $key, $encoded, $next]);
        } else {
            $update = $pdo->prepare("UPDATE profile_settings SET setting_value = ?, revision = ? WHERE user_id = ? AND setting_key = ?");
            $update->execute([$encoded, $next, (int)$_SESSION['user_id'], $key]);
        }
        $pdo->commit();
        header('Cache-Control: no-store');
        echo json_encode(['success' => true, 'revision' => $next]);
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        error_log('Profile settings write: ' . $e->getMessage());
        http_response_code(500); echo json_encode(['error' => 'Ошибка сохранения профиля']);
    }
}
elseif ($action === 'get_data') {
    if (!isset($_SESSION['user_id'])) { echo json_encode(['error' => 'Auth required']); exit; }
    try {
        $stmt = $pdo->prepare("SELECT * FROM playlists WHERE user_id = ?");
        $stmt->execute([$_SESSION['user_id']]);
        $playlists = $stmt->fetchAll(PDO::FETCH_ASSOC);
        // Playlist icon metadata lives in a separate small table, so existing
        // installations do not need an ALTER TABLE of the playlist library.
        $playlistIcons = [];
        try {
            $iconStmt = $pdo->prepare("SELECT playlist_id, icon FROM playlist_icons WHERE user_id = ?");
            $iconStmt->execute([$_SESSION['user_id']]);
            foreach ($iconStmt->fetchAll(PDO::FETCH_ASSOC) as $iconRow) {
                $playlistIcons[(string)$iconRow['playlist_id']] = $iconRow['icon'];
            }
        } catch (Exception $ignored) {
            // Older installations have not chosen an icon yet.
        }
        $playlistCovers = [];
        $coverStmt = $pdo->prepare("SELECT playlist_id, cover FROM playlist_covers WHERE user_id = ?");
        $coverStmt->execute([$_SESSION['user_id']]);
        foreach ($coverStmt->fetchAll(PDO::FETCH_ASSOC) as $coverRow) {
            $playlistCovers[(string)$coverRow['playlist_id']] = $coverRow['cover'];
        }
        $trackStmt = $pdo->prepare("SELECT * FROM tracks WHERE playlist_id = ?");
        foreach ($playlists as &$pl) {
            $trackStmt->execute([$pl['id']]);
            $pl['tracks'] = $trackStmt->fetchAll(PDO::FETCH_ASSOC);
            $pl['source'] = 'db';
            $pl['icon'] = $playlistIcons[(string)$pl['id']] ?? ($pl['type'] === 'favorites' ? 'heart' : 'music'); 
            $pl['cover'] = $playlistCovers[(string)$pl['id']] ?? '';
        }
        echo json_encode($playlists);
    } catch (Exception $e) { echo json_encode(['error' => 'Ошибка получения данных.']); }
}
elseif ($action === 'update_track_url') {
    if (!isset($_SESSION['user_id'])) { echo json_encode(['error' => 'Нет авторизации']); exit; }

    $trackId = (int)($data['track_id'] ?? 0);
    $url = trim((string)($data['url'] ?? ''));
    $thumb = trim((string)($data['thumb'] ?? ''));

    if ($trackId <= 0 || $url === '' || !filter_var($url, FILTER_VALIDATE_URL)) {
        echo json_encode(['error' => 'Некорректный источник трека']);
        exit;
    }

    $parts = parse_url($url);
    $host = strtolower((string)($parts['host'] ?? ''));
    $scheme = strtolower((string)($parts['scheme'] ?? ''));
    $allowedTrackHosts = array_merge([
        'api.audius.co', 'discoveryprovider.audius.co', 'storage.jamendo.com',
        'slider.kz', 'ru.hitmoz.org', 'hitmoz.org', 'muzofond.fm', 'zvooq.net',
        'muzvox.org', 'storage.muzvox.org', 'static.muzvox.org', 'muzca.net'
    ], dagHitmosAudioHosts());

    $allowed = false;
    if (in_array($scheme, ['http', 'https'], true) && $host !== '') {
        foreach ($allowedTrackHosts as $domain) {
            if ($host === $domain || str_ends_with($host, '.' . $domain)) {
                $allowed = true;
                break;
            }
        }
    }

    if (!$allowed) {
        echo json_encode(['error' => 'Источник трека не разрешён']);
        exit;
    }

    try {
        $stmt = $pdo->prepare(
            "UPDATE tracks
             SET url = ?, thumb = CASE WHEN ? <> '' THEN ? ELSE thumb END
             WHERE id = ? AND playlist_id IN (SELECT id FROM playlists WHERE user_id = ?)"
        );
        $stmt->execute([
            mb_substr($url, 0, 2000),
            $thumb,
            mb_substr($thumb, 0, 2000),
            $trackId,
            $_SESSION['user_id']
        ]);
        echo json_encode(['success' => $stmt->rowCount() > 0]);
    } catch (Exception $e) {
        echo json_encode(['error' => 'Не удалось обновить источник трека']);
    }
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
elseif ($action === 'update_playlist_icon') {
    if (!isset($_SESSION['user_id'])) {
        echo json_encode(['error' => 'Для настройки плейлиста необходимо войти.']); exit;
    }
    $playlistId = filter_var($data['id'] ?? null, FILTER_VALIDATE_INT);
    $icon = (string)($data['icon'] ?? '');
    $allowedIcons = [
        'music','heart','star','headphones','car-side','mountain',
        'fire','moon','sun','bolt','compact-disc','radio','leaf',
        'guitar','globe','drum','microphone','list'
    ];
    if ($playlistId === false || $playlistId <= 0 || !in_array($icon, $allowedIcons, true)) {
        echo json_encode(['error' => 'Некорректная иконка плейлиста.']); exit;
    }
    try {
        $check = $pdo->prepare("SELECT 1 FROM playlists WHERE id = ? AND user_id = ?");
        $check->execute([$playlistId, $_SESSION['user_id']]);
        if (!$check->fetchColumn()) {
            echo json_encode(['error' => 'Плейлист не найден или доступ запрещён.']); exit;
        }
        $stmt = $pdo->prepare("INSERT INTO playlist_icons (playlist_id,user_id,icon)
            VALUES (?,?,?) ON CONFLICT(playlist_id) DO UPDATE SET
            icon = excluded.icon, user_id = excluded.user_id");
        $stmt->execute([$playlistId,$_SESSION['user_id'],$icon]);
        echo json_encode(['success' => true, 'icon' => $icon]);
    } catch (Exception $e) {
        error_log('Playlist icon save failed: ' . $e->getMessage());
        echo json_encode(['error' => 'Не удалось сохранить иконку. Повторите позже.']);
    }
}
elseif ($action === 'update_playlist_cover') {
    if (!isset($_SESSION['user_id'])) {
        echo json_encode(['error' => 'Для изменения обложки войдите в аккаунт.']); exit;
    }
    $playlistId = filter_var($data['id'] ?? null, FILTER_VALIDATE_INT);
    if (!$playlistId || $playlistId <= 0) {
        echo json_encode(['error' => 'Некорректный плейлист.']); exit;
    }
    try {
        $check = $pdo->prepare("SELECT 1 FROM playlists WHERE id = ? AND user_id = ?");
        $check->execute([$playlistId, $_SESSION['user_id']]);
        if (!$check->fetchColumn()) {
            echo json_encode(['error' => 'Плейлист не найден.']); exit;
        }
        $previousStmt = $pdo->prepare("SELECT cover FROM playlist_covers WHERE playlist_id = ? AND user_id = ?");
        $previousStmt->execute([$playlistId, $_SESSION['user_id']]);
        $previous = (string)($previousStmt->fetchColumn() ?: '');
        $cover = '';
        if (empty($data['remove'])) {
            $image = (string)($data['image'] ?? '');
            if (strlen($image) > 1900000 || !preg_match('~^data:image/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$~D', $image, $match)) {
                echo json_encode(['error' => 'Выберите JPG, PNG или WebP до 1,4 МБ после сжатия.']); exit;
            }
            $bytes = base64_decode($match[2], true);
            $info = $bytes !== false ? @getimagesizefromstring($bytes) : false;
            if (!$info || strlen($bytes) > 1400000 || $info[0] > 4096 || $info[1] > 4096 ||
                $info[0] < 16 || $info[1] < 16 ||
                $info['mime'] !== 'image/' . $match[1]) {
                echo json_encode(['error' => 'Файл повреждён или не является изображением.']); exit;
            }
            $extension = $match[1] === 'jpeg' ? 'jpg' : $match[1];
            $folder = __DIR__ . '/images/playlist-covers';
            if (!is_dir($folder) && !@mkdir($folder, 0755, true) && !is_dir($folder)) {
                echo json_encode(['error' => 'Сервер не смог создать папку обложек.']); exit;
            }
            $cover = 'images/playlist-covers/' . bin2hex(random_bytes(16)) . '.' . $extension;
            if (@file_put_contents(__DIR__ . '/' . $cover, $bytes, LOCK_EX) !== strlen($bytes)) {
                echo json_encode(['error' => 'Не удалось сохранить изображение.']); exit;
            }
        }
        if ($cover !== '') {
            $stmt = $pdo->prepare("INSERT INTO playlist_covers (playlist_id,user_id,cover) VALUES (?,?,?)
                ON CONFLICT(playlist_id) DO UPDATE SET user_id=excluded.user_id,cover=excluded.cover");
            $stmt->execute([$playlistId, $_SESSION['user_id'], $cover]);
        } else {
            $stmt = $pdo->prepare("DELETE FROM playlist_covers WHERE playlist_id = ? AND user_id = ?");
            $stmt->execute([$playlistId, $_SESSION['user_id']]);
        }
        if ($previous && preg_match('~^images/playlist-covers/[a-f0-9]{32}\.(?:jpg|png|webp)$~D', $previous)) {
            @unlink(__DIR__ . '/' . $previous);
        }
        echo json_encode(['success' => true, 'cover' => $cover]);
    } catch (Exception $e) {
        error_log('Playlist cover save failed: ' . $e->getMessage());
        echo json_encode(['error' => 'Не удалось сохранить обложку.']);
    }
}
elseif ($action === 'delete_playlist') {
    if (!isset($_SESSION['user_id'])) exit;
    try {
        $oldCover = $pdo->prepare("SELECT cover FROM playlist_covers WHERE playlist_id = ? AND user_id = ?");
        $oldCover->execute([$data['id'], $_SESSION['user_id']]);
        $previous = (string)($oldCover->fetchColumn() ?: '');
        $stmt = $pdo->prepare("DELETE FROM playlists WHERE id = ? AND user_id = ?");
        $stmt->execute([$data['id'], $_SESSION['user_id']]);
        if ($stmt->rowCount() && preg_match('~^images/playlist-covers/[a-f0-9]{32}\.(?:jpg|png|webp)$~D', $previous)) {
            @unlink(__DIR__ . '/' . $previous);
        }
        echo json_encode(['success' => true]);
    } catch (Exception $e) { echo json_encode(['error' => 'Ошибка удаления.']); }
}
elseif ($action === 'add_track') {
    if (!isset($_SESSION['user_id'])) { echo json_encode(['error' => 'Требуется вход']); exit; }
    $playlist_id = (int)($data['playlist_id'] ?? 0);
    $t = $data['track'] ?? null;
    if ($playlist_id <= 0 || !is_array($t)) {
        echo json_encode(['error' => 'Некорректные данные']); exit;
    }
    $title = mb_substr(trim(strip_tags((string)($t['title'] ?? ''))), 0, 200);
    $artist = mb_substr(trim(strip_tags((string)($t['artist'] ?? ''))), 0, 200);
    $url = mb_substr(trim(strip_tags((string)($t['url'] ?? ''))), 0, 2000);
    $thumb = mb_substr(strip_tags((string)($t['thumb'] ?? '')), 0, 2000);
    $type = mb_substr(strip_tags((string)($t['type'] ?? 'audio')), 0, 50);
    if ($title === '' || $artist === '' || $url === '') {
        echo json_encode(['error' => 'Не указана песня или ссылка на аудио']); exit;
    }
    try {
        $chk = $pdo->prepare("SELECT 1 FROM playlists WHERE id = ? AND user_id = ?");
        $chk->execute([$playlist_id, $_SESSION['user_id']]);
        if (!$chk->fetchColumn()) {
            echo json_encode(['error' => 'Доступ запрещён']); exit;
        }

        // Protect the playlist even if two clients add the same song before
        // they receive a fresh library snapshot. Different artist or title
        // means a different recording and is never silently substituted.
        $existing = $pdo->prepare("SELECT title, artist, url FROM tracks WHERE playlist_id = ?");
        $existing->execute([$playlist_id]);
        $nameKey = static fn($value) => mb_strtolower(trim((string)$value), 'UTF-8');
        foreach ($existing->fetchAll(PDO::FETCH_ASSOC) as $saved) {
            if ((string)$saved['url'] === $url ||
                ($nameKey($saved['title']) === $nameKey($title) &&
                 $nameKey($saved['artist']) === $nameKey($artist))) {
                echo json_encode(['error' => 'Эта песня уже есть в плейлисте', 'duplicate' => true]);
                exit;
            }
        }
        $stmt = $pdo->prepare("INSERT INTO tracks (playlist_id, title, artist, url, thumb, type) VALUES (?, ?, ?, ?, ?, ?)");
        $stmt->execute([$playlist_id, $title, $artist, $url, $thumb, $type]);
        echo json_encode(['success' => true, 'track_id' => (int)$pdo->lastInsertId()]);
    } catch (Exception $e) {
        echo json_encode(['error' => 'Ошибка добавления трека.']);
    }
}
// Atomic, idempotent favorite toggle. The dedicated "Мне нравится" playlist
// syncs via get_data to both browsers and Android without touching other lists.
elseif ($action === 'set_favorite') {
    if (!isset($_SESSION['user_id'])) {
        echo json_encode(['error' => 'Войдите в аккаунт, чтобы сохранять любимые песни.']);
        exit;
    }
    $liked = ($data['liked'] ?? null) === true;
    $track = $data['track'] ?? null;
    if (!is_array($track) || !is_bool($data['liked'] ?? null)) {
        echo json_encode(['error' => 'Некорректный запрос избранного.']);
        exit;
    }
    $title = mb_substr(trim(strip_tags((string)($track['title'] ?? ''))), 0, 200);
    $artist = mb_substr(trim(strip_tags((string)($track['artist'] ?? ''))), 0, 200);
    $url = trim((string)($track['url'] ?? ''));
    $thumb = mb_substr(strip_tags((string)($track['thumb'] ?? '')), 0, 2000);
    // File URLs are never supported as favorites; only HTTP(S) or uploaded
    // tracks belonging to this player may be saved.
    $safeUrl = strlen($url) <= 2000 &&
        (filter_var($url, FILTER_VALIDATE_URL) &&
            in_array(strtolower((string)(parse_url($url, PHP_URL_SCHEME) ?: '')), ['http', 'https'], true) ||
         preg_match('~^uploads/track_[a-zA-Z0-9_.-]+\\.(mp3|wav|ogg|m4a|aac|flac)$~D', $url));
    if ($title === '' || $artist === '' || !$safeUrl) {
        echo json_encode(['error' => 'Нельзя сохранить трек без названия, исполнителя и корректной ссылки.']);
        exit;
    }
    try {
        $pdo->beginTransaction();
        $uid = (int)$_SESSION['user_id'];
        $findPlaylist = $pdo->prepare("SELECT id FROM playlists
            WHERE user_id = ? AND type = 'favorites' LIMIT 1");
        $findPlaylist->execute([$uid]);
        $favoriteId = (int)$findPlaylist->fetchColumn();
        if (!$favoriteId && $liked) {
            $pdo->prepare("INSERT INTO playlists (user_id, name, type)
                VALUES (?, 'Мне нравится', 'favorites')")->execute([$uid]);
            $favoriteId = (int)$pdo->lastInsertId();
        }
        $matching = [];
        if ($favoriteId) {
            $lookup = $pdo->prepare("SELECT id, title, artist, url FROM tracks WHERE playlist_id = ?");
            $lookup->execute([$favoriteId]);
            foreach ($lookup->fetchAll() as $saved) {
                if ((string)$saved['url'] === $url ||
                    (mb_strtolower(trim((string)$saved['title'])) === mb_strtolower($title) &&
                     mb_strtolower(trim((string)$saved['artist'])) === mb_strtolower($artist))) {
                    $matching[] = (int)$saved['id'];
                }
            }
        }
        $trackId = $matching[0] ?? null;
        if ($liked && $favoriteId && !$matching) {
            $insert = $pdo->prepare("INSERT INTO tracks
                (playlist_id, title, artist, url, thumb, type) VALUES (?, ?, ?, ?, ?, 'audio')");
            $insert->execute([$favoriteId, $title, $artist, $url, $thumb]);
            $trackId = (int)$pdo->lastInsertId();
        } elseif (!$liked && $matching) {
            $delete = $pdo->prepare("DELETE FROM tracks WHERE id = ? AND playlist_id = ?");
            foreach ($matching as $id) $delete->execute([$id, $favoriteId]);
        }
        $pdo->commit();
        echo json_encode([
            'success' => true, 'liked' => $liked,
            'playlist_id' => $favoriteId ?: null,
            'track_id' => $liked ? $trackId : null
        ], JSON_UNESCAPED_UNICODE);
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        error_log('Set favorite failed: ' . $error->getMessage());
        echo json_encode(['error' => 'Не удалось изменить избранное. Повторите попытку.']);
    }
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

// Official Audius new releases / trending, streamed only from its own API.
elseif ($action === 'official_audius_feed') {
    require __DIR__ . '/music-official.php';
}

// Public, metadata-only 2026 release discovery. No proxying or scraping audio.
elseif ($action === 'catalog_2026') {
    require __DIR__ . '/catalog-2026.php';
}

// --- ГЛОБАЛЬНЫЙ ПОИСК ПО ДОСТУПНЫМ ИСТОЧНИКАМ ---
elseif ($action === 'search_global') {
    $query_raw = isset($data['query']) ? $data['query'] : ($_POST['query'] ?? '');
    $query_encode = urlencode(strip_tags(trim($query_raw)));
    
    $query_lower = mb_strtolower(trim(strip_tags($query_raw)));
    $query_words = array_filter(explode(' ', $query_lower));
    
    $page = isset($data['page']) ? (int)$data['page'] : 1;
    if ($page < 1) $page = 1;

    $weak_client = (($data['network'] ?? '') === 'weak') || !empty($data['save_data']);
    // Fast initial results and a retry at full budget for slow responses.
    // Both sources are always queried independently, even when one fails.
    $fast_search = ($data['mode'] ?? '') === 'fast';
    // Slow user connectivity does not imply a fast connection from PHP to providers.
    // Give the upstream services time to answer instead of discarding viable results.
    $provider_connect_timeout = $fast_search ? 2 : ($weak_client ? 3 : 4);
    $provider_timeout = $fast_search ? 3 : ($weak_client ? 7 : 8);
    $result_limit = $fast_search ? 25 : ($weak_client ? 30 : 50);

    if (empty($query_encode)) {
        echo json_encode(['success' => true, 'data' => []]);
        exit;
    }

    // Only the two selected search providers are queried. This also applies
    // when optional API keys or environment settings exist on the server.
    $urls = [
        'muzo' => "https://muzofond.fm/search/" . $query_encode . "?page=" . $page,
        'hitmoz' => "https://ru.hitmoz.org/search?q=" . $query_encode
    ];

    $multi = curl_multi_init();
    $channels = [];

    foreach ($urls as $key => $url) {
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        // No API credentials are sent to these sources. Limit redirects.
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_MAXREDIRS, 2);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 2);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, $provider_connect_timeout);
        curl_setopt($ch, CURLOPT_TIMEOUT, $provider_timeout); 
        curl_setopt($ch, CURLOPT_ENCODING, '');
        curl_setopt($ch, CURLOPT_LOW_SPEED_LIMIT, $weak_client ? 64 : 128);
        curl_setopt($ch, CURLOPT_LOW_SPEED_TIME, $weak_client ? 3 : 4);
        curl_setopt($ch, CURLOPT_HTTP_VERSION, CURL_HTTP_VERSION_1_1);
        curl_setopt($ch, CURLOPT_IPRESOLVE, CURL_IPRESOLVE_V4);
        curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        $headers = [
            'Accept: application/json,text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
            'Accept-Language: ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
            'Cache-Control: no-cache'
        ];
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        
        curl_multi_add_handle($multi, $ch);
        $channels[$key] = $ch;
    }

    $active = null;
    do {
        do {
            $mrc = curl_multi_exec($multi, $active);
        } while ($mrc === CURLM_CALL_MULTI_PERFORM);

        if ($active > 0) {
            $selected = curl_multi_select($multi, 0.20);
            if ($selected === -1) usleep(20000);
        }
    } while ($active > 0);

    $responses = [];
    $source_status = [];
    foreach ($channels as $key => $ch) {
        $body = curl_multi_getcontent($ch);
        $http = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $errno = curl_errno($ch);
        $error = curl_error($ch);

        $responses[$key] = ($http >= 200 && $http < 400 && $errno === 0) ? $body : '';
        $source_status[$key] = [
            'ok' => ($http >= 200 && $http < 400 && $errno === 0 && strlen((string)$body) > 0),
            'http' => $http,
            'error' => $errno ? mb_substr($error, 0, 100) : ''
        ];

        curl_multi_remove_handle($multi, $ch);
        curl_close($ch);
    }
    curl_multi_close($multi);

    // Both sources receive the same query; their results enter one list.
    $raw_results = [];

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

    // --- ФИЛЬТРАЦИЯ И ДЕДУПЛИКАЦИЯ ПО КАЖДОМУ ИСТОЧНИКУ ---
    // Один и тот же трек на разных сайтах НЕ удаляется.
    $by_source = [
        '[MUZOFOND]' => [],
        '[HITMOZ]' => []
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
        elseif ($artist_lower === $query_lower) $r['relevance'] += 12000;
        elseif (mb_strpos($title_lower, $query_lower) !== false) $r['relevance'] += 500;
        if ($artist_lower !== $query_lower && $query_lower !== '' &&
            mb_strpos($artist_lower, $query_lower) !== false) $r['relevance'] += 3500;

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

    $order = ['[MUZOFOND]', '[HITMOZ]'];
    $positions = array_fill_keys($order, 0);
    $final_output = [];
    while (count($final_output) < $result_limit) {
        $added = false;
        foreach ($order as $source) {
            $pos = $positions[$source];
            if (isset($by_source[$source][$pos])) {
                $item = $by_source[$source][$pos++];
                $positions[$source] = $pos;
                unset($item['relevance']);
                $final_output[] = $item;
                $added = true;
                if (count($final_output) >= $result_limit) break;
            }
        }
        if (!$added) break;
    }

    $source_counts = [];
    foreach ($by_source as $source => $items) {
        $source_counts[$source] = count($items);
    }
    // HTTP 200 does not mean this site actually yielded matching tracks.
    // Keep the old ok/http fields for compatibility; add candidate diagnostics
    // without claiming that the audio stream was verified.
    $provider_source_keys = [
        'muzo' => '[MUZOFOND]',
        'hitmoz' => '[HITMOZ]'
    ];
    foreach ($provider_source_keys as $key => $label) {
        if (!isset($source_status[$key])) continue;
        $count = (int)($source_counts[$label] ?? 0);
        $source_status[$key]['matching_tracks'] = $count;
        $source_status[$key]['has_results'] = $count > 0;
        $source_status[$key]['audio_verified'] = false;
    }

    echo json_encode([
        'success' => true,
        'data' => $final_output,
        'network_mode' => $weak_client ? 'weak' : 'normal',
        // Search again with a longer timeout only if one source had no
        // matched results in the fast pass. Full pass is always final.
        'search_complete' => !$fast_search ||
            (($source_status['muzo']['has_results'] ?? false) &&
             ($source_status['hitmoz']['has_results'] ?? false)),
        'sources' => $source_status,
        'source_counts' => $source_counts
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

else {
    echo json_encode(['error' => 'Unknown action']);
}
?>
