'use client';

/**
 * Push notifications to customers and to captains.
 *
 * Sends through the backend (/admin/notifications/*) rather than the HTML
 * admin's approach of writing a request document to Firestore for a worker to
 * pick up. Going direct means the admin sees the real delivered/failed counts
 * instead of "queued", and there is no second moving part to debug.
 *
 * Audience counts are of people who can actually receive something, not of
 * everyone on file. A number that includes devices with no push token is a
 * number that lies about reach.
 *
 * Customers: "everyone" uses the broadcast endpoint in one call; narrower
 * audiences have no bulk endpoint and are sent one at a time with visible
 * progress. Captains always go through one call that takes the exact list the
 * screen counted, so the send matches what was on screen.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '@/lib/api';

interface User {
  id: string;
  name: string;
  phoneNumber: string;
  city?: string;
  hasPushToken: boolean;
  totalBookings: number;
}

interface Rider {
  id: string;
  name: string;
  phone: string;
  city?: string;
  isOnline: boolean;
  isSuspended: boolean;
  hasPushToken: boolean;
}

type Who = 'customers' | 'riders';
type CustomerTarget = 'all' | 'city' | 'inactive' | 'single';
type RiderTarget = 'all' | 'city' | 'online' | 'single';

export default function NotificationsPage() {
  const [who, setWho] = useState<Who>('customers');

  const [users, setUsers] = useState<User[]>([]);
  const [riders, setRiders] = useState<Rider[]>([]);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const [customerTarget, setCustomerTarget] = useState<CustomerTarget>('all');
  const [riderTarget, setRiderTarget] = useState<RiderTarget>('all');
  const [city, setCity] = useState('');
  const [pickedId, setPickedId] = useState('');

  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [u, r] = await Promise.allSettled([
      apiRequest<{ users: User[] }>('/admin/users'),
      apiRequest<{ riders: Rider[] }>('/admin/notifications/riders'),
    ]);
    // The composer still works if either list fails; only the audience estimate
    // is affected, and the send itself reports the real numbers.
    if (u.status === 'fulfilled') setUsers(u.value.users || []);
    if (r.status === 'fulfilled') setRiders(r.value.riders || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Switching audience resets the narrower choices: a city picked for customers
  // means nothing for captains, and a selected person certainly does not.
  const switchWho = (next: Who) => {
    setWho(next);
    setCity('');
    setPickedId('');
    setResult(null);
    setError(null);
  };

  const cities = useMemo(() => {
    const source = who === 'customers' ? users.map((u) => u.city) : riders.map((r) => r.city);
    return Array.from(new Set(source.filter(Boolean))).sort() as string[];
  }, [who, users, riders]);

  /** Reachable recipients for the current selection. */
  const audience = useMemo(() => {
    if (who === 'customers') {
      const reachable = users.filter((u) => u.hasPushToken);
      switch (customerTarget) {
        case 'all':
          return reachable.map((u) => ({ id: u.id, label: `${u.name || 'Unnamed'} · ${u.phoneNumber}` }));
        case 'city':
          return city
            ? reachable.filter((u) => u.city === city).map((u) => ({ id: u.id, label: u.name }))
            : [];
        case 'inactive':
          return reachable.filter((u) => !u.totalBookings).map((u) => ({ id: u.id, label: u.name }));
        case 'single':
          return reachable.filter((u) => u.id === pickedId).map((u) => ({ id: u.id, label: u.name }));
      }
    }
    const reachable = riders.filter((r) => r.hasPushToken && !r.isSuspended);
    switch (riderTarget) {
      case 'all':
        return reachable.map((r) => ({ id: r.id, label: r.name }));
      case 'city':
        return city ? reachable.filter((r) => r.city === city).map((r) => ({ id: r.id, label: r.name })) : [];
      case 'online':
        return reachable.filter((r) => r.isOnline).map((r) => ({ id: r.id, label: r.name }));
      case 'single':
        return reachable.filter((r) => r.id === pickedId).map((r) => ({ id: r.id, label: r.name }));
    }
  }, [who, users, riders, customerTarget, riderTarget, city, pickedId]);

  const noun = who === 'customers' ? 'customer' : 'captain';
  const plural = audience.length === 1 ? noun : `${noun}s`;

  const send = async () => {
    const t = title.trim();
    const b = body.trim();
    if (!t || !b) {
      setError('Title and message are both required');
      return;
    }
    if (audience.length === 0) {
      setError(`No push-enabled ${noun}s match this audience`);
      return;
    }
    if (!confirm(`Send "${t}" to ${audience.length} ${plural}? This cannot be undone.`)) return;

    setSending(true);
    setError(null);
    setResult(null);
    setProgress(null);

    try {
      if (who === 'riders') {
        // One call with the exact list the screen counted, so nobody who came
        // online while the message was being typed is swept in.
        const res = await apiRequest<{ sent: number; failed: number; total: number }>(
          '/admin/notifications/riders',
          {
            method: 'POST',
            body: JSON.stringify({ title: t, body: b, riderIds: audience.map((a) => a.id) }),
          }
        );
        setResult(
          `Delivered to ${res.sent} of ${res.total}${res.failed ? ` · ${res.failed} unreachable` : ''}`
        );
      } else if (customerTarget === 'all') {
        const res = await apiRequest<{ sent: number; failed: number; total: number }>(
          '/admin/notifications/broadcast',
          { method: 'POST', body: JSON.stringify({ title: t, body: b }) }
        );
        setResult(`Delivered to ${res.sent} of ${res.total}${res.failed ? ` · ${res.failed} failed` : ''}`);
      } else {
        let sent = 0;
        let failed = 0;
        for (let i = 0; i < audience.length; i++) {
          try {
            await apiRequest('/admin/notifications/send', {
              method: 'POST',
              body: JSON.stringify({ userId: audience[i].id, title: t, body: b }),
            });
            sent++;
          } catch {
            failed++;
          }
          setProgress({ done: i + 1, total: audience.length });
        }
        setResult(`Delivered to ${sent} of ${audience.length}${failed ? ` · ${failed} failed` : ''}`);
      }
      setTitle('');
      setBody('');
    } catch (e: any) {
      setError(e.message || 'Failed to send');
    } finally {
      setSending(false);
      setProgress(null);
    }
  };

  const reachable =
    who === 'customers'
      ? users.filter((u) => u.hasPushToken).length
      : riders.filter((r) => r.hasPushToken && !r.isSuspended).length;
  const onFile = who === 'customers' ? users.length : riders.length;

  const pickList =
    who === 'customers'
      ? users.filter((u) => u.hasPushToken).map((u) => ({ id: u.id, label: `${u.name || 'Unnamed'} · ${u.phoneNumber}` }))
      : riders
          .filter((r) => r.hasPushToken && !r.isSuspended)
          .map((r) => ({ id: r.id, label: `${r.name || 'Unnamed'} · ${r.phone}` }));

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Notifications</h1>
        <p className="text-sm text-slate-500">
          Send a push notification. Sent immediately — there is no undo.
        </p>
      </div>

      {/* who it goes to */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {(
          [
            ['customers', 'Customers'],
            ['riders', 'Captains'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => switchWho(key)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition ${
              who === key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          { label: who === 'customers' ? 'Customers' : 'Captains', value: loading ? '…' : onFile },
          { label: 'Push enabled', value: loading ? '…' : reachable },
          { label: 'This audience', value: loading ? '…' : audience.length },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">{s.label}</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-slate-900">Compose</h2>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={65}
              placeholder={who === 'customers' ? 'Flat 20% off today' : 'Surge in Ratlam this evening'}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="mt-1 text-xs text-slate-400">
              {title.length}/65 — longer titles get truncated on Android
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Message</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              maxLength={240}
              placeholder={
                who === 'customers'
                  ? 'Use code FIRST100 on your first order.'
                  : 'Go online between 6 and 9 pm for extra orders.'
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="mt-1 text-xs text-slate-400">{body.length}/240</div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Audience</label>
            {who === 'customers' ? (
              <select
                value={customerTarget}
                onChange={(e) => setCustomerTarget(e.target.value as CustomerTarget)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="all">All customers</option>
                <option value="city">By city</option>
                <option value="inactive">Never ordered</option>
                <option value="single">A single customer</option>
              </select>
            ) : (
              <select
                value={riderTarget}
                onChange={(e) => setRiderTarget(e.target.value as RiderTarget)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="all">All captains</option>
                <option value="city">By city</option>
                <option value="online">Online right now</option>
                <option value="single">A single captain</option>
              </select>
            )}
            {who === 'riders' ? (
              <div className="mt-1 text-xs text-slate-400">
                Suspended captains are never included.
              </div>
            ) : null}
          </div>

          {(who === 'customers' ? customerTarget : riderTarget) === 'city' && (
            <select
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Select a city…</option>
              {cities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}

          {(who === 'customers' ? customerTarget : riderTarget) === 'single' && (
            <select
              value={pickedId}
              onChange={(e) => setPickedId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Select a {noun}…</option>
              {pickList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          )}

          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          )}
          {result && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {result}
            </div>
          )}

          <button
            onClick={send}
            disabled={sending || !title.trim() || !body.trim() || audience.length === 0}
            className="w-full rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {progress
              ? `Sending ${progress.done}/${progress.total}…`
              : sending
              ? 'Sending…'
              : `Send to ${audience.length} ${plural}`}
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-slate-900">Preview</h2>
          <p className="mt-1 text-xs text-slate-500">
            Roughly how it appears on an Android lock screen.
          </p>
          <div className="mt-4 rounded-xl bg-slate-900 p-4">
            <div className="rounded-xl bg-white p-3 shadow">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="flex h-4 w-4 items-center justify-center rounded bg-orange-500 text-[9px] text-white">
                  P
                </span>
                {who === 'customers' ? 'ParcelWalah' : 'Parcelwalah Captain'} · now
              </div>
              <div className="mt-1 font-semibold text-slate-900">
                {title.trim() || 'Notification title'}
              </div>
              <div className="text-sm text-slate-600">
                {body.trim() || 'Your message appears here.'}
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Only {noun}s with the app installed and notifications allowed can receive
            this — {reachable} of {onFile} right now.
          </div>

          {who === 'riders' ? (
            <div className="mt-2 space-y-2">
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <span className="font-semibold">Until the next captain app build:</span>{' '}
                this arrives with the delivery-offer alert sound. The quiet
                announcements channel ships with that build; on older ones Android
                falls back to the job-offer channel and there is no way to override
                it from here. Worth keeping announcements rare until then.
              </div>
              <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                A captain with the app open in front of them will not see this one
                on the current build either — it arrives normally when the app is
                in the background or closed, which is where a captain usually is.
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
