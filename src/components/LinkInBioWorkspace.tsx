import React, { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  ExternalLink,
  Globe,
  LayoutTemplate,
  Plus,
  QrCode,
  Save,
  Trash2,
  User,
} from 'lucide-react';
import type {
  AccountSettings,
  BioLinkEntry,
  BioProfile,
  BioTemplateId,
  BioTheme,
} from '../types/shortlink';
import { normalizeAndValidateUrl } from '../utils/urlSecurity';

interface LinkInBioWorkspaceProps {
  profile: BioProfile;
  domainSettings: AccountSettings;
  saving: boolean;
  onSaveProfile: (payload: {
    displayName: string;
    bio: string;
    theme: BioTheme;
    templateId: BioTemplateId;
    customDomain: string;
    items: BioLinkEntry[];
  }) => Promise<void>;
  onOpenQr: (title: string, url: string) => void;
  onRecordClick: (itemId: string) => void;
}

const THEME_OPTIONS: Array<{ id: BioTheme; label: string; previewBg: string; buttonCls: string }> = [
  {
    id: 'cobalt',
    label: 'Biru Cobalt',
    previewBg: 'bg-slate-50 text-slate-900',
    buttonCls: 'bg-blue-800 text-white hover:bg-blue-900',
  },
  {
    id: 'slate',
    label: 'Obsidian Gelap',
    previewBg: 'bg-slate-900 text-white',
    buttonCls: 'bg-white text-slate-900 hover:bg-slate-100',
  },
  {
    id: 'emerald',
    label: 'Hijau Zamrud',
    previewBg: 'bg-emerald-950 text-white',
    buttonCls: 'bg-emerald-500 text-slate-950 hover:bg-emerald-400',
  },
  {
    id: 'amber',
    label: 'Hangat Klasik',
    previewBg: 'bg-stone-100 text-stone-900',
    buttonCls: 'bg-stone-900 text-white hover:bg-stone-800',
  },
];

const TEMPLATE_OPTIONS: Array<{ id: BioTemplateId; label: string; desc: string }> = [
  { id: 'minimal-card', label: 'Kartu Minimalis', desc: 'Tumpukan tombol klasik fokus konversi' },
  { id: 'creator-grid', label: 'Grid Kreator', desc: 'Tata letak kartu 2 kolom modern' },
  { id: 'product-showcase', label: 'Etalase Produk', desc: 'Sorotan katalog dengan label & badge' },
  { id: 'dark-terminal', label: 'Studio Monospace', desc: 'Gaya teknis kontras tinggi untuk developer' },
];

