<?php
// ============================================================
// Amplify - backend configuratie
// Vul deze gegevens in met je DirectAdmin MySQL database info
// ============================================================

// --- Database instellingen (aanpassen!) ---
define('DB_HOST', 'localhost');
define('DB_NAME', 'jouw_db_naam');
define('DB_USER', 'jouw_db_user');
define('DB_PASS', 'jouw_db_wachtwoord');

// --- Bestandslocaties ---
define('UPLOAD_DIR', __DIR__ . '/uploads/');   // mp3 bestanden
define('COVER_DIR', __DIR__ . '/covers/');     // albumhoezen (jpg/png)
define('MAX_UPLOAD_MB', 25);                   // max bestandsgrootte per mp3

// --- CORS: alleen nodig als frontend op ander domein/subdomein draait ---
// Laat leeg ('') als frontend + backend op hetzelfde domein staan (aanbevolen)
define('ALLOWED_ORIGIN', '');

// ============================================================
// Onderstaande hoeft niet aangepast te worden
// ============================================================

function db(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4';
        $pdo = new PDO($dsn, DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
    }
    return $pdo;
}

function json_out($data, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function json_error(string $message, int $status = 400): void {
    json_out(['error' => $message], $status);
}

function body(): array {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function start_session(): void {
    if (session_status() === PHP_SESSION_NONE) {
        session_set_cookie_params([
            'lifetime' => 60 * 60 * 24 * 30, // 30 dagen
            'path' => '/',
            'secure' => true,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        session_name('amplify_session');
        session_start();
    }
}

function current_user(): ?array {
    start_session();
    if (empty($_SESSION['user_id'])) return null;
    $stmt = db()->prepare('SELECT id, email, display_name, is_admin FROM users WHERE id = ?');
    $stmt->execute([$_SESSION['user_id']]);
    $user = $stmt->fetch();
    return $user ?: null;
}

function require_auth(): array {
    $user = current_user();
    if (!$user) json_error('Niet ingelogd', 401);
    return $user;
}

function require_admin(): array {
    $user = require_auth();
    if (!$user['is_admin']) json_error('Alleen voor admins', 403);
    return $user;
}

function cors(): void {
    if (ALLOWED_ORIGIN !== '') {
        header('Access-Control-Allow-Origin: ' . ALLOWED_ORIGIN);
        header('Access-Control-Allow-Credentials: true');
        header('Access-Control-Allow-Headers: Content-Type');
        header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
        if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
    }
}
