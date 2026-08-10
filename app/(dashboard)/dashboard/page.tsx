'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiRequest } from '@/lib/api';

interface Booking {
  id: string;
  trackingNumber?: string;
  status: string;
  paymentStatus?: string;
  paymentMethod?: string;
  fare?: number;
  createdAt: any;
  pickup?: { address?: string; city?: string };
  drop?: { address?: string; city?: string };
  userId?: string;
  serviceType?: string;
}

interface Stats {
  totalBookings: number;
  deliveredBookings: number;
  inTransitBookings: number;
  cancelledBookings: number;
  dailyRevenue: number;
  monthlyRevenue: number;
}

const STATUS_COLORS: Record<string, string> = {
  Created: 'bg-blue-100 text-blue-700',
  PendingPayment: 'bg-yellow-100 text-yellow-700',
  Assigned: 'bg-purple-100 text-purple-700',
  Picked: 'bg-indigo-100 text-indigo-700',
  Shipped: 'bg-cyan-100 text-cyan-700',
  Delivered: 'bg-green-100 text-green-700',
  Cancelled: 'bg-red-100 text-red-700',
  Returned: 'bg-orange-100 text-orange-700',
};

export default function DashboardPage() {
  const router = useRouter();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const PER_PAGE = 20;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [bRes, sRes] = await Promise.all([
        apiRequest<{ bookings: Booking[] }>('/bookings/admin/all'),
        apiRequest<Stats>('/bookings/admin/statistics').catch(() => null),
      ]);
      setBookings(bRes.bookings || (Array.isArray(bRes) ? bRes : []));
      if (sRes) setStats(sRes);
    } catch (e: any) {
      if (e.message?.includes('401')) router.replace('/login');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function cancelBooking(id: string) {
    if (!confirm('Cancel this booking?')) return;
    try {
      await apiRequest(`/bookings/admin/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason: 'Admin cancelled' }) });
      fetchData();
    } catch (e: any) { alert(e.message); }
  }

  const filtered = bookings.filter((b) => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      (b.trackingNumber || '').toLowerCase().includes(q) ||
      (b.pickup?.city || '').toLowerCase().includes(q) ||
      (b.drop?.city || '').toLowerCase().includes(q) ||
      b.id.toLowerCase().includes(q);
    const matchStatus = !statusFilter || b.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const statCards = [
    { label: 'Total Bookings', value: stats?.totalBookings ?? bookings.length, color: 'text-blue-600' },
    { label: 'In Transit', value: stats?.inTransitBookings ?? bookings.filter(b => ['Picked','Shipped','Assigned'].includes(b.status)).length, color: 'text-purple-600' },
    { label: 'Delivered', value: stats?.deliveredBookings ?? bookings.filter(b => b.status === 'Delivered').length, color: 'text-green-600' },
    { label: 'Cancelled', value: stats?.cancelledBookings ?? bookings.filter(b => b.status === 'Cancelled').length, color: 'text-red-600' },
    { label: "Today's Revenue", value: `₹${((stats?.dailyRevenue ?? 0) as number).toLocaleString('en-IN')}`, color: 'text-orange-600' },
    { label: 'Monthly Revenue', value: `₹${((stats?.monthlyRevenue ?? 0) as number).toLocaleString('en-IN')}`, color: 'text-indigo-600' },
  ];

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-slate-800 mb-6">Dashboard</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        {statCards.map((s) => (
          <div key={s.label} className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
            <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-slate-500 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 mb-4 flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search by tracking #, city..."
          className="flex-1 min-w-48 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <select
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
        >
          <option value="">All Statuses</option>
          {['Created','PendingPayment','Assigned','Picked','Shipped','Delivered','Cancelled','Returned'].map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <button onClick={fetchData} className="px-4 py-2 bg-orange-500 text-white text-sm font-semibold rounded-lg hover:bg-orange-600 transition">
          Refresh
        </button>
      </div>

      {/* Bookings table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-slate-400">Loading...</div>
        ) : paged.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-slate-400">No bookings found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  {['Tracking #', 'Route', 'Service', 'Status', 'Payment', 'Fare', 'Date', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {paged.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-slate-600 whitespace-nowrap">
                      {b.trackingNumber || b.id.slice(0, 8)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-medium text-slate-700">{b.pickup?.city || '—'}</span>
                      <span className="text-slate-400 mx-1">→</span>
                      <span className="font-medium text-slate-700">{b.drop?.city || '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-full capitalize">
                        {b.serviceType || 'intercity'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[b.status] || 'bg-gray-100 text-gray-600'}`}>
                        {b.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                        b.paymentStatus === 'paid' ? 'bg-green-100 text-green-700' :
                        b.paymentStatus === 'failed' ? 'bg-red-100 text-red-700' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                        {b.paymentStatus || 'pending'} · {b.paymentMethod || 'cod'}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-700">
                      {b.fare ? `₹${b.fare}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs">
                      {b.createdAt ? new Date(b.createdAt?._seconds ? b.createdAt._seconds * 1000 : b.createdAt).toLocaleDateString('en-IN') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => router.push(`/bookings/${b.id}`)}
                          className="text-xs px-2.5 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg font-medium transition"
                        >
                          View
                        </button>
                        {!['Delivered','Cancelled','Returned'].includes(b.status) && (
                          <button
                            onClick={() => cancelBooking(b.id)}
                            className="text-xs px-2.5 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg font-medium transition"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-sm text-slate-500">
            <span>{filtered.length} results · Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 transition">← Prev</button>
              <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 transition">Next →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
