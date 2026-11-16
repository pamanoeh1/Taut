import React, { useEffect, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Cloud,
  Code2,
  Copy,
  Globe,
  KeyRound,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  Webhook,
  Zap,
} from 'lucide-react';
import {
  apiAddTeamMember,
  apiChangePassword,
  apiCreateApiKey,
  apiCreateWebhook,
  apiDeleteApiKey,
  apiDeleteTeamMember,
  apiDeleteWebhook,
  apiFetchApiKeys,
  apiFetchScannerStatus,
  apiFetchTeamMembers,
  apiFetchWebhooks,
  apiTestWebhook,
  apiTriggerZapierSimulation,
} from '../services/shortlinkStore';
import type {
  AccountSettings,
  ApiKeyEntry,
  AuthSessionUser,
  DomainPlanTier,
  TeamMember,
  UserRole,
  WebhookConfig,
  WebhookDeliveryLog,
} from '../types/shortlink';

interface SettingsWorkspaceProps {
  sessionUser: AuthSessionUser;
  domainSettings: AccountSettings;
  googleEmail: string | null;
  googleDisplayName: string | null;
  googleLoading: boolean;
  onAddDomain: (domain: string, setAsDefault: boolean, planTier: DomainPlanTier) => Promise<void>;
  onVerifyDomain: (domain: string, activateSandbox?: boolean) => Promise<void>;
  onSetActiveDomain: (domain: string) => Promise<void>;
  onRemoveDomain: (domain: string) => Promise<void>;
  onGoogleSignIn: () => void;
  onGoogleSignOut: () => void;
  onLinksUpdated: () => Promise<void>;
}

type SettingsSectionTab = 'domains' | 'api_webhooks' | 'integrations' | 'security_team';

