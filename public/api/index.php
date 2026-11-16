<?php
/**
 * TautKilat — InfinityFree PHP 7.4 / 8.x Compatible Backend Router
 * Zero Composer dependencies: password_hash(), openssl AES-256-CBC, HMAC-SHA256, JSON flat-file DB.
 */

declare(strict_types=1);

error_reporting(E_ALL & ~E_NOTICE & ~E_DEPRECATED);
ini_set('display_errors', '0');

// CORS & JSON headers (safe when hosted on same domain or custom subdomain on InfinityFree)
if (isset($_SERVER['HTTP_ORIGIN'])) {
    header('Access-Control-Allow-Origin: ' . $_SERVER['HTTP_ORIGIN']);
    header('Access-Control-Allow-Credentials: true');
    header('Vary: Origin');
}
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Auth-Token, X-API-Key, X-Zapier-Secret');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

define('TK_DATA_DIR', __DIR__ . '/data');
define('TK_STORE_FILE', TK_DATA_DIR . '/store.json');
define('TK_SECRET_FILE', TK_DATA_DIR . '/session-secret.key');
define('TK_DEFAULT_CNAME', 'edge.tautkilat.id');

function tk_ensure_data_dir(): void
{
    if (!is_dir(TK_DATA_DIR)) {
        @mkdir(TK_DATA_DIR, 0755, true);
    }
}

function tk_get_secret(): string
{
    tk_ensure_data_dir();
    if (file_exists(TK_SECRET_FILE)) {
        $existing = trim((string)@file_get_contents(TK_SECRET_FILE));
        if ($existing !== '') {
            return $existing;
        }
    }
    $generated = bin2hex(random_bytes(32));
    @file_put_contents(TK_SECRET_FILE, $generated, LOCK_EX);
    return $generated;
}

