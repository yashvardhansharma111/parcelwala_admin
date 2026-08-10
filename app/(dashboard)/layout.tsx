'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { getToken, getStoredUser, clearAuth } from '@/lib/api';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: '⬡' },
  { href: '/riders', label: 'Riders', icon: '🏍' },
  { href: '/analytics', label: 'Analytics', icon: '📊' },
  { href: '/withdrawals', label: 'Withdrawals', icon: '💸' },
  { href: '/settings', label: 'Settings', icon: '⚙' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<{ name?: string; phoneNumber: string } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    setUser(getStoredUser());
  }, [router]);

  function logout() {
    clearAuth();
    router.replace('/login');
  }

  if (!user) return null;

  const Sidebar = (
    <aside className="flex flex-col w-60 bg-slate-900 text-white min-h-full">
      <div className="px-5 py-5 border-b border-slate-700">
        <div className="text-lg font-black text-orange-400 tracking-tight">PARCELWALAH</div>
        <div className="text-xs text-slate-400 mt-0.5">Admin Panel</div>
      </div>

      <nav className="flex-1 py-4 px-3 space-y-0.5">
        {NAV.map((item) => {
          const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active ? 'bg-orange-500 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <span className="text-base leading-none">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-4 py-4 border-t border-slate-700">
        <div className="text-xs text-slate-400 mb-1 truncate">{user.name || user.phoneNumber}</div>
        <button
          onClick={logout}
          className="text-xs text-slate-400 hover:text-red-400 transition-colors"
        >
          Logout →
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden md:flex">{Sidebar}</div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="flex">{Sidebar}</div>
          <div className="flex-1 bg-black/50" onClick={() => setSidebarOpen(false)} />
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-200">
          <button onClick={() => setSidebarOpen(true)} className="text-slate-600 text-xl">☰</button>
          <span className="font-bold text-orange-500">PARCELWALAH</span>
        </div>
        <main className="flex-1 overflow-y-auto bg-slate-50">
          {children}
        </main>
      </div>
    </div>
  );
}