export const SettingsWorkspace: React.FC<SettingsWorkspaceProps> = ({
  sessionUser,
  domainSettings,
  googleEmail,
  googleDisplayName,
  googleLoading,
  onAddDomain,
  onVerifyDomain,
  onSetActiveDomain,
  onRemoveDomain,
  onGoogleSignIn,
  onGoogleSignOut,
  onLinksUpdated,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<SettingsSectionTab>('domains');

  // Custom Domain & Cloudflare for SaaS state
  const [newDomain, setNewDomain] = useState('');
  const [planTier, setPlanTier] = useState<DomainPlanTier>('free');
  const [setAsDefault, setSetAsDefault] = useState(true);
  const [domainSaving, setDomainSaving] = useState(false);
  const [verifyingDomain, setVerifyingDomain] = useState<string | null>(null);
  const [domainError, setDomainError] = useState<string | null>(null);
  const [domainNotice, setDomainNotice] = useState<string | null>(null);

  // API Keys & Webhooks state
  const [apiKeys, setApiKeys] = useState<ApiKeyEntry[]>([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [revealedRawKey, setRevealedRawKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);

  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
  const [webhookLogs, setWebhookLogs] = useState<WebhookDeliveryLog[]>([]);
  const [whName, setWhName] = useState('');
  const [whUrl, setWhUrl] = useState('');
  const [whEvents, setWhEvents] = useState<Array<'link.clicked' | 'link.created' | 'link.quota_reached'>>([
    'link.clicked',
    'link.created',
  ]);
  const [whError, setWhError] = useState<string | null>(null);
  const [whNotice, setWhNotice] = useState<string | null>(null);

  // Zapier / Make simulation state
  const [zapSourceApp, setZapSourceApp] = useState('Google Sheets');
  const [zapUrl, setZapUrl] = useState('https://tokopedia.com/promo-sheet-auto');
  const [zapUtmSource, setZapUtmSource] = useState('google_sheets');
  const [zapUtmCampaign, setZapUtmCampaign] = useState('auto_sync_q4');
  const [zapRunning, setZapRunning] = useState(false);
  const [zapResult, setZapResult] = useState<{ shortUrl: string; integration: string } | null>(null);
  const [zapError, setZapError] = useState<string | null>(null);

  // Security Scanner status
  const [scannerStatus, setScannerStatus] = useState({
    heuristic: true,
    googleSafeBrowsingConfigured: false,
    virusTotalConfigured: false,
    cloudflareSaasConfigured: false,
  });

  // Change Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passSaving, setPassSaving] = useState(false);
  const [passError, setPassError] = useState<string | null>(null);
  const [passNotice, setPassNotice] = useState<string | null>(null);

  // Team Management state (Super Admin)
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [memberUsername, setMemberUsername] = useState('');
  const [memberPassword, setMemberPassword] = useState('');
  const [memberRole, setMemberRole] = useState<UserRole>('member');
  const [memberSaving, setMemberSaving] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [memberNotice, setMemberNotice] = useState<string | null>(null);

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://taut.id';

  useEffect(() => {
    apiFetchScannerStatus().then(setScannerStatus).catch(() => {});
    apiFetchApiKeys().then(setApiKeys).catch(() => {});
    apiFetchWebhooks()
      .then((d) => {
        setWebhooks(d.webhooks);
        setWebhookLogs(d.logs);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (sessionUser.role !== 'super_admin') return;
    let cancelled = false;
    setMembersLoading(true);
    setMemberError(null);
    apiFetchTeamMembers()
      .then((list) => {
        if (!cancelled) setMembers(list);
      })
      .catch((err) => {
        if (!cancelled) setMemberError(err instanceof Error ? err.message : 'Gagal memuat anggota.');
      })
      .finally(() => {
        if (!cancelled) setMembersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionUser.role]);

  const handleLinkDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    setDomainError(null);
    setDomainNotice(null);
    if (!newDomain.trim()) {
      setDomainError('Masukkan nama domain kustom terlebih dahulu.');
      return;
    }
    setDomainSaving(true);
    try {
      await onAddDomain(newDomain.trim(), setAsDefault, planTier);
      setDomainNotice(
        `Domain "${newDomain.trim().toLowerCase()}" (${planTier.toUpperCase()}) ditautkan. Silakan pasang record CNAME/TXT lalu verifikasi SSL.`
      );
      setNewDomain('');
    } catch (err) {
      setDomainError(err instanceof Error ? err.message : 'Gagal menautkan domain.');
    } finally {
      setDomainSaving(false);
    }
  };

  const handleVerifyDns = async (domain: string, activateSandbox = false) => {
    setDomainError(null);
    setDomainNotice(null);
    setVerifyingDomain(domain);
    try {
      await onVerifyDomain(domain, activateSandbox);
      setDomainNotice(
        activateSandbox
          ? `SSL Cloudflare for SaaS untuk "${domain}" telah diaktifkan.`
          : `Pemeriksaan DNS CNAME & TXT untuk "${domain}" selesai.`
      );
    } catch (err) {
      setDomainError(err instanceof Error ? err.message : 'Gagal memeriksa DNS.');
    } finally {
      setVerifyingDomain(null);
    }
  };

  const handleCreateApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiKeyError(null);
    setRevealedRawKey(null);
    if (!newKeyName.trim()) {
      setApiKeyError('Masukkan label aplikasi untuk API Key.');
      return;
    }
    try {
      const res = await apiCreateApiKey(newKeyName.trim());
      setApiKeys((prev) => [res.apiKey, ...prev]);
      setRevealedRawKey(res.rawKey);
      setNewKeyName('');
    } catch (err) {
      setApiKeyError(err instanceof Error ? err.message : 'Gagal membuat API Key.');
    }
  };

  const handleDeleteApiKey = async (id: string) => {
    await apiDeleteApiKey(id);
    setApiKeys((prev) => prev.filter((k) => k.id !== id));
  };

  const handleCreateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    setWhError(null);
    setWhNotice(null);
    try {
      const created = await apiCreateWebhook({
        name: whName.trim(),
        targetUrl: whUrl.trim(),
        events: whEvents,
      });
      setWebhooks((prev) => [created, ...prev]);
      setWhNotice(`Webhook "${created.name}" aktif dengan secret HMAC ${created.secret}.`);
      setWhName('');
      setWhUrl('');
    } catch (err) {
      setWhError(err instanceof Error ? err.message : 'Gagal mendaftarkan webhook.');
    }
  };

  const handleTestWebhook = async (id: string) => {
    setWhError(null);
    try {
      const res = await apiTestWebhook(id);
      setWebhookLogs(res.logs);
      setWhNotice(
        res.log?.ok
          ? `Uji kirim berhasil (${res.log.message}).`
          : `Uji kirim selesai dicatat (${res.log?.message || 'periksa log'}).`
      );
    } catch (err) {
      setWhError(err instanceof Error ? err.message : 'Gagal menguji webhook.');
    }
  };

  const handleZapSimulation = async (e: React.FormEvent) => {
    e.preventDefault();
    setZapError(null);
    setZapResult(null);
    setZapRunning(true);
    try {
      const res = await apiTriggerZapierSimulation({
        url: zapUrl.trim(),
        utm_source: zapUtmSource.trim(),
        utm_campaign: zapUtmCampaign.trim(),
        source_app: zapSourceApp,
      });
      setZapResult({ shortUrl: res.shortUrl, integration: res.integration });
      await onLinksUpdated();
    } catch (err) {
      setZapError(err instanceof Error ? err.message : 'Simulasi integrasi gagal.');
    } finally {
      setZapRunning(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassError(null);
    setPassNotice(null);

    if (!currentPassword || !newPassword) {
      setPassError('Kata sandi saat ini dan kata sandi baru wajib diisi.');
      return;
    }
    if (newPassword.length < 6) {
      setPassError('Kata sandi baru minimal 6 karakter.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPassError('Konfirmasi kata sandi baru tidak cocok.');
      return;
    }

    setPassSaving(true);
    try {
      const msg = await apiChangePassword(currentPassword, newPassword);
      setPassNotice(msg);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPassError(err instanceof Error ? err.message : 'Gagal memperbarui kata sandi.');
    } finally {
      setPassSaving(false);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setMemberError(null);
    setMemberNotice(null);
    if (!memberUsername.trim() || !memberPassword) {
      setMemberError('Username dan kata sandi anggota wajib diisi.');
      return;
    }
    setMemberSaving(true);
    try {
      const added = await apiAddTeamMember(memberUsername.trim(), memberPassword, memberRole);
      setMembers((prev) => [...prev, added]);
      setMemberNotice(`Anggota "${added.username}" berhasil ditambahkan.`);
      setMemberUsername('');
      setMemberPassword('');
      setMemberRole('member');
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : 'Gagal menambah anggota.');
    } finally {
      setMemberSaving(false);
    }
  };

  const handleDeleteMember = async (username: string) => {
    setMemberError(null);
    setMemberNotice(null);
    try {
      await apiDeleteTeamMember(username);
      setMembers((prev) => prev.filter((m) => m.username !== username));
      setMemberNotice(`Anggota "${username}" telah dihapus.`);
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : 'Gagal menghapus anggota.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Pengaturan Platform, API &amp; Keamanan
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Kelola Custom Domain &amp; SSL Cloudflare, REST API &amp; Webhook, otomatisasi Zapier/Make, serta keamanan akun.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-lg shrink-0">
          {(
            [
              { id: 'domains', label: 'Domain & SSL (CNAME)' },
              { id: 'api_webhooks', label: 'API Key & Webhook' },
              { id: 'integrations', label: 'Zapier & Make.com' },
              { id: 'security_team', label: 'Keamanan & Anggota' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSubTab(tab.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeSubTab === tab.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* TAB 1: CUSTOM DOMAINS & CLOUDFLARE FOR SAAS SSL */}
      {activeSubTab === 'domains' && (
        <section aria-labelledby="custom-domain-heading" className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex items-start gap-3 border-b border-slate-100 pb-4">
            <Globe className="w-5 h-5 text-blue-800 mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              <h2 id="custom-domain-heading" className="font-display text-lg font-bold text-slate-900">
                Manajemen Custom Domain (CNAME &amp; Cloudflare for SaaS SSL Gratis)
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                Pengguna paket Gratis maupun Berbayar dapat menautkan domain pendek (misal{' '}
                <code className="font-mono">go.brandanda.com</code>) dan mengaktifkan sertifikat SSL otomatis.
              </p>
            </div>
          </div>

          <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-lg text-xs text-slate-700 space-y-1">
            <p className="font-semibold text-blue-900">Cara Kerja Routing Custom Domain:</p>
            <p>
              1. Domain pihak ketiga yang belum mengarahkan DNS (<code className="font-mono">CNAME</code> /{' '}
              <code className="font-mono">A Record</code>) ke server TautKilat tidak dapat memproses redirect secara otomatis.
            </p>
            <p>
              2. Apabila domain sudah diarahkan ke server TautKilat yang sama (seperti Parked/Addon Domain di hosting Anda),
              pengunjung yang membuka <code className="font-mono">https://domainanda.com/slug</code> atau{' '}
              <code className="font-mono">/s/slug</code> akan <strong>langsung diteruskan ke URL tujuan tanpa halaman login</strong>.
            </p>
          </div>

          <form onSubmit={handleLinkDomain} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
            <div className="sm:col-span-5">
              <label htmlFor="custom-domain-input" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Nama Domain / Subdomain
              </label>
              <input
                id="custom-domain-input"
                type="text"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                placeholder="go.mydomain.com"
                className="w-full px-3.5 py-2 text-sm font-mono text-slate-900 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-800"
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="domain-tier-select" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Paket Akun
              </label>
              <select
                id="domain-tier-select"
                value={planTier}
                onChange={(e) => setPlanTier(e.target.value === 'paid' ? 'paid' : 'free')}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-800"
              >
                <option value="free">Gratis (Free SSL)</option>
                <option value="paid">Berbayar (Pro)</option>
              </select>
            </div>

            <div className="sm:col-span-3 flex items-center gap-2 py-2">
              <input
                id="default-domain-check"
                type="checkbox"
                checked={setAsDefault}
                onChange={(e) => setSetAsDefault(e.target.checked)}
                className="w-4 h-4 accent-blue-800 rounded"
              />
              <label htmlFor="default-domain-check" className="text-xs text-slate-700">
                Jadikan default
              </label>
            </div>

            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={domainSaving}
                className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-800 hover:bg-blue-900 disabled:opacity-60 rounded-lg"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{domainSaving ? 'Menyimpan...' : 'Tautkan'}</span>
              </button>
            </div>
          </form>

          {domainError && (
            <div role="alert" className="px-3.5 py-2.5 text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg">
              {domainError}
            </div>
          )}
          {domainNotice && (
            <div role="status" className="px-3.5 py-2.5 text-xs text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg">
              {domainNotice}
            </div>
          )}

          <div className="pt-2 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs font-semibold text-slate-700">
                Domain Aktif Default Pembuatan Shortlink
              </span>
              <select
                aria-label="Pilih domain aktif default"
                value={domainSettings.activeDomain}
                onChange={(e) => onSetActiveDomain(e.target.value)}
                className="px-3 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-blue-800"
              >
                <option value="">Domain Bawaan Sistem (/s/slug)</option>
                {domainSettings.customDomains.map((d) => (
                  <option key={d.domain} value={d.domain}>
                    https://{d.domain}/slug
                  </option>
                ))}
              </select>
            </div>

            {domainSettings.customDomains.length === 0 ? (
              <p className="text-xs text-slate-500 py-3">
                Belum ada domain kustom. Tambahkan subdomain Anda untuk melihat panduan CNAME &amp; TXT Cloudflare for SaaS.
              </p>
            ) : (
              <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
                {domainSettings.customDomains.map((item) => {
                  const isDefault = domainSettings.activeDomain === item.domain;
                  const sslLabel =
                    item.sslStatus === 'active'
                      ? 'SSL Aktif (Cloudflare)'
                      : item.sslStatus === 'verifying_ssl'
                      ? 'Memverifikasi SSL'
                      : 'Menunggu CNAME';

                  return (
                    <div key={item.domain} className="p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-sm font-semibold text-slate-900">{item.domain}</span>
                            <span className="text-[11px] font-mono text-slate-500">
                              Paket {item.planTier === 'paid' ? 'Pro' : 'Gratis'}
                            </span>
                            <span
                              className={`text-xs font-semibold ${
                                item.sslStatus === 'active' ? 'text-emerald-700' : 'text-amber-700'
                              }`}
                            >
                              · {sslLabel}
                            </span>
                          </div>
                          {item.diagnosticMessage && (
                            <p className="text-xs text-slate-500 mt-1">{item.diagnosticMessage}</p>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <button
                            type="button"
                            disabled={verifyingDomain === item.domain}
                            onClick={() => handleVerifyDns(item.domain, false)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
                          >
                            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Cek DNS</span>
                          </button>
                          {!item.verified && (
                            <button
                              type="button"
                              disabled={verifyingDomain === item.domain}
                              onClick={() => handleVerifyDns(item.domain, true)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-lg"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Aktifkan SSL</span>
                            </button>
                          )}
                          {!isDefault && (
                            <button
                              type="button"
                              onClick={() => onSetActiveDomain(item.domain)}
                              className="px-3 py-1.5 text-xs font-medium text-blue-800 bg-blue-50 hover:bg-blue-100 rounded-lg"
                            >
                              Jadikan Default
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onRemoveDomain(item.domain)}
                            aria-label={`Hapus domain ${item.domain}`}
                            className="p-1.5 text-slate-500 hover:text-red-700 border border-slate-200 rounded-lg"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </div>

                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] font-mono">
                        <div>
                          <div className="text-slate-500">Record CNAME DNS</div>
                          <div className="text-slate-900 mt-0.5 break-all">
                            {item.domain} → {item.cnameTarget}
                          </div>
                        </div>
                        <div>
                          <div className="text-slate-500">TXT Verifikasi Ownership SSL</div>
                          <div className="text-slate-900 mt-0.5 break-all">
                            {item.txtVerificationHost} = {item.txtVerificationValue}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}

      {/* TAB 2: DEVELOPER REST API KEYS & WEBHOOKS */}
      {activeSubTab === 'api_webhooks' && (
        <div className="space-y-6">
          {/* REST API Keys */}
          <section aria-labelledby="api-keys-heading" className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-start gap-3 border-b border-slate-100 pb-3">
              <Code2 className="w-5 h-5 text-blue-800 mt-0.5 shrink-0" aria-hidden="true" />
              <div>
                <h2 id="api-keys-heading" className="font-display text-lg font-bold text-slate-900">
                  REST API Keys (<code className="font-mono text-sm">/api/v1/links</code>)
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Buat kunci otentikasi untuk mengintegrasikan pemendekan tautan dan analitik dari sistem internal Anda.
                </p>
              </div>
            </div>

            <form onSubmit={handleCreateApiKey} className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-52">
                <label htmlFor="api-key-name" className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Integrasi / Aplikasi
                </label>
                <input
                  id="api-key-name"
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="misal: Backend ERP Order"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-800 hover:bg-blue-900 rounded-lg"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Generate API Key</span>
              </button>
            </form>

            {apiKeyError && (
              <div role="alert" className="px-3 py-2 text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg">
                {apiKeyError}
              </div>
            )}

            {revealedRawKey && (
              <div role="status" className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg space-y-2">
                <div className="text-xs font-semibold text-emerald-900">
                  API Key Baru Dibuat (salin sekarang, tidak ditampilkan ulang):
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-2.5 py-1.5 bg-white border border-emerald-200 rounded text-xs font-mono text-emerald-900 break-all">
                    {revealedRawKey}
                  </code>
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(revealedRawKey);
                      setCopiedKey(true);
                      setTimeout(() => setCopiedKey(false), 1800);
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-emerald-700 text-white rounded-lg shrink-0"
                  >
                    {copiedKey ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey ? 'Disalin' : 'Salin'}</span>
                  </button>
                </div>
              </div>
            )}

            {apiKeys.length > 0 ? (
              <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
                {apiKeys.map((k) => (
                  <div key={k.id} className="px-4 py-3 flex items-center justify-between gap-3 text-xs">
                    <div>
                      <div className="font-semibold text-slate-900">{k.name}</div>
                      <div className="font-mono text-slate-500 mt-0.5">
                        {k.prefix} · oleh {k.createdBy}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteApiKey(k.id)}
                      aria-label={`Cabut API Key ${k.name}`}
                      className="px-2.5 py-1.5 text-red-700 border border-slate-200 hover:bg-red-50 rounded-lg"
                    >
                      Cabut
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500">Belum ada API Key aktif.</p>
            )}

            <pre className="p-3 bg-slate-900 text-slate-100 rounded-lg text-[11px] font-mono overflow-x-auto">
{`curl -X POST "${origin}/api/v1/links" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: tk_live_..." \\
  -d '{"targetUrl":"https://toko.id/promo","customSlug":"promo-erp"}'`}
            </pre>
          </section>

          {/* Webhooks */}
          <section aria-labelledby="webhooks-heading" className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-start gap-3 border-b border-slate-100 pb-3">
              <Webhook className="w-5 h-5 text-blue-800 mt-0.5 shrink-0" aria-hidden="true" />
              <div>
                <h2 id="webhooks-heading" className="font-display text-lg font-bold text-slate-900">
                  Webhooks Real-time (HMAC-SHA256)
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Kirim notifikasi HTTP POST otomatis saat tautan dibuat, diklik, atau mencapai kuota klik.
                </p>
              </div>
            </div>

            <form onSubmit={handleCreateWebhook} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-3">
                <label htmlFor="wh-name" className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Endpoint
                </label>
                <input
                  id="wh-name"
                  type="text"
                  value={whName}
                  onChange={(e) => setWhName(e.target.value)}
                  placeholder="CRM Notifier"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>
              <div className="sm:col-span-5">
                <label htmlFor="wh-url" className="block text-xs font-semibold text-slate-700 mb-1">
                  URL Endpoint Webhook
                </label>
                <input
                  id="wh-url"
                  type="url"
                  value={whUrl}
                  onChange={(e) => setWhUrl(e.target.value)}
                  placeholder="https://hooks.perusahaan.com/tautkilat"
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div className="sm:col-span-2 flex flex-col gap-1 text-[11px] text-slate-700">
                {(['link.clicked', 'link.created'] as const).map((ev) => (
                  <label key={ev} className="inline-flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={whEvents.includes(ev)}
                      onChange={(e) =>
                        setWhEvents((prev) =>
                          e.target.checked ? [...prev, ev] : prev.filter((x) => x !== ev)
                        )
                      }
                      className="accent-blue-800"
                    />
                    <span className="font-mono">{ev}</span>
                  </label>
                ))}
              </div>
              <div className="sm:col-span-2">
                <button
                  type="submit"
                  className="w-full px-3 py-2 text-xs font-semibold text-white bg-blue-800 hover:bg-blue-900 rounded-lg"
                >
                  Simpan Webhook
                </button>
              </div>
            </form>

            {whError && (
              <div role="alert" className="px-3 py-2 text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg">
                {whError}
              </div>
            )}
            {whNotice && (
              <div role="status" className="px-3 py-2 text-xs text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg">
                {whNotice}
              </div>
            )}

            {webhooks.length > 0 && (
              <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
                {webhooks.map((wh) => (
                  <div key={wh.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900">{wh.name}</div>
                      <div className="font-mono text-slate-500 truncate max-w-md">{wh.targetUrl}</div>
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                        Event: {wh.events.join(', ')} · Secret: {wh.secret}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleTestWebhook(wh.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-800 bg-blue-50 hover:bg-blue-100 rounded-lg"
                      >
                        <Send className="w-3 h-3" aria-hidden="true" />
                        <span>Uji Kirim</span>
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await apiDeleteWebhook(wh.id);
                          setWebhooks((p) => p.filter((x) => x.id !== wh.id));
                        }}
                        className="px-2.5 py-1.5 text-red-700 border border-slate-200 hover:bg-red-50 rounded-lg"
                      >
                        Hapus
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {webhookLogs.length > 0 && (
              <div className="pt-2">
                <div className="text-xs font-semibold text-slate-700 mb-2">Log Pengiriman Webhook Terbaru</div>
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                        <th className="py-2 px-3">Event</th>
                        <th className="py-2 px-3">Target</th>
                        <th className="py-2 px-3">Status</th>
                        <th className="py-2 px-3">Waktu</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {webhookLogs.slice(0, 6).map((log) => (
                        <tr key={log.id}>
                          <td className="py-2 px-3 font-mono">{log.event}</td>
                          <td className="py-2 px-3 truncate max-w-xs text-slate-600">{log.targetUrl}</td>
                          <td className={`py-2 px-3 font-mono ${log.ok ? 'text-emerald-700' : 'text-amber-700'}`}>
                            {log.message}
                          </td>
                          <td className="py-2 px-3 font-mono tabular-nums text-slate-500">
                            {new Date(log.createdAt).toLocaleTimeString('id-ID')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 3: ZAPIER & MAKE.COM */}
      {activeSubTab === 'integrations' && (
        <section aria-labelledby="zapier-heading" className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex items-start gap-3 border-b border-slate-100 pb-4">
            <Zap className="w-5 h-5 text-blue-800 mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              <h2 id="zapier-heading" className="font-display text-lg font-bold text-slate-900">
                Integrasi Otomatisasi Zapier &amp; Make.com
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                Buat shortlink secara otomatis setiap ada baris baru di Google Sheets, formulir Typeform, atau kontak baru di CRM.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 border border-slate-200 rounded-lg p-4 text-xs">
            <div>
              <div className="font-semibold text-slate-700">Endpoint Action URL (POST JSON)</div>
              <code className="block mt-1 font-mono text-blue-800 break-all">
                {origin}/api/integrations/zapier/shorten
              </code>
            </div>
            <div>
              <div className="font-semibold text-slate-700">Header Rahasia (<code className="font-mono">X-Zapier-Secret</code>)</div>
              <code className="block mt-1 font-mono text-slate-900 break-all">
                {domainSettings.zapierHookSecret || 'Tersedia setelah login'}
              </code>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-4 border border-slate-200 rounded-lg space-y-1.5">
              <div className="font-semibold text-slate-900">1. Google Sheets → TautKilat</div>
              <p className="text-slate-600 leading-relaxed">
                Trigger: <em>New Spreadsheet Row</em>. Kirim kolom <code className="font-mono">url</code> &amp;{' '}
                <code className="font-mono">utm_campaign</code> ke endpoint Zapier di atas, lalu tulis{' '}
                <code className="font-mono">shortUrl</code> kembali ke kolom B.
              </p>
            </div>
            <div className="p-4 border border-slate-200 rounded-lg space-y-1.5">
              <div className="font-semibold text-slate-900">2. Typeform → TautKilat</div>
              <p className="text-slate-600 leading-relaxed">
                Trigger: <em>New Entry</em> di Typeform. Gunakan modul HTTP Make.com untuk menghasilkan link unik per pendaftar beserta pelacakan klik otomatis.
              </p>
            </div>
            <div className="p-4 border border-slate-200 rounded-lg space-y-1.5">
              <div className="font-semibold text-slate-900">3. HubSpot / CRM → WhatsApp</div>
              <p className="text-slate-600 leading-relaxed">
                Saat deal baru dibuat, generate shortlink penawaran personal dan picu webhook <code className="font-mono">link.clicked</code> kembali ke CRM.
              </p>
            </div>
          </div>

          {/* Live Simulator */}
          <form onSubmit={handleZapSimulation} className="border-t border-slate-200 pt-4 space-y-3">
            <div className="text-xs font-semibold text-slate-800">
              Uji Coba Simulasi Trigger Otomatis (Langsung Menyimpan ke Daftar Shortlink)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-3">
                <label htmlFor="zap-source" className="block text-[11px] font-medium text-slate-600 mb-1">
                  Sumber Aplikasi
                </label>
                <select
                  id="zap-source"
                  value={zapSourceApp}
                  onChange={(e) => setZapSourceApp(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                >
                  <option value="Google Sheets">Google Sheets</option>
                  <option value="Typeform">Typeform</option>
                  <option value="HubSpot CRM">HubSpot CRM</option>
                </select>
              </div>
              <div className="sm:col-span-4">
                <label htmlFor="zap-url" className="block text-[11px] font-medium text-slate-600 mb-1">
                  URL Masuk dari Aplikasi
                </label>
                <input
                  id="zap-url"
                  type="url"
                  value={zapUrl}
                  onChange={(e) => setZapUrl(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="zap-utm-src" className="block text-[11px] font-medium text-slate-600 mb-1">
                  utm_source
                </label>
                <input
                  id="zap-utm-src"
                  type="text"
                  value={zapUtmSource}
                  onChange={(e) => setZapUtmSource(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>
              <div className="sm:col-span-3">
                <button
                  type="submit"
                  disabled={zapRunning}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-800 hover:bg-blue-900 disabled:opacity-60 rounded-lg"
                >
                  <Zap className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{zapRunning ? 'Memproses...' : 'Jalankan Simulasi Zapier'}</span>
                </button>
              </div>
            </div>

            {zapError && (
              <div role="alert" className="px-3 py-2 text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg">
                {zapError}
              </div>
            )}
            {zapResult && (
              <div role="status" className="px-3.5 py-2.5 text-xs text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg">
                Trigger dari <strong>{zapResult.integration}</strong> berhasil membuat shortlink:{' '}
                <code className="font-mono font-semibold">{zapResult.shortUrl}</code>
              </div>
            )}
          </form>
        </section>
      )}

      {/* TAB 4: SECURITY SCANNER, PASSWORD, CLOUD SYNC & TEAM MANAGEMENT */}
      {activeSubTab === 'security_team' && (
        <div className="space-y-6">
          {/* Phishing & Spam Auto-Scanner Status */}
          <section aria-labelledby="scanner-status-heading" className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-start gap-3 border-b border-slate-100 pb-3">
              <ShieldCheck className="w-5 h-5 text-blue-800 mt-0.5 shrink-0" aria-hidden="true" />
              <div>
                <h2 id="scanner-status-heading" className="font-display text-base font-bold text-slate-900">
                  Phishing &amp; Malware Auto-Scanner Real-time
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Setiap URL yang dipendekkan dipindai terhadap pola typosquatting, ekstensi berbahaya, dan integrasi Google Safe Browsing / VirusTotal.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 border border-slate-200 rounded-lg">
                <div className="font-semibold text-slate-900">Heuristik Anti-Phishing Lokal</div>
                <div className="text-emerald-700 font-medium mt-1">Aktif (Real-time)</div>
              </div>
              <div className="p-3 border border-slate-200 rounded-lg">
                <div className="font-semibold text-slate-900">Google Safe Browsing API v4</div>
                <div className={`font-medium mt-1 ${scannerStatus.googleSafeBrowsingConfigured ? 'text-emerald-700' : 'text-slate-500'}`}>
                  {scannerStatus.googleSafeBrowsingConfigured ? 'Terhubung via Env Var' : 'Siap (Set GOOGLE_SAFE_BROWSING_API_KEY)'}
                </div>
              </div>
              <div className="p-3 border border-slate-200 rounded-lg">
                <div className="font-semibold text-slate-900">VirusTotal URL Scanner v3</div>
                <div className={`font-medium mt-1 ${scannerStatus.virusTotalConfigured ? 'text-emerald-700' : 'text-slate-500'}`}>
                  {scannerStatus.virusTotalConfigured ? 'Terhubung via Env Var' : 'Siap (Set VIRUSTOTAL_API_KEY)'}
                </div>
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Edit Sandi */}
            <section aria-labelledby="change-pass-heading" className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="flex items-start gap-3 border-b border-slate-100 pb-3">
                <KeyRound className="w-5 h-5 text-blue-800 mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <h2 id="change-pass-heading" className="font-display text-base font-bold text-slate-900">
                    Edit Kata Sandi
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Akun aktif: <span className="font-mono font-semibold text-slate-800">{sessionUser.username}</span> ·{' '}
                    {sessionUser.role === 'super_admin' ? 'Super Admin' : 'Anggota'}
                  </p>
                </div>
              </div>

              <form onSubmit={handleChangePassword} className="space-y-3">
                <div>
                  <label htmlFor="current-password" className="block text-xs font-semibold text-slate-700 mb-1">
                    Kata Sandi Saat Ini
                  </label>
                  <input
                    id="current-password"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Masukkan kata sandi lama"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-800"
                  />
                </div>

                <div>
                  <label htmlFor="new-password" className="block text-xs font-semibold text-slate-700 mb-1">
                    Kata Sandi Baru
                  </label>
                  <input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimal 6 karakter"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-800"
                  />
                </div>

                <div>
                  <label htmlFor="confirm-new-password" className="block text-xs font-semibold text-slate-700 mb-1">
                    Konfirmasi Kata Sandi Baru
                  </label>
                  <input
                    id="confirm-new-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Ulangi kata sandi baru"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-800"
                  />
                </div>

                {passError && (
                  <div role="alert" className="px-3 py-2 text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg">
                    {passError}
                  </div>
                )}
                {passNotice && (
                  <div role="status" className="px-3 py-2 text-xs text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg">
                    {passNotice}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={passSaving}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-800 hover:bg-blue-900 disabled:opacity-60 rounded-lg"
                >
                  {passSaving ? 'Menyimpan...' : 'Perbarui Kata Sandi'}
                </button>
              </form>
            </section>

            {/* Sinkronisasi Google Cloud */}
            <section aria-labelledby="cloud-sync-heading" className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="flex items-start gap-3 border-b border-slate-100 pb-3">
                <Cloud className="w-5 h-5 text-blue-800 mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <h2 id="cloud-sync-heading" className="font-display text-base font-bold text-slate-900">
                    Sinkronisasi Cloud Lintas Perangkat
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Hubungkan akun Google Anda untuk mencadangkan tautan, domain kustom, dan Link-in-Bio ke Cloud Firestore.
                  </p>
                </div>
              </div>

              {googleEmail ? (
                <div className="space-y-4">
                  <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900">
                    <p className="font-semibold">Terhubung ke Cloud Firestore</p>
                    <p className="mt-0.5 font-mono">{googleDisplayName || googleEmail} ({googleEmail})</p>
                  </div>
                  <button
                    type="button"
                    onClick={onGoogleSignOut}
                    disabled={googleLoading}
                    className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                  >
                    Putuskan Sinkronisasi Google
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Saat ini data workspace tersimpan aman di server lokal. Masuk dengan Google untuk menyinkronkan data secara otomatis di semua perangkat.
                  </p>
                  <button
                    type="button"
                    onClick={onGoogleSignIn}
                    disabled={googleLoading}
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-lg"
                  >
                    <Cloud className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{googleLoading ? 'Menghubungkan...' : 'Hubungkan Sinkronisasi Google'}</span>
                  </button>
                </div>
              )}
            </section>
          </div>

          {/* Team Management (Super Admin Only) */}
          {sessionUser.role === 'super_admin' && (
            <section aria-labelledby="team-mgmt-heading" className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
              <div className="flex items-start gap-3 border-b border-slate-100 pb-4">
                <Users className="w-5 h-5 text-blue-800 mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <h2 id="team-mgmt-heading" className="font-display text-lg font-bold text-slate-900">
                    Manajemen Anggota (Super Admin)
                  </h2>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Tambahkan atau hapus anggota yang dapat mengakses dashboard shortlink. Semua kata sandi disimpan dalam bentuk hash teracak (scrypt).
                  </p>
                </div>
              </div>

              <form onSubmit={handleAddMember} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                <div className="sm:col-span-4">
                  <label htmlFor="member-username" className="block text-xs font-semibold text-slate-700 mb-1">
                    Username Anggota
                  </label>
                  <input
                    id="member-username"
                    type="text"
                    value={memberUsername}
                    onChange={(e) => setMemberUsername(e.target.value)}
                    placeholder="misal: staf_marketing"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-800"
                  />
                </div>

                <div className="sm:col-span-4">
                  <label htmlFor="member-password" className="block text-xs font-semibold text-slate-700 mb-1">
                    Kata Sandi Awal
                  </label>
                  <input
                    id="member-password"
                    type="password"
                    value={memberPassword}
                    onChange={(e) => setMemberPassword(e.target.value)}
                    placeholder="Minimal 6 karakter"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-800"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="member-role" className="block text-xs font-semibold text-slate-700 mb-1">
                    Peran
                  </label>
                  <select
                    id="member-role"
                    value={memberRole}
                    onChange={(e) => setMemberRole(e.target.value === 'super_admin' ? 'super_admin' : 'member')}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-800"
                  >
                    <option value="member">Anggota</option>
                    <option value="super_admin">Super Admin</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <button
                    type="submit"
                    disabled={memberSaving}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-blue-800 hover:bg-blue-900 disabled:opacity-60 rounded-lg whitespace-nowrap"
                  >
                    <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{memberSaving ? 'Menambah...' : 'Tambah Anggota'}</span>
                  </button>
                </div>
              </form>

              {memberError && (
                <div role="alert" className="px-3.5 py-2 text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg">
                  {memberError}
                </div>
              )}
              {memberNotice && (
                <div role="status" className="px-3.5 py-2 text-xs text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg">
                  {memberNotice}
                </div>
              )}

              {membersLoading ? (
                <div className="py-4 text-xs text-slate-500">Memuat daftar anggota...</div>
              ) : (
                <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
                  {members.map((member) => {
                    const isSelf = member.username === sessionUser.username;
                    return (
                      <div key={member.username} className="px-4 py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900 font-mono">
                            {member.username}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {member.role === 'super_admin' ? 'Super Admin' : 'Anggota'} · Dibuat{' '}
                            {new Date(member.createdAt).toLocaleDateString('id-ID', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={isSelf}
                          onClick={() => handleDeleteMember(member.username)}
                          aria-label={`Hapus anggota ${member.username}`}
                          title={isSelf ? 'Akun sedang digunakan' : 'Hapus anggota'}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-white border border-slate-200 hover:bg-red-50 disabled:opacity-40 disabled:hover:bg-white rounded-lg"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Hapus</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
};
