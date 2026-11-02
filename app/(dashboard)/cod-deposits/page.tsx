'use client';

/**
 * Cash captains are carrying for shops, and have not deposited yet.
 *
 * Only portal orders appear here. On a customer booking paid in cash the fare
 * IS the cash, so the captain keeps their share and owes nothing back; on a
 * portal order the money belongs to the shop, so the captain holds all of it
 * and every rupee comes off their wallet until it is deposited.
 *
 * That makes this a queue with a cost to ignoring it: a captain sitting on
 * ₹3,000 of shop takings has a wallet ₹3,000 in the red and cannot withdraw
 * their own earnings. Grouped by captain for that reason — the question an
 * operator is answering is "who owes us, and how much", not "which order".
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiRequest } from '@/lib/api';

interface CodRecord {
  bookingId: string;
  trackingNumber?: string;
  riderId?: string;
  riderName?: string;
  riderPhone?: string;
  codAmount?: number;
  fare?: number;
  merchantName?: string;
  source?: string;
  drop?: { name?: string };
  codCollectedAt?: string;
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

/** The cash held is the shop's COD, never the delivery fare. */
const held = (r: CodRecord) => Number(r.codAmount) || 0;

export default function CodDepositsPage() {
  const [records, setRecords] = useState<CodRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ records: CodRecord[] }>('/bookings/admin/cod-pending');
      setRecords(res.records || []);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const byRider = useMemo(() => {
    const groups = new Map<
      string,
      { riderId: string; name: string; phone: string; total: number; rows: CodRecord[] }
    >();
    records.forEach((r) => {
      // Only portal orders raise a debt. Anything without a codAmount got here
      // some other way and must not be presented as money owed.
      if (held(r) <= 0) return;
      const key = r.riderId || 'unknown';
      const g = groups.get(key) ?? {
        riderId: key,
        name: r.riderName || 'Unknown captain',
        phone: r.riderPhone || '',
        total: 0,
        rows: [],
      };
      g.total += held(r);
      g.rows.push(r);
      groups.set(key, g);
    });
    return [...groups.values()].sort((a, b) => b.total - a.total);
  }, [records]);

  const grandTotal = byRider.reduce((s, g) => s + g.total, 0);

  async function settle(r: CodRecord) {
    if (
      !confirm(
        `Confirm that ${r.riderName || 'this captain'} has deposited ${inr(held(r))} for ${
          r.trackingNumber || r.bookingId
        }?\n\nTheir wallet goes back up by that amount.`
      )
    )
      return;
    setBusy(r.bookingId);
    try {
      await apiRequest(`/bookings/admin/${r.bookingId}/cod-settle`, { method: 'POST' });
      await load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function settleAll(group: (typeof byRider)[number]) {
    if (
      !confirm(
        `Confirm ${group.name} has deposited all ${inr(group.total)} across ${
          group.rows.length
        } order(s)?\n\nEach one is recorded separately.`
      )
    )
      return;
    setBusy(group.riderId);
    try {
      // One call per order, so a failure part-way leaves the rest still owed
      // rather than marking everything settled on a partial deposit.
      for (const r of group.rows) {
        await apiRequest(`/bookings/admin/${r.bookingId}/cod-settle`, { method: 'POST' });
      }
      await load();
    } catch (e: any) {
      alert(`${e.message}\n\nWhatever settled before this stays settled — reload to see.`);
      await load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Cash deposits</h1>
          <div className="mt-1 text-sm text-slate-500">
            Shop takings captains have collected and not yet handed in.
          </div>
        </div>
        <button
          onClick={load}
          className="px-4 py-2 bg-slate-100 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-200 transition"
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Tile label="Cash out with captains" value={inr(grandTotal)} tone={grandTotal > 0 ? 'warn' : undefined} />
        <Tile label="Captains holding cash" value={String(byRider.length)} />
        <Tile
          label="Orders"
          value={String(byRider.reduce((s, g) => s + g.rows.length, 0))}
        />
      </div>

      {grandTotal > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          A captain&apos;s wallet is reduced by whatever they are carrying, so anyone
          listed here cannot withdraw their own earnings until they deposit.
        </div>
      ) : null}

      {loading ? (
        <div className="text-sm text-slate-500 py-10 text-center">Loading…</div>
      ) : byRider.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 py-14 text-center">
          <div className="text-sm font-semibold text-slate-700">Nothing outstanding</div>
          <div className="text-sm text-slate-500 mt-1">
            Every rupee collected for a shop has been deposited.
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {byRider.map((g) => (
            <div key={g.riderId} className="bg-white rounded-xl border border-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <button
                  onClick={() => setOpen(open === g.riderId ? null : g.riderId)}
                  className="text-left"
                >
                  <div className="font-bold text-slate-800">{g.name}</div>
                  <div className="text-xs text-slate-500">
                    {g.phone ? `${g.phone} · ` : ''}
                    {g.rows.length} order{g.rows.length === 1 ? '' : 's'} ·{' '}
                    <span className="text-orange-600">
                      {open === g.riderId ? 'hide' : 'show'} orders
                    </span>
                  </div>
                </button>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-xs text-slate-500">Holding</div>
                    <div className="text-xl font-bold text-orange-600 tabular-nums">
                      {inr(g.total)}
                    </div>
                  </div>
                  <button
                    onClick={() => settleAll(g)}
                    disabled={busy === g.riderId}
                    className="px-4 py-2 bg-orange-500 text-white text-sm font-semibold rounded-lg hover:bg-orange-600 disabled:opacity-50"
                  >
                    {busy === g.riderId ? 'Recording…' : 'Deposited in full'}
                  </button>
                </div>
              </div>

              {open === g.riderId ? (
                <div className="border-t border-slate-100">
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-slate-100">
                      {g.rows.map((r) => (
                        <tr key={r.bookingId} className="hover:bg-slate-50">
                          <td className="px-5 py-2.5">
                            <Link
                              href={`/bookings/${r.bookingId}`}
                              className="font-semibold text-orange-600 hover:underline"
                            >
                              {r.trackingNumber || r.bookingId}
                            </Link>
                            <div className="text-xs text-slate-400">
                              {r.merchantName ? `${r.merchantName} · ` : ''}
                              collected {ist(r.codCollectedAt)}
                            </div>
                          </td>
                          <td className="px-5 py-2.5 text-right font-semibold text-slate-800 tabular-nums">
                            {inr(held(r))}
                          </td>
                          <td className="px-5 py-2.5 text-right">
                            <button
                              onClick={() => settle(r)}
                              disabled={busy === r.bookingId}
                              className="px-3 py-1.5 bg-slate-100 text-slate-600 text-xs font-semibold rounded-lg hover:bg-slate-200 disabled:opacity-50"
                            >
                              {busy === r.bookingId ? '…' : 'Deposited'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: 'warn' }) {
  return (
    <div
      className={`bg-white rounded-xl border p-4 ${
        tone === 'warn' ? 'border-orange-300' : 'border-slate-200'
      }`}
    >
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div
        className={`mt-1 text-xl font-bold tabular-nums ${
          tone === 'warn' ? 'text-orange-600' : 'text-slate-800'
        }`}
      >
        {value}
      </div>
    </div>
  );
}
