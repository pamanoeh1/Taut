import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  increment,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import type {
  AccountSettings,
  AnalyticsSummary,
  ApiKeyEntry,
  AuthSessionUser,
  BioBackgroundOverlay,
  BioLinkEntry,
  BioProfile,
  BioTemplateId,
  BioTheme,
  BulkCreateRowResult,
  CreateLinkPayload,
  DomainPlanTier,
  ShortLinkItem,
  TeamMember,
  UpdateLinkPayload,
  UserRole,
  WebhookConfig,
  WebhookDeliveryLog,
} from '../types/shortlink';
import type { ParsedBulkRow } from '../utils/bulkImportParser';

import {
  buildFallbackVCardContent,
  getFallbackLinkBySlugSync,
  handleFallbackRequest,
  shouldFallbackToLocalEngine,
} from './localFallbackEngine';

const SESSION_TOKEN_STORAGE_KEY = 'tautkilat_auth_token';

function resolveApiUrl(path: string): string {
  const configuredBase = String(import.meta.env?.VITE_API_BASE_URL || '')
    .trim()
    .replace(/\/+$/, '');
  const isLocalHost =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  if (configuredBase && !isLocalHost) {
    try {
      const parsed = new URL(configuredBase);
      if (!parsed.hostname.endsWith('github.io')) {
        return `${configuredBase}${path.startsWith('/') ? path : `/${path}`}`;
      }
    } catch {
      return `${configuredBase}${path.startsWith('/') ? path : `/${path}`}`;
    }
  }
  const baseUrl = String(import.meta.env?.BASE_URL || '/').trim();
  if (baseUrl && baseUrl !== '/') {
    const cleanBase = baseUrl.replace(/\/+$/, '');
    return `${cleanBase}${path.startsWith('/') ? path : `/${path}`}`;
  }
  return path;
}

function getStoredSessionToken(): string {
  if (typeof window === 'undefined') return '';
  try {
    return (
      window.sessionStorage.getItem(SESSION_TOKEN_STORAGE_KEY) ||
      window.localStorage.getItem(SESSION_TOKEN_STORAGE_KEY) ||
      ''
    );
  } catch {
    return '';
  }
}

function setStoredSessionToken(token: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (token) {
      window.sessionStorage.setItem(SESSION_TOKEN_STORAGE_KEY, token);
      window.localStorage.setItem(SESSION_TOKEN_STORAGE_KEY, token);
    } else {
      window.sessionStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
      window.localStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage quota errors
  }
}

async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = getStoredSessionToken();
  const headers = new Headers(init.headers || {});
  if (token) {
    if (!headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    if (!headers.has('X-Auth-Token')) {
      headers.set('X-Auth-Token', token);
    }
  }
  return fetch(resolveApiUrl(input), {
    ...init,
    credentials: 'include',
    headers,
  });
}

function parseJsonBodySafe(rawBody: BodyInit | null | undefined): Record<string, unknown> {
  if (typeof rawBody !== 'string' || !rawBody.trim()) return {};
  try {
    const parsed = JSON.parse(rawBody);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function requestJsonWithFallback<T extends Record<string, unknown>>(
  path: string,
  init: RequestInit = {},
  defaultErrorMsg: string = 'Permintaan ke server gagal.'
): Promise<{ ok: boolean; status: number; data: T & { error?: string } }> {
  const token = getStoredSessionToken();
  const method = (init.method || 'GET').toUpperCase();
  const parsedBody = parseJsonBodySafe(init.body);

  // If the user is already authenticated in local fallback mode, keep using localFallbackEngine consistently
  // (except on login, which always probes the real backend first).
  if (token.startsWith('tklocal.') && path !== '/api/auth/login') {
    const fb = await handleFallbackRequest(path, method, parsedBody, token);
    return fb as { ok: boolean; status: number; data: T & { error?: string } };
  }

  try {
    const res = await authFetch(path, init);
    const contentType = res.headers.get('content-type');

    if (shouldFallbackToLocalEngine({ status: res.status, contentType })) {
      const fb = await handleFallbackRequest(path, method, parsedBody, token);
      return fb as { ok: boolean; status: number; data: T & { error?: string } };
    }

    const data = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok && !data.error) {
      data.error = defaultErrorMsg;
    }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    if (shouldFallbackToLocalEngine({ error: err })) {
      const fb = await handleFallbackRequest(path, method, parsedBody, token);
      return fb as { ok: boolean; status: number; data: T & { error?: string } };
    }
    throw err instanceof Error ? err : new Error(defaultErrorMsg);
  }
}

export async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function toIsoString(val: unknown): string {
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (typeof val === 'string') return val;
  return new Date().toISOString();
}

// ============================================================================
// AUTHENTICATION & TEAM MANAGEMENT API
// ============================================================================

export async function apiFetchMe(): Promise<AuthSessionUser | null> {
  const res = await requestJsonWithFallback<{ user?: AuthSessionUser | null }>('/api/auth/me');
  if (!res.ok) return null;
  if (!res.data.user) {
    setStoredSessionToken('');
  }
  return res.data.user || null;
}

export async function apiLogin(username: string, password: string): Promise<AuthSessionUser> {
  const res = await requestJsonWithFallback<{ token?: string; user?: AuthSessionUser }>(
    '/api/auth/login',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    },
    'Gagal login.'
  );
  if (!res.ok || !res.data.user) {
    throw new Error(res.data.error || 'Gagal login.');
  }
  if (typeof res.data.token === 'string' && res.data.token) {
    setStoredSessionToken(res.data.token);
  }
  return res.data.user;
}

