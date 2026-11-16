import React, { useEffect, useState } from 'react';
import { Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import type {
  AbVariantRule,
  AccountSettings,
  GeoRouteRule,
  RedirectType,
  ShortLinkItem,
  UpdateLinkPayload,
} from '../types/shortlink';
import { normalizeAndValidateUrl, validateSlug } from '../utils/urlSecurity';

interface EditLinkModalProps {
  link: ShortLinkItem | null;
  domainSettings: AccountSettings;
  onClose: () => void;
  onSave: (originalSlug: string, patch: UpdateLinkPayload) => Promise<void>;
}

type ModalTab = 'basic' | 'utm_og' | 'pixels' | 'routing' | 'ab_time';

function isoToDatetimeLocal(iso: string): string {
  if (!iso) return '';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

const COUNTRY_OPTIONS = [
  { code: 'ID', label: 'Indonesia (ID)' },
  { code: 'US', label: 'Amerika Serikat (US)' },
  { code: 'SG', label: 'Singapura (SG)' },
  { code: 'MY', label: 'Malaysia (MY)' },
  { code: 'GB', label: 'Inggris (GB)' },
  { code: 'AU', label: 'Australia (AU)' },
  { code: 'JP', label: 'Jepang (JP)' },
];

export const EditLinkModal: React.FC<EditLinkModalProps> = ({
  link,
  domainSettings,
  onClose,
  onSave,
}) => {
  const [tab, setTab] = useState<ModalTab>('basic');
  const [slugInput, setSlugInput] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [title, setTitle] = useState('');
  const [customDomain, setCustomDomain] = useState('');
  const [redirectType, setRedirectType] = useState<RedirectType>(302);
  const [isActive, setIsActive] = useState(true);
  const [newPassword, setNewPassword] = useState('');
  const [clearPassword, setClearPassword] = useState(false);
  const [expiresAt, setExpiresAt] = useState('');
  const [maxClicks, setMaxClicks] = useState('');
  const [interstitialEnabled, setInterstitialEnabled] = useState(false);

  // UTM
  const [utmSource, setUtmSource] = useState('');
  const [utmMedium, setUtmMedium] = useState('');
  const [utmCampaign, setUtmCampaign] = useState('');
  const [utmTerm, setUtmTerm] = useState('');
  const [utmContent, setUtmContent] = useState('');

  // Open Graph
  const [ogTitle, setOgTitle] = useState('');
  const [ogDescription, setOgDescription] = useState('');
  const [ogImageUrl, setOgImageUrl] = useState('');

  // Pixels
  const [fbPixel, setFbPixel] = useState('');
  const [gaTag, setGaTag] = useState('');
  const [ttPixel, setTtPixel] = useState('');
  const [liPartner, setLiPartner] = useState('');

  // Geo & OS Routing
  const [geoRules, setGeoRules] = useState<GeoRouteRule[]>([]);
  const [newGeoCode, setNewGeoCode] = useState('ID');
  const [newGeoUrl, setNewGeoUrl] = useState('');
  const [iosUrl, setIosUrl] = useState('');
  const [androidUrl, setAndroidUrl] = useState('');
  const [desktopUrl, setDesktopUrl] = useState('');

  // A/B & Time Routing
  const [abVariants, setAbVariants] = useState<AbVariantRule[]>([]);
  const [newAbLabel, setNewAbLabel] = useState('');
  const [newAbUrl, setNewAbUrl] = useState('');
  const [newAbWeight, setNewAbWeight] = useState('50');
  const [timeSwitchAt, setTimeSwitchAt] = useState('');
  const [timeAfterUrl, setTimeAfterUrl] = useState('');

  // vCard fields if vcard link
  const [vcFullName, setVcFullName] = useState('');
  const [vcPhone, setVcPhone] = useState('');
  const [vcOrg, setVcOrg] = useState('');
  const [vcRole, setVcRole] = useState('');
  const [vcEmail, setVcEmail] = useState('');
  const [vcWebsite, setVcWebsite] = useState('');
  const [vcAddress, setVcAddress] = useState('');

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!link) return;
    setTab('basic');
    setErrorMsg(null);
    setSlugInput(link.slug);
    setTargetUrl(link.targetUrl);
    setTitle(link.title);
    setCustomDomain(link.customDomain || '');
    setRedirectType(link.redirectType);
    setIsActive(link.isActive);
    setNewPassword('');
    setClearPassword(false);
    setExpiresAt(isoToDatetimeLocal(link.expiresAt));
    setMaxClicks(link.maxClicks ? String(link.maxClicks) : '');
    setInterstitialEnabled(Boolean(link.interstitialEnabled));

    setUtmSource(link.utm?.source || '');
    setUtmMedium(link.utm?.medium || '');
    setUtmCampaign(link.utm?.campaign || '');
    setUtmTerm(link.utm?.term || '');
    setUtmContent(link.utm?.content || '');

    setOgTitle(link.ogMeta?.title || '');
    setOgDescription(link.ogMeta?.description || '');
    setOgImageUrl(link.ogMeta?.imageUrl || '');

    setFbPixel(link.trackingPixels?.facebookPixelId || '');
    setGaTag(link.trackingPixels?.googleTagId || '');
    setTtPixel(link.trackingPixels?.tiktokPixelId || '');
    setLiPartner(link.trackingPixels?.linkedinPartnerId || '');

    setGeoRules(link.geoRules || []);
    setNewGeoUrl('');
    setIosUrl(link.deviceRules?.iosUrl || '');
    setAndroidUrl(link.deviceRules?.androidUrl || '');
    setDesktopUrl(link.deviceRules?.desktopUrl || '');

    setAbVariants(link.abVariants || []);
    setNewAbLabel('');
    setNewAbUrl('');
    setNewAbWeight('50');
    setTimeSwitchAt(isoToDatetimeLocal(link.timeRule?.switchAt || ''));
    setTimeAfterUrl(link.timeRule?.afterTargetUrl || '');

    setVcFullName(link.vcard?.fullName || '');
    setVcPhone(link.vcard?.phone || '');
    setVcOrg(link.vcard?.organization || '');
    setVcRole(link.vcard?.role || '');
    setVcEmail(link.vcard?.email || '');
    setVcWebsite(link.vcard?.website || '');
    setVcAddress(link.vcard?.address || '');
  }, [link]);

  if (!link) return null;

  const isVCard = link.linkType === 'vcard';

  const handleAddGeo = () => {
    const check = normalizeAndValidateUrl(newGeoUrl);
    if (!check.valid) {
      setErrorMsg(check.error || 'URL aturan negara tidak valid.');
      return;
    }
    setErrorMsg(null);
    setGeoRules((prev) => [
      ...prev.filter((r) => r.countryCode !== newGeoCode),
      { countryCode: newGeoCode, targetUrl: check.normalizedUrl },
    ]);
    setNewGeoUrl('');
  };

  const handleAddAb = () => {
    const check = normalizeAndValidateUrl(newAbUrl);
    if (!check.valid) {
      setErrorMsg(check.error || 'URL varian A/B tidak valid.');
      return;
    }
    setErrorMsg(null);
    const weightNum = Math.max(1, Math.min(100, Number(newAbWeight) || 50));
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const slugCheck = validateSlug(slugInput);
    if (!slugCheck.valid) {
      setErrorMsg(slugCheck.error || 'Slug tidak valid.');
      return;
    }

    let nextTargetUrl = link.targetUrl;
    if (!isVCard) {
      const urlCheck = normalizeAndValidateUrl(targetUrl);
      if (!urlCheck.valid) {
        setErrorMsg(urlCheck.error || 'URL tujuan tidak valid.');
        return;
      }
      nextTargetUrl = urlCheck.normalizedUrl;
    } else {
      if (!vcFullName.trim() || !vcPhone.trim()) {
        setErrorMsg('Nama lengkap dan nomor HP wajib diisi untuk vCard.');
        return;
      }
      if (vcWebsite.trim()) {
        const wCheck = normalizeAndValidateUrl(vcWebsite);
        if (!wCheck.valid) {
          setErrorMsg(wCheck.error || 'URL website kontak tidak valid.');
          return;
        }
        nextTargetUrl = wCheck.normalizedUrl;
      }
    }

    const parsedMaxClicks = maxClicks.trim() ? Number(maxClicks.trim()) : null;
    if (parsedMaxClicks !== null && (!Number.isFinite(parsedMaxClicks) || parsedMaxClicks < 1)) {
      setErrorMsg('Batas maksimal klik harus berupa angka minimal 1.');
      return;
    }

    const hasTimeRule = Boolean(timeSwitchAt.trim() && timeAfterUrl.trim());
    let nextTimeRule: ShortLinkItem['timeRule'] = null;
    if (hasTimeRule) {
      const tCheck = normalizeAndValidateUrl(timeAfterUrl);
      if (!tCheck.valid) {
        setErrorMsg('URL tujuan terjadwal tidak valid.');
        return;
      }
      nextTimeRule = {
        switchAt: new Date(timeSwitchAt).toISOString(),
        afterTargetUrl: tCheck.normalizedUrl,
      };
    }

    const hasUtm = Boolean(
      utmSource.trim() || utmMedium.trim() || utmCampaign.trim() || utmTerm.trim() || utmContent.trim()
    );
    const hasOg = Boolean(ogTitle.trim() || ogDescription.trim() || ogImageUrl.trim());
    const hasPixels = Boolean(fbPixel.trim() || gaTag.trim() || ttPixel.trim() || liPartner.trim());
    const hasDevice = Boolean(iosUrl.trim() || androidUrl.trim() || desktopUrl.trim());

    const patch: UpdateLinkPayload = {
      newSlug: slugCheck.normalizedSlug !== link.slug ? slugCheck.normalizedSlug : undefined,
      targetUrl: nextTargetUrl,
      title: title.trim() || slugCheck.normalizedSlug,
      customDomain,
      redirectType,
      isActive,
      expiresAt: expiresAt.trim() ? new Date(expiresAt).toISOString() : '',
      maxClicks: parsedMaxClicks,
      interstitialEnabled,
      clearPassword,
      password: !clearPassword && newPassword.trim() ? newPassword.trim() : undefined,
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
            facebookPixelId: fbPixel.trim() || undefined,
            googleTagId: gaTag.trim() || undefined,
            tiktokPixelId: ttPixel.trim() || undefined,
            linkedinPartnerId: liPartner.trim() || undefined,
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
      timeRule: nextTimeRule,
      vcard: isVCard
        ? {
            fullName: vcFullName.trim(),
            phone: vcPhone.trim(),
            organization: vcOrg.trim() || undefined,
            role: vcRole.trim() || undefined,
            email: vcEmail.trim() || undefined,
            website: vcWebsite.trim() ? normalizeAndValidateUrl(vcWebsite).normalizedUrl : undefined,
            address: vcAddress.trim() || undefined,
          }
        : link.vcard,
    };

    setSaving(true);
    try {
      await onSave(link.slug, patch);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan perubahan tautan.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-link-modal-title"
    >
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl shadow-xl my-8 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2 min-w-0">
            <Pencil className="w-4 h-4 text-blue-800 shrink-0" aria-hidden="true" />
            <h2 id="edit-link-modal-title" className="font-display text-base font-bold text-slate-900 truncate">
              Edit Tautan: <span className="font-mono text-blue-800">/{link.slug}</span>
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal edit tautan"
            className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          <div className="flex flex-wrap gap-1 p-1 bg-slate-100 rounded-lg">
            {(
              [
                { id: 'basic', label: 'Utama & Keamanan' },
                { id: 'utm_og', label: 'UTM & Social OG' },
                { id: 'pixels', label: 'Tracking Pixel' },
                { id: 'routing', label: 'Geo & OS Routing' },
                { id: 'ab_time', label: 'A/B & Jadwal' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  tab === t.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'basic' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="edit-slug" className="block text-xs font-semibold text-slate-700 mb-1">
                    Slug Shortlink
                  </label>
                  <div className="flex items-center border border-slate-300 rounded-lg overflow-hidden bg-white focus-within:border-blue-800">
                    <span className="px-2.5 py-2 text-xs font-mono text-slate-500 bg-slate-50 border-r border-slate-200 shrink-0">
                      {customDomain ? '/' : '/s/'}
                    </span>
                    <input
                      id="edit-slug"
                      type="text"
                      value={slugInput}
                      onChange={(e) => setSlugInput(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono text-slate-900 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="edit-domain" className="block text-xs font-semibold text-slate-700 mb-1">
                    Custom Domain
                  </label>
                  <select
                    id="edit-domain"
                    value={customDomain}
                    onChange={(e) => setCustomDomain(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-800"
                  >
                    <option value="">Default (/s/)</option>
                    {domainSettings.customDomains.map((d) => (
                      <option key={d.domain} value={d.domain}>
                        {d.domain}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {!isVCard ? (
                <div>
                  <label htmlFor="edit-target-url" className="block text-xs font-semibold text-slate-700 mb-1">
                    URL Tujuan
                  </label>
                  <input
                    id="edit-target-url"
                    type="url"
                    value={targetUrl}
                    onChange={(e) => setTargetUrl(e.target.value)}
                    className="w-full px-3 py-2 text-sm text-slate-900 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-800"
                  />
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Nama Lengkap *</label>
                    <input
                      type="text"
                      value={vcFullName}
                      onChange={(e) => setVcFullName(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Nomor HP / WA *</label>
                    <input
                      type="tel"
                      value={vcPhone}
                      onChange={(e) => setVcPhone(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Perusahaan</label>
                    <input
                      type="text"
                      value={vcOrg}
                      onChange={(e) => setVcOrg(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Jabatan</label>
                    <input
                      type="text"
                      value={vcRole}
                      onChange={(e) => setVcRole(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Email</label>
                    <input
                      type="email"
                      value={vcEmail}
                      onChange={(e) => setVcEmail(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Website</label>
                    <input
                      type="url"
                      value={vcWebsite}
                      onChange={(e) => setVcWebsite(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">Alamat</label>
                    <input
                      type="text"
                      value={vcAddress}
                      onChange={(e) => setVcAddress(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="edit-title" className="block text-xs font-semibold text-slate-700 mb-1">
                    Judul / Label Tautan
                  </label>
                  <input
                    id="edit-title"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-3 py-2 text-sm text-slate-900 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-800"
                  />
                </div>

                <div>
                  <label htmlFor="edit-redirect-type" className="block text-xs font-semibold text-slate-700 mb-1">
                    Metode Pengalihan
                  </label>
                  <select
                    id="edit-redirect-type"
                    value={redirectType}
                    onChange={(e) => setRedirectType(Number(e.target.value) === 301 ? 301 : 302)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-800"
                  >
                    <option value={302}>302 Sementara (Analitik)</option>
                    <option value={301}>301 Permanen (SEO)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="edit-password" className="block text-xs font-semibold text-slate-700 mb-1">
                    {link.hasPassword ? 'Ubah Kata Sandi Tautan (opsional)' : 'Pasang Kata Sandi (opsional)'}
                  </label>
                  <input
                    id="edit-password"
                    type="password"
                    disabled={clearPassword}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder={link.hasPassword ? 'Kosongkan jika tetap' : 'Kosongkan jika publik'}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-100"
                  />
                  {link.hasPassword && (
                    <label className="mt-1.5 inline-flex items-center gap-2 text-xs text-amber-800">
                      <input
                        type="checkbox"
                        checked={clearPassword}
                        onChange={(e) => setClearPassword(e.target.checked)}
                        className="accent-blue-800"
                      />
                      <span>Hapus proteksi kata sandi saat ini</span>
                    </label>
                  )}
                </div>

                <div>
                  <label htmlFor="edit-expires" className="block text-xs font-semibold text-slate-700 mb-1">
                    Tanggal Kadaluarsa
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="edit-expires"
                      type="datetime-local"
                      value={expiresAt}
                      onChange={(e) => setExpiresAt(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                    {expiresAt && (
                      <button
                        type="button"
                        onClick={() => setExpiresAt('')}
                        className="px-2.5 py-2 text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg shrink-0"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                <div>
                  <label htmlFor="edit-max-clicks" className="block text-xs font-semibold text-slate-700 mb-1">
                    Batas Maksimal Klik (Max Clicks)
                  </label>
                  <input
                    id="edit-max-clicks"
                    type="number"
                    min={1}
                    value={maxClicks}
                    onChange={(e) => setMaxClicks(e.target.value)}
                    placeholder="Kosongkan jika tanpa batas"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>

                <div className="flex flex-col justify-center gap-2 pt-2">
                  <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                      className="w-4 h-4 accent-blue-800"
                    />
                    <span>Tautan Aktif (dapat dikunjungi publik)</span>
                  </label>
                  <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={interstitialEnabled}
                      onChange={(e) => setInterstitialEnabled(e.target.checked)}
                      className="w-4 h-4 accent-blue-800"
                    />
                    <span>Halaman Peringatan Keamanan 3 Detik (Interstitial)</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {tab === 'utm_og' && (
            <div className="space-y-4">
              <div className="space-y-3 border border-slate-200 rounded-lg p-4">
                <h3 className="text-xs font-bold text-slate-800">Parameter UTM Auto-Tagger</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input
                    type="text"
                    value={utmSource}
                    onChange={(e) => setUtmSource(e.target.value)}
                    placeholder="utm_source (misal: instagram)"
                    className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                  <input
                    type="text"
                    value={utmMedium}
                    onChange={(e) => setUtmMedium(e.target.value)}
                    placeholder="utm_medium (misal: social)"
                    className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                  <input
                    type="text"
                    value={utmCampaign}
                    onChange={(e) => setUtmCampaign(e.target.value)}
                    placeholder="utm_campaign"
                    className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                  <input
                    type="text"
                    value={utmTerm}
                    onChange={(e) => setUtmTerm(e.target.value)}
                    placeholder="utm_term"
                    className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                  <input
                    type="text"
                    value={utmContent}
                    onChange={(e) => setUtmContent(e.target.value)}
                    placeholder="utm_content"
                    className="px-3 py-2 text-xs border border-slate-300 rounded-lg sm:col-span-2"
                  />
                </div>
              </div>

              <div className="space-y-3 border border-slate-200 rounded-lg p-4">
                <h3 className="text-xs font-bold text-slate-800">Custom Social Preview (Open Graph)</h3>
                <input
                  type="text"
                  value={ogTitle}
                  onChange={(e) => setOgTitle(e.target.value)}
                  placeholder="og:title (Judul share WhatsApp / Telegram / X)"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
                <textarea
                  rows={2}
                  value={ogDescription}
                  onChange={(e) => setOgDescription(e.target.value)}
                  placeholder="og:description"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
                <input
                  type="url"
                  value={ogImageUrl}
                  onChange={(e) => setOgImageUrl(e.target.value)}
                  placeholder="og:image URL (https://...)"
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                />
              </div>
            </div>
          )}

          {tab === 'pixels' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Facebook / Meta Pixel ID</label>
                <input
                  type="text"
                  value={fbPixel}
                  onChange={(e) => setFbPixel(e.target.value)}
                  placeholder="123456789012345"
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Google Tag / GA4 ID</label>
                <input
                  type="text"
                  value={gaTag}
                  onChange={(e) => setGaTag(e.target.value)}
                  placeholder="G-XXXXXXXXXX"
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">TikTok Pixel ID</label>
                <input
                  type="text"
                  value={ttPixel}
                  onChange={(e) => setTtPixel(e.target.value)}
                  placeholder="CXXXXXXXXXXXX"
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">LinkedIn Insight Tag ID</label>
                <input
                  type="text"
                  value={liPartner}
                  onChange={(e) => setLiPartner(e.target.value)}
                  placeholder="1234567"
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                />
              </div>
            </div>
          )}

          {tab === 'routing' && (
            <div className="space-y-4">
              <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                <h3 className="text-xs font-bold text-slate-800">Geo-Targeting (Per Negara)</h3>
                <div className="flex flex-wrap gap-2">
                  <select
                    value={newGeoCode}
                    onChange={(e) => setNewGeoCode(e.target.value)}
                    className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
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
                    placeholder="https://shopee.co.id/..."
                    className="flex-1 min-w-48 px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={handleAddGeo}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-blue-800 rounded-lg"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Tambah</span>
                  </button>
                </div>
                {geoRules.length > 0 && (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                    {geoRules.map((r) => (
                      <div key={r.countryCode} className="px-3 py-2 flex items-center justify-between gap-2 text-xs">
                        <span className="font-mono font-semibold text-blue-800">{r.countryCode}</span>
                        <span className="truncate flex-1 text-slate-600">{r.targetUrl}</span>
                        <button
                          type="button"
                          onClick={() => setGeoRules((p) => p.filter((x) => x.countryCode !== r.countryCode))}
                          className="text-red-700 hover:underline"
                        >
                          Hapus
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                <h3 className="text-xs font-bold text-slate-800">Device / OS Routing</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input
                    type="url"
                    value={iosUrl}
                    onChange={(e) => setIosUrl(e.target.value)}
                    placeholder="URL iOS (App Store)"
                    className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                  <input
                    type="url"
                    value={androidUrl}
                    onChange={(e) => setAndroidUrl(e.target.value)}
                    placeholder="URL Android (Play Store)"
                    className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                  <input
                    type="url"
                    value={desktopUrl}
                    onChange={(e) => setDesktopUrl(e.target.value)}
                    placeholder="URL Desktop"
                    className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
            </div>
          )}

          {tab === 'ab_time' && (
            <div className="space-y-4">
              <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                <h3 className="text-xs font-bold text-slate-800">A/B Split Testing</h3>
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                  <input
                    type="text"
                    value={newAbLabel}
                    onChange={(e) => setNewAbLabel(e.target.value)}
                    placeholder="Label (Varian A)"
                    className="sm:col-span-3 px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
                  />
                  <input
                    type="url"
                    value={newAbUrl}
                    onChange={(e) => setNewAbUrl(e.target.value)}
                    placeholder="https://landing-b.com"
                    className="sm:col-span-6 px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
                  />
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={newAbWeight}
                    onChange={(e) => setNewAbWeight(e.target.value)}
                    className="sm:col-span-1 px-2 py-1.5 text-xs font-mono border border-slate-300 rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={handleAddAb}
                    className="sm:col-span-2 px-3 py-1.5 text-xs font-semibold text-white bg-blue-800 rounded-lg"
                  >
                    Tambah
                  </button>
                </div>
                {abVariants.length > 0 && (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                    {abVariants.map((v, i) => (
                      <div key={`${v.label}-${i}`} className="px-3 py-2 flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold">{v.label} ({v.weight}%)</span>
                        <span className="truncate flex-1 text-slate-600">{v.targetUrl}</span>
                        <button
                          type="button"
                          onClick={() => setAbVariants((p) => p.filter((_, idx) => idx !== i))}
                          className="text-red-700 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                <h3 className="text-xs font-bold text-slate-800">Time-based Routing (Ganti Tujuan Otomatis)</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">Waktu Pergantian</label>
                    <input
                      type="datetime-local"
                      value={timeSwitchAt}
                      onChange={(e) => setTimeSwitchAt(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">URL Tujuan Setelah Jadwal</label>
                    <input
                      type="url"
                      value={timeAfterUrl}
                      onChange={(e) => setTimeAfterUrl(e.target.value)}
                      placeholder="https://toko.id/promo-berakhir"
                      className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {errorMsg && (
            <div role="alert" className="px-3.5 py-2.5 text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg">
              {errorMsg}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-800 hover:bg-blue-900 disabled:opacity-60 rounded-lg"
            >
              <Save className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{saving ? 'Menyimpan...' : 'Simpan Perubahan'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
