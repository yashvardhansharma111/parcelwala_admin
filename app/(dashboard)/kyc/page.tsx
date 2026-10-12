'use client';

/**
 * KYC review queue.
 *
 * The old review modal showed only Approve / Reject — an admin had no way to see
 * what the rider had actually submitted, so approvals were made blind and a
 * rider missing one document could only be told "rejected" with no specifics.
 *
 * This shows every field and document, names exactly what is missing, and puts
 * the rider's phone number next to it so they can be called and asked for it.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '@/lib/api';

interface Rider {
  userId: string;
  name: string;
  phone: string;
  city?: string;
  vehicleType?: string;
  vehicleNumber?: string;
  licenseNumber?: string;
  aadhaarLast4?: string;
  kycStatus?: 'pending' | 'submitted' | 'approved' | 'rejected';
  kycSubmittedAt?: string;
  isActive?: boolean;

  panVerified?: boolean;
  panNumber?: string;
  panName?: string;
  dlVerified?: boolean;
  dlName?: string;
  dlValidUpto?: string;
  aadhaarVerified?: boolean;
  /** Provider's own word for an unfinished DigiLocker: PENDING, EXPIRED, FAILED. */
  digilockerStatus?: string;
  digilockerCheckedAt?: string;
  aadhaarName?: string;

  selfieUrl?: string;
  licensePhotoUrl?: string;
  aadhaarPhotoUrl?: string;
  rcPhotoUrl?: string;
}

const DOCS = [
  { key: 'selfieUrl', label: 'Selfie' },
  { key: 'licensePhotoUrl', label: 'Driving licence' },
  { key: 'aadhaarPhotoUrl', label: 'Aadhaar' },
  { key: 'rcPhotoUrl', label: 'Vehicle RC' },
] as const;

const CHECKS = [
  { key: 'panVerified', label: 'PAN' },
  { key: 'dlVerified', label: 'Driving licence' },
  { key: 'aadhaarVerified', label: 'Aadhaar (DigiLocker)' },
] as const;

const STATUS_STYLE: Record<string, string> = {
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-rose-100 text-rose-700',
  submitted: 'bg-amber-100 text-amber-700',
  pending: 'bg-slate-100 text-slate-600',
};

/** Everything still outstanding, phrased so it can be read out on a call. */
function missingItems(r: Rider): string[] {
  const out: string[] = [];
  DOCS.forEach((d) => {
    if (!r[d.key]) out.push(`${d.label} photo`);
  });
  CHECKS.forEach((c) => {
    if (!r[c.key]) out.push(`${c.label} verification`);
  });
  if (!r.vehicleNumber) out.push('Vehicle number');
  if (!r.city) out.push('City');
  return out;
}

const fmt = (v?: string) => {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('en-IN', { dateStyle: 'medium' });
};

/** +91XXXXXXXXXX -> digits only, for tel: and wa.me links. */
const digits = (p?: string) => (p || '').replace(/\D/g, '');