export async function apiLogout(): Promise<void> {
  const currentToken = getStoredSessionToken();
  setStoredSessionToken('');
  if (!currentToken.startsWith('tklocal.')) {
    await requestJsonWithFallback('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
  }
}

export async function apiChangePassword(currentPassword: string, newPassword: string): Promise<string> {
  const res = await requestJsonWithFallback<{ message?: string }>(
    '/api/auth/change-password',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    },
    'Gagal mengubah kata sandi.'
  );
  if (!res.ok) throw new Error(res.data.error || 'Gagal mengubah kata sandi.');
  return res.data.message || 'Kata sandi berhasil diperbarui.';
}

export async function apiFetchTeamMembers(): Promise<TeamMember[]> {
  const res = await requestJsonWithFallback<{ members?: TeamMember[] }>(
    '/api/team/members',
    {},
    'Gagal memuat daftar anggota.'
  );
  if (!res.ok) throw new Error(res.data.error || 'Gagal memuat daftar anggota.');
  return res.data.members || [];
}

export async function apiAddTeamMember(
  username: string,
  password: string,
  role: UserRole
): Promise<TeamMember> {
  const res = await requestJsonWithFallback<{ member?: TeamMember }>(
    '/api/team/members',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, role }),
    },
    'Gagal menambahkan anggota.'
  );
  if (!res.ok || !res.data.member) throw new Error(res.data.error || 'Gagal menambahkan anggota.');
  return res.data.member;
}

export async function apiDeleteTeamMember(username: string): Promise<void> {
  const res = await requestJsonWithFallback(
    `/api/team/members/${encodeURIComponent(username)}`,
    { method: 'DELETE' },
    'Gagal menghapus anggota.'
  );
  if (!res.ok) throw new Error(res.data.error || 'Gagal menghapus anggota.');
}

// ============================================================================
// CUSTOM DOMAIN (CNAME & CLOUDFLARE SAAS SSL) SETTINGS API
// ============================================================================

export async function apiFetchDomainSettings(): Promise<AccountSettings> {
  const res = await requestJsonWithFallback<{ settings?: AccountSettings }>(
    '/api/settings/domains',
    {},
    'Gagal memuat pengaturan domain.'
  );
  if (!res.ok || !res.data.settings) throw new Error(res.data.error || 'Gagal memuat pengaturan domain.');
  return res.data.settings;
}

export async function apiAddCustomDomain(
  domain: string,
  setAsDefault = true,
  planTier: DomainPlanTier = 'free'
): Promise<AccountSettings> {
  const res = await requestJsonWithFallback<{ settings?: AccountSettings }>(
    '/api/settings/domains',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain, setAsDefault, planTier }),
    },
    'Gagal menautkan domain kustom.'
  );
  if (!res.ok || !res.data.settings) throw new Error(res.data.error || 'Gagal menautkan domain kustom.');
  return res.data.settings;
}