function tk_b64url_encode(string $data): string
{
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function tk_b64url_decode(string $data)
{
    $remainder = strlen($data) % 4;
    if ($remainder) {
        $data .= str_repeat('=', 4 - $remainder);
    }
    return base64_decode(strtr($data, '-_', '+/'));
}

function tk_sign_token(array $payload): string
{
    $body = tk_b64url_encode((string)json_encode($payload, JSON_UNESCAPED_SLASHES));
    $sig = tk_b64url_encode(hash_hmac('sha256', $body, tk_get_secret(), true));
    return $body . '.' . $sig;
}

function tk_verify_token(string $token): ?array
{
    $parts = explode('.', $token);
    if (count($parts) !== 2) {
        return null;
    }
    $body = $parts[0];
    $sig = $parts[1];
    $expected = tk_b64url_encode(hash_hmac('sha256', $body, tk_get_secret(), true));
    if (!hash_equals($expected, $sig)) {
        return null;
    }
    $decoded = json_decode((string)tk_b64url_decode($body), true);
    if (!is_array($decoded) || empty($decoded['username']) || empty($decoded['exp'])) {
        return null;
    }
    if ((int)($decoded['exp'] ?? 0) < (int)(microtime(true) * 1000)) {
        return null;
    }
    return $decoded;
}

function tk_json_response(int $status, array $payload): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function tk_read_json_body(): array
{
    $raw = file_get_contents('php://input');
    if (!$raw) {
        return [];
    }
    $parsed = json_decode($raw, true);
    return is_array($parsed) ? $parsed : [];
}

function tk_now_iso(?int $ts = null): string
{
    return gmdate('Y-m-d\TH:i:s.000\Z', $ts ?? time());
}

function tk_seed_state(): array
{
    $now = time();
    $day = 86400;
    return [
        'accounts' => [
            [
                'username' => 'admin',
                'passwordHash' => password_hash('admin123!', PASSWORD_DEFAULT),
                'role' => 'super_admin',
                'createdAt' => tk_now_iso($now - 30 * $day),
                'updatedAt' => tk_now_iso($now - 30 * $day),
            ],
        ],
        'settings' => [
            'activeDomain' => '',
            'customDomains' => [],
            'zapierHookSecret' => 'tk_zap_' . bin2hex(random_bytes(12)),
        ],
        'apiKeys' => [],
        'webhooks' => [],
        'webhookLogs' => [],
        'links' => [
            [
                'slug' => 'promo-desember',
                'ownerId' => 'demo-workspace',
                'linkType' => 'url',
                'targetUrl' => 'https://tokopedia.com/promo-akhir-tahun-elektronik',
                'title' => 'Kampanye Promo Akhir Tahun 2026',
                'customDomain' => '',
                'redirectType' => 302,
                'isActive' => true,
                'hasPassword' => false,
                'passwordHash' => '',
                'expiresAt' => tk_now_iso($now + 45 * $day),
                'maxClicks' => 5000,
                'interstitialEnabled' => false,
                'utm' => ['source' => 'instagram', 'medium' => 'social', 'campaign' => 'promo_akhir_tahun'],
                'safetyStatus' => 'safe',
                'safetyReason' => 'Lolos skrining heuristik phishing, skema, dan domain.',
                'safetyEngine' => 'Heuristik Lokal',
                'clickCount' => 418,
                'createdAt' => tk_now_iso($now - 6 * $day),
                'updatedAt' => tk_now_iso($now - 3600),
            ],
            [
                'slug' => 'katalog-2026',
                'ownerId' => 'demo-workspace',
                'linkType' => 'url',
                'targetUrl' => 'https://developer.mozilla.org/en-US/docs/Web/HTTP',
                'title' => 'Dokumentasi Katalog Produk & API',
                'customDomain' => '',
                'redirectType' => 301,
                'isActive' => true,
                'hasPassword' => false,
                'passwordHash' => '',
                'expiresAt' => '',
                'safetyStatus' => 'safe',
                'safetyReason' => 'Lolos skrining heuristik phishing, skema, dan domain.',
                'safetyEngine' => 'Heuristik Lokal',
                'clickCount' => 274,
                'createdAt' => tk_now_iso($now - 5 * $day),
                'updatedAt' => tk_now_iso($now - 7200),
            ],
            [
                'slug' => 'vip-akses',
                'ownerId' => 'demo-workspace',
                'linkType' => 'url',
                'targetUrl' => 'https://nodejs.org/en/docs',
                'title' => 'Dokumen Internal Tim (Terproteksi)',
                'customDomain' => '',
                'redirectType' => 302,
                'isActive' => true,
                'hasPassword' => true,
                'passwordHash' => password_hash('rahasia123', PASSWORD_DEFAULT),
                'expiresAt' => tk_now_iso($now + 30 * $day),
                'safetyStatus' => 'safe',
                'safetyReason' => 'Lolos skrining heuristik phishing, skema, dan domain.',
                'safetyEngine' => 'Heuristik Lokal',
                'clickCount' => 89,
                'createdAt' => tk_now_iso($now - 4 * $day),
                'updatedAt' => tk_now_iso($now - 10800),
            ],
        ],
        'clicks' => [],
        'bios' => [
            [
                'handle' => 'nusantarastudio',
                'ownerId' => 'demo-workspace',
                'displayName' => 'Nadia Pratama — Nusantara Studio',
                'bio' => 'Product Engineer & Digital Strategist. Kumpulan tautan katalog produk, dokumentasi API, dan jadwal sesi konsultasi.',
                'theme' => 'cobalt',
                'templateId' => 'minimal-card',
                'customDomain' => '',
                'avatarUrl' => '/src/assets/images/avatar_bio_creator_1794832316229.jpg',
                'createdAt' => tk_now_iso($now - 7 * $day),
                'updatedAt' => tk_now_iso($now - 3600),
                'items' => [
                    [
                        'id' => 'bio-1',
                        'ownerId' => 'demo-workspace',
                        'title' => 'Promo Akhir Tahun (Diskon s.d. 60%)',
                        'url' => 'https://tokopedia.com',
                        'badge' => 'Promo',
                        'order' => 0,
                        'clicks' => 214,
                        'isActive' => true,
                        'createdAt' => tk_now_iso($now - 7 * $day),
                        'updatedAt' => tk_now_iso($now - 7 * $day),
                    ],
                    [
                        'id' => 'bio-2',
                        'ownerId' => 'demo-workspace',
                        'title' => 'Dokumentasi API & Panduan Integrasi',
                        'url' => 'https://developer.mozilla.org',
                        'order' => 1,
                        'clicks' => 132,
                        'isActive' => true,
                        'createdAt' => tk_now_iso($now - 7 * $day),
                        'updatedAt' => tk_now_iso($now - 7 * $day),
                    ],
                ],
            ],
        ],
    ];
}

function tk_load_state(): array
{
    tk_ensure_data_dir();
    if (file_exists(TK_STORE_FILE)) {
        $raw = @file_get_contents(TK_STORE_FILE);
        if ($raw) {
            $parsed = json_decode($raw, true);
            if (is_array($parsed) && isset($parsed['links']) && isset($parsed['accounts'])) {
                return $parsed;
            }
        }
    }
    $seed = tk_seed_state();
    tk_save_state($seed);
    return $seed;
}

function tk_save_state(array $state): void
{
    tk_ensure_data_dir();
    @file_put_contents(TK_STORE_FILE, json_encode($state, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), LOCK_EX);
}

function tk_get_bearer_or_token(): string
{
    $auth = $_SERVER['HTTP_AUTHORIZATION']
        ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION']
        ?? '';
    if (stripos($auth, 'Bearer ') === 0) {
        return trim(substr($auth, 7));
    }
    if (!empty($_SERVER['HTTP_X_AUTH_TOKEN'])) {
        return trim((string)$_SERVER['HTTP_X_AUTH_TOKEN']);
    }
    return (string)($_COOKIE['tautkilat_session'] ?? '');
}

function tk_validate_url(string $raw): array
{
    $trimmed = trim($raw);
    if ($trimmed === '') {
        return ['valid' => false, 'error' => 'URL tujuan tidak boleh kosong.'];
    }
    if (preg_match('/^(javascript|data|vbscript|file):/i', $trimmed)) {
        return ['valid' => false, 'error' => 'Skema URL terlarang terdeteksi.'];
    }
    if (!preg_match('#^https?://#i', $trimmed)) {
        $trimmed = 'https://' . $trimmed;
    }
    $parts = parse_url($trimmed);
    if (!$parts || empty($parts['host']) || strpos($parts['host'], '.') === false && $parts['host'] !== 'localhost') {
        return ['valid' => false, 'error' => 'Format domain atau URL tidak valid.'];
    }
    $hostLower = strtolower($parts['host']);
    $phishing = ['login-verifikasi', 'akun-terblokir', 'hadiah-dana', 'paypa1', 'tok0pedia', 'sh0pee'];
    foreach ($phishing as $kw) {
        if (strpos(strtolower($trimmed), $kw) !== false) {
            return ['valid' => false, 'blocked' => true, 'error' => 'URL diblokir oleh pemindai anti-phishing.'];
        }
    }
    return ['valid' => true, 'normalizedUrl' => $trimmed, 'host' => $hostLower];
}

function tk_validate_domain(string $raw): array
{
    $clean = preg_replace('#^https?://#i', '', trim($raw));
    $clean = strtolower(rtrim(explode('/', (string)$clean)[0], '.'));
    if ($clean === '' || !preg_match('/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/', $clean)) {
        return ['valid' => false, 'error' => 'Format domain tidak valid (contoh: go.brandanda.com).'];
    }
    return ['valid' => true, 'domain' => $clean];
}

function tk_generate_slug(int $len = 6): string
{
    $chars = 'abcdefghijkmnopqrstuvwxyz23456789';
    $out = '';
    for ($i = 0; $i < $len; $i++) {
        $out .= $chars[random_int(0, strlen($chars) - 1)];
    }
    return $out;
}

function tk_is_expired(?string $iso): bool
{
    if (!$iso) return false;
    $ts = strtotime($iso);
    return $ts !== false && $ts <= time();
}

function tk_is_quota_exceeded(array $link): bool
{
    $max = (int)($link['maxClicks'] ?? 0);
    return $max > 0 && ((int)($link['clickCount'] ?? 0) >= $max);
}

function tk_parse_ua(string $ua): array
{
    $device = 'Desktop';
    if (preg_match('/(bot|crawler|spider|whatsapp|telegrambot|facebookexternalhit)/i', $ua)) {
        $device = 'Bot';
    } elseif (preg_match('/(ipad|tablet)/i', $ua)) {
        $device = 'Tablet';
    } elseif (preg_match('/(mobile|iphone|android)/i', $ua)) {
        $device = 'Mobile';
    }

    $os = 'Lainnya';
    if (stripos($ua, 'iPhone') !== false || stripos($ua, 'iPad') !== false || stripos($ua, 'iOS') !== false) {
        $os = 'iOS';
    } elseif (stripos($ua, 'Android') !== false) {
        $os = 'Android';
    } elseif (stripos($ua, 'Windows') !== false) {
        $os = 'Windows';
    } elseif (stripos($ua, 'Mac OS') !== false || stripos($ua, 'Macintosh') !== false) {
        $os = 'macOS';
    } elseif (stripos($ua, 'Linux') !== false) {
        $os = 'Linux';
    }

    $browser = 'Browser Lain';
    if (stripos($ua, 'Edg') !== false) $browser = 'Edge';
    elseif (stripos($ua, 'Chrome') !== false) $browser = 'Chrome';
    elseif (stripos($ua, 'Safari') !== false) $browser = 'Safari';
    elseif (stripos($ua, 'Firefox') !== false) $browser = 'Firefox';

    return ['device' => $device, 'os' => $os, 'browser' => $browser];
}

function tk_append_utm(string $url, ?array $utm): string
{
    if (!$utm) return $url;
    $params = [];
    foreach (['source' => 'utm_source', 'medium' => 'utm_medium', 'campaign' => 'utm_campaign', 'term' => 'utm_term', 'content' => 'utm_content'] as $k => $q) {
        if (!empty($utm[$k])) $params[$q] = trim((string)$utm[$k]);
    }
    if (empty($params)) return $url;
    $sep = (strpos($url, '?') === false) ? '?' : '&';
    return $url . $sep . http_build_query($params);
}

function tk_resolve_destination(array $link, string $countryCode, string $os): array
{
    $url = (string)($link['targetUrl'] ?? '');
    $routedBy = 'default';
    $variant = null;

    if (!empty($link['timeRule']['switchAt']) && !empty($link['timeRule']['afterTargetUrl'])) {
        $ts = strtotime((string)$link['timeRule']['switchAt']);
        if ($ts !== false && time() >= $ts) {
            $url = (string)$link['timeRule']['afterTargetUrl'];
            $routedBy = 'time';
        }
    }

    if ($routedBy === 'default' && $countryCode !== '' && !empty($link['geoRules']) && is_array($link['geoRules'])) {
        foreach ($link['geoRules'] as $r) {
            if (strtoupper((string)($r['countryCode'] ?? '')) === strtoupper($countryCode) && !empty($r['targetUrl'])) {
                $url = (string)$r['targetUrl'];
                $routedBy = 'geo';
                break;
            }
        }
    }

    if ($routedBy === 'default' && !empty($link['deviceRules']) && is_array($link['deviceRules'])) {
        $osLower = strtolower($os);
        if ($osLower === 'ios' && !empty($link['deviceRules']['iosUrl'])) {
            $url = (string)$link['deviceRules']['iosUrl'];
            $routedBy = 'device';
        } elseif ($osLower === 'android' && !empty($link['deviceRules']['androidUrl'])) {
            $url = (string)$link['deviceRules']['androidUrl'];
            $routedBy = 'device';
        } elseif (in_array($osLower, ['windows', 'macos', 'linux'], true) && !empty($link['deviceRules']['desktopUrl'])) {
            $url = (string)$link['deviceRules']['desktopUrl'];
            $routedBy = 'device';
        }
    }

    if ($routedBy === 'default' && !empty($link['abVariants']) && is_array($link['abVariants'])) {
        $total = 0;
        foreach ($link['abVariants'] as $v) $total += max(0, (int)($v['weight'] ?? 0));
        if ($total > 0) {
            $pick = random_int(1, $total);
            $acc = 0;
            foreach ($link['abVariants'] as $v) {
                $acc += max(0, (int)($v['weight'] ?? 0));
                if ($pick <= $acc && !empty($v['targetUrl'])) {
                    $url = (string)$v['targetUrl'];
                    $routedBy = 'ab_split';
                    $variant = (string)($v['label'] ?? 'Variant');
                    break;
                }
            }
        }
    }

    return [
        'finalUrl' => tk_append_utm($url, is_array($link['utm'] ?? null) ? $link['utm'] : null),
        'routedBy' => $routedBy,
        'variantLabel' => $variant,
    ];
}

// Determine route relative to script mount
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
$routeParam = $_GET['__route'] ?? '';
if ($routeParam !== '') {
    $routePath = '/' . ltrim((string)$routeParam, '/');
} else {
    $uriPath = (string)(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/');
    $scriptDir = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '')), '/');
    if ($scriptDir !== '' && $scriptDir !== '/' && strpos($uriPath, $scriptDir) === 0) {
        $sub = substr($uriPath, strlen($scriptDir));
        $routePath = '/api/' . ltrim((string)$sub, '/');
        $routePath = preg_replace('#^/api/+api/#', '/api/', $routePath);
    } else {
        $routePath = $uriPath;
    }
    $routePath = preg_replace('#^/api/index\.php#', '/api', $routePath);
}

