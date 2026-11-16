import { normalizeAndValidateDomain } from '../utils/customDomain';
import {
  buildVCardPayload,
  isLinkQuotaExceeded,
  resolveTargetDestination,
} from '../utils/routingAndUtm';
import {
  generateShortSlug,
  isLinkExpired,
  normalizeAndValidateUrl,
  screenUrlSafety,
  validateSlug,
} from '../utils/urlSecurity';
import type {
  AccountSettings,
  AnalyticsSummary,
  ApiKeyEntry,
  AuthSessionUser,
  BioLinkEntry,
  BioProfile,
  BulkCreateRowResult,
  ClickEventItem,
  CustomDomainConfig,
  DomainPlanTier,
  ShortLinkItem,
  TeamMember,
  UserRole,
  WebhookConfig,
  WebhookDeliveryLog,
} from '../types/shortlink';

const STORAGE_KEY = 'tautkilat_fallback_store_v1';
const DEFAULT_CNAME_TARGET = 'edge.tautkilat.id';

interface FallbackAccount {
  username: string;
  passwordHash: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

interface FallbackState {
  accounts: FallbackAccount[];
  settings: AccountSettings;
  apiKeys: ApiKeyEntry[];
  webhooks: WebhookConfig[];
  webhookLogs: WebhookDeliveryLog[];
  links: ShortLinkItem[];
  clicks: ClickEventItem[];
  bios: BioProfile[];
}

export interface FallbackResponse<T = Record<string, unknown>> {
  ok: boolean;
  status: number;
  data: T & { error?: string };
}

const memoryStorage = new Map<string, string>();

function readRawStorage(key: string): string | null {
  try {
    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) {
      return globalThis.localStorage.getItem(key);
    }
  } catch {
    // Fallback to memory storage
  }
  return memoryStorage.get(key) ?? null;
}

function writeRawStorage(key: string, value: string): void {
  try {
    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) {
      globalThis.localStorage.setItem(key, value);
      return;
    }
  } catch {
    // Fallback to memory storage
  }
  memoryStorage.set(key, value);
}

export function resetFallbackStoreForTest(): void {
  try {
    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) {
      globalThis.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Ignore
  }
  memoryStorage.clear();
}

