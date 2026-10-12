'use client';

import { useEffect, useState } from 'react';
import { apiRequest, getStoredUser } from '@/lib/api';

type Tab = 'pricing' | 'dispatch' | 'notifications' | 'coadmins' | 'areas';

interface PricingConfig {
  baseFare: number; baseKmIncluded: number; perKmRate: number;
  waitingPerMin: number; handlingFee: number; applyHandlingFeeByDefault: boolean;
  platformCommissionPct: number; minWithdrawalAmount: number;
  returnTripRiderPct: number; cancellationFeeAfterAssign: number;
  // What the rider sees on the app's Rate Card screen. These are the global
  // defaults; a city can override any of them on the Cities page.
  riderBasePerOrder: number; riderPerMinute: number;
  riderTier1UptoKm: number; riderTier1PerKm: number;
  riderTier2UptoKm: number; riderTier2PerKm: number;
  riderTier3PerKm: number;
}

interface DispatchConfig {
  radiusKm: number; offerTimeoutMinutes: number; locationStaleSeconds: number;
}

interface CoAdmin {
  id: string; phoneNumber: string; name: string; role: string;
}

interface RestrictedArea {
  id: string; name: string; lat: number; lon: number; radiusKm: number; isActive: boolean;
}

interface ServiceArea {
  id: string; name: string; city?: string; lat: number; lon: number; radiusKm: number; isActive: boolean;
}

const SUPER_ADMIN_PHONE = '8462044151';

function normalize(p?: string) {
  if (!p) return '';
  const d = p.replace(/\D/g, '');
  return d.startsWith('91') && d.length === 12 ? d.slice(2) : d.slice(-10);
}