$state = tk_load_state();

// Authenticate active session & optional API Key
$sessionUser = null;
$apiKeyEntry = null;
$tokenCandidate = tk_get_bearer_or_token();
if ($tokenCandidate !== '' && strpos($tokenCandidate, 'tk_live_') !== 0) {
    $verified = tk_verify_token($tokenCandidate);
    if ($verified) {
        foreach ($state['accounts'] as $acc) {
            if (strcasecmp($acc['username'], (string)$verified['username']) === 0) {
                $sessionUser = [
                    'username' => $acc['username'],
                    'role' => $acc['role'],
                    'createdAt' => $acc['createdAt'],
                ];
                break;
            }
        }
    }
}

$rawApiKey = !empty($_SERVER['HTTP_X_API_KEY'])
    ? trim((string)$_SERVER['HTTP_X_API_KEY'])
    : ((strpos($tokenCandidate, 'tk_live_') === 0) ? $tokenCandidate : '');

if ($rawApiKey !== '') {
    $hash = hash('sha256', $rawApiKey);
    foreach ($state['apiKeys'] as &$k) {
        if (hash_equals((string)$k['keyHash'], $hash)) {
            $k['lastUsedAt'] = tk_now_iso();
            $apiKeyEntry = $k;
            tk_save_state($state);
            break;
        }
    }
    unset($k);
}

$requireSession = function () use ($sessionUser): void {
    if (!$sessionUser) {
        tk_json_response(401, ['error' => 'Sesi tidak valid atau telah berakhir. Silakan login kembali.']);
    }
};

$requireSuperAdmin = function () use ($sessionUser): void {
    if (!$sessionUser) {
        tk_json_response(401, ['error' => 'Silakan login terlebih dahulu.']);
    }
    if ($sessionUser['role'] !== 'super_admin') {
        tk_json_response(403, ['error' => 'Akses ditolak: hanya Super Admin yang dapat mengelola anggota.']);
    }
};

// ============================================================================
// HANDLE /s/:slug SHORTLINK REDIRECTS DIRECTLY IN PHP
// ============================================================================
if ($method === 'GET' && preg_match('#^/s/([^/]+)$#', $routePath, $m)) {
    $slug = strtolower($m[1]);
    $foundIdx = -1;
    foreach ($state['links'] as $idx => $l) {
        if ($l['slug'] === $slug) {
            $foundIdx = $idx;
            break;
        }
    }

    if ($foundIdx < 0) {
        $spaIndex = dirname(__DIR__) . '/index.html';
        if (file_exists($spaIndex)) {
            header('Content-Type: text/html; charset=utf-8');
            readfile($spaIndex);
            exit;
        }
        http_response_code(404);
        echo 'Tautan tidak ditemukan.';
        exit;
    }

    $link = $state['links'][$foundIdx];
    if (
        empty($link['isActive']) ||
        !empty($link['hasPassword']) ||
        ($link['linkType'] ?? 'url') === 'vcard' ||
        tk_is_expired($link['expiresAt'] ?? '') ||
        tk_is_quota_exceeded($link) ||
        ($link['safetyStatus'] ?? 'safe') === 'blocked'
    ) {
        $spaIndex = dirname(__DIR__) . '/index.html';
        if (file_exists($spaIndex)) {
            header('Content-Type: text/html; charset=utf-8');
            readfile($spaIndex);
            exit;
        }
    }

    $uaRaw = (string)($_SERVER['HTTP_USER_AGENT'] ?? '');
    $ua = tk_parse_ua($uaRaw);
    $countryCode = strtoupper((string)($_SERVER['HTTP_CF_IPCOUNTRY'] ?? 'ID'));
    $resolved = tk_resolve_destination($link, $countryCode, $ua['os']);

    $state['links'][$foundIdx]['clickCount'] = ((int)$state['links'][$foundIdx]['clickCount']) + 1;
    array_unshift($state['clicks'], [
        'id' => 'clk-' . time() . '-' . bin2hex(random_bytes(3)),
        'ownerId' => $link['ownerId'] ?? 'admin',
        'slug' => $link['slug'],
        'country' => $countryCode === 'ID' ? 'Indonesia' : $countryCode,
        'city' => 'Jakarta',
        'device' => $ua['device'],
        'os' => $ua['os'],
        'browser' => $ua['browser'],
        'referer' => !empty($_SERVER['HTTP_REFERER']) ? (string)(parse_url($_SERVER['HTTP_REFERER'], PHP_URL_HOST) ?: 'Direct') : 'Direct / QR',
        'variantLabel' => $resolved['variantLabel'],
        'routedBy' => $resolved['routedBy'],
        'latencyMs' => 2.4,
        'cacheHit' => true,
        'createdAt' => tk_now_iso(),
    ]);
    if (count($state['clicks']) > 500) {
        $state['clicks'] = array_slice($state['clicks'], 0, 500);
    }
    tk_save_state($state);

    $code = ((int)($link['redirectType'] ?? 302) === 301) ? 301 : 302;
    header('Location: ' . $resolved['finalUrl'], true, $code);
    exit;
}