export async function apiVerifyCustomDomain(
  domain: string,
  activateSandbox = false
): Promise<AccountSettings> {
  const res = await requestJsonWithFallback<{ settings?: AccountSettings }>(
    `/api/settings/domains/${encodeURIComponent(domain)}/verify`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activateSandbox }),
    },
    'Gagal memverifikasi DNS/SSL domain.'
  );
  if (!res.ok || !res.data.settings) throw new Error(res.data.error || 'Gagal memverifikasi DNS/SSL domain.');
  return res.data.settings;
}

export async function apiSetActiveDomain(activeDomain: string): Promise<AccountSettings> {
  const res = await requestJsonWithFallback<{ settings?: AccountSettings }>(
    '/api/settings/domains/active',
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activeDomain }),
    },
    'Gagal mengatur domain aktif.'
  );
  if (!res.ok || !res.data.settings) throw new Error(res.data.error || 'Gagal mengatur domain aktif.');
  return res.data.settings;
}

export async function apiRemoveCustomDomain(domain: string): Promise<AccountSettings> {
  const res = await requestJsonWithFallback<{ settings?: AccountSettings }>(
    `/api/settings/domains/${encodeURIComponent(domain)}`,
    { method: 'DELETE' },
    'Gagal menghapus domain kustom.'
  );
  if (!res.ok || !res.data.settings) throw new Error(res.data.error || 'Gagal menghapus domain kustom.');
  return res.data.settings;
}

// ============================================================================
// DEVELOPER API KEYS, WEBHOOKS, ZAPIER/MAKE & SECURITY SCANNER API
// ============================================================================

export async function apiFetchScannerStatus(): Promise<{
  heuristic: boolean;
  googleSafeBrowsingConfigured: boolean;
  virusTotalConfigured: boolean;
  cloudflareSaasConfigured: boolean;
}> {
  const res = await requestJsonWithFallback<{
    heuristic?: boolean;
    googleSafeBrowsingConfigured?: boolean;
    virusTotalConfigured?: boolean;
    cloudflareSaasConfigured?: boolean;
  }>('/api/security/scanner-status');

  if (!res.ok) {
    return {
      heuristic: true,
      googleSafeBrowsingConfigured: false,
      virusTotalConfigured: false,
      cloudflareSaasConfigured: false,
    };
  }
  return {
    heuristic: Boolean(res.data.heuristic ?? true),
    googleSafeBrowsingConfigured: Boolean(res.data.googleSafeBrowsingConfigured),
    virusTotalConfigured: Boolean(res.data.virusTotalConfigured),
    cloudflareSaasConfigured: Boolean(res.data.cloudflareSaasConfigured),
  };
}

export async function apiFetchApiKeys(): Promise<ApiKeyEntry[]> {
  const res = await requestJsonWithFallback<{ apiKeys?: ApiKeyEntry[] }>(
    '/api/developer/keys',
    {},
    'Gagal memuat API Keys.'
  );
  if (!res.ok) throw new Error(res.data.error || 'Gagal memuat API Keys.');
  return res.data.apiKeys || [];
}

export async function apiCreateApiKey(name: string): Promise<{ apiKey: ApiKeyEntry; rawKey: string }> {
  const res = await requestJsonWithFallback<{ apiKey: ApiKeyEntry; rawKey: string }>(
    '/api/developer/keys',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    },
    'Gagal membuat API Key.'
  );
  if (!res.ok) throw new Error(res.data.error || 'Gagal membuat API Key.');
  return { apiKey: res.data.apiKey, rawKey: res.data.rawKey };
}

