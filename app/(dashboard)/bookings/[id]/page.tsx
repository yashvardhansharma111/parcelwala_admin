'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiRequest } from '@/lib/api';

interface Booking {
  id: string;
  trackingNumber?: string;
  status: string;
  paymentStatus?: string;
  paymentMethod?: string;
  fare?: number;
  fareBreakdown?: any;
  createdAt: any;
  updatedAt?: any;
  pickup?: { address?: string; city?: string; lat?: number; lon?: number; pincode?: string };
  drop?: { address?: string; city?: string; lat?: number; lon?: number; pincode?: string };
  parcelDetails?: { type?: string; weight?: number; description?: string };
  riderId?: string;
  riderName?: string;
  riderPhone?: string;
  serviceType?: string;
  codAmount?: number;
  codCollected?: boolean;
  codSettled?: boolean;
  returnReason?: string;
  returnedAt?: any;
  podSignedBy?: string;
  podSignature?: string;
  customerRating?: number;
  userId?: string;
}

const STATUSES = ['Created','Assigned','Picked','Shipped','Delivered','Returned','Cancelled'];

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

function fmt(val: any): string {
  if (!val) return '—';
  try { return new Date(val?._seconds ? val._seconds * 1000 : val).toLocaleString('en-IN'); } catch { return '—'; }
}