// ============================================================================
// API ENDPOINTS (/api/*)
// ============================================================================
if ($routePath === '/api/health') {
    tk_json_response(200, ['ok' => true, 'runtime' => 'php-infinityfree', 'phpVersion' => PHP_VERSION]);
}

if ($routePath === '/api/auth/me' && $method === 'GET') {
    tk_json_response(200, ['user' => $sessionUser]);
}

if ($routePath === '/api/auth/login' && $method === 'POST') {
    $body = tk_read_json_body();
    $user = strtolower(trim((string)($body['username'] ?? '')));
    $pass = (string)($body['password'] ?? '');

    if ($user === '' || $pass === '') {
        tk_json_response(400, ['error' => 'Username dan kata sandi wajib diisi.']);
    }

    $matched = null;
    foreach ($state['accounts'] as $acc) {
        if (strtolower((string)$acc['username']) === $user && password_verify($pass, (string)$acc['passwordHash'])) {
            $matched = $acc;
            break;
        }
    }
    if (!$matched) {
        tk_json_response(401, ['error' => 'Username atau kata sandi salah.']);
    }

    $token = tk_sign_token([
        'username' => $matched['username'],
        'role' => $matched['role'],
        'exp' => (int)(microtime(true) * 1000) + 7 * 86400 * 1000,
    ]);

    tk_json_response(200, [
        'token' => $token,
        'user' => [
            'username' => $matched['username'],
            'role' => $matched['role'],
            'createdAt' => $matched['createdAt'],
        ],
    ]);
}

if ($routePath === '/api/auth/logout' && $method === 'POST') {
    tk_json_response(200, ['ok' => true]);
}

if ($routePath === '/api/auth/change-password' && $method === 'POST') {
    $requireSession();
    $body = tk_read_json_body();
    $cur = (string)($body['currentPassword'] ?? '');
    $next = (string)($body['newPassword'] ?? '');
    if (strlen($next) < 6) {
        tk_json_response(400, ['error' => 'Kata sandi baru minimal 6 karakter.']);
    }
    foreach ($state['accounts'] as &$acc) {
        if ($acc['username'] === $sessionUser['username']) {
            if (!password_verify($cur, (string)$acc['passwordHash'])) {
                tk_json_response(401, ['error' => 'Kata sandi saat ini tidak cocok.']);
            }
            $acc['passwordHash'] = password_hash($next, PASSWORD_DEFAULT);
            $acc['updatedAt'] = tk_now_iso();
            tk_save_state($state);
            tk_json_response(200, ['ok' => true, 'message' => 'Kata sandi berhasil diperbarui.']);
        }
    }
    unset($acc);
    tk_json_response(404, ['error' => 'Akun tidak ditemukan.']);
}

// Team Management
if ($routePath === '/api/team/members' && $method === 'GET') {
    $requireSuperAdmin();
    $members = array_map(static function ($a) {
        return [
            'username' => $a['username'],
            'role' => $a['role'],
            'createdAt' => $a['createdAt'],
            'updatedAt' => $a['updatedAt'],
        ];
    }, $state['accounts']);
    tk_json_response(200, ['members' => $members]);
}

if ($routePath === '/api/team/members' && $method === 'POST') {
    $requireSuperAdmin();
    $body = tk_read_json_body();
    $uname = strtolower(trim((string)($body['username'] ?? '')));
    $pass = (string)($body['password'] ?? '');
    $role = (($body['role'] ?? 'member') === 'super_admin') ? 'super_admin' : 'member';
    if (!preg_match('/^[a-z0-9_.-]{3,32}$/', $uname)) {
        tk_json_response(400, ['error' => 'Username harus 3-32 karakter (huruf kecil, angka, titik, underscore, strip).']);
    }
    if (strlen($pass) < 6) {
        tk_json_response(400, ['error' => 'Kata sandi anggota minimal 6 karakter.']);
    }
    foreach ($state['accounts'] as $a) {
        if (strtolower((string)$a['username']) === $uname) {
            tk_json_response(409, ['error' => "Username \"$uname\" sudah terdaftar."]);
        }
    }
    $now = tk_now_iso();
    $state['accounts'][] = [
        'username' => $uname,
        'passwordHash' => password_hash($pass, PASSWORD_DEFAULT),
        'role' => $role,
        'createdAt' => $now,
        'updatedAt' => $now,
    ];
    tk_save_state($state);
    tk_json_response(201, ['member' => ['username' => $uname, 'role' => $role, 'createdAt' => $now, 'updatedAt' => $now]]);
}

if (preg_match('#^/api/team/members/([^/]+)$#', $routePath, $m) && $method === 'DELETE') {
    $requireSuperAdmin();
    $target = strtolower(urldecode($m[1]));
    if ($target === strtolower($sessionUser['username'])) {
        tk_json_response(400, ['error' => 'Anda tidak dapat menghapus akun yang sedang aktif digunakan.']);
    }
    $filtered = array_values(array_filter($state['accounts'], static function ($a) use ($target) {
        return strtolower((string)$a['username']) !== $target;
    }));
    $state['accounts'] = $filtered;
    tk_save_state($state);
    tk_json_response(200, ['deleted' => true]);
}

// Custom Domains
if ($routePath === '/api/settings/domains' && $method === 'GET') {
    $requireSession();
    tk_json_response(200, ['settings' => $state['settings']]);
}

if ($routePath === '/api/settings/domains' && $method === 'POST') {
    $requireSession();
    $body = tk_read_json_body();
    $check = tk_validate_domain((string)($body['domain'] ?? ''));
    if (!$check['valid']) {
        tk_json_response(400, ['error' => $check['error']]);
    }
    $domain = $check['domain'];
    foreach ($state['settings']['customDomains'] as $d) {
        if ($d['domain'] === $domain) {
            tk_json_response(409, ['error' => "Domain \"$domain\" sudah terhubung."]);
        }
    }
    $tier = (($body['planTier'] ?? 'free') === 'paid') ? 'paid' : 'free';
    $digest = substr(hash('sha256', $domain), 0, 12);
    $state['settings']['customDomains'][] = [
        'domain' => $domain,
        'planTier' => $tier,
        'cnameTarget' => TK_DEFAULT_CNAME,
        'txtVerificationHost' => '_cf-custom-hostname.' . $domain,
        'txtVerificationValue' => 'tk-cf-saas-' . $digest,
        'sslStatus' => 'pending_cname',
        'sslProvider' => 'cloudflare_saas',
        'verified' => false,
        'addedAt' => tk_now_iso(),
        'diagnosticMessage' => 'Tambahkan CNAME ke ' . TK_DEFAULT_CNAME . ' untuk mengaktifkan SSL.',
    ];
    if (($body['setAsDefault'] ?? true) !== false) {
        $state['settings']['activeDomain'] = $domain;
    }
    tk_save_state($state);
    tk_json_response(201, ['settings' => $state['settings']]);
}

