'use client';

/**
 * Top-up queue — every partner's wallet credit request in one place.
 *
 * A partner with a pending request cannot place orders, so this is a queue with
 * a cost to leaving it alone. Pending is the default view for that reason.
 *
 * Approving credits the wallet in the same transaction that marks the request
 * approved, so two operators clicking at once cannot credit it twice — the
 * second gets told it was already handled.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiRequest } from '@/lib/api';

interface TopupRequest {
  id: string;
  merchantId: string;
  merchantName: string;
  amount: number;
  utr: string;
  status: 'pending' | 'approved' | 'rejected';
  reason?: string | null;
  createdAt: string | null;
  reviewedAt: string | null;
}

const inr = (n: number) =>
  `₹${Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const ist = (d?: string | null) =>
  !d
    ? '—'
    : new Date(d).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });

const BADGE: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

export default function PartnerTopupsPage() {
  const [requests, setRequests] = useState<TopupRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = filter === 'all' ? '' : `?status=${filter}`;
      const res = await apiRequest<{ requests: TopupRequest[] }>(
        `/admin/partners/topups${q}`
      );
      setRequests(res.requests || []);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  async function review(r: TopupRequest, action: 'approve' | 'reject') {
    let reason: string | null = null;
    if (action === 'reject') {
      reason = prompt(
        `Why is ${r.merchantName}'s ${inr(r.amount)} top-up being rejected? They will see this.`
      );
      if (!reason?.trim()) return;
    } else if (
      !confirm(
        `Approve ${inr(r.amount)} for ${r.merchantName}?\n\nUTR: ${r.utr}\n\nCheck this against the bank first — the wallet is credited immediately.`
      )
    ) {
      return;
    }

    setBusy(r.id);
    try {
      await apiRequest(`/admin/partners/topups/${r.id}/review`, {
        method: 'POST',
        body: JSON.stringify({ action, reason: reason ?? undefined }),
      });
      load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(null);
    }
  }

  const pendingValue = requests
    .filter((r) => r.status === 'pending')
    .reduce((s, r) => s + r.amount, 0);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Partner top-ups</h1>
          <div className="mt-1 text-sm text-slate-500">
            Wallet credit requests. Verify the UTR against the bank before approving.
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            href="/partners"
            className="px-4 py-2 bg-slate-100 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-200 transition"
          >
            All partners
          </Link>
          <button
            onClick={load}
            className="px-4 py-2 bg-slate-100 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-200 transition"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="flex gap-1 mb-4 bg-slate-100 rounded-xl p-1 w-fit">
        {(['pending', 'approved', 'rejected', 'all'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition ${
              filter === f ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {filter === 'pending' && pendingValue > 0 ? (
        <div className="mb-4 rounded-xl border border-orange-300 bg-orange-50 px-4 py-3 text-sm text-orange-700">
          <span className="font-bold">{inr(pendingValue)}</span> across{' '}
          {requests.filter((r) => r.status === 'pending').length} request(s) is waiting.
          Each of these partners is blocked from ordering until it clears.
        </div>
      ) : null}

      {loading ? (
        <div className="text-sm text-slate-500 py-10 text-center">Loading…</div>
      ) : requests.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 py-14 text-center">
          <div className="text-sm font-semibold text-slate-700">
            {filter === 'pending' ? 'Nothing waiting' : `No ${filter} requests`}
          </div>
          <div className="text-sm text-slate-500 mt-1">
            {filter === 'pending'
              ? 'Every top-up request has been dealt with.'
              : 'Try a different tab.'}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Partner</th>
                  <th className="text-left px-4 py-3 font-semibold">UTR</th>
                  <th className="text-left px-4 py-3 font-semibold">Requested</th>
                  <th className="text-right px-4 py-3 font-semibold">Amount</th>
                  <th className="text-left px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {requests.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/partners/${r.merchantId}`}
                        className="font-semibold text-orange-600 hover:underline"
                      >
                        {r.merchantName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{r.utr}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                      {ist(r.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-slate-800 tabular-nums">
                      {inr(r.amount)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-semibold ${BADGE[r.status]}`}
                      >
                        {r.status}
                      </span>
                      {r.reason ? (
                        <div className="text-xs text-slate-400 mt-1 max-w-[200px]">
                          {r.reason}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {r.status === 'pending' ? (
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => review(r, 'approve')}
                            disabled={busy === r.id}
                            className="px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => review(r, 'reject')}
                            disabled={busy === r.id}
                            className="px-3 py-1.5 bg-white border border-red-200 text-red-600 text-xs font-semibold rounded-lg hover:bg-red-50 disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">{ist(r.reviewedAt)}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
