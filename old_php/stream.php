<?php
require __DIR__ . '/../config.php';
require_auth(); // moet ingelogd zijn om te mogen streamen

$id = (int)($_GET['id'] ?? 0);
$stmt = db()->prepare('SELECT filename FROM tracks WHERE id = ?');
$stmt->execute([$id]);
$track = $stmt->fetch();
if (!$track) { http_response_code(404); exit; }

$path = UPLOAD_DIR . $track['filename'];
if (!file_exists($path)) { http_response_code(404); exit; }

$size = filesize($path);
$start = 0;
$end = $size - 1;

header('Content-Type: audio/mpeg');
header('Accept-Ranges: bytes');

if (isset($_SERVER['HTTP_RANGE'])) {
    if (preg_match('/bytes=(\d*)-(\d*)/', $_SERVER['HTTP_RANGE'], $m)) {
        if ($m[1] !== '') $start = (int)$m[1];
        if ($m[2] !== '') $end = (int)$m[2];
        http_response_code(206);
        header("Content-Range: bytes $start-$end/$size");
    }
} 

$length = $end - $start + 1;
header("Content-Length: $length");

$fp = fopen($path, 'rb');
fseek($fp, $start);
$bufferSize = 8192;
$bytesLeft = $length;
while ($bytesLeft > 0 && !feof($fp)) {
    $chunk = min($bufferSize, $bytesLeft);
    echo fread($fp, $chunk);
    $bytesLeft -= $chunk;
    flush();
}
fclose($fp);