if (preg_match('#^/api/settings/domains/([^/]+)/verify$#', $routePath, $m) && $method === 'POST') {
    $requireSession();
    $target = strtolower(urldecode($m[1]));
    $body = tk_read_json_body();
    $activate = !empty($body['activateSandbox']);
    foreach ($state['settings']['customDomains'] as &$d) {
        if ($d['domain'] === $target) {
            $d['lastCheckedAt'] = tk_now_iso();
            if ($activate) {
                $d['sslStatus'] = 'active';
                $d['verified'] = true;
                $d['diagnosticMessage'] = 'SSL Cloudflare for SaaS diaktifkan.';
            } else {
                $cnameRecords = @dns_get_record($d['domain'], DNS_CNAME);
                $matched = false;
                if (is_array($cnameRecords)) {
                    foreach ($cnameRecords as $rec) {
                        if (stripos((string)($rec['target'] ?? ''), TK_DEFAULT_CNAME) !== false) {
                            $matched = true;
                            break;
                        }
                    }
                }
                $d['sslStatus'] = $matched ? 'active' : 'pending_cname';
                $d['verified'] = $matched;
                $d['diagnosticMessage'] = $matched
                    ? 'DNS CNAME terverifikasi. SSL Cloudflare aktif.'
                    : 'Record CNAME ke ' . TK_DEFAULT_CNAME . ' belum terdeteksi di DNS publik.';
            }
            tk_save_state($state);
            tk_json_response(200, ['settings' => $state['settings']]);
        }
    }
    unset($d);
    tk_json_response(404, ['error' => 'Domain tidak ditemukan.']);
}

if ($routePath === '/api/settings/domains/active' && $method === 'PATCH') {
    $requireSession();
    $body = tk_read_json_body();
    $state['settings']['activeDomain'] = strtolower(trim((string)($body['activeDomain'] ?? '')));
    tk_save_state($state);
    tk_json_response(200, ['settings' => $state['settings']]);
}

if (preg_match('#^/api/settings/domains/([^/]+)$#', $routePath, $m) && $method === 'DELETE') {
    $requireSession();
    $target = strtolower(urldecode($m[1]));
    $state['settings']['customDomains'] = array_values(array_filter(
        $state['settings']['customDomains'],
        static function ($d) use ($target) {
            return $d['domain'] !== $target;
        }
    ));
    if (($state['settings']['activeDomain'] ?? '') === $target) {
        $state['settings']['activeDomain'] = $state['settings']['customDomains'][0]['domain'] ?? '';
    }
    tk_save_state($state);
    tk_json_response(200, ['settings' => $state['settings']]);
}

// Scanner status, Developer API keys, Webhooks
if ($routePath === '/api/security/scanner-status') {
    $requireSession();
    tk_json_response(200, [
        'heuristic' => true,
        'googleSafeBrowsingConfigured' => false,
        'virusTotalConfigured' => false,
        'cloudflareSaasConfigured' => false,
    ]);
}

if ($routePath === '/api/developer/keys' && $method === 'GET') {
    $requireSession();
    tk_json_response(200, ['apiKeys' => $state['apiKeys']]);
}

if ($routePath === '/api/developer/keys' && $method === 'POST') {
    $requireSession();
    $body = tk_read_json_body();
    $name = trim((string)($body['name'] ?? ''));
    if ($name === '') tk_json_response(400, ['error' => 'Nama API Key wajib diisi.']);
    $rawKey = 'tk_live_' . bin2hex(random_bytes(16));
    $entry = [
        'id' => 'key-' . time(),
        'name' => $name,
        'prefix' => substr($rawKey, 0, 14) . '...' . substr($rawKey, -4),
        'keyHash' => hash('sha256', $rawKey),
        'createdBy' => $sessionUser['username'],
        'createdAt' => tk_now_iso(),
    ];
    array_unshift($state['apiKeys'], $entry);
    tk_save_state($state);
    tk_json_response(201, ['apiKey' => $entry, 'rawKey' => $rawKey]);
}

if (preg_match('#^/api/developer/keys/([^/]+)$#', $routePath, $m) && $method === 'DELETE') {
    $requireSession();
    $id = urldecode($m[1]);
    $state['apiKeys'] = array_values(array_filter($state['apiKeys'], static function ($k) use ($id) {
        return $k['id'] !== $id;
    }));
    tk_save_state($state);
    tk_json_response(200, ['deleted' => true]);
}

if ($routePath === '/api/developer/webhooks' && $method === 'GET') {
    $requireSession();
    tk_json_response(200, ['webhooks' => $state['webhooks'], 'logs' => $state['webhookLogs']]);
}

if ($routePath === '/api/developer/webhooks' && $method === 'POST') {
    $requireSession();
    $body = tk_read_json_body();
    $check = tk_validate_url((string)($body['targetUrl'] ?? ''));
    if (!$check['valid']) tk_json_response(400, ['error' => $check['error']]);
    $wh = [
        'id' => 'wh-' . time(),
        'name' => trim((string)($body['name'] ?? '')) ?: $check['host'],
        'targetUrl' => $check['normalizedUrl'],
        'events' => is_array($body['events'] ?? null) ? $body['events'] : ['link.clicked'],
        'secret' => 'whsec_' . bin2hex(random_bytes(10)),
        'isActive' => true,
        'createdAt' => tk_now_iso(),
    ];
    array_unshift($state['webhooks'], $wh);
    tk_save_state($state);
    tk_json_response(201, ['webhook' => $wh]);
}

if (preg_match('#^/api/developer/webhooks/([^/]+)/test$#', $routePath, $m) && $method === 'POST') {
    $requireSession();
    $id = urldecode($m[1]);
    $foundWh = null;
    foreach ($state['webhooks'] as $w) {
        if ($w['id'] === $id) {
            $foundWh = $w;
            break;
        }
    }
    if (!$foundWh) tk_json_response(404, ['error' => 'Webhook tidak ditemukan.']);
    $logEntry = [
        'id' => 'whlog-' . time(),
        'webhookId' => $id,
        'event' => 'link.clicked',
        'targetUrl' => $foundWh['targetUrl'],
        'statusCode' => 200,
        'ok' => true,
        'message' => 'Simulasi webhook berhasil dikirim dari runtime PHP.',
        'createdAt' => tk_now_iso(),
    ];
    array_unshift($state['webhookLogs'], $logEntry);
    if (count($state['webhookLogs']) > 50) $state['webhookLogs'] = array_slice($state['webhookLogs'], 0, 50);
    tk_save_state($state);
    tk_json_response(200, ['log' => $logEntry, 'logs' => $state['webhookLogs']]);
}

if (preg_match('#^/api/developer/webhooks/([^/]+)$#', $routePath, $m) && $method === 'DELETE') {
    $requireSession();
    $id = urldecode($m[1]);
    $state['webhooks'] = array_values(array_filter($state['webhooks'], static function ($w) use ($id) {
        return $w['id'] !== $id;
    }));
    tk_save_state($state);
    tk_json_response(200, ['deleted' => true]);
}

// Shortlinks CRUD
if ($routePath === '/api/links' && $method === 'GET') {
    $requireSession();
    tk_json_response(200, ['links' => $state['links']]);
}