export default function BookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [riders, setRiders] = useState<any[]>([]);

  // Fare modal
  const [fareModal, setFareModal] = useState(false);
  const [newFare, setNewFare] = useState('');
  const [savingFare, setSavingFare] = useState(false);

  // Assign modal
  const [assignModal, setAssignModal] = useState(false);
  const [selectedRider, setSelectedRider] = useState('');
  const [assigning, setAssigning] = useState(false);

  // Notification modal
  const [notifModal, setNotifModal] = useState(false);
  const [notifTitle, setNotifTitle] = useState('');
  const [notifBody, setNotifBody] = useState('');
  const [sendingNotif, setSendingNotif] = useState(false);

  async function fetchBooking() {
    setLoading(true);
    try {
      const res = await apiRequest<{ booking: Booking }>(`/bookings/${id}`);
      setBooking(res.booking || res as any);
    } catch (e: any) { alert(e.message); }
    finally { setLoading(false); }
  }

  async function fetchRiders() {
    try {
      const res = await apiRequest<{ riders: any[] }>('/admin/riders');
      setRiders((res.riders || res as any).filter((r: any) => r.isActive));
    } catch {}
  }

  useEffect(() => { fetchBooking(); fetchRiders(); }, [id]);

  async function updateStatus(status: string) {
    if (!confirm(`Update status to "${status}"?`)) return;
    try {
      await apiRequest(`/bookings/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      fetchBooking();
    } catch (e: any) { alert(e.message); }
  }

  async function saveFare() {
    setSavingFare(true);
    try {
      await apiRequest(`/bookings/${id}/fare`, { method: 'PATCH', body: JSON.stringify({ fare: parseFloat(newFare) }) });
      setFareModal(false);
      fetchBooking();
    } catch (e: any) { alert(e.message); }
    finally { setSavingFare(false); }
  }

  async function assignRider() {
    if (!selectedRider) return;
    setAssigning(true);
    try {
      await apiRequest(`/admin/bookings/${id}/assign`, { method: 'POST', body: JSON.stringify({ riderId: selectedRider }) });
      setAssignModal(false);
      fetchBooking();
    } catch (e: any) { alert(e.message); }
    finally { setAssigning(false); }
  }

  async function unassignRider() {
    if (!confirm('Unassign rider and re-offer?')) return;
    try {
      await apiRequest(`/admin/bookings/${id}/unassign`, { method: 'POST', body: JSON.stringify({ reoffer: true }) });
      fetchBooking();
    } catch (e: any) { alert(e.message); }
  }

  async function overridePickupOtp() {
    if (!confirm('Override pickup OTP?')) return;
    try {
      await apiRequest(`/bookings/admin/${id}/override-otp`, { method: 'POST', body: JSON.stringify({ type: 'pickup' }) });
      alert('Pickup OTP overridden');
      fetchBooking();
    } catch (e: any) { alert(e.message); }
  }

  async function overrideDropOtp() {
    if (!confirm('Override drop OTP?')) return;
    try {
      await apiRequest(`/bookings/admin/${id}/override-otp`, { method: 'POST', body: JSON.stringify({ type: 'drop' }) });
      alert('Drop OTP overridden');
      fetchBooking();
    } catch (e: any) { alert(e.message); }
  }

  async function settleCod() {
    if (!confirm('Mark COD as settled?')) return;
    try {
      await apiRequest(`/bookings/admin/${id}/cod-settle`, { method: 'POST' });
      fetchBooking();
    } catch (e: any) { alert(e.message); }
  }

  async function cancelBooking() {
    const reason = prompt('Cancellation reason:');
    if (!reason) return;
    try {
      await apiRequest(`/bookings/admin/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) });
      fetchBooking();
    } catch (e: any) { alert(e.message); }
  }

  async function sendNotification() {
    if (!booking?.userId || !notifTitle || !notifBody) return;
    setSendingNotif(true);
    try {
      await apiRequest('/admin/notifications/send', {
        method: 'POST',
        body: JSON.stringify({ userId: booking.userId, title: notifTitle, body: notifBody }),
      });
      alert('Notification sent!');
      setNotifModal(false);
      setNotifTitle(''); setNotifBody('');
    } catch (e: any) { alert(e.message); }
    finally { setSendingNotif(false); }
  }

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-400">Loading...</div>;
  if (!booking) return <div className="flex items-center justify-center h-64 text-slate-400">Booking not found</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-slate-400 hover:text-slate-600 text-lg">←</button>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-slate-800">
              {booking.trackingNumber || booking.id.slice(0, 8)}
            </h1>
            <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${STATUS_COLORS[booking.status] || 'bg-gray-100 text-gray-600'}`}>
              {booking.status}
            </span>
            <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 capitalize">
              {booking.serviceType || 'intercity'}
            </span>
          </div>
          <div className="text-xs text-slate-400 mt-0.5">Created {fmt(booking.createdAt)}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Payment Card */}
        <Card title="Payment">
          <Row label="Method" value={(booking.paymentMethod || 'cod').toUpperCase()} />
          <Row label="Status" value={
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              booking.paymentStatus === 'paid' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
            }`}>{booking.paymentStatus || 'pending'}</span>
          } />
          <Row label="Fare" value={booking.fare ? `₹${booking.fare}` : '—'} />
          {booking.codAmount && <Row label="COD Amount" value={`₹${booking.codAmount}`} />}
          {booking.codAmount && <Row label="COD Collected" value={booking.codCollected ? 'Yes' : 'No'} />}
          {booking.codAmount && <Row label="COD Settled" value={booking.codSettled ? 'Yes' : 'No'} />}
          <div className="pt-2 flex gap-2 flex-wrap">
            <button onClick={() => { setNewFare(String(booking.fare || '')); setFareModal(true); }}
              className="text-xs px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition">
              Edit Fare
            </button>
            {booking.codAmount && !booking.codSettled && booking.codCollected && (
              <button onClick={settleCod} className="text-xs px-3 py-1.5 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition">
                Settle COD
              </button>
            )}
          </div>
        </Card>

        {/* Rider Card */}
        <Card title="Rider">
          {booking.riderId ? (
            <>
              <Row label="Name" value={booking.riderName || booking.riderId} />
              {booking.riderPhone && <Row label="Phone" value={booking.riderPhone} />}
              <div className="pt-2 flex gap-2 flex-wrap">
                <button onClick={() => setAssignModal(true)} className="text-xs px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition">
                  Reassign
                </button>
                <button onClick={unassignRider} className="text-xs px-3 py-1.5 bg-orange-50 text-orange-600 rounded-lg hover:bg-orange-100 transition">
                  Unassign
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="text-sm text-slate-400 mb-3">No rider assigned</div>
              <button onClick={() => setAssignModal(true)} className="text-xs px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition">
                Assign Rider
              </button>
            </>
          )}
        </Card>

        {/* Pickup */}
        <Card title="Pickup">
          <Row label="Address" value={booking.pickup?.address || '—'} />
          <Row label="City" value={booking.pickup?.city || '—'} />
          {booking.pickup?.pincode && <Row label="Pincode" value={booking.pickup.pincode} />}
        </Card>

        {/* Drop */}
        <Card title="Drop / Delivery">
          <Row label="Address" value={booking.drop?.address || '—'} />
          <Row label="City" value={booking.drop?.city || '—'} />
          {booking.drop?.pincode && <Row label="Pincode" value={booking.drop.pincode} />}
          {booking.podSignedBy && <Row label="POD Signed By" value={booking.podSignedBy} />}
        </Card>

        {/* Parcel */}
        <Card title="Parcel Details">
          <Row label="Type" value={booking.parcelDetails?.type || '—'} />
          <Row label="Weight" value={booking.parcelDetails?.weight ? `${booking.parcelDetails.weight} kg` : '—'} />
          {booking.parcelDetails?.description && <Row label="Description" value={booking.parcelDetails.description} />}
        </Card>

        {/* Actions */}
        <Card title="Admin Actions">
          <div className="flex flex-wrap gap-2">
            <button onClick={overridePickupOtp} className="text-xs px-3 py-1.5 bg-purple-50 text-purple-600 rounded-lg hover:bg-purple-100 transition">
              Override Pickup OTP
            </button>
            <button onClick={overrideDropOtp} className="text-xs px-3 py-1.5 bg-purple-50 text-purple-600 rounded-lg hover:bg-purple-100 transition">
              Override Drop OTP
            </button>
            {!['Delivered','Cancelled','Returned'].includes(booking.status) && (
              <button onClick={cancelBooking} className="text-xs px-3 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition">
                Cancel Booking
              </button>
            )}
            {booking.userId && (
              <button onClick={() => setNotifModal(true)} className="text-xs px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition">
                Send Notification
              </button>
            )}
          </div>
          {booking.returnReason && (
            <div className="mt-3 text-xs text-slate-500">
              Return reason: <span className="text-slate-700">{booking.returnReason}</span>
            </div>
          )}
          {booking.customerRating && (
            <div className="mt-2 text-xs text-slate-500">
              Customer rating: {'⭐'.repeat(booking.customerRating)}
            </div>
          )}
        </Card>
      </div>

      {/* Google Maps — pickup & drop locations */}
      {(booking.pickup?.lat != null || booking.drop?.lat != null) && (() => {
        const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
        const markerParams: string[] = [];
        if (booking.pickup?.lat != null && booking.pickup?.lon != null)
          markerParams.push(`markers=color:green%7Clabel:P%7C${booking.pickup.lat},${booking.pickup.lon}`);
        if (booking.drop?.lat != null && booking.drop?.lon != null)
          markerParams.push(`markers=color:red%7Clabel:D%7C${booking.drop.lat},${booking.drop.lon}`);
        const mapUrl = `https://maps.googleapis.com/maps/api/staticmap?size=700x280&scale=2&${markerParams.join('&')}&key=${apiKey}`;
        return (
          <div className="mt-4 bg-white rounded-xl shadow-sm border border-slate-100 p-5">
            <h3 className="font-semibold text-slate-700 mb-3 text-sm uppercase tracking-wide">Route Map</h3>
            <img
              src={mapUrl}
              alt="Pickup and drop locations"
              className="w-full rounded-lg border border-slate-100"
              style={{ maxHeight: 280, objectFit: 'cover' }}
            />
            <div className="flex gap-4 mt-2 text-xs text-slate-500">
              {booking.pickup?.lat != null && <span className="flex items-center gap-1"><span className="text-green-600">●</span> Pickup</span>}
              {booking.drop?.lat != null && <span className="flex items-center gap-1"><span className="text-red-500">●</span> Drop</span>}
            </div>
          </div>
        );
      })()}

      {/* Status Timeline */}
      <div className="mt-4 bg-white rounded-xl shadow-sm border border-slate-100 p-5">
        <h3 className="font-semibold text-slate-700 mb-4">Update Status</h3>
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => updateStatus(s)}
              disabled={booking.status === s}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition ${
                booking.status === s
                  ? 'bg-slate-100 text-slate-400 cursor-default'
                  : `${STATUS_COLORS[s] || 'bg-gray-100 text-gray-600'} hover:opacity-80 cursor-pointer`
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Modals */}
      {fareModal && (
        <Modal title="Edit Fare" onClose={() => setFareModal(false)}>
          <label className="block text-sm font-medium text-slate-700 mb-1">New Fare (₹)</label>
          <input
            type="number"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-orange-400"
            value={newFare}
            onChange={(e) => setNewFare(e.target.value)}
          />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setFareModal(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
            <button onClick={saveFare} disabled={savingFare} className="px-4 py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50">
              {savingFare ? 'Saving...' : 'Save'}
            </button>
          </div>
        </Modal>
      )}

      {assignModal && (
        <Modal title="Assign Rider" onClose={() => setAssignModal(false)}>
          <label className="block text-sm font-medium text-slate-700 mb-1">Select Rider</label>
          <select
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-orange-400"
            value={selectedRider}
            onChange={(e) => setSelectedRider(e.target.value)}
          >
            <option value="">— Choose rider —</option>
            {riders.map((r) => (
              <option key={r.userId || r.id} value={r.userId || r.id}>
                {r.name} · {r.phone || r.phoneNumber}
              </option>
            ))}
          </select>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setAssignModal(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
            <button onClick={assignRider} disabled={assigning || !selectedRider} className="px-4 py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50">
              {assigning ? 'Assigning...' : 'Assign'}
            </button>
          </div>
        </Modal>
      )}

      {notifModal && (
        <Modal title="Send Notification to Customer" onClose={() => setNotifModal(false)}>
          <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
          <input
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-orange-400"
            value={notifTitle} onChange={(e) => setNotifTitle(e.target.value)}
            placeholder="e.g. Your parcel is out for delivery"
          />
          <label className="block text-sm font-medium text-slate-700 mb-1">Message</label>
          <textarea
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-orange-400"
            rows={3} value={notifBody} onChange={(e) => setNotifBody(e.target.value)}
            placeholder="Notification message..."
          />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setNotifModal(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
            <button onClick={sendNotification} disabled={sendingNotif || !notifTitle || !notifBody}
              className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50">
              {sendingNotif ? 'Sending...' : 'Send'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
      <h3 className="font-semibold text-slate-700 mb-3 text-sm uppercase tracking-wide">{title}</h3>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start py-1.5 border-b border-slate-50 last:border-0">
      <span className="text-xs text-slate-500 w-32 shrink-0">{label}</span>
      <span className="text-xs text-slate-800 text-right font-medium">{value}</span>
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