export default function SettingsPage() {
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [tab, setTab] = useState<Tab>('pricing');

  useEffect(() => {
    const u = getStoredUser();
    setIsSuperAdmin(normalize(u?.phoneNumber) === SUPER_ADMIN_PHONE);
  }, []);

  // Pricing
  const [pricing, setPricing] = useState<PricingConfig>({
    baseFare: 30, baseKmIncluded: 2, perKmRate: 8, waitingPerMin: 2,
    handlingFee: 10, applyHandlingFeeByDefault: true,
    platformCommissionPct: 20, minWithdrawalAmount: 100,
    returnTripRiderPct: 50, cancellationFeeAfterAssign: 30,
    riderBasePerOrder: 30, riderPerMinute: 2,
    riderTier1UptoKm: 3, riderTier1PerKm: 10,
    riderTier2UptoKm: 8, riderTier2PerKm: 12,
    riderTier3PerKm: 14,
  });
  const [loadingPricing, setLoadingPricing] = useState(false);
  const [savingPricing, setSavingPricing] = useState(false);

  // Dispatch
  const [dispatch, setDispatch] = useState<DispatchConfig>({ radiusKm: 10, offerTimeoutMinutes: 10, locationStaleSeconds: 300 });
  const [savingDispatch, setSavingDispatch] = useState(false);

  // Notifications
  const [broadcast, setBroadcast] = useState({ title: '', body: '' });
  const [sendingBroadcast, setSendingBroadcast] = useState(false);
  const [targetNotif, setTargetNotif] = useState({ userId: '', title: '', body: '' });
  const [sendingTarget, setSendingTarget] = useState(false);

  // Co-Admins
  const [coAdmins, setCoAdmins] = useState<CoAdmin[]>([]);
  const [loadingCoAdmins, setLoadingCoAdmins] = useState(false);
  const [newCoAdmin, setNewCoAdmin] = useState({ phoneNumber: '', name: '' });
  const [addingCoAdmin, setAddingCoAdmin] = useState(false);

  // Areas
  const [areas, setAreas] = useState<RestrictedArea[]>([]);
  const [loadingAreas, setLoadingAreas] = useState(false);
  const [newArea, setNewArea] = useState({ name: '', lat: '', lon: '', radiusKm: '' });
  const [creatingArea, setCreatingArea] = useState(false);

  // Service areas (where we DO operate)
  const [svcAreas, setSvcAreas] = useState<ServiceArea[]>([]);
  const [loadingSvc, setLoadingSvc] = useState(false);
  const [newSvc, setNewSvc] = useState({ name: '', city: '', lat: '', lon: '', radiusKm: '' });
  const [creatingSvc, setCreatingSvc] = useState(false);

  useEffect(() => {
    if (tab === 'pricing') loadPricing();
    if (tab === 'dispatch') loadDispatch();
    if (tab === 'coadmins' && isSuperAdmin) loadCoAdmins();
    if (tab === 'areas') { loadAreas(); loadServiceAreas(); }
  }, [tab]);

  async function loadPricing() {
    setLoadingPricing(true);
    try {
      const res = await apiRequest<{ pricing: PricingConfig }>('/admin/settings/pricing');
      if (res.pricing) setPricing(res.pricing);
    } catch (e: any) { alert(e.message); }
    finally { setLoadingPricing(false); }
  }

  async function savePricing() {
    setSavingPricing(true);
    try {
      await apiRequest('/admin/settings/pricing', { method: 'PATCH', body: JSON.stringify(pricing) });
      alert('Pricing saved!');
    } catch (e: any) { alert(e.message); }
    finally { setSavingPricing(false); }
  }

  async function loadDispatch() {
    try {
      const res = await apiRequest<DispatchConfig>('/admin/settings/dispatch');
      if (res) setDispatch(res);
    } catch { /* use defaults */ }
  }

  async function saveDispatch() {
    setSavingDispatch(true);
    try {
      await apiRequest('/admin/settings/dispatch', { method: 'PATCH', body: JSON.stringify(dispatch) });
      alert('Dispatch settings saved!');
    } catch (e: any) { alert(e.message); }
    finally { setSavingDispatch(false); }
  }

  async function sendBroadcast() {
    if (!broadcast.title || !broadcast.body) return;
    setSendingBroadcast(true);
    try {
      const res = await apiRequest<{ sent: number; failed: number; total: number }>(
        '/admin/notifications/broadcast',
        { method: 'POST', body: JSON.stringify(broadcast) }
      );
      alert(`Sent to ${res.sent}/${res.total} users (${res.failed} failed)`);
      setBroadcast({ title: '', body: '' });
    } catch (e: any) { alert(e.message); }
    finally { setSendingBroadcast(false); }
  }

  async function sendTargetNotification() {
    if (!targetNotif.userId || !targetNotif.title || !targetNotif.body) return;
    setSendingTarget(true);
    try {
      await apiRequest('/admin/notifications/send', {
        method: 'POST',
        body: JSON.stringify(targetNotif),
      });
      alert('Notification sent!');
      setTargetNotif({ userId: '', title: '', body: '' });
    } catch (e: any) { alert(e.message); }
    finally { setSendingTarget(false); }
  }

  async function loadCoAdmins() {
    setLoadingCoAdmins(true);
    try {
      const res = await apiRequest<CoAdmin[] | { coAdmins: CoAdmin[] }>('/admin/co-admins');
      setCoAdmins(Array.isArray(res) ? res : (res as any).coAdmins || []);
    } catch (e: any) { alert(e.message); }
    finally { setLoadingCoAdmins(false); }
  }

  async function addCoAdmin() {
    if (!newCoAdmin.phoneNumber || !newCoAdmin.name) return;
    setAddingCoAdmin(true);
    try {
      const num = newCoAdmin.phoneNumber.replace(/\D/g, '');
      const formatted = num.length === 10 ? `+91${num}` : `+${num}`;
      await apiRequest('/admin/co-admins', {
        method: 'POST',
        body: JSON.stringify({ phoneNumber: formatted, name: newCoAdmin.name }),
      });
      setNewCoAdmin({ phoneNumber: '', name: '' });
      loadCoAdmins();
    } catch (e: any) { alert(e.message); }
    finally { setAddingCoAdmin(false); }
  }

  async function removeCoAdmin(id: string, name: string) {
    if (!confirm(`Remove ${name} as co-admin?`)) return;
    try {
      await apiRequest(`/admin/co-admins/${id}`, { method: 'DELETE' });
      loadCoAdmins();
    } catch (e: any) { alert(e.message); }
  }

  async function loadAreas() {
    setLoadingAreas(true);
    try {
      const res = await apiRequest<{ areas: RestrictedArea[] }>('/admin/restricted-areas');
      setAreas(res.areas || []);
    } catch (e: any) { alert(e.message); }
    finally { setLoadingAreas(false); }
  }

  async function loadServiceAreas() {
    setLoadingSvc(true);
    try {
      const res = await apiRequest<{ areas: ServiceArea[] }>('/admin/service-areas');
      setSvcAreas(res.areas || []);
    } catch (e: any) { alert(e.message); }
    finally { setLoadingSvc(false); }
  }

  async function createSvcArea() {
    if (!newSvc.name || !newSvc.lat || !newSvc.lon || !newSvc.radiusKm) return;
    setCreatingSvc(true);
    try {
      await apiRequest('/admin/service-areas', {
        method: 'POST',
        body: JSON.stringify({
          name: newSvc.name, city: newSvc.city || undefined,
          lat: parseFloat(newSvc.lat), lon: parseFloat(newSvc.lon),
          radiusKm: parseFloat(newSvc.radiusKm), isActive: true,
        }),
      });
      setNewSvc({ name: '', city: '', lat: '', lon: '', radiusKm: '' });
      loadServiceAreas();
    } catch (e: any) { alert(e.message); }
    finally { setCreatingSvc(false); }
  }

  async function toggleSvcArea(area: ServiceArea) {
    try {
      await apiRequest(`/admin/service-areas/${area.id}`, {
        method: 'PATCH', body: JSON.stringify({ isActive: !area.isActive }),
      });
      loadServiceAreas();
    } catch (e: any) { alert(e.message); }
  }

  async function deleteSvcArea(area: ServiceArea) {
    if (!confirm(`Delete service area "${area.name}"? Bookings there will stop being accepted.`)) return;
    try {
      await apiRequest(`/admin/service-areas/${area.id}`, { method: 'DELETE' });
      loadServiceAreas();
    } catch (e: any) { alert(e.message); }
  }

  async function createArea() {
    if (!newArea.name || !newArea.lat || !newArea.lon || !newArea.radiusKm) return;
    setCreatingArea(true);
    try {
      await apiRequest('/admin/restricted-areas', {
        method: 'POST',
        body: JSON.stringify({
          name: newArea.name, lat: parseFloat(newArea.lat),
          lon: parseFloat(newArea.lon), radiusKm: parseFloat(newArea.radiusKm), isActive: true,
        }),
      });
      setNewArea({ name: '', lat: '', lon: '', radiusKm: '' });
      loadAreas();
    } catch (e: any) { alert(e.message); }
    finally { setCreatingArea(false); }
  }

  async function toggleArea(area: RestrictedArea) {
    try {
      await apiRequest(`/admin/restricted-areas/${area.id}`, {
        method: 'PATCH', body: JSON.stringify({ isActive: !area.isActive }),
      });
      loadAreas();
    } catch (e: any) { alert(e.message); }
  }

  async function deleteArea(area: RestrictedArea) {
    if (!confirm(`Delete area "${area.name}"?`)) return;
    try {
      await apiRequest(`/admin/restricted-areas/${area.id}`, { method: 'DELETE' });
      loadAreas();
    } catch (e: any) { alert(e.message); }
  }

  const TABS: { key: Tab; label: string; superOnly?: boolean }[] = [
    { key: 'pricing', label: 'Pricing' },
    { key: 'dispatch', label: 'Dispatch' },
    { key: 'notifications', label: 'Notifications', superOnly: true },
    { key: 'coadmins', label: 'Co-Admins', superOnly: true },
    { key: 'areas', label: 'Areas' },
  ];

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-slate-800 mb-6">Settings</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-slate-100 rounded-xl p-1 w-fit flex-wrap">
        {TABS.filter(t => !t.superOnly || isSuperAdmin).map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === key ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Pricing Tab */}
      {tab === 'pricing' && (
        <div className="max-w-xl">
          <Card title="Delivery Fare (Hyperlocal)">
            <p className="text-xs text-slate-500 mb-4">Base fare covers first N km. Extra km charged separately. Example 8 km: ₹30 + (6 × ₹8) = ₹78</p>
            {[
              { label: 'Base Fare (₹)', key: 'baseFare' },
              { label: 'Base Includes (km)', key: 'baseKmIncluded' },
              { label: 'Per Extra km (₹)', key: 'perKmRate' },
              { label: 'Waiting per min (₹)', key: 'waitingPerMin' },
              { label: 'Handling Fee (₹)', key: 'handlingFee' },
            ].map(({ label, key }) => (
              <Field key={key} label={label}>
                <input
                  type="number" min="0" step="0.5"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                  value={(pricing as any)[key]}
                  onChange={(e) => setPricing(p => ({ ...p, [key]: parseFloat(e.target.value) || 0 }))}
                />
              </Field>
            ))}
            <Field label="Handling Fee by Default">
              <Toggle
                value={pricing.applyHandlingFeeByDefault}
                onChange={(v) => setPricing(p => ({ ...p, applyHandlingFeeByDefault: v }))}
              />
            </Field>
          </Card>

          <Card title="Platform & Rider">
            {[
              { label: 'Platform Commission (%)', key: 'platformCommissionPct' },
              { label: 'Min Rider Withdrawal (₹)', key: 'minWithdrawalAmount' },
              { label: 'Return Trip Rider Pay (%)', key: 'returnTripRiderPct' },
              { label: 'Cancellation Fee after Assign (₹)', key: 'cancellationFeeAfterAssign' },
            ].map(({ label, key }) => (
              <Field key={key} label={label}>
                <input
                  type="number" min="0" step="1"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                  value={(pricing as any)[key]}
                  onChange={(e) => setPricing(p => ({ ...p, [key]: parseFloat(e.target.value) || 0 }))}
                />
              </Field>
            ))}
          </Card>

          <Card title="Rider Rate Card">
            <p className="text-xs text-slate-500 mb-4">
              These are the exact figures shown on the rider&apos;s Rate Card screen in the app.
              They apply everywhere unless a city overrides them on the Cities page.
            </p>
            {[
              { label: 'Base per order (₹)', key: 'riderBasePerOrder', step: '1' },
              { label: 'Time + waiting (₹/min)', key: 'riderPerMinute', step: '0.5' },
              { label: 'Band 1 up to (km)', key: 'riderTier1UptoKm', step: '0.5' },
              { label: 'Band 1 rate (₹/km)', key: 'riderTier1PerKm', step: '0.5' },
              { label: 'Band 2 up to (km)', key: 'riderTier2UptoKm', step: '0.5' },
              { label: 'Band 2 rate (₹/km)', key: 'riderTier2PerKm', step: '0.5' },
              { label: 'Above band 2, rate (₹/km)', key: 'riderTier3PerKm', step: '0.5' },
            ].map(({ label, key, step }) => (
              <Field key={key} label={label}>
                <input
                  type="number" min="0" step={step}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                  value={(pricing as any)[key]}
                  onChange={(e) => setPricing(p => ({ ...p, [key]: parseFloat(e.target.value) || 0 }))}
                />
              </Field>
            ))}
            <p className="text-xs text-slate-500 mt-3">
              Rider earns: base + distance by band + per-minute for trip time including waiting.
            </p>
          </Card>

          <button onClick={savePricing} disabled={savingPricing || loadingPricing}
            className="w-full py-2.5 bg-orange-500 text-white font-semibold rounded-xl hover:bg-orange-600 disabled:opacity-50 transition">
            {savingPricing ? 'Saving...' : 'Save Pricing'}
          </button>
        </div>
      )}

      {/* Dispatch Tab */}
      {tab === 'dispatch' && (
        <div className="max-w-xl">
          <Card title="Dispatch Settings">
            <p className="text-xs text-slate-500 mb-4">Controls how job offers are broadcast to nearby riders.</p>
            {[
              { label: 'Search Radius (km)', key: 'radiusKm', step: '1' },
              { label: 'Offer Timeout (minutes)', key: 'offerTimeoutMinutes', step: '1' },
              { label: 'Location Stale After (seconds)', key: 'locationStaleSeconds', step: '30' },
            ].map(({ label, key, step }) => (
              <Field key={key} label={label}>
                <input
                  type="number" min="0" step={step}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                  value={(dispatch as any)[key]}
                  onChange={(e) => setDispatch(d => ({ ...d, [key]: parseFloat(e.target.value) || 0 }))}
                />
              </Field>
            ))}
          </Card>
          <button onClick={saveDispatch} disabled={savingDispatch}
            className="w-full py-2.5 bg-orange-500 text-white font-semibold rounded-xl hover:bg-orange-600 disabled:opacity-50 transition">
            {savingDispatch ? 'Saving...' : 'Save Dispatch Settings'}
          </button>
        </div>
      )}

      {/* Notifications Tab */}
      {tab === 'notifications' && isSuperAdmin && (
        <div className="max-w-xl space-y-4">
          <Card title="Broadcast to All Users">
            <p className="text-xs text-slate-500 mb-4">Send a push notification to every registered user via OneSignal.</p>
            <Field label="Title">
              <input
                type="text"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                placeholder="e.g. New Feature Available!"
                value={broadcast.title} onChange={(e) => setBroadcast(b => ({ ...b, title: e.target.value }))}
              />
            </Field>
            <Field label="Message">
              <textarea
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                rows={3} placeholder="Notification body..."
                value={broadcast.body} onChange={(e) => setBroadcast(b => ({ ...b, body: e.target.value }))}
              />
            </Field>
            <button onClick={sendBroadcast} disabled={sendingBroadcast || !broadcast.title || !broadcast.body}
              className="w-full py-2.5 bg-blue-500 text-white font-semibold rounded-xl hover:bg-blue-600 disabled:opacity-50 transition">
              {sendingBroadcast ? 'Sending...' : '📣 Send to All Users'}
            </button>
          </Card>

          <Card title="Send to Specific User">
            <p className="text-xs text-slate-500 mb-4">Send a notification to a specific customer or rider by their Firebase user ID.</p>
            <Field label="User ID (Firebase UID)">
              <input
                type="text"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-400"
                placeholder="Firestore user document ID"
                value={targetNotif.userId} onChange={(e) => setTargetNotif(t => ({ ...t, userId: e.target.value }))}
              />
            </Field>
            <Field label="Title">
              <input
                type="text"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                placeholder="Notification title"
                value={targetNotif.title} onChange={(e) => setTargetNotif(t => ({ ...t, title: e.target.value }))}
              />
            </Field>
            <Field label="Message">
              <textarea
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                rows={3} placeholder="Notification message..."
                value={targetNotif.body} onChange={(e) => setTargetNotif(t => ({ ...t, body: e.target.value }))}
              />
            </Field>
            <button onClick={sendTargetNotification}
              disabled={sendingTarget || !targetNotif.userId || !targetNotif.title || !targetNotif.body}
              className="w-full py-2.5 bg-blue-500 text-white font-semibold rounded-xl hover:bg-blue-600 disabled:opacity-50 transition">
              {sendingTarget ? 'Sending...' : '📨 Send Notification'}
            </button>
          </Card>
        </div>
      )}

      {/* Co-Admins Tab */}
      {tab === 'coadmins' && isSuperAdmin && (
        <div className="max-w-xl">
          <Card title="Appoint Co-Admin">
            <Field label="Phone Number">
              <input
                type="tel"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                placeholder="9876543210"
                value={newCoAdmin.phoneNumber} onChange={(e) => setNewCoAdmin(a => ({ ...a, phoneNumber: e.target.value }))}
              />
            </Field>
            <Field label="Name">
              <input
                type="text"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                placeholder="Admin name"
                value={newCoAdmin.name} onChange={(e) => setNewCoAdmin(a => ({ ...a, name: e.target.value }))}
              />
            </Field>
            <button onClick={addCoAdmin} disabled={addingCoAdmin || !newCoAdmin.phoneNumber || !newCoAdmin.name}
              className="w-full py-2.5 bg-orange-500 text-white font-semibold rounded-xl hover:bg-orange-600 disabled:opacity-50 transition">
              {addingCoAdmin ? 'Adding...' : 'Appoint Co-Admin'}
            </button>
          </Card>

          <Card title="Current Co-Admins">
            {loadingCoAdmins ? (
              <div className="text-sm text-slate-400 py-4 text-center">Loading...</div>
            ) : coAdmins.length === 0 ? (
              <div className="text-sm text-slate-400 py-4 text-center">No co-admins yet</div>
            ) : (
              <div className="divide-y divide-slate-50">
                {coAdmins.map((a) => (
                  <div key={a.id} className="flex items-center justify-between py-3">
                    <div>
                      <div className="font-medium text-slate-800 text-sm">{a.name}</div>
                      <div className="text-xs text-slate-500">{a.phoneNumber}</div>
                    </div>
                    <button onClick={() => removeCoAdmin(a.id, a.name)}
                      className="text-xs px-3 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition">
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Areas Tab */}
      {tab === 'areas' && (
        <div className="max-w-xl">
          <Card title="Add Service Area">
            <p className="text-xs text-slate-500 mb-4">
              Where you <strong>do</strong> operate. Both pickup and drop must fall inside one of these
              circles or the customer is told service isn&apos;t available there.
              {svcAreas.length === 0 && (
                <span className="block mt-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
                  No service areas yet — bookings are currently accepted <strong>everywhere</strong>.
                  Enforcement starts as soon as you add the first one.
                </span>
              )}
            </p>
            <Field label="Area Name *">
              <input
                type="text"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                placeholder="e.g. Ujjain City"
                value={newSvc.name} onChange={(e) => setNewSvc(a => ({ ...a, name: e.target.value }))}
              />
            </Field>
            <Field label="City">
              <input
                type="text"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                placeholder="e.g. Ujjain"
                value={newSvc.city} onChange={(e) => setNewSvc(a => ({ ...a, city: e.target.value }))}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Latitude *">
                <input
                  type="text"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-400"
                  placeholder="23.1765"
                  value={newSvc.lat} onChange={(e) => setNewSvc(a => ({ ...a, lat: e.target.value }))}
                />
              </Field>
              <Field label="Longitude *">
                <input
                  type="text"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-400"
                  placeholder="75.7885"
                  value={newSvc.lon} onChange={(e) => setNewSvc(a => ({ ...a, lon: e.target.value }))}
                />
              </Field>
            </div>
            <Field label="Radius (km) *">
              <input
                type="number" min="0.1" step="0.1"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                placeholder="20"
                value={newSvc.radiusKm} onChange={(e) => setNewSvc(a => ({ ...a, radiusKm: e.target.value }))}
              />
            </Field>
            <button onClick={createSvcArea}
              disabled={creatingSvc || !newSvc.name || !newSvc.lat || !newSvc.lon || !newSvc.radiusKm}
              className="w-full py-2.5 bg-orange-500 text-white font-semibold rounded-xl hover:bg-orange-600 disabled:opacity-50 transition">
              {creatingSvc ? 'Creating...' : '+ Add Service Area'}
            </button>
          </Card>

          <Card title="Service Areas">
            {loadingSvc ? (
              <div className="text-sm text-slate-400 py-4 text-center">Loading...</div>
            ) : svcAreas.length === 0 ? (
              <div className="text-sm text-slate-400 py-4 text-center">No service areas — serving everywhere</div>
            ) : (
              <div className="divide-y divide-slate-50">
                {svcAreas.map((area) => (
                  <div key={area.id} className="flex items-center justify-between py-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-800 text-sm">{area.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${area.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                          {area.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {area.city ? `${area.city} · ` : ''}{area.lat.toFixed(4)}, {area.lon.toFixed(4)} · {area.radiusKm} km radius
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => toggleSvcArea(area)}
                        className="text-xs px-2.5 py-1.5 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition">
                        {area.isActive ? 'Disable' : 'Enable'}
                      </button>
                      <button onClick={() => deleteSvcArea(area)}
                        className="text-xs px-2.5 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition">
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Add Restricted Area">
            <p className="text-xs text-slate-500 mb-4">
              A carve-out <em>inside</em> a service area — a zone you cover on the map but won&apos;t deliver to.
              Bookings with pickup or drop inside are rejected.
            </p>
            <Field label="Area Name *">
              <input
                type="text"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                placeholder="e.g. Ratlam Old City"
                value={newArea.name} onChange={(e) => setNewArea(a => ({ ...a, name: e.target.value }))}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Latitude *">
                <input
                  type="text"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-400"
                  placeholder="23.3315"
                  value={newArea.lat} onChange={(e) => setNewArea(a => ({ ...a, lat: e.target.value }))}
                />
              </Field>
              <Field label="Longitude *">
                <input
                  type="text"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-400"
                  placeholder="75.0367"
                  value={newArea.lon} onChange={(e) => setNewArea(a => ({ ...a, lon: e.target.value }))}
                />
              </Field>
            </div>
            <Field label="Radius (km) *">
              <input
                type="number" min="0.1" step="0.1"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                placeholder="5"
                value={newArea.radiusKm} onChange={(e) => setNewArea(a => ({ ...a, radiusKm: e.target.value }))}
              />
            </Field>
            <button onClick={createArea}
              disabled={creatingArea || !newArea.name || !newArea.lat || !newArea.lon || !newArea.radiusKm}
              className="w-full py-2.5 bg-orange-500 text-white font-semibold rounded-xl hover:bg-orange-600 disabled:opacity-50 transition">
              {creatingArea ? 'Creating...' : '+ Add Restricted Area'}
            </button>
          </Card>

          <Card title="Existing Restricted Areas">
            {loadingAreas ? (
              <div className="text-sm text-slate-400 py-4 text-center">Loading...</div>
            ) : areas.length === 0 ? (
              <div className="text-sm text-slate-400 py-4 text-center">No restricted areas</div>
            ) : (
              <div className="divide-y divide-slate-50">
                {areas.map((area) => (
                  <div key={area.id} className="flex items-center justify-between py-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-800 text-sm">{area.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${area.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                          {area.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {area.lat.toFixed(4)}, {area.lon.toFixed(4)} · {area.radiusKm} km radius
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => toggleArea(area)}
                        className="text-xs px-2.5 py-1.5 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition">
                        {area.isActive ? 'Disable' : 'Enable'}
                      </button>
                      <button onClick={() => deleteArea(area)}
                        className="text-xs px-2.5 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition">
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 mb-4">
      <h3 className="font-semibold text-slate-700 text-sm uppercase tracking-wide mb-4">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      {children}
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${value ? 'bg-orange-500' : 'bg-slate-200'}`}
    >
      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition ${value ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}
