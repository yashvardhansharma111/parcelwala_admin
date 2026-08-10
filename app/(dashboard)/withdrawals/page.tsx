'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiRequest } from '@/lib/api';

interface WithdrawalRequest {
  id: string; riderId: string; riderName?: string;
  amount: number; status: string; createdAt: string; utrRef?: string;
}

type StatusFilter = 'all' | 'pending' | 'approved' | 'paid' | 'rejected';

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-blue-100 text-blue-700',
  paid: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

export default function WithdrawalsPage() {
  const [requests, setRequests] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>('all');

  // Process modal
  const [processModal, setProcessModal] = useState<WithdrawalRequest | null>(null);
  const [utrRef, setUtrRef] = useState('');
  const [processing, setProcessing] = useState(false);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ requests: WithdrawalRequest[] }>('/bookings/admin/withdrawals');
      setRequests(res.requests || (Array.isArray(res) ? res : []));
    } catch (e: any) { alert(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  async function processRequest(action: 'approve' | 'reject' | 'paid') {
    if (!processModal) return;
    if (action === 'paid' && !utrRef.trim()) { alert('UTR reference is required for marking as paid'); return; }
    setProcessing(true);
    try {
      await apiRequest(`/bookings/admin/withdrawals/${processModal.id}/process`, {
        method: 'POST',
        body: JSON.stringify({ action, utrRef: action === 'paid' ? utrRef.trim() : undefined }),
      });
      setProcessModal(null); setUtrRef('');
      fetchRequests();
    } catch (e: any) { alert(e.message); }
    finally { setProcessing(false); }
  }

  const filtered = requests.filter(r => filter === 'all' || r.status === filter);
  const pendingCount = requests.filter(r => r.status === 'pending').length;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Withdrawals</h1>
          {pendingCount > 0 && (
            <div className="mt-1 text-sm text-orange-600 font-medium">
              {pendingCount} pending request{pendingCount > 1 ? 's' : ''} need attention
            </div>
          )}
        </div>
        <button onClick={fetchRequests} className="px-4 py-2 bg-slate-100 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-200 transition">
          Refresh
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4 bg-slate-100 rounded-xl p-1 w-fit">
        {(['all', 'pending', 'approved', 'paid', 'rejected'] as StatusFilter[]).map((f) => {
          const count = f === 'all' ? requests.length : requests.filter(r => r.status === f).length;
          return (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${filter === f ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
              {f.charAt(0).toUpperCase() + f.slice(1)} ({count})
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-slate-400">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-slate-400">No withdrawal requests</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  {['Rider', 'Amount', 'Status', 'UTR Ref', 'Requested', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800">{r.riderName || r.riderId}</td>
                    <td className="px-4 py-3 font-bold text-slate-800">₹{r.amount.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_COLORS[r.status] || 'bg-gray-100 text-gray-600'}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{r.utrRef || '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-IN') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {['pending', 'approved'].includes(r.status) ? (
                        <button onClick={() => setProcessModal(r)}
                          className="text-xs px-3 py-1.5 bg-orange-50 text-orange-600 rounded-lg hover:bg-orange-100 transition font-medium">
                          Process
                        </button>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Process Modal */}
      {processModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800">Process Withdrawal</h3>
              <button onClick={() => setProcessModal(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>

            <div className="bg-slate-50 rounded-lg p-3 mb-4 text-sm">
              <div className="text-slate-600">Rider: <span className="font-semibold text-slate-800">{processModal.riderName || processModal.riderId}</span></div>
              <div className="text-slate-600 mt-1">Amount: <span className="font-bold text-slate-800 text-base">₹{processModal.amount}</span></div>
              <div className="text-slate-600 mt-1">Current: <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[processModal.status]}`}>{processModal.status}</span></div>
            </div>

            {processModal.status === 'approved' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-1">UTR Reference (required to mark paid)</label>
                <input
                  type="text"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                  value={utrRef} onChange={(e) => setUtrRef(e.target.value)}
                  placeholder="UTR123456789"
                />
              </div>
            )}

            <div className="flex gap-2 flex-wrap">
              {processModal.status === 'pending' && (
                <>
                  <button onClick={() => processRequest('approve')} disabled={processing}
                    className="flex-1 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 disabled:opacity-50 transition">
                    {processing ? '...' : 'Approve'}
                  </button>
                  <button onClick={() => processRequest('reject')} disabled={processing}
                    className="flex-1 py-2 bg-red-500 text-white text-sm font-medium rounded-lg hover:bg-red-600 disabled:opacity-50 transition">
                    {processing ? '...' : 'Reject'}
                  </button>
                </>
              )}
              {processModal.status === 'approved' && (
                <button onClick={() => processRequest('paid')} disabled={processing}
                  className="flex-1 py-2 bg-green-500 text-white text-sm font-medium rounded-lg hover:bg-green-600 disabled:opacity-50 transition">
                  {processing ? '...' : 'Mark as Paid'}
                </button>
              )}
              <button onClick={() => setProcessModal(null)} className="py-2 px-4 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