export async function apiDeleteApiKey(id: string): Promise<void> {
  const res = await requestJsonWithFallback(
    `/api/developer/keys/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
    'Gagal mencabut API Key.'
  );
  if (!res.ok) throw new Error(res.data.error || 'Gagal mencabut API Key.');
}

export async function apiFetchWebhooks(): Promise<{
  webhooks: WebhookConfig[];
  logs: WebhookDeliveryLog[];
}> {
  const res = await requestJsonWithFallback<{
    webhooks?: WebhookConfig[];
    logs?: WebhookDeliveryLog[];
  }>('/api/developer/webhooks', {}, 'Gagal memuat webhook.');
  if (!res.ok) throw new Error(res.data.error || 'Gagal memuat webhook.');
  return { webhooks: res.data.webhooks || [], logs: res.data.logs || [] };
}

export async function apiCreateWebhook(payload: {
  name: string;
  targetUrl: string;
  events: Array<'link.clicked' | 'link.created' | 'link.quota_reached'>;
}): Promise<WebhookConfig> {
  const res = await requestJsonWithFallback<{ webhook?: WebhookConfig }>(
    '/api/developer/webhooks',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    'Gagal mendaftarkan webhook.'
  );
  if (!res.ok || !res.data.webhook) throw new Error(res.data.error || 'Gagal mendaftarkan webhook.');
  return res.data.webhook;
}

export async function apiTestWebhook(id: string): Promise<{
  log: WebhookDeliveryLog | null;
  logs: WebhookDeliveryLog[];
}> {
  const res = await requestJsonWithFallback<{
    log: WebhookDeliveryLog | null;
    logs: WebhookDeliveryLog[];
  }>(
    `/api/developer/webhooks/${encodeURIComponent(id)}/test`,
    { method: 'POST' },
    'Gagal menguji webhook.'
  );
  if (!res.ok) throw new Error(res.data.error || 'Gagal menguji webhook.');
  return { log: res.data.log || null, logs: res.data.logs || [] };
}

export async function apiDeleteWebhook(id: string): Promise<void> {
  const res = await requestJsonWithFallback(
    `/api/developer/webhooks/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
    'Gagal menghapus webhook.'
  );
  if (!res.ok) throw new Error(res.data.error || 'Gagal menghapus webhook.');
}

export async function apiTriggerZapierSimulation(payload: {
  url: string;
  slug?: string;
  title?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  source_app: string;
}): Promise<{
  status: string;
  integration: string;
  shortUrl: string;
  slug: string;
  targetUrl: string;
  createdAt: string;
}> {
  const res = await requestJsonWithFallback<{
    status: string;
    integration: string;
    shortUrl: string;
    slug: string;
    targetUrl: string;
    createdAt: string;
  }>(
    '/api/integrations/zapier/shorten',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    'Simulasi webhook integrasi gagal.'
  );
  if (!res.ok) throw new Error(res.data.error || 'Simulasi webhook integrasi gagal.');
  return res.data;
}

// ============================================================================
// SHORTLINKS & BULK IMPORT API
// ============================================================================

export async function apiFetchLinks(): Promise<ShortLinkItem[]> {
  const res = await requestJsonWithFallback<{ links?: ShortLinkItem[] }>(
    '/api/links',
    {},
    'Gagal memuat daftar tautan.'
  );
  if (!res.ok) throw new Error(res.data.error || 'Gagal memuat daftar tautan.');
  return res.data.links || [];
}

export async function apiFetchLinkBySlug(slug: string): Promise<{
  link: ShortLinkItem;
  expired: boolean;
  quotaExceeded: boolean;
}> {
  const normalizedSlug = slug.trim().toLowerCase();
  const res = await requestJsonWithFallback<{
    link?: ShortLinkItem;
    expired?: boolean;
    quotaExceeded?: boolean;
  }>(`/api/links/${encodeURIComponent(normalizedSlug)}`, {}, 'Tautan tidak ditemukan.');

  if (res.ok && res.data.link) {
    return {
      link: res.data.link,
      expired: Boolean(res.data.expired),
      quotaExceeded: Boolean(res.data.quotaExceeded),
    };
  }

  // Fallback to Cloud Firestore public read (so custom domains or cross-device links resolve even without local state)
  try {
    const snap = await getDoc(doc(db, 'shortLinks', normalizedSlug));
    if (snap.exists()) {
      const raw = snap.data();
      const link: ShortLinkItem = {
        slug: String(raw.slug || normalizedSlug),
        ownerId: String(raw.ownerId || ''),
        linkType: raw.linkType === 'vcard' ? 'vcard' : 'url',
        targetUrl: String(raw.targetUrl || ''),
        title: String(raw.title || normalizedSlug),
        customDomain: String(raw.customDomain || ''),
        redirectType: raw.redirectType === 301 ? 301 : 302,
        isActive: Boolean(raw.isActive),
        hasPassword: Boolean(raw.hasPassword),
        passwordHash: '',
        expiresAt: String(raw.expiresAt || ''),
        maxClicks: typeof raw.maxClicks === 'number' && raw.maxClicks > 0 ? raw.maxClicks : null,
        interstitialEnabled: Boolean(raw.interstitialEnabled),
        safetyStatus:
          raw.safetyStatus === 'blocked' || raw.safetyStatus === 'warning'
            ? raw.safetyStatus
            : 'safe',
        safetyReason: String(raw.safetyReason || ''),
        clickCount: Number(raw.clickCount || 0),
        createdAt: toIsoString(raw.createdAt),
        updatedAt: toIsoString(raw.updatedAt),
      };
      const expired = Boolean(link.expiresAt && new Date(link.expiresAt).getTime() <= Date.now());
      const quotaExceeded = Boolean(link.maxClicks && link.maxClicks > 0 && link.clickCount >= link.maxClicks);
      return { link, expired, quotaExceeded };
    }
  } catch {
    // Ignore Firestore offline/permission fallback errors and raise original not found error
  }

  throw new Error(res.data.error || 'Tautan tidak ditemukan.');
}

