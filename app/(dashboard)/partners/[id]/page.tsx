'use client';

/**
 * One partner, and everything an operator can do to their account.
 *
 * Grouped by consequence rather than by data source: the things that move money
 * (wallet, COD settlement) are together and each asks for a reason, because each
 * one writes a row somebody will have to explain later. Blocking and password
 * reset sit apart at the bottom, under a heading that says what they do.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { apiRequest } from '@/lib/api';

const inr = (n: number) =>
  `₹${Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const ist = (d?: string | number | null) =>
  !d
    ? '—'
    : new Date(d).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });

interface Partner {
  id: string;
  name: string;
  ownerName?: string;
  email: string;
  phone?: string;
  city: string;
  businessType?: string;
  status: 'active' | 'blocked';
  walletBalance: number;
  createdAt?: string;
}

interface Detail {
  partner: Partner;
  stats: {
    ordersTotal: number;
    ordersThisMonth: number;
    delivered: number;
    cancelled: number;
    active: number;
    feesBilled: number;
    codOutstanding: number;
    codSettled: number;
    lastOrderAt: number | null;
  };
  transactions: Array<{
    id: string;
    type: string;
    amount: number;
    balanceAfter: number;
    orderId?: string | null;
    reason?: string | null;
    createdAt: string | null;
  }>;
  topupRequests: Array<{
    id: string;
    amount: number;
    utr: string;
    status: string;
    reason?: string | null;
    createdAt: string | null;
  }>;
}

interface CodLedger {
  outstanding: Array<{
    id: string;
    trackingNumber: string;
    codAmount: number;
    dropName?: string | null;
    deliveredAt: string | null;
  }>;
  outstandingTotal: number;
  settlements: Array<{
    id: string;
    amount: number;
    orderCount: number;
    method: string;
    reference?: string | null;
    settledAt: string | null;
  }>;
}

export default function PartnerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Detail | null>(null);
  const [cod, setCod] = useState<CodLedger | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'wallet' | 'cod' | 'orders'>('wallet');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, c] = await Promise.all([
        apiRequest<Detail>(`/admin/partners/${id}`),
        apiRequest<CodLedger>(`/admin/partners/${id}/cod`),
      ]);
      setData(d);
      setCod(c);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) {
    return <div className="p-6 text-sm text-slate-500">Loading partner…</div>;
  }
  if (!data) {
    return (
      <div className="p-6">
        <Link href="/partners" className="text-sm text-slate-500 hover:text-slate-800">
          ← All partners
        </Link>
        <div className="mt-4 text-sm text-red-600">This partner could not be loaded.</div>
      </div>
    );
  }

  const p = data.partner;
  const s = data.stats;

  return (
    <div className="p-6 space-y-5">
      <Link href="/partners" className="text-sm text-slate-500 hover:text-slate-800">
        ← All partners
      </Link>

      {/* identity */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-800">{p.name}</h1>
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                  p.status === 'active'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-red-100 text-red-700'
                }`}
              >
                {p.status}
              </span>
            </div>
            <div className="text-sm text-slate-500 mt-0.5">{p.email}</div>
            <div className="text-sm text-slate-500">
              {[p.city, p.businessType, p.ownerName, p.phone].filter(Boolean).join(' · ')}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              Partner since {ist(p.createdAt)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs font-medium text-slate-500">Wallet balance</div>
            <div
              className={`text-3xl font-black tabular-nums ${
                p.walletBalance < 0 ? 'text-red-600' : 'text-slate-800'
              }`}
            >
              {inr(p.walletBalance)}
            </div>
            {p.walletBalance < 0 ? (
              <div className="text-xs font-medium text-red-600">
                Negative — they cannot place orders
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* numbers */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Orders" value={String(s.ordersTotal)} sub={`${s.ordersThisMonth} this month`} />
        <Stat label="Live now" value={String(s.active)} sub={`${s.delivered} delivered`} />
        <Stat label="Fees billed" value={inr(s.feesBilled)} sub="cancelled orders excluded" />
        <Stat
          label="COD we owe them"
          value={inr(s.codOutstanding)}
          sub={`${inr(s.codSettled)} settled to date`}
          tone={s.codOutstanding > 0 ? 'warn' : undefined}
        />
      </div>

      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {([
          ['wallet', 'Wallet & top-ups'],
          ['cod', 'Cash collected'],
          ['orders', 'Orders'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              tab === key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'wallet' ? (
        <WalletTab merchantId={id} data={data} onChanged={load} />
      ) : tab === 'cod' ? (
        <CodTab merchantId={id} cod={cod} onChanged={load} />
      ) : (
        <OrdersTab merchantId={id} />
      )}

      <DangerZone partner={p} onChanged={load} />
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'warn';
}) {
  return (
    <div
      className={`bg-white rounded-xl border p-4 ${
        tone === 'warn' ? 'border-orange-300' : 'border-slate-200'
      }`}
    >
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div
        className={`mt-1 text-lg font-bold tabular-nums ${
          tone === 'warn' ? 'text-orange-600' : 'text-slate-800'
        }`}
      >
        {value}
      </div>
      {sub ? <div className="text-xs text-slate-400 mt-0.5">{sub}</div> : null}
    </div>
  );
}

// ── wallet ───────────────────────────────────────────────────────────────────

function WalletTab({
  merchantId,
  data,
  onChanged,
}: {
  merchantId: string;
  data: Detail;
  onChanged: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function adjust(sign: 1 | -1) {
    const value = Number(amount);
    if (!(value > 0)) {
      alert('Enter an amount above 0');
      return;
    }
    if (!reason.trim()) {
      alert('A reason is required — it goes on the ledger row');
      return;
    }
    if (
      !confirm(
        `${sign > 0 ? 'Add' : 'Remove'} ${inr(value)} ${sign > 0 ? 'to' : 'from'} ${data.partner.name}'s wallet?\n\nReason: ${reason.trim()}`
      )
    )
      return;

    setBusy(true);
    try {
      const res = await apiRequest<{ before: number; after: number }>(
        `/admin/partners/${merchantId}/wallet`,
        {
          method: 'POST',
          body: JSON.stringify({ amount: sign * value, reason: reason.trim() }),
        }
      );
      alert(`Done. Balance is now ${inr(res.after)}.`);
      setAmount('');
      setReason('');
      onChanged();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function review(requestId: string, action: 'approve' | 'reject') {
    let rejectReason: string | null = null;
    if (action === 'reject') {
      rejectReason = prompt('Why is this top-up being rejected? The partner will see this.');
      if (!rejectReason?.trim()) return;
    } else if (
      !confirm('Approve this top-up? The amount is credited to their wallet immediately.')
    ) {
      return;
    }

    try {
      await apiRequest(`/admin/partners/topups/${requestId}/review`, {
        method: 'POST',
        body: JSON.stringify({ action, reason: rejectReason ?? undefined }),
      });
      onChanged();
    } catch (e: any) {
      alert(e.message);
    }
  }

  const pending = data.topupRequests.filter((r) => r.status === 'pending');

  return (
    <div className="space-y-4">
      {pending.length > 0 ? (
        <div className="bg-white rounded-xl border border-orange-300 p-5">
          <h3 className="font-bold text-slate-800 mb-1">Top-ups waiting on you</h3>
          <p className="text-xs text-slate-500 mb-3">
            Check the UTR against the bank before approving. Approving credits the
            wallet straight away.
          </p>
          <div className="space-y-2">
            {pending.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 bg-orange-50 rounded-lg px-3 py-2.5"
              >
                <div>
                  <div className="font-bold text-slate-800 tabular-nums">{inr(r.amount)}</div>
                  <div className="text-xs text-slate-500">
                    UTR {r.utr} · requested {ist(r.createdAt)}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => review(r.id, 'approve')}
                    className="px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => review(r.id, 'reject')}
                    className="px-3 py-1.5 bg-white border border-red-200 text-red-600 text-xs font-semibold rounded-lg hover:bg-red-50"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="font-bold text-slate-800 mb-1">Manual adjustment</h3>
        <p className="text-xs text-slate-500 mb-3">
          For corrections and goodwill credits. Removing more than the balance is
          allowed — use it to claw back a top-up credited in error, and the wallet
          goes negative until they settle.
        </p>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Amount</label>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="numeric"
              placeholder="500"
              className="w-32 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-400"
            />
          </div>
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs font-semibold text-slate-500 mb-1">
              Reason (goes on the ledger)
            </label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Goodwill credit for failed delivery PWB-…"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-400"
            />
          </div>
          <button
            onClick={() => adjust(1)}
            disabled={busy}
            className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            Add
          </button>
          <button
            onClick={() => adjust(-1)}
            disabled={busy}
            className="px-4 py-2 bg-white border border-red-200 text-red-600 text-sm font-semibold rounded-lg hover:bg-red-50 disabled:opacity-50"
          >
            Remove
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200">
          <h3 className="font-bold text-slate-800">Passbook</h3>
          <p className="text-xs text-slate-500">Last 50 movements, newest first.</p>
        </div>
        {data.transactions.length === 0 ? (
          <div className="px-5 py-8 text-sm text-slate-500 text-center">Nothing yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2 font-semibold">When</th>
                  <th className="text-left px-4 py-2 font-semibold">Type</th>
                  <th className="text-left px-4 py-2 font-semibold">Reason</th>
                  <th className="text-right px-4 py-2 font-semibold">Amount</th>
                  <th className="text-right px-4 py-2 font-semibold">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.transactions.map((t) => (
                  <tr key={t.id}>
                    <td className="px-4 py-2 text-slate-500 whitespace-nowrap">
                      {ist(t.createdAt)}
                    </td>
                    <td className="px-4 py-2 text-slate-700 capitalize">{t.type}</td>
                    <td className="px-4 py-2 text-slate-500">
                      {t.orderId ? (
                        <Link
                          href={`/bookings/${t.orderId}`}
                          className="text-orange-600 hover:underline"
                        >
                          {t.reason || 'Order'}
                        </Link>
                      ) : (
                        t.reason || '—'
                      )}
                    </td>
                    <td
                      className={`px-4 py-2 text-right font-semibold tabular-nums ${
                        t.amount > 0 ? 'text-green-700' : 'text-slate-800'
                      }`}
                    >
                      {t.amount > 0 ? '+' : '−'} {inr(Math.abs(t.amount))}
                    </td>
                    <td className="px-4 py-2 text-right text-slate-500 tabular-nums">
                      {inr(t.balanceAfter)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── COD ──────────────────────────────────────────────────────────────────────

function CodTab({
  merchantId,
  cod,
  onChanged,
}: {
  merchantId: string;
  cod: CodLedger | null;
  onChanged: () => void;
}) {
  const [method, setMethod] = useState('bank');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  if (!cod) return <div className="text-sm text-slate-500">Loading ledger…</div>;

  async function settle() {
    if (
      !confirm(
        `Record ${inr(cod!.outstandingTotal)} paid back to this partner across ${cod!.outstanding.length} order(s)?\n\nThis marks those orders settled and cannot be undone from here.`
      )
    )
      return;
    setBusy(true);
    try {
      const res = await apiRequest<{ amount: number; orderCount: number }>(
        `/admin/partners/${merchantId}/cod/settle`,
        {
          method: 'POST',
          body: JSON.stringify({
            method,
            reference: reference.trim() || undefined,
            note: note.trim() || undefined,
          }),
        }
      );
      alert(`Settled ${inr(res.amount)} across ${res.orderCount} order(s).`);
      setReference('');
      setNote('');
      onChanged();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs font-medium text-slate-500">Cash we are holding</div>
            <div
              className={`text-3xl font-black tabular-nums ${
                cod.outstandingTotal > 0 ? 'text-orange-600' : 'text-slate-800'
              }`}
            >
              {inr(cod.outstandingTotal)}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              From {cod.outstanding.length} delivered order(s). Orders still in
              transit are not counted — nothing has been collected on them yet.
            </div>
          </div>
        </div>

        {cod.outstandingTotal > 0 ? (
          <div className="mt-4 pt-4 border-t border-slate-200 flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Paid by</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-400"
              >
                <option value="bank">Bank transfer</option>
                <option value="upi">UPI</option>
                <option value="cash">Cash</option>
                <option value="wallet">Added to their wallet</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                Reference / UTR
              </label>
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="428714905532"
                className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-400"
              />
            </div>
            <div className="flex-1 min-w-[180px]">
              <label className="block text-xs font-semibold text-slate-500 mb-1">Note</label>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Weekly settlement"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-400"
              />
            </div>
            <button
              onClick={settle}
              disabled={busy}
              className="px-4 py-2 bg-orange-500 text-white text-sm font-semibold rounded-lg hover:bg-orange-600 disabled:opacity-50"
            >
              {busy ? 'Recording…' : `Settle ${inr(cod.outstandingTotal)}`}
            </button>
          </div>
        ) : null}
      </div>

      {cod.outstanding.length > 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200">
            <h3 className="font-bold text-slate-800">Orders in that total</h3>
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              {cod.outstanding.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/bookings/${o.id}`}
                      className="font-semibold text-orange-600 hover:underline"
                    >
                      {o.trackingNumber}
                    </Link>
                    <div className="text-xs text-slate-400">{o.dropName || '—'}</div>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">
                    Delivered {ist(o.deliveredAt)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold text-slate-800 tabular-nums">
                    {inr(o.codAmount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200">
          <h3 className="font-bold text-slate-800">Payments made</h3>
        </div>
        {cod.settlements.length === 0 ? (
          <div className="px-5 py-8 text-sm text-slate-500 text-center">
            Nothing settled yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              {cod.settlements.map((x) => (
                <tr key={x.id}>
                  <td className="px-4 py-2.5 text-slate-700 capitalize">{x.method}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">
                    {x.orderCount} order(s)
                    {x.reference ? ` · ref ${x.reference}` : ''}
                    <div className="text-slate-400">{ist(x.settledAt)}</div>
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold text-green-700 tabular-nums">
                    {inr(x.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── orders ───────────────────────────────────────────────────────────────────

function OrdersTab({ merchantId }: { merchantId: string }) {
  const [orders, setOrders] = useState<any[] | null>(null);
  const [status, setStatus] = useState('');

  useEffect(() => {
    const q = new URLSearchParams();
    if (status) q.set('status', status);
    apiRequest<{ orders: any[] }>(`/admin/partners/${merchantId}/orders?${q.toString()}`)
      .then((r) => setOrders(r.orders || []))
      .catch((e) => alert(e.message));
  }, [merchantId, status]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200 flex flex-wrap gap-2 items-center">
        <h3 className="font-bold text-slate-800 mr-auto">Orders</h3>
        {['', 'Created', 'Picked', 'Shipped', 'Delivered', 'Cancelled'].map((s) => (
          <button
            key={s || 'all'}
            onClick={() => setStatus(s)}
            className={`px-2.5 py-1 rounded-full text-xs font-semibold transition ${
              status === s
                ? 'bg-orange-500 text-white'
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
          >
            {s || 'All'}
          </button>
        ))}
      </div>
      {orders == null ? (
        <div className="px-5 py-8 text-sm text-slate-500 text-center">Loading…</div>
      ) : orders.length === 0 ? (
        <div className="px-5 py-8 text-sm text-slate-500 text-center">No orders.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2 font-semibold">Order</th>
                <th className="text-left px-4 py-2 font-semibold">Drop</th>
                <th className="text-left px-4 py-2 font-semibold">Captain</th>
                <th className="text-left px-4 py-2 font-semibold">Status</th>
                <th className="text-right px-4 py-2 font-semibold">Fee</th>
                <th className="text-right px-4 py-2 font-semibold">COD</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/bookings/${o.id}`}
                      className="font-semibold text-orange-600 hover:underline"
                    >
                      {o.trackingNumber}
                    </Link>
                    <div className="text-xs text-slate-400">{ist(o.createdAt)}</div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 max-w-[220px] truncate">
                    {o.drop?.name ? `${o.drop.name} · ` : ''}
                    {o.drop?.address || '—'}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{o.riderName || '—'}</td>
                  <td className="px-4 py-2.5 text-slate-600">{o.status}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{inr(o.fee)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {o.codAmount > 0 ? inr(o.codAmount) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── account controls ─────────────────────────────────────────────────────────

function DangerZone({ partner, onChanged }: { partner: Partner; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: partner.name,
    ownerName: partner.ownerName || '',
    phone: partner.phone || '',
    city: partner.city,
    businessType: partner.businessType || '',
  });

  async function patch(body: Record<string, unknown>, confirmText?: string) {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(true);
    try {
      await apiRequest(`/admin/partners/${partner.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      setEditing(false);
      onChanged();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    const pw = prompt('New password for this partner (at least 8 characters):');
    if (!pw) return;
    if (pw.length < 8) {
      alert('Password must be at least 8 characters');
      return;
    }
    setBusy(true);
    try {
      await apiRequest(`/admin/partners/${partner.id}/password`, {
        method: 'POST',
        body: JSON.stringify({ password: pw }),
      });
      alert(
        `Password changed.\n\nSign-in: ${partner.email}\nPassword: ${pw}\n\nShare it over a channel they trust — it cannot be shown again.`
      );
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h3 className="font-bold text-slate-800 mb-3">Account</h3>

      {editing ? (
        <div className="space-y-3 mb-4">
          <div className="grid sm:grid-cols-2 gap-3">
            {(
              [
                ['name', 'Business name'],
                ['city', 'City'],
                ['ownerName', 'Contact person'],
                ['phone', 'Phone'],
                ['businessType', 'Business type'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block">
                <span className="block text-xs font-semibold text-slate-500 mb-1">{label}</span>
                <input
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-400"
                />
              </label>
            ))}
          </div>
          <p className="text-xs text-slate-400">
            The sign-in email is not editable — it identifies the account and its
            orders. Create a new partner if the business changes hands.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => patch(form)}
              disabled={busy}
              className="px-4 py-2 bg-orange-500 text-white text-sm font-semibold rounded-lg hover:bg-orange-600 disabled:opacity-50"
            >
              Save
            </button>
            <button
              onClick={() => setEditing(false)}
              className="px-4 py-2 bg-slate-100 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-200"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {!editing ? (
          <button
            onClick={() => setEditing(true)}
            className="px-4 py-2 bg-slate-100 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-200"
          >
            Edit details
          </button>
        ) : null}
        <button
          onClick={resetPassword}
          disabled={busy}
          className="px-4 py-2 bg-slate-100 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-200 disabled:opacity-50"
        >
          Set new password
        </button>
        {partner.status === 'active' ? (
          <button
            onClick={() =>
              patch(
                { status: 'blocked' },
                `Block ${partner.name}?\n\nThey will not be able to sign in or place orders. Orders already running are unaffected.`
              )
            }
            disabled={busy}
            className="px-4 py-2 bg-white border border-red-200 text-red-600 text-sm font-semibold rounded-lg hover:bg-red-50 disabled:opacity-50"
          >
            Block account
          </button>
        ) : (
          <button
            onClick={() => patch({ status: 'active' }, `Unblock ${partner.name}?`)}
            disabled={busy}
            className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            Unblock account
          </button>
        )}
      </div>
    </div>
  );
}
