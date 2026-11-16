import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  ExternalLink,
  Globe,
  ImagePlus,
  LayoutTemplate,
  Pencil,
  Plus,
  QrCode,
  Save,
  Trash2,
  User,
  X,
} from 'lucide-react';
import type {
  AccountSettings,
  BioBackgroundOverlay,
  BioLinkEntry,
  BioProfile,
  BioTemplateId,
  BioTheme,
} from '../types/shortlink';
import { compressImageFileToDataUrl, validateBioImageSource } from '../utils/imageProcessor';
import { normalizeAndValidateUrl, validateSlug } from '../utils/urlSecurity';

interface LinkInBioWorkspaceProps {
  profiles: BioProfile[];
  activeHandle: string;
  domainSettings: AccountSettings;
  saving: boolean;
  onSelectProfile: (handle: string) => void;
  onCreateProfile: (payload: {
    handle: string;
    displayName: string;
    bio?: string;
    templateId?: BioTemplateId;
    theme?: BioTheme;
  }) => Promise<void>;
  onDeleteProfile: (handle: string) => Promise<void>;
  onSaveProfile: (
    currentHandle: string,
    payload: {
      newHandle?: string;
      displayName: string;
      bio: string;
      theme: BioTheme;
      templateId: BioTemplateId;
      customDomain: string;
      avatarUrl: string;
      backgroundImageUrl: string;
      backgroundOverlay: BioBackgroundOverlay;
      items: BioLinkEntry[];
    }
  ) => Promise<void>;
  onOpenQr: (title: string, url: string) => void;
  onRecordClick: (handle: string, itemId: string) => void;
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
  profiles,
  activeHandle,
  domainSettings,
  saving,
  onSelectProfile,
  onCreateProfile,
  onDeleteProfile,
  onSaveProfile,
  onOpenQr,
  onRecordClick,
}) => {
  const profile =
    profiles.find((p) => p.handle === activeHandle) ||
    profiles[0] || {
      handle: 'nusantarastudio',
      ownerId: 'admin',
      displayName: 'Nadia Pratama — Nusantara Studio',
      bio: '',
      theme: 'cobalt' as BioTheme,
      templateId: 'minimal-card' as BioTemplateId,
      customDomain: '',
      avatarUrl: '/src/assets/images/avatar_bio_creator_1794832316229.jpg',
      backgroundImageUrl: '',
      backgroundOverlay: 'dark' as BioBackgroundOverlay,
      items: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

  // Profile editor fields
  const [handleInput, setHandleInput] = useState(profile.handle);
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [bio, setBio] = useState(profile.bio);
  const [theme, setTheme] = useState<BioTheme>(profile.theme);
  const [templateId, setTemplateId] = useState<BioTemplateId>(profile.templateId || 'minimal-card');
  const [customDomain, setCustomDomain] = useState<string>(profile.customDomain || '');
  const [avatarUrl, setAvatarUrl] = useState<string>(profile.avatarUrl || '');
  const [backgroundImageUrl, setBackgroundImageUrl] = useState<string>(profile.backgroundImageUrl || '');
  const [backgroundOverlay, setBackgroundOverlay] = useState<BioBackgroundOverlay>(
    profile.backgroundOverlay || 'dark'
  );
  const [items, setItems] = useState<BioLinkEntry[]>(profile.items);

  // Create new Bio modal/drawer state
  const [showNewBioForm, setShowNewBioForm] = useState(false);
  const [newBioHandle, setNewBioHandle] = useState('');
  const [newBioDisplayName, setNewBioDisplayName] = useState('');
  const [newBioDesc, setNewBioDesc] = useState('');
  const [creatingBio, setCreatingBio] = useState(false);
  const [newBioError, setNewBioError] = useState<string | null>(null);

  // Link entry add & inline edit state
  const [newTitle, setNewTitle] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newBadge, setNewBadge] = useState('');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editItemTitle, setEditItemTitle] = useState('');
  const [editItemUrl, setEditItemUrl] = useState('');
  const [editItemBadge, setEditItemBadge] = useState('');

  // Status / upload state
  const [itemError, setItemError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [copiedBioUrl, setCopiedBioUrl] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [bgFailed, setBgFailed] = useState(false);

  const avatarFileRef = useRef<HTMLInputElement | null>(null);
  const bgFileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setHandleInput(profile.handle);
    setDisplayName(profile.displayName);
    setBio(profile.bio);
    setTheme(profile.theme);
    setTemplateId(profile.templateId || 'minimal-card');
    setCustomDomain(profile.customDomain || '');
    setAvatarUrl(profile.avatarUrl || '');
    setBackgroundImageUrl(profile.backgroundImageUrl || '');
    setBackgroundOverlay(profile.backgroundOverlay || 'dark');
    setItems(profile.items);
    setAvatarFailed(false);
    setBgFailed(false);
    setEditingItemId(null);
    setItemError(null);
  }, [profile]);

  const cleanLiveHandle = handleInput.trim().toLowerCase() || profile.handle;
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://taut.id';
  const publicBioUrl = customDomain
    ? `https://${customDomain}/u/${cleanLiveHandle}`
    : `${origin}/u/${cleanLiveHandle}`;

  const hasValidBgImage = Boolean(backgroundImageUrl.trim() && !bgFailed);

  const activeTheme =
    templateId === 'dark-terminal'
      ? {
          id: 'slate' as BioTheme,
          label: 'Studio',
          previewBg: 'bg-slate-950 text-slate-100 font-mono',
          buttonCls: 'bg-slate-800 text-emerald-300 border border-emerald-500/40 hover:bg-slate-700',
        }
      : THEME_OPTIONS.find((t) => t.id === theme) || THEME_OPTIONS[0];

  const previewOverlayCls = hasValidBgImage
    ? backgroundOverlay === 'light'
      ? 'bg-white/80 text-slate-900'
      : backgroundOverlay === 'none'
      ? 'bg-transparent text-white drop-shadow'
      : 'bg-slate-950/65 text-white'
    : '';

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setItemError(null);
    try {
      const compressed = await compressImageFileToDataUrl(file, {
        maxWidth: 320,
        maxHeight: 320,
        quality: 0.82,
      });
      setAvatarUrl(compressed);
      setAvatarFailed(false);
    } catch (err) {
      setItemError(err instanceof Error ? err.message : 'Gagal memproses foto profil.');
    } finally {
      if (avatarFileRef.current) avatarFileRef.current.value = '';
    }
  };

  const handleBgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setItemError(null);
    try {
      const compressed = await compressImageFileToDataUrl(file, {
        maxWidth: 960,
        maxHeight: 1280,
        quality: 0.78,
      });
      setBackgroundImageUrl(compressed);
      setBgFailed(false);
    } catch (err) {
      setItemError(err instanceof Error ? err.message : 'Gagal memproses foto background.');
    } finally {
      if (bgFileRef.current) bgFileRef.current.value = '';
    }
  };

  const handleCreateBioSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNewBioError(null);
    const hc = validateSlug(newBioHandle);
    if (!hc.valid) {
      setNewBioError(hc.error || 'Handle bio tidak valid.');
      return;
    }
    if (!newBioDisplayName.trim()) {
      setNewBioError('Nama tampilan profil baru wajib diisi.');
      return;
    }
    setCreatingBio(true);
    try {
      await onCreateProfile({
        handle: hc.normalizedSlug,
        displayName: newBioDisplayName.trim(),
        bio: newBioDesc.trim(),
        templateId: 'minimal-card',
        theme: 'cobalt',
      });
      setShowNewBioForm(false);
      setNewBioHandle('');
      setNewBioDisplayName('');
      setNewBioDesc('');
    } catch (err) {
      setNewBioError(err instanceof Error ? err.message : 'Gagal membuat halaman bio baru.');
    } finally {
      setCreatingBio(false);
    }
  };

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

  const startEditItem = (item: BioLinkEntry) => {
    setItemError(null);
    setEditingItemId(item.id);
    setEditItemTitle(item.title);
    setEditItemUrl(item.url);
    setEditItemBadge(item.badge || '');
  };

  const commitEditItem = (id: string) => {
    setItemError(null);
    if (!editItemTitle.trim()) {
      setItemError('Judul tautan bio tidak boleh kosong.');
      return;
    }
    const check = normalizeAndValidateUrl(editItemUrl);
    if (!check.valid) {
      setItemError(check.error || 'URL tautan bio tidak valid.');
      return;
    }
    setItems((prev) =>
      prev.map((it) =>
        it.id === id
          ? {
              ...it,
              title: editItemTitle.trim().slice(0, 80),
              url: check.normalizedUrl,
              badge: editItemBadge.trim().slice(0, 32) || undefined,
              updatedAt: new Date().toISOString(),
            }
          : it
      )
    );
    setEditingItemId(null);
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

    const handleCheck = validateSlug(handleInput);
    if (!handleCheck.valid) {
      setItemError(handleCheck.error || 'Handle URL (/u/...) tidak valid.');
      return;
    }
    if (!displayName.trim()) {
      setItemError('Nama tampilan profil tidak boleh kosong.');
      return;
    }

    const avatarCheck = validateBioImageSource(avatarUrl);
    if (!avatarCheck.valid) {
      setItemError(avatarCheck.error || 'URL foto profil tidak valid.');
      return;
    }

    const bgCheck = validateBioImageSource(backgroundImageUrl);
    if (!bgCheck.valid) {
      setItemError(bgCheck.error || 'URL background foto tidak valid.');
      return;
    }

    try {
      await onSaveProfile(profile.handle, {
        newHandle: handleCheck.normalizedSlug !== profile.handle ? handleCheck.normalizedSlug : undefined,
        displayName: displayName.trim(),
        bio: bio.trim(),
        theme,
        templateId,
        customDomain,
        avatarUrl: avatarCheck.value,
        backgroundImageUrl: bgCheck.value,
        backgroundOverlay,
        items,
      });
      setSaveNotice(`Profil "/u/${handleCheck.normalizedSlug}" berhasil disimpan!`);
      setTimeout(() => setSaveNotice(null), 3500);
    } catch (err) {
      setItemError(err instanceof Error ? err.message : 'Gagal menyimpan perubahan profil bio.');
    }
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
            Buat banyak halaman Link in Bio tanpa batas, ubah handle /u/, foto profil, background, dan semua tautan secara penuh.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCopyPublicUrl}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg whitespace-nowrap shrink-0"
          >
            {copiedBioUrl ? <Check className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" /> : <Copy className="w-3.5 h-3.5" aria-hidden="true" />}
            <span>{copiedBioUrl ? 'URL Disalin' : customDomain ? `${customDomain}/u/${profile.handle}` : `/u/${profile.handle}`}</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenQr(`bio-${profile.handle}`, publicBioUrl)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg whitespace-nowrap shrink-0"
          >
            <QrCode className="w-3.5 h-3.5" aria-hidden="true" />
            <span>QR Bio</span>
          </button>

          <a
            href={`/u/${profile.handle}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-800 hover:bg-blue-900 rounded-lg whitespace-nowrap shrink-0"
          >
            <span>Buka Halaman</span>
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
          </a>
        </div>
      </div>

      {/* Multi-Profile Switcher & Create Unlimited Bio Pages */}
      <section aria-label="Pengelola Banyak Halaman Bio" className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-700 mr-1">
              Halaman Bio ({profiles.length}):
            </span>
            {profiles.map((p) => {
              const isSelected = p.handle === profile.handle;
              return (
                <button
                  key={p.handle}
                  type="button"
                  onClick={() => onSelectProfile(p.handle)}
                  className={`px-3 py-1.5 text-xs font-mono font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                    isSelected
                      ? 'bg-blue-800 text-white border-blue-800'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  /u/{p.handle}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setShowNewBioForm((v) => !v);
                setNewBioError(null);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-blue-800 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Halaman Bio Baru</span>
            </button>
            {profiles.length > 1 && (
              <button
                type="button"
                onClick={() => onDeleteProfile(profile.handle)}
                aria-label={`Hapus halaman bio ${profile.handle}`}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-700 bg-white border border-slate-200 hover:bg-red-50 rounded-lg whitespace-nowrap shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Hapus Bio Ini</span>
              </button>
            )}
          </div>
        </div>

        {showNewBioForm && (
          <form onSubmit={handleCreateBioSubmit} className="pt-4 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
            <div className="sm:col-span-3">
              <label htmlFor="new-bio-handle" className="block text-xs font-semibold text-slate-700 mb-1">
                Handle URL Baru
              </label>
              <div className="flex items-center border border-slate-300 rounded-lg overflow-hidden bg-white">
                <span className="px-2 py-2 text-xs font-mono text-slate-500 bg-slate-50 border-r border-slate-200 shrink-0">
                  /u/
                </span>
                <input
                  id="new-bio-handle"
                  type="text"
                  value={newBioHandle}
                  onChange={(e) => setNewBioHandle(e.target.value)}
                  placeholder="toko-katalog"
                  className="w-full px-2.5 py-2 text-xs font-mono focus:outline-none"
                />
              </div>
            </div>

            <div className="sm:col-span-4">
              <label htmlFor="new-bio-displayname" className="block text-xs font-semibold text-slate-700 mb-1">
                Nama Tampilan Profil
              </label>
              <input
                id="new-bio-displayname"
                type="text"
                value={newBioDisplayName}
                onChange={(e) => setNewBioDisplayName(e.target.value)}
                placeholder="Toko Resmi Nusantara"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>

            <div className="sm:col-span-3">
              <label htmlFor="new-bio-desc" className="block text-xs font-semibold text-slate-700 mb-1">
                Deskripsi Singkat (opsional)
              </label>
              <input
                id="new-bio-desc"
                type="text"
                value={newBioDesc}
                onChange={(e) => setNewBioDesc(e.target.value)}
                placeholder="Katalog resmi & promo terbaru"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>

            <div className="sm:col-span-2 flex items-center gap-1.5">
              <button
                type="submit"
                disabled={creatingBio}
                className="flex-1 px-3 py-2 text-xs font-semibold text-white bg-blue-800 hover:bg-blue-900 disabled:opacity-60 rounded-lg whitespace-nowrap"
              >
                {creatingBio ? 'Membuat...' : 'Buat Bio'}
              </button>
              <button
                type="button"
                onClick={() => setShowNewBioForm(false)}
                aria-label="Batal buat bio baru"
                className="p-2 text-slate-500 hover:text-slate-900 border border-slate-200 rounded-lg"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>

            {newBioError && (
              <div role="alert" className="sm:col-span-12 px-3 py-2 text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg">
                {newBioError}
              </div>
            )}
          </form>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Editor */}
        <div className="lg:col-span-7 space-y-6">
          <section aria-labelledby="bio-profile-heading" className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 id="bio-profile-heading" className="font-display text-base font-bold text-slate-900">
                Identitas, Handle /u/, Foto Profil &amp; Background
              </h2>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-800 hover:bg-blue-900 disabled:opacity-60 rounded-lg whitespace-nowrap shrink-0"
              >
                <Save className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{saving ? 'Menyimpan...' : 'Simpan Profil'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="bio-handle-input" className="block text-xs font-semibold text-slate-700 mb-1">
                  Handle URL (<code className="font-mono">/u/...</code> &amp; <code className="font-mono">@username</code>)
                </label>
                <div className="flex items-center border border-slate-300 rounded-lg overflow-hidden bg-white focus-within:border-blue-800">
                  <span className="px-2.5 py-2 text-xs font-mono text-slate-500 bg-slate-50 border-r border-slate-200 shrink-0">
                    /u/
                  </span>
                  <input
                    id="bio-handle-input"
                    type="text"
                    value={handleInput}
                    onChange={(e) => setHandleInput(e.target.value)}
                    placeholder="nusantarastudio"
                    className="w-full px-3 py-2 text-sm font-mono text-slate-900 focus:outline-none"
                  />
                </div>
              </div>

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
            </div>

            <div>
              <label htmlFor="bio-description" className="block text-xs font-semibold text-slate-700 mb-1">
                Deskripsi / Bio Singkat
              </label>
              <textarea
                id="bio-description"
                rows={2}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-800"
              />
            </div>

            {/* Foto Profil & Background Photo Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
              <div className="space-y-2">
                <label htmlFor="bio-avatar-url" className="block text-xs font-semibold text-slate-700">
                  Foto Profil (Avatar)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    ref={avatarFileRef}
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarUpload}
                    className="hidden"
                    id="bio-avatar-file"
                  />
                  <button
                    type="button"
                    onClick={() => avatarFileRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg whitespace-nowrap shrink-0"
                  >
                    <ImagePlus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Unggah Foto</span>
                  </button>
                  {avatarUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        setAvatarUrl('');
                        setAvatarFailed(false);
                      }}
                      className="px-2.5 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg whitespace-nowrap shrink-0"
                    >
                      Hapus Foto
                    </button>
                  )}
                </div>
                <input
                  id="bio-avatar-url"
                  type="url"
                  value={avatarUrl.startsWith('data:') ? '' : avatarUrl}
                  onChange={(e) => {
                    setAvatarUrl(e.target.value);
                    setAvatarFailed(false);
                  }}
                  placeholder={avatarUrl.startsWith('data:') ? 'Gambar terunggah dari perangkat' : 'Atau tempel URL foto (https://...)'}
                  className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-blue-800"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="bio-bg-url" className="block text-xs font-semibold text-slate-700">
                  Foto Latar Belakang (Background)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    ref={bgFileRef}
                    type="file"
                    accept="image/*"
                    onChange={handleBgUpload}
                    className="hidden"
                    id="bio-bg-file"
                  />
                  <button
                    type="button"
                    onClick={() => bgFileRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg whitespace-nowrap shrink-0"
                  >
                    <ImagePlus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Unggah Background</span>
                  </button>
                  {backgroundImageUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        setBackgroundImageUrl('');
                        setBgFailed(false);
                      }}
                      className="px-2.5 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg whitespace-nowrap shrink-0"
                    >
                      Hapus Bg
                    </button>
                  )}
                </div>
                <input
                  id="bio-bg-url"
                  type="url"
                  value={backgroundImageUrl.startsWith('data:') ? '' : backgroundImageUrl}
                  onChange={(e) => {
                    setBackgroundImageUrl(e.target.value);
                    setBgFailed(false);
                  }}
                  placeholder={backgroundImageUrl.startsWith('data:') ? 'Background terunggah dari perangkat' : 'Atau tempel URL background (https://...)'}
                  className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-blue-800"
                />
                {backgroundImageUrl && (
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-[11px] font-medium text-slate-600">Kontras Overlay:</span>
                    {(
                      [
                        { id: 'dark', label: 'Gelap' },
                        { id: 'light', label: 'Terang' },
                        { id: 'none', label: 'Tanpa' },
                      ] as const
                    ).map((ov) => (
                      <button
                        key={ov.id}
                        type="button"
                        onClick={() => setBackgroundOverlay(ov.id)}
                        className={`px-2 py-0.5 text-[11px] font-medium rounded border ${
                          backgroundOverlay === ov.id
                            ? 'border-blue-800 bg-blue-50 text-blue-900'
                            : 'border-slate-200 text-slate-600'
                        }`}
                      >
                        {ov.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div>
              <span className="block text-xs font-semibold text-slate-700 mb-1.5">Tema Warna</span>
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
          </section>

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
                <option value="">Domain Sistem Bawaan (/u/{cleanLiveHandle})</option>
                {domainSettings.customDomains.map((d) => (
                  <option key={d.domain} value={d.domain}>
                    https://{d.domain}/u/{cleanLiveHandle}
                  </option>
                ))}
              </select>
            </div>
          </section>

          <section aria-labelledby="bio-links-heading" className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div className="flex items-center justify-between gap-2">
              <h2 id="bio-links-heading" className="font-display text-base font-bold text-slate-900">
                Daftar Tautan Bio ({items.length})
              </h2>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-800 hover:bg-blue-900 disabled:opacity-60 rounded-lg whitespace-nowrap shrink-0"
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
                  className="w-full inline-flex items-center justify-center gap-1 px-3 py-2 text-xs font-semibold text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg whitespace-nowrap"
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
              {items.map((item, idx) => {
                const isEditing = editingItemId === item.id;
                return (
                  <div key={item.id} className="py-3 space-y-2.5">
                    {isEditing ? (
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center bg-slate-50 p-3 rounded-lg border border-slate-200">
                        <input
                          type="text"
                          value={editItemTitle}
                          onChange={(e) => setEditItemTitle(e.target.value)}
                          placeholder="Judul tautan"
                          aria-label="Edit judul tautan bio"
                          className="sm:col-span-4 px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
                        />
                        <input
                          type="url"
                          value={editItemUrl}
                          onChange={(e) => setEditItemUrl(e.target.value)}
                          placeholder="https://..."
                          aria-label="Edit URL tautan bio"
                          className="sm:col-span-4 px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-md"
                        />
                        <input
                          type="text"
                          value={editItemBadge}
                          onChange={(e) => setEditItemBadge(e.target.value)}
                          placeholder="Label"
                          aria-label="Edit label tautan bio"
                          className="sm:col-span-2 px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
                        />
                        <div className="sm:col-span-2 flex items-center gap-1 justify-end">
                          <button
                            type="button"
                            onClick={() => commitEditItem(item.id)}
                            aria-label="Simpan item bio"
                            className="p-1.5 text-white bg-blue-800 hover:bg-blue-900 rounded-md"
                          >
                            <Check className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingItemId(null)}
                            aria-label="Batal edit item bio"
                            className="p-1.5 text-slate-600 bg-white border border-slate-300 rounded-md"
                          >
                            <X className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3">
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
                            onClick={() => startEditItem(item)}
                            aria-label={`Edit ${item.title}`}
                            className="p-1.5 text-blue-800 hover:bg-blue-50 border border-slate-200 rounded-md"
                          >
                            <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
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
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* Right Live Mobile Preview */}
        <aside aria-label="Pratinjau halaman Link in Bio" className="lg:col-span-5 flex justify-center">
          <div
            className={`relative overflow-hidden w-full max-w-sm border border-slate-300 rounded-2xl shadow-sm ${
              hasValidBgImage ? '' : activeTheme.previewBg
            }`}
          >
            {hasValidBgImage && (
              <img
                src={backgroundImageUrl}
                alt="Latar belakang halaman bio"
                referrerPolicy="no-referrer"
                onError={() => setBgFailed(true)}
                className="absolute inset-0 w-full h-full object-cover"
              />
            )}

            <div className={`relative z-10 p-6 min-h-96 ${previewOverlayCls}`}>
              <div className="text-[11px] font-mono opacity-75 text-center mb-4 truncate">
                {customDomain ? `https://${customDomain}/u/${cleanLiveHandle}` : `/u/${cleanLiveHandle}`}
              </div>

              <div className="flex flex-col items-center text-center">
                <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-white/80 bg-slate-200 flex items-center justify-center shadow-sm">
                  {avatarUrl && !avatarFailed ? (
                    <img
                      src={avatarUrl}
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
                <p className="text-xs opacity-80 font-mono mt-0.5">@{cleanLiveHandle}</p>
                <p className="mt-2 text-xs opacity-90 leading-relaxed max-w-xs">{bio}</p>
              </div>

              {templateId === 'creator-grid' ? (
                <div className="mt-6 grid grid-cols-2 gap-2.5">
                  {activeItems.map((item) => (
                    <a
                      key={item.id}
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => onRecordClick(profile.handle, item.id)}
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
                      onClick={() => onRecordClick(profile.handle, item.id)}
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
                      onClick={() => onRecordClick(profile.handle, item.id)}
                      className={`block w-full px-4 py-3 text-center text-sm font-semibold rounded-xl transition-colors ${activeTheme.buttonCls}`}
                    >
                      {templateId === 'dark-terminal' ? `> ${item.title}` : item.title}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};