export async function apiUnlockLink(slug: string, password: string): Promise<string> {
  const res = await requestJsonWithFallback<{ targetUrl?: string }>(
    `/api/links/${encodeURIComponent(slug)}/unlock`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    },
    'Kata sandi salah.'
  );
  if (!res.ok || !res.data.targetUrl) throw new Error(res.data.error || 'Kata sandi salah.');
  return res.data.targetUrl;
}

export function getVCardHrefOrDataUrl(link: ShortLinkItem): string {
  const token = getStoredSessionToken();
  if (token.startsWith('tklocal.') || getFallbackLinkBySlugSync(link.slug)) {
    const vcf = buildFallbackVCardContent(link);
    if (vcf) {
      return `data:text/vcard;charset=utf-8,${encodeURIComponent(vcf)}`;
    }
  }
  return resolveApiUrl(`/api/links/${encodeURIComponent(link.slug)}/vcard`);
}

export async function apiCreateLink(payload: CreateLinkPayload): Promise<ShortLinkItem> {
  const res = await requestJsonWithFallback<{ link?: ShortLinkItem }>(
    '/api/links',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    'Gagal membuat shortlink.'
  );
  if (!res.ok || !res.data.link) throw new Error(res.data.error || 'Gagal membuat shortlink.');
  return res.data.link;
}

export async function apiBulkCreateLinks(
  rows: ParsedBulkRow[],
  customDomain: string
): Promise<{
  results: BulkCreateRowResult[];
  createdLinks: ShortLinkItem[];
  createdCount: number;
  skippedCount: number;
}> {
  const payloadRows = rows.map((r) => ({
    rowNumber: r.rowNumber,
    targetUrl: r.targetUrl,
    slug: r.slugMode === 'custom' ? r.slug : '',
    title: r.title,
    redirectType: r.redirectType,
  }));

  const res = await requestJsonWithFallback<{
    results: BulkCreateRowResult[];
    createdLinks: ShortLinkItem[];
    createdCount: number;
    skippedCount: number;
  }>(
    '/api/links/bulk',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: payloadRows, customDomain }),
    },
    'Gagal memproses unggahan massal.'
  );
  if (!res.ok) throw new Error(res.data.error || 'Gagal memproses unggahan massal.');
  return res.data;
}

