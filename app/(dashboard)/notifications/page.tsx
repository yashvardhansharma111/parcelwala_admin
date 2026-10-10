'use client';

/**
 * Push notifications to customers.
 *
 * Sends through the backend (/admin/notifications/*) rather than the HTML
 * admin's approach of writing a request document to Firestore for a worker to
 * pick up. Going direct means the admin sees the real delivered/failed counts
 * instead of "queued", and there is no second moving part to debug.
 *
 * "All customers" uses the broadcast endpoint in one call. Narrower audiences
 * have no bulk endpoint, so they are sent one at a time with visible progress —
 * fine at this scale, and honest about what is happening.
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

type Target = 'all' | 'city' | 'inactive' | 'single';

export default function NotificationsPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [target, setTarget] = useState<Target>('all');
  const [city, setCity] = useState('');
  const [userId, setUserId] = useState('');

  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const res = await apiRequest<{ users: User[] }>('/admin/users');
      setUsers(res.users || []);
    } catch {
      /* the composer still works; only the audience estimate is affected */
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const cities = useMemo(
    () => Array.from(new Set(users.map((u) => u.city).filter(Boolean))).sort() as string[],
    [users]
  );

  // Only push-enabled users can actually receive anything, so the count shown is
  // reachable recipients rather than a flattering total.
  const audience = useMemo(() => {
    const reachable = users.filter((u) => u.hasPushToken);
    switch (target) {
      case 'all':
        return reachable;
      case 'city':
        return city ? reachable.filter((u) => u.city === city) : [];
      case 'inactive':
        return reachable.filter((u) => !u.totalBookings);
      case 'single':
        return reachable.filter((u) => u.id === userId);
    }
  }, [users, target, city, userId]);

  const send = async () => {
    const t = title.trim();
    const b = body.trim();
    if (!t || !b) {
      setError('Title and message are both required');
      return;
    }
    if (audience.length === 0) {
      setError('No push-enabled recipients match this audience');
      return;
    }
    if (
      !confirm(
        `Send "${t}" to ${audience.length} customer${audience.length === 1 ? '' : 's'}? This cannot be undone.`
      )
    ) {
      return;
    }

    setSending(true);
    setError(null);
    setResult(null);
    setProgress(null);

    try {
      if (target === 'all') {
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

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Notifications</h1>
        <p className="text-sm text-slate-500">
          Send a push notification to customers. Sent immediately — there is no undo.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          { label: 'Customers', value: loadingUsers ? '…' : users.length },
          { label: 'Push enabled', value: loadingUsers ? '…' : users.filter((u) => u.hasPushToken).length },
          { label: 'This audience', value: loadingUsers ? '…' : audience.length },
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
              placeholder="Flat 20% off today"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="mt-1 text-xs text-slate-400">{title.length}/65 — longer titles get truncated on Android</div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Message</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              maxLength={240}
              placeholder="Use code FIRST100 on your first order."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="mt-1 text-xs text-slate-400">{body.length}/240</div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Audience</label>
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value as Target)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="all">All customers</option>
              <option value="city">By city</option>
              <option value="inactive">Never ordered</option>
              <option value="single">A single customer</option>
            </select>
          </div>

          {target === 'city' && (
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

          {target === 'single' && (
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Select a customer…</option>
              {users
                .filter((u) => u.hasPushToken)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name || 'Unnamed'} · {u.phoneNumber}
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
              : `Send to ${audience.length} customer${audience.length === 1 ? '' : 's'}`}
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-slate-900">Preview</h2>
          <p className="mt-1 text-xs text-slate-500">Roughly how it appears on an Android lock screen.</p>
          <div className="mt-4 rounded-xl bg-slate-900 p-4">
            <div className="rounded-xl bg-white p-3 shadow">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="flex h-4 w-4 items-center justify-center rounded bg-orange-500 text-[9px] text-white">
                  P
                </span>
                ParcelWalah · now
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
            Only customers with the app installed and notifications allowed can receive this —
            {' '}{users.filter((u) => u.hasPushToken).length} of {users.length} right now.
          </div>
        </div>
      </div>
    </div>
  );
}