export const LinkInBioWorkspace: React.FC<LinkInBioWorkspaceProps> = ({
  profile,
  domainSettings,
  saving,
  onSaveProfile,
  onOpenQr,
  onRecordClick,
}) => {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [bio, setBio] = useState(profile.bio);
  const [theme, setTheme] = useState<BioTheme>(profile.theme);
  const [templateId, setTemplateId] = useState<BioTemplateId>(profile.templateId || 'minimal-card');
  const [customDomain, setCustomDomain] = useState<string>(profile.customDomain || '');
  const [items, setItems] = useState<BioLinkEntry[]>(profile.items);

  const [newTitle, setNewTitle] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newBadge, setNewBadge] = useState('');
  const [itemError, setItemError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [copiedBioUrl, setCopiedBioUrl] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);

  useEffect(() => {
    setDisplayName(profile.displayName);
    setBio(profile.bio);
    setTheme(profile.theme);
    setTemplateId(profile.templateId || 'minimal-card');
    setCustomDomain(profile.customDomain || '');
    setItems(profile.items);
  }, [profile]);

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://taut.id';
  const publicBioUrl = customDomain
    ? `https://${customDomain}/u/${profile.handle}`
    : `${origin}/u/${profile.handle}`;
  const activeTheme =
    templateId === 'dark-terminal'
      ? { id: 'slate' as BioTheme, label: 'Studio', previewBg: 'bg-slate-950 text-slate-100 font-mono', buttonCls: 'bg-slate-800 text-emerald-300 border border-emerald-500/40 hover:bg-slate-700' }
      : THEME_OPTIONS.find((t) => t.id === theme) || THEME_OPTIONS[0];

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    setItemError(null);
    if (!newTitle.trim()) {
      setItemError('Judul tautan bio wajib diisi.');
      return;
    }
    const urlCheck = normalizeAndValidateUrl(newUrl);
    if (!urlCheck.valid) {
      setItemError(urlCheck.error || 'URL tautan bio tidak valid.');
      return;
    }
    const nowIso = new Date().toISOString();
    const entry: BioLinkEntry = {
      id: `bio-${Date.now()}`,
      ownerId: profile.ownerId,
      title: newTitle.trim().slice(0, 80),
      url: urlCheck.normalizedUrl,
      badge: newBadge.trim().slice(0, 32) || undefined,
      order: items.length,
      clicks: 0,
      isActive: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    setItems([...items, entry]);
    setNewTitle('');
    setNewUrl('');
    setNewBadge('');
  };

  const handleMove = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= items.length) return;
    const copy = [...items];
    const tmp = copy[idx];
    copy[idx] = copy[target];
    copy[target] = tmp;
    setItems(copy.map((item, i) => ({ ...item, order: i })));
  };

  const handleToggleItem = (id: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, isActive: !item.isActive } : item))
    );
  };

  const handleDeleteItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSave = async () => {
    setSaveNotice(null);
    setItemError(null);
    if (!displayName.trim()) {
      setItemError('Nama tampilan profil tidak boleh kosong.');
      return;
    }
    await onSaveProfile({
      displayName: displayName.trim(),
      bio: bio.trim(),
      theme,
      templateId,
      customDomain,
      items,
    });
    setSaveNotice('Profil Link-in-Bio, template, dan domain kustom berhasil disimpan.');
    setTimeout(() => setSaveNotice(null), 3000);
  };

  const handleCopyPublicUrl = async () => {
    await navigator.clipboard.writeText(publicBioUrl);
    setCopiedBioUrl(true);
    setTimeout(() => setCopiedBioUrl(false), 1800);
  };

  const activeItems = items.filter((i) => i.isActive);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Link in Bio &amp; Micro-Landing</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Pilih template siap pakai dan hubungkan domain kustom Anda untuk halaman profil publik.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCopyPublicUrl}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
          >
            {copiedBioUrl ? <Check className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" /> : <Copy className="w-3.5 h-3.5" aria-hidden="true" />}
            <span>{copiedBioUrl ? 'URL Disalin' : customDomain ? `${customDomain}/u/${profile.handle}` : `/u/${profile.handle}`}</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenQr(`bio-${profile.handle}`, publicBioUrl)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
          >
            <QrCode className="w-3.5 h-3.5" aria-hidden="true" />
            <span>QR Bio</span>
          </button>

          <a
            href={`/u/${profile.handle}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-800 hover:bg-blue-900 rounded-lg"
          >
            <span>Buka Halaman</span>
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Editor */}
        <div className="lg:col-span-7 space-y-6">
          <section aria-labelledby="bio-template-heading" className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <LayoutTemplate className="w-4 h-4 text-blue-800" aria-hidden="true" />
              <h2 id="bio-template-heading" className="font-display text-base font-bold text-slate-900">
                Template Micro-Landing &amp; Custom Domain
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {TEMPLATE_OPTIONS.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => setTemplateId(tpl.id)}
                  className={`p-3 text-left rounded-lg border transition-colors ${
                    templateId === tpl.id
                      ? 'border-blue-800 bg-blue-50/70'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="text-xs font-semibold text-slate-900">{tpl.label}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{tpl.desc}</div>
                </button>
              ))}
            </div>

            <div className="pt-2 border-t border-slate-100">
              <label htmlFor="bio-custom-domain" className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1.5">
                <Globe className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                <span>Custom Domain Halaman Bio</span>
              </label>
              <select
                id="bio-custom-domain"
                value={customDomain}
                onChange={(e) => setCustomDomain(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-800"
              >
                <option value="">Domain Sistem Bawaan (/u/{profile.handle})</option>
                {domainSettings.customDomains.map((d) => (
                  <option key={d.domain} value={d.domain}>
                    https://{d.domain}/u/{profile.handle}
                  </option>
                ))}
              </select>
            </div>
          </section>

          <section aria-labelledby="bio-profile-heading" className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 id="bio-profile-heading" className="font-display text-base font-bold text-slate-900">
              Identitas &amp; Warna Tema
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="bio-display-name" className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Tampilan
                </label>
                <input
                  id="bio-display-name"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-800"
                />
              </div>

              <div>
                <span className="block text-xs font-semibold text-slate-700 mb-1">Tema Tampilan</span>
                <div className="flex flex-wrap gap-1.5">
                  {THEME_OPTIONS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTheme(t.id)}
                      className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                        theme === t.id
                          ? 'border-blue-800 bg-blue-50 text-blue-900'
                          : 'border-slate-200 text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="bio-description" className="block text-xs font-semibold text-slate-700 mb-1">
                Deskripsi Singkat
              </label>
              <textarea
                id="bio-description"
                rows={2}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-800"
              />
            </div>
          </section>

          <section aria-labelledby="bio-links-heading" className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 id="bio-links-heading" className="font-display text-base font-bold text-slate-900">
                Daftar Tautan Bio ({items.length})
              </h2>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-800 hover:bg-blue-900 disabled:opacity-60 rounded-lg"
              >
                <Save className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{saving ? 'Menyimpan...' : 'Simpan Perubahan'}</span>
              </button>
            </div>

            {saveNotice && (
              <div role="status" className="px-3.5 py-2.5 text-xs font-medium text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg">
                {saveNotice}
              </div>
            )}

            <form onSubmit={handleAddItem} className="grid grid-cols-1 sm:grid-cols-12 gap-3 pb-4 border-b border-slate-200">
              <div className="sm:col-span-4">
                <label htmlFor="new-bio-title" className="sr-only">
                  Judul tautan baru
                </label>
                <input
                  id="new-bio-title"
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Judul tombol"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-800"
                />
              </div>
              <div className="sm:col-span-4">
                <label htmlFor="new-bio-url" className="sr-only">
                  URL tautan baru
                </label>
                <input
                  id="new-bio-url"
                  type="url"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="https://wa.me/628123456"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-800"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="new-bio-badge" className="sr-only">
                  Label opsional
                </label>
                <input
                  id="new-bio-badge"
                  type="text"
                  value={newBadge}
                  onChange={(e) => setNewBadge(e.target.value)}
                  placeholder="Promo/Baru"
                  className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-blue-800"
                />
              </div>
              <div className="sm:col-span-2">
                <button
                  type="submit"
                  className="w-full inline-flex items-center justify-center gap-1 px-3 py-2 text-xs font-semibold text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Tambah</span>
                </button>
              </div>
            </form>

            {itemError && (
              <div role="alert" className="px-3.5 py-2 text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg">
                {itemError}
              </div>
            )}

            <div className="divide-y divide-slate-200">
              {items.map((item, idx) => (
                <div key={item.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-900 truncate">
                      {item.title}
                      {item.badge && (
                        <span className="ml-2 text-[11px] font-mono text-blue-800">[{item.badge}]</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 font-mono truncate">{item.url}</div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs font-mono text-slate-500 tabular-nums pr-2">
                      {item.clicks} klik
                    </span>
                    <button
                      type="button"
                      onClick={() => handleMove(idx, -1)}
                      disabled={idx === 0}
                      aria-label={`Naikkan ${item.title}`}
                      className="p-1.5 text-slate-500 hover:text-slate-900 disabled:opacity-30 border border-slate-200 rounded-md"
                    >
                      <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMove(idx, 1)}
                      disabled={idx === items.length - 1}
                      aria-label={`Turunkan ${item.title}`}
                      className="p-1.5 text-slate-500 hover:text-slate-900 disabled:opacity-30 border border-slate-200 rounded-md"
                    >
                      <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleItem(item.id)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md border ${
                        item.isActive
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                          : 'border-slate-200 bg-slate-100 text-slate-600'
                      }`}
                    >
                      {item.isActive ? 'Aktif' : 'Sembunyi'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteItem(item.id)}
                      aria-label={`Hapus ${item.title}`}
                      className="p-1.5 text-slate-500 hover:text-red-700 border border-slate-200 rounded-md"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Right Live Mobile Preview */}
        <aside aria-label="Pratinjau halaman Link in Bio" className="lg:col-span-5 flex justify-center">
          <div className={`w-full max-w-sm border border-slate-300 rounded-2xl p-6 shadow-sm ${activeTheme.previewBg}`}>
            <div className="text-[11px] font-mono opacity-65 text-center mb-4 truncate">
              {customDomain ? `https://${customDomain}/u/${profile.handle}` : `/u/${profile.handle}`}
            </div>

            <div className="flex flex-col items-center text-center">
              <div className="w-20 h-20 rounded-full overflow-hidden border border-slate-300 bg-slate-200 flex items-center justify-center">
                {!avatarFailed ? (
                  <img
                    src={profile.avatarUrl || '/src/assets/images/avatar_bio_creator_1794832316229.jpg'}
                    alt={displayName}
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarFailed(true)}
                    className="w-full h-full object-cover object-top"
                  />
                ) : (
                  <User className="w-8 h-8 text-slate-500" aria-hidden="true" />
                )}
              </div>

              <h3 className="mt-4 font-display text-lg font-bold tracking-tight">{displayName}</h3>
              <p className="text-xs opacity-75 font-mono mt-0.5">@{profile.handle}</p>
              <p className="mt-2 text-xs opacity-85 leading-relaxed max-w-xs">{bio}</p>
            </div>

            {templateId === 'creator-grid' ? (
              <div className="mt-6 grid grid-cols-2 gap-2.5">
                {activeItems.map((item) => (
                  <a
                    key={item.id}
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => onRecordClick(item.id)}
                    className={`p-3 text-left text-xs font-semibold rounded-xl transition-colors flex flex-col justify-between min-h-20 ${activeTheme.buttonCls}`}
                  >
                    <span className="line-clamp-2">{item.title}</span>
                    <span className="text-[10px] opacity-75 font-mono mt-1">{item.badge || 'Buka'}</span>
                  </a>
                ))}
              </div>
            ) : templateId === 'product-showcase' ? (
              <div className="mt-6 space-y-2.5">
                {activeItems.map((item) => (
                  <a
                    key={item.id}
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => onRecordClick(item.id)}
                    className={`flex items-center justify-between gap-2 w-full px-4 py-3 text-left text-xs font-semibold rounded-xl transition-colors ${activeTheme.buttonCls}`}
                  >
                    <div className="min-w-0">
                      <div className="truncate">{item.title}</div>
                      {item.badge && (
                        <div className="text-[10px] opacity-80 font-mono mt-0.5">{item.badge}</div>
                      )}
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 shrink-0 opacity-80" aria-hidden="true" />
                  </a>
                ))}
              </div>
            ) : (
              <div className="mt-6 space-y-3">
                {activeItems.map((item) => (
                  <a
                    key={item.id}
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => onRecordClick(item.id)}
                    className={`block w-full px-4 py-3 text-center text-sm font-semibold rounded-xl transition-colors ${activeTheme.buttonCls}`}
                  >
                    {templateId === 'dark-terminal' ? `> ${item.title}` : item.title}
                  </a>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};