export async function apiUpdateLink(
  slug: string,
  patch: UpdateLinkPayload
): Promise<ShortLinkItem> {
  const res = await requestJsonWithFallback<{ link?: ShortLinkItem }>(
    `/api/links/${encodeURIComponent(slug)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    },
    'Gagal memperbarui tautan.'
  );
  if (!res.ok || !res.data.link) throw new Error(res.data.error || 'Gagal memperbarui tautan.');
  return res.data.link;
}

export async function apiDeleteLink(slug: string): Promise<void> {
  const res = await requestJsonWithFallback(
    `/api/links/${encodeURIComponent(slug)}`,
    { method: 'DELETE' },
    'Gagal menghapus tautan.'
  );
  if (!res.ok) throw new Error(res.data.error || 'Gagal menghapus tautan.');
}

export async function apiFetchAnalytics(slug?: string): Promise<AnalyticsSummary> {
  const url = slug ? `/api/analytics?slug=${encodeURIComponent(slug)}` : '/api/analytics';
  const res = await requestJsonWithFallback<AnalyticsSummary & Record<string, unknown>>(
    url,
    {},
    'Gagal memuat analitik.'
  );
  if (!res.ok) throw new Error(res.data.error || 'Gagal memuat analitik.');
  return res.data;
}

export async function apiFetchBios(): Promise<BioProfile[]> {
  const res = await requestJsonWithFallback<{ profiles?: BioProfile[] }>(
    '/api/bios',
    {},
    'Gagal memuat daftar Link-in-Bio.'
  );
  if (!res.ok) throw new Error(res.data.error || 'Gagal memuat daftar Link-in-Bio.');
  return res.data.profiles || [];
}

export async function apiCreateBio(payload: {
  handle: string;
  displayName: string;
  bio?: string;
  theme?: BioTheme;
  templateId?: BioTemplateId;
  customDomain?: string;
  avatarUrl?: string;
  backgroundImageUrl?: string;
  backgroundOverlay?: BioBackgroundOverlay;
  items?: BioLinkEntry[];
}): Promise<BioProfile> {
  const res = await requestJsonWithFallback<{ profile?: BioProfile }>(
    '/api/bios',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    'Gagal membuat halaman Link-in-Bio baru.'
  );
  if (!res.ok || !res.data.profile) throw new Error(res.data.error || 'Gagal membuat halaman Link-in-Bio baru.');
  return res.data.profile;
}

export async function apiFetchBio(handle: string): Promise<BioProfile> {
  const normalizedHandle = handle.trim().toLowerCase();
  const res = await requestJsonWithFallback<{ profile?: BioProfile }>(
    `/api/bio/${encodeURIComponent(normalizedHandle)}`,
    {},
    'Profil Link-in-Bio tidak ditemukan.'
  );
  if (res.ok && res.data.profile) {
    return res.data.profile;
  }

  // Fallback to Cloud Firestore public read
  try {
    const profileSnap = await getDoc(doc(db, 'bioProfiles', normalizedHandle));
    if (profileSnap.exists()) {
      const raw = profileSnap.data();
      const itemsSnap = await getDocs(
        query(collection(db, 'bioProfiles', normalizedHandle, 'items'), orderBy('order', 'asc'))
      );
      const items: BioLinkEntry[] = itemsSnap.docs.map((d, idx) => {
        const ir = d.data();
        return {
          id: String(ir.id || d.id),
          ownerId: String(ir.ownerId || raw.ownerId || ''),
          title: String(ir.title || 'Tautan'),
          url: String(ir.url || 'https://tautkilat.id'),
          badge: typeof ir.badge === 'string' ? ir.badge : undefined,
          order: typeof ir.order === 'number' ? ir.order : idx,
          clicks: Number(ir.clicks || 0),
          isActive: Boolean(ir.isActive ?? true),
          createdAt: toIsoString(ir.createdAt),
          updatedAt: toIsoString(ir.updatedAt),
        };
      });
      return {
        handle: String(raw.handle || normalizedHandle),
        ownerId: String(raw.ownerId || ''),
        displayName: String(raw.displayName || normalizedHandle),
        bio: String(raw.bio || ''),
        theme: (raw.theme as BioTheme) || 'cobalt',
        templateId: (raw.templateId as BioTemplateId) || 'minimal-card',
        customDomain: String(raw.customDomain || ''),
        avatarUrl: typeof raw.avatarUrl === 'string' ? raw.avatarUrl : '',
        backgroundImageUrl: typeof raw.backgroundImageUrl === 'string' ? raw.backgroundImageUrl : '',
        backgroundOverlay: (raw.backgroundOverlay as BioBackgroundOverlay) || 'dark',
        items,
        createdAt: toIsoString(raw.createdAt),
        updatedAt: toIsoString(raw.updatedAt),
      };
    }
  } catch {
    // Ignore Firestore fallback errors
  }

  throw new Error(res.data.error || 'Profil Link-in-Bio tidak ditemukan.');
}

export async function apiSaveBio(
  handle: string,
  payload: {
    newHandle?: string;
    displayName: string;
    bio: string;
    theme: BioTheme;
    templateId?: BioTemplateId;
    customDomain?: string;
    avatarUrl?: string;
    backgroundImageUrl?: string;
    backgroundOverlay?: BioBackgroundOverlay;
    items: BioLinkEntry[];
  }
): Promise<BioProfile> {
  const res = await requestJsonWithFallback<{ profile?: BioProfile }>(
    `/api/bio/${encodeURIComponent(handle)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    'Gagal menyimpan Link-in-Bio.'
  );
  if (!res.ok || !res.data.profile) throw new Error(res.data.error || 'Gagal menyimpan Link-in-Bio.');
  return res.data.profile;
}

export async function apiDeleteBio(handle: string): Promise<void> {
  const res = await requestJsonWithFallback(
    `/api/bio/${encodeURIComponent(handle)}`,
    { method: 'DELETE' },
    'Gagal menghapus profil Link-in-Bio.'
  );
  if (!res.ok) throw new Error(res.data.error || 'Gagal menghapus profil Link-in-Bio.');
}

export async function apiRecordBioClick(handle: string, itemId: string): Promise<void> {
  await requestJsonWithFallback(`/api/bio/${encodeURIComponent(handle)}/click`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ itemId }),
  }).catch(() => undefined);
}

