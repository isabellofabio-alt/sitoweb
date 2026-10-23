<?php
ob_start(); // scarta eventuali spazi, BOM o avvisi emessi prima della risposta
require __DIR__ . '/config.php';
if (!defined('DEBUG')) define('DEBUG', false);
ini_set('display_errors', '0');
error_reporting(E_ALL);
if (PHP_VERSION_ID >= 70300) {
  session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'httponly' => true, 'samesite' => 'Lax']);
} else {
  session_set_cookie_params(0, '/; samesite=Lax', '', false, true);
}
session_start();
header('X-Content-Type-Options: nosniff');

function db() {
  static $p = null;
  if (!$p) {
    $p = new PDO('mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4', DB_USER, DB_PASS, [
      PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
      PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
      PDO::ATTR_EMULATE_PREPARES => false,
    ]);
  }
  return $p;
}
function out($data, $code = 200) {
  while (ob_get_level() > 0) ob_end_clean();
  http_response_code($code);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode($data, JSON_UNESCAPED_UNICODE);
  exit;
}
function cut($s, $n) { return function_exists('mb_substr') ? mb_substr($s, 0, $n) : substr($s, 0, $n); }
function input() {
  $j = json_decode(file_get_contents('php://input'), true);
  return is_array($j) ? $j : [];
}
function need_admin() {
  if (empty($_SESSION['admin'])) out(['error' => 'Accesso in modifica richiesto.'], 401);
  if (($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'album') out(['error' => 'Richiesta non valida.'], 400);
}

$action = $_GET['action'] ?? '';
$isPost = $_SERVER['REQUEST_METHOD'] === 'POST';

try {
  switch ($action) {
    case 'state':
      $s = db()->query('SELECT n1, n2, since FROM settings WHERE id = 1')->fetch() ?: ['n1' => 'Io', 'n2' => 'Te', 'since' => null];
      $ph = db()->query('SELECT id, cap FROM photos ORDER BY id')->fetchAll();
      out([
        'admin' => !empty($_SESSION['admin']),
        'settings' => ['n1' => $s['n1'], 'n2' => $s['n2'], 'since' => $s['since'] ?: ''],
        'photos' => array_map(function ($r) { return ['id' => (int)$r['id'], 'cap' => $r['cap']]; }, $ph),
      ]);

    case 'check':
      if (!DEBUG) out(['error' => 'Imposta DEBUG a true in config.php per usare il controllo.'], 403);
      $res = [
        'php' => PHP_VERSION,
        'pdo_mysql' => extension_loaded('pdo_mysql'),
        'gd_o_getimagesize' => function_exists('getimagesize'),
        'upload_max_filesize' => ini_get('upload_max_filesize'),
        'post_max_size' => ini_get('post_max_size'),
        'file_uploads' => (bool)ini_get('file_uploads'),
        'sessione_attiva' => session_status() === PHP_SESSION_ACTIVE,
        'admin_loggato' => !empty($_SESSION['admin']),
      ];
      try {
        $t = db()->query("SHOW TABLES")->fetchAll(PDO::FETCH_COLUMN);
        $res['database'] = 'connesso';
        $res['tabelle'] = $t;
        $res['max_allowed_packet'] = (int)db()->query("SELECT @@max_allowed_packet")->fetchColumn();
      } catch (Throwable $e) { $res['database'] = 'ERRORE: ' . $e->getMessage(); }
      out($res);

    case 'image':
      $st = db()->prepare('SELECT mime, data FROM photos WHERE id = ?');
      $st->execute([(int)($_GET['id'] ?? 0)]);
      $r = $st->fetch();
      if (!$r) { http_response_code(404); exit; }
      while (ob_get_level() > 0) ob_end_clean();
      header('Content-Type: ' . $r['mime']);
      header('Cache-Control: public, max-age=31536000, immutable');
      echo $r['data'];
      exit;

    case 'login':
      if (!$isPost) out(['error' => 'Metodo non valido.'], 405);
      $pw = (string)(input()['password'] ?? '');
      if (!hash_equals(ADMIN_PASSWORD, $pw)) { usleep(600000); out(['error' => 'Password errata.'], 401); }
      session_regenerate_id(true);
      $_SESSION['admin'] = true;
      out(['ok' => true]);

    case 'logout':
      $_SESSION = [];
      session_destroy();
      out(['ok' => true]);

    case 'settings':
      need_admin();
      $d = input();
      $n1 = cut(trim((string)($d['n1'] ?? 'Io')), 60) ?: 'Io';
      $n2 = cut(trim((string)($d['n2'] ?? 'Te')), 60) ?: 'Te';
      $since = (string)($d['since'] ?? '');
      $since = preg_match('/^\d{4}-\d{2}-\d{2}$/', $since) ? $since : null;
      db()->prepare('INSERT INTO settings (id, n1, n2, since) VALUES (1, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE n1 = VALUES(n1), n2 = VALUES(n2), since = VALUES(since)')
          ->execute([$n1, $n2, $since]);
      out(['ok' => true]);

    case 'upload':
      need_admin();
      $f = $_FILES['photo'] ?? null;
      if (!$f && (int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) out(['error' => 'La foto supera il limite del server (post_max_size = ' . ini_get('post_max_size') . ').'], 400);
      if (!$f || $f['error'] !== UPLOAD_ERR_OK) {
        $codes = [UPLOAD_ERR_INI_SIZE => 'File troppo grande per il server (upload_max_filesize).', UPLOAD_ERR_FORM_SIZE => 'File troppo grande.', UPLOAD_ERR_NO_FILE => 'Nessun file ricevuto.'];
        out(['error' => $codes[$f['error'] ?? UPLOAD_ERR_NO_FILE] ?? 'Caricamento non riuscito.'], 400);
      }
      if ($f['size'] > 8 * 1024 * 1024) out(['error' => 'La foto supera gli 8 MB.'], 400);
      $info = @getimagesize($f['tmp_name']);
      $mime = $info ? $info['mime'] : '';
      if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp', 'image/gif'], true)) out(['error' => 'Formato non supportato (usa JPG, PNG, WebP o GIF).'], 400);
      $st = db()->prepare('INSERT INTO photos (mime, data) VALUES (?, ?)');
      $st->bindValue(1, $mime);
      $st->bindValue(2, file_get_contents($f['tmp_name']), PDO::PARAM_LOB);
      $st->execute();
      out(['ok' => true, 'id' => (int)db()->lastInsertId()]);

    case 'caption':
      need_admin();
      $d = input();
      db()->prepare('UPDATE photos SET cap = ? WHERE id = ?')
          ->execute([cut((string)($d['cap'] ?? ''), 60), (int)($d['id'] ?? 0)]);
      out(['ok' => true]);

    case 'delete':
      need_admin();
      db()->prepare('DELETE FROM photos WHERE id = ?')->execute([(int)(input()['id'] ?? 0)]);
      out(['ok' => true]);

    default:
      out(['error' => 'Azione sconosciuta.'], 400);
  }
} catch (Throwable $e) {
  out(['error' => DEBUG
    ? 'Errore: ' . $e->getMessage()
    : 'Errore del server o del database. Imposta DEBUG a true in config.php per vedere il dettaglio.'], 500);
}