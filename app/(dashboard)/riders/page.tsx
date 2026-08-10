'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiRequest } from '@/lib/api';

interface Rider {
  userId: string;
  id?: string;
  name: string;
  phone: string;
  phoneNumber?: string;
  isActive: boolean;
  isOnline?: boolean;
  city?: string;
  vehicleType?: string;
  vehicleNumber?: string;
  kycStatus?: string;
  isSuspended?: boolean;
}

export default function RidersPage() {
  const [riders, setRiders] = useState<Rider[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Create modal
  const [createModal, setCreateModal] = useState(false);
  const [newRider, setNewRider] = useState({ name: '', phoneNumber: '', city: '' });
  const [creating, setCreating] = useState(false);

  // KYC modal
  const [kycModal, setKycModal] = useState<Rider | null>(null);
  const [kycAction, setKycAction] = useState<'approved' | 'rejected'>('approved');
  const [kycReason, setKycReason] = useState('');
  const [savingKyc, setSavingKyc] = useState(false);

  // Suspend modal
  const [suspendModal, setSuspendModal] = useState<Rider | null>(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [suspending, setSuspending] = useState(false);

  // Bonus modal
  const [bonusModal, setBonusModal] = useState<Rider | null>(null);
  const [bonusAmount, setBonusAmount] = useState('');
  const [bonusNote, setBonusNote] = useState('');
  const [sendingBonus, setSendingBonus] = useState(false);

  const fetchRiders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ riders: Rider[] }>('/admin/riders');
      setRiders(res.riders || (Array.isArray(res) ? res : []));
    } catch (e: any) { alert(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchRiders(); }, [fetchRiders]);

  async function toggleActive(rider: Rider) {
    try {
      const rid = rider.userId || rider.id!;
      await apiRequest(`/admin/riders/${rid}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !rider.isActive }),
      });
      fetchRiders();
    } catch (e: any) { alert(e.message); }
  }

  async function createRider() {
    if (!newRider.name || !newRider.phoneNumber) return;
    setCreating(true);
    try {
      const num = newRider.phoneNumber.trim().replace(/\D/g, '');
      const formatted = num.length === 10 ? `+91${num}` : `+${num}`;
      await apiRequest('/admin/riders', {
        method: 'POST',
        body: JSON.stringify({ name: newRider.name, phoneNumber: formatted, city: newRider.city }),
      });
      setCreateModal(false);
      setNewRider({ name: '', phoneNumber: '', city: '' });
      fetchRiders();
    } catch (e: any) { alert(e.message); }
    finally { setCreating(false); }
  }

  async function reviewKyc() {
    if (!kycModal) return;
    setSavingKyc(true);
    try {
      const rid = kycModal.userId || kycModal.id!;
      await apiRequest(`/admin/riders/${rid}/kyc-review`, {
        method: 'POST',
        body: JSON.stringify({ action: kycAction, rejectionReason: kycAction === 'rejected' ? kycReason : undefined }),
      });
      setKycModal(null); setKycReason('');
      fetchRiders();
    } catch (e: any) { alert(e.message); }
    finally { setSavingKyc(false); }
  }

  async function toggleSuspend() {
    if (!suspendModal) return;
    setSuspending(true);
    try {
      const rid = suspendModal.userId || suspendModal.id!;
      const willSuspend = !suspendModal.isSuspended;
      await apiRequest(`/admin/riders/${rid}/suspend`, {
        method: 'POST',
        body: JSON.stringify({ suspended: willSuspend, reason: willSuspend ? suspendReason : undefined }),
      });
      setSuspendModal(null); setSuspendReason('');
      fetchRiders();
    } catch (e: any) { alert(e.message); }
    finally { setSuspending(false); }
  }

  async function creditBonus() {
    if (!bonusModal || !bonusAmount || !bonusNote) return;
    setSendingBonus(true);
    try {
      const rid = bonusModal.userId || bonusModal.id!;
      await apiRequest(`/admin/riders/${rid}/bonus`, {
        method: 'POST',
        body: JSON.stringify({ amount: parseFloat(bonusAmount), note: bonusNote }),
      });
      alert('Bonus credited!');
      setBonusModal(null); setBonusAmount(''); setBonusNote('');
    } catch (e: any) { alert(e.message); }
    finally { setSendingBonus(false); }
  }

  const filtered = riders.filter((r) => {
    const q = search.toLowerCase();
    return !q || r.name?.toLowerCase().includes(q) || (r.phone || r.phoneNumber || '').includes(q) || (r.city || '').toLowerCase().includes(q);
  });

  const kycBadge = (status?: string) => {
    const map: Record<string, string> = {
      approved: 'bg-green-100 text-green-700',
      rejected: 'bg-red-100 text-red-700',
      pending: 'bg-yellow-100 text-yellow-700',
      submitted: 'bg-blue-100 text-blue-700',
    };
    return map[status || 'pending'] || 'bg-gray-100 text-gray-600';
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Riders</h1>
        <button onClick={() => setCreateModal(true)}
          className="px-4 py-2 bg-orange-500 text-white text-sm font-semibold rounded-lg hover:bg-orange-600 transition">
          + Add Rider
        </button>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 mb-4 flex gap-3">
        <input
          type="text"
          placeholder="Search by name, phone, city..."
          className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button onClick={fetchRiders} className="px-4 py-2 bg-slate-100 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-200 transition">
          Refresh
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-slate-400">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-slate-400">No riders found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  {['Name', 'Phone', 'City', 'Vehicle', 'KYC', 'Status', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((r) => (
                  <tr key={r.userId || r.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {r.name}
                      {r.isOnline && <span className="ml-2 w-2 h-2 bg-green-400 rounded-full inline-block" title="Online" />}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{r.phone || r.phoneNumber}</td>
                    <td className="px-4 py-3 text-slate-500">{r.city || '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{r.vehicleType || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${kycBadge(r.kycStatus)}`}>
                        {r.kycStatus || 'pending'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium w-fit ${r.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {r.isActive ? 'Active' : 'Inactive'}
                        </span>
                        {r.isSuspended && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium w-fit bg-red-100 text-red-700">Suspended</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        <button onClick={() => toggleActive(r)}
                          className={`text-xs px-2.5 py-1 rounded-lg font-medium transition ${r.isActive ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-green-50 text-green-600 hover:bg-green-100'}`}>
                          {r.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                        <button onClick={() => setKycModal(r)}
                          className="text-xs px-2.5 py-1 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition">
                          KYC
                        </button>
                        <button onClick={() => setSuspendModal(r)}
                          className="text-xs px-2.5 py-1 bg-orange-50 text-orange-600 rounded-lg hover:bg-orange-100 transition">
                          {r.isSuspended ? 'Unsuspend' : 'Suspend'}
                        </button>
                        <button onClick={() => setBonusModal(r)}
                          className="text-xs px-2.5 py-1 bg-purple-50 text-purple-600 rounded-lg hover:bg-purple-100 transition">
                          Bonus
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {createModal && (
        <Modal title="Add New Rider" onClose={() => setCreateModal(false)}>
          {[
            { label: 'Name *', key: 'name', placeholder: 'Rider full name', type: 'text' },
            { label: 'Phone *', key: 'phoneNumber', placeholder: '9876543210', type: 'tel' },
            { label: 'City', key: 'city', placeholder: 'Ratlam', type: 'text' },
          ].map(({ label, key, placeholder, type }) => (
            <div key={key} className="mb-3">
              <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
              <input
                type={type}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                placeholder={placeholder}
                value={(newRider as any)[key]}
                onChange={(e) => setNewRider(prev => ({ ...prev, [key]: e.target.value }))}
              />
            </div>
          ))}
          <div className="flex gap-2 justify-end mt-4">
            <button onClick={() => setCreateModal(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
            <button onClick={createRider} disabled={creating || !newRider.name || !newRider.phoneNumber}
              className="px-4 py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50">
              {creating ? 'Creating...' : 'Create Rider'}
            </button>
          </div>
        </Modal>
      )}

      {/* KYC Modal */}
      {kycModal && (
        <Modal title={`KYC Review — ${kycModal.name}`} onClose={() => setKycModal(null)}>
          <div className="mb-3">
            <label className="block text-sm font-medium text-slate-700 mb-2">Action</label>
            <div className="flex gap-3">
              {(['approved', 'rejected'] as const).map((a) => (
                <button key={a} onClick={() => setKycAction(a)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${
                    kycAction === a ? (a === 'approved' ? 'bg-green-500 text-white border-green-500' : 'bg-red-500 text-white border-red-500')
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}>
                  {a.charAt(0).toUpperCase() + a.slice(1)}
                </button>
              ))}
            </div>
          </div>
          {kycAction === 'rejected' && (
            <div className="mb-3">
              <label className="block text-sm font-medium text-slate-700 mb-1">Rejection Reason *</label>
              <textarea
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                rows={2} value={kycReason} onChange={(e) => setKycReason(e.target.value)}
              />
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <button onClick={() => setKycModal(null)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
            <button onClick={reviewKyc} disabled={savingKyc || (kycAction === 'rejected' && !kycReason)}
              className="px-4 py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50">
              {savingKyc ? 'Saving...' : 'Submit'}
            </button>
          </div>
        </Modal>
      )}

      {/* Suspend Modal */}
      {suspendModal && (
        <Modal title={`${suspendModal.isSuspended ? 'Unsuspend' : 'Suspend'} — ${suspendModal.name}`} onClose={() => setSuspendModal(null)}>
          {!suspendModal.isSuspended && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">Reason *</label>
              <textarea
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                rows={2} value={suspendReason} onChange={(e) => setSuspendReason(e.target.value)}
                placeholder="Reason for suspension"
              />
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <button onClick={() => setSuspendModal(null)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
            <button onClick={toggleSuspend} disabled={suspending || (!suspendModal.isSuspended && !suspendReason)}
              className="px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50">
              {suspending ? 'Processing...' : (suspendModal.isSuspended ? 'Unsuspend' : 'Suspend')}
            </button>
          </div>
        </Modal>
      )}

      {/* Bonus Modal */}
      {bonusModal && (
        <Modal title={`Credit Bonus — ${bonusModal.name}`} onClose={() => setBonusModal(null)}>
          <div className="mb-3">
            <label className="block text-sm font-medium text-slate-700 mb-1">Amount (₹) *</label>
            <input
              type="number" min="1"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              value={bonusAmount} onChange={(e) => setBonusAmount(e.target.value)} placeholder="100"
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-1">Note *</label>
            <input
              type="text"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              value={bonusNote} onChange={(e) => setBonusNote(e.target.value)} placeholder="Performance bonus"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setBonusModal(null)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
            <button onClick={creditBonus} disabled={sendingBonus || !bonusAmount || !bonusNote}
              className="px-4 py-2 text-sm bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50">
              {sendingBonus ? 'Crediting...' : 'Credit Bonus'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-800">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