export async function apiRunCryptoSandbox(payload: {
  action: 'hash_password' | 'encrypt' | 'decrypt';
  password?: string;
  text?: string;
  cipherPayload?: string;
  secretKey?: string;
}): Promise<{ hash?: string; encrypted?: string; decrypted?: string }> {
  const res = await requestJsonWithFallback<{
    hash?: string;
    encrypted?: string;
    decrypted?: string;
  }>(
    '/api/crypto-sandbox',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    'Gagal menjalankan simulasi kriptografi.'
  );
  if (!res.ok) throw new Error(res.data.error || 'Gagal menjalankan simulasi kriptografi.');
  return res.data;
}

// ============================================================================
// CLOUD FIRESTORE CROSS-DEVICE SYNC (Authenticated Google User)
// ============================================================================

export async function syncUserProfileToFirestore(
  uid: string,
  email: string,
  displayName: string
): Promise<void> {
  const path = `users/${uid}/private/profile`;
  try {
    const ref = doc(db, 'users', uid, 'private', 'profile');
    const existing = await getDoc(ref);
    if (!existing.exists()) {
      await setDoc(ref, {
        uid,
        email,
        displayName: displayName || email.split('@')[0],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        email,
        displayName: displayName || email.split('@')[0],
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function syncAccountSettingsToFirestore(
  uid: string,
  settings: AccountSettings
): Promise<void> {
  const path = `users/${uid}/private/settings`;
  try {
    const ref = doc(db, 'users', uid, 'private', 'settings');
    await setDoc(ref, {
      uid,
      activeDomain: settings.activeDomain,
      customDomains: settings.customDomains.slice(0, 10).map((d) => d.domain),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeUserShortLinks(
  uid: string,
  onData: (links: ShortLinkItem[]) => void,
  onError?: (err: Error) => void
): () => void {
  const q = query(
    collection(db, 'shortLinks'),
    where('ownerId', '==', uid),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const items: ShortLinkItem[] = snapshot.docs.map((d) => {
        const raw = d.data();
        return {
          slug: String(raw.slug || d.id),
          ownerId: String(raw.ownerId || uid),
          linkType: raw.linkType === 'vcard' ? 'vcard' : 'url',
          targetUrl: String(raw.targetUrl || ''),
          title: String(raw.title || d.id),
          customDomain: String(raw.customDomain || ''),
          redirectType: raw.redirectType === 301 ? 301 : 302,
          isActive: Boolean(raw.isActive),
          hasPassword: Boolean(raw.hasPassword),
          passwordHash: String(raw.passwordHash || ''),
          expiresAt: String(raw.expiresAt || ''),
          maxClicks: typeof raw.maxClicks === 'number' && raw.maxClicks > 0 ? raw.maxClicks : null,
          interstitialEnabled: Boolean(raw.interstitialEnabled),
          safetyStatus:
            raw.safetyStatus === 'blocked' || raw.safetyStatus === 'warning'
              ? raw.safetyStatus
              : 'safe',
          safetyReason: String(raw.safetyReason || ''),
          clickCount: Number(raw.clickCount || 0),
          createdAt: toIsoString(raw.createdAt),
          updatedAt: toIsoString(raw.updatedAt),
        };
      });
      onData(items);
    },
    (err) => {
      if (onError) onError(err);
      else handleFirestoreError(err, OperationType.LIST, 'shortLinks');
    }
  );
}

export async function createShortLinkInFirestore(link: ShortLinkItem): Promise<void> {
  const path = `shortLinks/${link.slug}`;
  try {
    const ref = doc(db, 'shortLinks', link.slug);
    await setDoc(ref, {
      slug: link.slug,
      ownerId: link.ownerId,
      linkType: link.linkType || 'url',
      targetUrl: link.targetUrl,
      title: link.title,
      customDomain: link.customDomain || '',
      maxClicks: link.maxClicks || 0,
      interstitialEnabled: Boolean(link.interstitialEnabled),
      redirectType: link.redirectType,
      isActive: link.isActive,
      hasPassword: link.hasPassword,
      passwordHash: link.passwordHash,
      expiresAt: link.expiresAt,
      safetyStatus: link.safetyStatus,
      safetyReason: link.safetyReason,
      clickCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateShortLinkInFirestore(
  slug: string,
  patch: Partial<
    Pick<
      ShortLinkItem,
      | 'title'
      | 'targetUrl'
      | 'isActive'
      | 'redirectType'
      | 'expiresAt'
      | 'customDomain'
      | 'linkType'
      | 'maxClicks'
      | 'interstitialEnabled'
      | 'hasPassword'
      | 'passwordHash'
      | 'safetyStatus'
      | 'safetyReason'
    >
  >
): Promise<void> {
  const path = `shortLinks/${slug}`;
  try {
    await updateDoc(doc(db, 'shortLinks', slug), {
      ...patch,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteShortLinkInFirestore(slug: string): Promise<void> {
  const path = `shortLinks/${slug}`;
  try {
    await deleteDoc(doc(db, 'shortLinks', slug));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

function sanitizeFirestoreImageUrl(url?: string): string {
  const clean = (url || '').trim();
  if (!clean) return '';
  // Never store base64 data URIs in Firestore documents (1MB doc limit & security rules best practice)
  if (clean.startsWith('data:')) return '';
  if ((clean.startsWith('https://') || clean.startsWith('http://') || clean.startsWith('/')) && clean.length <= 2048) {
    return clean;
  }
  return '';
}

export async function upsertBioInFirestore(
  uid: string,
  profile: {
    handle: string;
    displayName: string;
    bio: string;
    theme: BioTheme;
    templateId?: BioTemplateId;
    customDomain?: string;
    avatarUrl?: string;
    backgroundImageUrl?: string;
    backgroundOverlay?: BioBackgroundOverlay;
    items: BioLinkEntry[];
  }
): Promise<void> {
  const profilePath = `bioProfiles/${profile.handle}`;
  const safeAvatarUrl = sanitizeFirestoreImageUrl(profile.avatarUrl);
  const safeBgUrl = sanitizeFirestoreImageUrl(profile.backgroundImageUrl);
  const safeOverlay = profile.backgroundOverlay || 'dark';

  try {
    const profileRef = doc(db, 'bioProfiles', profile.handle);
    const snap = await getDoc(profileRef);
    if (!snap.exists()) {
      await setDoc(profileRef, {
        handle: profile.handle,
        ownerId: uid,
        displayName: profile.displayName,
        bio: profile.bio,
        theme: profile.theme,
        templateId: profile.templateId || 'minimal-card',
        customDomain: profile.customDomain || '',
        avatarUrl: safeAvatarUrl,
        backgroundImageUrl: safeBgUrl,
        backgroundOverlay: safeOverlay,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(profileRef, {
        displayName: profile.displayName,
        bio: profile.bio,
        theme: profile.theme,
        templateId: profile.templateId || 'minimal-card',
        customDomain: profile.customDomain || '',
        avatarUrl: safeAvatarUrl,
        backgroundImageUrl: safeBgUrl,
        backgroundOverlay: safeOverlay,
        updatedAt: serverTimestamp(),
      });
    }

    for (let i = 0; i < profile.items.length; i++) {
      const item = profile.items[i];
      const itemRef = doc(db, 'bioProfiles', profile.handle, 'items', item.id);
      const itemSnap = await getDoc(itemRef);
      if (!itemSnap.exists()) {
        await setDoc(itemRef, {
          id: item.id,
          ownerId: uid,
          title: item.title,
          url: item.url,
          order: i,
          clicks: 0,
          isActive: item.isActive,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(itemRef, {
          title: item.title,
          url: item.url,
          order: i,
          isActive: item.isActive,
          updatedAt: serverTimestamp(),
        });
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, profilePath);
  }
}

export async function recordBioClickInFirestore(handle: string, itemId: string): Promise<void> {
  const path = `bioProfiles/${handle}/items/${itemId}`;
  try {
    await updateDoc(doc(db, 'bioProfiles', handle, 'items', itemId), {
      clicks: increment(1),
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Fallback gracefully
  }
}
