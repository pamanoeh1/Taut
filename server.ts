import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { createServer as createViteServer } from 'vite';
import {
  parseGeoFromHeaders,
  parseRefererSource,
  parseUserAgent,
} from './src/utils/analyticsParser.ts';
import { normalizeAndValidateDomain } from './src/utils/customDomain.ts';
import { RedirectCache, SlidingWindowRateLimiter } from './src/utils/rateLimiter.ts';
import {
  buildRedirectBridgeHtml,
  buildVCardPayload,
  isLinkQuotaExceeded,
  resolveTargetDestination,
} from './src/utils/routingAndUtm.ts';
import {
  generateShortSlug,
  isLinkExpired,
  normalizeAndValidateUrl,
  screenUrlSafety,
  validateSlug,
  type SafetyScreeningResult,
} from './src/utils/urlSecurity.ts';
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
  UserRole,
  WebhookConfig,
  WebhookDeliveryLog,
} from './src/types/shortlink.ts';

interface StoredAccount {
  username: string;
  passwordHash: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

interface PersistedState {
  links: ShortLinkItem[];
  clicks: ClickEventItem[];
  bios: BioProfile[];
  accounts: StoredAccount[];
  settings: AccountSettings;
  apiKeys: ApiKeyEntry[];
  webhooks: WebhookConfig[];
  webhookLogs: WebhookDeliveryLog[];
}

interface AuthenticatedRequest extends Request {
  sessionUser?: AuthSessionUser;
  apiKeyEntry?: ApiKeyEntry;
}

const DATA_DIR = path.resolve(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'shortlinks-store.json');
const SECRET_FILE = path.join(DATA_DIR, 'session-secret.key');
const SESSION_COOKIE_NAME = 'tautkilat_session';
const DEFAULT_CNAME_TARGET = 'edge.tautkilat.id';

function getOrCreateSessionSecret(): string {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(SECRET_FILE)) {
      const existing = fs.readFileSync(SECRET_FILE, 'utf8').trim();
      if (existing.length >= 32) return existing;
    }
    const generated = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(SECRET_FILE, generated, 'utf8');
    return generated;
  } catch {
    return crypto.randomBytes(32).toString('hex');
  }
}

const SESSION_SECRET = getOrCreateSessionSecret();

function hashPasswordNode(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function hashAccountPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 32).toString('hex');
  return `$scrypt$${salt}$${derived}`;
}

function verifyAccountPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split('$');
  if (parts.length !== 4 || parts[1] !== 'scrypt') return false;
  const [, , salt, expectedHex] = parts;
  try {
    const derived = crypto.scryptSync(password, salt, 32);
    const expected = Buffer.from(expectedHex, 'hex');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

function signSessionToken(payload: { username: string; role: UserRole; exp: number }): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

function verifySessionToken(token: string): { username: string; role: UserRole } | null {
  const [encoded, sig] = token.split('.');
  if (!encoded || !sig) return null;
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!parsed?.username || !parsed?.role || typeof parsed.exp !== 'number') return null;
    if (parsed.exp <= Date.now()) return null;
    return { username: parsed.username, role: parsed.role };
  } catch {
    return null;
  }
}

function parseCookies(header?: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!header) return result;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const val = part.slice(eq + 1).trim();
    result[key] = decodeURIComponent(val);
  }
  return result;
}

function buildCookieHeader(req: Request, value: string, maxAgeSeconds: number): string {
  const isHttps =
    req.secure ||
    String(req.headers['x-forwarded-proto'] || '')
      .toLowerCase()
      .includes('https');
  if (isHttps) {
    return `${SESSION_COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=${maxAgeSeconds}`;
  }
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

function buildCustomDomainConfig(domain: string, planTier: DomainPlanTier = 'free'): CustomDomainConfig {
  const digest = crypto.createHash('sha256').update(domain).digest('hex').slice(0, 12);
  return {
    domain,
    planTier,
    cnameTarget: DEFAULT_CNAME_TARGET,
    txtVerificationHost: `_cf-custom-hostname.${domain}`,
    txtVerificationValue: `tk-cf-saas-${digest}`,
    sslStatus: 'pending_cname',
    sslProvider: 'cloudflare_saas',
    verified: false,
    addedAt: new Date().toISOString(),
    diagnosticMessage: `Tambahkan CNAME ke ${DEFAULT_CNAME_TARGET} untuk mengaktifkan SSL Cloudflare for SaaS.`,
  };
}

function loadFirebaseConfig(): { projectId: string; apiKey: string; firestoreDatabaseId: string } | null {
  try {
    const raw = fs.readFileSync(path.resolve(process.cwd(), 'firebase-applet-config.json'), 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed?.projectId && parsed?.apiKey && parsed?.firestoreDatabaseId) {
      return parsed;
    }
  } catch {
    // Optional
  }
  return null;
}

function createDefaultAccounts(): StoredAccount[] {
  const nowIso = new Date().toISOString();
  return [
    {
      username: 'admin',
      passwordHash: hashAccountPassword('admin123!'),
      role: 'super_admin',
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  ];
}

function createDefaultSettings(): AccountSettings {
  return {
    activeDomain: '',
    customDomains: [],
    zapierHookSecret: `tk_zap_${crypto.randomBytes(12).toString('hex')}`,
  };
}

function createSeedState(): PersistedState {
  const now = Date.now();
  const dayMs = 86_400_000;

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
      passwordHash: hashPasswordNode('rahasia'),
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

  const clicks: ClickEventItem[] = seedSamples.map((s, idx) => ({
    ...s,
    id: `seed-click-${idx + 1}`,
  }));

  const bios: BioProfile[] = [
    {
      handle: 'nusantarastudio',
      ownerId: 'demo-workspace',
      displayName: 'Nadia Pratama — Nusantara Studio',
      bio: 'Product Engineer & Digital Strategist. Kumpulan tautan katalog produk, dokumentasi API, dan jadwal sesi konsultasi.',
      theme: 'cobalt',
      templateId: 'minimal-card',
      customDomain: '',
      avatarUrl: '/src/assets/images/avatar_bio_creator_1794832316229.jpg',
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
    links,
    clicks,
    bios,
    accounts: createDefaultAccounts(),
    settings: createDefaultSettings(),
    apiKeys: [],
    webhooks: [],
    webhookLogs: [],
  };
}

function loadState(): PersistedState {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) as Partial<PersistedState>;
      if (Array.isArray(parsed.links) && Array.isArray(parsed.clicks) && Array.isArray(parsed.bios)) {
        const accounts =
          Array.isArray(parsed.accounts) && parsed.accounts.length > 0
            ? parsed.accounts
            : createDefaultAccounts();
        const rawSettings = parsed.settings;
        const normalizedDomains: CustomDomainConfig[] = Array.isArray(rawSettings?.customDomains)
          ? rawSettings.customDomains.map((d) => {
              const base = buildCustomDomainConfig(d.domain, d.planTier || 'free');
              return {
                ...base,
                ...d,
                sslStatus: d.sslStatus || (d.verified ? 'active' : 'pending_cname'),
                sslProvider: 'cloudflare_saas',
              };
            })
          : [];
        const settings: AccountSettings = {
          activeDomain: rawSettings?.activeDomain || '',
          customDomains: normalizedDomains,
          zapierHookSecret:
            rawSettings?.zapierHookSecret || `tk_zap_${crypto.randomBytes(12).toString('hex')}`,
        };

        const normalizedLinks = parsed.links.map((l) => ({
          ...l,
          linkType: l.linkType || 'url',
          customDomain: l.customDomain || '',
        }));
        const normalizedBios = parsed.bios.map((b) => ({
          ...b,
          templateId: b.templateId || 'minimal-card',
          customDomain: b.customDomain || '',
        }));
        const fullState: PersistedState = {
          links: normalizedLinks,
          clicks: parsed.clicks,
          bios: normalizedBios,
          accounts,
          settings,
          apiKeys: Array.isArray(parsed.apiKeys) ? parsed.apiKeys : [],
          webhooks: Array.isArray(parsed.webhooks) ? parsed.webhooks : [],
          webhookLogs: Array.isArray(parsed.webhookLogs) ? parsed.webhookLogs : [],
        };
        saveState(fullState);
        return fullState;
      }
    }
  } catch {
    // Fallback to seed state
  }
  const seed = createSeedState();
  saveState(seed);
  return seed;
}

