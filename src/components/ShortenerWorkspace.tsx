import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Contact,
  Copy,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Globe,
  Link2,
  Lock,
  Plus,
  Power,
  QrCode,
  Search,
  ShieldCheck,
  ShieldX,
  SlidersHorizontal,
  Trash2,
  Upload,
} from 'lucide-react';
import type {
  AbVariantRule,
  AccountSettings,
  BulkCreateRowResult,
  CreateLinkPayload,
  GeoRouteRule,
  RedirectType,
  ShortLinkItem,
} from '../types/shortlink';
import {
  generateSampleCsvContent,
  parseBulkSpreadsheet,
  type ParsedBulkRow,
} from '../utils/bulkImportParser';
import { formatShortUrl } from '../utils/customDomain';
import { appendUtmParams, isLinkQuotaExceeded } from '../utils/routingAndUtm';
import { isLinkExpired, normalizeAndValidateUrl, screenUrlSafety } from '../utils/urlSecurity';

interface ShortenerWorkspaceProps {
  links: ShortLinkItem[];
  loading: boolean;
  isCloudSynced: boolean;
  domainSettings: AccountSettings;
  onCreateLink: (payload: CreateLinkPayload) => Promise<ShortLinkItem>;
  onBulkCreateLinks: (
    rows: ParsedBulkRow[],
    customDomain: string
  ) => Promise<{
    results: BulkCreateRowResult[];
    createdCount: number;
    skippedCount: number;
  }>;
  onToggleActive: (link: ShortLinkItem) => Promise<void>;
  onDeleteLink: (slug: string) => Promise<void>;
  onOpenQr: (link: ShortLinkItem) => void;
  onPreviewGate: (slug: string) => void;
  onOpenSettings: () => void;
}

type AdvancedTab = 'utm' | 'og' | 'pixels' | 'routing' | 'ab_time';

const COUNTRY_OPTIONS = [
  { code: 'ID', label: 'Indonesia (ID)' },
  { code: 'US', label: 'Amerika Serikat (US)' },
  { code: 'SG', label: 'Singapura (SG)' },
  { code: 'MY', label: 'Malaysia (MY)' },
  { code: 'GB', label: 'Inggris (GB)' },
  { code: 'AU', label: 'Australia (AU)' },
  { code: 'JP', label: 'Jepang (JP)' },
];

