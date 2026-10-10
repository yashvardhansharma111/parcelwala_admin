'use client';

import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api';

interface Coupon {
  id: string;
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  minOrderAmount?: number;
  maxDiscountAmount?: number;
  maxUsage?: number;
  currentUsage: number;
  validFrom: string;
  validUntil: string;
  isActive: boolean;
  firstOrderOnly?: boolean;
  /** Usable only while the customer has fewer than this many orders. 1 == first order. */
  eligibleUntilOrders?: number;
}

type Audience = 'all' | 'first' | 'first5' | 'custom';

/** Audience choice -> the order-count window the backend enforces. */
const audienceToLimit = (a: Audience, custom: string): number | undefined => {
  if (a === 'first') return 1;
  if (a === 'first5') return 5;
  if (a === 'custom') return Number(custom) > 0 ? Number(custom) : undefined;
  return undefined;
};

const audienceLabel = (c: Coupon): string | null => {
  const n = c.eligibleUntilOrders ?? (c.firstOrderOnly ? 1 : 0);
  if (!n) return null;
  return n === 1 ? 'First order only' : `First ${n} orders`;
};

const todayISO = () => new Date().toISOString().slice(0, 10);
const inDaysISO = (d: number) =>
  new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

const emptyForm = {
  code: '',
  discountType: 'percentage' as 'percentage' | 'fixed',
  discountValue: '',
  minOrderAmount: '',
  maxDiscountAmount: '',
  maxUsage: '',
  validFrom: todayISO(),
  validUntil: inDaysISO(30),
  firstOrderOnly: false,
  audience: 'all' as Audience,
  audienceCustom: '',
};