function saveState(state: PersistedState): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to persist store:', err);
  }
}

async function screenUrlWithExternalApis(rawUrl: string): Promise<SafetyScreeningResult> {
  const local = screenUrlSafety(rawUrl);
  if (local.status === 'blocked') {
    return local;
  }

  const gsbKey = process.env.GOOGLE_SAFE_BROWSING_API_KEY?.trim();
  const vtKey = process.env.VIRUSTOTAL_API_KEY?.trim();
  const activeEngines: string[] = ['Heuristik Lokal'];

  if (gsbKey) {
    activeEngines.unshift('Google Safe Browsing');
    try {
      const resp = await fetch(
        `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${encodeURIComponent(gsbKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client: { clientId: 'tautkilat', clientVersion: '2.0.0' },
            threatInfo: {
              threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'],
              platformTypes: ['ANY_PLATFORM'],
              threatEntryTypes: ['URL'],
              threatEntries: [{ url: rawUrl }],
            },
          }),
          signal: AbortSignal.timeout(3500),
        }
      );
      if (resp.ok) {
        const json = await resp.json();
        if (Array.isArray(json.matches) && json.matches.length > 0) {
          return {
            status: 'blocked',
            score: 0,
            reasons: [`Diblokir oleh Google Safe Browsing (${json.matches[0].threatType}).`],
            engine: activeEngines.join(' + '),
          };
        }
      }
    } catch {
      // Fallback gracefully
    }
  }

  if (vtKey) {
    activeEngines.unshift('VirusTotal');
    try {
      const urlId = Buffer.from(rawUrl).toString('base64url');
      const resp = await fetch(`https://www.virustotal.com/api/v3/urls/${urlId}`, {
        headers: { 'x-apikey': vtKey },
        signal: AbortSignal.timeout(3500),
      });
      if (resp.ok) {
        const json = await resp.json();
        const stats = json?.data?.attributes?.last_analysis_stats;
        if (stats && Number(stats.malicious || 0) > 0) {
          return {
            status: 'blocked',
            score: 0,
            reasons: [`VirusTotal mendeteksi ${stats.malicious} engine menandai URL ini berbahaya.`],
            engine: activeEngines.join(' + '),
          };
        }
      }
    } catch {
      // Fallback gracefully
    }
  }

  return {
    ...local,
    engine: activeEngines.join(' + '),
  };
}

