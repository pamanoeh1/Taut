import type { SafetyStatus } from '../types/shortlink';

const RESERVED_SLUGS = new Set([
  'api',
  's',
  'u',
  'admin',
  'login',
  'logout',
  'register',
  'dashboard',
  'analytics',
  'bio',
  'settings',
  'assets',
  'static',
  'health',
]);

const RISKY_TLDS = new Set(['.tk', '.ml', '.ga', '.cf', '.gq', '.zip', '.mov', '.buzz']);

const PHISHING_KEYWORDS = [
  'login-verify',
  'verify-account',
  'update-billing',
  'dana-kaget',
  'hadiah-gratis',
  'klikbca-secure',
  'brimo-verif',
  'paypal-secure',
  'wallet-connect-claim',
  'password-reset-urgent',
];

const BASE62_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

export interface UrlValidationResult {
  valid: boolean;
  normalizedUrl: string;
  error?: string;
}

const MALWARE_EXTENSIONS = ['.exe', '.scr', '.bat', '.cmd', '.msi', '.apk', '.vbs', '.ps1'];

const BRAND_TYPOSQUAT_PATTERNS = [
  'paypa1',
  'tok0pedia',
  'sh0pee',
  'go0gle',
  'micr0soft',
  'bca-klik',
  'mandiri-update',
  'bni-verifikasi',
];

export interface SafetyScreeningResult {
  status: SafetyStatus;
  score: number; // 0 (dangerous) - 100 (clean)
  reasons: string[];
  engine?: string;
}

export interface SlugValidationResult {
  valid: boolean;
  normalizedSlug: string;
  error?: string;
}

export function normalizeAndValidateUrl(rawUrl: string): UrlValidationResult {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { valid: false, normalizedUrl: '', error: 'URL tujuan tidak boleh kosong.' };
  }

  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('file:')
  ) {
    return {
      valid: false,
      normalizedUrl: '',
      error: 'Skema URL tidak diizinkan demi keamanan (hanya HTTP/HTTPS).',
    };
  }

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, normalizedUrl: '', error: 'Hanya protokol HTTP atau HTTPS yang didukung.' };
    }
    if (!parsed.hostname || !parsed.hostname.includes('.')) {
      // Allow localhost only for local dev testing if explicit
      if (parsed.hostname !== 'localhost') {
        return { valid: false, normalizedUrl: '', error: 'Nama domain pada URL tidak valid.' };
      }
    }
    if (candidate.length > 2048) {
      return { valid: false, normalizedUrl: '', error: 'Panjang URL maksimal 2048 karakter.' };
    }
    return { valid: true, normalizedUrl: parsed.toString() };
  } catch {
    return { valid: false, normalizedUrl: '', error: 'Format URL tidak valid. Contoh: https://tokopedia.com/promo' };
  }
}

