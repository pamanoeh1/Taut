import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Building2,
  Contact,
  Download,
  ExternalLink,
  Globe,
  Lock,
  Mail,
  MapPin,
  Phone,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import {
  apiFetchLinkBySlug,
  apiUnlockLink,
  getVCardHrefOrDataUrl,
} from '../services/shortlinkStore';
import type { ShortLinkItem } from '../types/shortlink';
import { resolveTargetDestination } from '../utils/routingAndUtm';

interface RedirectGatePageProps {
  slug: string;
  onBackHome: () => void;
}

export const RedirectGatePage: React.FC<RedirectGatePageProps> = ({ slug, onBackHome }) => {
  const [loading, setLoading] = useState(true);
  const [link, setLink] = useState<ShortLinkItem | null>(null);
  const [expired, setExpired] = useState(false);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [interstitialCountdown, setInterstitialCountdown] = useState<number>(3);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrorMsg(null);
    apiFetchLinkBySlug(slug)
      .then((data) => {
        if (!cancelled) {
          setLink(data.link);
          setExpired(Boolean(data.expired));
          setQuotaExceeded(Boolean(data.quotaExceeded));
        }
      })
      .catch((err) => {
        if (!cancelled) setErrorMsg(err instanceof Error ? err.message : 'Tautan tidak ditemukan.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const canAutoRedirect = Boolean(
    !loading &&
      link &&
      link.isActive &&
      link.safetyStatus !== 'blocked' &&
      !expired &&
      !quotaExceeded &&
      !link.hasPassword &&
      link.linkType !== 'vcard'
  );

  const resolvedTarget = useMemo(() => {
    if (!link) return '';
    return resolveTargetDestination(link).finalUrl;
  }, [link]);

  useEffect(() => {
    if (!canAutoRedirect || !link || !resolvedTarget) return;

    if (link.interstitialEnabled) {
      setInterstitialCountdown(3);
      const timer = window.setInterval(() => {
        setInterstitialCountdown((prev) => {
          if (prev <= 1) {
            window.clearInterval(timer);
            window.location.replace(resolvedTarget);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => window.clearInterval(timer);
    }

    const immediateTimer = window.setTimeout(() => {
      window.location.replace(resolvedTarget);
    }, 60);
    return () => window.clearTimeout(immediateTimer);
  }, [canAutoRedirect, link, resolvedTarget]);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setUnlockError(null);
    setUnlocking(true);
    try {
      const targetUrl = await apiUnlockLink(slug, password);
      window.location.href = targetUrl;
    } catch (err) {
      setUnlockError(err instanceof Error ? err.message : 'Kata sandi salah.');
    } finally {
      setUnlocking(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <span className="font-display text-base font-bold text-slate-900">TautKilat</span>
          <span className="font-mono text-xs text-slate-500">/{slug}</span>
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-slate-500">Memeriksa keamanan dan status tautan...</div>
        ) : errorMsg || !link ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-red-700">
              <ShieldAlert className="w-5 h-5" aria-hidden="true" />
              <h1 className="font-display text-lg font-bold">Tautan Tidak Tersedia</h1>
            </div>
            <p className="text-sm text-slate-600">{errorMsg || 'Tautan tidak ditemukan.'}</p>
          </div>
        ) : !link.isActive ? (
          <div className="space-y-3">
            <h1 className="font-display text-lg font-bold text-slate-900">Tautan Dinonaktifkan</h1>
            <p className="text-sm text-slate-600">
              Pemilik tautan <strong>{link.title}</strong> telah menonaktifkan pengalihan untuk sementara.
            </p>
          </div>
        ) : link.safetyStatus === 'blocked' ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-red-700">
              <ShieldAlert className="w-5 h-5" aria-hidden="true" />
              <h1 className="font-display text-lg font-bold">Tautan Diblokir Demi Keamanan</h1>
            </div>
            <p className="text-sm text-slate-600">{link.safetyReason}</p>
          </div>
        ) : expired ? (
          <div className="space-y-3">
            <h1 className="font-display text-lg font-bold text-amber-800">Tautan Sudah Kadaluarsa</h1>
            <p className="text-sm text-slate-600">
              Masa berlaku tautan ini telah berakhir pada{' '}
              {new Date(link.expiresAt).toLocaleString('id-ID')}.
            </p>
          </div>
        ) : quotaExceeded ? (
          <div className="space-y-3">
            <h1 className="font-display text-lg font-bold text-amber-800">Kuota Klik Tercapai</h1>
            <p className="text-sm text-slate-600 tabular-nums">
              Tautan <strong>{link.title}</strong> telah mencapai batas maksimal {link.maxClicks} klik dan otomatis dinonaktifkan.
            </p>
          </div>
        ) : link.linkType === 'vcard' && link.vcard ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-800 flex items-center justify-center shrink-0">
                <Contact className="w-5 h-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h1 className="font-display text-lg font-bold text-slate-900 truncate">
                  {link.vcard.fullName}
                </h1>
                {(link.vcard.role || link.vcard.organization) && (
                  <p className="text-xs text-slate-600 mt-0.5 flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                    <span className="truncate">
                      {[link.vcard.role, link.vcard.organization].filter(Boolean).join(' · ')}
                    </span>
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2 text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3.5">
              <div className="flex items-center gap-2 font-mono">
                <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                <span>{link.vcard.phone}</span>
              </div>
              {link.vcard.email && (
                <div className="flex items-center gap-2 font-mono">
                  <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                  <span>{link.vcard.email}</span>
                </div>
              )}
              {link.vcard.website && (
                <div className="flex items-center gap-2 font-mono truncate">
                  <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                  <span className="truncate">{link.vcard.website}</span>
                </div>
              )}
              {link.vcard.address && (
                <div className="flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                  <span>{link.vcard.address}</span>
                </div>
              )}
            </div>

            <a
              href={getVCardHrefOrDataUrl(link)}
              download={`${link.slug}.vcf`}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-800 hover:bg-blue-900 rounded-lg"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              <span>Simpan Kontak ke HP (.vcf)</span>
            </a>
          </div>
        ) : link.hasPassword ? (
          <form onSubmit={handleUnlock} className="space-y-4">
            <div className="flex items-center gap-2 text-slate-900">
              <Lock className="w-5 h-5 text-blue-800" aria-hidden="true" />
              <h1 className="font-display text-lg font-bold">Tautan Terproteksi Kata Sandi</h1>
            </div>
            <p className="text-sm text-slate-600">
              Masukkan kata sandi untuk melanjutkan ke tujuan <strong>{link.title}</strong>.
            </p>
            <div>
              <label htmlFor="gate-password" className="block text-xs font-semibold text-slate-700 mb-1">
                Kata Sandi
              </label>
              <input
                id="gate-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Masukkan kata sandi..."
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-800"
              />
            </div>
            {unlockError && (
              <div role="alert" className="px-3 py-2 text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg">
                {unlockError}
              </div>
            )}
            <button
              type="submit"
              disabled={unlocking}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-800 hover:bg-blue-900 disabled:opacity-60 rounded-lg"
            >
              <span>{unlocking ? 'Memverifikasi...' : 'Buka Tautan'}</span>
              <ExternalLink className="w-4 h-4" aria-hidden="true" />
            </button>
          </form>
        ) : link.interstitialEnabled ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-blue-800">
              <ShieldCheck className="w-5 h-5" aria-hidden="true" />
              <h1 className="font-display text-lg font-bold text-slate-900">
                Anda sedang meninggalkan TautKilat
              </h1>
            </div>
            <p className="text-sm text-slate-600">
              Mengalihkan otomatis ke <strong>{link.title}</strong> dalam{' '}
              <span className="font-mono font-bold text-blue-800 tabular-nums">{interstitialCountdown}</span> detik...
            </p>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-blue-800 break-all">
              {resolvedTarget}
            </div>
            <a
              href={resolvedTarget}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-800 hover:bg-blue-900 rounded-lg"
            >
              <span>Lanjutkan Sekarang</span>
              <ExternalLink className="w-4 h-4" aria-hidden="true" />
            </a>
          </div>
        ) : (
          <div className="space-y-4">
            <h1 className="font-display text-lg font-bold text-slate-900">Mengalihkan ke {link.title}...</h1>
            <p className="text-xs text-slate-600">
              Anda sedang diteruskan secara otomatis tanpa perlu masuk ke dashboard.
            </p>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-blue-800 break-all">
              {resolvedTarget}
            </div>
            <a
              href={resolvedTarget}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-800 hover:bg-blue-900 rounded-lg"
            >
              <span>Klik di sini jika pengalihan tidak berjalan</span>
              <ExternalLink className="w-4 h-4" aria-hidden="true" />
            </a>
          </div>
        )}

        <div className="pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={onBackHome}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Kembali ke Dashboard TautKilat</span>
          </button>
        </div>
      </div>
    </div>
  );
};