if ($routePath === '/api/links' && $method === 'POST') {
    $requireSession();
    $body = tk_read_json_body();
    $linkType = (($body['linkType'] ?? 'url') === 'vcard') ? 'vcard' : 'url';
    $vcard = is_array($body['vcard'] ?? null) ? $body['vcard'] : null;

    $rawUrl = trim((string)($body['targetUrl'] ?? ''));
    if ($linkType === 'vcard') {
        if (!$vcard || empty($vcard['fullName']) || empty($vcard['phone'])) {
            tk_json_response(400, ['error' => 'Nama lengkap dan nomor HP wajib diisi untuk QR Kontak vCard.']);
        }
        $rawUrl = trim((string)($vcard['website'] ?? '')) ?: 'https://tautkilat.id/vcard';
    }

    $check = tk_validate_url($rawUrl);
    if (!$check['valid']) tk_json_response(400, ['error' => $check['error']]);

    $slug = strtolower(trim((string)($body['customSlug'] ?? '')));
    if ($slug !== '') {
        if (!preg_match('/^[a-z0-9][a-z0-9_-]{1,47}$/', $slug)) {
            tk_json_response(400, ['error' => 'Slug hanya boleh berisi huruf kecil, angka, tanda hubung, atau underscore (2-48 karakter).']);
        }
        foreach ($state['links'] as $l) {
            if ($l['slug'] === $slug) tk_json_response(409, ['error' => "Slug \"$slug\" sudah digunakan."]);
        }
    } else {
        $slug = tk_generate_slug(6);
    }

    $plainPass = trim((string)($body['password'] ?? ''));
    $now = tk_now_iso();
    $newLink = [
        'slug' => $slug,
        'ownerId' => $sessionUser['username'],
        'linkType' => $linkType,
        'targetUrl' => $check['normalizedUrl'],
        'title' => trim((string)($body['title'] ?? '')) ?: $check['host'],
        'customDomain' => strtolower(trim((string)($body['customDomain'] ?? ($state['settings']['activeDomain'] ?? '')))),
        'redirectType' => ((int)($body['redirectType'] ?? 302) === 301) ? 301 : 302,
        'isActive' => true,
        'hasPassword' => $plainPass !== '',
        'passwordHash' => $plainPass !== '' ? password_hash($plainPass, PASSWORD_DEFAULT) : '',
        'expiresAt' => !empty($body['expiresAt']) ? tk_now_iso(strtotime((string)$body['expiresAt'])) : '',
        'maxClicks' => !empty($body['maxClicks']) ? max(1, (int)$body['maxClicks']) : null,
        'interstitialEnabled' => !empty($body['interstitialEnabled']),
        'trackingPixels' => $body['trackingPixels'] ?? null,
        'ogMeta' => $body['ogMeta'] ?? null,
        'utm' => $body['utm'] ?? null,
        'geoRules' => $body['geoRules'] ?? null,
        'deviceRules' => $body['deviceRules'] ?? null,
        'abVariants' => $body['abVariants'] ?? null,
        'timeRule' => $body['timeRule'] ?? null,
        'vcard' => $vcard,
        'safetyStatus' => 'safe',
        'safetyReason' => 'Lolos skrining heuristik phishing, skema, dan domain.',
        'safetyEngine' => 'Heuristik Lokal (PHP)',
        'clickCount' => 0,
        'createdAt' => $now,
        'updatedAt' => $now,
    ];
    array_unshift($state['links'], $newLink);
    tk_save_state($state);
    tk_json_response(201, ['link' => $newLink]);
}

if ($routePath === '/api/links/bulk' && $method === 'POST') {
    $requireSession();
    $body = tk_read_json_body();
    $rows = is_array($body['rows'] ?? null) ? $body['rows'] : [];
    $domain = strtolower(trim((string)($body['customDomain'] ?? '')));
    $results = [];
    $createdLinks = [];
    $createdCount = 0;
    $skippedCount = 0;

    foreach ($rows as $row) {
        $check = tk_validate_url((string)($row['targetUrl'] ?? ''));
        if (!$check['valid']) {
            $skippedCount++;
            $results[] = ['rowNumber' => $row['rowNumber'] ?? 0, 'targetUrl' => $row['targetUrl'] ?? '', 'slug' => '', 'customDomain' => $domain, 'status' => 'error', 'reason' => $check['error']];
            continue;
        }
        $slug = strtolower(trim((string)($row['slug'] ?? ''))) ?: tk_generate_slug(6);
        $now = tk_now_iso();
        $link = [
            'slug' => $slug,
            'ownerId' => $sessionUser['username'],
            'linkType' => 'url',
            'targetUrl' => $check['normalizedUrl'],
            'title' => trim((string)($row['title'] ?? '')) ?: $check['host'],
            'customDomain' => $domain,
            'redirectType' => ((int)($row['redirectType'] ?? 302) === 301) ? 301 : 302,
            'isActive' => true,
            'hasPassword' => false,
            'passwordHash' => '',
            'expiresAt' => '',
            'safetyStatus' => 'safe',
            'safetyReason' => 'Aman',
            'safetyEngine' => 'Heuristik Lokal (PHP)',
            'clickCount' => 0,
            'createdAt' => $now,
            'updatedAt' => $now,
        ];
        array_unshift($state['links'], $link);
        $createdLinks[] = $link;
        $createdCount++;
        $results[] = ['rowNumber' => $row['rowNumber'] ?? 0, 'targetUrl' => $check['normalizedUrl'], 'slug' => $slug, 'customDomain' => $domain, 'status' => 'created', 'link' => $link];
    }
    tk_save_state($state);
    tk_json_response(201, ['results' => $results, 'createdLinks' => $createdLinks, 'createdCount' => $createdCount, 'skippedCount' => $skippedCount]);
}

if (preg_match('#^/api/links/([^/]+)$#', $routePath, $m) && $method === 'GET') {
    $slug = strtolower(urldecode($m[1]));
    foreach ($state['links'] as $l) {
        if ($l['slug'] === $slug) {
            $lCopy = $l;
            $lCopy['passwordHash'] = '';
            if (!empty($l['hasPassword'])) $lCopy['targetUrl'] = '';
            tk_json_response(200, [
                'link' => $lCopy,
                'expired' => tk_is_expired($l['expiresAt'] ?? ''),
                'quotaExceeded' => tk_is_quota_exceeded($l),
            ]);
        }
    }
    tk_json_response(404, ['error' => 'Tautan tidak ditemukan.']);
}

if (preg_match('#^/api/links/([^/]+)/unlock$#', $routePath, $m) && $method === 'POST') {
    $slug = strtolower(urldecode($m[1]));
    $body = tk_read_json_body();
    $attempt = (string)($body['password'] ?? '');
    foreach ($state['links'] as &$l) {
        if ($l['slug'] === $slug) {
            if (!empty($l['hasPassword']) && !password_verify($attempt, (string)$l['passwordHash'])) {
                tk_json_response(401, ['error' => 'Kata sandi yang dimasukkan salah.']);
            }
            $l['clickCount'] = ((int)$l['clickCount']) + 1;
            tk_save_state($state);
            tk_json_response(200, ['targetUrl' => $l['targetUrl'], 'redirectType' => $l['redirectType'] ?? 302]);
        }
    }
    unset($l);
    tk_json_response(404, ['error' => 'Tautan tidak ditemukan.']);
}

if (preg_match('#^/api/links/([^/]+)/vcard$#', $routePath, $m) && $method === 'GET') {
    $slug = strtolower(urldecode($m[1]));
    foreach ($state['links'] as &$l) {
        if ($l['slug'] === $slug && ($l['linkType'] ?? '') === 'vcard' && !empty($l['vcard'])) {
            $vc = $l['vcard'];
            $l['clickCount'] = ((int)$l['clickCount']) + 1;
            tk_save_state($state);
            $lines = [
                'BEGIN:VCARD',
                'VERSION:3.0',
                'FN:' . ($vc['fullName'] ?? 'Kontak'),
                'TEL;TYPE=CELL:' . ($vc['phone'] ?? ''),
            ];
            if (!empty($vc['organization'])) $lines[] = 'ORG:' . $vc['organization'];
            if (!empty($vc['role'])) $lines[] = 'TITLE:' . $vc['role'];
            if (!empty($vc['email'])) $lines[] = 'EMAIL;TYPE=INTERNET:' . $vc['email'];
            if (!empty($vc['website'])) $lines[] = 'URL:' . $vc['website'];
            $lines[] = 'END:VCARD';
            header('Content-Type: text/vcard; charset=utf-8');
            header('Content-Disposition: attachment; filename="' . $slug . '.vcf"');
            echo implode("\r\n", $lines);
            exit;
        }
    }
    unset($l);
    tk_json_response(404, ['error' => 'vCard tidak ditemukan.']);
}

