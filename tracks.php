<?php
require __DIR__ . '/../config.php';
cors();

$action = $_GET['action'] ?? 'list';
$method = $_SERVER['REQUEST_METHOD'];

// --- Lijst alle tracks, optioneel met zoekterm ---
if ($action === 'list' && $method === 'GET') {
    require_auth();
    $q = trim($_GET['q'] ?? '');
    if ($q !== '') {
        $stmt = db()->prepare(
            'SELECT id, title, artist, album, duration_seconds, cover_filename, created_at
             FROM tracks
             WHERE title LIKE ? OR artist LIKE ? OR album LIKE ?
             ORDER BY created_at DESC'
        );
        $like = '%' . $q . '%';
        $stmt->execute([$like, $like, $like]);
    } else {
        $stmt = db()->query(
            'SELECT id, title, artist, album, duration_seconds, cover_filename, created_at
             FROM tracks ORDER BY created_at DESC'
        );
    }
    json_out(['tracks' => $stmt->fetchAll()]);
}

// --- Eén track ophalen ---
if ($action === 'get' && $method === 'GET') {
    require_auth();
    $id = (int)($_GET['id'] ?? 0);
    $stmt = db()->prepare('SELECT id, title, artist, album, duration_seconds, cover_filename FROM tracks WHERE id = ?');
    $stmt->execute([$id]);
    $track = $stmt->fetch();
    if (!$track) json_error('Niet gevonden', 404);
    json_out(['track' => $track]);
}

// --- Upload nieuwe track (alleen admin) ---
if ($action === 'upload' && $method === 'POST') {
    $user = require_admin();

    if (empty($_FILES['mp3']) || $_FILES['mp3']['error'] !== UPLOAD_ERR_OK) {
        json_error('Geen geldig mp3-bestand ontvangen');
    }
    $file = $_FILES['mp3'];
    if ($file['size'] > MAX_UPLOAD_MB * 1024 * 1024) {
        json_error('Bestand is te groot (max ' . MAX_UPLOAD_MB . 'MB)');
    }
    $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    if ($ext !== 'mp3') json_error('Alleen .mp3 bestanden toegestaan');

    $title = trim($_POST['title'] ?? pathinfo($file['name'], PATHINFO_FILENAME));
    $artist = trim($_POST['artist'] ?? 'Onbekend');
    $album = trim($_POST['album'] ?? '');
    $duration = (int)($_POST['duration'] ?? 0);

    $safeName = bin2hex(random_bytes(16)) . '.mp3';
    if (!is_dir(UPLOAD_DIR)) mkdir(UPLOAD_DIR, 0755, true);
    if (!move_uploaded_file($file['tmp_name'], UPLOAD_DIR . $safeName)) {
        json_error('Opslaan van bestand mislukt', 500);
    }

    $coverName = null;
    if (!empty($_FILES['cover']) && $_FILES['cover']['error'] === UPLOAD_ERR_OK) {
        $coverExt = strtolower(pathinfo($_FILES['cover']['name'], PATHINFO_EXTENSION));
        if (in_array($coverExt, ['jpg', 'jpeg', 'png', 'webp'])) {
            $coverName = bin2hex(random_bytes(16)) . '.' . $coverExt;
            if (!is_dir(COVER_DIR)) mkdir(COVER_DIR, 0755, true);
            move_uploaded_file($_FILES['cover']['tmp_name'], COVER_DIR . $coverName);
        }
    }

    $stmt = db()->prepare(
        'INSERT INTO tracks (title, artist, album, duration_seconds, filename, cover_filename, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    $stmt->execute([$title, $artist, $album, $duration, $safeName, $coverName, $user['id']]);

    json_out(['id' => db()->lastInsertId()]);
}

// --- Track verwijderen (alleen admin) ---
if ($action === 'delete' && $method === 'POST') {
    require_admin();
    $data = body();
    $id = (int)($data['id'] ?? 0);

    $stmt = db()->prepare('SELECT filename, cover_filename FROM tracks WHERE id = ?');
    $stmt->execute([$id]);
    $track = $stmt->fetch();
    if (!$track) json_error('Niet gevonden', 404);

    @unlink(UPLOAD_DIR . $track['filename']);
    if ($track['cover_filename']) @unlink(COVER_DIR . $track['cover_filename']);

    $stmt = db()->prepare('DELETE FROM tracks WHERE id = ?');
    $stmt->execute([$id]);
    json_out(['ok' => true]);
}

json_error('Onbekende actie', 404);
