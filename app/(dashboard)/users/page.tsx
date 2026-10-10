'use client';

/**
 * Customers.
 *
 * Riders and admins are filtered out server-side — this screen is about the
 * people who book parcels, and rider management has its own page.
 */

import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api';

interface User {
  id: string;
  name: string;
  phoneNumber: string;
  email?: string;
  city?: string;
  hasPushToken: boolean;
  totalBookings: number;
  isBlocked: boolean;
  createdAt?: string | null;
  lastActiveAt?: string | null;
}

const fmtDate = (v: any) => {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN', { dateStyle: 'medium' });
};

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [pushEnabled, setPushEnabled] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [blockModal, setBlockModal] = useState<User | null>(null);
  const [blockReason, setBlockReason] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{ users: User[]; pushEnabled: number }>('/admin/users');
      setUsers(res.users || []);
      setPushEnabled(res.pushEnabled || 0);
    } catch (e: any) {
      setError(e.message || 'Could not load customers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleBlock = async (user: User, blocked: boolean, reason: string) => {
    setSaving(true);
    try {
      await apiRequest(`/admin/users/${user.id}/block`, {
        method: 'POST',
        body: JSON.stringify({ blocked, reason }),
      });
      setBlockModal(null);
      setBlockReason('');
      await load();
    } catch (e: any) {
      alert(e.message || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const exportCsv = () => {
    const header = ['Name', 'Phone', 'Email', 'City', 'Bookings', 'Push', 'Blocked', 'Joined'];
    const lines = rows.map((u) =>
      [
        u.name,
        u.phoneNumber,
        u.email || '',
        u.city || '',
        u.totalBookings,
        u.hasPushToken ? 'yes' : 'no',
        u.isBlocked ? 'yes' : 'no',
        fmtDate(u.createdAt),
      ]
        // Quote everything: names and addresses routinely contain commas.
        .map((f) => `"${String(f).replace(/"/g, '""')}"`)
        .join(',')
    );
    const blob = new Blob([[header.join(','), ...lines].join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `parcelwalah-customers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const q = search.trim().toLowerCase();
  const rows = q
    ? users.filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          u.phoneNumber.includes(q) ||
          (u.email || '').toLowerCase().includes(q) ||
          (u.city || '').toLowerCase().includes(q)
      )
    : users;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Customers</h1>
          <p className="text-sm text-slate-500">
            {loading ? 'Loading…' : `${rows.length} customer${rows.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportCsv}
            disabled={rows.length === 0}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Export CSV
          </button>
          <button
            onClick={load}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Total', value: users.length },
          { label: 'Push enabled', value: pushEnabled },
          { label: 'Blocked', value: users.filter((u) => u.isBlocked).length },
          { label: 'Never ordered', value: users.filter((u) => !u.totalBookings).length },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">{s.label}</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">{s.value}</div>
          </div>
        ))}
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search name, phone, email, city…"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">City</th>
              <th className="px-4 py-3">Bookings</th>
              <th className="px-4 py-3">Push</th>
              <th className="px-4 py-3">Joined</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                  No customers found
                </td>
              </tr>
            ) : (
              rows.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{u.name || 'Unnamed'}</div>
                    {u.email && <div className="text-xs text-slate-400">{u.email}</div>}
                    {u.isBlocked && (
                      <span className="mt-1 inline-block rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">
                        Blocked
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{u.phoneNumber}</td>
                  <td className="px-4 py-3 text-slate-600">{u.city || '—'}</td>
                  <td className="px-4 py-3 text-slate-900">{u.totalBookings}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${
                        u.hasPushToken
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {u.hasPushToken ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{fmtDate(u.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    {u.isBlocked ? (
                      <button
                        onClick={() => toggleBlock(u, false, '')}
                        disabled={saving}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Unblock
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          setBlockModal(u);
                          setBlockReason('');
                        }}
                        className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                      >
                        Block
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {blockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5">
            <h2 className="text-lg font-semibold text-slate-900">
              Block {blockModal.name || blockModal.phoneNumber}?
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              They will not be able to place new bookings.
            </p>
            <textarea
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
              rows={3}
              placeholder="Reason (required)"
              className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setBlockModal(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={() => toggleBlock(blockModal, true, blockReason.trim())}
                disabled={saving || !blockReason.trim()}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving ? 'Blocking…' : 'Block'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
