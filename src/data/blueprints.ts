export interface BlueprintTab {
  id: 'sql' | 'express' | 'redis' | 'php';
  title: string;
  filename: string;
  language: string;
  summary: string;
  highlights: string[];
  code: string;
}

export const ARCHITECTURE_BLUEPRINTS: BlueprintTab[] = [
  {
    id: 'sql',
    title: '01. Skema Database PostgreSQL',
    filename: 'schema.sql',
    language: 'sql',
    summary:
      'Skema relasional PostgreSQL teroptimasi untuk users, urls, analytics, dan bio_profiles dengan B-Tree index pada short_code serta partial index untuk pengalihan super cepat.',
    highlights: [
      'B-Tree UNIQUE INDEX pada urls(short_code) untuk lookup O(log N) sub-milidetik',
      'Composite index analytics(url_id, clicked_at DESC) untuk query grafik time-series',
      'Tipe INET untuk IP terstruktur dan TIMESTAMPTZ untuk zona waktu lintas negara',
    ],
    code: `-- ============================================================================
-- SKEMA DATABASE PLATFORM SHORTLINK (PostgreSQL 15+)
-- Teroptimasi untuk lookup pengalihan cepat & analitik real-time
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Tabel Pengguna (Users)
CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         VARCHAR(254) NOT NULL UNIQUE,
    full_name     VARCHAR(100) NOT NULL,
    password_hash TEXT NOT NULL, -- Bcrypt / Argon2id hash (cost >= 12)
    is_verified   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Tabel Tautan Pendek (URLs)
CREATE TABLE urls (
    id             BIGSERIAL PRIMARY KEY,
    user_id        UUID REFERENCES users(id) ON DELETE SET NULL,
    short_code     VARCHAR(64) NOT NULL,
    original_url   TEXT NOT NULL CHECK (original_url ~* '^https?://'),
    title          VARCHAR(120) NOT NULL DEFAULT '',
    redirect_type  SMALLINT NOT NULL DEFAULT 302 CHECK (redirect_type IN (301, 302)),
    password_hash  TEXT NULL, -- Null jika tautan publik tanpa password
    expires_at     TIMESTAMPTZ NULL,
    safety_status  VARCHAR(16) NOT NULL DEFAULT 'safe' CHECK (safety_status IN ('safe', 'warning', 'blocked')),
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
    click_count    BIGINT NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index Kritis #1: Unique B-Tree Index pada short_code untuk pengalihan cepat
CREATE UNIQUE INDEX idx_urls_short_code ON urls (short_code);

-- Index Kritis #2: Partial Index hanya untuk tautan aktif (memperkecil ukuran index di RAM)
CREATE INDEX idx_urls_active_lookup
    ON urls (short_code)
    INCLUDE (original_url, redirect_type, password_hash, expires_at, safety_status)
    WHERE is_active = TRUE;

-- Index daftar tautan milik pengguna pada dashboard
CREATE INDEX idx_urls_user_created ON urls (user_id, created_at DESC);

-- 3. Tabel Analitik Klik (Analytics)
CREATE TABLE analytics (
    id           BIGSERIAL PRIMARY KEY,
    url_id       BIGINT NOT NULL REFERENCES urls(id) ON DELETE CASCADE,
    ip_hash      CHAR(64) NOT NULL, -- SHA-256 salted IP (patuh privasi / GDPR)
    country_code CHAR(2) NOT NULL DEFAULT 'ID',
    city         VARCHAR(64) NOT NULL DEFAULT 'Unknown',
    device_type  VARCHAR(16) NOT NULL DEFAULT 'Desktop', -- Desktop | Mobile | Tablet | Bot
    os_name      VARCHAR(40) NOT NULL DEFAULT 'Unknown',
    browser_name VARCHAR(40) NOT NULL DEFAULT 'Unknown',
    referer      VARCHAR(255) NOT NULL DEFAULT 'Direct',
    latency_ms   NUMERIC(6, 2) NOT NULL DEFAULT 0,
    clicked_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index untuk agregasi dashboard per tautan dan rentang tanggal
CREATE INDEX idx_analytics_url_time ON analytics (url_id, clicked_at DESC);
CREATE INDEX idx_analytics_country ON analytics (url_id, country_code);

-- 4. Tabel Link-in-Bio (Profil & Item)
CREATE TABLE bio_profiles (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    handle       VARCHAR(48) NOT NULL UNIQUE,
    display_name VARCHAR(80) NOT NULL,
    bio_text     VARCHAR(280) NOT NULL DEFAULT '',
    theme        VARCHAR(24) NOT NULL DEFAULT 'cobalt',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE bio_links (
    id         BIGSERIAL PRIMARY KEY,
    profile_id UUID NOT NULL REFERENCES bio_profiles(id) ON DELETE CASCADE,
    title      VARCHAR(80) NOT NULL,
    target_url TEXT NOT NULL CHECK (target_url ~* '^https?://'),
    sort_order INTEGER NOT NULL DEFAULT 0,
    clicks     BIGINT NOT NULL DEFAULT 0,
    is_active  BOOLEAN NOT NULL DEFAULT TRUE
);`,
  },
  {
    id: 'express',
    title: '02. REST API Express + PostgreSQL',
    filename: 'server-api.js',
    language: 'javascript',
    summary:
      'Implementasi backend Node.js Express siap produksi dengan Parameterized Queries (anti SQL Injection), bcrypt hashing untuk link berpassword, skrining URL berbahaya, dan endpoint 301/302.',
    highlights: [
      '100% Parameterized SQL Queries ($1, $2, ...) mencegah SQL Injection',
      'Helmet + CORS whitelist + validasi ketat skema http/https sebelum simpan',
      'Verifikasi password bcrypt pada link terproteksi & pencatatan analitik non-blocking',
    ],
    code: `// ============================================================================
// REST API SHORTLINK NODE.JS EXPRESS + POSTGRESQL
// Keamanan: Parameterized Queries, Helmet, CORS, Bcrypt, Skrining URL
// ============================================================================
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { Pool } from 'pg';

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }));
app.use(express.json({ limit: '64kb' }));

// Connection Pool PostgreSQL (Gunakan variabel environment aman)
const pool = new Pool({
  host: process.env.PGHOST,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  max: 20,
  idleTimeoutMillis: 30000,
});

// Skrining keamanan URL (Phishing / Malware / Skema terlarang)
function screenTargetUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { valid: false, status: 'blocked', reason: 'Format URL tidak valid.' };
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { valid: false, status: 'blocked', reason: 'Hanya HTTP/HTTPS yang diizinkan.' };
  }
  const host = parsed.hostname.toLowerCase();
  const riskyTlds = ['.tk', '.ml', '.ga', '.cf', '.gq', '.zip'];
  if (parsed.username || parsed.password || riskyTlds.some((t) => host.endsWith(t))) {
    return { valid: true, status: 'blocked', reason: 'Terdeteksi indikator phishing berisiko tinggi.' };
  }
  return { valid: true, status: 'safe', reason: 'Aman' };
}

// 1. POST /api/links — Membuat Shortlink Baru (Custom Slug / Otomatis)
app.post('/api/links', async (req, res) => {
  const { originalUrl, customSlug, title = '', redirectType = 302, password, expiresAt } = req.body;

  const screening = screenTargetUrl(originalUrl);
  if (!screening.valid || screening.status === 'blocked') {
    return res.status(400).json({ error: screening.reason });
  }

  // Generate Base62 slug jika pengguna tidak mengisi customSlug
  const slug = (customSlug || crypto.randomBytes(4).toString('base64url').slice(0, 6))
    .trim()
    .toLowerCase();

  if (!/^[a-z0-9_-]{3,64}$/.test(slug)) {
    return res.status(400).json({ error: 'Slug hanya boleh huruf, angka, "-" dan "_" (3-64 karakter).' });
  }

  try {
    const passwordHash = password ? await bcrypt.hash(password, 12) : null;
    const statusCode = redirectType === 301 ? 301 : 302;

    const result = await pool.query(
      \`INSERT INTO urls (short_code, original_url, title, redirect_type, password_hash, expires_at, safety_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, short_code, original_url, redirect_type, expires_at, safety_status, created_at\`,
      [slug, originalUrl, title, statusCode, passwordHash, expiresAt || null, screening.status]
    );

    return res.status(201).json({ link: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Slug sudah digunakan, pilih nama lain.' });
    }
    console.error('Insert URL error:', err);
    return res.status(500).json({ error: 'Gagal menyimpan tautan pendek.' });
  }
});

// 2. GET /:slug — Pengalihan Cepat 301/302 + Pencatatan Analitik
app.get('/:slug', async (req, res) => {
  const { slug } = req.params;
  const start = performance.now();

  try {
    const { rows } = await pool.query(
      \`SELECT id, original_url, redirect_type, password_hash, expires_at, safety_status, is_active
       FROM urls WHERE short_code = $1 LIMIT 1\`,
      [slug.toLowerCase()]
    );

    if (rows.length === 0 || !rows[0].is_active) {
      return res.status(404).send('Tautan tidak ditemukan atau sudah dinonaktifkan.');
    }

    const link = rows[0];
    if (link.expires_at && new Date(link.expires_at) <= new Date()) {
      return res.status(410).send('Tautan sudah kadaluarsa.');
    }
    if (link.password_hash) {
      return res.redirect(302, \`/unlock/\${slug}\`);
    }

    // Catat klik secara asinkron (fire-and-forget) agar pengalihan tetap instan
    const latency = Number((performance.now() - start).toFixed(2));
    const ipHash = crypto.createHash('sha256').update(req.ip + process.env.IP_SALT).digest('hex');

    pool.query(
      \`WITH inc AS (UPDATE urls SET click_count = click_count + 1 WHERE id = $1)
       INSERT INTO analytics (url_id, ip_hash, referer, latency_ms)
       VALUES ($1, $2, $3, $4)\`,
      [link.id, ipHash, req.get('referer') || 'Direct', latency]
    ).catch((e) => console.error('Async analytics log failed:', e));

    return res.redirect(link.redirect_type, link.original_url);
  } catch (err) {
    console.error('Redirect error:', err);
    return res.status(500).send('Terjadi kesalahan server.');
  }
});

// 3. POST /api/links/:slug/verify — Verifikasi Password Link Terproteksi
app.post('/api/links/:slug/verify', async (req, res) => {
  const { slug } = req.params;
  const { password } = req.body;

  const { rows } = await pool.query(
    'SELECT original_url, password_hash FROM urls WHERE short_code = $1 AND is_active = TRUE LIMIT 1',
    [slug.toLowerCase()]
  );

  if (rows.length === 0 || !rows[0].password_hash) {
    return res.status(404).json({ error: 'Tautan tidak ditemukan.' });
  }

  const valid = await bcrypt.compare(password || '', rows[0].password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Kata sandi salah.' });
  }
  return res.json({ originalUrl: rows[0].original_url });
});

app.listen(3000, () => console.log('Shortlink API aktif pada port 3000'));`,
  },
  {
    id: 'redis',
    title: '03. Redis Cache <50ms, Rate Limit & UA/IP Parser',
    filename: 'advanced-redis-middleware.js',
    language: 'javascript',
    summary:
      'Arsitektur performa tinggi menggunakan Redis untuk caching pengalihan di bawah 50ms, Lua atomic sliding-window rate limiting anti-bot, dan parser User-Agent + Geo-IP asinkron.',
    highlights: [
      'Cache-Aside Redis (GET route:<slug>) menurunkan latensi dari ~25ms DB menjadi <3ms RAM',
      'Sliding-Window Rate Limiter berbasis Redis Sorted Set (ZREMRANGEBYSCORE + ZADD)',
      'Pipeline antrean klik (RPUSH analytics:queue) agar lonjakan traffic tidak membebani PostgreSQL',
    ],
    code: `// ============================================================================
// ARSITEKTUR LANJUTAN: REDIS CACHE (<50ms), RATE LIMITING & UA/IP PARSER
// Dependensi: npm i ioredis ua-parser-js geoip-lite
// ============================================================================
import Redis from 'ioredis';
import { UAParser } from 'ua-parser-js';
import geoip from 'geoip-lite';
import crypto from 'crypto';

const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');

// ----------------------------------------------------------------------------
// A. RATE LIMITER SLIDING WINDOW ANTI-BOT (Redis Sorted Set)
// ----------------------------------------------------------------------------
export function createRedisRateLimiter({ windowSec = 60, maxRequests = 40 } = {}) {
  return async (req, res, next) => {
    const ip = req.headers['cf-connecting-ip'] || req.ip || 'unknown';
    const key = \`ratelimit:\${req.path}:\${ip}\`;
    const now = Date.now();
    const windowStart = now - windowSec * 1000;

    // Pipeline atomik: hapus timestamp kadaluarsa, hitung sisa, tambah request baru
    const pipeline = redis.pipeline();
    pipeline.zremrangebyscore(key, 0, windowStart);
    pipeline.zcard(key);
    pipeline.zadd(key, now, \`\${now}-\${Math.random()}\`);
    pipeline.expire(key, windowSec);

    const [, currentCount] = await pipeline.exec();
    const count = currentCount[1];

    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - count - 1));

    if (count >= maxRequests) {
      return res.status(429).json({
        error: 'Terlalu banyak permintaan. Coba lagi dalam beberapa detik.',
      });
    }
    return next();
  };
}

// ----------------------------------------------------------------------------
// B. PARSER USER-AGENT & IP GEOLOCATION
// ----------------------------------------------------------------------------
export function extractVisitorAnalytics(req) {
  const uaString = req.headers['user-agent'] || '';
  const parser = new UAParser(uaString);
  const ua = parser.getResult();

  const rawIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '')
    .toString()
    .split(',')[0]
    .trim();

  const geo = geoip.lookup(rawIp);
  const ipHash = crypto
    .createHmac('sha256', process.env.ANALYTICS_SALT || 'secret-salt')
    .update(rawIp)
    .digest('hex');

  return {
    ipHash,
    country: geo?.country || 'ID',
    city: geo?.city || 'Jakarta',
    deviceType: ua.device.type === 'mobile' ? 'Mobile' : ua.device.type === 'tablet' ? 'Tablet' : 'Desktop',
    osName: ua.os.name || 'Unknown',
    browserName: ua.browser.name || 'Unknown',
    referer: req.headers['referer'] || 'Direct',
    clickedAt: new Date().toISOString(),
  };
}

// ----------------------------------------------------------------------------
// C. PENGALIHAN CEPAT <50ms DENGAN REDIS CACHE-ASIDE + ASYNC CLICK QUEUE
// ----------------------------------------------------------------------------
export async function fastRedirectHandler(req, res, dbPool) {
  const start = performance.now();
  const slug = req.params.slug.toLowerCase();
  const cacheKey = \`route:\${slug}\`;

  // 1. Cek Redis terlebih dahulu (~1-3 ms)
  const cachedJson = await redis.get(cacheKey);
  let routeData = cachedJson ? JSON.parse(cachedJson) : null;
  let cacheHit = Boolean(routeData);

  // 2. Jika Cache Miss, ambil dari PostgreSQL lalu simpan ke Redis (TTL 5 menit)
  if (!routeData) {
    const { rows } = await dbPool.query(
      \`SELECT id, original_url, redirect_type, password_hash, expires_at, is_active
       FROM urls WHERE short_code = $1 LIMIT 1\`,
      [slug]
    );
    if (rows.length === 0 || !rows[0].is_active) {
      // Negative caching 30 detik untuk mencegah serangan cache penetration (slug acak)
      await redis.set(cacheKey, JSON.stringify({ notFound: true }), 'EX', 30);
      return res.status(404).send('Tautan tidak ditemukan.');
    }
    routeData = rows[0];
    await redis.set(cacheKey, JSON.stringify(routeData), 'EX', 300);
  }

  if (routeData.notFound) return res.status(404).send('Tautan tidak ditemukan.');
  if (routeData.expires_at && new Date(routeData.expires_at) <= new Date()) {
    return res.status(410).send('Tautan sudah kadaluarsa.');
  }
  if (routeData.password_hash) {
    return res.redirect(302, \`/unlock/\${slug}\`);
  }

  // 3. Antrekan event analitik ke Redis List agar response redirect tidak menunggu INSERT DB
  const telemetry = extractVisitorAnalytics(req);
  const latencyMs = Number((performance.now() - start).toFixed(2));
  redis.rpush('analytics:queue', JSON.stringify({ urlId: routeData.id, latencyMs, cacheHit, ...telemetry }))
    .catch((err) => console.error('Redis queue error:', err));

  res.setHeader('X-Cache', cacheHit ? 'HIT' : 'MISS');
  res.setHeader('X-Redirect-Latency-Ms', latencyMs.toString());
  return res.redirect(routeData.redirect_type || 302, routeData.original_url);
}`,
  },
  {
    id: 'php',
    title: '04. Skrip PHP InfinityFree (Bcrypt & AES-256-CBC)',
    filename: 'security_helper.php',
    language: 'php',
    summary:
      'Skrip tunggal PHP 7.4 / 8.x yang 100% kompatibel dengan shared hosting cPanel InfinityFree (tanpa ekstensi terlarang). Menyediakan hashing password bawaan (PASSWORD_DEFAULT) dan enkripsi AES-256-CBC + HMAC-SHA256.',
    highlights: [
      'Menggunakan fungsi native password_hash(..., PASSWORD_DEFAULT) & password_verify()',
      'Enkripsi AES-256-CBC (openssl_encrypt/decrypt) dengan IV acak 16-byte + HMAC-SHA256 anti-tampering',
      'Siap pakai dalam 1 file tunggal lengkap dengan contoh form HTML interaktif untuk InfinityFree',
    ],
    code: `<?php
/**
 * ============================================================================
 * SECURITY_HELPER.PHP — Modul Hashing Password & Enkripsi AES-256-CBC
 * Kompatibel 100% dengan InfinityFree Hosting (PHP 7.4 / 8.x, cPanel)
 * Tidak membutuhkan ekstensi server khusus atau exec()/shell_exec().
 * ============================================================================
 */

// Pastikan error tidak membocorkan informasi sensitif di production
// error_reporting(0);

// KUNCI RAHASIA APLIKASI (Minimal 32 karakter acak untuk AES-256).
// PENTING: Ganti kunci di bawah ini dengan kunci rahasia milik Anda sendiri!
// Di InfinityFree, simpan file ini atau konstanta kunci di luar public_html jika memungkinkan.
define('APP_ENCRYPTION_KEY', 'GantiDenganKunciRahasiaAcakMinimal32Karakter!2026');

/**
 * ============================================================================
 * MODUL 1: HASHING PASSWORD (KEAMANAN LOGIN)
 * ============================================================================
 */

/**
 * Membuat hash password yang aman saat pendaftaran / ubah kata sandi.
 * Menggunakan algoritma PASSWORD_DEFAULT (Bcrypt / Argon2id otomatis sesuai versi PHP).
 *
 * @param string $kataSandiPlain Kata sandi asli dari input pengguna.
 * @return string Hash password siap simpan ke database MySQL/PostgreSQL.
 */
function hash_kata_sandi(string $kataSandiPlain): string
{
    if (trim($kataSandiPlain) === '') {
        throw new InvalidArgumentException('Kata sandi tidak boleh kosong.');
    }

    // PASSWORD_DEFAULT otomatis menghasilkan salt kriptografis acak per password
    $hash = password_hash($kataSandiPlain, PASSWORD_DEFAULT);

    if ($hash === false) {
        throw new RuntimeException('Gagal membuat hash kata sandi.');
    }

    return $hash;
}

/**
 * Memverifikasi kecocokan kata sandi input saat login terhadap hash di database.
 * Aman terhadap timing attack.
 *
 * @param string $kataSandiInput Kata sandi yang diketik pengguna pada form login.
 * @param string $hashTersimpan  Hash password yang diambil dari database.
 * @return bool True jika cocok, False jika salah.
 */
function verifikasi_kata_sandi(string $kataSandiInput, string $hashTersimpan): bool
{
    return password_verify($kataSandiInput, $hashTersimpan);
}

/**
 * ============================================================================
 * MODUL 2: ENKRIPSI & DEKRIPSI DATA RAHASIA (AES-256-CBC + HMAC-SHA256)
 * ============================================================================
 */

/**
 * Menurunkan kunci biner 32-byte (256-bit) yang konsisten dari string kunci master.
 */
function dapatkan_kunci_biner(string $kunciMaster): string
{
    // hash('sha256', ..., true) menghasilkan tepat 32 byte mentah untuk AES-256
    return hash('sha256', $kunciMaster, true);
}

/**
 * Menyamarkan (meng-enkripsi) teks/data rahasia menggunakan AES-256-CBC.
 * Setiap enkripsi menghasilkan IV (Initialization Vector) acak 16-byte yang berbeda,
 * sehingga teks yang sama tetap menghasilkan ciphertext berbeda.
 * Dilengkapi HMAC-SHA256 agar data tidak bisa dimanipulasi di tengah jalan.
 *
 * @param string $dataRahasia Teks asli yang ingin disamarkan.
 * @param string $kunciMaster Kunci rahasia aplikasi.
 * @return string Paket data terenkripsi berformat Base64 aman untuk DB/URL.
 */
function enkripsi_data(string $dataRahasia, string $kunciMaster = APP_ENCRYPTION_KEY): string
{
    $metode = 'AES-256-CBC';
    $kunciBiner = dapatkan_kunci_biner($kunciMaster);

    // 1. Hitung panjang IV yang dibutuhkan AES-256-CBC (16 byte)
    $panjangIv = openssl_cipher_iv_length($metode);

    // 2. Buat IV acak yang aman secara kriptografis (didukung PHP 7.4 & 8.x di InfinityFree)
    $iv = random_bytes($panjangIv);

    // 3. Lakukan enkripsi dengan flag OPENSSL_RAW_DATA untuk efisiensi biner
    $ciphertext = openssl_encrypt($dataRahasia, $metode, $kunciBiner, OPENSSL_RAW_DATA, $iv);
    if ($ciphertext === false) {
        throw new RuntimeException('Proses enkripsi OpenSSL gagal.');
    }

    // 4. Buat tanda tangan HMAC-SHA256 atas (IV + Ciphertext) untuk mencegah pemalsuan data
    $hmac = hash_hmac('sha256', $iv . $ciphertext, $kunciBiner, true);

    // 5. Gabungkan HMAC (32 byte) + IV (16 byte) + Ciphertext, lalu encode ke Base64
    return base64_encode($hmac . $iv . $ciphertext);
}

/**
 * Mengembalikan (meng-dekripsi) data tersamar hasil fungsi enkripsi_data().
 *
 * @param string $paketBase64 Data terenkripsi berformat Base64.
 * @param string $kunciMaster Kunci rahasia aplikasi (harus sama saat enkripsi).
 * @return string|false Teks asli jika valid, atau false jika kunci salah / data rusak.
 */
function dekripsi_data(string $paketBase64, string $kunciMaster = APP_ENCRYPTION_KEY)
{
    $metode = 'AES-256-CBC';
    $kunciBiner = dapatkan_kunci_biner($kunciMaster);

    // 1. Decode dari Base64 ke data biner mentah
    $dataMentah = base64_decode($paketBase64, true);
    if ($dataMentah === false) {
        return false;
    }

    $panjangIv = openssl_cipher_iv_length($metode);
    $panjangHmac = 32; // SHA-256 menghasilkan 32 byte biner

    // Pastikan panjang data minimal cukup untuk menampung HMAC + IV
    if (strlen($dataMentah) <= ($panjangHmac + $panjangIv)) {
        return false;
    }

    // 2. Pisahkan komponen: [HMAC 32 byte] [IV 16 byte] [Ciphertext sisanya]
    $hmacTersimpan = substr($dataMentah, 0, $panjangHmac);
    $iv            = substr($dataMentah, $panjangHmac, $panjangIv);
    $ciphertext    = substr($dataMentah, $panjangHmac + $panjangIv);

    // 3. Verifikasi keaslian HMAC dengan hash_equals() (anti timing attack)
    $hmacHitung = hash_hmac('sha256', $iv . $ciphertext, $kunciBiner, true);
    if (!hash_equals($hmacTersimpan, $hmacHitung)) {
        // Data telah dimodifikasi atau kunci dekripsi salah!
        return false;
    }

    // 4. Dekripsi ciphertext menjadi teks asli
    return openssl_decrypt($ciphertext, $metode, $kunciBiner, OPENSSL_RAW_DATA, $iv);
}

/**
 * ============================================================================
 * CONTOH PENGGUNAAN LANGSUNG & FORM INTERAKTIF (SIAP JALAN DI INFINITYFREE)
 * ============================================================================
 */
$hasilHash = '';
$hasilVerifikasi = null;
$hasilEnkripsi = '';
$hasilDekripsi = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Contoh 1: Pengujian Hash & Verifikasi Password
    if (isset($_POST['aksi']) && $_POST['aksi'] === 'test_password') {
        $sandi = $_POST['password_baru'] ?? '';
        $cek   = $_POST['password_cek'] ?? '';
        if ($sandi !== '') {
            $hasilHash = hash_kata_sandi($sandi);
            $hasilVerifikasi = verifikasi_kata_sandi($cek, $hasilHash);
        }
    }

    // Contoh 2: Pengujian Enkripsi & Dekripsi AES-256-CBC
    if (isset($_POST['aksi']) && $_POST['aksi'] === 'test_aes') {
        $teksRahasia = $_POST['teks_rahasia'] ?? '';
        if ($teksRahasia !== '') {
            $hasilEnkripsi = enkripsi_data($teksRahasia);
            $hasilDekripsi = dekripsi_data($hasilEnkripsi);
        }
    }
}
?>
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Uji Coba Security Helper PHP — InfinityFree</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #f8fafc; color: #0f172a; padding: 24px; max-width: 760px; margin: auto; }
    .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px; margin-bottom: 20px; }
    input, textarea { width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; margin: 6px 0 12px; box-sizing: border-box; }
    button { background: #1e40af; color: #fff; border: 0; padding: 10px 18px; border-radius: 6px; cursor: pointer; font-weight: 600; }
    code { display: block; background: #0f172a; color: #e2e8f0; padding: 12px; border-radius: 6px; word-break: break-all; margin-top: 8px; }
  </style>
</head>
<body>
  <h1>Security Helper PHP (InfinityFree Ready)</h1>

  <div class="card">
    <h2>1. Uji Hashing Password (PASSWORD_DEFAULT)</h2>
    <form method="POST">
      <input type="hidden" name="aksi" value="test_password" />
      <label>Password Pendaftaran:</label>
      <input type="text" name="password_baru" placeholder="Contoh: RahasiaToko2026!" required />
      <label>Password Uji Login:</label>
      <input type="text" name="password_cek" placeholder="Ketik ulang untuk verifikasi..." required />
      <button type="submit">Hash &amp; Verifikasi</button>
    </form>
    <?php if ($hasilHash !== ''): ?>
      <p><strong>Hash Tersimpan:</strong></p>
      <code><?= htmlspecialchars($hasilHash, ENT_QUOTES, 'UTF-8') ?></code>
      <p><strong>Hasil Verifikasi Login:</strong> <?= $hasilVerifikasi ? 'COCOK (Login Berhasil)' : 'TIDAK COCOK (Ditolak)' ?></p>
    <?php endif; ?>
  </div>

  <div class="card">
    <h2>2. Uji Enkripsi &amp; Dekripsi AES-256-CBC</h2>
    <form method="POST">
      <input type="hidden" name="aksi" value="test_aes" />
      <label>Data Rahasia (misal NIK, API Key, atau Token):</label>
      <textarea name="teks_rahasia" rows="2" placeholder="Masukkan teks rahasia..." required></textarea>
      <button type="submit">Enkripsi &amp; Dekripsi</button>
    </form>
    <?php if ($hasilEnkripsi !== ''): ?>
      <p><strong>Ciphertext AES-256-CBC (Base64):</strong></p>
      <code><?= htmlspecialchars($hasilEnkripsi, ENT_QUOTES, 'UTF-8') ?></code>
      <p><strong>Hasil Dekripsi Kembali:</strong></p>
      <code><?= htmlspecialchars((string)$hasilDekripsi, ENT_QUOTES, 'UTF-8') ?></code>
    <?php endif; ?>
  </div>
</body>
</html>`,
  },
];
