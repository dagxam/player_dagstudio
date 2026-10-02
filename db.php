<?php
// db.php - V220 (WAL Mode + Security Update)

$db_file = __DIR__ . '/player.db';

try {
    $pdo = new PDO("sqlite:" . $db_file);
    
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $pdo->setAttribute(PDO::ATTR_TIMEOUT, 5);
    
    // Включаем WAL режим
    $pdo->exec("PRAGMA journal_mode = WAL;");
    $pdo->exec("PRAGMA synchronous = NORMAL;");
    
    // Включаем поддержку внешних ключей
    $pdo->exec("PRAGMA foreign_keys = ON;");

    // АВТОМАТИЧЕСКОЕ СОЗДАНИЕ ТАБЛИЦ
    $pdo->exec("CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        theme TEXT DEFAULT 'brown'
    )");
    
    $pdo->exec("CREATE TABLE IF NOT EXISTS playlists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        type TEXT DEFAULT 'standard',
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS tracks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        playlist_id INTEGER NOT NULL,
        title TEXT,
        artist TEXT,
        url TEXT,
        thumb TEXT,
        type TEXT,
        FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
    )");
    
} catch (\PDOException $e) {
    // ЛОГИРУЕМ ОШИБКУ НА СЕРВЕРЕ, НО НЕ ПОКАЗЫВАЕМ КЛИЕНТУ
    error_log("Database Error: " . $e->getMessage());
    
    if (isset($_SERVER['HTTP_ACCEPT']) && strpos($_SERVER['HTTP_ACCEPT'], 'application/json') !== false) {
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Внутренняя ошибка базы данных. Пожалуйста, повторите попытку позже.']);
        exit;
    } else {
        die("Внутренняя ошибка сервера.");
    }
}
?>