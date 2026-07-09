<?php
ini_set('session.gc_maxlifetime', 86400); // 24 hours
session_set_cookie_params([
    'lifetime' => 86400, // 24 hours
    'path'     => '/',
    'secure'   => true,
    'httponly' => true,
    'samesite' => 'Strict',
]);
session_start();

if (empty($_SESSION['brand_authed'])) {
    http_response_code(403);
    exit;
}

// Gated assets live under protected/ — a directory the web server MUST NOT serve
// directly (see the nginx `location` rule in deploy/nginx-brand.conf).
// download.php is the ONLY path to these files; readfile() reads them from the
// local filesystem, which is unaffected by the web-server deny rule.
$allowed = [
    'lm-logomark.zip'                   => 'protected/logos/lm-logomark.zip',
    'lm-wordmark.zip'                   => 'protected/logos/lm-wordmark.zip',
    'lm-product-logos.zip'              => 'protected/logos/lm-product-logos.zip',
    'inference-sans.zip'                => 'protected/fonts/inference-sans.zip',
    'object-sans.zip'                   => 'protected/fonts/object-sans.zip',
    'lm-brand-guidelines.pdf'           => 'protected/documents/lm-brand-guidelines.pdf',
    'lm-google-slides-style-guide.pptx' => 'protected/documents/lm-google-slides-style-guide.pptx',
    'lm-brand-skill.md'                 => 'protected/documents/lm-brand-skill.md',
    'lightmatter-colors.ase'            => 'protected/documents/lightmatter-colors.ase',
    'lightmatter-theme.thmx'            => 'protected/documents/lightmatter-theme.thmx',
    'lightmatter-color-reference.html'  => 'protected/documents/lightmatter-color-reference.html',
];

$f = $_GET['f'] ?? '';

// Icon bundle — zip assets/icons/ on the fly so adding an SVG is enough. The
// session check above already gates this endpoint; the icons themselves are
// intentionally public (displayed and individually downloadable from
// index.html, and duplicated in assets/icon-svg-data.js), so there's no
// separate directory to protect here.
if ($f === 'lightmatter-icons.zip') {
    $icons_dir = __DIR__ . '/assets/icons';
    $svgs = glob($icons_dir . '/*.svg');
    if (!$svgs) {
        http_response_code(404);
        exit;
    }
    $zip = new ZipArchive();
    $tmp = tempnam(sys_get_temp_dir(), 'lm-icons-');
    $zip->open($tmp, ZipArchive::CREATE | ZipArchive::OVERWRITE);
    foreach ($svgs as $svg) {
        $zip->addFile($svg, basename($svg));
    }
    $zip->close();
    header('Content-Type: application/zip');
    header('Content-Disposition: attachment; filename="lightmatter-icons.zip"');
    header('Content-Length: ' . filesize($tmp));
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    readfile($tmp);
    unlink($tmp);
    exit;
}

if (!array_key_exists($f, $allowed)) {
    http_response_code(404);
    exit;
}

$path = __DIR__ . '/' . $allowed[$f];

if (!file_exists($path)) {
    http_response_code(404);
    exit;
}

$mime_map = [
    'zip'  => 'application/zip',
    'pdf'  => 'application/pdf',
    'pptx' => 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'thmx' => 'application/vnd.ms-officetheme',
    'ase'  => 'application/octet-stream',
    'html' => 'text/html; charset=utf-8',
    'md'   => 'text/markdown; charset=utf-8',
];
$ext  = strtolower(pathinfo($path, PATHINFO_EXTENSION));
$mime = $mime_map[$ext] ?? 'application/octet-stream';

$view = isset($_GET['mode']) && $_GET['mode'] === 'view';

header('Content-Type: ' . $mime);
if (!$view) {
    header('Content-Disposition: attachment; filename="' . basename($path) . '"');
}
header('Content-Length: ' . filesize($path));
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

readfile($path);
exit;