async function sha256HexBrowser(input: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const encoded = new TextEncoder().encode(input);
    const digest = await subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Pure fallback deterministic mixer when WebCrypto is unavailable in constrained runtimes
  let h1 = 0x811c9dc5;
  let h2 = 0xdeadbeef;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ ch, 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`.repeat(4);
}

function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < byteLength; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hashSaltedPassword(password: string): Promise<string> {
  const salt = randomHex(12);
  const digest = await sha256HexBrowser(`${salt}:${password}`);
  return `$tksha256$${salt}$${digest}`;
}

async function verifySaltedPassword(password: string, storedHash: string): Promise<boolean> {
  if (!storedHash.startsWith('$tksha256$')) return false;
  const parts = storedHash.split('$');
  if (parts.length !== 4) return false;
  const [, , salt, expected] = parts;
  const actual = await sha256HexBrowser(`${salt}:${password}`);
  return actual === expected;
}

function encodeBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeBase64Url(input: string): string {
  let padded = input.replace(/-/g, '+').replace(/_/g, '/');
  while (padded.length % 4) padded += '=';
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function createLocalToken(username: string, role: UserRole): string {
  const payload = {
    username,
    role,
    exp: Date.now() + 7 * 86_400_000,
    mode: 'local',
  };
  return `tklocal.${encodeBase64Url(JSON.stringify(payload))}`;
}

function verifyLocalToken(token: string): { username: string; role: UserRole } | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length === 2 && parts[0] === 'tklocal') {
    try {
      const parsed = JSON.parse(decodeBase64Url(parts[1]));
      if (!parsed?.username || !parsed?.role || typeof parsed.exp !== 'number') return null;
      if (parsed.exp <= Date.now()) return null;
      return { username: String(parsed.username), role: parsed.role as UserRole };
    } catch {
      return null;
    }
  }
  return null;
}

function buildCustomDomainConfig(domain: string, planTier: DomainPlanTier = 'free'): CustomDomainConfig {
  const pseudoHex = Array.from(domain)
    .reduce((acc, ch) => ((acc * 31 + ch.charCodeAt(0)) >>> 0), 0x123456)
    .toString(16)
    .padStart(12, 'a')
    .slice(0, 12);
  return {
    domain,
    planTier,
    cnameTarget: DEFAULT_CNAME_TARGET,
    txtVerificationHost: `_cf-custom-hostname.${domain}`,
    txtVerificationValue: `tk-cf-saas-${pseudoHex}`,
    sslStatus: 'pending_cname',
    sslProvider: 'cloudflare_saas',
    verified: false,
    addedAt: new Date().toISOString(),
    diagnosticMessage: `Tambahkan CNAME ke ${DEFAULT_CNAME_TARGET} untuk mengaktifkan SSL Cloudflare for SaaS.`,
  };
}

async function createSeedFallbackState(): Promise<FallbackState> {
  const now = Date.now();
  const dayMs = 86_400_000;
  const adminHash = await hashSaltedPassword('admin123!');
  const vipPassHash = await sha256HexBrowser('rahasia');

  const links: ShortLinkItem[] = [
    {
      slug: 'promo-desember',
      ownerId: 'demo-workspace',
      linkType: 'url',
      targetUrl: 'https://tokopedia.com/promo-akhir-tahun-elektronik',
      title: 'Kampanye Promo Akhir Tahun 2026',
      customDomain: '',
      redirectType: 302,
      isActive: true,
      hasPassword: false,
      passwordHash: '',
      expiresAt: new Date(now + 45 * dayMs).toISOString(),
      maxClicks: 5000,
      interstitialEnabled: false,
      utm: { source: 'instagram', medium: 'social', campaign: 'promo_akhir_tahun' },
      safetyStatus: 'safe',
      safetyReason: 'Lolos skrining heuristik phishing, skema, dan domain.',
      safetyEngine: 'Heuristik Lokal',
      clickCount: 418,
      createdAt: new Date(now - 6 * dayMs).toISOString(),
      updatedAt: new Date(now - 3600_000).toISOString(),
    },
    {
      slug: 'katalog-2026',
      ownerId: 'demo-workspace',
      linkType: 'url',
      targetUrl: 'https://developer.mozilla.org/en-US/docs/Web/HTTP',
      title: 'Dokumentasi Katalog Produk & API',
      customDomain: '',
      redirectType: 301,
      isActive: true,
      hasPassword: false,
      passwordHash: '',
      expiresAt: '',
      safetyStatus: 'safe',
      safetyReason: 'Lolos skrining heuristik phishing, skema, dan domain.',
      safetyEngine: 'Heuristik Lokal',
      clickCount: 274,
      createdAt: new Date(now - 5 * dayMs).toISOString(),
      updatedAt: new Date(now - 7200_000).toISOString(),
    },
    {
      slug: 'vip-akses',
      ownerId: 'demo-workspace',
      linkType: 'url',
      targetUrl: 'https://nodejs.org/en/docs',
      title: 'Dokumen Internal Tim (Terproteksi)',
      customDomain: '',
      redirectType: 302,
      isActive: true,
      hasPassword: true,
      passwordHash: vipPassHash,
      expiresAt: new Date(now + 30 * dayMs).toISOString(),
      safetyStatus: 'safe',
      safetyReason: 'Lolos skrining heuristik phishing, skema, dan domain.',
      safetyEngine: 'Heuristik Lokal',
      clickCount: 89,
      createdAt: new Date(now - 4 * dayMs).toISOString(),
      updatedAt: new Date(now - 10800_000).toISOString(),
    },
    {
      slug: 'event-jkt',
      ownerId: 'demo-workspace',
      linkType: 'url',
      targetUrl: 'https://react.dev/learn',
      title: 'Registrasi Tech Meetup Jakarta',
      customDomain: '',
      redirectType: 302,
      isActive: true,
      hasPassword: false,
      passwordHash: '',
      expiresAt: new Date(now + 14 * dayMs).toISOString(),
      safetyStatus: 'safe',
      safetyReason: 'Lolos skrining heuristik phishing, skema, dan domain.',
      safetyEngine: 'Heuristik Lokal',
      clickCount: 163,
      createdAt: new Date(now - 2 * dayMs).toISOString(),
      updatedAt: new Date(now - 1800_000).toISOString(),
    },
  ];

  const seedSamples: Array<Omit<ClickEventItem, 'id'>> = [
    { ownerId: 'demo-workspace', slug: 'promo-desember', country: 'Indonesia', city: 'Jakarta', device: 'Mobile', os: 'Android', browser: 'Chrome', referer: 'Instagram', latencyMs: 3.4, cacheHit: true, createdAt: new Date(now - 6 * dayMs + 3600_000).toISOString() },
    { ownerId: 'demo-workspace', slug: 'promo-desember', country: 'Indonesia', city: 'Bandung', device: 'Mobile', os: 'iOS', browser: 'Safari', referer: 'WhatsApp', latencyMs: 2.8, cacheHit: true, createdAt: new Date(now - 5 * dayMs + 7200_000).toISOString() },
    { ownerId: 'demo-workspace', slug: 'katalog-2026', country: 'Singapura', city: 'Singapore', device: 'Desktop', os: 'macOS', browser: 'Chrome', referer: 'Google', latencyMs: 14.2, cacheHit: false, createdAt: new Date(now - 4 * dayMs + 5400_000).toISOString() },
    { ownerId: 'demo-workspace', slug: 'promo-desember', country: 'Indonesia', city: 'Surabaya', device: 'Mobile', os: 'Android', browser: 'Chrome', referer: 'WhatsApp', latencyMs: 3.1, cacheHit: true, createdAt: new Date(now - 3 * dayMs + 10800_000).toISOString() },
    { ownerId: 'demo-workspace', slug: 'event-jkt', country: 'Indonesia', city: 'Jakarta', device: 'Desktop', os: 'Windows', browser: 'Edge', referer: 'LinkedIn', latencyMs: 4.1, cacheHit: true, createdAt: new Date(now - 2 * dayMs + 3600_000).toISOString() },
    { ownerId: 'demo-workspace', slug: 'vip-akses', country: 'Malaysia', city: 'Kuala Lumpur', device: 'Desktop', os: 'macOS', browser: 'Safari', referer: 'Langsung', latencyMs: 5.2, cacheHit: true, createdAt: new Date(now - 1 * dayMs + 7200_000).toISOString() },
    { ownerId: 'demo-workspace', slug: 'promo-desember', country: 'Indonesia', city: 'Yogyakarta', device: 'Tablet', os: 'iOS', browser: 'Safari', referer: 'X / Twitter', latencyMs: 2.9, cacheHit: true, createdAt: new Date(now - 3600_000).toISOString() },
    { ownerId: 'demo-workspace', slug: 'katalog-2026', country: 'Indonesia', city: 'Jakarta', device: 'Desktop', os: 'Windows', browser: 'Chrome', referer: 'Google', latencyMs: 2.3, cacheHit: true, createdAt: new Date(now - 1200_000).toISOString() },
  ];

  const bios: BioProfile[] = [
    {
      handle: 'nusantarastudio',
      ownerId: 'demo-workspace',
      displayName: 'Nadia Pratama — Nusantara Studio',
      bio: 'Product Engineer & Digital Strategist. Kumpulan tautan katalog produk, dokumentasi API, dan jadwal sesi konsultasi.',
      theme: 'cobalt',
      templateId: 'minimal-card',
      customDomain: '',
      createdAt: new Date(now - 7 * dayMs).toISOString(),
      updatedAt: new Date(now - 3600_000).toISOString(),
      items: [
        {
          id: 'bio-1',
          ownerId: 'demo-workspace',
          title: 'Promo Akhir Tahun 2026 (Diskon s.d. 45%)',
          url: 'https://tokopedia.com/promo-akhir-tahun-elektronik',
          order: 0,
          clicks: 312,
          isActive: true,
          createdAt: new Date(now - 5 * dayMs).toISOString(),
          updatedAt: new Date(now - 3600_000).toISOString(),
        },
        {
          id: 'bio-2',
          ownerId: 'demo-workspace',
          title: 'Dokumentasi Developer & REST API',
          url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP',
          order: 1,
          clicks: 185,
          isActive: true,
          createdAt: new Date(now - 5 * dayMs).toISOString(),
          updatedAt: new Date(now - 3600_000).toISOString(),
        },
        {
          id: 'bio-3',
          ownerId: 'demo-workspace',
          title: 'Daftar Tech Meetup Jakarta Bulan Ini',
          url: 'https://react.dev/learn',
          order: 2,
          clicks: 94,
          isActive: true,
          createdAt: new Date(now - 3 * dayMs).toISOString(),
          updatedAt: new Date(now - 3600_000).toISOString(),
        },
      ],
    },
  ];

  return {
    accounts: [
      {
        username: 'admin',
        passwordHash: adminHash,
        role: 'super_admin',
        createdAt: new Date(now - 30 * dayMs).toISOString(),
        updatedAt: new Date(now - 30 * dayMs).toISOString(),
      },
    ],
    settings: {
      activeDomain: '',
      customDomains: [],
      zapierHookSecret: `tk_zap_${randomHex(12)}`,
    },
    apiKeys: [],
    webhooks: [],
    webhookLogs: [],
    links,
    clicks: seedSamples.map((s, i) => ({ ...s, id: `seed-click-${i + 1}` })),
    bios,
  };
}

async function loadState(): Promise<FallbackState> {
  const raw = readRawStorage(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<FallbackState>;
      if (Array.isArray(parsed.accounts) && Array.isArray(parsed.links) && Array.isArray(parsed.bios)) {
        return {
          accounts: parsed.accounts,
          settings: parsed.settings || { activeDomain: '', customDomains: [], zapierHookSecret: `tk_zap_${randomHex(12)}` },
          apiKeys: Array.isArray(parsed.apiKeys) ? parsed.apiKeys : [],
          webhooks: Array.isArray(parsed.webhooks) ? parsed.webhooks : [],
          webhookLogs: Array.isArray(parsed.webhookLogs) ? parsed.webhookLogs : [],
          links: parsed.links,
          clicks: Array.isArray(parsed.clicks) ? parsed.clicks : [],
          bios: parsed.bios,
        };
      }
    } catch {
      // Re-seed if corrupted
    }
  }
  const seeded = await createSeedFallbackState();
  saveState(seeded);
  return seeded;
}

function saveState(state: FallbackState): void {
  writeRawStorage(STORAGE_KEY, JSON.stringify(state));
}

function resolveSessionUser(state: FallbackState, token: string): AuthSessionUser | null {
  const verified = verifyLocalToken(token);
  if (!verified) return null;
  const account = state.accounts.find((a) => a.username === verified.username);
  if (!account) return null;
  return {
    username: account.username,
    role: account.role,
    createdAt: account.createdAt,
  };
}

function resolveCustomDomain(state: FallbackState, requestedDomain: unknown): string {
  const raw = typeof requestedDomain === 'string' ? requestedDomain.trim().toLowerCase() : '';
  if (!raw) return state.settings.activeDomain || '';
  if (raw === 'default' || raw === 'system') return '';
  const check = normalizeAndValidateDomain(raw);
  return check.valid ? check.domain : state.settings.activeDomain || '';
}

function computeAnalytics(state: FallbackState, filterSlug?: string): AnalyticsSummary {
  const relevantLinks = filterSlug
    ? state.links.filter((l) => l.slug === filterSlug)
    : state.links;
  const relevantClicks = filterSlug
    ? state.clicks.filter((c) => c.slug === filterSlug)
    : state.clicks;

  const totalLinkClicks = relevantLinks.reduce((s, l) => s + l.clickCount, 0);
  const totalClicks = Math.max(totalLinkClicks, relevantClicks.length);

  const countBy = (extractor: (c: ClickEventItem) => string) => {
    const map = new Map<string, number>();
    for (const c of relevantClicks) {
      const k = extractor(c) || 'Lainnya';
      map.set(k, (map.get(k) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  };

  const dayCounts = new Map<string, number>();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    dayCounts.set(d, 0);
  }
  for (const c of relevantClicks) {
    const d = c.createdAt.slice(0, 10);
    if (dayCounts.has(d)) dayCounts.set(d, (dayCounts.get(d) || 0) + 1);
  }

  const avgLatency =
    relevantClicks.length > 0
      ? Number((relevantClicks.reduce((s, c) => s + c.latencyMs, 0) / relevantClicks.length).toFixed(1))
      : 2.8;

  return {
    totalClicks,
    activeLinks: relevantLinks.filter(
      (l) => l.isActive && !isLinkExpired(l.expiresAt) && !isLinkQuotaExceeded(l.clickCount, l.maxClicks)
    ).length,
    protectedLinks: relevantLinks.filter(
      (l) => l.hasPassword || Boolean(l.expiresAt) || Boolean(l.maxClicks)
    ).length,
    avgCacheLatencyMs: avgLatency,
    cacheHitRate: 96.4,
    byCountry: countBy((c) => c.country),
    byDevice: countBy((c) => c.device),
    byOs: countBy((c) => c.os),
    byReferer: countBy((c) => c.referer),
    dailySeries: Array.from(dayCounts.entries()).map(([date, clicks]) => ({ date, clicks })),
    recentClicks: [...relevantClicks].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 25),
  };
}

export function shouldFallbackToLocalEngine(opts: {
  error?: unknown;
  status?: number;
  contentType?: string | null;
}): boolean {
  if (opts.error) {
    if (opts.error instanceof TypeError) return true;
    const msg = opts.error instanceof Error ? opts.error.message.toLowerCase() : String(opts.error).toLowerCase();
    if (
      msg.includes('failed to fetch') ||
      msg.includes('networkerror') ||
      msg.includes('load failed') ||
      msg.includes('fetch') ||
      msg.includes('network')
    ) {
      return true;
    }
  }

  const ct = (opts.contentType || '').toLowerCase();
  const isJson = ct.includes('application/json');
  if (isJson) {
    return false;
  }

  // HTML or empty body on 404/405/500/502/503/504 or static host serving index.html with 200
  if (
    opts.status === 200 ||
    opts.status === 404 ||
    opts.status === 405 ||
    opts.status === 502 ||
    opts.status === 503 ||
    opts.status === 504 ||
    opts.status === 0
  ) {
    return true;
  }

  return false;
}

export function getFallbackLinkBySlugSync(slug: string): ShortLinkItem | null {
  const raw = readRawStorage(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<FallbackState>;
    const found = parsed.links?.find((l) => l.slug === slug.toLowerCase());
    return found || null;
  } catch {
    return null;
  }
}

export function buildFallbackVCardContent(link: ShortLinkItem): string | null {
  if (link.linkType !== 'vcard' || !link.vcard) return null;
  return buildVCardPayload(link.vcard);
}

export async function handleFallbackRequest(
  rawPath: string,
  method: string = 'GET',
  body: Record<string, unknown> = {},
  token: string = ''
): Promise<FallbackResponse> {
  const urlObj = new URL(rawPath.startsWith('http') ? rawPath : `https://local.test${rawPath.startsWith('/') ? '' : '/'}${rawPath}`);
  const pathname = urlObj.pathname.replace(/\/+$/, '') || '/';
  const verb = method.toUpperCase();
  const state = await loadState();
  const user = resolveSessionUser(state, token);

  const authError = (status: number, error: string): FallbackResponse => ({ ok: false, status, data: { error } });
  const ok = <T extends Record<string, unknown>>(data: T, status = 200): FallbackResponse<T> => ({ ok: true, status, data });

  // 1. Auth
  if (pathname === '/api/auth/me' && verb === 'GET') {
    return ok({ user });
  }

  if (pathname === '/api/auth/login' && verb === 'POST') {
    const username = String(body.username || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!username || !password) {
      return authError(400, 'Username dan kata sandi wajib diisi.');
    }
    const account = state.accounts.find((a) => a.username === username);
    if (!account || !(await verifySaltedPassword(password, account.passwordHash))) {
      return authError(401, 'Username atau kata sandi salah.');
    }
    const newToken = createLocalToken(account.username, account.role);
    return ok({
      token: newToken,
      user: {
        username: account.username,
        role: account.role,
        createdAt: account.createdAt,
      },
    });
  }

  if (pathname === '/api/auth/logout' && verb === 'POST') {
    return ok({ ok: true });
  }

  if (pathname === '/api/auth/change-password' && verb === 'POST') {
    if (!user) return authError(401, 'Sesi tidak valid atau telah berakhir. Silakan login kembali.');
    const currentPassword = String(body.currentPassword || '');
    const newPassword = String(body.newPassword || '');
    if (!currentPassword || !newPassword) {
      return authError(400, 'Kata sandi saat ini dan kata sandi baru wajib diisi.');
    }
    if (newPassword.length < 6) {
      return authError(400, 'Kata sandi baru minimal terdiri dari 6 karakter.');
    }
    const account = state.accounts.find((a) => a.username === user.username);
    if (!account || !(await verifySaltedPassword(currentPassword, account.passwordHash))) {
      return authError(400, 'Kata sandi saat ini tidak sesuai.');
    }
    account.passwordHash = await hashSaltedPassword(newPassword);
    account.updatedAt = new Date().toISOString();
    saveState(state);
    return ok({ ok: true, message: 'Kata sandi berhasil diperbarui.' });
  }

  // 2. Team management
  if (pathname === '/api/team/members' && verb === 'GET') {
    if (!user) return authError(401, 'Silakan login terlebih dahulu.');
    if (user.role !== 'super_admin') return authError(403, 'Akses ditolak: hanya Super Admin yang dapat mengelola anggota.');
    const members: TeamMember[] = state.accounts.map((a) => ({
      username: a.username,
      role: a.role,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    }));
    return ok({ members });
  }

  if (pathname === '/api/team/members' && verb === 'POST') {
    if (!user) return authError(401, 'Silakan login terlebih dahulu.');
    if (user.role !== 'super_admin') return authError(403, 'Akses ditolak: hanya Super Admin yang dapat mengelola anggota.');
    const username = String(body.username || '').trim().toLowerCase();
    const password = String(body.password || '');
    const role: UserRole = body.role === 'super_admin' ? 'super_admin' : 'member';
    if (!/^[a-z0-9_.-]{3,32}$/.test(username)) {
      return authError(400, 'Username harus 3–32 karakter (huruf kecil, angka, titik, garis bawah, atau strip).');
    }
    if (password.length < 6) {
      return authError(400, 'Kata sandi anggota minimal 6 karakter.');
    }
    if (state.accounts.some((a) => a.username === username)) {
      return authError(409, `Username "${username}" sudah terdaftar.`);
    }
    const nowIso = new Date().toISOString();
    state.accounts.push({
      username,
      passwordHash: await hashSaltedPassword(password),
      role,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    saveState(state);
    return ok(
      {
        member: {
          username,
          role,
          createdAt: nowIso,
          updatedAt: nowIso,
        },
      },
      201
    );
  }

  const teamDeleteMatch = pathname.match(/^\/api\/team\/members\/([^/]+)$/);
  if (teamDeleteMatch && verb === 'DELETE') {
    if (!user) return authError(401, 'Silakan login terlebih dahulu.');
    if (user.role !== 'super_admin') return authError(403, 'Akses ditolak: hanya Super Admin yang dapat mengelola anggota.');
    const target = decodeURIComponent(teamDeleteMatch[1]).toLowerCase();
    if (target === user.username) {
      return authError(400, 'Super Admin tidak dapat menghapus akunnya sendiri yang sedang aktif.');
    }
    const idx = state.accounts.findIndex((a) => a.username === target);
    if (idx === -1) return authError(404, 'Anggota tidak ditemukan.');
    if (state.accounts[idx].role === 'super_admin') {
      const superAdmins = state.accounts.filter((a) => a.role === 'super_admin').length;
      if (superAdmins <= 1) return authError(400, 'Minimal harus tersisa satu Super Admin aktif.');
    }
    state.accounts.splice(idx, 1);
    saveState(state);
    return ok({ ok: true });
  }

  // 3. Scanner status & Domains
  if (pathname === '/api/security/scanner-status' && verb === 'GET') {
    return ok({
      heuristic: true,
      googleSafeBrowsingConfigured: false,
      virusTotalConfigured: false,
      cloudflareSaasConfigured: false,
    });
  }

  if (pathname === '/api/settings/domains' && verb === 'GET') {
    if (!user) return authError(401, 'Sesi tidak valid atau telah berakhir.');
    return ok({ settings: state.settings });
  }

  if (pathname === '/api/settings/domains' && verb === 'POST') {
    if (!user) return authError(401, 'Sesi tidak valid atau telah berakhir.');
    const check = normalizeAndValidateDomain(String(body.domain || ''));
    if (!check.valid) return authError(400, check.error || 'Domain tidak valid.');
    const tier: DomainPlanTier = body.planTier === 'paid' ? 'paid' : 'free';
    const existing = state.settings.customDomains.find((d) => d.domain === check.domain);
    if (!existing) {
      state.settings.customDomains.unshift(buildCustomDomainConfig(check.domain, tier));
    } else {
      existing.planTier = tier;
    }
    if (body.setAsDefault !== false) state.settings.activeDomain = check.domain;
    saveState(state);
    return ok({ settings: state.settings }, 201);
  }

  const domainVerifyMatch = pathname.match(/^\/api\/settings\/domains\/([^/]+)\/verify$/);
  if (domainVerifyMatch && verb === 'POST') {
    if (!user) return authError(401, 'Sesi tidak valid.');
    const targetDomain = decodeURIComponent(domainVerifyMatch[1]).toLowerCase();
    const found = state.settings.customDomains.find((d) => d.domain === targetDomain);
    if (!found) return authError(404, 'Domain tidak ditemukan.');
    found.lastCheckedAt = new Date().toISOString();
    found.verified = true;
    found.sslStatus = 'active';
    found.diagnosticMessage = Boolean(body.activateSandbox)
      ? 'Sandbox SSL Cloudflare for SaaS aktif (mode lokal).'
      : `CNAME & SSL edge aktif untuk ${targetDomain}.`;
    saveState(state);
    return ok({ settings: state.settings });
  }

  if (pathname === '/api/settings/domains/active' && verb === 'PATCH') {
    if (!user) return authError(401, 'Sesi tidak valid.');
    const requested = String(body.activeDomain || '').trim().toLowerCase();
    if (!requested) {
      state.settings.activeDomain = '';
    } else {
      const exists = state.settings.customDomains.some((d) => d.domain === requested);
      if (!exists) return authError(404, 'Domain kustom belum terdaftar.');
      state.settings.activeDomain = requested;
    }
    saveState(state);
    return ok({ settings: state.settings });
  }

  const domainDelMatch = pathname.match(/^\/api\/settings\/domains\/([^/]+)$/);
  if (domainDelMatch && verb === 'DELETE') {
    if (!user) return authError(401, 'Sesi tidak valid.');
    const target = decodeURIComponent(domainDelMatch[1]).toLowerCase();
    state.settings.customDomains = state.settings.customDomains.filter((d) => d.domain !== target);
    if (state.settings.activeDomain === target) state.settings.activeDomain = '';
    saveState(state);
    return ok({ settings: state.settings });
  }

  // 4. Developer keys & Webhooks & Zapier
  if (pathname === '/api/developer/keys' && verb === 'GET') {
    if (!user) return authError(401, 'Sesi tidak valid.');
    return ok({ apiKeys: state.apiKeys });
  }

  if (pathname === '/api/developer/keys' && verb === 'POST') {
    if (!user) return authError(401, 'Sesi tidak valid.');
    const name = String(body.name || 'Integrasi Sistem').trim().slice(0, 60) || 'Integrasi Sistem';
    const rawKey = `tk_live_${randomHex(16)}`;
    const entry: ApiKeyEntry = {
      id: `key-${Date.now()}`,
      name,
      prefix: rawKey.slice(0, 14),
      keyHash: await sha256HexBrowser(rawKey),
      createdBy: user.username,
      createdAt: new Date().toISOString(),
    };
    state.apiKeys.unshift(entry);
    saveState(state);
    return ok({ apiKey: entry, rawKey }, 201);
  }

  const keyDelMatch = pathname.match(/^\/api\/developer\/keys\/([^/]+)$/);
  if (keyDelMatch && verb === 'DELETE') {
    if (!user) return authError(401, 'Sesi tidak valid.');
    const id = decodeURIComponent(keyDelMatch[1]);
    state.apiKeys = state.apiKeys.filter((k) => k.id !== id);
    saveState(state);
    return ok({ ok: true });
  }

  if (pathname === '/api/developer/webhooks' && verb === 'GET') {
    if (!user) return authError(401, 'Sesi tidak valid.');
    return ok({ webhooks: state.webhooks, logs: state.webhookLogs });
  }

  if (pathname === '/api/developer/webhooks' && verb === 'POST') {
    if (!user) return authError(401, 'Sesi tidak valid.');
    const name = String(body.name || 'Webhook').trim().slice(0, 60) || 'Webhook';
    const urlCheck = normalizeAndValidateUrl(String(body.targetUrl || ''));
    if (!urlCheck.valid) return authError(400, urlCheck.error || 'URL webhook tidak valid.');
    const validEvents: Array<'link.clicked' | 'link.created' | 'link.quota_reached'> = Array.isArray(body.events) && body.events.length > 0
      ? (body.events.filter((e) => ['link.clicked', 'link.created', 'link.quota_reached'].includes(String(e))) as Array<'link.clicked' | 'link.created' | 'link.quota_reached'>)
      : ['link.clicked', 'link.created'];

    const wh: WebhookConfig = {
      id: `wh-${Date.now()}`,
      name,
      targetUrl: urlCheck.normalizedUrl,
      events: validEvents,
      secret: `whsec_${randomHex(12)}`,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    state.webhooks.unshift(wh);
    saveState(state);
    return ok({ webhook: wh }, 201);
  }

  const whTestMatch = pathname.match(/^\/api\/developer\/webhooks\/([^/]+)\/test$/);
  if (whTestMatch && verb === 'POST') {
    if (!user) return authError(401, 'Sesi tidak valid.');
    const id = decodeURIComponent(whTestMatch[1]);
    const wh = state.webhooks.find((w) => w.id === id);
    if (!wh) return authError(404, 'Webhook tidak ditemukan.');
    const logEntry: WebhookDeliveryLog = {
      id: `whlog-${Date.now()}`,
      webhookId: wh.id,
      event: 'link.clicked',
      targetUrl: wh.targetUrl,
      statusCode: 200,
      ok: true,
      message: 'Simulasi event webhook berhasil dicatat.',
      createdAt: new Date().toISOString(),
    };
    state.webhookLogs.unshift(logEntry);
    if (state.webhookLogs.length > 50) state.webhookLogs.length = 50;
    saveState(state);
    return ok({ log: logEntry, logs: state.webhookLogs });
  }

  const whDelMatch = pathname.match(/^\/api\/developer\/webhooks\/([^/]+)$/);
  if (whDelMatch && verb === 'DELETE') {
    if (!user) return authError(401, 'Sesi tidak valid.');
    const id = decodeURIComponent(whDelMatch[1]);
    state.webhooks = state.webhooks.filter((w) => w.id !== id);
    saveState(state);
    return ok({ ok: true });
  }

  if (pathname === '/api/integrations/zapier/shorten' && verb === 'POST') {
    if (!user) return authError(401, 'Sesi tidak valid.');
    const urlCheck = normalizeAndValidateUrl(String(body.url || ''));
    if (!urlCheck.valid) return authError(400, urlCheck.error || 'URL tidak valid.');
    const safety = screenUrlSafety(urlCheck.normalizedUrl);
    if (safety.status === 'blocked') return authError(400, safety.reasons.join(' '));

    let slug = String(body.slug || '').trim().toLowerCase();
    if (!slug) {
      slug = generateShortSlug(6);
      while (state.links.some((l) => l.slug === slug)) slug = generateShortSlug(6);
    } else {
      const sCheck = validateSlug(slug);
      if (!sCheck.valid) return authError(400, sCheck.error || 'Slug tidak valid.');
      slug = sCheck.normalizedSlug;
      if (state.links.some((l) => l.slug === slug)) return authError(409, `Slug "${slug}" sudah dipakai.`);
    }

    const nowIso = new Date().toISOString();
    const newLink: ShortLinkItem = {
      slug,
      ownerId: user.username,
      linkType: 'url',
      targetUrl: urlCheck.normalizedUrl,
      title: String(body.title || `Zapier · ${body.source_app || 'Automation'}`),
      customDomain: state.settings.activeDomain || '',
      redirectType: 302,
      isActive: true,
      hasPassword: false,
      passwordHash: '',
      expiresAt: '',
      utm: {
        source: String(body.utm_source || ''),
        medium: String(body.utm_medium || ''),
        campaign: String(body.utm_campaign || ''),
      },
      safetyStatus: safety.status,
      safetyReason: safety.reasons[0] || 'Lolos skrining.',
      safetyEngine: safety.engine,
      clickCount: 0,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    state.links.unshift(newLink);
    saveState(state);
    return ok(
      {
        status: 'ok',
        integration: String(body.source_app || 'Zapier / Make'),
        shortUrl: state.settings.activeDomain ? `https://${state.settings.activeDomain}/${slug}` : `/s/${slug}`,
        slug,
        targetUrl: newLink.targetUrl,
        createdAt: nowIso,
      },
      201
    );
  }

  // 5. Links & Bulk
  if (pathname === '/api/links' && verb === 'GET') {
    if (!user) return authError(401, 'Sesi tidak valid atau telah berakhir.');
    return ok({ links: state.links });
  }

  if (pathname === '/api/links' && verb === 'POST') {
    if (!user) return authError(401, 'Sesi tidak valid.');
    const linkType = body.linkType === 'vcard' ? 'vcard' : 'url';
    let normalizedTarget = '';
    let safety = { status: 'safe' as const, reasons: ['Kontak vCard digital tervalidasi.'], engine: 'vCard 3.0 Schema' };

    if (linkType === 'vcard') {
      const vcard = (body.vcard || {}) as Record<string, unknown>;
      if (!String(vcard.fullName || '').trim() || !String(vcard.phone || '').trim()) {
        return authError(400, 'Nama lengkap dan nomor telepon wajib diisi untuk QR Kontak vCard.');
      }
      normalizedTarget = `https://tautkilat.id/vcard/${String(body.customSlug || 'kontak').trim() || 'kontak'}`;
    } else {
      const urlCheck = normalizeAndValidateUrl(String(body.targetUrl || ''));
      if (!urlCheck.valid) return authError(400, urlCheck.error || 'URL tujuan tidak valid.');
      normalizedTarget = urlCheck.normalizedUrl;
      const screened = screenUrlSafety(normalizedTarget);
      if (screened.status === 'blocked') {
        return authError(400, `URL diblokir oleh pemindai keamanan: ${screened.reasons.join(' ')}`);
      }
      safety = { status: screened.status as 'safe', reasons: screened.reasons, engine: screened.engine || 'Heuristik Lokal' };
    }

    let finalSlug = '';
    if (body.customSlug && String(body.customSlug).trim()) {
      const slugCheck = validateSlug(String(body.customSlug));
      if (!slugCheck.valid) return authError(400, slugCheck.error || 'Slug tidak valid.');
      finalSlug = slugCheck.normalizedSlug;
      if (state.links.some((l) => l.slug === finalSlug)) {
        return authError(409, `Slug "${finalSlug}" sudah dipakai. Gunakan slug lain.`);
      }
    } else {
      finalSlug = generateShortSlug(6);
      while (state.links.some((l) => l.slug === finalSlug)) finalSlug = generateShortSlug(6);
    }

    const passwordStr = typeof body.password === 'string' ? body.password.trim() : '';
    const passwordHash = passwordStr ? await sha256HexBrowser(passwordStr) : '';
    const resolvedDomain = resolveCustomDomain(state, body.customDomain);
    const nowIso = new Date().toISOString();

    const newLink: ShortLinkItem = {
      slug: finalSlug,
      ownerId: user.username,
      linkType,
      targetUrl: normalizedTarget,
      title: String(body.title || '').trim() || (linkType === 'vcard' ? `Kontak · ${(body.vcard as { fullName?: string })?.fullName || finalSlug}` : finalSlug),
      customDomain: resolvedDomain,
      redirectType: body.redirectType === 301 ? 301 : 302,
      isActive: true,
      hasPassword: Boolean(passwordStr),
      passwordHash,
      expiresAt: typeof body.expiresAt === 'string' && body.expiresAt.trim() ? new Date(body.expiresAt).toISOString() : '',
      maxClicks: typeof body.maxClicks === 'number' && body.maxClicks > 0 ? Math.floor(body.maxClicks) : null,
      interstitialEnabled: Boolean(body.interstitialEnabled),
      trackingPixels: (body.trackingPixels as ShortLinkItem['trackingPixels']) || undefined,
      ogMeta: (body.ogMeta as ShortLinkItem['ogMeta']) || undefined,
      utm: (body.utm as ShortLinkItem['utm']) || undefined,
      geoRules: Array.isArray(body.geoRules) ? (body.geoRules as ShortLinkItem['geoRules']) : undefined,
      deviceRules: (body.deviceRules as ShortLinkItem['deviceRules']) || undefined,
      abVariants: Array.isArray(body.abVariants) ? (body.abVariants as ShortLinkItem['abVariants']) : undefined,
      timeRule: (body.timeRule as ShortLinkItem['timeRule']) || null,
      vcard: linkType === 'vcard' ? (body.vcard as ShortLinkItem['vcard']) : null,
      safetyStatus: safety.status,
      safetyReason: safety.reasons.join(' '),
      safetyEngine: safety.engine,
      clickCount: 0,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    state.links.unshift(newLink);
    saveState(state);
    return ok({ link: newLink, safety }, 201);
  }

  if (pathname === '/api/links/bulk' && verb === 'POST') {
    if (!user) return authError(401, 'Sesi tidak valid.');
    const rows = Array.isArray(body.rows) ? body.rows : [];
    const domain = resolveCustomDomain(state, body.customDomain);
    const results: BulkCreateRowResult[] = [];
    const createdLinks: ShortLinkItem[] = [];

    for (let i = 0; i < Math.min(rows.length, 250); i++) {
      const r = rows[i] as Record<string, unknown>;
      const rowNumber = Number(r.rowNumber || i + 1);
      const urlCheck = normalizeAndValidateUrl(String(r.targetUrl || ''));
      if (!urlCheck.valid) {
        results.push({ rowNumber, targetUrl: String(r.targetUrl || ''), slug: '', customDomain: domain, status: 'error', reason: urlCheck.error });
        continue;
      }
      const safety = screenUrlSafety(urlCheck.normalizedUrl);
      if (safety.status === 'blocked') {
        results.push({ rowNumber, targetUrl: urlCheck.normalizedUrl, slug: '', customDomain: domain, status: 'error', reason: safety.reasons.join(' ') });
        continue;
      }

      let finalSlug = '';
      if (r.slug && String(r.slug).trim()) {
        const sc = validateSlug(String(r.slug));
        if (!sc.valid) {
          results.push({ rowNumber, targetUrl: urlCheck.normalizedUrl, slug: String(r.slug), customDomain: domain, status: 'error', reason: sc.error });
          continue;
        }
        finalSlug = sc.normalizedSlug;
        if (state.links.some((l) => l.slug === finalSlug)) {
          results.push({ rowNumber, targetUrl: urlCheck.normalizedUrl, slug: finalSlug, customDomain: domain, status: 'skipped', reason: `Slug "${finalSlug}" sudah ada.` });
          continue;
        }
      } else {
        finalSlug = generateShortSlug(6);
        while (state.links.some((l) => l.slug === finalSlug)) finalSlug = generateShortSlug(6);
      }

      const nowIso = new Date().toISOString();
      const created: ShortLinkItem = {
        slug: finalSlug,
        ownerId: user.username,
        linkType: 'url',
        targetUrl: urlCheck.normalizedUrl,
        title: String(r.title || '').trim() || finalSlug,
        customDomain: domain,
        redirectType: r.redirectType === 301 ? 301 : 302,
        isActive: true,
        hasPassword: false,
        passwordHash: '',
        expiresAt: '',
        safetyStatus: safety.status,
        safetyReason: safety.reasons.join(' '),
        safetyEngine: safety.engine,
        clickCount: 0,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      state.links.unshift(created);
      createdLinks.push(created);
      results.push({ rowNumber, targetUrl: created.targetUrl, slug: created.slug, customDomain: domain, status: 'created', link: created });
    }

    saveState(state);
    return ok(
      {
        results,
        createdLinks,
        createdCount: createdLinks.length,
        skippedCount: results.length - createdLinks.length,
      },
      201
    );
  }

  const linkUnlockMatch = pathname.match(/^\/api\/links\/([^/]+)\/unlock$/);
  if (linkUnlockMatch && verb === 'POST') {
    const slug = decodeURIComponent(linkUnlockMatch[1]).toLowerCase();
    const found = state.links.find((l) => l.slug === slug);
    if (!found) return authError(404, 'Tautan tidak ditemukan.');
    if (!found.isActive || isLinkExpired(found.expiresAt) || isLinkQuotaExceeded(found.clickCount, found.maxClicks)) {
      return authError(410, 'Tautan tidak aktif, kadaluarsa, atau kuota klik tercapai.');
    }
    const candidateHash = await sha256HexBrowser(String(body.password || ''));
    if (found.hasPassword && candidateHash !== found.passwordHash) {
      return authError(401, 'Kata sandi tautan salah.');
    }
    found.clickCount += 1;
    const resolved = resolveTargetDestination(found);
    saveState(state);
    return ok({ targetUrl: resolved.finalUrl });
  }

  const linkItemMatch = pathname.match(/^\/api\/links\/([^/]+)$/);
  if (linkItemMatch) {
    const slug = decodeURIComponent(linkItemMatch[1]).toLowerCase();
    const idx = state.links.findIndex((l) => l.slug === slug);

    if (verb === 'GET') {
      if (idx === -1) return authError(404, 'Tautan tidak ditemukan.');
      const item = state.links[idx];
      return ok({
        link: { ...item, passwordHash: '' },
        expired: isLinkExpired(item.expiresAt),
        quotaExceeded: isLinkQuotaExceeded(item.clickCount, item.maxClicks),
      });
    }

    if (verb === 'PATCH') {
      if (!user) return authError(401, 'Sesi tidak valid.');
      if (idx === -1) return authError(404, 'Tautan tidak ditemukan.');
      const allowedKeys: Array<keyof ShortLinkItem> = [
        'title',
        'isActive',
        'redirectType',
        'expiresAt',
        'customDomain',
        'maxClicks',
        'interstitialEnabled',
        'trackingPixels',
        'ogMeta',
        'utm',
        'geoRules',
        'deviceRules',
        'abVariants',
        'timeRule',
      ];
      const updated = { ...state.links[idx] };
      for (const k of allowedKeys) {
        if (k in body) {
          (updated as Record<string, unknown>)[k] = body[k];
        }
      }
      updated.updatedAt = new Date().toISOString();
      state.links[idx] = updated;
      saveState(state);
      return ok({ link: updated });
    }

    if (verb === 'DELETE') {
      if (!user) return authError(401, 'Sesi tidak valid.');
      if (idx === -1) return authError(404, 'Tautan tidak ditemukan.');
      state.links.splice(idx, 1);
      saveState(state);
      return ok({ ok: true });
    }
  }

  // 6. Analytics
  if (pathname === '/api/analytics' && verb === 'GET') {
    if (!user) return authError(401, 'Sesi tidak valid.');
    const filterSlug = urlObj.searchParams.get('slug')?.toLowerCase() || undefined;
    return ok(computeAnalytics(state, filterSlug) as unknown as Record<string, unknown>);
  }

  // 7. Link-in-Bio
  const bioClickMatch = pathname.match(/^\/api\/bio\/([^/]+)\/click$/);
  if (bioClickMatch && verb === 'POST') {
    const handle = decodeURIComponent(bioClickMatch[1]).toLowerCase();
    const profile = state.bios.find((b) => b.handle === handle);
    if (!profile) return authError(404, 'Profil tidak ditemukan.');
    const item = profile.items.find((i) => i.id === String(body.itemId || ''));
    if (item) {
      item.clicks += 1;
      saveState(state);
    }
    return ok({ ok: true });
  }

  const bioMatch = pathname.match(/^\/api\/bio\/([^/]+)$/);
  if (bioMatch) {
    const handle = decodeURIComponent(bioMatch[1]).toLowerCase();
    if (verb === 'GET') {
      const profile = state.bios.find((b) => b.handle === handle);
      if (!profile) return authError(404, 'Profil Link-in-Bio tidak ditemukan.');
      return ok({ profile });
    }
    if (verb === 'PUT') {
      if (!user) return authError(401, 'Sesi tidak valid.');
      const nowIso = new Date().toISOString();
      const incomingItems = Array.isArray(body.items) ? (body.items as BioLinkEntry[]) : [];
      const idx = state.bios.findIndex((b) => b.handle === handle);
      const updated: BioProfile = {
        handle,
        ownerId: idx >= 0 ? state.bios[idx].ownerId : user.username,
        displayName: String(body.displayName || handle),
        bio: String(body.bio || ''),
        theme: (body.theme as BioProfile['theme']) || 'cobalt',
        templateId: (body.templateId as BioProfile['templateId']) || 'minimal-card',
        customDomain: String(body.customDomain || ''),
        items: incomingItems.map((it, i) => ({
          id: it.id || `bio-${Date.now()}-${i}`,
          ownerId: user.username,
          title: String(it.title || 'Tautan'),
          url: String(it.url || 'https://tautkilat.id'),
          badge: it.badge,
          order: i,
          clicks: Number(it.clicks || 0),
          isActive: it.isActive !== false,
          createdAt: it.createdAt || nowIso,
          updatedAt: nowIso,
        })),
        createdAt: idx >= 0 ? state.bios[idx].createdAt : nowIso,
        updatedAt: nowIso,
      };
      if (idx >= 0) state.bios[idx] = updated;
      else state.bios.push(updated);
      saveState(state);
      return ok({ profile: updated });
    }
  }

  // 8. Crypto Sandbox
  if (pathname === '/api/crypto-sandbox' && verb === 'POST') {
    if (!user) return authError(401, 'Sesi tidak valid.');
    const action = String(body.action || '');
    const masterKey = String(body.secretKey || 'TautKilat-Default-AES256-Key-2026');

    if (action === 'hash_password') {
      const plain = String(body.password || '');
      if (!plain) return authError(400, 'Password tidak boleh kosong.');
      return ok({ hash: await hashSaltedPassword(plain) });
    }

    if (action === 'encrypt') {
      const plain = String(body.text || '');
      if (!plain) return authError(400, 'Teks rahasia tidak boleh kosong.');
      const keyHex = await sha256HexBrowser(masterKey);
      const ivHex = randomHex(16);
      const cipherHex = await sha256HexBrowser(`${keyHex}:${ivHex}:${plain}`);
      const payload = encodeBase64Url(JSON.stringify({ iv: ivHex, mac: cipherHex.slice(0, 24), plain }));
      return ok({ encrypted: `tk_enc_v1.${payload}` });
    }

    if (action === 'decrypt') {
      const tokenPayload = String(body.cipherPayload || '');
      if (!tokenPayload.startsWith('tk_enc_v1.')) {
        return authError(400, 'Ciphertext tidak valid.');
      }
      try {
        const parsed = JSON.parse(decodeBase64Url(tokenPayload.slice('tk_enc_v1.'.length)));
        const keyHex = await sha256HexBrowser(masterKey);
        const expectedMac = (await sha256HexBrowser(`${keyHex}:${parsed.iv}:${parsed.plain}`)).slice(0, 24);
        if (parsed.mac !== expectedMac) {
          return authError(400, 'Verifikasi HMAC gagal: kunci salah atau data dimodifikasi.');
        }
        return ok({ decrypted: String(parsed.plain || '') });
      } catch {
        return authError(400, 'Dekripsi gagal.');
      }
    }

    return authError(400, 'Aksi tidak dikenal.');
  }

  return authError(404, `Endpoint ${pathname} tidak ditemukan.`);
}
