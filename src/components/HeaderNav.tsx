import React from 'react';
import { LogOut } from 'lucide-react';

export type WorkspaceTab = 'shortener' | 'analytics' | 'bio' | 'blueprint' | 'settings';

interface HeaderNavProps {
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
  sessionUsername: string;
  onLogout: () => void;
}

const NAV_ITEMS: Array<{ id: WorkspaceTab; label: string }> = [
  { id: 'shortener', label: 'Pemotong Link' },
  { id: 'analytics', label: 'Analitik' },
  { id: 'bio', label: 'Link in Bio' },
  { id: 'blueprint', label: 'Blueprint & PHP' },
  { id: 'settings', label: 'Pengaturan' },
];

export const HeaderNav: React.FC<HeaderNavProps> = ({
  activeTab,
  onSelectTab,
  sessionUsername,
  onLogout,
}) => {
  return (
    <header className="bg-white border-b border-slate-200">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single clean wordmark */}
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            onSelectTab('shortener');
          }}
          className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800 rounded"
        >
          TautKilat
        </a>

        {/* Zone 2: 5 single-line text navigation links */}
        <nav aria-label="Navigasi utama" className="hidden md:flex items-center gap-6">
          {NAV_ITEMS.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`py-1 text-sm font-medium transition-colors whitespace-nowrap shrink-0 border-b-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800 ${
                  active
                    ? 'border-blue-800 text-slate-900'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: 1 primary action (Logout) */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onLogout}
            aria-label={`Keluar dari akun ${sessionUsername}`}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800"
          >
            <span className="max-w-[120px] truncate font-mono">{sessionUsername}</span>
            <LogOut className="w-3.5 h-3.5 text-slate-600" aria-hidden="true" />
            <span>Keluar</span>
          </button>
        </div>
      </div>

      {/* Mobile secondary nav row */}
      <nav
        aria-label="Navigasi seluler"
        className="md:hidden border-t border-slate-100 px-4 py-2 flex items-center gap-4 overflow-x-auto"
      >
        {NAV_ITEMS.map((item) => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              aria-current={active ? 'page' : undefined}
              className={`py-1.5 text-xs font-medium whitespace-nowrap shrink-0 border-b-2 ${
                active
                  ? 'border-blue-800 text-slate-900'
                  : 'border-transparent text-slate-600'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
};