export default function KycPage() {
  const [riders, setRiders] = useState<Rider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'queue' | 'approved' | 'rejected' | 'all'>('queue');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Rider | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<{ url: string; label: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{ riders: Rider[] }>('/admin/riders');
      setRiders(res.riders || []);
    } catch (e: any) {
      setError(e.message || 'Could not load riders');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return riders
      .filter((r) => {
        const st = r.kycStatus || 'pending';
        if (filter === 'queue') return st === 'pending' || st === 'submitted';
        if (filter === 'all') return true;
        return st === filter;
      })
      .filter(
        (r) =>
          !q ||
          r.name?.toLowerCase().includes(q) ||
          r.phone?.includes(q) ||
          r.city?.toLowerCase().includes(q)
      );
  }, [riders, filter, search]);

  const review = async (action: 'approved' | 'rejected') => {
    if (!selected) return;
    if (action === 'rejected' && !reason.trim()) {
      alert('Give a reason — the rider is told this.');
      return;
    }
    setSaving(true);
    try {
      await apiRequest(`/admin/riders/${selected.userId}/kyc-review`, {
        method: 'POST',
        body: JSON.stringify({ action, rejectionReason: reason.trim() || undefined }),
      });
      setSelected(null);
      setReason('');
      await load();
    } catch (e: any) {
      alert(e.message || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  /** Pre-fills the rejection box with exactly what is outstanding. */
  const useMissingAsReason = () => {
    if (!selected) return;
    const m = missingItems(selected);
    setReason(m.length ? `Please complete: ${m.join(', ')}.` : '');
  };

  const queueCount = riders.filter(
    (r) => (r.kycStatus || 'pending') === 'pending' || r.kycStatus === 'submitted'
  ).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">KYC review</h1>
          <p className="text-sm text-slate-500">
            {loading ? 'Loading…' : `${queueCount} awaiting review · ${rows.length} shown`}
          </p>
        </div>
        <button
          onClick={load}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, phone, city…"
          className="min-w-[200px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        {(['queue', 'approved', 'rejected', 'all'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-lg px-3 py-2 text-sm font-medium capitalize ${
              filter === f
                ? 'bg-orange-500 text-white'
                : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Rider</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">City</th>
              <th className="px-4 py-3">Docs</th>
              <th className="px-4 py-3">Checks</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                  Nothing here
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const docs = DOCS.filter((d) => r[d.key]).length;
                const checks = CHECKS.filter((c) => r[c.key]).length;
                const st = r.kycStatus || 'pending';
                return (
                  <tr key={r.userId} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {r.name || 'Unnamed'}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{r.phone}</td>
                    <td className="px-4 py-3 text-slate-600">{r.city || '—'}</td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          docs === DOCS.length ? 'text-emerald-600' : 'text-amber-600'
                        }
                      >
                        {docs}/{DOCS.length}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          checks === CHECKS.length ? 'text-emerald-600' : 'text-amber-600'
                        }
                      >
                        {checks}/{CHECKS.length}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium capitalize ${STATUS_STYLE[st]}`}
                      >
                        {st}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => {
                          setSelected(r);
                          setReason('');
                        }}
                        className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600"
                      >
                        Review
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── review drawer ───────────────────────────────────────────────────── */}
      {selected && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4">
          <div className="mx-auto max-w-3xl rounded-xl bg-white p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">
                  {selected.name || 'Unnamed rider'}
                </h2>
                <p className="text-sm text-slate-500">
                  {selected.city || 'No city'} · submitted {fmt(selected.kycSubmittedAt)}
                </p>
              </div>
              <div className="flex gap-2">
                <a
                  href={`tel:${digits(selected.phone)}`}
                  className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
                >
                  Call {selected.phone}
                </a>
                <a
                  href={`https://wa.me/${digits(selected.phone)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-emerald-500 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
                >
                  WhatsApp
                </a>
              </div>
            </div>

            {/* what is missing — the reason this screen exists */}
            {(() => {
              const missing = missingItems(selected);
              return missing.length ? (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="text-sm font-semibold text-amber-900">
                    {missing.length} item{missing.length === 1 ? '' : 's'} still missing
                  </p>
                  <ul className="mt-1 list-inside list-disc text-sm text-amber-800">
                    {missing.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                  <button
                    onClick={useMissingAsReason}
                    className="mt-2 rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                  >
                    Use this as the rejection message
                  </button>
                </div>
              ) : (
                <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
                  Everything submitted — nothing outstanding.
                </div>
              );
            })()}

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-900">Details</h3>
                <dl className="space-y-1.5 text-sm">
                  {[
                    ['Phone', selected.phone],
                    ['City', selected.city],
                    ['Vehicle', [selected.vehicleType, selected.vehicleNumber].filter(Boolean).join(' · ')],
                    ['Licence no.', selected.licenseNumber],
                    ['Licence valid to', selected.dlValidUpto],
                    ['Name on DL', selected.dlName],
                    ['PAN', selected.panNumber],
                    ['Name on PAN', selected.panName],
                    ['Aadhaar last 4', selected.aadhaarLast4],
                  ].map(([k, v]) => (
                    <div key={k as string} className="flex justify-between gap-3">
                      <dt className="text-slate-500">{k}</dt>
                      <dd className="text-right font-medium text-slate-900">{v || '—'}</dd>
                    </div>
                  ))}
                </dl>

                {/* A mismatch between these is worth a human look before approving. */}
                {selected.panName &&
                  selected.dlName &&
                  selected.panName.replace(/\s+/g, ' ').trim().toLowerCase() !==
                    selected.dlName.replace(/\s+/g, ' ').trim().toLowerCase() && (
                    <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
                      Name on PAN and DL differ — check before approving.
                    </p>
                  )}
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-900">Verifications</h3>
                <div className="space-y-1.5">
                  {CHECKS.map((c) => (
                    <div
                      key={c.key}
                      className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    >
                      <span className="text-slate-700">
                        {c.label}
                        {/* "Not done" alone cannot tell apart a rider who never
                            started from one who abandoned it halfway — and that
                            changes what you say when you call them. */}
                        {c.key === 'aadhaarVerified' && !selected.aadhaarVerified && selected.digilockerStatus && (
                          <span className="ml-2 text-xs text-slate-400">
                            {selected.digilockerStatus === 'PENDING'
                              ? 'started, not completed'
                              : selected.digilockerStatus.toLowerCase()}
                          </span>
                        )}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          selected[c.key]
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-rose-100 text-rose-700'
                        }`}
                      >
                        {selected[c.key] ? 'Verified' : 'Not done'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <h3 className="mb-2 mt-5 text-sm font-semibold text-slate-900">Documents</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {DOCS.map((d) => {
                const url = selected[d.key];
                return (
                  <div key={d.key}>
                    {url ? (
                      <button
                        onClick={() => setPreview({ url: url as string, label: d.label })}
                        className="block w-full overflow-hidden rounded-lg border border-slate-200"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url as string}
                          alt={d.label}
                          className="h-28 w-full bg-slate-100 object-cover"
                        />
                      </button>
                    ) : (
                      <div className="flex h-28 w-full items-center justify-center rounded-lg border border-dashed border-rose-300 bg-rose-50 text-xs font-medium text-rose-600">
                        Not uploaded
                      </div>
                    )}
                    <p className="mt-1 text-center text-xs text-slate-600">{d.label}</p>
                  </div>
                );
              })}
            </div>

            <div className="mt-5">
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Message to rider (required to reject)
              </label>
              <textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Tell them exactly what to fix."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                onClick={() => setSelected(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
              >
                Close
              </button>
              <button
                onClick={() => review('rejected')}
                disabled={saving}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving ? '…' : 'Reject'}
              </button>
              <button
                onClick={() => review('approved')}
                disabled={saving}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving ? '…' : 'Approve'}
              </button>
            </div>
          </div>
        </div>
      )}

      {preview && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setPreview(null)}
        >
          <div className="max-h-full max-w-3xl overflow-auto">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview.url} alt={preview.label} className="max-h-[80vh] rounded-lg" />
            <p className="mt-2 text-center text-sm text-white">{preview.label} — tap to close</p>
          </div>
        </div>
      )}
    </div>
  );
}
