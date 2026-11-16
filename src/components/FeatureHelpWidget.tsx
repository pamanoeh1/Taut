import React, { useEffect, useState } from 'react';
import { BookOpen, HelpCircle, X } from 'lucide-react';

export type HelpPageContext =
  | 'login'
  | 'shortener'
  | 'analytics'
  | 'bio'
  | 'blueprint'
  | 'settings'
  | 'public-bio'
  | 'public-redirect';

interface FeatureEntry {
  title: string;
  desc: string;
}

interface PageGuide {
  id: HelpPageContext;
  label: string;
  subtitle: string;
  features: FeatureEntry[];
}

const PAGE_GUIDES: PageGuide[] = [
  {
    id: 'shortener',
    label: 'Pemotong Link & Daftar Tautan',
    subtitle: 'Buat, edit, impor massal, dan amankan shortlink serta QR Code.',
    features: [
      {
        title: 'Pemotong Tautan Tunggal & Slug Kustom',
        desc: 'Ubah URL panjang menjadi shortlink pendek dengan slug kustom, pilihan domain pribadi, serta tipe pengalihan 301 Permanen (SEO) atau 302 Sementara (Analitik).',
      },
      {
        title: 'Menu Edit Tautan ("Daftar Tautan Pendek")',
        desc: 'Klik tombol Edit pada setiap baris tautan untuk mengubah slug (/s/...), URL tujuan, judul, domain kustom, kata sandi (pasang/ubah/hapus), tanggal kadaluarsa, batas klik, UTM, OG, Pixel, Geo/OS routing, dan A/B test kapan saja.',
      },
      {
        title: 'Proteksi Password, Kadaluarsa, Max Clicks & 3s Gate',
        desc: 'Kunci tautan dengan kata sandi, tetapkan masa berlaku otomatis, batasi total klik kuota kupon, atau aktifkan halaman konfirmasi keamanan 3 detik (Interstitial Gate) sebelum pengunjung keluar.',
      },
      {
        title: 'UTM Builder, Open Graph Editor & Tracking Pixel',
        desc: 'Tambahkan parameter utm_source/medium/campaign otomatis, kustomisasi judul/deskripsi/gambar share WhatsApp/X/Facebook, serta sisipkan Meta/Facebook Pixel, Google Tag (GA4), TikTok Pixel, dan LinkedIn Insight Tag.',
      },
      {
        title: 'Geo-Targeting, Device/OS Routing, A/B Test & Jadwal',
        desc: 'Arahkan pengunjung ke URL berbeda menurut negara (ID/US/SG/dll), sistem operasi (iOS App Store, Android Play Store, Desktop), uji split trafik 50/50 (A/B Test), atau ganti tujuan otomatis pada jam/tanggal tertentu.',
      },
      {
        title: 'vCard / Contact QR & Impor Massal CSV / XLSX',
        desc: 'Buat QR kontak .vcf untuk simpan nomor HP langsung ke ponsel, atau unggah spreadsheet CSV/XLSX berisi banyak URL untuk membuat puluhan shortlink sekaligus, plus unduh QR Kustom (warna, bentuk sudut, logo tengah, PNG/SVG).',
      },
    ],
  },
  {
    id: 'bio',
    label: 'Link in Bio & Micro-Landing',
    subtitle: 'Kelola banyak halaman profil Bio tanpa batas dengan kontrol penuh.',
    features: [
      {
        title: 'Halaman Bio Tak Terbatas (+ Halaman Bio Baru)',
        desc: 'Buat dan kelola lebih dari satu halaman Link in Bio untuk berbagai brand, produk, atau kampanye. Beralih antar halaman lewat tombol daftar profil di bagian atas.',
      },
      {
        title: 'Edit Penuh /u/<handle>, @username, Foto & Background',
        desc: 'Ubah handle URL (/u/namaanda & @namaanda), ganti nama tampilan dan deskripsi, unggah foto profil (avatar) langsung dari perangkat atau tempel URL, serta pasang foto background lengkap dengan pengatur kontras overlay (Gelap/Terang).',
      },
      {
        title: 'Edit Inline & Urutan Tautan Bio',
        desc: 'Klik ikon pensil pada tiap item tautan bio untuk mengubah judul, URL, maupun badge promosi langsung di tempat, atur urutan naik/turun, atau sembunyikan sementara.',
      },
      {
        title: 'Template Micro-Landing & Custom Domain Bio',
        desc: 'Pilih 4 template siap pakai (Kartu Minimalis, Grid Kreator, Etalase Produk, Studio Monospace), 4 tema warna, serta hubungkan domain pribadi untuk profil Bio Anda.',
      },
    ],
  },
  {
    id: 'analytics',
    label: 'Analitik Real-time',
    subtitle: 'Pantau trafik klik, latensi cache <50ms, geografi, perangkat, dan sumber traffic.',
    features: [
      {
        title: 'Metrik Performa & Cache Hit Rate',
        desc: 'Lacak total klik, rata-rata latensi pengalihan cache Redis/in-memory (<50ms), serta filter analitik per slug spesifik atau seluruh tautan.',
      },
      {
        title: 'Sebaran Negara, Perangkat/OS & Sumber Referer',
        desc: 'Ketahui negara pengakses, perangkat (Mobile/Desktop/Tablet), sistem operasi (Android/iOS/Windows/macOS), referer (WhatsApp, Instagram, Direct/QR), dan log klik terbaru beserta varian A/B yang dipicu.',
      },
    ],
  },
  {
    id: 'settings',
    label: 'Pengaturan, Custom Domain, API & Tim',
    subtitle: 'Konfigurasi domain kustom CNAME/SSL, REST API, Webhook, Zapier, dan akses anggota.',
    features: [
      {
        title: 'Custom Domain (CNAME & Cloudflare for SaaS SSL)',
        desc: 'Tautkan domain/subdomain sendiri (misal go.brandanda.com). Domain yang DNS CNAME/A-nya mengarah ke server TautKilat otomatis meneruskan /<slug> & /s/<slug> langsung ke tujuan tanpa meminta pengunjung login.',
      },
      {
        title: 'REST API Keys (/api/v1/links) & Webhooks HMAC',
        desc: 'Terbitkan API Key untuk sistem ERP/CRM internal dan daftarkan endpoint Webhook bertanda tangan HMAC-SHA256 untuk event link.clicked dan link.created.',
      },
      {
        title: 'Integrasi Zapier & Make.com + Scanner Keamanan',
        desc: 'Otomatisasi pembuatan shortlink dari Google Sheets, Typeform, atau HubSpot lengkap dengan simulator uji coba serta status pemindai Phishing (Heuristik, Google Safe Browsing, VirusTotal).',
      },
      {
        title: 'Ganti Sandi, Sinkronisasi Cloud & Manajemen Anggota',
        desc: 'Perbarui kata sandi akun, hubungkan akun Google untuk sinkronisasi Cloud Firestore, dan khusus Super Admin dapat menambah atau menghapus anggota dashboard.',
      },
    ],
  },
  {
    id: 'blueprint',
    label: 'Blueprint Arsitektur & Skrip PHP',
    subtitle: 'Dokumentasi skema SQL, kode Node.js/Redis, serta modul enkripsi PHP InfinityFree.',
    features: [
      {
        title: 'Skema Database SQL & Arsitektur Rate-Limit/Redis',
        desc: 'Menyajikan DDL PostgreSQL/MySQL teroptimasi untuk tabel users, urls, dan analytics serta pola caching latensi <50ms dan rate limiting anti-bot.',
      },
      {
        title: 'Modul PHP 7.4/8.x & Sandbox Enkripsi AES-256-GCM',
        desc: 'Salin kode PHP siap jalan untuk hosting InfinityFree/cPanel (hashing password Bcrypt/Argon2id + enkripsi AES-256-GCM) dan uji coba langsung di Sandbox Interaktif.',
      },
    ],
  },
  {
    id: 'login',
    label: 'Halaman Masuk (Login)',
    subtitle: 'Gerbang otentikasi pengelola dashboard TautKilat.',
    features: [
      {
        title: 'Otentikasi Aman (Hash Teracak)',
        desc: 'Masuk menggunakan username dan kata sandi terenkripsi. Kredensial tidak ditampilkan secara terbuka di antarmuka demi keamanan.',
      },
      {
        title: 'Tautan Publik Tetap Terbuka Tanpa Login',
        desc: 'Pengunjung shortlink (/s/slug atau domainkustom.com/slug) serta halaman profil (/u/handle) tetap dapat mengakses tujuan langsung tanpa harus login ke halaman ini.',
      },
    ],
  },
  {
    id: 'public-redirect',
    label: 'Halaman Pengalihan & Gerbang Tautan',
    subtitle: 'Halaman publik saat shortlink atau QR Code dibuka pengunjung.',
    features: [
      {
        title: 'Pengalihan Otomatis & Pemeriksaan Keamanan',
        desc: 'Memverifikasi status aktif, batas kadaluarsa, kuota klik, serta melakukan penyaringan phishing/malware sebelum mengarahkan pengunjung langsung ke tujuan.',
      },
      {
        title: 'Gerbang Password, Interstitial 3 Detik & vCard',
        desc: 'Menampilkan form kata sandi jika tautan terkunci, hitung mundur 3 detik jika mode konfirmasi aktif, atau tombol unduh kontak .vcf untuk QR vCard.',
      },
    ],
  },
  {
    id: 'public-bio',
    label: 'Halaman Publik Link in Bio',
    subtitle: 'Micro-landing page yang tampil saat pengunjung membuka /u/<handle>.',
    features: [
      {
        title: 'Tampilan Profil Kustom & Pelacakan Klik',
        desc: 'Menampilkan foto profil, nama tampilan, @handle, foto background kustom, dan daftar tombol tautan sesuai template pilihan dengan pencatatan jumlah klik otomatis.',
      },
    ],
  },
];

