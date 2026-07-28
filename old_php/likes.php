<?php
require __DIR__ . '/../config.php';
cors();

$action = $_GET['action'] ?? 'list';
$method = $_SERVER['REQUEST_METHOD'];
$user = require_auth();

// --- Alle geliked nummers ---
if ($action === 'list' && $method === 'GET') {
    $stmt = db()->prepare(
        'SELECT t.id, t.title, t.artist, t.album, t.duration_seconds, t.cover_filename
         FROM likes l JOIN tracks t ON t.id = l.track_id
         WHERE l.user_id = ? ORDER BY l.created_at DESC'
    );
    $stmt->execute([$user['id']]);
    json_out(['tracks' => $stmt->fetchAll()]);
}

// --- Like toggelen ---
if ($action === 'toggle' && $method === 'POST') {
    $data = body();
    $trackId = (int)($data['track_id'] ?? 0);

    $stmt = db()->prepare('SELECT 1 FROM likes WHERE user_id = ? AND track_id = ?');
    $stmt->execute([$user['id'], $trackId]);

    if ($stmt->fetch()) {
        $stmt = db()->prepare('DELETE FROM likes WHERE user_id = ? AND track_id = ?');
        $stmt->execute([$user['id'], $trackId]);
        json_out(['liked' => false]);
    } else {
        $stmt = db()->prepare('INSERT INTO likes (user_id, track_id) VALUES (?, ?)');
        $stmt->execute([$user['id'], $trackId]);
        json_out(['liked' => true]);
    }
}

json_error('Onbekende actie', 404);
