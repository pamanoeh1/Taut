import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { AnalyticsWorkspace } from './components/AnalyticsWorkspace';
import { BlueprintWorkspace } from './components/BlueprintWorkspace';
import { HeaderNav, type WorkspaceTab } from './components/HeaderNav';
import { LinkInBioWorkspace } from './components/LinkInBioWorkspace';
import { LoginPage } from './components/LoginPage';
import { PublicBioPage } from './components/PublicBioPage';
import { QrCodeModal } from './components/QrCodeModal';
import { RedirectGatePage } from './components/RedirectGatePage';
import { SettingsWorkspace } from './components/SettingsWorkspace';
import { ShortenerWorkspace } from './components/ShortenerWorkspace';
import { auth, googleAuthProvider, testFirestoreConnection } from './lib/firebase';
import {
  apiAddCustomDomain,
  apiBulkCreateLinks,
  apiCreateLink,
  apiDeleteLink,
  apiFetchAnalytics,
  apiFetchBio,
  apiFetchDomainSettings,
  apiFetchLinks,
  apiFetchMe,
  apiLogout,
  apiRecordBioClick,
  apiRemoveCustomDomain,
  apiSaveBio,
  apiSetActiveDomain,
  apiUpdateLink,
  apiVerifyCustomDomain,
  createShortLinkInFirestore,
  deleteShortLinkInFirestore,
  recordBioClickInFirestore,
  sha256Hex,
  subscribeUserShortLinks,
  syncAccountSettingsToFirestore,
  syncUserProfileToFirestore,
  updateShortLinkInFirestore,
  upsertBioInFirestore,
} from './services/shortlinkStore';
import type {
  AccountSettings,
  AnalyticsSummary,
  AuthSessionUser,
  BioLinkEntry,
  BioProfile,
  BioTemplateId,
  BioTheme,
  CreateLinkPayload,
  DomainPlanTier,
  ShortLinkItem,
  VCardData,
} from './types/shortlink';
import type { ParsedBulkRow } from './utils/bulkImportParser';
import { formatShortUrl } from './utils/customDomain';

