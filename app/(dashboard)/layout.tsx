'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { getToken, getStoredUser, clearAuth } from '@/lib/api';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: '⬡' },
  // Bookings had a detail page but no list and no link, so it was unreachable.
  { href: '/bookings', label: 'Bookings', icon: '📦' },
  { href: '/users', label: 'Customers', icon: '👥' },
  { href: '/riders', label: 'Riders', icon: '🏍' },
  { href: '/kyc', label: 'KYC review', icon: '🪪' },
  { href: '/cities', label: 'Cities', icon: '🏙' },
  { href: '/zones', label: 'Zones', icon: '🗺' },
  // Portal partners. Top-ups and rate cards are reachable from this page too,
  // but they are queues an operator checks on their own schedule, so they get
  // their own entries rather than being buried a click deep.
  { href: '/partners', label: 'Partners', icon: '🏪' },
  { href: '/partner-topups', label: 'Partner top-ups', icon: '💰' },
  { href: '/rate-cards', label: 'Rate cards', icon: '🧾' },
  { href: '/analytics', label: 'Analytics', icon: '📊' },
  { href: '/withdrawals', label: 'Withdrawals', icon: '💸' },
  // Shop takings captains are carrying. Their wallet is down by this much
  // until they deposit, so it is a queue with a cost to ignoring it.
  { href: '/cod-deposits', label: 'Cash deposits', icon: '💵' },
  { href: '/coupons', label: 'Coupons', icon: '🏷' },
  { href: '/notifications', label: 'Notifications', icon: '🔔' },
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
    <aside className="flex h-full w-60 shrink-0 flex-col overflow-hidden bg-slate-900 text-white">
      <div className="px-5 py-5 border-b border-slate-700">
        <div className="flex items-center gap-2.5">
          <img src="/logo-parcelwalah.png" alt="Parcelwalah" className="h-9 w-9 shrink-0" />
          <div>
            <div className="font-display text-lg font-bold leading-none tracking-tight text-white">PARCELWALAH</div>
            <div className="text-xs text-slate-400 mt-1">Admin Panel</div>
          </div>
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
        {NAV.map((item) => {
          const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active ? 'bg-gradient-to-r from-orange-500 to-orange-400 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
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
      <div className="hidden shrink-0 md:flex">{Sidebar}</div>

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
          <img src="/logo-parcelwalah.png" alt="Parcelwalah" className="h-7 w-7" />
          <span className="font-display font-bold text-orange-500">PARCELWALAH</span>
        </div>
        <main className="flex-1 overflow-y-auto bg-slate-50">
          {children}
        </main>
      </div>
    </div>
  );
}
