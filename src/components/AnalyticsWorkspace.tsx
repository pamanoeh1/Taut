import React from 'react';
import { RefreshCw } from 'lucide-react';
import type { AnalyticsSummary, ShortLinkItem } from '../types/shortlink';

interface AnalyticsWorkspaceProps {
  summary: AnalyticsSummary | null;
  links: ShortLinkItem[];
  selectedSlug: string;
  loading: boolean;
  onSelectSlug: (slug: string) => void;
  onRefresh: () => void;
}

export const AnalyticsWorkspace: React.FC<AnalyticsWorkspaceProps> = ({
  summary,
  links,
  selectedSlug,
  loading,
  onSelectSlug,
  onRefresh,
}) => {
  const maxDaily = summary
    ? Math.max(1, ...summary.dailySeries.map((d) => d.clicks))
    : 1;

  const renderBreakdown = (title: string, rows: Array<{ name: string; count: number }>) => {
    const total = rows.reduce((s, r) => s + r.count, 0) || 1;
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h3 className="font-display text-sm font-bold text-slate-900 mb-4">{title}</h3>
        {rows.length === 0 ? (
          <p className="text-xs text-slate-500">Belum ada data klik tercatat.</p>
        ) : (
          <div className="space-y-3">
            {rows.slice(0, 5).map((item) => {
              const pct = Math.round((item.count / total) * 100);
              return (
                <div key={item.name} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-700 truncate pr-2">{item.name}</span>
                    <span className="font-mono text-slate-600 tabular-nums shrink-0">
                      {item.count} ({pct}%)
                    </span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-800 rounded-full"
                      style={{ width: `${Math.max(4, pct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Analitik Traffic Real-time</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Pelacakan klik berdasarkan negara, perangkat, sistem operasi, referer, dan performa cache pengalihan.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <select
            aria-label="Filter analitik berdasarkan slug"
            value={selectedSlug}
            onChange={(e) => onSelectSlug(e.target.value)}
            className="px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-blue-800"
          >
            <option value="all">Semua Tautan</option>
            {links.map((l) => (
              <option key={l.slug} value={l.slug}>
                /s/{l.slug} ({l.clickCount} klik)
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            aria-label="Muat ulang data analitik"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>Segarkan</span>
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="bg-white border border-slate-200 rounded-xl grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
        <div className="p-5">
          <div className="text-xs font-medium text-slate-500">Total Klik Tercatat</div>
          <div className="mt-1 font-display text-2xl font-bold text-slate-900 tabular-nums">
            {(summary?.totalClicks ?? 0).toLocaleString('id-ID')}
          </div>
          <div className="mt-1 text-xs text-slate-500">Akumulasi seluruh pengalihan</div>
        </div>
        <div className="p-5">
          <div className="text-xs font-medium text-slate-500">Tautan Aktif</div>
          <div className="mt-1 font-display text-2xl font-bold text-slate-900 tabular-nums">
            {summary?.activeLinks ?? 0}
          </div>
          <div className="mt-1 text-xs text-slate-500">Siap mengalihkan traffic</div>
        </div>
        <div className="p-5">
          <div className="text-xs font-medium text-slate-500">Latensi Rata-rata</div>
          <div className="mt-1 font-display text-2xl font-bold text-emerald-700 tabular-nums font-mono">
            {summary?.avgCacheLatencyMs ?? 0} ms
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">
            Rasio Cache Hit {summary?.cacheHitRate ?? 100}% (&lt;50ms)
          </div>
        </div>
        <div className="p-5">
          <div className="text-xs font-medium text-slate-500">Tautan Terproteksi</div>
          <div className="mt-1 font-display text-2xl font-bold text-slate-900 tabular-nums">
            {summary?.protectedLinks ?? 0}
          </div>
          <div className="mt-1 text-xs text-slate-500">Password / Tanggal Kadaluarsa</div>
        </div>
      </div>

      {/* 7-Day Traffic Bar Chart */}
      <section aria-labelledby="daily-trend-heading" className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 id="daily-trend-heading" className="font-display text-base font-bold text-slate-900">
            Tren Klik 7 Hari Terakhir
          </h2>
          <span className="text-xs text-slate-500 font-mono">Harian</span>
        </div>

        <div className="h-44 flex items-end gap-3 pt-4">
          {(summary?.dailySeries || []).map((day) => {
            const heightPct = Math.max(6, Math.round((day.clicks / maxDaily) * 100));
            return (
              <div key={day.date} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                <span className="text-xs font-mono text-slate-600 tabular-nums">{day.clicks}</span>
                <div className="w-full max-w-[44px] bg-slate-100 rounded-t-md h-28 flex items-end overflow-hidden">
                  <div
                    className="w-full bg-blue-800 rounded-t-md transition-all"
                    style={{ height: `${heightPct}%` }}
                    title={`${day.date}: ${day.clicks} klik`}
                  />
                </div>
                <span className="text-[11px] font-mono text-slate-500 tabular-nums">
                  {day.date.slice(5)}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Breakdowns */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {renderBreakdown('Negara Pengakses', summary?.byCountry || [])}
        {renderBreakdown('Perangkat', summary?.byDevice || [])}
        {renderBreakdown('Sistem Operasi', summary?.byOs || [])}
        {renderBreakdown('Sumber Traffic (Referer)', summary?.byReferer || [])}
      </div>

      {/* Recent Click Log Table */}
      <section aria-labelledby="recent-clicks-heading" className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 id="recent-clicks-heading" className="font-display text-base font-bold text-slate-900">
            Log Akses Pengunjung Terbaru
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                <th className="py-2.5 px-4">Waktu</th>
                <th className="py-2.5 px-4">Slug</th>
                <th className="py-2.5 px-4">Lokasi</th>
                <th className="py-2.5 px-4">Perangkat / OS</th>
                <th className="py-2.5 px-4">Referer</th>
                <th className="py-2.5 px-4 text-right">Latensi Cache</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
              {(summary?.recentClicks || []).length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    Belum ada klik tercatat untuk filter ini.
                  </td>
                </tr>
              ) : (
                (summary?.recentClicks || []).map((click) => (
                  <tr key={click.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-4 font-mono tabular-nums whitespace-nowrap text-slate-500">
                      {new Date(click.createdAt).toLocaleString('id-ID', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-2.5 px-4 font-mono font-medium text-blue-800 whitespace-nowrap">
                      /s/{click.slug}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      {click.city}, {click.country}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      {click.device} · {click.os} ({click.browser})
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">{click.referer}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                      <span className={click.cacheHit ? 'text-emerald-700' : 'text-amber-700'}>
                        {click.cacheHit ? 'HIT' : 'MISS'} · {click.latencyMs} ms
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