const DEFAULT_BIO_PROFILE: BioProfile = {
  handle: 'nusantarastudio',
  ownerId: 'demo-workspace',
  displayName: 'Nadia Pratama — Nusantara Studio',
  bio: 'Product Engineer & Digital Strategist. Kumpulan tautan katalog produk, dokumentasi API, dan jadwal sesi konsultasi.',
  theme: 'cobalt',
  avatarUrl: '/src/assets/images/avatar_bio_creator_1794832316229.jpg',
  items: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const DEFAULT_DOMAIN_SETTINGS: AccountSettings = {
  activeDomain: '',
  customDomains: [],
};

export default function App() {
  const [pathname, setPathname] = useState<string>(() =>
    typeof window !== 'undefined' ? window.location.pathname : '/'
  );
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('shortener');

  // Username/Password Session Auth
  const [sessionUser, setSessionUser] = useState<AuthSessionUser | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);

  // Optional Google Cloud Sync Auth
  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [googleAuthLoading, setGoogleAuthLoading] = useState(false);
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  // Domain Settings
  const [domainSettings, setDomainSettings] = useState<AccountSettings>(DEFAULT_DOMAIN_SETTINGS);

  const [links, setLinks] = useState<ShortLinkItem[]>([]);
  const [linksLoading, setLinksLoading] = useState(true);

  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [analyticsSlug, setAnalyticsSlug] = useState<string>('all');
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const [bioProfile, setBioProfile] = useState<BioProfile>(DEFAULT_BIO_PROFILE);
  const [bioSaving, setBioSaving] = useState(false);

  const [qrModal, setQrModal] = useState<{
    open: boolean;
    title: string;
    url: string;
    vcard?: VCardData | null;
  }>({
    open: false,
    title: '',
    url: '',
    vcard: null,
  });

  // 1. Check active session cookie + listen to Firebase Auth
  useEffect(() => {
    apiFetchMe()
      .then((u) => setSessionUser(u))
      .catch(() => setSessionUser(null))
      .finally(() => setSessionChecked(true));

    testFirestoreConnection();
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setGoogleUser(nextUser);
      if (nextUser) {
        try {
          await syncUserProfileToFirestore(
            nextUser.uid,
            nextUser.email || '',
            nextUser.displayName || 'Pengguna'
          );
        } catch (err) {
          console.error('Profile sync warning:', err);
        }
      }
    });
    return () => unsub();
  }, []);

  // 2. Load workspace data once sessionUser is authenticated
  useEffect(() => {
    if (!sessionUser) return;
    let unsubFirestore: (() => void) | undefined;
    setLinksLoading(true);

    apiFetchLinks()
      .then((localLinks) => setLinks(localLinks))
      .catch((err) => console.error('Load local links error:', err))
      .finally(() => setLinksLoading(false));

    apiFetchDomainSettings()
      .then((settings) => setDomainSettings(settings))
      .catch(() => {});

    apiFetchBio('nusantarastudio')
      .then((profile) => setBioProfile(profile))
      .catch(() => {});

    if (googleUser) {
      unsubFirestore = subscribeUserShortLinks(
        googleUser.uid,
        (cloudLinks) => {
          setLinks((prevLocal) => {
            const bySlug = new Map<string, ShortLinkItem>();
            for (const item of prevLocal) bySlug.set(item.slug, item);
            for (const cloud of cloudLinks) bySlug.set(cloud.slug, cloud);
            return Array.from(bySlug.values()).sort((a, b) =>
              b.createdAt.localeCompare(a.createdAt)
            );
          });
        },
        (err) => console.error('Firestore subscription error:', err)
      );
    }

    return () => {
      if (unsubFirestore) unsubFirestore();
    };
  }, [sessionUser, googleUser]);

  // 3. Load Analytics
  const refreshAnalytics = useCallback(
    async (slugOverride?: string) => {
      if (!sessionUser) return;
      const target = slugOverride ?? analyticsSlug;
      setAnalyticsLoading(true);
      try {
        const data = await apiFetchAnalytics(target);
        setAnalytics(data);
      } catch (err) {
        console.error('Failed to fetch analytics:', err);
      } finally {
        setAnalyticsLoading(false);
      }
    },
    [sessionUser, analyticsSlug]
  );

  useEffect(() => {
    refreshAnalytics();
  }, [refreshAnalytics]);

  // Session logout
  const handleLogout = async () => {
    await apiLogout();
    setSessionUser(null);
    setLinks([]);
    setAnalytics(null);
    setActiveTab('shortener');
  };

  // Google Cloud Sync handlers
  const handleGoogleSignIn = async () => {
    setAuthNotice(null);
    setGoogleAuthLoading(true);
    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch (err) {
      setAuthNotice(
        err instanceof Error ? err.message : 'Login Google dibatalkan atau gagal.'
      );
    } finally {
      setGoogleAuthLoading(false);
    }
  };

  const handleGoogleSignOut = async () => {
    setGoogleAuthLoading(true);
    try {
      await signOut(auth);
    } finally {
      setGoogleAuthLoading(false);
    }
  };

  // Custom Domain handlers
  const handleAddDomain = async (
    domain: string,
    setAsDefault: boolean,
    planTier: DomainPlanTier = 'free'
  ) => {
    const next = await apiAddCustomDomain(domain, setAsDefault, planTier);
    setDomainSettings(next);
    if (googleUser) {
      await syncAccountSettingsToFirestore(googleUser.uid, next).catch(() => {});
    }
  };

  const handleVerifyDomain = async (domain: string, activateSandbox = false) => {
    const next = await apiVerifyCustomDomain(domain, activateSandbox);
    setDomainSettings(next);
  };

  const handleSetActiveDomain = async (domain: string) => {
    const next = await apiSetActiveDomain(domain);
    setDomainSettings(next);
    if (googleUser) {
      await syncAccountSettingsToFirestore(googleUser.uid, next).catch(() => {});
    }
  };

  const handleRemoveDomain = async (domain: string) => {
    const next = await apiRemoveCustomDomain(domain);
    setDomainSettings(next);
    if (googleUser) {
      await syncAccountSettingsToFirestore(googleUser.uid, next).catch(() => {});
    }
  };

  const handleReloadLinks = useCallback(async () => {
    const fresh = await apiFetchLinks();
    setLinks(fresh);
    refreshAnalytics();
  }, [refreshAnalytics]);

  // Link CRUD handlers
  const handleCreateLink = async (payload: CreateLinkPayload): Promise<ShortLinkItem> => {
    const created = await apiCreateLink(payload);
    if (googleUser) {
      const passHash = payload.password ? await sha256Hex(payload.password) : '';
      const cloudDoc: ShortLinkItem = {
        ...created,
        ownerId: googleUser.uid,
        passwordHash: passHash,
      };
      await createShortLinkInFirestore(cloudDoc).catch((err) => {
        console.error('Cloud Firestore sync skipped:', err);
      });
    }
    setLinks((prev) => [created, ...prev.filter((l) => l.slug !== created.slug)]);
    refreshAnalytics();
    return created;
  };

  const handleBulkCreateLinks = async (rows: ParsedBulkRow[], customDomain: string) => {
    const res = await apiBulkCreateLinks(rows, customDomain);
    if (googleUser && res.createdLinks.length > 0) {
      for (const link of res.createdLinks) {
        await createShortLinkInFirestore({ ...link, ownerId: googleUser.uid }).catch(() => {});
      }
    }
    if (res.createdLinks.length > 0) {
      setLinks((prev) => {
        const createdSlugs = new Set(res.createdLinks.map((c) => c.slug));
        return [...res.createdLinks, ...prev.filter((l) => !createdSlugs.has(l.slug))];
      });
      refreshAnalytics();
    }
    return {
      results: res.results,
      createdCount: res.createdCount,
      skippedCount: res.skippedCount,
    };
  };

  const handleToggleActive = async (link: ShortLinkItem) => {
    const nextActive = !link.isActive;
    const updated = await apiUpdateLink(link.slug, { isActive: nextActive });
    if (googleUser && link.ownerId === googleUser.uid) {
      await updateShortLinkInFirestore(link.slug, { isActive: nextActive }).catch(() => {});
    }
    setLinks((prev) => prev.map((l) => (l.slug === link.slug ? updated : l)));
    refreshAnalytics();
  };

  const handleDeleteLink = async (slug: string) => {
    const existing = links.find((l) => l.slug === slug);
    await apiDeleteLink(slug);
    if (googleUser && existing?.ownerId === googleUser.uid) {
      await deleteShortLinkInFirestore(slug).catch(() => {});
    }
    setLinks((prev) => prev.filter((l) => l.slug !== slug));
    refreshAnalytics();
  };

  // Bio handlers
  const handleSaveBio = async (payload: {
    displayName: string;
    bio: string;
    theme: BioTheme;
    templateId: BioTemplateId;
    customDomain: string;
    items: BioLinkEntry[];
  }) => {
    setBioSaving(true);
    try {
      const updated = await apiSaveBio(bioProfile.handle, payload);
      if (googleUser) {
        await upsertBioInFirestore(googleUser.uid, {
          handle: bioProfile.handle,
          ...payload,
        }).catch(() => {});
      }
      setBioProfile(updated);
    } finally {
      setBioSaving(false);
    }
  };

  const handleBioItemClick = (itemId: string) => {
    apiRecordBioClick(bioProfile.handle, itemId);
    if (googleUser) {
      recordBioClickInFirestore(bioProfile.handle, itemId);
    }
    setBioProfile((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.id === itemId ? { ...item, clicks: item.clicks + 1 } : item
      ),
    }));
  };

  // Public Standalone Routes: /s/:slug and /u/:handle (always public without dashboard login)
  const navigateHome = () => {
    window.history.pushState({}, '', '/');
    setPathname('/');
  };

  if (pathname.startsWith('/s/')) {
    const slug = pathname.slice(3).split('/')[0];
    if (slug) {
      return <RedirectGatePage slug={slug} onBackHome={navigateHome} />;
    }
  }

  if (pathname.startsWith('/u/')) {
    const handle = pathname.slice(3).split('/')[0];
    if (handle) {
      return <PublicBioPage handle={handle} onBackHome={navigateHome} />;
    }
  }

  // Gate Dashboard behind LoginPage until authenticated
  if (!sessionChecked) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-sm text-slate-500">
        Memuat sesi...
      </div>
    );
  }

  if (!sessionUser) {
    return <LoginPage onLoginSuccess={(u) => setSessionUser(u)} />;
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://taut.id';

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <HeaderNav
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        sessionUsername={sessionUser.username}
        onLogout={handleLogout}
      />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8">
        {authNotice && (
          <div
            role="status"
            className="mb-6 px-4 py-3 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between"
          >
            <span>{authNotice}</span>
            <button
              type="button"
              onClick={() => setAuthNotice(null)}
              className="font-semibold underline ml-4"
            >
              Tutup
            </button>
          </div>
        )}

        {activeTab === 'shortener' && (
          <ShortenerWorkspace
            links={links}
            loading={linksLoading}
            isCloudSynced={Boolean(googleUser)}
            domainSettings={domainSettings}
            onCreateLink={handleCreateLink}
            onBulkCreateLinks={handleBulkCreateLinks}
            onToggleActive={handleToggleActive}
            onDeleteLink={handleDeleteLink}
            onOpenQr={(link) =>
              setQrModal({
                open: true,
                title: link.slug,
                url: formatShortUrl(link.slug, link.customDomain, origin),
                vcard: link.vcard || null,
              })
            }
            onPreviewGate={(slug) => {
              window.history.pushState({}, '', `/s/${slug}`);
              setPathname(`/s/${slug}`);
            }}
            onOpenSettings={() => setActiveTab('settings')}
          />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsWorkspace
            summary={analytics}
            links={links}
            selectedSlug={analyticsSlug}
            loading={analyticsLoading}
            onSelectSlug={(slug) => {
              setAnalyticsSlug(slug);
              refreshAnalytics(slug);
            }}
            onRefresh={() => refreshAnalytics()}
          />
        )}

        {activeTab === 'bio' && (
          <LinkInBioWorkspace
            profile={bioProfile}
            domainSettings={domainSettings}
            saving={bioSaving}
            onSaveProfile={handleSaveBio}
            onOpenQr={(title, url) => setQrModal({ open: true, title, url, vcard: null })}
            onRecordClick={handleBioItemClick}
          />
        )}

        {activeTab === 'blueprint' && <BlueprintWorkspace />}

        {activeTab === 'settings' && (
          <SettingsWorkspace
            sessionUser={sessionUser}
            domainSettings={domainSettings}
            googleEmail={googleUser?.email || null}
            googleDisplayName={googleUser?.displayName || null}
            googleLoading={googleAuthLoading}
            onAddDomain={handleAddDomain}
            onVerifyDomain={handleVerifyDomain}
            onSetActiveDomain={handleSetActiveDomain}
            onRemoveDomain={handleRemoveDomain}
            onGoogleSignIn={handleGoogleSignIn}
            onGoogleSignOut={handleGoogleSignOut}
            onLinksUpdated={handleReloadLinks}
          />
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <span>TautKilat — Platform Shortlink, Analitik Real-time &amp; Keamanan URL</span>
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => setActiveTab('shortener')} className="hover:text-slate-900">
              Pemotong Link
            </button>
            <button type="button" onClick={() => setActiveTab('analytics')} className="hover:text-slate-900">
              Analitik
            </button>
            <button type="button" onClick={() => setActiveTab('bio')} className="hover:text-slate-900">
              Link in Bio
            </button>
            <button type="button" onClick={() => setActiveTab('blueprint')} className="hover:text-slate-900">
              Blueprint &amp; PHP
            </button>
            <button type="button" onClick={() => setActiveTab('settings')} className="hover:text-slate-900">
              Pengaturan
            </button>
          </div>
        </div>
      </footer>

      <QrCodeModal
        isOpen={qrModal.open}
        title={qrModal.title}
        shortUrl={qrModal.url}
        vcard={qrModal.vcard}
        onClose={() => setQrModal((prev) => ({ ...prev, open: false }))}
      />
    </div>
  );
}