interface FeatureHelpWidgetProps {
  currentContext: HelpPageContext;
}

export const FeatureHelpWidget: React.FC<FeatureHelpWidgetProps> = ({ currentContext }) => {
  const [open, setOpen] = useState(false);
  const [selectedGuideId, setSelectedGuideId] = useState<HelpPageContext>(currentContext);

  useEffect(() => {
    setSelectedGuideId(currentContext);
  }, [currentContext, open]);

  const currentGuide =
    PAGE_GUIDES.find((g) => g.id === selectedGuideId) || PAGE_GUIDES[0];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Panduan dan keterangan semua fitur halaman"
        title="Buka panduan fitur halaman ini & semua halaman"
        className="fixed bottom-5 left-5 z-50 w-11 h-11 rounded-full bg-blue-800 hover:bg-blue-900 text-white shadow-lg border border-blue-700 flex items-center justify-center transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800"
      >
        <HelpCircle className="w-5 h-5" aria-hidden="true" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="feature-help-modal-title"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white border border-slate-200 rounded-xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-xl overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <BookOpen className="w-4 h-4 text-blue-800 shrink-0" aria-hidden="true" />
                <div>
                  <h2 id="feature-help-modal-title" className="font-display text-base font-bold text-slate-900">
                    Keterangan Semua Fitur TautKilat
                  </h2>
                  <p className="text-xs text-slate-500">
                    Pilih halaman di bawah untuk melihat fungsi detail setiap menu dan tombol.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Tutup panduan fitur"
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <div className="px-6 py-3 border-b border-slate-200 bg-white flex flex-wrap gap-1.5">
              {PAGE_GUIDES.map((guide) => {
                const isActive = guide.id === selectedGuideId;
                const isHere = guide.id === currentContext;
                return (
                  <button
                    key={guide.id}
                    type="button"
                    onClick={() => setSelectedGuideId(guide.id)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                      isActive
                        ? 'bg-blue-800 text-white border-blue-800'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {guide.label}
                    {isHere ? ' (Halaman Ini)' : ''}
                  </button>
                );
              })}
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="font-display text-lg font-bold text-slate-900">{currentGuide.label}</h3>
                <p className="text-xs text-slate-600 mt-0.5">{currentGuide.subtitle}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {currentGuide.features.map((feat) => (
                  <div
                    key={feat.title}
                    className="p-4 bg-slate-50/80 border border-slate-200 rounded-lg space-y-1.5"
                  >
                    <h4 className="text-xs font-bold text-slate-900">{feat.title}</h4>
                    <p className="text-xs text-slate-600 leading-relaxed">{feat.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
              <span>Klik tanda (?) di pojok kiri bawah kapan saja untuk membuka panduan ini.</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-4 py-1.5 font-semibold text-white bg-blue-800 hover:bg-blue-900 rounded-lg whitespace-nowrap shrink-0"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