export function screenUrlSafety(rawUrl: string): SafetyScreeningResult {
  const validation = normalizeAndValidateUrl(rawUrl);
  if (!validation.valid) {
    return {
      status: 'blocked',
      score: 0,
      reasons: [validation.error || 'URL tidak valid atau menggunakan skema terlarang.'],
      engine: 'Heuristik Lokal',
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(validation.normalizedUrl);
  } catch {
    return { status: 'blocked', score: 0, reasons: ['Format URL gagal diurai.'], engine: 'Heuristik Lokal' };
  }

  const reasons: string[] = [];
  let penalty = 0;

  const hostname = parsed.hostname.toLowerCase();
  const pathnameLower = parsed.pathname.toLowerCase();
  const fullLower = validation.normalizedUrl.toLowerCase();

  // 1. Credential / userinfo trick (e.g. https://trusted.com@evil.com)
  if (parsed.username || parsed.password) {
    penalty += 60;
    reasons.push('Mengandung informasi otentikasi (@) pada otoritas URL (potensi spoofing).');
  }

  // 2. Direct IP literal URL
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.startsWith('[')) {
    penalty += 45;
    reasons.push('Menggunakan alamat IP mentah tanpa domain terverifikasi.');
  }

  // 3. Punycode / IDN homoglyph attack indicator
  if (hostname.includes('xn--')) {
    penalty += 35;
    reasons.push('Domain menggunakan Punycode (xn--) yang berisiko homoglyph spoofing.');
  }

  // 4. Risky free/abuse TLDs
  for (const tld of RISKY_TLDS) {
    if (hostname.endsWith(tld)) {
      penalty += 35;
      reasons.push(`Ekstensi domain (${tld}) memiliki tingkat penyalahgunaan phishing tinggi.`);
      break;
    }
  }

  // 5. Phishing lure patterns & brand typosquatting
  for (const keyword of PHISHING_KEYWORDS) {
    if (fullLower.includes(keyword)) {
      penalty += 55;
      reasons.push(`Terindikasi pola phishing/rekayasa sosial ("${keyword}").`);
      break;
    }
  }

  for (const typo of BRAND_TYPOSQUAT_PATTERNS) {
    if (hostname.includes(typo)) {
      penalty += 60;
      reasons.push(`Terindikasi domain typosquatting / peniruan merek ("${typo}").`);
      break;
    }
  }

  // 6. Direct executable / malware payload link
  for (const ext of MALWARE_EXTENSIONS) {
    if (pathnameLower.endsWith(ext)) {
      penalty += 55;
      reasons.push(`Tautan mengarah langsung ke berkas eksekusi berisiko (${ext}).`);
      break;
    }
  }

  // 7. Excessive subdomain depth (e.g. login.secure.auth.bank.example.com)
  const labels = hostname.split('.').filter(Boolean);
  if (labels.length >= 5) {
    penalty += 20;
    reasons.push('Struktur subdomain terlalu dalam (indikasi penyamaran domain).');
  }

  // 8. Unencrypted HTTP warning (light)
  if (parsed.protocol === 'http:' && hostname !== 'localhost') {
    penalty += 15;
    reasons.push('Tautan menggunakan HTTP tanpa enkripsi TLS/HTTPS.');
  }

  const score = Math.max(0, 100 - penalty);
  if (penalty >= 55) {
    return { status: 'blocked', score, reasons, engine: 'Heuristik Lokal' };
  }
  if (penalty >= 20) {
    return { status: 'warning', score, reasons, engine: 'Heuristik Lokal' };
  }
  return {
    status: 'safe',
    score,
    reasons: reasons.length > 0 ? reasons : ['Lolos skrining heuristik phishing, skema, dan domain.'],
    engine: 'Heuristik Lokal',
  };
}

export function validateSlug(rawSlug: string): SlugValidationResult {
  const normalized = rawSlug.trim().toLowerCase();
  if (!normalized) {
    return { valid: false, normalizedSlug: '', error: 'Slug tidak boleh kosong.' };
  }
  if (normalized.length < 3 || normalized.length > 64) {
    return { valid: false, normalizedSlug: normalized, error: 'Slug harus terdiri dari 3 hingga 64 karakter.' };
  }
  if (!/^[a-z0-9_-]+$/.test(normalized)) {
    return {
      valid: false,
      normalizedSlug: normalized,
      error: 'Slug hanya boleh berisi huruf kecil, angka, tanda hubung (-), dan garis bawah (_).',
    };
  }
  if (RESERVED_SLUGS.has(normalized)) {
    return {
      valid: false,
      normalizedSlug: normalized,
      error: `Slug "${normalized}" merupakan rute sistem yang dicadangkan.`,
    };
  }
  return { valid: true, normalizedSlug: normalized };
}

export function generateShortSlug(length = 6): string {
  const safeLen = Math.max(4, Math.min(16, length));
  let out = '';
  for (let i = 0; i < safeLen; i++) {
    const idx = Math.floor(Math.random() * BASE62_ALPHABET.length);
    out += BASE62_ALPHABET[idx];
  }
  return out.toLowerCase();
}

export function isLinkExpired(expiresAt?: string | null, nowMs: number = Date.now()): boolean {
  if (!expiresAt || !expiresAt.trim()) {
    return false;
  }
  const ts = Date.parse(expiresAt);
  if (Number.isNaN(ts)) {
    return false;
  }
  return ts <= nowMs;
}