async function fetchShortLinkFromFirestoreRest(
  slug: string,
  fb: { projectId: string; apiKey: string; firestoreDatabaseId: string }
): Promise<ShortLinkItem | null> {
  try {
    const endpoint = `https://firestore.googleapis.com/v1/projects/${fb.projectId}/databases/${fb.firestoreDatabaseId}/documents/shortLinks/${encodeURIComponent(slug)}?key=${fb.apiKey}`;
    const res = await fetch(endpoint);
    if (!res.ok) return null;
    const doc = await res.json();
    const f = doc.fields;
    if (!f) return null;
    return {
      slug: f.slug?.stringValue || slug,
      ownerId: f.ownerId?.stringValue || 'cloud',
      linkType: f.linkType?.stringValue === 'vcard' ? 'vcard' : 'url',
      targetUrl: f.targetUrl?.stringValue || '',
      title: f.title?.stringValue || slug,
      customDomain: f.customDomain?.stringValue || '',
      redirectType: Number(f.redirectType?.integerValue) === 301 ? 301 : 302,
      isActive: Boolean(f.isActive?.booleanValue ?? true),
      hasPassword: Boolean(f.hasPassword?.booleanValue ?? false),
      passwordHash: f.passwordHash?.stringValue || '',
      expiresAt: f.expiresAt?.stringValue || '',
      maxClicks: f.maxClicks?.integerValue ? Number(f.maxClicks.integerValue) : null,
      interstitialEnabled: Boolean(f.interstitialEnabled?.booleanValue ?? false),
      safetyStatus: (f.safetyStatus?.stringValue as ShortLinkItem['safetyStatus']) || 'safe',
      safetyReason: f.safetyReason?.stringValue || '',
      clickCount: Number(f.clickCount?.integerValue || 0),
      createdAt: f.createdAt?.timestampValue || new Date().toISOString(),
      updatedAt: f.updatedAt?.timestampValue || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function computeAnalyticsSummary(
  state: PersistedState,
  cache: RedirectCache<ShortLinkItem>,
  filterSlug?: string
): AnalyticsSummary {
  const relevantLinks = filterSlug
    ? state.links.filter((l) => l.slug === filterSlug)
    : state.links;

  const relevantClicks = filterSlug
    ? state.clicks.filter((c) => c.slug === filterSlug)
    : state.clicks;

  const totalLinkClicks = relevantLinks.reduce((sum, l) => sum + l.clickCount, 0);
  const totalClicks = Math.max(totalLinkClicks, relevantClicks.length);

  const countBy = (extractor: (c: ClickEventItem) => string) => {
    const map = new Map<string, number>();
    for (const c of relevantClicks) {
      const key = extractor(c) || 'Lainnya';
      map.set(key, (map.get(key) || 0) + 1);
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
    if (dayCounts.has(d)) {
      dayCounts.set(d, (dayCounts.get(d) || 0) + 1);
    }
  }

  const avgLatency =
    relevantClicks.length > 0
      ? Number(
          (
            relevantClicks.reduce((s, c) => s + c.latencyMs, 0) / relevantClicks.length
          ).toFixed(1)
        )
      : 3.2;

  return {
    totalClicks,
    activeLinks: relevantLinks.filter(
      (l) => l.isActive && !isLinkExpired(l.expiresAt) && !isLinkQuotaExceeded(l.clickCount, l.maxClicks)
    ).length,
    protectedLinks: relevantLinks.filter(
      (l) => l.hasPassword || Boolean(l.expiresAt) || Boolean(l.maxClicks)
    ).length,
    avgCacheLatencyMs: avgLatency,
    cacheHitRate: cache.hitRate(),
    byCountry: countBy((c) => c.country),
    byDevice: countBy((c) => c.device),
    byOs: countBy((c) => c.os),
    byReferer: countBy((c) => c.referer),
    dailySeries: Array.from(dayCounts.entries()).map(([date, clicks]) => ({ date, clicks })),
    recentClicks: [...relevantClicks].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 25),
  };
}

async function startServer() {
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json({ limit: '512kb' }));

  const state = loadState();
  const redirectCache = new RedirectCache<ShortLinkItem>(2000, 300_000);
  const createLimiter = new SlidingWindowRateLimiter(60_000, 60);
  const loginLimiter = new SlidingWindowRateLimiter(60_000, 20);
  const fbConfig = loadFirebaseConfig();

  for (const l of state.links) {
    if (l.isActive) redirectCache.set(l.slug, l);
  }

  const dispatchWebhooks = async (
    event: 'link.clicked' | 'link.created' | 'link.quota_reached',
    payload: Record<string, unknown>
  ): Promise<WebhookDeliveryLog[]> => {
    const targets = state.webhooks.filter((w) => w.isActive && w.events.includes(event));
    if (targets.length === 0) return [];

    const createdLogs: WebhookDeliveryLog[] = [];
    const bodyString = JSON.stringify({ event, timestamp: new Date().toISOString(), data: payload });

    await Promise.all(
      targets.map(async (wh) => {
        const sig = crypto
          .createHmac('sha256', wh.secret || 'tautkilat-webhook')
          .update(bodyString)
          .digest('hex');

        let statusCode = 0;
        let ok = false;
        let message = '';
        try {
          const resp = await fetch(wh.targetUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-TautKilat-Event': event,
              'X-TautKilat-Signature': `sha256=${sig}`,
            },
            body: bodyString,
            signal: AbortSignal.timeout(4000),
          });
          statusCode = resp.status;
          ok = resp.ok;
          message = resp.ok ? `HTTP ${resp.status} OK` : `HTTP ${resp.status}`;
        } catch (err) {
          message = err instanceof Error ? err.message : 'Gagal menghubungi endpoint webhook';
        }

        const logEntry: WebhookDeliveryLog = {
          id: `whlog-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          webhookId: wh.id,
          event,
          targetUrl: wh.targetUrl,
          statusCode,
          ok,
          message,
          createdAt: new Date().toISOString(),
        };
        createdLogs.push(logEntry);
        state.webhookLogs.unshift(logEntry);
      })
    );

    if (state.webhookLogs.length > 50) state.webhookLogs.length = 50;
    saveState(state);
    return createdLogs;
  };

  // Auth middleware helpers (supports both Authorization Bearer session token & HttpOnly cookie)
  const attachSession = (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization || '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

    // 1. Check REST API key (prefix tk_live_)
    if (bearerToken.startsWith('tk_live_') || typeof req.headers['x-api-key'] === 'string') {
      const candidateKey = bearerToken.startsWith('tk_live_')
        ? bearerToken
        : String(req.headers['x-api-key'] || '').trim();
      if (candidateKey) {
        const keyHash = crypto.createHash('sha256').update(candidateKey).digest('hex');
        const foundKey = state.apiKeys.find((k) => k.keyHash === keyHash);
        if (foundKey) {
          foundKey.lastUsedAt = new Date().toISOString();
          req.apiKeyEntry = foundKey;
          saveState(state);
        }
      }
    }

    // 2. Check signed session token (Bearer / X-Auth-Token header first so cross-site iframes & CGI hosts never drop auth, then cookie)
    const cookies = parseCookies(req.headers.cookie);
    const xAuthToken = typeof req.headers['x-auth-token'] === 'string' ? req.headers['x-auth-token'].trim() : '';
    const sessionToken =
      bearerToken && !bearerToken.startsWith('tk_live_')
        ? bearerToken
        : xAuthToken || cookies[SESSION_COOKIE_NAME];

    if (sessionToken) {
      const verified = verifySessionToken(sessionToken);
      if (verified) {
        const account = state.accounts.find((a) => a.username === verified.username);
        if (account) {
          req.sessionUser = {
            username: account.username,
            role: account.role,
            createdAt: account.createdAt,
          };
        }
      }
    }
    next();
  };

  const requireSession = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.sessionUser) {
      return res.status(401).json({ error: 'Sesi tidak valid atau telah berakhir. Silakan login kembali.' });
    }
    return next();
  };

  const requireSessionOrApiKey = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.sessionUser && !req.apiKeyEntry) {
      return res.status(401).json({ error: 'Otentikasi gagal. Sertakan API Key (X-API-Key / Bearer tk_live_...) atau sesi aktif.' });
    }
    return next();
  };

  const requireSuperAdmin = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.sessionUser) {
      return res.status(401).json({ error: 'Silakan login terlebih dahulu.' });
    }
    if (req.sessionUser.role !== 'super_admin') {
      return res.status(403).json({ error: 'Akses ditolak: hanya Super Admin yang dapat mengelola anggota.' });
    }
    return next();
  };

  app.use(attachSession);

  // Healthcheck
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, cachedRoutes: redirectCache.size() });
  });

  // ============================================================================
  // AUTHENTICATION & TEAM MANAGEMENT ROUTES
  // ============================================================================
  app.get('/api/auth/me', (req: AuthenticatedRequest, res) => {
    res.json({ user: req.sessionUser || null });
  });

  app.post('/api/auth/login', (req: AuthenticatedRequest, res) => {
    const rate = loginLimiter.check(req.ip || 'local');
    if (!rate.allowed) {
      return res.status(429).json({ error: 'Terlalu banyak percobaan login. Tunggu sebentar.' });
    }

    const { username, password } = req.body || {};
    const cleanUser = String(username || '').trim().toLowerCase();
    const plainPass = String(password || '');

    if (!cleanUser || !plainPass) {
      return res.status(400).json({ error: 'Username dan kata sandi wajib diisi.' });
    }

    const account = state.accounts.find((a) => a.username.toLowerCase() === cleanUser);
    if (!account || !verifyAccountPassword(plainPass, account.passwordHash)) {
      return res.status(401).json({ error: 'Username atau kata sandi salah.' });
    }

    const token = signSessionToken({
      username: account.username,
      role: account.role,
      exp: Date.now() + 7 * 86_400_000,
    });

    res.setHeader('Set-Cookie', buildCookieHeader(req, token, 7 * 86400));

    return res.json({
      token,
      user: {
        username: account.username,
        role: account.role,
        createdAt: account.createdAt,
      },
    });
  });

  app.post('/api/auth/logout', (req, res) => {
    res.setHeader('Set-Cookie', buildCookieHeader(req, '', 0));
    res.json({ ok: true });
  });

  app.post('/api/auth/change-password', requireSession, (req: AuthenticatedRequest, res) => {
    const { currentPassword, newPassword } = req.body || {};
    const currentPlain = String(currentPassword || '');
    const nextPlain = String(newPassword || '');

    if (!currentPlain || !nextPlain) {
      return res.status(400).json({ error: 'Kata sandi lama dan baru wajib diisi.' });
    }
    if (nextPlain.length < 6) {
      return res.status(400).json({ error: 'Kata sandi baru minimal 6 karakter.' });
    }

    const account = state.accounts.find((a) => a.username === req.sessionUser!.username);
    if (!account || !verifyAccountPassword(currentPlain, account.passwordHash)) {
      return res.status(401).json({ error: 'Kata sandi saat ini tidak cocok.' });
    }

    account.passwordHash = hashAccountPassword(nextPlain);
    account.updatedAt = new Date().toISOString();
    saveState(state);

    return res.json({ ok: true, message: 'Kata sandi berhasil diperbarui.' });
  });

  app.get('/api/team/members', requireSuperAdmin, (_req, res) => {
    const members = state.accounts.map(({ username, role, createdAt, updatedAt }) => ({
      username,
      role,
      createdAt,
      updatedAt,
    }));
    res.json({ members });
  });

  app.post('/api/team/members', requireSuperAdmin, (req, res) => {
    const { username, password, role } = req.body || {};
    const cleanUsername = String(username || '').trim().toLowerCase();
    const plainPassword = String(password || '');
    const assignedRole: UserRole = role === 'super_admin' ? 'super_admin' : 'member';

    if (!/^[a-z0-9_.-]{3,32}$/.test(cleanUsername)) {
      return res.status(400).json({
        error: 'Username harus 3-32 karakter (huruf kecil, angka, titik, underscore, atau strip).',
      });
    }
    if (plainPassword.length < 6) {
      return res.status(400).json({ error: 'Kata sandi anggota minimal 6 karakter.' });
    }
    if (state.accounts.some((a) => a.username.toLowerCase() === cleanUsername)) {
      return res.status(409).json({ error: `Username "${cleanUsername}" sudah terdaftar.` });
    }

    const nowIso = new Date().toISOString();
    const newAccount: StoredAccount = {
      username: cleanUsername,
      passwordHash: hashAccountPassword(plainPassword),
      role: assignedRole,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    state.accounts.push(newAccount);
    saveState(state);

    return res.status(201).json({
      member: {
        username: newAccount.username,
        role: newAccount.role,
        createdAt: newAccount.createdAt,
        updatedAt: newAccount.updatedAt,
      },
    });
  });

  app.delete('/api/team/members/:username', requireSuperAdmin, (req: AuthenticatedRequest, res) => {
    const targetUsername = req.params.username.trim().toLowerCase();
    if (targetUsername === req.sessionUser!.username.toLowerCase()) {
      return res.status(400).json({ error: 'Anda tidak dapat menghapus akun yang sedang aktif digunakan.' });
    }

    const idx = state.accounts.findIndex((a) => a.username.toLowerCase() === targetUsername);
    if (idx === -1) {
      return res.status(404).json({ error: 'Anggota tidak ditemukan.' });
    }

    const target = state.accounts[idx];
    if (target.role === 'super_admin') {
      const superAdminCount = state.accounts.filter((a) => a.role === 'super_admin').length;
      if (superAdminCount <= 1) {
        return res.status(400).json({ error: 'Sistem harus memiliki minimal satu Super Admin.' });
      }
    }

    state.accounts.splice(idx, 1);
    saveState(state);
    return res.json({ deleted: true });
  });

  // ============================================================================
  // CUSTOM DOMAIN (CNAME & CLOUDFLARE FOR SAAS SSL) ROUTES
  // ============================================================================
  app.get('/api/settings/domains', requireSession, (_req, res) => {
    res.json({ settings: state.settings });
  });

  app.post('/api/settings/domains', requireSession, (req, res) => {
    const { domain, setAsDefault, planTier } = req.body || {};
    const check = normalizeAndValidateDomain(String(domain || ''));
    if (!check.valid) {
      return res.status(400).json({ error: check.error });
    }
    if (state.settings.customDomains.some((d) => d.domain === check.domain)) {
      return res.status(409).json({ error: `Domain "${check.domain}" sudah terhubung.` });
    }

    const tier: DomainPlanTier = planTier === 'paid' ? 'paid' : 'free';
    const domainEntry = buildCustomDomainConfig(check.domain, tier);
    state.settings.customDomains.push(domainEntry);
    if (setAsDefault !== false) {
      state.settings.activeDomain = check.domain;
    }
    saveState(state);
    return res.status(201).json({ settings: state.settings });
  });

  app.post('/api/settings/domains/:domain/verify', requireSession, async (req, res) => {
    const target = req.params.domain.trim().toLowerCase();
    const entry = state.settings.customDomains.find((d) => d.domain === target);
    if (!entry) {
      return res.status(404).json({ error: 'Domain kustom tidak ditemukan.' });
    }

    const { activateSandbox } = req.body || {};
    const nowIso = new Date().toISOString();
    entry.lastCheckedAt = nowIso;

    if (activateSandbox) {
      entry.sslStatus = 'active';
      entry.verified = true;
      entry.diagnosticMessage = 'SSL Cloudflare for SaaS diaktifkan (mode verifikasi domain workspace).';
      saveState(state);
      return res.json({ settings: state.settings });
    }

    let cnameFound: string[] = [];
    let txtFound: string[] = [];
    try {
      cnameFound = await dns.resolveCname(entry.domain);
    } catch {
      cnameFound = [];
    }
    try {
      const txtRecords = await dns.resolveTxt(entry.txtVerificationHost);
      txtFound = txtRecords.flat();
    } catch {
      txtFound = [];
    }

    const cnameMatch = cnameFound.some((c) => c.toLowerCase().includes(DEFAULT_CNAME_TARGET));
    const txtMatch = txtFound.some((t) => t.includes(entry.txtVerificationValue));

    if (cnameMatch || txtMatch) {
      entry.sslStatus = 'active';
      entry.verified = true;
      entry.diagnosticMessage = `DNS terverifikasi (${cnameMatch ? 'CNAME' : 'TXT'}). Sertifikat SSL Cloudflare aktif.`;
    } else if (cnameFound.length > 0) {
      entry.sslStatus = 'verifying_ssl';
      entry.verified = false;
      entry.diagnosticMessage = `CNAME terbaca mengarah ke "${cnameFound[0]}", arahkan ke "${DEFAULT_CNAME_TARGET}".`;
    } else {
      entry.sslStatus = 'pending_cname';
      entry.verified = false;
      entry.diagnosticMessage = `Record CNAME ${entry.domain} -> ${DEFAULT_CNAME_TARGET} belum terdeteksi di DNS publik.`;
    }

    saveState(state);
    return res.json({ settings: state.settings });
  });

  app.patch('/api/settings/domains/active', requireSession, (req, res) => {
    const { activeDomain } = req.body || {};
    const clean = String(activeDomain || '').trim().toLowerCase();
    if (clean !== '' && !state.settings.customDomains.some((d) => d.domain === clean)) {
      return res.status(404).json({ error: 'Domain kustom belum terdaftar pada akun Anda.' });
    }
    state.settings.activeDomain = clean;
    saveState(state);
    return res.json({ settings: state.settings });
  });

  app.delete('/api/settings/domains/:domain', requireSession, (req, res) => {
    const target = req.params.domain.trim().toLowerCase();
    state.settings.customDomains = state.settings.customDomains.filter((d) => d.domain !== target);
    if (state.settings.activeDomain === target) {
      state.settings.activeDomain = state.settings.customDomains[0]?.domain || '';
    }
    saveState(state);
    return res.json({ settings: state.settings });
  });

  // ============================================================================
  // DEVELOPER REST API KEYS, WEBHOOKS & ZAPIER/MAKE INTEGRATIONS
  // ============================================================================
  app.get('/api/security/scanner-status', requireSession, (_req, res) => {
    res.json({
      heuristic: true,
      googleSafeBrowsingConfigured: Boolean(process.env.GOOGLE_SAFE_BROWSING_API_KEY?.trim()),
      virusTotalConfigured: Boolean(process.env.VIRUSTOTAL_API_KEY?.trim()),
      cloudflareSaasConfigured: Boolean(process.env.CLOUDFLARE_API_TOKEN?.trim()),
    });
  });

  app.get('/api/developer/keys', requireSession, (_req, res) => {
    const masked = state.apiKeys.map((k) => ({
      ...k,
      keyHash: '',
    }));
    res.json({ apiKeys: masked });
  });

  app.post('/api/developer/keys', requireSession, (req: AuthenticatedRequest, res) => {
    const name = String(req.body?.name || '').trim().slice(0, 60);
    if (!name) {
      return res.status(400).json({ error: 'Nama API Key wajib diisi.' });
    }
    const rawKey = `tk_live_${crypto.randomBytes(18).toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const entry: ApiKeyEntry = {
      id: `key-${Date.now()}`,
      name,
      prefix: `${rawKey.slice(0, 14)}...${rawKey.slice(-4)}`,
      keyHash,
      createdBy: req.sessionUser!.username,
      createdAt: new Date().toISOString(),
    };
    state.apiKeys.unshift(entry);
    saveState(state);
    return res.status(201).json({ apiKey: { ...entry, keyHash: '' }, rawKey });
  });

  app.delete('/api/developer/keys/:id', requireSession, (req, res) => {
    state.apiKeys = state.apiKeys.filter((k) => k.id !== req.params.id);
    saveState(state);
    return res.json({ deleted: true });
  });

  app.get('/api/developer/webhooks', requireSession, (_req, res) => {
    res.json({ webhooks: state.webhooks, logs: state.webhookLogs });
  });

  app.post('/api/developer/webhooks', requireSession, (req, res) => {
    const { name, targetUrl, events } = req.body || {};
    const urlCheck = normalizeAndValidateUrl(String(targetUrl || ''));
    if (!urlCheck.valid) {
      return res.status(400).json({ error: urlCheck.error });
    }
    const allowedEvents: Array<'link.clicked' | 'link.created' | 'link.quota_reached'> = [
      'link.clicked',
      'link.created',
      'link.quota_reached',
    ];
    const selectedEvents = Array.isArray(events)
      ? events.filter((e): e is 'link.clicked' | 'link.created' | 'link.quota_reached' =>
          allowedEvents.includes(e)
        )
      : (['link.clicked', 'link.created'] as const);

    const wh: WebhookConfig = {
      id: `wh-${Date.now()}`,
      name: String(name || '').trim().slice(0, 60) || new URL(urlCheck.normalizedUrl).hostname,
      targetUrl: urlCheck.normalizedUrl,
      events: selectedEvents.length > 0 ? [...selectedEvents] : ['link.clicked'],
      secret: `whsec_${crypto.randomBytes(12).toString('hex')}`,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    state.webhooks.unshift(wh);
    saveState(state);
    return res.status(201).json({ webhook: wh });
  });

  app.post('/api/developer/webhooks/:id/test', requireSession, async (req, res) => {
    const wh = state.webhooks.find((w) => w.id === req.params.id);
    if (!wh) return res.status(404).json({ error: 'Webhook tidak ditemukan.' });
    const logs = await dispatchWebhooks(wh.events[0] || 'link.clicked', {
      test: true,
      slug: 'promo-desember',
      message: 'Uji pengiriman webhook dari TautKilat',
    });
    return res.json({ log: logs[0] || null, logs: state.webhookLogs });
  });

  app.delete('/api/developer/webhooks/:id', requireSession, (req, res) => {
    state.webhooks = state.webhooks.filter((w) => w.id !== req.params.id);
    saveState(state);
    return res.json({ deleted: true });
  });

  // ============================================================================
  // SHORTLINK HELPER FOR DASHBOARD, BULK, REST API v1, AND ZAPIER/MAKE
  // ============================================================================
  const createShortLinkInternal = async (
    body: Record<string, unknown>,
    ownerUsername: string
  ): Promise<{ ok: true; link: ShortLinkItem } | { ok: false; status: number; error: string }> => {
    const linkType = body.linkType === 'vcard' ? 'vcard' : 'url';
    const vcard = body.vcard && typeof body.vcard === 'object' ? (body.vcard as ShortLinkItem['vcard']) : null;

    let rawTargetUrl = String(body.targetUrl || '').trim();
    if (linkType === 'vcard') {
      if (!vcard || !String(vcard.fullName || '').trim() || !String(vcard.phone || '').trim()) {
        return { ok: false, status: 400, error: 'Nama lengkap dan nomor HP wajib diisi untuk QR Kontak vCard.' };
      }
      rawTargetUrl = String(vcard.website || '').trim() || 'https://tautkilat.id/vcard';
    }

    const urlCheck = normalizeAndValidateUrl(rawTargetUrl);
    if (!urlCheck.valid) {
      return { ok: false, status: 400, error: urlCheck.error || 'URL tidak valid.' };
    }

    const safety = await screenUrlWithExternalApis(urlCheck.normalizedUrl);
    if (safety.status === 'blocked') {
      return {
        ok: false,
        status: 400,
        error: `URL diblokir oleh pemindai keamanan (${safety.engine}): ${safety.reasons[0]}`,
      };
    }

    let resolvedDomain = '';
    const requestedDomain =
      typeof body.customDomain === 'string' ? body.customDomain.trim().toLowerCase() : state.settings.activeDomain;
    if (requestedDomain) {
      const domainCheck = normalizeAndValidateDomain(requestedDomain);
      if (!domainCheck.valid) {
        return { ok: false, status: 400, error: domainCheck.error || 'Domain tidak valid.' };
      }
      resolvedDomain = domainCheck.domain;
    }

    let finalSlug = '';
    const customSlug = String(body.customSlug || '').trim();
    if (customSlug) {
      const slugCheck = validateSlug(customSlug);
      if (!slugCheck.valid) {
        return { ok: false, status: 400, error: slugCheck.error || 'Slug tidak valid.' };
      }
      finalSlug = slugCheck.normalizedSlug;
      if (state.links.some((l) => l.slug === finalSlug)) {
        return { ok: false, status: 409, error: `Slug "${finalSlug}" sudah digunakan. Silakan pilih slug lain.` };
      }
    } else {
      do {
        finalSlug = generateShortSlug(6);
      } while (state.links.some((l) => l.slug === finalSlug));
    }

    const nowIso = new Date().toISOString();
    const cleanPassword = typeof body.password === 'string' ? body.password.trim() : '';
    const rawMaxClicks = body.maxClicks !== undefined && body.maxClicks !== null && body.maxClicks !== ''
      ? Number(body.maxClicks)
      : null;
    const maxClicks = rawMaxClicks && Number.isFinite(rawMaxClicks) && rawMaxClicks > 0 ? Math.floor(rawMaxClicks) : null;

    const newLink: ShortLinkItem = {
      slug: finalSlug,
      ownerId: ownerUsername,
      linkType,
      targetUrl: urlCheck.normalizedUrl,
      title:
        String(body.title || '').trim() ||
        (linkType === 'vcard' && vcard ? `Kartu Kontak: ${vcard.fullName}` : new URL(urlCheck.normalizedUrl).hostname),
      customDomain: resolvedDomain,
      redirectType: body.redirectType === 301 ? 301 : 302,
      isActive: true,
      hasPassword: cleanPassword.length > 0,
      passwordHash: cleanPassword ? hashPasswordNode(cleanPassword) : '',
      expiresAt:
        typeof body.expiresAt === 'string' && body.expiresAt.trim() ? new Date(body.expiresAt).toISOString() : '',
      maxClicks,
      interstitialEnabled: Boolean(body.interstitialEnabled),
      trackingPixels: (body.trackingPixels as ShortLinkItem['trackingPixels']) || undefined,
      ogMeta: (body.ogMeta as ShortLinkItem['ogMeta']) || undefined,
      utm: (body.utm as ShortLinkItem['utm']) || undefined,
      geoRules: Array.isArray(body.geoRules) ? (body.geoRules as ShortLinkItem['geoRules']) : undefined,
      deviceRules: (body.deviceRules as ShortLinkItem['deviceRules']) || undefined,
      abVariants: Array.isArray(body.abVariants) ? (body.abVariants as ShortLinkItem['abVariants']) : undefined,
      timeRule: (body.timeRule as ShortLinkItem['timeRule']) || null,
      vcard,
      safetyStatus: safety.status,
      safetyReason: safety.reasons[0] || 'Aman',
      safetyEngine: safety.engine || 'Heuristik Lokal',
      clickCount: 0,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    state.links.unshift(newLink);
    redirectCache.set(newLink.slug, newLink);
    saveState(state);
    void dispatchWebhooks('link.created', {
      slug: newLink.slug,
      targetUrl: newLink.targetUrl,
      customDomain: newLink.customDomain,
      linkType: newLink.linkType,
    });

    return { ok: true, link: newLink };
  };

  // ============================================================================
  // PUBLIC DEVELOPER REST API v1 & ZAPIER / MAKE.COM TRIGGERS
  // ============================================================================
  app.post('/api/v1/links', requireSessionOrApiKey, async (req: AuthenticatedRequest, res) => {
    const owner = req.sessionUser?.username || req.apiKeyEntry?.createdBy || 'api-client';
    const result = await createShortLinkInternal(req.body || {}, owner);
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }
    const base = result.link.customDomain
      ? `https://${result.link.customDomain}/${result.link.slug}`
      : `${req.protocol}://${req.get('host')}/s/${result.link.slug}`;
    return res.status(201).json({
      shortUrl: base,
      link: { ...result.link, passwordHash: '' },
    });
  });

  app.get('/api/v1/links', requireSessionOrApiKey, (_req, res) => {
    res.json({
      count: state.links.length,
      links: state.links.map((l) => ({ ...l, passwordHash: '' })),
    });
  });

  app.get('/api/v1/analytics/:slug', requireSessionOrApiKey, (req, res) => {
    const slug = req.params.slug.toLowerCase();
    const exists = state.links.some((l) => l.slug === slug);
    if (!exists) return res.status(404).json({ error: 'Slug tidak ditemukan.' });
    return res.json(computeAnalyticsSummary(state, redirectCache, slug));
  });

  app.post('/api/integrations/zapier/shorten', async (req: AuthenticatedRequest, res) => {
    const hookSecretHeader = String(req.headers['x-zapier-secret'] || req.query.secret || '').trim();
    const secretValid =
      Boolean(state.settings.zapierHookSecret) && hookSecretHeader === state.settings.zapierHookSecret;

    if (!req.sessionUser && !req.apiKeyEntry && !secretValid) {
      return res.status(401).json({ error: 'Token integrasi Zapier/Make atau API Key tidak valid.' });
    }

    const body = req.body || {};
    const urlValue = body.url || body.targetUrl || body.long_url;
    const result = await createShortLinkInternal(
      {
        targetUrl: urlValue,
        customSlug: body.slug || body.customSlug,
        customDomain: body.customDomain || state.settings.activeDomain,
        title:
          body.title ||
          (body.source_app ? `[${String(body.source_app)}] ${String(urlValue || '').slice(0, 60)}` : undefined),
        utm:
          body.utm_source || body.utm_medium || body.utm_campaign
            ? {
                source: String(body.utm_source || ''),
                medium: String(body.utm_medium || ''),
                campaign: String(body.utm_campaign || ''),
              }
            : body.utm,
      },
      req.sessionUser?.username || 'zapier-automation'
    );

    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }

    const shortUrl = result.link.customDomain
      ? `https://${result.link.customDomain}/${result.link.slug}`
      : `${req.protocol}://${req.get('host')}/s/${result.link.slug}`;

    return res.status(201).json({
      status: 'success',
      integration: body.source_app || 'Zapier / Make.com',
      shortUrl,
      slug: result.link.slug,
      targetUrl: result.link.targetUrl,
      createdAt: result.link.createdAt,
    });
  });

  // ============================================================================
  // URL SCREENING & DASHBOARD SHORTLINK MANAGEMENT
  // ============================================================================
  app.post('/api/screen-url', async (req, res) => {
    const { url } = req.body || {};
    const raw = String(url || '');
    const validation = normalizeAndValidateUrl(raw);
    const screening = await screenUrlWithExternalApis(validation.valid ? validation.normalizedUrl : raw);
    res.json({ validation, screening });
  });

  app.get('/api/links', requireSession, (_req, res) => {
    const sorted = [...state.links].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json({ links: sorted });
  });

  // Public lookup for /s/:slug gate
  app.get('/api/links/:slug', async (req, res) => {
    const slug = req.params.slug.toLowerCase();
    let link = redirectCache.get(slug) || state.links.find((l) => l.slug === slug);
    if (!link && fbConfig) {
      const remote = await fetchShortLinkFromFirestoreRest(slug, fbConfig);
      if (remote) link = remote;
    }
    if (!link) {
      return res.status(404).json({ error: 'Tautan tidak ditemukan.' });
    }
    const quotaExceeded = isLinkQuotaExceeded(link.clickCount, link.maxClicks);
    const ua = parseUserAgent(req.headers['user-agent']);
    const geo = parseGeoFromHeaders(req.headers as Record<string, string | string[] | undefined>, req.ip);
    const resolved = resolveTargetDestination(link, {
      countryCode: typeof req.query.simCountry === 'string' ? req.query.simCountry : geo.countryCode,
      os: typeof req.query.simOs === 'string' ? req.query.simOs : ua.os,
    });

    return res.json({
      link: {
        ...link,
        passwordHash: '',
        targetUrl: link.hasPassword ? '' : resolved.finalUrl,
      },
      expired: isLinkExpired(link.expiresAt),
      quotaExceeded,
    });
  });

  // vCard download endpoint (.vcf) with click analytics tracking
  app.get('/api/links/:slug/vcard', (req, res) => {
    const start = performance.now();
    const slug = req.params.slug.toLowerCase();
    const link = state.links.find((l) => l.slug === slug);
    if (!link || !link.isActive || link.linkType !== 'vcard' || !link.vcard) {
      return res.status(404).json({ error: 'Kartu kontak vCard tidak ditemukan atau nonaktif.' });
    }
    if (isLinkExpired(link.expiresAt) || isLinkQuotaExceeded(link.clickCount, link.maxClicks)) {
      return res.status(410).json({ error: 'Kartu kontak vCard sudah mencapai batas atau kadaluarsa.' });
    }

    const ua = parseUserAgent(req.headers['user-agent']);
    const geo = parseGeoFromHeaders(req.headers as Record<string, string | string[] | undefined>, req.ip);
    const referer = parseRefererSource(req.headers['referer']);
    const latencyMs = Number((performance.now() - start).toFixed(2));

    link.clickCount += 1;
    state.clicks.unshift({
      id: `clk-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ownerId: link.ownerId,
      slug: link.slug,
      country: geo.country,
      city: geo.city,
      device: ua.device,
      os: ua.os,
      browser: ua.browser,
      referer,
      routedBy: 'vcard',
      latencyMs,
      cacheHit: true,
      createdAt: new Date().toISOString(),
    });
    saveState(state);

    void dispatchWebhooks('link.clicked', { slug: link.slug, type: 'vcard', country: geo.country });
    const vcfContent = buildVCardPayload(link.vcard);
    res.setHeader('Content-Type', 'text/vcard; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${link.slug}.vcf"`);
    return res.send(vcfContent);
  });

  app.post('/api/links', requireSession, async (req: AuthenticatedRequest, res) => {
    const clientIp = req.ip || 'local';
    const rate = createLimiter.check(clientIp);
    res.setHeader('X-RateLimit-Remaining', String(rate.remaining));
    if (!rate.allowed) {
      return res.status(429).json({
        error: `Batas pembuatan link tercapai. Coba lagi dalam ${Math.ceil(rate.resetAfterMs / 1000)} detik.`,
      });
    }

    const result = await createShortLinkInternal(req.body || {}, req.sessionUser?.username || 'demo-workspace');
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }
    return res.status(201).json({ link: result.link });
  });

  // Bulk CSV/XLSX Link Generation Endpoint
  app.post('/api/links/bulk', requireSession, (req: AuthenticatedRequest, res) => {
    const { rows, customDomain } = req.body || {};
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'Daftar baris CSV/XLSX tidak boleh kosong.' });
    }
    if (rows.length > 200) {
      return res.status(400).json({ error: 'Maksimal 200 tautan per unggahan batch.' });
    }

    let resolvedDomain = '';
    const requestedDomain = typeof customDomain === 'string' ? customDomain.trim().toLowerCase() : state.settings.activeDomain;
    if (requestedDomain) {
      const domainCheck = normalizeAndValidateDomain(requestedDomain);
      if (!domainCheck.valid) {
        return res.status(400).json({ error: domainCheck.error });
      }
      resolvedDomain = domainCheck.domain;
    }

    const results: BulkCreateRowResult[] = [];
    const createdLinks: ShortLinkItem[] = [];
    const nowIso = new Date().toISOString();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || {};
      const rowNumber = Number(row.rowNumber || i + 1);
      const rawUrl = String(row.targetUrl || '').trim();
      const rawSlug = String(row.slug || '').trim();
      const rawTitle = String(row.title || '').trim();
      const redirectType = row.redirectType === 301 ? 301 : 302;

      const urlCheck = normalizeAndValidateUrl(rawUrl);
      if (!urlCheck.valid) {
        results.push({
          rowNumber,
          targetUrl: rawUrl,
          slug: rawSlug,
          customDomain: resolvedDomain,
          status: 'error',
          reason: urlCheck.error || 'URL tidak valid.',
        });
        continue;
      }

      const safety = screenUrlSafety(urlCheck.normalizedUrl);
      if (safety.status === 'blocked') {
        results.push({
          rowNumber,
          targetUrl: urlCheck.normalizedUrl,
          slug: rawSlug,
          customDomain: resolvedDomain,
          status: 'error',
          reason: safety.reasons[0] || 'URL diblokir sistem keamanan.',
        });
        continue;
      }

      let finalSlug = '';
      if (rawSlug) {
        const slugCheck = validateSlug(rawSlug);
        if (!slugCheck.valid) {
          results.push({
            rowNumber,
            targetUrl: urlCheck.normalizedUrl,
            slug: rawSlug,
            customDomain: resolvedDomain,
            status: 'error',
            reason: slugCheck.error || 'Slug tidak valid.',
          });
          continue;
        }
        finalSlug = slugCheck.normalizedSlug;
        if (state.links.some((l) => l.slug === finalSlug)) {
          results.push({
            rowNumber,
            targetUrl: urlCheck.normalizedUrl,
            slug: finalSlug,
            customDomain: resolvedDomain,
            status: 'skipped',
            reason: `Slug "${finalSlug}" sudah terdaftar sebelumnya.`,
          });
          continue;
        }
      } else {
        do {
          finalSlug = generateShortSlug(6);
        } while (state.links.some((l) => l.slug === finalSlug));
      }

      const newLink: ShortLinkItem = {
        slug: finalSlug,
        ownerId: req.sessionUser?.username || 'demo-workspace',
        linkType: 'url',
        targetUrl: urlCheck.normalizedUrl,
        title: rawTitle.slice(0, 120) || new URL(urlCheck.normalizedUrl).hostname,
        customDomain: resolvedDomain,
        redirectType,
        isActive: true,
        hasPassword: false,
        passwordHash: '',
        expiresAt: '',
        safetyStatus: safety.status,
        safetyReason: safety.reasons[0] || 'Aman',
        safetyEngine: safety.engine || 'Heuristik Lokal',
        clickCount: 0,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      state.links.unshift(newLink);
      redirectCache.set(newLink.slug, newLink);
      createdLinks.push(newLink);
      results.push({
        rowNumber,
        targetUrl: newLink.targetUrl,
        slug: newLink.slug,
        customDomain: resolvedDomain,
        status: 'created',
        link: newLink,
      });
    }

    if (createdLinks.length > 0) {
      saveState(state);
    }

    return res.status(201).json({
      results,
      createdLinks,
      createdCount: createdLinks.length,
      skippedCount: results.length - createdLinks.length,
    });
  });

  app.patch('/api/links/:slug', requireSession, async (req, res) => {
    const slug = req.params.slug.toLowerCase();
    const idx = state.links.findIndex((l) => l.slug === slug);
    if (idx === -1) {
      return res.status(404).json({ error: 'Tautan tidak ditemukan.' });
    }
    const current = state.links[idx];
    const body = req.body || {};

    let nextUrl = current.targetUrl;
    let nextSafetyStatus = current.safetyStatus;
    let nextSafetyReason = current.safetyReason;
    let nextSafetyEngine = current.safetyEngine || 'Heuristik Lokal';

    if (typeof body.targetUrl === 'string' && body.targetUrl.trim()) {
      const check = normalizeAndValidateUrl(body.targetUrl);
      if (!check.valid) return res.status(400).json({ error: check.error });
      const safety = await screenUrlWithExternalApis(check.normalizedUrl);
      if (safety.status === 'blocked') {
        return res.status(400).json({ error: safety.reasons[0] });
      }
      nextUrl = check.normalizedUrl;
      nextSafetyStatus = safety.status;
      nextSafetyReason = safety.reasons[0] || 'Aman';
      nextSafetyEngine = safety.engine || 'Heuristik Lokal';
    }

    let nextDomain = current.customDomain || '';
    if (typeof body.customDomain === 'string') {
      if (body.customDomain.trim() === '') {
        nextDomain = '';
      } else {
        const dCheck = normalizeAndValidateDomain(body.customDomain);
        if (!dCheck.valid) return res.status(400).json({ error: dCheck.error });
        nextDomain = dCheck.domain;
      }
    }

    const updated: ShortLinkItem = {
      ...current,
      title: typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 120) : current.title,
      targetUrl: nextUrl,
      customDomain: nextDomain,
      safetyStatus: nextSafetyStatus,
      safetyReason: nextSafetyReason,
      safetyEngine: nextSafetyEngine,
      isActive: typeof body.isActive === 'boolean' ? body.isActive : current.isActive,
      redirectType: body.redirectType === 301 || body.redirectType === 302 ? body.redirectType : current.redirectType,
      expiresAt: typeof body.expiresAt === 'string' ? body.expiresAt : current.expiresAt,
      maxClicks: body.maxClicks !== undefined ? body.maxClicks : current.maxClicks,
      interstitialEnabled:
        typeof body.interstitialEnabled === 'boolean' ? body.interstitialEnabled : current.interstitialEnabled,
      trackingPixels: body.trackingPixels !== undefined ? body.trackingPixels : current.trackingPixels,
      ogMeta: body.ogMeta !== undefined ? body.ogMeta : current.ogMeta,
      utm: body.utm !== undefined ? body.utm : current.utm,
      geoRules: body.geoRules !== undefined ? body.geoRules : current.geoRules,
      deviceRules: body.deviceRules !== undefined ? body.deviceRules : current.deviceRules,
      abVariants: body.abVariants !== undefined ? body.abVariants : current.abVariants,
      timeRule: body.timeRule !== undefined ? body.timeRule : current.timeRule,
      updatedAt: new Date().toISOString(),
    };

    state.links[idx] = updated;
    if (updated.isActive) {
      redirectCache.set(slug, updated);
    } else {
      redirectCache.invalidate(slug);
    }
    saveState(state);
    return res.json({ link: updated });
  });

  app.delete('/api/links/:slug', requireSession, (req, res) => {
    const slug = req.params.slug.toLowerCase();
    const idx = state.links.findIndex((l) => l.slug === slug);
    if (idx === -1) {
      return res.status(404).json({ error: 'Tautan tidak ditemukan.' });
    }
    state.links.splice(idx, 1);
    redirectCache.invalidate(slug);
    saveState(state);
    return res.json({ deleted: true });
  });

  // Public Password Gate Unlock
  app.post('/api/links/:slug/unlock', async (req, res) => {
    const start = performance.now();
    const slug = req.params.slug.toLowerCase();
    const { password } = req.body || {};

    let link = state.links.find((l) => l.slug === slug);
    if (!link && fbConfig) {
      const remote = await fetchShortLinkFromFirestoreRest(slug, fbConfig);
      if (remote) link = remote;
    }

    if (!link || !link.isActive) {
      return res.status(404).json({ error: 'Tautan tidak ditemukan atau nonaktif.' });
    }
    if (isLinkExpired(link.expiresAt)) {
      return res.status(410).json({ error: 'Tautan ini sudah melewati tanggal kadaluarsa.' });
    }
    if (isLinkQuotaExceeded(link.clickCount, link.maxClicks)) {
      return res.status(410).json({ error: 'Tautan ini telah mencapai kuota maksimal klik.' });
    }
    if (link.hasPassword) {
      const attemptHash = hashPasswordNode(String(password || ''));
      if (attemptHash !== link.passwordHash) {
        return res.status(401).json({ error: 'Kata sandi salah. Silakan coba lagi.' });
      }
    }

    const ua = parseUserAgent(req.headers['user-agent']);
    const geo = parseGeoFromHeaders(req.headers as Record<string, string | string[] | undefined>, req.ip);
    const referer = parseRefererSource(req.headers['referer']);
    const latencyMs = Number((performance.now() - start).toFixed(2));
    const resolved = resolveTargetDestination(link, {
      countryCode: geo.countryCode,
      os: ua.os,
    });

    link.clickCount += 1;
    state.clicks.unshift({
      id: `clk-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ownerId: link.ownerId,
      slug: link.slug,
      country: geo.country,
      city: geo.city,
      device: ua.device,
      os: ua.os,
      browser: ua.browser,
      referer,
      variantLabel: resolved.variantLabel,
      routedBy: resolved.routedBy,
      latencyMs,
      cacheHit: false,
      createdAt: new Date().toISOString(),
    });
    saveState(state);

    void dispatchWebhooks('link.clicked', {
      slug: link.slug,
      destination: resolved.finalUrl,
      country: geo.country,
    });

    return res.json({ targetUrl: resolved.finalUrl, redirectType: link.redirectType });
  });

  // Analytics Summary
  app.get('/api/analytics', requireSession, (req, res) => {
    const slug = typeof req.query.slug === 'string' && req.query.slug !== 'all' ? req.query.slug : undefined;
    res.json(computeAnalyticsSummary(state, redirectCache, slug));
  });

  // Link-in-Bio Endpoints
  app.get('/api/bio/:handle', (req, res) => {
    const handle = req.params.handle.toLowerCase();
    const profile = state.bios.find((b) => b.handle === handle);
    if (!profile) {
      return res.status(404).json({ error: 'Profil Link-in-Bio tidak ditemukan.' });
    }
    return res.json({ profile });
  });

  app.put('/api/bio/:handle', requireSession, (req, res) => {
    const handle = req.params.handle.toLowerCase();
    const { displayName, bio, theme, templateId, customDomain, items } = req.body || {};
    if (!displayName || typeof displayName !== 'string') {
      return res.status(400).json({ error: 'Nama tampilan tidak boleh kosong.' });
    }

    const cleanItems: BioLinkEntry[] = Array.isArray(items)
      ? items
          .filter((item) => item && typeof item.title === 'string' && typeof item.url === 'string')
          .slice(0, 20)
          .map((item, idx) => {
            const check = normalizeAndValidateUrl(item.url);
            return {
              id: String(item.id || `bio-${Date.now()}-${idx}`),
              ownerId: 'demo-workspace',
              title: item.title.trim().slice(0, 80),
              url: check.valid ? check.normalizedUrl : 'https://example.com',
              badge: typeof item.badge === 'string' ? item.badge.trim().slice(0, 32) : undefined,
              order: idx,
              clicks: Number(item.clicks || 0),
              isActive: Boolean(item.isActive ?? true),
              createdAt: item.createdAt || new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
          })
      : [];

    const existingIdx = state.bios.findIndex((b) => b.handle === handle);
    const nowIso = new Date().toISOString();
    const validTemplate = ['minimal-card', 'creator-grid', 'product-showcase', 'dark-terminal'].includes(
      templateId
    )
      ? templateId
      : 'minimal-card';

    const updated: BioProfile = {
      handle,
      ownerId: 'demo-workspace',
      displayName: displayName.trim().slice(0, 80),
      bio: typeof bio === 'string' ? bio.trim().slice(0, 280) : '',
      theme: ['slate', 'cobalt', 'emerald', 'amber'].includes(theme) ? theme : 'cobalt',
      templateId: validTemplate,
      customDomain: typeof customDomain === 'string' ? customDomain.trim().toLowerCase() : '',
      avatarUrl: '/src/assets/images/avatar_bio_creator_1794832316229.jpg',
      items: cleanItems,
      createdAt: existingIdx >= 0 ? state.bios[existingIdx].createdAt : nowIso,
      updatedAt: nowIso,
    };

    if (existingIdx >= 0) {
      state.bios[existingIdx] = updated;
    } else {
      state.bios.push(updated);
    }
    saveState(state);
    return res.json({ profile: updated });
  });

  app.post('/api/bio/:handle/click', (req, res) => {
    const handle = req.params.handle.toLowerCase();
    const { itemId } = req.body || {};
    const profile = state.bios.find((b) => b.handle === handle);
    if (!profile) return res.status(404).json({ error: 'Profil tidak ditemukan.' });
    const item = profile.items.find((i) => i.id === itemId);
    if (item) {
      item.clicks += 1;
      saveState(state);
    }
    return res.json({ ok: true });
  });

  // Crypto Sandbox Endpoint
  app.post('/api/crypto-sandbox', requireSession, (req, res) => {
    const { action, text, password, cipherPayload, secretKey } = req.body || {};
    const masterKey = String(secretKey || 'TautKilat-Default-AES256-Key-2026');
    const keyBin = crypto.createHash('sha256').update(masterKey).digest();

    if (action === 'hash_password') {
      const plain = String(password || '');
      if (!plain) return res.status(400).json({ error: 'Password tidak boleh kosong.' });
      return res.json({ hash: hashAccountPassword(plain) });
    }

    if (action === 'encrypt') {
      const plain = String(text || '');
      if (!plain) return res.status(400).json({ error: 'Teks rahasia tidak boleh kosong.' });
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-cbc', keyBin, iv);
      const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
      const hmac = crypto.createHmac('sha256', keyBin).update(Buffer.concat([iv, encrypted])).digest();
      const token = Buffer.concat([hmac, iv, encrypted]).toString('base64');
      return res.json({ encrypted: token });
    }

    if (action === 'decrypt') {
      try {
        const raw = Buffer.from(String(cipherPayload || ''), 'base64');
        if (raw.length <= 48) return res.status(400).json({ error: 'Ciphertext tidak valid.' });
        const hmacStored = raw.subarray(0, 32);
        const iv = raw.subarray(32, 48);
        const ciphertext = raw.subarray(48);
        const hmacComputed = crypto.createHmac('sha256', keyBin).update(Buffer.concat([iv, ciphertext])).digest();
        if (!crypto.timingSafeEqual(hmacStored, hmacComputed)) {
          return res.status(400).json({ error: 'Verifikasi HMAC gagal: kunci salah atau data dimodifikasi.' });
        }
        const decipher = crypto.createDecipheriv('aes-256-cbc', keyBin, iv);
        const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
        return res.json({ decrypted });
      } catch {
        return res.status(400).json({ error: 'Dekripsi AES-256-CBC gagal.' });
      }
    }

    return res.status(400).json({ error: 'Aksi tidak dikenal.' });
  });

  // Fast Smart Redirect Engine (/s/:slug)
  app.get('/s/:slug', async (req, res, next) => {
    const start = performance.now();
    const slug = req.params.slug.toLowerCase();

    let link = redirectCache.get(slug);
    let cacheHit = Boolean(link);

    if (!link) {
      link = state.links.find((l) => l.slug === slug);
      if (!link && fbConfig) {
        const remote = await fetchShortLinkFromFirestoreRest(slug, fbConfig);
        if (remote) link = remote;
      }
      if (link && link.isActive) {
        redirectCache.set(slug, link);
      }
    }

    if (
      !link ||
      !link.isActive ||
      link.hasPassword ||
      link.linkType === 'vcard' ||
      isLinkExpired(link.expiresAt) ||
      isLinkQuotaExceeded(link.clickCount, link.maxClicks) ||
      link.safetyStatus === 'blocked'
    ) {
      return next();
    }

    const uaRaw = req.headers['user-agent'] || '';
    const isSocialBot = /(facebookexternalhit|whatsapp|telegrambot|twitterbot|linkedinbot|slackbot|discordbot)/i.test(
      uaRaw
    );
    const hasCustomOg = Boolean(link.ogMeta?.title || link.ogMeta?.description || link.ogMeta?.imageUrl);
    const hasPixels = Boolean(
      link.trackingPixels?.facebookPixelId ||
        link.trackingPixels?.googleTagId ||
        link.trackingPixels?.tiktokPixelId ||
        link.trackingPixels?.linkedinPartnerId
    );

    const ua = parseUserAgent(uaRaw);
    const geo = parseGeoFromHeaders(req.headers as Record<string, string | string[] | undefined>, req.ip);
    const referer = parseRefererSource(req.headers['referer']);
    const resolved = resolveTargetDestination(link, {
      countryCode: typeof req.query.simCountry === 'string' ? req.query.simCountry : geo.countryCode,
      os: typeof req.query.simOs === 'string' ? req.query.simOs : ua.os,
    });

    if (isSocialBot && hasCustomOg) {
      return res.status(200).send(
        buildRedirectBridgeHtml({
          link,
          destinationUrl: resolved.finalUrl,
          interstitialSeconds: 0,
          crawlerOnly: true,
        })
      );
    }

    const latencyMs = Number((performance.now() - start).toFixed(2));
    const localIdx = state.links.findIndex((l) => l.slug === slug);
    if (localIdx >= 0) {
      state.links[localIdx].clickCount += 1;
      if (
        state.links[localIdx].maxClicks &&
        state.links[localIdx].clickCount >= state.links[localIdx].maxClicks!
      ) {
        void dispatchWebhooks('link.quota_reached', {
          slug: link.slug,
          clickCount: state.links[localIdx].clickCount,
          maxClicks: state.links[localIdx].maxClicks,
        });
      }
    }

    state.clicks.unshift({
      id: `clk-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ownerId: link.ownerId,
      slug: link.slug,
      country: geo.country,
      city: geo.city,
      device: ua.device,
      os: ua.os,
      browser: ua.browser,
      referer,
      variantLabel: resolved.variantLabel,
      routedBy: resolved.routedBy,
      latencyMs,
      cacheHit,
      createdAt: new Date().toISOString(),
    });
    if (state.clicks.length > 500) state.clicks.length = 500;
    saveState(state);

    void dispatchWebhooks('link.clicked', {
      slug: link.slug,
      destination: resolved.finalUrl,
      routedBy: resolved.routedBy,
      variantLabel: resolved.variantLabel,
      country: geo.country,
      device: ua.device,
    });

    res.setHeader('X-Cache', cacheHit ? 'HIT' : 'MISS');
    res.setHeader('X-Redirect-Latency-Ms', latencyMs.toString());
    res.setHeader('X-Routed-By', resolved.routedBy);

    if (link.interstitialEnabled || hasPixels || hasCustomOg) {
      return res.status(200).send(
        buildRedirectBridgeHtml({
          link,
          destinationUrl: resolved.finalUrl,
          interstitialSeconds: link.interstitialEnabled ? 3 : 0,
          crawlerOnly: false,
        })
      );
    }

    return res.redirect(link.redirectType, resolved.finalUrl);
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`TautKilat server listening on http://localhost:${PORT}`);
  });
}

startServer();
