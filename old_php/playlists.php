<?php
require __DIR__ . '/../config.php';
cors();

$action = $_GET['action'] ?? 'list';
$method = $_SERVER['REQUEST_METHOD'];
$user = require_auth();

// --- Alle playlists van de ingelogde gebruiker ---
if ($action === 'list' && $method === 'GET') {
    $stmt = db()->prepare('SELECT id, name, created_at FROM playlists WHERE user_id = ? ORDER BY created_at DESC');
    $stmt->execute([$user['id']]);
    json_out(['playlists' => $stmt->fetchAll()]);
}

// --- Eén playlist incl. tracks ---
if ($action === 'get' && $method === 'GET') {
    $id = (int)($_GET['id'] ?? 0);
    $stmt = db()->prepare('SELECT id, name, user_id FROM playlists WHERE id = ?');
    $stmt->execute([$id]);
    $playlist = $stmt->fetch();
    if (!$playlist || $playlist['user_id'] != $user['id']) json_error('Niet gevonden', 404);

    $stmt = db()->prepare(
        'SELECT t.id, t.title, t.artist, t.album, t.duration_seconds, t.cover_filename
         FROM playlist_tracks pt
         JOIN tracks t ON t.id = pt.track_id
         WHERE pt.playlist_id = ?
         ORDER BY pt.position ASC'
    );
    $stmt->execute([$id]);
    $playlist['tracks'] = $stmt->fetchAll();
    json_out(['playlist' => $playlist]);
}

// --- Nieuwe playlist aanmaken ---
if ($action === 'create' && $method === 'POST') {
    $data = body();
    $name = trim($data['name'] ?? '');
    if ($name === '') json_error('Naam is verplicht');
    $stmt = db()->prepare('INSERT INTO playlists (user_id, name) VALUES (?, ?)');
    $stmt->execute([$user['id'], $name]);
    json_out(['id' => db()->lastInsertId()]);
}

// --- Playlist hernoemen ---
if ($action === 'rename' && $method === 'POST') {
    $data = body();
    $id = (int)($data['id'] ?? 0);
    $name = trim($data['name'] ?? '');
    $stmt = db()->prepare('UPDATE playlists SET name = ? WHERE id = ? AND user_id = ?');
    $stmt->execute([$name, $id, $user['id']]);
    json_out(['ok' => true]);
}

// --- Playlist verwijderen ---
if ($action === 'delete' && $method === 'POST') {
    $data = body();
    $id = (int)($data['id'] ?? 0);
    $stmt = db()->prepare('DELETE FROM playlists WHERE id = ? AND user_id = ?');
    $stmt->execute([$id, $user['id']]);
    json_out(['ok' => true]);
}

// --- Track toevoegen aan playlist ---
if ($action === 'add_track' && $method === 'POST') {
    $data = body();
    $playlistId = (int)($data['playlist_id'] ?? 0);
    $trackId = (int)($data['track_id'] ?? 0);

    $stmt = db()->prepare('SELECT id FROM playlists WHERE id = ? AND user_id = ?');
    $stmt->execute([$playlistId, $user['id']]);
    if (!$stmt->fetch()) json_error('Playlist niet gevonden', 404);

    $stmt = db()->prepare('SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM playlist_tracks WHERE playlist_id = ?');
    $stmt->execute([$playlistId]);
    $pos = $stmt->fetch()['pos'];

    $stmt = db()->prepare('INSERT IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)');
    $stmt->execute([$playlistId, $trackId, $pos]);
    json_out(['ok' => true]);
}

// --- Track verwijderen uit playlist ---
if ($action === 'remove_track' && $method === 'POST') {
    $data = body();
    $playlistId = (int)($data['playlist_id'] ?? 0);
    $trackId = (int)($data['track_id'] ?? 0);

    $stmt = db()->prepare('SELECT id FROM playlists WHERE id = ? AND user_id = ?');
    $stmt->execute([$playlistId, $user['id']]);
    if (!$stmt->fetch()) json_error('Playlist niet gevonden', 404);

    $stmt = db()->prepare('DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?');
    $stmt->execute([$playlistId, $trackId]);
    json_out(['ok' => true]);
}

json_error('Onbekende actie', 404);
