import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Download, ImagePlus, Trash2, X } from 'lucide-react';
import type { VCardData } from '../types/shortlink';
import { buildStyledQrSvg, type QrDotStyle, type QrEyeStyle } from '../utils/customQrSvg';
import { buildVCardPayload } from '../utils/routingAndUtm';

interface QrCodeModalProps {
  isOpen: boolean;
  title: string;
  shortUrl: string;
  vcard?: VCardData | null;
  onClose: () => void;
}

const QR_PALETTES = [
  { id: 'slate', label: 'Slate', fg: '#0F172A' },
  { id: 'cobalt', label: 'Cobalt', fg: '#1E40AF' },
  { id: 'emerald', label: 'Zamrud', fg: '#065F46' },
  { id: 'crimson', label: 'Crimson', fg: '#991B1B' },
];

export const QrCodeModal: React.FC<QrCodeModalProps> = ({
  isOpen,
  title,
  shortUrl,
  vcard,
  onClose,
}) => {
  const logoFileRef = useRef<HTMLInputElement | null>(null);
  const [fgColor, setFgColor] = useState('#0F172A');
  const [bgColor, setBgColor] = useState('#FFFFFF');
  const [dotStyle, setDotStyle] = useState<QrDotStyle>('square');
  const [eyeStyle, setEyeStyle] = useState<QrEyeStyle>('square');
  const [logoText, setLogoText] = useState('');
  const [logoDataUrl, setLogoDataUrl] = useState('');
  const [qrMode, setQrMode] = useState<'dynamic' | 'direct_vcard'>('dynamic');
  const [copiedSvg, setCopiedSvg] = useState(false);

  useEffect(() => {
    setQrMode('dynamic');
  }, [shortUrl, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const effectiveData = useMemo(() => {
    if (vcard && qrMode === 'direct_vcard') {
      return buildVCardPayload(vcard);
    }
    return shortUrl || 'https://taut.id';
  }, [shortUrl, vcard, qrMode]);

  const svgMarkup = useMemo(() => {
    if (!isOpen) return '';
    return buildStyledQrSvg({
      data: effectiveData,
      size: 280,
      fgColor,
      bgColor,
      dotStyle,
      eyeStyle,
      logoDataUrl: logoDataUrl || undefined,
      logoText: logoText || undefined,
    });
  }, [isOpen, effectiveData, fgColor, bgColor, dotStyle, eyeStyle, logoDataUrl, logoText]);

  if (!isOpen) return null;

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setLogoDataUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDownloadPng = async () => {
    if (!svgMarkup) return;
    const exportSvg = buildStyledQrSvg({
      data: effectiveData,
      size: 640,
      fgColor,
      bgColor,
      dotStyle,
      eyeStyle,
      logoDataUrl: logoDataUrl || undefined,
      logoText: logoText || undefined,
    });
    const svgBlob = new Blob([exportSvg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 640;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, 640, 640);
        ctx.drawImage(img, 0, 0, 640, 640);
        const pngUrl = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = pngUrl;
        a.download = `qr-${title.toLowerCase().replace(/[^a-z0-9-]+/g, '-') || 'shortlink'}.png`;
        a.click();
      }
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const handleDownloadSvg = () => {
    const exportSvg = buildStyledQrSvg({
      data: effectiveData,
      size: 512,
      fgColor,
      bgColor,
      dotStyle,
      eyeStyle,
      logoDataUrl: logoDataUrl || undefined,
      logoText: logoText || undefined,
    });
    const blob = new Blob([exportSvg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qr-${title.toLowerCase().replace(/[^a-z0-9-]+/g, '-') || 'shortlink'}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopySvg = async () => {
    if (!svgMarkup) return;
    await navigator.clipboard.writeText(svgMarkup);
    setCopiedSvg(true);
    setTimeout(() => setCopiedSvg(false), 1800);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl bg-white border border-slate-200 rounded-xl shadow-lg p-6 my-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200">
          <div className="min-w-0">
            <h2 id="qr-modal-title" className="font-display text-lg font-bold text-slate-900 truncate">
              Dynamic QR Code Studio
            </h2>
            <p className="text-xs text-slate-500 font-mono truncate mt-0.5">{shortUrl}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal QR Code"
            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="py-5 grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
          {/* Preview */}
          <div className="md:col-span-5 flex flex-col items-center">
            <div
              className="w-full max-w-[264px] p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-center [&_svg]:w-full [&_svg]:h-auto"
              aria-label={`Pratinjau QR Code untuk ${shortUrl}`}
              dangerouslySetInnerHTML={{ __html: svgMarkup }}
            />
            {vcard && (
              <div className="mt-3 flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-full">
                <button
                  type="button"
                  onClick={() => setQrMode('dynamic')}
                  className={`flex-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-md ${
                    qrMode === 'dynamic' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Dynamic Link
                </button>
                <button
                  type="button"
                  onClick={() => setQrMode('direct_vcard')}
                  className={`flex-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-md ${
                    qrMode === 'direct_vcard' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Direct vCard
                </button>
              </div>
            )}
          </div>

          {/* Styling Controls */}
          <div className="md:col-span-7 space-y-4">
            <div>
              <span className="block text-xs font-semibold text-slate-700 mb-1.5">Warna QR &amp; Latar</span>
              <div className="flex flex-wrap items-center gap-2">
                {QR_PALETTES.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setFgColor(p.fg)}
                    className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                      fgColor === p.fg
                        ? 'border-blue-800 bg-blue-50 text-blue-900'
                        : 'border-slate-200 bg-white text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
                <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 border border-slate-200 rounded-lg px-2 py-1">
                  <span>Kustom</span>
                  <input
                    type="color"
                    aria-label="Pilih warna QR kustom"
                    value={fgColor}
                    onChange={(e) => setFgColor(e.target.value)}
                    className="w-5 h-5 border-0 bg-transparent cursor-pointer"
                  />
                </label>
                <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 border border-slate-200 rounded-lg px-2 py-1">
                  <span>BG</span>
                  <input
                    type="color"
                    aria-label="Pilih warna latar QR"
                    value={bgColor}
                    onChange={(e) => setBgColor(e.target.value)}
                    className="w-5 h-5 border-0 bg-transparent cursor-pointer"
                  />
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="block text-xs font-semibold text-slate-700 mb-1.5">Gaya Modul (Dot)</span>
                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                  {(
                    [
                      { id: 'square', label: 'Kotak' },
                      { id: 'rounded', label: 'Halus' },
                      { id: 'dots', label: 'Titik' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setDotStyle(opt.id)}
                      className={`flex-1 px-2 py-1 text-xs font-medium rounded-md whitespace-nowrap ${
                        dotStyle === opt.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="block text-xs font-semibold text-slate-700 mb-1.5">Gaya Sudut (Eye)</span>
                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                  {(
                    [
                      { id: 'square', label: 'Tegas' },
                      { id: 'rounded', label: 'Membulat' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setEyeStyle(opt.id)}
                      className={`flex-1 px-2 py-1 text-xs font-medium rounded-md whitespace-nowrap ${
                        eyeStyle === opt.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-100">
              <span className="block text-xs font-semibold text-slate-700">
                Logo Tengah QR (Error Correction Level H)
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  maxLength={4}
                  value={logoText}
                  onChange={(e) => setLogoText(e.target.value)}
                  placeholder="Inisial (mis. TK)"
                  aria-label="Inisial logo tengah QR"
                  className="w-32 px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-blue-800"
                />
                <input
                  ref={logoFileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => logoFileRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  <ImagePlus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{logoDataUrl ? 'Ganti Gambar Logo' : 'Unggah Logo'}</span>
                </button>
                {(logoDataUrl || logoText) && (
                  <button
                    type="button"
                    onClick={() => {
                      setLogoDataUrl('');
                      setLogoText('');
                      if (logoFileRef.current) logoFileRef.current.value = '';
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-red-700 hover:bg-red-50 rounded-lg"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Hapus Logo</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleCopySvg}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            {copiedSvg ? <Check className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" /> : <Copy className="w-3.5 h-3.5" aria-hidden="true" />}
            <span>{copiedSvg ? 'SVG Disalin' : 'Salin SVG'}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadSvg}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Unduh SVG</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadPng}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-800 hover:bg-blue-900 rounded-lg transition-colors"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Unduh PNG HD</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