export const ShortenerWorkspace: React.FC<ShortenerWorkspaceProps> = ({
  links,
  loading,
  isCloudSynced,
  domainSettings,
  onCreateLink,
  onBulkCreateLinks,
  onToggleActive,
  onDeleteLink,
  onOpenQr,
  onPreviewGate,
  onOpenSettings,
}) => {
  const [mode, setMode] = useState<'single' | 'vcard' | 'bulk'>('single');

  // Single shortener basic state
  const [targetUrl, setTargetUrl] = useState('');
  const [customSlug, setCustomSlug] = useState('');
  const [selectedDomain, setSelectedDomain] = useState(domainSettings.activeDomain);
  const [title, setTitle] = useState('');
  const [redirectType, setRedirectType] = useState<RedirectType>(302);
  const [password, setPassword] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  // Advanced Options drawer state
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [advancedTab, setAdvancedTab] = useState<AdvancedTab>('utm');
  const [maxClicks, setMaxClicks] = useState('');
  const [interstitialEnabled, setInterstitialEnabled] = useState(false);

  // UTM Builder
  const [utmSource, setUtmSource] = useState('');
  const [utmMedium, setUtmMedium] = useState('');
  const [utmCampaign, setUtmCampaign] = useState('');
  const [utmTerm, setUtmTerm] = useState('');
  const [utmContent, setUtmContent] = useState('');

  // Open Graph Social Preview
  const [ogTitle, setOgTitle] = useState('');
  const [ogDescription, setOgDescription] = useState('');
  const [ogImageUrl, setOgImageUrl] = useState('');

  // Tracking Pixels
  const [facebookPixelId, setFacebookPixelId] = useState('');
  const [googleTagId, setGoogleTagId] = useState('');
  const [tiktokPixelId, setTiktokPixelId] = useState('');
  const [linkedinPartnerId, setLinkedinPartnerId] = useState('');

  // Geo & OS Routing
  const [geoRules, setGeoRules] = useState<GeoRouteRule[]>([]);
  const [newGeoCode, setNewGeoCode] = useState('ID');
  const [newGeoUrl, setNewGeoUrl] = useState('');
  const [iosUrl, setIosUrl] = useState('');
  const [androidUrl, setAndroidUrl] = useState('');
  const [desktopUrl, setDesktopUrl] = useState('');

  // A/B Split Testing & Time-based Routing
  const [abVariants, setAbVariants] = useState<AbVariantRule[]>([]);
  const [newAbLabel, setNewAbLabel] = useState('');
  const [newAbUrl, setNewAbUrl] = useState('');
  const [newAbWeight, setNewAbWeight] = useState('50');
  const [timeSwitchAt, setTimeSwitchAt] = useState('');
  const [timeAfterUrl, setTimeAfterUrl] = useState('');

  // vCard / Contact QR state
  const [vcFullName, setVcFullName] = useState('');
  const [vcPhone, setVcPhone] = useState('');
  const [vcOrg, setVcOrg] = useState('');
  const [vcRole, setVcRole] = useState('');
  const [vcEmail, setVcEmail] = useState('');
  const [vcWebsite, setVcWebsite] = useState('');
  const [vcAddress, setVcAddress] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [createdBanner, setCreatedBanner] = useState<ShortLinkItem | null>(null);

  // Bulk CSV/XLSX import state
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [bulkFilename, setBulkFilename] = useState('');
  const [bulkDomain, setBulkDomain] = useState(domainSettings.activeDomain);
  const [parsedRows, setParsedRows] = useState<ParsedBulkRow[]>([]);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkSummary, setBulkSummary] = useState<{
    createdCount: number;
    skippedCount: number;
    results: BulkCreateRowResult[];
  } | null>(null);

  // Filter / table state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'protected'>('all');
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  useEffect(() => {
    setSelectedDomain(domainSettings.activeDomain);
    setBulkDomain(domainSettings.activeDomain);
  }, [domainSettings.activeDomain]);

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://taut.id';

  const liveSafety = useMemo(() => {
    if (!targetUrl.trim()) return null;
    const check = normalizeAndValidateUrl(targetUrl);
    if (!check.valid) {
      return { status: 'blocked' as const, reason: check.error || 'Format URL tidak valid.' };
    }
    const screened = screenUrlSafety(check.normalizedUrl);
    return { status: screened.status, reason: screened.reasons[0] };
  }, [targetUrl]);

  const utmPreviewUrl = useMemo(() => {
    const check = normalizeAndValidateUrl(targetUrl || 'https://contoh.id/promo');
    const base = check.valid ? check.normalizedUrl : 'https://contoh.id/promo';
    return appendUtmParams(base, {
      source: utmSource,
      medium: utmMedium,
      campaign: utmCampaign,
      term: utmTerm,
      content: utmContent,
    });
  }, [targetUrl, utmSource, utmMedium, utmCampaign, utmTerm, utmContent]);

  const filteredLinks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return links.filter((link) => {
      const expired = isLinkExpired(link.expiresAt);
      const quotaReached = isLinkQuotaExceeded(link.clickCount, link.maxClicks);
      if (statusFilter === 'active' && (!link.isActive || expired || quotaReached)) {
        return false;
      }
      if (
        statusFilter === 'protected' &&
        !link.hasPassword &&
        !link.expiresAt &&
        !link.maxClicks &&
        !link.interstitialEnabled
      ) {
        return false;
      }
      if (!q) return true;
      return (
        link.slug.toLowerCase().includes(q) ||
        link.title.toLowerCase().includes(q) ||
        link.targetUrl.toLowerCase().includes(q) ||
        (link.customDomain || '').toLowerCase().includes(q)
      );
    });
  }, [links, searchQuery, statusFilter]);

  const handleAddGeoRule = () => {
    const check = normalizeAndValidateUrl(newGeoUrl);
    if (!check.valid) {
      setFormError(check.error || 'Masukkan URL tujuan yang valid untuk aturan negara.');
      return;
    }
    setFormError(null);
    setGeoRules((prev) => [
      ...prev.filter((r) => r.countryCode !== newGeoCode),
      { countryCode: newGeoCode, targetUrl: check.normalizedUrl },
    ]);
    setNewGeoUrl('');
  };

  const handleAddAbVariant = () => {
    const check = normalizeAndValidateUrl(newAbUrl);
    if (!check.valid) {
      setFormError(check.error || 'Masukkan URL varian A/B yang valid.');
      return;
    }
    const weightNum = Math.max(1, Math.min(100, Number(newAbWeight) || 50));
    setFormError(null);
    setAbVariants((prev) => [
      ...prev,
      {
        label: newAbLabel.trim() || `Varian ${String.fromCharCode(65 + prev.length)}`,
        targetUrl: check.normalizedUrl,
        weight: weightNum,
      },
    ]);
    setNewAbLabel('');
    setNewAbUrl('');
  };

  const resetSingleAdvanced = () => {
    setMaxClicks('');
    setInterstitialEnabled(false);
    setUtmSource('');
    setUtmMedium('');
    setUtmCampaign('');
    setUtmTerm('');
    setUtmContent('');
    setOgTitle('');
    setOgDescription('');
    setOgImageUrl('');
    setFacebookPixelId('');
    setGoogleTagId('');
    setTiktokPixelId('');
    setLinkedinPartnerId('');
    setGeoRules([]);
    setIosUrl('');
    setAndroidUrl('');
    setDesktopUrl('');
    setAbVariants([]);
    setTimeSwitchAt('');
    setTimeAfterUrl('');
  };

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setCreatedBanner(null);

    const check = normalizeAndValidateUrl(targetUrl);
    if (!check.valid) {
      setFormError(check.error || 'Masukkan URL tujuan yang valid.');
      return;
    }

    const parsedMaxClicks = maxClicks.trim() ? Number(maxClicks.trim()) : null;
    if (parsedMaxClicks !== null && (!Number.isFinite(parsedMaxClicks) || parsedMaxClicks < 1)) {
      setFormError('Batas maksimal klik harus berupa angka minimal 1.');
      return;
    }

    const hasUtm = Boolean(
      utmSource.trim() || utmMedium.trim() || utmCampaign.trim() || utmTerm.trim() || utmContent.trim()
    );
    const hasOg = Boolean(ogTitle.trim() || ogDescription.trim() || ogImageUrl.trim());
    const hasPixels = Boolean(
      facebookPixelId.trim() || googleTagId.trim() || tiktokPixelId.trim() || linkedinPartnerId.trim()
    );
    const hasDevice = Boolean(iosUrl.trim() || androidUrl.trim() || desktopUrl.trim());
    const hasTimeRule = Boolean(timeSwitchAt.trim() && timeAfterUrl.trim());

    if (hasTimeRule) {
      const timeUrlCheck = normalizeAndValidateUrl(timeAfterUrl);
      if (!timeUrlCheck.valid) {
        setFormError('URL tujuan terjadwal (Time-based Routing) tidak valid.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const created = await onCreateLink({
        linkType: 'url',
        targetUrl: check.normalizedUrl,
        customSlug: customSlug.trim() || undefined,
        customDomain: selectedDomain,
        title: title.trim() || undefined,
        redirectType,
        password: password.trim() || undefined,
        expiresAt: expiresAt.trim() || undefined,
        maxClicks: parsedMaxClicks,
        interstitialEnabled,
        utm: hasUtm
          ? {
              source: utmSource.trim() || undefined,
              medium: utmMedium.trim() || undefined,
              campaign: utmCampaign.trim() || undefined,
              term: utmTerm.trim() || undefined,
              content: utmContent.trim() || undefined,
            }
          : undefined,
        ogMeta: hasOg
          ? {
              title: ogTitle.trim() || undefined,
              description: ogDescription.trim() || undefined,
              imageUrl: ogImageUrl.trim() || undefined,
            }
          : undefined,
        trackingPixels: hasPixels
          ? {
              facebookPixelId: facebookPixelId.trim() || undefined,
              googleTagId: googleTagId.trim() || undefined,
              tiktokPixelId: tiktokPixelId.trim() || undefined,
              linkedinPartnerId: linkedinPartnerId.trim() || undefined,
            }
          : undefined,
        geoRules: geoRules.length > 0 ? geoRules : undefined,
        deviceRules: hasDevice
          ? {
              iosUrl: iosUrl.trim() || undefined,
              androidUrl: androidUrl.trim() || undefined,
              desktopUrl: desktopUrl.trim() || undefined,
            }
          : undefined,
        abVariants: abVariants.length > 0 ? abVariants : undefined,
        timeRule: hasTimeRule
          ? {
              switchAt: new Date(timeSwitchAt).toISOString(),
              afterTargetUrl: normalizeAndValidateUrl(timeAfterUrl).normalizedUrl,
            }
          : null,
      });
      setCreatedBanner(created);
      setTargetUrl('');
      setCustomSlug('');
      setTitle('');
      setPassword('');
      setExpiresAt('');
      resetSingleAdvanced();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Gagal membuat tautan pendek.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVCardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setCreatedBanner(null);

    if (!vcFullName.trim() || !vcPhone.trim()) {
      setFormError('Nama lengkap dan nomor HP wajib diisi untuk QR Kontak vCard.');
      return;
    }

    let safeWebsite = vcWebsite.trim();
    if (safeWebsite) {
      const check = normalizeAndValidateUrl(safeWebsite);
      if (!check.valid) {
        setFormError(check.error || 'Format URL website kontak tidak valid.');
        return;
      }
      safeWebsite = check.normalizedUrl;
    }

    setSubmitting(true);
    try {
      const created = await onCreateLink({
        linkType: 'vcard',
        targetUrl: safeWebsite || 'https://tautkilat.id/vcard',
        customSlug: customSlug.trim() || undefined,
        customDomain: selectedDomain,
        title: title.trim() || `Kartu Kontak: ${vcFullName.trim()}`,
        redirectType: 302,
        vcard: {
          fullName: vcFullName.trim(),
          phone: vcPhone.trim(),
          organization: vcOrg.trim() || undefined,
          role: vcRole.trim() || undefined,
          email: vcEmail.trim() || undefined,
          website: safeWebsite || undefined,
          address: vcAddress.trim() || undefined,
        },
      });
      setCreatedBanner(created);
      setVcFullName('');
      setVcPhone('');
      setVcOrg('');
      setVcRole('');
      setVcEmail('');
      setVcWebsite('');
      setVcAddress('');
      setCustomSlug('');
      setTitle('');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Gagal membuat QR Kontak vCard.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBulkFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setBulkError(null);
    setBulkSummary(null);
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const rows = parseBulkSpreadsheet(buffer);
      if (rows.length === 0) {
        setBulkError('File tidak berisi baris URL yang dapat diproses.');
        setParsedRows([]);
        setBulkFilename('');
        return;
      }
      setBulkFilename(file.name);
      setParsedRows(rows);
    } catch {
      setBulkError('Gagal membaca file CSV/XLSX. Pastikan format file valid.');
      setParsedRows([]);
    }
  };

  const handleBulkGenerate = async () => {
    const validRows = parsedRows.filter((r) => r.status !== 'error');
    if (validRows.length === 0) {
      setBulkError('Tidak ada baris valid untuk dibuat.');
      return;
    }

    setBulkError(null);
    setBulkProcessing(true);
    try {
      const res = await onBulkCreateLinks(validRows, bulkDomain);
      setBulkSummary(res);
      setParsedRows([]);
      setBulkFilename('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : 'Gagal memproses unggahan massal.');
    } finally {
      setBulkProcessing(false);
    }
  };

  const handleDownloadSampleCsv = () => {
    const csv = generateSampleCsvContent();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'contoh-bulk-shortlink.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopy = async (link: ShortLinkItem) => {
    const fullUrl = formatShortUrl(link.slug, link.customDomain, origin);
    await navigator.clipboard.writeText(fullUrl);
    setCopiedSlug(link.slug);
    setTimeout(() => setCopiedSlug(null), 1800);
  };

  const readyBulkCount = parsedRows.filter((r) => r.status !== 'error').length;

  return (
    <div className="space-y-8">
      {/* Hero & Shortener Form / vCard / Bulk Importer */}
      <section aria-labelledby="shortener-heading" className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div className="max-w-3xl">
            <p className="text-xs font-medium text-blue-800 mb-2">
              {isCloudSynced
                ? 'Sinkronisasi Cloud Aktif · Tersimpan lintas perangkat'
                : 'Workspace Terautentikasi · Atur Domain SSL, REST API & Integrasi di Pengaturan'}
            </p>
            <h1
              id="shortener-heading"
              className="font-display text-2xl sm:text-4xl font-bold tracking-tight text-slate-900 text-balance"
            >
              Pemotong Tautan Cepat dengan Smart Routing &amp; Proteksi Keamanan
            </h1>
            <p className="mt-2.5 text-sm sm:text-base text-slate-600 max-w-2xl leading-relaxed">
              Buat shortlink cerdas dengan Geo/OS routing, A/B testing, UTM builder, Open Graph kustom,
              retargeting pixel, kartu kontak vCard QR, hingga impor massal CSV/XLSX.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg shrink-0 self-start lg:self-auto">
            <button
              type="button"
              onClick={() => {
                setMode('single');
                setFormError(null);
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                mode === 'single' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tautan Tunggal
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('vcard');
                setFormError(null);
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                mode === 'vcard' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Contact className="w-3.5 h-3.5" aria-hidden="true" />
              <span>QR Kontak (vCard)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('bulk');
                setFormError(null);
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                mode === 'bulk' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Impor CSV / XLSX</span>
            </button>
          </div>
        </div>

        {mode === 'single' && (
          <form onSubmit={handleSingleSubmit} className="mt-6 space-y-5" noValidate>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-6">
                <label htmlFor="target-url" className="block text-xs font-semibold text-slate-700 mb-1.5">
                  URL Tujuan Panjang
                </label>
                <input
                  id="target-url"
                  type="url"
                  required
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  placeholder="https://tokopedia.com/promo-akhir-tahun-elektronik"
                  className="w-full px-3.5 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-800 focus:ring-2 focus:ring-blue-800/15"
                />
                {liveSafety && (
                  <div className="mt-1.5 flex items-center gap-1.5 text-xs">
                    {liveSafety.status === 'safe' && (
                      <>
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-700 shrink-0" aria-hidden="true" />
                        <span className="text-emerald-800 font-medium">Aman: {liveSafety.reason}</span>
                      </>
                    )}
                    {liveSafety.status === 'warning' && (
                      <>
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0" aria-hidden="true" />
                        <span className="text-amber-800 font-medium">Peringatan: {liveSafety.reason}</span>
                      </>
                    )}
                    {liveSafety.status === 'blocked' && (
                      <>
                        <ShieldX className="w-3.5 h-3.5 text-red-700 shrink-0" aria-hidden="true" />
                        <span className="text-red-700 font-medium">Diblokir: {liveSafety.reason}</span>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="lg:col-span-3">
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="shortlink-domain" className="block text-xs font-semibold text-slate-700">
                    Domain
                  </label>
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    className="text-[11px] font-medium text-blue-800 hover:underline"
                  >
                    Atur Domain
                  </button>
                </div>
                <select
                  id="shortlink-domain"
                  value={selectedDomain}
                  onChange={(e) => setSelectedDomain(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm font-mono text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-800"
                >
                  <option value="">Default (/s/)</option>
                  {domainSettings.customDomains.map((d) => (
                    <option key={d.domain} value={d.domain}>
                      {d.domain}
                    </option>
                  ))}
                </select>
              </div>

              <div className="lg:col-span-3">
                <label htmlFor="custom-slug" className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Slug Kustom (opsional)
                </label>
                <div className="flex items-center border border-slate-300 rounded-lg overflow-hidden focus-within:border-blue-800 focus-within:ring-2 focus-within:ring-blue-800/15 bg-white">
                  <span className="px-2.5 py-2.5 text-xs font-mono text-slate-500 bg-slate-50 border-r border-slate-200 shrink-0">
                    {selectedDomain ? '/' : '/s/'}
                  </span>
                  <input
                    id="custom-slug"
                    type="text"
                    value={customSlug}
                    onChange={(e) => setCustomSlug(e.target.value)}
                    placeholder="promo-desember"
                    className="w-full px-3 py-2.5 text-sm font-mono text-slate-900 bg-white focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Security & Basic Options */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2 border-t border-slate-100">
              <div>
                <label htmlFor="link-title" className="block text-xs font-medium text-slate-600 mb-1">
                  Judul / Label Tautan
                </label>
                <input
                  id="link-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Kampanye Promo Q4"
                  className="w-full px-3 py-2 text-sm text-slate-900 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-800"
                />
              </div>

              <div>
                <label htmlFor="redirect-type" className="block text-xs font-medium text-slate-600 mb-1">
                  Metode Pengalihan
                </label>
                <select
                  id="redirect-type"
                  value={redirectType}
                  onChange={(e) => setRedirectType(Number(e.target.value) === 301 ? 301 : 302)}
                  className="w-full px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-800"
                >
                  <option value={302}>302 Sementara (Analitik)</option>
                  <option value={301}>301 Permanen (SEO)</option>
                </select>
              </div>

              <div>
                <label htmlFor="link-password" className="block text-xs font-medium text-slate-600 mb-1">
                  Proteksi Password (opsional)
                </label>
                <input
                  id="link-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Kosongkan jika publik"
                  className="w-full px-3 py-2 text-sm text-slate-900 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-800"
                />
              </div>

              <div>
                <label htmlFor="link-expires" className="block text-xs font-medium text-slate-600 mb-1">
                  Tanggal Kadaluarsa (opsional)
                </label>
                <input
                  id="link-expires"
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="w-full px-3 py-2 text-sm text-slate-900 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-800"
                />
              </div>
            </div>

            {/* Expandable Advanced Options Drawer */}
            <div className="border border-slate-200 rounded-xl bg-slate-50/70">
              <button
                type="button"
                aria-expanded={showAdvanced}
                onClick={() => setShowAdvanced((v) => !v)}
                className="w-full px-4 py-3 flex items-center justify-between text-xs font-semibold text-slate-800 hover:bg-slate-100/70 rounded-xl transition-colors"
              >
                <span className="inline-flex items-center gap-2">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-blue-800" aria-hidden="true" />
                  <span>Opsi Lanjutan (UTM, Social Preview OG, Pixel, Geo/OS Routing, A/B Test, Batas Klik)</span>
                </span>
                {showAdvanced ? (
                  <ChevronUp className="w-4 h-4 text-slate-500" aria-hidden="true" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-500" aria-hidden="true" />
                )}
              </button>

              {showAdvanced && (
                <div className="px-4 pb-4 pt-2 border-t border-slate-200 space-y-4">
                  <div className="flex flex-wrap items-center gap-1 p-1 bg-white border border-slate-200 rounded-lg">
                    {(
                      [
                        { id: 'utm', label: 'UTM & Batas Klik' },
                        { id: 'og', label: 'Social Preview (OG)' },
                        { id: 'pixels', label: 'Tracking Pixel' },
                        { id: 'routing', label: 'Geo & OS Routing' },
                        { id: 'ab_time', label: 'A/B Test & Jadwal' },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setAdvancedTab(tab.id)}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                          advancedTab === tab.id
                            ? 'bg-blue-800 text-white'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* Sub-tab 1: UTM Builder, Max Clicks & Interstitial */}
                  {advancedTab === 'utm' && (
                    <div className="space-y-4 bg-white p-4 rounded-lg border border-slate-200">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-800">
                          UTM Auto-Tagger
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setUtmSource('instagram');
                              setUtmMedium('social');
                              setUtmCampaign('promo_bio');
                            }}
                            className="px-2 py-1 text-[11px] font-medium text-blue-800 bg-blue-50 hover:bg-blue-100 rounded"
                          >
                            Preset IG Bio
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setUtmSource('whatsapp');
                              setUtmMedium('broadcast');
                              setUtmCampaign('flash_sale');
                            }}
                            className="px-2 py-1 text-[11px] font-medium text-blue-800 bg-blue-50 hover:bg-blue-100 rounded"
                          >
                            Preset WA Blast
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setUtmSource('google');
                              setUtmMedium('cpc');
                              setUtmCampaign('search_brand');
                            }}
                            className="px-2 py-1 text-[11px] font-medium text-blue-800 bg-blue-50 hover:bg-blue-100 rounded"
                          >
                            Preset Google Ads
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                        <div>
                          <label htmlFor="utm-source" className="block text-[11px] font-medium text-slate-600 mb-1">
                            utm_source
                          </label>
                          <input
                            id="utm-source"
                            type="text"
                            value={utmSource}
                            onChange={(e) => setUtmSource(e.target.value)}
                            placeholder="instagram"
                            className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
                          />
                        </div>
                        <div>
                          <label htmlFor="utm-medium" className="block text-[11px] font-medium text-slate-600 mb-1">
                            utm_medium
                          </label>
                          <input
                            id="utm-medium"
                            type="text"
                            value={utmMedium}
                            onChange={(e) => setUtmMedium(e.target.value)}
                            placeholder="social"
                            className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
                          />
                        </div>
                        <div>
                          <label htmlFor="utm-campaign" className="block text-[11px] font-medium text-slate-600 mb-1">
                            utm_campaign
                          </label>
                          <input
                            id="utm-campaign"
                            type="text"
                            value={utmCampaign}
                            onChange={(e) => setUtmCampaign(e.target.value)}
                            placeholder="promo_akhir_tahun"
                            className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
                          />
                        </div>
                        <div>
                          <label htmlFor="utm-term" className="block text-[11px] font-medium text-slate-600 mb-1">
                            utm_term
                          </label>
                          <input
                            id="utm-term"
                            type="text"
                            value={utmTerm}
                            onChange={(e) => setUtmTerm(e.target.value)}
                            placeholder="diskon"
                            className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
                          />
                        </div>
                        <div>
                          <label htmlFor="utm-content" className="block text-[11px] font-medium text-slate-600 mb-1">
                            utm_content
                          </label>
                          <input
                            id="utm-content"
                            type="text"
                            value={utmContent}
                            onChange={(e) => setUtmContent(e.target.value)}
                            placeholder="cta_atas"
                            className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
                          />
                        </div>
                      </div>

                      <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-mono text-slate-600 truncate">
                        Preview Tujuan: {utmPreviewUrl}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                        <div>
                          <label htmlFor="max-clicks-input" className="block text-xs font-semibold text-slate-700 mb-1">
                            Batas Kuota Klik (Max Clicks Limit)
                          </label>
                          <input
                            id="max-clicks-input"
                            type="number"
                            min={1}
                            value={maxClicks}
                            onChange={(e) => setMaxClicks(e.target.value)}
                            placeholder="Misal: 100 (kosongkan jika tanpa batas)"
                            className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                          />
                        </div>
                        <div className="flex items-center gap-2.5 pt-5">
                          <input
                            id="interstitial-check"
                            type="checkbox"
                            checked={interstitialEnabled}
                            onChange={(e) => setInterstitialEnabled(e.target.checked)}
                            className="w-4 h-4 accent-blue-800 rounded"
                          />
                          <label htmlFor="interstitial-check" className="text-xs text-slate-700">
                            Aktifkan halaman peringatan keamanan 3 detik (Interstitial Gate)
                          </label>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Sub-tab 2: Custom Social Preview (Open Graph) */}
                  {advancedTab === 'og' && (
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 bg-white p-4 rounded-lg border border-slate-200">
                      <div className="md:col-span-7 space-y-3">
                        <div>
                          <label htmlFor="og-title" className="block text-xs font-semibold text-slate-700 mb-1">
                            Judul Meta (og:title)
                          </label>
                          <input
                            id="og-title"
                            type="text"
                            value={ogTitle}
                            onChange={(e) => setOgTitle(e.target.value)}
                            placeholder="Flash Sale 50% Khusus Member Hari Ini"
                            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                          />
                        </div>
                        <div>
                          <label htmlFor="og-desc" className="block text-xs font-semibold text-slate-700 mb-1">
                            Deskripsi Meta (og:description)
                          </label>
                          <textarea
                            id="og-desc"
                            rows={2}
                            value={ogDescription}
                            onChange={(e) => setOgDescription(e.target.value)}
                            placeholder="Klaim kupon terbatas sebelum kuota habis di WhatsApp & Telegram."
                            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                          />
                        </div>
                        <div>
                          <label htmlFor="og-image" className="block text-xs font-semibold text-slate-700 mb-1">
                            URL Gambar Thumbnail (og:image)
                          </label>
                          <input
                            id="og-image"
                            type="url"
                            value={ogImageUrl}
                            onChange={(e) => setOgImageUrl(e.target.value)}
                            placeholder="https://cdn.brandanda.com/banner-promo.jpg"
                            className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                          />
                        </div>
                      </div>

                      <div className="md:col-span-5">
                        <span className="block text-[11px] font-semibold text-slate-500 mb-1.5">
                          Pratinjau Kartu Share (WhatsApp / X / Facebook)
                        </span>
                        <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
                          {ogImageUrl.trim() ? (
                            <img
                              src={ogImageUrl.trim()}
                              alt="Pratinjau Thumbnail OG"
                              referrerPolicy="no-referrer"
                              className="w-full h-28 object-cover bg-slate-200"
                            />
                          ) : (
                            <div className="w-full h-24 bg-slate-100 flex items-center justify-center text-[11px] text-slate-400">
                              Thumbnail OG (1200×630)
                            </div>
                          )}
                          <div className="p-3 bg-white border-t border-slate-200">
                            <div className="text-[11px] font-mono text-slate-400 truncate">
                              {selectedDomain || 'tautkilat.id'}
                            </div>
                            <div className="text-xs font-bold text-slate-900 mt-0.5 line-clamp-1">
                              {ogTitle.trim() || title.trim() || 'Judul Kartu Pratinjau Anda'}
                            </div>
                            <div className="text-[11px] text-slate-600 mt-0.5 line-clamp-2">
                              {ogDescription.trim() || 'Deskripsi singkat yang tampil saat tautan dibagikan.'}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Sub-tab 3: Tracking Pixel Integration */}
                  {advancedTab === 'pixels' && (
                    <div className="bg-white p-4 rounded-lg border border-slate-200 space-y-3">
                      <p className="text-xs text-slate-600">
                        Suntikkan ID Pixel iklan retargeting saat pengunjung mengklik shortlink sebelum diteruskan ke website pihak ketiga.
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <div>
                          <label htmlFor="px-fb" className="block text-xs font-semibold text-slate-700 mb-1">
                            Facebook / Meta Pixel ID
                          </label>
                          <input
                            id="px-fb"
                            type="text"
                            value={facebookPixelId}
                            onChange={(e) => setFacebookPixelId(e.target.value)}
                            placeholder="123456789012345"
                            className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                          />
                        </div>
                        <div>
                          <label htmlFor="px-ga" className="block text-xs font-semibold text-slate-700 mb-1">
                            Google Tag / GA4 ID
                          </label>
                          <input
                            id="px-ga"
                            type="text"
                            value={googleTagId}
                            onChange={(e) => setGoogleTagId(e.target.value)}
                            placeholder="G-XXXXXXXXXX"
                            className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                          />
                        </div>
                        <div>
                          <label htmlFor="px-tt" className="block text-xs font-semibold text-slate-700 mb-1">
                            TikTok Pixel ID
                          </label>
                          <input
                            id="px-tt"
                            type="text"
                            value={tiktokPixelId}
                            onChange={(e) => setTiktokPixelId(e.target.value)}
                            placeholder="CXXXXXXXXXXXX"
                            className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                          />
                        </div>
                        <div>
                          <label htmlFor="px-li" className="block text-xs font-semibold text-slate-700 mb-1">
                            LinkedIn Insight Partner ID
                          </label>
                          <input
                            id="px-li"
                            type="text"
                            value={linkedinPartnerId}
                            onChange={(e) => setLinkedinPartnerId(e.target.value)}
                            placeholder="5091234"
                            className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Sub-tab 4: Geo-Targeting & Device / OS Routing */}
                  {advancedTab === 'routing' && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 bg-white p-4 rounded-lg border border-slate-200">
                      <div className="space-y-3">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                          <Globe className="w-3.5 h-3.5 text-blue-800" aria-hidden="true" />
                          <span>Geo-Targeting (Routing Negara)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <select
                            aria-label="Pilih kode negara routing"
                            value={newGeoCode}
                            onChange={(e) => setNewGeoCode(e.target.value)}
                            className="px-2.5 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                          >
                            {COUNTRY_OPTIONS.map((c) => (
                              <option key={c.code} value={c.code}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                          <input
                            type="url"
                            value={newGeoUrl}
                            onChange={(e) => setNewGeoUrl(e.target.value)}
                            placeholder="https://shopee.co.id/toko"
                            aria-label="URL tujuan negara"
                            className="flex-1 px-2.5 py-2 text-xs border border-slate-300 rounded-lg"
                          />
                          <button
                            type="button"
                            onClick={handleAddGeoRule}
                            className="px-3 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shrink-0"
                          >
                            Tambah
                          </button>
                        </div>
                        {geoRules.length > 0 && (
                          <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                            {geoRules.map((rule) => (
                              <div key={rule.countryCode} className="px-3 py-2 flex items-center justify-between gap-2 text-xs">
                                <span className="font-mono font-bold text-blue-800">{rule.countryCode}</span>
                                <span className="truncate flex-1 text-slate-600">{rule.targetUrl}</span>
                                <button
                                  type="button"
                                  onClick={() => setGeoRules((p) => p.filter((x) => x.countryCode !== rule.countryCode))}
                                  aria-label={`Hapus aturan negara ${rule.countryCode}`}
                                  className="text-red-700 hover:underline"
                                >
                                  Hapus
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="space-y-3">
                        <span className="block text-xs font-semibold text-slate-800">
                          Device / OS Routing (App Store vs Play Store)
                        </span>
                        <div>
                          <label htmlFor="os-ios" className="block text-[11px] font-medium text-slate-600 mb-1">
                            Tujuan Pengguna iOS (App Store)
                          </label>
                          <input
                            id="os-ios"
                            type="url"
                            value={iosUrl}
                            onChange={(e) => setIosUrl(e.target.value)}
                            placeholder="https://apps.apple.com/app/id..."
                            className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                          />
                        </div>
                        <div>
                          <label htmlFor="os-android" className="block text-[11px] font-medium text-slate-600 mb-1">
                            Tujuan Pengguna Android (Google Play)
                          </label>
                          <input
                            id="os-android"
                            type="url"
                            value={androidUrl}
                            onChange={(e) => setAndroidUrl(e.target.value)}
                            placeholder="https://play.google.com/store/apps/details?id=..."
                            className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                          />
                        </div>
                        <div>
                          <label htmlFor="os-desktop" className="block text-[11px] font-medium text-slate-600 mb-1">
                            Tujuan Pengguna Desktop (opsional)
                          </label>
                          <input
                            id="os-desktop"
                            type="url"
                            value={desktopUrl}
                            onChange={(e) => setDesktopUrl(e.target.value)}
                            placeholder="https://web.brandanda.com"
                            className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Sub-tab 5: A/B Split Testing & Time-based Routing */}
                  {advancedTab === 'ab_time' && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 bg-white p-4 rounded-lg border border-slate-200">
                      <div className="space-y-3">
                        <span className="block text-xs font-semibold text-slate-800">
                          A/B Split Testing (Pembagian Bobot Traffic)
                        </span>
                        <div className="grid grid-cols-12 gap-2">
                          <input
                            type="text"
                            value={newAbLabel}
                            onChange={(e) => setNewAbLabel(e.target.value)}
                            placeholder="LP-A"
                            aria-label="Label varian A/B"
                            className="col-span-3 px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
                          />
                          <input
                            type="url"
                            value={newAbUrl}
                            onChange={(e) => setNewAbUrl(e.target.value)}
                            placeholder="https://landing-a.com"
                            aria-label="URL varian A/B"
                            className="col-span-5 px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
                          />
                          <input
                            type="number"
                            min={1}
                            max={100}
                            value={newAbWeight}
                            onChange={(e) => setNewAbWeight(e.target.value)}
                            aria-label="Bobot persen varian"
                            className="col-span-2 px-2 py-1.5 text-xs font-mono border border-slate-300 rounded-lg"
                          />
                          <button
                            type="button"
                            onClick={handleAddAbVariant}
                            className="col-span-2 px-2 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
                          >
                            +
                          </button>
                        </div>
                        {abVariants.length > 0 && (
                          <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                            {abVariants.map((v, i) => (
                              <div key={`${v.label}-${i}`} className="px-3 py-2 flex items-center justify-between gap-2 text-xs">
                                <span className="font-semibold text-slate-900">{v.label}</span>
                                <span className="font-mono text-blue-800 tabular-nums">{v.weight}%</span>
                                <span className="truncate flex-1 text-slate-500">{v.targetUrl}</span>
                                <button
                                  type="button"
                                  onClick={() => setAbVariants((p) => p.filter((_, idx) => idx !== i))}
                                  className="text-red-700 hover:underline"
                                >
                                  Hapus
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="space-y-3">
                        <span className="block text-xs font-semibold text-slate-800">
                          Time-based Routing (Ganti Tujuan Terjadwal)
                        </span>
                        <div>
                          <label htmlFor="time-switch-at" className="block text-[11px] font-medium text-slate-600 mb-1">
                            Alihkan Otomatis Mulai Tanggal/Jam
                          </label>
                          <input
                            id="time-switch-at"
                            type="datetime-local"
                            value={timeSwitchAt}
                            onChange={(e) => setTimeSwitchAt(e.target.value)}
                            className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                          />
                        </div>
                        <div>
                          <label htmlFor="time-after-url" className="block text-[11px] font-medium text-slate-600 mb-1">
                            URL Tujuan Setelah Jadwal Tercapai
                          </label>
                          <input
                            id="time-after-url"
                            type="url"
                            value={timeAfterUrl}
                            onChange={(e) => setTimeAfterUrl(e.target.value)}
                            placeholder="https://toko.com/katalog-reguler"
                            className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {formError && (
              <div role="alert" className="px-4 py-3 text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg">
                {formError}
              </div>
            )}

            {createdBanner && (
              <div
                role="status"
                className="px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg flex flex-wrap items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-emerald-900">Shortlink berhasil dibuat dan siap digunakan</p>
                  <p className="text-sm font-mono text-emerald-800 truncate mt-0.5">
                    {formatShortUrl(createdBanner.slug, createdBanner.customDomain, origin)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleCopy(createdBanner)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-900 bg-white border border-emerald-300 rounded-lg hover:bg-emerald-100"
                  >
                    <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Salin</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenQr(createdBanner)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
                  >
                    <QrCode className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Studio QR</span>
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-blue-800 hover:bg-blue-900 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800"
              >
                <Link2 className="w-4 h-4" aria-hidden="true" />
                <span>{submitting ? 'Memproses...' : 'Buat Shortlink'}</span>
              </button>
            </div>
          </form>
        )}

        {mode === 'vcard' && (
          <form onSubmit={handleVCardSubmit} className="mt-6 space-y-4" noValidate>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label htmlFor="vc-name" className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Lengkap *
                </label>
                <input
                  id="vc-name"
                  type="text"
                  required
                  value={vcFullName}
                  onChange={(e) => setVcFullName(e.target.value)}
                  placeholder="Raka Wijaya"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-800"
                />
              </div>
              <div>
                <label htmlFor="vc-phone" className="block text-xs font-semibold text-slate-700 mb-1">
                  Nomor HP / WhatsApp *
                </label>
                <input
                  id="vc-phone"
                  type="tel"
                  required
                  value={vcPhone}
                  onChange={(e) => setVcPhone(e.target.value)}
                  placeholder="+6281234567890"
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-blue-800"
                />
              </div>
              <div>
                <label htmlFor="vc-email" className="block text-xs font-semibold text-slate-700 mb-1">
                  Email Bisnis
                </label>
                <input
                  id="vc-email"
                  type="email"
                  value={vcEmail}
                  onChange={(e) => setVcEmail(e.target.value)}
                  placeholder="raka@nusantara.id"
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-blue-800"
                />
              </div>
              <div>
                <label htmlFor="vc-org" className="block text-xs font-semibold text-slate-700 mb-1">
                  Perusahaan / Instansi
                </label>
                <input
                  id="vc-org"
                  type="text"
                  value={vcOrg}
                  onChange={(e) => setVcOrg(e.target.value)}
                  placeholder="PT Nusantara Digital"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-800"
                />
              </div>
              <div>
                <label htmlFor="vc-role" className="block text-xs font-semibold text-slate-700 mb-1">
                  Jabatan
                </label>
                <input
                  id="vc-role"
                  type="text"
                  value={vcRole}
                  onChange={(e) => setVcRole(e.target.value)}
                  placeholder="Head of Partnerships"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-800"
                />
              </div>
              <div>
                <label htmlFor="vc-website" className="block text-xs font-semibold text-slate-700 mb-1">
                  Website
                </label>
                <input
                  id="vc-website"
                  type="url"
                  value={vcWebsite}
                  onChange={(e) => setVcWebsite(e.target.value)}
                  placeholder="https://nusantara.id"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-800"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label htmlFor="vc-address" className="block text-xs font-semibold text-slate-700 mb-1">
                  Alamat Kantor
                </label>
                <input
                  id="vc-address"
                  type="text"
                  value={vcAddress}
                  onChange={(e) => setVcAddress(e.target.value)}
                  placeholder="Jl. Jenderal Sudirman Kav. 52, Jakarta"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-800"
                />
              </div>
              <div>
                <label htmlFor="vc-slug" className="block text-xs font-semibold text-slate-700 mb-1">
                  Slug Kartu Kontak (opsional)
                </label>
                <input
                  id="vc-slug"
                  type="text"
                  value={customSlug}
                  onChange={(e) => setCustomSlug(e.target.value)}
                  placeholder="kartu-raka"
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-blue-800"
                />
              </div>
            </div>

            {formError && (
              <div role="alert" className="px-4 py-3 text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg">
                {formError}
              </div>
            )}

            {createdBanner && (
              <div
                role="status"
                className="px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg flex flex-wrap items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-emerald-900">QR Kontak vCard berhasil dibuat</p>
                  <p className="text-sm font-mono text-emerald-800 truncate mt-0.5">
                    {formatShortUrl(createdBanner.slug, createdBanner.customDomain, origin)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenQr(createdBanner)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
                >
                  <QrCode className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Buka Studio QR vCard</span>
                </button>
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-blue-800 hover:bg-blue-900 disabled:opacity-60 rounded-lg"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                <span>{submitting ? 'Menyimpan...' : 'Buat QR Kontak vCard'}</span>
              </button>
            </div>
          </form>
        )}

        {mode === 'bulk' && (
          /* Bulk CSV / XLSX Importer */
          <div className="mt-6 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
              <div className="md:col-span-6">
                <label htmlFor="bulk-file-input" className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Unggah File CSV atau XLSX (kolom: url, slug, title, redirect_type)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    id="bulk-file-input"
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={handleBulkFileChange}
                    className="block w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-3.5 file:rounded-lg file:border file:border-slate-300 file:text-xs file:font-semibold file:bg-slate-50 file:text-slate-700 hover:file:bg-slate-100 border border-slate-300 rounded-lg p-1"
                  />
                </div>
              </div>

              <div className="md:col-span-3">
                <label htmlFor="bulk-domain-select" className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Domain Target Batch
                </label>
                <select
                  id="bulk-domain-select"
                  value={bulkDomain}
                  onChange={(e) => setBulkDomain(e.target.value)}
                  className="w-full px-3 py-2.5 text-xs font-mono text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-800"
                >
                  <option value="">Default (/s/slug)</option>
                  {domainSettings.customDomains.map((d) => (
                    <option key={d.domain} value={d.domain}>
                      {d.domain}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-3 flex justify-end">
                <button
                  type="button"
                  onClick={handleDownloadSampleCsv}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Unduh Contoh CSV</span>
                </button>
              </div>
            </div>

            {bulkError && (
              <div role="alert" className="px-4 py-3 text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg">
                {bulkError}
              </div>
            )}

            {bulkSummary && (
              <div role="status" className="px-4 py-3 text-xs bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg space-y-1">
                <p className="font-semibold">
                  Impor massal selesai: {bulkSummary.createdCount} shortlink berhasil dibuat, {bulkSummary.skippedCount} dilewati.
                </p>
                {bulkSummary.results
                  .filter((r) => r.status !== 'created')
                  .slice(0, 5)
                  .map((r) => (
                    <p key={r.rowNumber} className="text-amber-800">
                      Baris {r.rowNumber} ({r.slug || r.targetUrl}): {r.reason}
                    </p>
                  ))}
              </div>
            )}

            {parsedRows.length > 0 && (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-slate-700">
                    <span className="font-semibold">{bulkFilename}</span> · {parsedRows.length} baris dipindai ({readyBulkCount} siap dibuat)
                  </div>
                  <button
                    type="button"
                    disabled={bulkProcessing || readyBulkCount === 0}
                    onClick={handleBulkGenerate}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-800 hover:bg-blue-900 disabled:opacity-60 rounded-lg"
                  >
                    <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{bulkProcessing ? 'Memproses Batch...' : `Generate ${readyBulkCount} Shortlink`}</span>
                  </button>
                </div>

                <div className="overflow-x-auto max-h-72">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-white text-slate-600">
                        <th className="py-2 px-3">Baris</th>
                        <th className="py-2 px-3">URL Tujuan</th>
                        <th className="py-2 px-3">Shortlink Hasil</th>
                        <th className="py-2 px-3">Tipe</th>
                        <th className="py-2 px-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {parsedRows.map((row) => (
                        <tr key={row.rowNumber}>
                          <td className="py-2 px-3 font-mono tabular-nums text-slate-500">{row.rowNumber}</td>
                          <td className="py-2 px-3 max-w-xs truncate text-slate-800">{row.targetUrl}</td>
                          <td className="py-2 px-3 font-mono text-blue-800">
                            {row.slug ? formatShortUrl(row.slug, bulkDomain, '') : '-'}
                            {row.slugMode === 'generated' && row.status !== 'error' && (
                              <span className="ml-1.5 text-[11px] text-slate-400">(otomatis)</span>
                            )}
                          </td>
                          <td className="py-2 px-3 font-mono">{row.redirectType}</td>
                          <td className="py-2 px-3">
                            <span
                              className={
                                row.status === 'ready'
                                  ? 'text-emerald-700 font-medium'
                                  : row.status === 'warning'
                                  ? 'text-amber-700 font-medium'
                                  : 'text-red-700 font-medium'
                              }
                            >
                              {row.reason}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Links Directory */}
      <section aria-labelledby="links-table-heading" className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 id="links-table-heading" className="font-display text-lg font-bold text-slate-900">
              Daftar Tautan Pendek
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
              Menampilkan {filteredLinks.length} dari {links.length} tautan tersimpan
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input
                type="search"
                aria-label="Cari slug atau URL"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari slug atau URL..."
                className="pl-9 pr-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-800 w-52"
              />
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(
                [
                  { id: 'all', label: 'Semua' },
                  { id: 'active', label: 'Aktif' },
                  { id: 'protected', label: 'Terproteksi' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    statusFilter === tab.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="p-6 space-y-3" aria-busy="true" aria-label="Memuat daftar tautan">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-14 bg-slate-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : filteredLinks.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-medium text-slate-900">Belum ada tautan yang sesuai filter</p>
            <p className="text-xs text-slate-500 mt-1">
              Buat shortlink baru di formulir atas atau ubah kata kunci pencarian Anda.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {filteredLinks.map((link) => {
              const expired = isLinkExpired(link.expiresAt);
              const quotaExceeded = isLinkQuotaExceeded(link.clickCount, link.maxClicks);
              const statusText = !link.isActive
                ? 'Nonaktif'
                : expired
                ? 'Kadaluarsa'
                : quotaExceeded
                ? 'Kuota Penuh'
                : 'Aktif';
              const shortUrl = formatShortUrl(link.slug, link.customDomain, origin);
              const displayShortPath = link.customDomain
                ? `${link.customDomain}/${link.slug}`
                : `/s/${link.slug}`;

              const capabilities: string[] = [];
              if (link.linkType === 'vcard') capabilities.push('vCard');
              if (link.utm?.source || link.utm?.campaign) capabilities.push('UTM');
              if (link.ogMeta?.title || link.ogMeta?.imageUrl) capabilities.push('OG');
              if (
                link.trackingPixels?.facebookPixelId ||
                link.trackingPixels?.googleTagId ||
                link.trackingPixels?.tiktokPixelId ||
                link.trackingPixels?.linkedinPartnerId
              ) {
                capabilities.push('Pixel');
              }
              if (link.geoRules?.length) capabilities.push(`Geo(${link.geoRules.length})`);
              if (link.deviceRules?.iosUrl || link.deviceRules?.androidUrl) capabilities.push('OS');
              if (link.abVariants?.length) capabilities.push(`A/B(${link.abVariants.length})`);
              if (link.timeRule?.switchAt) capabilities.push('Jadwal');
              if (link.interstitialEnabled) capabilities.push('3s Gate');

              return (
                <div
                  key={link.slug}
                  className="px-6 py-4 hover:bg-slate-50/80 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-sm text-slate-900 truncate">{link.title}</span>
                      {link.hasPassword && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-800">
                          <Lock className="w-3 h-3" aria-hidden="true" />
                          <span>Berpassword</span>
                        </span>
                      )}
                      {link.linkType === 'vcard' && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-800">
                          <Contact className="w-3 h-3" aria-hidden="true" />
                          <span>Kartu Kontak</span>
                        </span>
                      )}
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      <a
                        href={`/s/${link.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => {
                          if (link.hasPassword || expired || quotaExceeded || !link.isActive || link.linkType === 'vcard') {
                            e.preventDefault();
                            onPreviewGate(link.slug);
                          }
                        }}
                        className="font-mono font-medium text-blue-800 hover:underline inline-flex items-center gap-1"
                      >
                        <span>{displayShortPath}</span>
                        <ExternalLink className="w-3 h-3" aria-hidden="true" />
                      </a>
                      <span className="text-slate-300" aria-hidden="true">·</span>
                      <span className="text-slate-500 truncate max-w-md">
                        {link.linkType === 'vcard' && link.vcard
                          ? `${link.vcard.fullName} (${link.vcard.phone})`
                          : link.targetUrl}
                      </span>
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span
                        className={
                          link.isActive && !expired && !quotaExceeded
                            ? 'text-emerald-700 font-medium'
                            : 'text-red-700 font-medium'
                        }
                      >
                        {statusText}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{link.redirectType} {link.redirectType === 301 ? 'Permanen' : 'Sementara'}</span>
                      <span aria-hidden="true">·</span>
                      <span>Keamanan: {link.safetyStatus === 'safe' ? 'Aman' : link.safetyStatus === 'warning' ? 'Peringatan' : 'Diblokir'}</span>
                      {capabilities.length > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono text-slate-600">{capabilities.join(' · ')}</span>
                        </>
                      )}
                      {link.expiresAt && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">
                            Exp: {new Date(link.expiresAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                    <div className="text-right pr-2 border-r border-slate-200">
                      <div className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
                        {link.clickCount.toLocaleString('id-ID')}
                        {link.maxClicks ? ` / ${link.maxClicks.toLocaleString('id-ID')}` : ''}
                      </div>
                      <div className="text-[11px] text-slate-500">{link.maxClicks ? 'kuota klik' : 'klik'}</div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleCopy(link)}
                      aria-label={`Salin URL ${shortUrl}`}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
                    >
                      {copiedSlug === link.slug ? (
                        <Check className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                      )}
                      <span>{copiedSlug === link.slug ? 'Disalin' : 'Salin'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onOpenQr(link)}
                      aria-label={`Buka QR Code untuk ${link.slug}`}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
                    >
                      <QrCode className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>QR</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onToggleActive(link)}
                      aria-label={`${link.isActive ? 'Nonaktifkan' : 'Aktifkan'} ${link.slug}`}
                      title={link.isActive ? 'Nonaktifkan tautan' : 'Aktifkan tautan'}
                      className={`p-2 border rounded-lg transition-colors ${
                        link.isActive
                          ? 'text-slate-600 border-slate-200 hover:bg-slate-100'
                          : 'text-amber-700 border-amber-200 bg-amber-50 hover:bg-amber-100'
                      }`}
                    >
                      <Power className="w-4 h-4" aria-hidden="true" />
                    </button>

                    <button
                      type="button"
                      onClick={() => onDeleteLink(link.slug)}
                      aria-label={`Hapus ${link.slug}`}
                      title="Hapus tautan"
                      className="p-2 text-slate-500 hover:text-red-700 hover:bg-red-50 border border-slate-200 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