if (preg_match('#^/api/links/([^/]+)$#', $routePath, $m) && $method === 'PATCH') {
    $requireSession();
    $slug = strtolower(urldecode($m[1]));
    $body = tk_read_json_body();
    $patchFields = [
        'title', 'isActive', 'redirectType', 'expiresAt', 'customDomain',
        'maxClicks', 'interstitialEnabled', 'trackingPixels', 'ogMeta',
        'utm', 'geoRules', 'deviceRules', 'abVariants', 'timeRule', 'vcard'
    ];
    foreach ($state['links'] as $idx => &$l) {
        if ($l['slug'] === $slug) {
            if (!empty($body['newSlug'])) {
                $newSlug = strtolower(trim((string)$body['newSlug']));
                if (!preg_match('/^[a-z0-9_-]{3,64}$/', $newSlug)) {
                    tk_json_response(400, ['error' => 'Slug baru hanya boleh huruf kecil, angka, strip, dan garis bawah (3-64 karakter).']);
                }
                foreach ($state['links'] as $j => $other) {
                    if ($j !== $idx && $other['slug'] === $newSlug) {
                        tk_json_response(409, ['error' => "Slug \"$newSlug\" sudah digunakan."]);
                    }
                }
                $l['slug'] = $newSlug;
                foreach ($state['clicks'] as &$clk) {
                    if (($clk['slug'] ?? '') === $slug) $clk['slug'] = $newSlug;
                }
                unset($clk);
            }
            if (!empty($body['targetUrl'])) {
                $check = tk_validate_url((string)$body['targetUrl']);
                if (!$check['valid']) tk_json_response(400, ['error' => $check['error']]);
                $l['targetUrl'] = $check['normalizedUrl'];
            }
            if (!empty($body['clearPassword'])) {
                $l['hasPassword'] = false;
                $l['passwordHash'] = '';
            } elseif (!empty($body['password'])) {
                $l['hasPassword'] = true;
                $l['passwordHash'] = password_hash((string)$body['password'], PASSWORD_DEFAULT);
            }
            foreach ($patchFields as $field) {
                if (array_key_exists($field, $body)) {
                    $l[$field] = $body[$field];
                }
            }
            $l['updatedAt'] = tk_now_iso();
            tk_save_state($state);
            tk_json_response(200, ['link' => $l, 'previousSlug' => $slug]);
        }
    }
    unset($l);
    tk_json_response(404, ['error' => 'Tautan tidak ditemukan.']);
}

if (preg_match('#^/api/links/([^/]+)$#', $routePath, $m) && $method === 'DELETE') {
    $requireSession();
    $slug = strtolower(urldecode($m[1]));
    $state['links'] = array_values(array_filter($state['links'], static function ($l) use ($slug) {
        return $l['slug'] !== $slug;
    }));
    tk_save_state($state);
    tk_json_response(200, ['deleted' => true]);
}

if ($routePath === '/api/analytics' && $method === 'GET') {
    $requireSession();
    $filterSlug = !empty($_GET['slug']) && $_GET['slug'] !== 'all' ? strtolower((string)$_GET['slug']) : '';
    $relLinks = $filterSlug ? array_values(array_filter($state['links'], static fn($l) => $l['slug'] === $filterSlug)) : $state['links'];
    $relClicks = $filterSlug ? array_values(array_filter($state['clicks'], static fn($c) => $c['slug'] === $filterSlug)) : $state['clicks'];
    $sumClicks = array_reduce($relLinks, static fn($acc, $l) => $acc + (int)($l['clickCount'] ?? 0), 0);

    $groupBy = static function (array $items, string $field): array {
        $map = [];
        foreach ($items as $it) {
            $k = (string)($it[$field] ?? 'Lainnya');
            $map[$k] = ($map[$k] ?? 0) + 1;
        }
        arsort($map);
        $out = [];
        foreach ($map as $name => $count) $out[] = ['name' => $name, 'count' => $count];
        return $out;
    };

    $daily = [];
    for ($i = 6; $i >= 0; $i--) {
        $d = gmdate('Y-m-d', time() - $i * 86400);
        $cnt = 0;
        foreach ($relClicks as $c) {
            if (strpos((string)($c['createdAt'] ?? ''), $d) === 0) $cnt++;
        }
        $daily[] = ['date' => $d, 'clicks' => $cnt];
    }

    tk_json_response(200, [
        'totalClicks' => max($sumClicks, count($relClicks)),
        'activeLinks' => count(array_filter($relLinks, static fn($l) => !empty($l['isActive']) && !tk_is_expired($l['expiresAt'] ?? '') && !tk_is_quota_exceeded($l))),
        'protectedLinks' => count(array_filter($relLinks, static fn($l) => !empty($l['hasPassword']) || !empty($l['expiresAt']) || !empty($l['maxClicks']))),
        'avgCacheLatencyMs' => 2.4,
        'cacheHitRate' => 100,
        'byCountry' => $groupBy($relClicks, 'country'),
        'byDevice' => $groupBy($relClicks, 'device'),
        'byOs' => $groupBy($relClicks, 'os'),
        'byReferer' => $groupBy($relClicks, 'referer'),
        'dailySeries' => $daily,
        'recentClicks' => array_slice($relClicks, 0, 25),
    ]);
}

if ($routePath === '/api/bios' && $method === 'GET') {
    $requireSession();
    tk_json_response(200, ['profiles' => $state['bios']]);
}

if ($routePath === '/api/bios' && $method === 'POST') {
    $requireSession();
    $body = tk_read_json_body();
    $handle = strtolower(trim((string)($body['handle'] ?? '')));
    if (!preg_match('/^[a-z0-9_-]{3,48}$/', $handle)) {
        tk_json_response(400, ['error' => 'Handle bio harus 3-48 karakter (huruf kecil, angka, strip, garis bawah).']);
    }
    foreach ($state['bios'] as $b) {
        if (strtolower((string)$b['handle']) === $handle) {
            tk_json_response(409, ['error' => "Handle \"/u/$handle\" sudah digunakan."]);
        }
    }
    $displayName = trim((string)($body['displayName'] ?? ''));
    if ($displayName === '') tk_json_response(400, ['error' => 'Nama tampilan wajib diisi.']);
    $now = tk_now_iso();
    $created = [
        'handle' => $handle,
        'ownerId' => $sessionUser['username'],
        'displayName' => $displayName,
        'bio' => trim((string)($body['bio'] ?? '')),
        'theme' => (string)($body['theme'] ?? 'cobalt'),
        'templateId' => (string)($body['templateId'] ?? 'minimal-card'),
        'customDomain' => strtolower(trim((string)($body['customDomain'] ?? ''))),
        'avatarUrl' => isset($body['avatarUrl']) ? trim((string)$body['avatarUrl']) : '/src/assets/images/avatar_bio_creator_1794832316229.jpg',
        'backgroundImageUrl' => isset($body['backgroundImageUrl']) ? trim((string)$body['backgroundImageUrl']) : '',
        'backgroundOverlay' => (string)($body['backgroundOverlay'] ?? 'dark'),
        'items' => is_array($body['items'] ?? null) ? $body['items'] : [],
        'createdAt' => $now,
        'updatedAt' => $now,
    ];
    array_unshift($state['bios'], $created);
    tk_save_state($state);
    tk_json_response(201, ['profile' => $created]);
}

