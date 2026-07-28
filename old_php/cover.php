<?php
require __DIR__ . '/../config.php';
require_auth();

$id = (int)($_GET['id'] ?? 0);
$stmt = db()->prepare('SELECT cover_filename FROM tracks WHERE id = ?');
$stmt->execute([$id]);
$track = $stmt->fetch();

if (!$track || !$track['cover_filename']) { http_response_code(404); exit; }

$path = COVER_DIR . $track['cover_filename'];
if (!file_exists($path)) { http_response_code(404); exit; }

$ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
$mime = ['jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp'][$ext] ?? 'application/octet-stream';
header("Content-Type: $mime");
header('Cache-Control: public, max-age=604800');
readfile($path);
