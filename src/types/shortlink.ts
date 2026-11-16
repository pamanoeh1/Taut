export type RedirectType = 301 | 302;
export type SafetyStatus = 'safe' | 'warning' | 'blocked';
export type BioTheme = 'slate' | 'cobalt' | 'emerald' | 'amber';
export type BioTemplateId = 'minimal-card' | 'creator-grid' | 'product-showcase' | 'dark-terminal';
export type UserRole = 'super_admin' | 'member';
export type LinkType = 'url' | 'vcard';
export type SslStatus = 'pending_cname' | 'verifying_ssl' | 'active';
export type DomainPlanTier = 'free' | 'paid';

export interface AuthSessionUser {
  username: string;
  role: UserRole;
  createdAt: string;
}

export interface TeamMember {
  username: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export interface CustomDomainConfig {
  domain: string;
  planTier: DomainPlanTier;
  cnameTarget: string;
  txtVerificationHost: string;
  txtVerificationValue: string;
  sslStatus: SslStatus;
  sslProvider: 'cloudflare_saas';
  verified: boolean;
  addedAt: string;
  lastCheckedAt?: string;
  diagnosticMessage?: string;
}

export interface TrackingPixelsConfig {
  facebookPixelId?: string;
  googleTagId?: string;
  tiktokPixelId?: string;
  linkedinPartnerId?: string;
}

export interface OpenGraphMeta {
  title?: string;
  description?: string;
  imageUrl?: string;
}

export interface UtmParams {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
}

export interface GeoRouteRule {
  countryCode: string; // e.g. 'ID', 'US', 'SG'
  targetUrl: string;
}

export interface DeviceRouteRules {
  iosUrl?: string;
  androidUrl?: string;
  desktopUrl?: string;
}

export interface AbVariantRule {
  label: string;
  targetUrl: string;
  weight: number; // 0-100
}

export interface TimeRouteRule {
  switchAt: string; // ISO date-time
  afterTargetUrl: string;
}

export interface VCardData {
  fullName: string;
  organization?: string;
  role?: string;
  phone: string;
  email?: string;
  website?: string;
  address?: string;
}

export interface ApiKeyEntry {
  id: string;
  name: string;
  prefix: string; // e.g. 'tk_live_ab12cd'
  keyHash: string;
  createdBy: string;
  createdAt: string;
  lastUsedAt?: string;
}

export interface WebhookConfig {
  id: string;
  name: string;
  targetUrl: string;
  events: Array<'link.clicked' | 'link.created' | 'link.quota_reached'>;
  secret: string;
  isActive: boolean;
  createdAt: string;
}

export interface WebhookDeliveryLog {
  id: string;
  webhookId: string;
  event: string;
  targetUrl: string;
  statusCode: number;
  ok: boolean;
  message: string;
  createdAt: string;
}

export interface AccountSettings {
  activeDomain: string; // '' means system default (/s/slug)
  customDomains: CustomDomainConfig[];
  zapierHookSecret?: string;
}

export interface ShortLinkItem {
  slug: string;
  ownerId: string;
  linkType?: LinkType;
  targetUrl: string;
  title: string;
  customDomain?: string; // e.g. 'go.mydomain.com' or ''
  redirectType: RedirectType;
  isActive: boolean;
  hasPassword: boolean;
  passwordHash: string;
  expiresAt: string; // ISO string or ''
  maxClicks?: number | null;
  interstitialEnabled?: boolean;
  trackingPixels?: TrackingPixelsConfig;
  ogMeta?: OpenGraphMeta;
  utm?: UtmParams;
  geoRules?: GeoRouteRule[];
  deviceRules?: DeviceRouteRules;
  abVariants?: AbVariantRule[];
  timeRule?: TimeRouteRule | null;
  vcard?: VCardData | null;
  safetyStatus: SafetyStatus;
  safetyReason: string;
  safetyEngine?: string;
  clickCount: number;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
}

export interface ClickEventItem {
  id: string;
  ownerId: string;
  slug: string;
  country: string;
  city: string;
  device: 'Desktop' | 'Mobile' | 'Tablet' | 'Bot';
  os: string;
  browser: string;
  referer: string;
  variantLabel?: string;
  routedBy?: string;
  latencyMs: number;
  cacheHit: boolean;
  createdAt: string; // ISO string
}

export interface BioLinkEntry {
  id: string;
  ownerId: string;
  title: string;
  url: string;
  badge?: string;
  order: number;
  clicks: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BioProfile {
  handle: string;
  ownerId: string;
  displayName: string;
  bio: string;
  theme: BioTheme;
  templateId?: BioTemplateId;
  customDomain?: string;
  avatarUrl?: string;
  items: BioLinkEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateLinkPayload {
  linkType?: LinkType;
  targetUrl: string;
  customSlug?: string;
  customDomain?: string;
  title?: string;
  redirectType?: RedirectType;
  password?: string;
  expiresAt?: string;
  maxClicks?: number | null;
  interstitialEnabled?: boolean;
  trackingPixels?: TrackingPixelsConfig;
  ogMeta?: OpenGraphMeta;
  utm?: UtmParams;
  geoRules?: GeoRouteRule[];
  deviceRules?: DeviceRouteRules;
  abVariants?: AbVariantRule[];
  timeRule?: TimeRouteRule | null;
  vcard?: VCardData | null;
}

export interface BulkCreateRowResult {
  rowNumber: number;
  targetUrl: string;
  slug: string;
  customDomain: string;
  status: 'created' | 'skipped' | 'error';
  reason?: string;
  link?: ShortLinkItem;
}

export interface AnalyticsSummary {
  totalClicks: number;
  activeLinks: number;
  protectedLinks: number;
  avgCacheLatencyMs: number;
  cacheHitRate: number;
  byCountry: Array<{ name: string; count: number }>;
  byDevice: Array<{ name: string; count: number }>;
  byOs: Array<{ name: string; count: number }>;
  byReferer: Array<{ name: string; count: number }>;
  dailySeries: Array<{ date: string; clicks: number }>;
  recentClicks: ClickEventItem[];
}