if (preg_match('#^/api/bio/([^/]+)$#', $routePath, $m) && $method === 'GET') {
    $handle = strtolower(urldecode($m[1]));
    foreach ($state['bios'] as $b) {
        if ($b['handle'] === $handle) tk_json_response(200, ['profile' => $b]);
    }
    tk_json_response(404, ['error' => 'Profil Link-in-Bio tidak ditemukan.']);
}

if (preg_match('#^/api/bio/([^/]+)/click$#', $routePath, $m) && $method === 'POST') {
    $handle = strtolower(urldecode($m[1]));
    $body = tk_read_json_body();
    $itemId = (string)($body['itemId'] ?? '');
    foreach ($state['bios'] as &$b) {
        if ($b['handle'] === $handle) {
            foreach ($b['items'] as &$it) {
                if (($it['id'] ?? '') === $itemId) {
                    $it['clicks'] = ((int)($it['clicks'] ?? 0)) + 1;
                    break;
                }
            }
            unset($it);
            tk_save_state($state);
            tk_json_response(200, ['ok' => true]);
        }
    }
    unset($b);
    tk_json_response(404, ['error' => 'Profil Link-in-Bio tidak ditemukan.']);
}

if (preg_match('#^/api/bio/([^/]+)$#', $routePath, $m) && $method === 'PUT') {
    $requireSession();
    $handle = strtolower(urldecode($m[1]));
    $body = tk_read_json_body();
    $targetHandle = $handle;
    if (!empty($body['newHandle']) && strtolower(trim((string)$body['newHandle'])) !== $handle) {
        $cand = strtolower(trim((string)$body['newHandle']));
        if (!preg_match('/^[a-z0-9_-]{3,48}$/', $cand)) {
            tk_json_response(400, ['error' => 'Handle bio baru tidak valid.']);
        }
        foreach ($state['bios'] as $b) {
            if (strtolower((string)$b['handle']) === $cand) {
                tk_json_response(409, ['error' => "Handle \"/u/$cand\" sudah digunakan."]);
            }
        }
        $targetHandle = $cand;
    }

    $foundIdx = -1;
    foreach ($state['bios'] as $i => $b) {
        if ($b['handle'] === $handle) {
            $foundIdx = $i;
            break;
        }
    }
    $prev = $foundIdx >= 0 ? $state['bios'][$foundIdx] : null;
    $updated = [
        'handle' => $targetHandle,
        'ownerId' => $prev['ownerId'] ?? $sessionUser['username'],
        'displayName' => trim((string)($body['displayName'] ?? $targetHandle)),
        'bio' => trim((string)($body['bio'] ?? '')),
        'theme' => (string)($body['theme'] ?? 'cobalt'),
        'templateId' => (string)($body['templateId'] ?? 'minimal-card'),
        'customDomain' => strtolower(trim((string)($body['customDomain'] ?? ''))),
        'avatarUrl' => array_key_exists('avatarUrl', $body)
            ? trim((string)$body['avatarUrl'])
            : ($prev['avatarUrl'] ?? '/src/assets/images/avatar_bio_creator_1794832316229.jpg'),
        'backgroundImageUrl' => array_key_exists('backgroundImageUrl', $body)
            ? trim((string)$body['backgroundImageUrl'])
            : ($prev['backgroundImageUrl'] ?? ''),
        'backgroundOverlay' => (string)($body['backgroundOverlay'] ?? ($prev['backgroundOverlay'] ?? 'dark')),
        'items' => is_array($body['items'] ?? null) ? $body['items'] : [],
        'createdAt' => $prev['createdAt'] ?? tk_now_iso(),
        'updatedAt' => tk_now_iso(),
    ];
    if ($foundIdx >= 0) {
        $state['bios'][$foundIdx] = $updated;
    } else {
        array_unshift($state['bios'], $updated);
    }
    tk_save_state($state);
    tk_json_response(200, ['profile' => $updated, 'previousHandle' => $handle]);
}

if (preg_match('#^/api/bio/([^/]+)$#', $routePath, $m) && $method === 'DELETE') {
    $requireSession();
    $handle = strtolower(urldecode($m[1]));
    $state['bios'] = array_values(array_filter($state['bios'], static function ($b) use ($handle) {
        return $b['handle'] !== $handle;
    }));
    tk_save_state($state);
    tk_json_response(200, ['deleted' => true]);
}

if ($routePath === '/api/crypto-sandbox' && $method === 'POST') {
    $body = tk_read_json_body();
    $action = (string)($body['action'] ?? '');
    if ($action === 'hash_password') {
        $pass = (string)($body['password'] ?? '');
        if ($pass === '') tk_json_response(400, ['error' => 'Kata sandi wajib diisi.']);
        tk_json_response(200, ['hash' => password_hash($pass, PASSWORD_DEFAULT)]);
    }
    if ($action === 'encrypt') {
        $text = (string)($body['text'] ?? '');
        $key = hash('sha256', (string)($body['secretKey'] ?? ''), true);
        $iv = random_bytes(16);
        $cipher = openssl_encrypt($text, 'AES-256-CBC', $key, OPENSSL_RAW_DATA, $iv);
        $hmac = hash_hmac('sha256', $iv . $cipher, $key, true);
        tk_json_response(200, ['encrypted' => base64_encode($iv . $hmac . $cipher)]);
    }
    if ($action === 'decrypt') {
        $raw = base64_decode((string)($body['cipherPayload'] ?? ''), true);
        if (!$raw || strlen($raw) < 49) tk_json_response(400, ['error' => 'Ciphertext tidak valid.']);
        $key = hash('sha256', (string)($body['secretKey'] ?? ''), true);
        $iv = substr($raw, 0, 16);
        $hmac = substr($raw, 16, 32);
        $cipher = substr($raw, 48);
        $calc = hash_hmac('sha256', $iv . $cipher, $key, true);
        if (!hash_equals($hmac, $calc)) tk_json_response(400, ['error' => 'Verifikasi integritas HMAC gagal.']);
        tk_json_response(200, ['decrypted' => (string)openssl_decrypt($cipher, 'AES-256-CBC', $key, OPENSSL_RAW_DATA, $iv)]);
    }
}

if ($routePath === '/api/integrations/zapier/shorten' && $method === 'POST') {
    $requireSession();
    $body = tk_read_json_body();
    $check = tk_validate_url((string)($body['url'] ?? ''));
    if (!$check['valid']) tk_json_response(400, ['error' => $check['error']]);
    $slug = tk_generate_slug(6);
    $now = tk_now_iso();
    $link = [
        'slug' => $slug,
        'ownerId' => $sessionUser['username'],
        'linkType' => 'url',
        'targetUrl' => $check['normalizedUrl'],
        'title' => '[' . ($body['source_app'] ?? 'Zapier') . '] ' . $check['host'],
        'customDomain' => '',
        'redirectType' => 302,
        'isActive' => true,
        'hasPassword' => false,
        'passwordHash' => '',
        'expiresAt' => '',
        'safetyStatus' => 'safe',
        'safetyReason' => 'Aman',
        'clickCount' => 0,
        'createdAt' => $now,
        'updatedAt' => $now,
    ];
    array_unshift($state['links'], $link);
    tk_save_state($state);
    tk_json_response(201, [
        'status' => 'success',
        'integration' => $body['source_app'] ?? 'Zapier / Make.com',
        'shortUrl' => '/s/' . $slug,
        'slug' => $slug,
        'targetUrl' => $check['normalizedUrl'],
        'createdAt' => $now,
    ]);
}

tk_json_response(404, ['error' => 'Endpoint API tidak ditemukan: ' . $routePath]);
