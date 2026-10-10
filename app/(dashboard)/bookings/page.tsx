'use client';

/**
 * Bookings list.
 *
 * The detail page at bookings/[id] already existed but nothing linked to it and
 * it was absent from the sidebar, so bookings were unreachable in this panel —
 * the HTML admin was the only way to see them.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiRequest } from '@/lib/api';

interface Booking {
  id: string;
  trackingNumber?: string;
  status: string;
  paymentStatus?: string;
  paymentMethod?: string;
  fare?: number;
  serviceType?: string;
  createdAt?: any;
  pickup?: { address?: string; city?: string };
  drop?: { address?: string; city?: string };
  riderName?: string;
  riderId?: string;
  assignmentStatus?: string;
}

const STATUSES = [
  'All',
  'PendingPayment',
  'Created',
  'Picked',
  'Shipped',
  'Delivered',
  'DeliveryFailed',
  'ReturnInProgress',
  'Returned',
  'Cancelled',
];

const STATUS_STYLE: Record<string, string> = {
  Delivered: 'bg-emerald-100 text-emerald-700',
  Cancelled: 'bg-rose-100 text-rose-700',
  Returned: 'bg-rose-100 text-rose-700',
  DeliveryFailed: 'bg-rose-100 text-rose-700',
  ReturnInProgress: 'bg-amber-100 text-amber-700',
  PendingPayment: 'bg-amber-100 text-amber-700',
  Created: 'bg-sky-100 text-sky-700',
  Picked: 'bg-indigo-100 text-indigo-700',
  Shipped: 'bg-indigo-100 text-indigo-700',
};

const fmtDate = (v: any) => {
  if (!v) return '—';
  const d = new Date(typeof v === 'object' && v._seconds ? v._seconds * 1000 : v);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
};

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('All');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = status === 'All' ? '' : `?status=${encodeURIComponent(status)}`;
      const res = await apiRequest<{ bookings: Booking[] }>(`/bookings/admin/all${qs}`);
      setBookings(res.bookings || []);
    } catch (e: any) {
      setError(e.message || 'Could not load bookings');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  const q = search.trim().toLowerCase();
  const rows = q
    ? bookings.filter(
        (b) =>
          b.trackingNumber?.toLowerCase().includes(q) ||
          b.id.toLowerCase().includes(q) ||
          b.pickup?.city?.toLowerCase().includes(q) ||
          b.drop?.city?.toLowerCase().includes(q) ||
          b.riderName?.toLowerCase().includes(q)
      )
    : bookings;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Bookings</h1>
          <p className="text-sm text-slate-500">
            {loading ? 'Loading…' : `${rows.length} booking${rows.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <button
          onClick={load}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tracking no, city, rider…"
          className="min-w-[220px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Tracking</th>
              <th className="px-4 py-3">Route</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Rider</th>
              <th className="px-4 py-3">Fare</th>
              <th className="px-4 py-3">Payment</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                  No bookings found
                </td>
              </tr>
            ) : (
              rows.map((b) => (
                <tr key={b.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{b.trackingNumber || b.id}</div>
                    <div className="text-xs text-slate-400">{b.serviceType || 'hyperlocal'}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {(b.pickup?.city || '—') + ' → ' + (b.drop?.city || '—')}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${
                        STATUS_STYLE[b.status] || 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {b.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {b.riderName || (
                      <span className="text-amber-600">{b.assignmentStatus || 'unassigned'}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {b.fare != null ? `₹${b.fare}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {b.paymentMethod?.toUpperCase() || '—'}
                    <span className="ml-1 text-xs text-slate-400">{b.paymentStatus || ''}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{fmtDate(b.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/bookings/${b.id}`}
                      className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