export default function CouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive' | 'expired'>('all');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await apiRequest<{ coupons: Coupon[] } | Coupon[]>('/coupons');
      setCoupons(Array.isArray(res) ? res : res.coupons || []);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function createCoupon() {
    if (!form.code.trim() || !form.discountValue) return;
    setCreating(true);
    try {
      await apiRequest('/coupons', {
        method: 'POST',
        body: JSON.stringify({
          code: form.code.trim().toUpperCase(),
          discountType: form.discountType,
          discountValue: Number(form.discountValue),
          minOrderAmount: form.minOrderAmount ? Number(form.minOrderAmount) : undefined,
          maxDiscountAmount: form.maxDiscountAmount
            ? Number(form.maxDiscountAmount)
            : undefined,
          maxUsage: form.maxUsage ? Number(form.maxUsage) : undefined,
          validFrom: form.validFrom,
          validUntil: form.validUntil,
          firstOrderOnly: form.audience === 'first',
          eligibleUntilOrders: audienceToLimit(form.audience, form.audienceCustom),
          isActive: true,
        }),
      });
      setForm(emptyForm);
      load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(c: Coupon) {
    try {
      await apiRequest(`/coupons/${c.id}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive: !c.isActive }),
      });
      load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function remove(c: Coupon) {
    if (!confirm(`Delete coupon "${c.code}"? This cannot be undone.`)) return;
    try {
      await apiRequest(`/coupons/${c.id}`, { method: 'DELETE' });
      load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  const fmtDate = (d?: string) => (d ? new Date(d).toLocaleDateString() : '—');
  const isExpired = (c: Coupon) => new Date(c.validUntil) < new Date();

  const q = search.trim().toLowerCase();
  const shown = coupons.filter((c) => {
    if (q && !c.code.toLowerCase().includes(q)) return false;
    if (filter === 'active') return c.isActive && !isExpired(c);
    if (filter === 'inactive') return !c.isActive;
    if (filter === 'expired') return isExpired(c);
    return true;
  });

  const redemptions = coupons.reduce((n, c) => n + (c.currentUsage || 0), 0);
  // Burn is an estimate: a percentage coupon's real discount depends on each
  // order's value, which this list does not carry. Fixed coupons are exact.
  const burn = coupons.reduce(
    (n, c) =>
      n +
      (c.discountType === 'fixed'
        ? c.discountValue * (c.currentUsage || 0)
        : (c.maxDiscountAmount || 0) * (c.currentUsage || 0)),
    0
  );

  const exportCsv = () => {
    const header = ['Code', 'Type', 'Value', 'MinOrder', 'MaxDiscount', 'Used', 'Limit', 'Audience', 'From', 'Until', 'Active'];
    const lines = shown.map((c) =>
      [
        c.code,
        c.discountType,
        c.discountValue,
        c.minOrderAmount ?? '',
        c.maxDiscountAmount ?? '',
        c.currentUsage || 0,
        c.maxUsage ?? '',
        audienceLabel(c) || 'All customers',
        String(c.validFrom).slice(0, 10),
        String(c.validUntil).slice(0, 10),
        c.isActive ? 'yes' : 'no',
      ]
        .map((f) => `"${String(f).replace(/"/g, '""')}"`)
        .join(',')
    );
    const blob = new Blob([[header.join(','), ...lines].join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `parcelwalah-coupons-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h1 className="text-2xl font-bold text-slate-800">Coupons</h1>
        <button
          onClick={exportCsv}
          disabled={shown.length === 0}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Export CSV
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Total', value: coupons.length },
          { label: 'Active', value: coupons.filter((c) => c.isActive && !isExpired(c)).length },
          { label: 'Redemptions', value: redemptions },
          { label: 'Est. burn', value: `₹${burn.toLocaleString('en-IN')}` },
        ].map((s2) => (
          <div key={s2.label} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">{s2.label}</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">{s2.value}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search coupon code…"
          className="min-w-[200px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        {(['all', 'active', 'inactive', 'expired'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-lg px-3 py-2 text-sm font-medium capitalize transition ${
              filter === f
                ? 'bg-orange-500 text-white'
                : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-[400px_1fr] gap-5 items-start">
        {/* Create */}
        <Card title="Create Coupon">
          <Field label="Code *">
            <input
              className={inputCls}
              placeholder="e.g. FIRST50"
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Type *">
              <select
                className={inputCls}
                value={form.discountType}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    discountType: e.target.value as 'percentage' | 'fixed',
                  }))
                }
              >
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Flat (₹)</option>
              </select>
            </Field>
            <Field label={form.discountType === 'percentage' ? 'Percent *' : 'Amount ₹ *'}>
              <input
                type="number"
                min="1"
                className={inputCls}
                placeholder={form.discountType === 'percentage' ? '50' : '100'}
                value={form.discountValue}
                onChange={(e) => setForm((f) => ({ ...f, discountValue: e.target.value }))}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Min order ₹">
              <input
                type="number"
                className={inputCls}
                placeholder="optional"
                value={form.minOrderAmount}
                onChange={(e) => setForm((f) => ({ ...f, minOrderAmount: e.target.value }))}
              />
            </Field>
            <Field label="Max discount ₹">
              <input
                type="number"
                className={inputCls}
                placeholder="optional"
                value={form.maxDiscountAmount}
                onChange={(e) =>
                  setForm((f) => ({ ...f, maxDiscountAmount: e.target.value }))
                }
              />
            </Field>
          </div>

          <Field label="Total usage limit">
            <input
              type="number"
              className={inputCls}
              placeholder="leave blank for unlimited"
              value={form.maxUsage}
              onChange={(e) => setForm((f) => ({ ...f, maxUsage: e.target.value }))}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Valid from *">
              <input
                type="date"
                className={inputCls}
                value={form.validFrom}
                onChange={(e) => setForm((f) => ({ ...f, validFrom: e.target.value }))}
              />
            </Field>
            <Field label="Valid until *">
              <input
                type="date"
                className={inputCls}
                value={form.validUntil}
                onChange={(e) => setForm((f) => ({ ...f, validUntil: e.target.value }))}
              />
            </Field>
          </div>

          <Field label="Customer audience">
            <select
              className={inputCls}
              value={form.audience}
              onChange={(e) =>
                setForm((f) => ({ ...f, audience: e.target.value as Audience }))
              }
            >
              <option value="all">All customers</option>
              <option value="first">First order only</option>
              <option value="first5">First 5 orders</option>
              <option value="custom">Custom order count…</option>
            </select>
            <p className="text-xs text-slate-500 mt-1">
              Counts the customer&apos;s previous non-cancelled bookings.
            </p>
          </Field>

          {form.audience === 'custom' && (
            <Field label="Eligible until N orders">
              <input
                type="number"
                min={1}
                className={inputCls}
                placeholder="e.g. 3"
                value={form.audienceCustom}
                onChange={(e) => setForm((f) => ({ ...f, audienceCustom: e.target.value }))}
              />
            </Field>
          )}

          <button
            onClick={createCoupon}
            disabled={creating || !form.code.trim() || !form.discountValue}
            className="w-full py-2.5 bg-orange-500 text-white font-semibold rounded-xl hover:bg-orange-600 disabled:opacity-50 transition mt-2"
          >
            {creating ? 'Creating…' : '+ Create Coupon'}
          </button>
        </Card>

        {/* List */}
        <Card title={`All Coupons${shown.length ? ` (${shown.length})` : ''}`}>
          {loading ? (
            <div className="text-sm text-slate-400 py-6 text-center">Loading…</div>
          ) : shown.length === 0 ? (
            <div className="text-sm text-slate-400 py-6 text-center">
              {coupons.length === 0
                ? 'No coupons yet — create one on the left.'
                : 'No coupons match this search or filter.'}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {shown.map((c) => (
                <div key={c.id} className="py-3.5 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-slate-800">{c.code}</span>
                      <Pill on={c.isActive && !isExpired(c)}>
                        {isExpired(c) ? 'Expired' : c.isActive ? 'Active' : 'Disabled'}
                      </Pill>
                      {audienceLabel(c) && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-orange-100 text-orange-700">
                          {audienceLabel(c)}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-slate-600 mt-1">
                      {c.discountType === 'percentage'
                        ? `${c.discountValue}% off`
                        : `₹${c.discountValue} off`}
                      {c.maxDiscountAmount ? ` (max ₹${c.maxDiscountAmount})` : ''}
                      {c.minOrderAmount ? ` · min order ₹${c.minOrderAmount}` : ''}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {fmtDate(c.validFrom)} – {fmtDate(c.validUntil)} · used{' '}
                      {c.currentUsage}
                      {c.maxUsage ? ` / ${c.maxUsage}` : ''}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => toggleActive(c)}
                      className="text-xs px-2.5 py-1.5 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition"
                    >
                      {c.isActive ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      onClick={() => remove(c)}
                      className="text-xs px-2.5 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

const inputCls =
  'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400';

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
      <h3 className="font-semibold text-slate-700 text-sm uppercase tracking-wide mb-4">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className="block text-xs font-medium text-slate-600 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function Pill({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
        on ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
      }`}
    >
      {children}
    </span>
  );
}
