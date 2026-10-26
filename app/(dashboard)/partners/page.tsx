'use client';

/**
 * Portal manager — the businesses we supply fleet to.
 *
 * The float tile is the one to watch: it is the sum of every partner's prepaid
 * wallet, which is money we have taken and not yet delivered against. Pending
 * top-ups sit next to it because a partner waiting on a verification cannot
 * place orders at all.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiRequest } from '@/lib/api';

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

interface Summary {
  total: number;
  active: number;
  blocked: number;
  walletFloat: number;
  pendingTopups: number;
  pendingTopupValue: number;
}

const inr = (n: number) =>
  `₹${Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function PartnersPage() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'blocked'>('all');
  const [city, setCity] = useState('');

  const [showCreate, setShowCreate] = useState(false);

  const fetchPartners = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (search.trim()) q.set('search', search.trim());
      if (status !== 'all') q.set('status', status);
      if (city) q.set('city', city);
      const res = await apiRequest<{ partners: Partner[]; summary: Summary }>(
        `/admin/partners?${q.toString()}`
      );
      setPartners(res.partners || []);
      setSummary(res.summary || null);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }, [search, status, city]);

  useEffect(() => {
    // Debounced so typing in the search box is one request, not one per letter.
    const t = setTimeout(fetchPartners, search ? 350 : 0);
    return () => clearTimeout(t);
  }, [fetchPartners, search]);

  const cities = useMemo(
    () => Array.from(new Set(partners.map((p) => p.city).filter(Boolean))).sort(),
    [partners]
  );

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Portal partners</h1>
          <div className="mt-1 text-sm text-slate-500">
            Businesses that place orders through the partner portal.
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            href="/rate-cards"
            className="px-4 py-2 bg-slate-100 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-200 transition"
          >
            Rate cards
          </Link>
          <Link
            href="/partner-topups"
            className="px-4 py-2 bg-slate-100 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-200 transition"
          >
            Top-ups
            {summary && summary.pendingTopups > 0 ? (
              <span className="ml-2 px-1.5 py-0.5 rounded-full bg-orange-500 text-white text-xs">
                {summary.pendingTopups}
              </span>
            ) : null}
          </Link>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 bg-orange-500 text-white text-sm font-semibold rounded-lg hover:bg-orange-600 transition"
          >
            + Add partner
          </button>
        </div>
      </div>

      {summary ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <Tile label="Partners" value={String(summary.total)} sub={`${summary.active} active`} />
          <Tile
            label="Blocked"
            value={String(summary.blocked)}
            tone={summary.blocked > 0 ? 'warn' : undefined}
          />
          <Tile
            label="Wallet float"
            value={inr(summary.walletFloat)}
            sub="prepaid, not yet delivered against"
          />
          <Tile
            label="Top-ups waiting"
            value={String(summary.pendingTopups)}
            sub={summary.pendingTopups > 0 ? inr(summary.pendingTopupValue) : 'nothing pending'}
            tone={summary.pendingTopups > 0 ? 'warn' : undefined}
          />
        </div>
      ) : null}

      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-semibold text-slate-500 mb-1">Search</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Business, email, phone or owner"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-400"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">City</label>
          <select
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-400"
          >
            <option value="">All cities</option>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          {(['all', 'active', 'blocked'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium capitalize transition ${
                status === s ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-slate-500 py-10 text-center">Loading partners…</div>
      ) : partners.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 py-14 text-center">
          <div className="text-sm font-semibold text-slate-700">No partners match</div>
          <div className="text-sm text-slate-500 mt-1">
            {search || city || status !== 'all'
              ? 'Try clearing the filters.'
              : 'Add the first business to give them portal access.'}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Business</th>
                  <th className="text-left px-4 py-3 font-semibold">City</th>
                  <th className="text-left px-4 py-3 font-semibold">Contact</th>
                  <th className="text-right px-4 py-3 font-semibold">Wallet</th>
                  <th className="text-left px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {partners.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-800">{p.name}</div>
                      <div className="text-xs text-slate-500">{p.email}</div>
                      {p.businessType ? (
                        <div className="text-xs text-slate-400">{p.businessType}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{p.city || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">
                      <div>{p.ownerName || '—'}</div>
                      <div className="text-xs text-slate-400">{p.phone || ''}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-800 tabular-nums">
                      {inr(p.walletBalance)}
                      {p.walletBalance < 0 ? (
                        <div className="text-xs font-medium text-red-600">owes us</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          p.status === 'active'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/partners/${p.id}`}
                        className="text-orange-600 font-semibold hover:underline"
                      >
                        Manage →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showCreate ? (
        <CreatePartnerModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            fetchPartners();
          }}
        />
      ) : null}
    </div>
  );
}

function Tile({
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
        className={`mt-1 text-xl font-bold tabular-nums ${
          tone === 'warn' ? 'text-orange-600' : 'text-slate-800'
        }`}
      >
        {value}
      </div>
      {sub ? <div className="text-xs text-slate-400 mt-0.5">{sub}</div> : null}
    </div>
  );
}

/**
 * New partner.
 *
 * The password is set here and shown back once, because there is no email
 * delivery for it — whoever creates the account is the one who passes it on.
 * An opening balance is optional and goes through the wallet adjustment path so
 * it lands in the passbook like any other credit.
 */
function CreatePartnerModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    ownerName: '',
    phone: '',
    city: '',
    businessType: '',
    openingBalance: '',
  });
  const [saving, setSaving] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await apiRequest('/admin/partners', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          openingBalance: Number(form.openingBalance) || 0,
        }),
      });
      alert(
        `Partner created.\n\nSign-in: ${form.email}\nPassword: ${form.password}\n\n` +
          'Share these over a channel they trust — the password is not stored in readable form and cannot be shown again.'
      );
      onCreated();
    } catch (err: any) {
      alert(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="font-bold text-slate-800">Add a portal partner</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            They sign in at the partner portal with this email and password.
          </p>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3">
          <Row label="Business name" required>
            <input value={form.name} onChange={set('name')} className={field} required />
          </Row>
          <div className="grid sm:grid-cols-2 gap-3">
            <Row label="City" required hint="Must have a rate card to place orders.">
              <input value={form.city} onChange={set('city')} className={field} required />
            </Row>
            <Row label="Business type">
              <input
                value={form.businessType}
                onChange={set('businessType')}
                placeholder="Grocery, Pharmacy…"
                className={field}
              />
            </Row>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Row label="Contact person">
              <input value={form.ownerName} onChange={set('ownerName')} className={field} />
            </Row>
            <Row label="Phone">
              <input value={form.phone} onChange={set('phone')} className={field} />
            </Row>
          </div>
          <Row label="Sign-in email" required>
            <input
              type="email"
              value={form.email}
              onChange={set('email')}
              className={field}
              required
            />
          </Row>
          <Row label="Password" required hint="At least 8 characters.">
            <input
              value={form.password}
              onChange={set('password')}
              minLength={8}
              className={field}
              required
            />
          </Row>
          <Row
            label="Opening wallet balance"
            hint="Optional. Appears in their passbook as a credit."
          >
            <input
              value={form.openingBalance}
              onChange={set('openingBalance')}
              inputMode="numeric"
              placeholder="0"
              className={field}
            />
          </Row>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2.5 bg-orange-500 text-white font-semibold rounded-lg hover:bg-orange-600 disabled:opacity-50"
            >
              {saving ? 'Creating…' : 'Create partner'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-100 text-slate-600 font-medium rounded-lg hover:bg-slate-200"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const field =
  'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-400';

function Row({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-slate-500 mb-1">
        {label}
        {required ? <span className="text-orange-500"> *</span> : null}
      </span>
      {children}
      {hint ? <span className="block text-xs text-slate-400 mt-1">{hint}</span> : null}
    </label>
  );
}
