import React, { useState } from 'react';
import { Check, Copy, Download, KeyRound, Shield } from 'lucide-react';
import { ARCHITECTURE_BLUEPRINTS, type BlueprintTab } from '../data/blueprints';
import { apiRunCryptoSandbox } from '../services/shortlinkStore';

export const BlueprintWorkspace: React.FC = () => {
  const [activeId, setActiveId] = useState<BlueprintTab['id']>('sql');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Interactive Crypto Sandbox (simulates PHP security_helper.php functions live via Node crypto)
  const [plainPassword, setPlainPassword] = useState('RahasiaToko2026!');
  const [hashedOutput, setHashedOutput] = useState('');
  const [secretText, setSecretText] = useState('API_KEY_RAHASIA_9821_ID');
  const [secretKey, setSecretKey] = useState('KunciRahasiaInfinityFree2026');
  const [encryptedOutput, setEncryptedOutput] = useState('');
  const [decryptedOutput, setDecryptedOutput] = useState('');
  const [sandboxError, setSandboxError] = useState<string | null>(null);

  const current = ARCHITECTURE_BLUEPRINTS.find((b) => b.id === activeId) || ARCHITECTURE_BLUEPRINTS[0];

  const handleCopy = async () => {
    await navigator.clipboard.writeText(current.code);
    setCopiedId(current.id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const handleDownload = () => {
    const blob = new Blob([current.code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = current.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const runHashTest = async () => {
    setSandboxError(null);
    try {
      const data = await apiRunCryptoSandbox({ action: 'hash_password', password: plainPassword });
      setHashedOutput(data.hash || '');
    } catch (err) {
      setSandboxError(err instanceof Error ? err.message : 'Gagal menjalankan hash password.');
    }
  };

  const runEncryptDecryptTest = async () => {
    setSandboxError(null);
    try {
      const encData = await apiRunCryptoSandbox({ action: 'encrypt', text: secretText, secretKey });
      const encrypted = encData.encrypted || '';
      setEncryptedOutput(encrypted);
      const decData = await apiRunCryptoSandbox({ action: 'decrypt', cipherPayload: encrypted, secretKey });
      setDecryptedOutput(decData.decrypted || '');
    } catch (err) {
      setSandboxError(err instanceof Error ? err.message : 'Gagal menjalankan enkripsi AES-256-CBC.');
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">
          Blueprint Arsitektur &amp; Skrip Keamanan PHP InfinityFree
        </h1>
        <p className="text-sm text-slate-600 mt-1 max-w-3xl">
          Kode siap eksekusi untuk skema database PostgreSQL, REST API Node.js Express, Redis Cache &lt;50ms dengan
          Rate Limiting &amp; UA/IP Parser, serta file tunggal <code className="font-mono text-slate-800">security_helper.php</code> untuk cPanel InfinityFree.
        </p>
        <div className="mt-3 p-3.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-950 max-w-3xl">
          <strong>Panduan Deploy InfinityFree (<code className="font-mono">htdocs/</code>):</strong> Saat menjalankan{' '}
          <code className="font-mono">npm run build</code>, folder <code className="font-mono">dist/</code> otomatis menyertakan{' '}
          <code className="font-mono">dist/api/index.php</code> (PHP 7.4/8.x) dan <code className="font-mono">dist/.htaccess</code>{' '}
          agar login dan penyimpanan server PHP langsung berjalan di InfinityFree tanpa Node.js.
        </div>
      </div>

      {/* Blueprint Tabs */}
      <div className="flex flex-wrap gap-2">
        {ARCHITECTURE_BLUEPRINTS.map((bp) => {
          const shortTabLabel: Record<BlueprintTab['id'], string> = {
            sql: '01. Skema SQL PostgreSQL',
            express: '02. REST API Express',
            redis: '03. Redis Cache & Rate Limit',
            php: '04. PHP InfinityFree (AES-256 & Bcrypt)',
          };
          return (
            <button
              key={bp.id}
              type="button"
              onClick={() => setActiveId(bp.id)}
              className={`px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                activeId === bp.id
                  ? 'border-blue-800 bg-blue-800 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
              }`}
            >
              {shortTabLabel[bp.id]}
            </button>
          );
        })}
      </div>

      {/* Code Viewer Card */}
      <section aria-labelledby="bp-title" className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-6 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2 max-w-3xl">
            <h2 id="bp-title" className="font-display text-lg font-bold text-slate-900">
              {current.title} — <span className="font-mono text-blue-800">{current.filename}</span>
            </h2>
            <p className="text-sm text-slate-600">{current.summary}</p>
            <ul className="space-y-1 pt-1">
              {current.highlights.map((h) => (
                <li key={h} className="text-xs text-slate-600 flex items-start gap-2">
                  <span className="text-blue-800 font-bold" aria-hidden="true">·</span>
                  <span>{h}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              {copiedId === current.id ? (
                <Check className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
              ) : (
                <Copy className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              <span>{copiedId === current.id ? 'Kode Disalin' : 'Salin Kode'}</span>
            </button>

            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-800 hover:bg-blue-900 rounded-lg transition-colors"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Unduh {current.filename}</span>
            </button>
          </div>
        </div>

        <div className="bg-slate-900 text-slate-100 p-5 overflow-x-auto max-h-[540px]">
          <pre className="font-mono text-xs leading-relaxed">
            <code>{current.code}</code>
          </pre>
        </div>
      </section>

      {/* Live Sandbox Tester */}
      <section aria-labelledby="sandbox-heading" className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div>
          <h2 id="sandbox-heading" className="font-display text-lg font-bold text-slate-900">
            Simulator Uji Keamanan (Password Hash &amp; AES-256-CBC)
          </h2>
          <p className="text-xs text-slate-600 mt-1">
            Uji langsung alur hashing kata sandi dan penyamaran data AES-256-CBC + HMAC-SHA256 sebelum mengunggah{' '}
            <code className="font-mono">security_helper.php</code> ke InfinityFree.
          </p>
        </div>

        {sandboxError && (
          <div role="alert" className="px-4 py-2.5 text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg">
            {sandboxError}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2 border-t border-slate-100">
          <div className="space-y-3">
            <label htmlFor="sandbox-password" className="block text-xs font-semibold text-slate-700">
              1. Uji Hashing Kata Sandi (Salt Kriptografis Acak)
            </label>
            <div className="flex gap-2">
              <input
                id="sandbox-password"
                type="text"
                value={plainPassword}
                onChange={(e) => setPlainPassword(e.target.value)}
                className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-800"
              />
              <button
                type="button"
                onClick={runHashTest}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-800 hover:bg-blue-900 rounded-lg whitespace-nowrap shrink-0"
              >
                <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Hash Sandi</span>
              </button>
            </div>
            {hashedOutput && (
              <div className="p-3 bg-slate-900 text-emerald-300 font-mono text-xs rounded-lg break-all">
                {hashedOutput}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <label htmlFor="sandbox-secret-text" className="block text-xs font-semibold text-slate-700">
              2. Uji Enkripsi &amp; Dekripsi AES-256-CBC + HMAC-SHA256
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                id="sandbox-secret-text"
                type="text"
                value={secretText}
                onChange={(e) => setSecretText(e.target.value)}
                placeholder="Data rahasia"
                className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-800"
              />
              <input
                type="text"
                aria-label="Kunci Master AES-256"
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                placeholder="Kunci rahasia"
                className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-800"
              />
            </div>
            <button
              type="button"
              onClick={runEncryptDecryptTest}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
            >
              <Shield className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Jalankan Enkripsi &amp; Dekripsi AES-256-CBC</span>
            </button>
            {encryptedOutput && (
              <div className="space-y-2">
                <div className="p-3 bg-slate-900 text-slate-200 font-mono text-xs rounded-lg break-all">
                  <span className="text-slate-400">Ciphertext: </span>
                  {encryptedOutput}
                </div>
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 font-mono text-xs rounded-lg break-all">
                  <span className="font-semibold">Dekripsi: </span>
                  {decryptedOutput}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
