<?php
require __DIR__ . '/../config.php';
cors();
start_session();

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

if ($action === 'register' && $method === 'POST') {
    $data = body();
    $email = trim($data['email'] ?? '');
    $password = $data['password'] ?? '';
    $name = trim($data['display_name'] ?? '');

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) json_error('Ongeldig e-mailadres');
    if (strlen($password) < 6) json_error('Wachtwoord moet minstens 6 tekens zijn');
    if ($name === '') json_error('Naam is verplicht');

    $stmt = db()->prepare('SELECT id FROM users LIMIT 1');
    $stmt->execute();
    $isFirstUser = !$stmt->fetch(); // eerste gebruiker wordt automatisch admin

    try {
        $stmt = db()->prepare('INSERT INTO users (email, password_hash, display_name, is_admin) VALUES (?, ?, ?, ?)');
        $stmt->execute([$email, password_hash($password, PASSWORD_DEFAULT), $name, $isFirstUser ? 1 : 0]);
    } catch (PDOException $e) {
        json_error('Dit e-mailadres is al in gebruik', 409);
    }

    $_SESSION['user_id'] = db()->lastInsertId();
    json_out(['user' => current_user()]);
}

if ($action === 'login' && $method === 'POST') {
    $data = body();
    $email = trim($data['email'] ?? '');
    $password = $data['password'] ?? '';

    $stmt = db()->prepare('SELECT * FROM users WHERE email = ?');
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($password, $user['password_hash'])) {
        json_error('E-mail of wachtwoord onjuist', 401);
    }

    $_SESSION['user_id'] = $user['id'];
    json_out(['user' => current_user()]);
}

if ($action === 'logout' && $method === 'POST') {
    $_SESSION = [];
    session_destroy();
    json_out(['ok' => true]);
}

if ($action === 'me' && $method === 'GET') {
    $user = current_user();
    if (!$user) json_error('Niet ingelogd', 401);
    json_out(['user' => $user]);
}

json_error('Onbekende actie', 404);
