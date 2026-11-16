import React, { useEffect, useState } from 'react';
import { ArrowLeft, ExternalLink, User } from 'lucide-react';
import type { BioProfile } from '../types/shortlink';
import { apiFetchBio, apiRecordBioClick } from '../services/shortlinkStore';

interface PublicBioPageProps {
  handle: string;
  onBackHome: () => void;
}

export const PublicBioPage: React.FC<PublicBioPageProps> = ({ handle, onBackHome }) => {
  const [profile, setProfile] = useState<BioProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetchBio(handle)
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Profil tidak ditemukan.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [handle]);

  const templateId = profile?.templateId || 'minimal-card';

  const themeClasses =
    templateId === 'dark-terminal'
      ? {
          bg: 'bg-slate-950 text-slate-100 font-mono',
          btn: 'bg-slate-900 text-emerald-300 border border-emerald-500/40 hover:bg-slate-800',
        }
      : profile?.theme === 'slate'
      ? { bg: 'bg-slate-900 text-white', btn: 'bg-white text-slate-900 hover:bg-slate-100' }
      : profile?.theme === 'emerald'
      ? { bg: 'bg-emerald-950 text-white', btn: 'bg-emerald-500 text-slate-950 hover:bg-emerald-400' }
      : profile?.theme === 'amber'
      ? { bg: 'bg-stone-100 text-stone-900', btn: 'bg-stone-900 text-white hover:bg-stone-800' }
      : { bg: 'bg-slate-50 text-slate-900', btn: 'bg-blue-800 text-white hover:bg-blue-900' };

  const activeItems = (profile?.items || []).filter((i) => i.isActive);

  return (
    <div className={`min-h-screen flex flex-col items-center justify-center px-4 py-12 ${themeClasses.bg}`}>
      {loading ? (
        <p className="text-sm opacity-75">Memuat profil Link in Bio...</p>
      ) : error || !profile ? (
        <div className="max-w-sm w-full bg-white text-slate-900 border border-slate-200 rounded-xl p-6 text-center space-y-3">
          <h1 className="font-display text-lg font-bold">Profil Tidak Ditemukan</h1>
          <p className="text-sm text-slate-600">{error}</p>
          <button
            type="button"
            onClick={onBackHome}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-800 hover:underline"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Kembali ke TautKilat</span>
          </button>
        </div>
      ) : (
        <main className="w-full max-w-md flex flex-col items-center text-center">
          <div className="w-24 h-24 rounded-full overflow-hidden border border-slate-300 bg-slate-200 flex items-center justify-center">
            {!avatarFailed ? (
              <img
                src={profile.avatarUrl || '/src/assets/images/avatar_bio_creator_1794832316229.jpg'}
                alt={profile.displayName}
                referrerPolicy="no-referrer"
                onError={() => setAvatarFailed(true)}
                className="w-full h-full object-cover object-top"
              />
            ) : (
              <User className="w-10 h-10 text-slate-500" aria-hidden="true" />
            )}
          </div>

          <h1 className="mt-4 font-display text-2xl font-bold tracking-tight">{profile.displayName}</h1>
          <p className="text-xs font-mono opacity-75 mt-1">
            @{profile.handle}
            {profile.customDomain ? ` · ${profile.customDomain}` : ''}
          </p>
          <p className="mt-2.5 text-sm opacity-85 max-w-sm leading-relaxed">{profile.bio}</p>

          {templateId === 'creator-grid' ? (
            <div className="mt-8 w-full grid grid-cols-2 gap-3">
              {activeItems.map((item) => (
                <a
                  key={item.id}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => apiRecordBioClick(profile.handle, item.id)}
                  className={`p-4 text-left rounded-xl text-sm font-semibold transition-colors flex flex-col justify-between min-h-24 ${themeClasses.btn}`}
                >
                  <span>{item.title}</span>
                  <span className="text-[11px] opacity-75 font-mono mt-2">{item.badge || 'Kunjungi'}</span>
                </a>
              ))}
            </div>
          ) : templateId === 'product-showcase' ? (
            <div className="mt-8 w-full space-y-3">
              {activeItems.map((item) => (
                <a
                  key={item.id}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => apiRecordBioClick(profile.handle, item.id)}
                  className={`flex items-center justify-between gap-3 w-full px-5 py-3.5 text-left rounded-xl text-sm font-semibold transition-colors ${themeClasses.btn}`}
                >
                  <div className="min-w-0">
                    <div className="truncate">{item.title}</div>
                    {item.badge && <div className="text-[11px] opacity-80 font-mono mt-0.5">{item.badge}</div>}
                  </div>
                  <ExternalLink className="w-4 h-4 shrink-0 opacity-80" aria-hidden="true" />
                </a>
              ))}
            </div>
          ) : (
            <div className="mt-8 w-full space-y-3">
              {activeItems.map((item) => (
                <a
                  key={item.id}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => apiRecordBioClick(profile.handle, item.id)}
                  className={`block w-full px-5 py-3.5 rounded-xl text-sm font-semibold transition-colors ${themeClasses.btn}`}
                >
                  {templateId === 'dark-terminal' ? `> ${item.title}` : item.title}
                </a>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={onBackHome}
            className="mt-10 inline-flex items-center gap-1.5 text-xs opacity-70 hover:opacity-100"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Dikelola dengan TautKilat</span>
          </button>
        </main>
      )}
    </div>
  );
};
