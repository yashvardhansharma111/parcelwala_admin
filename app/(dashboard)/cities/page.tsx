'use client';

/**
 * City control — launch playbook and targets vs actuals on one screen.
 *
 * Actuals are derived from bookings and riders on each request rather than
 * stored counters, so the numbers can never drift away from reality.
 */

import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api';

type Stage = 'planned' | 'launching' | 'live' | 'paused';

interface ChecklistItem {
  key: string;
  label: string;
  done: boolean;
}

interface CityMetrics {
  id: string;
  name: string;
  state: string;
  stage: Stage;
  isActive: boolean;
  launchDate: string | null;
  notes: string;
  targetRiders: number | null;
  targetOrdersPerDay: number | null;
  baseFare: number | null;
  perKmRate: number | null;
  minFare: number | null;
  baseKmIncluded: number | null;
  waitingPerMin: number | null;
  handlingFee: number | null;
  intercityDocFare: number | null;
  intercityUpto3Fare: number | null;
  intercityAbove3Fare: number | null;
  intercityGstPct: number | null;
  riderBasePerOrder: number | null;
  riderTier1UptoKm: number | null;
  riderTier1PerKm: number | null;
  riderTier2UptoKm: number | null;
  riderTier2PerKm: number | null;
  riderTier3PerKm: number | null;
  riderPerMinute: number | null;
  checklist: ChecklistItem[];
  actual: {
    riders: number;
    ridersApproved: number;
    ridersOnline: number;
    orders: number;
    ordersPerDay: number;
    delivered: number;
    cancelled: number;
    revenue: number;
  };
}

interface Unmanaged {
  name: string;
  riders: number;
  orders: number;
}

const STAGE_STYLE: Record<Stage, string> = {
  planned: 'bg-slate-100 text-slate-600',
  launching: 'bg-amber-100 text-amber-700',
  live: 'bg-emerald-100 text-emerald-700',
  paused: 'bg-rose-100 text-rose-700',
};

/** Pricing presets — a starting point per market type, editable after applying. */
type RateCard = {
  baseFare: number;
  baseKmIncluded: number;
  perKmRate: number;
  waitingPerMin: number;
  handlingFee: number;
  minFare: number;
};

const PRESETS: Record<string, Partial<RateCard>> = {
  'Tier-3 town': { baseFare: 25, baseKmIncluded: 2, perKmRate: 7, waitingPerMin: 1, handlingFee: 0, minFare: 30 },
  'Tier-2 city': { baseFare: 30, baseKmIncluded: 2, perKmRate: 8, waitingPerMin: 2, handlingFee: 10, minFare: 40 },
  'Dense metro': { baseFare: 40, baseKmIncluded: 2, perKmRate: 10, waitingPerMin: 3, handlingFee: 15, minFare: 55 },
};

/** Hyperlocal (C2C) is priced by distance. */
const HYPERLOCAL_FIELDS: { key: keyof CityMetrics; label: string; hint: string }[] = [
  { key: 'baseFare', label: 'Base fare', hint: '₹' },
  { key: 'baseKmIncluded', label: 'Km included', hint: 'km' },
  { key: 'perKmRate', label: 'Per km after', hint: '₹/km' },
  { key: 'waitingPerMin', label: 'Waiting', hint: '₹/min' },
  { key: 'handlingFee', label: 'Handling', hint: '₹' },
  { key: 'minFare', label: 'Minimum fare', hint: '₹' },
];

/** Intercity is a flat rate by weight band — nothing to do with distance. */
const INTERCITY_FIELDS: { key: keyof CityMetrics; label: string; hint: string }[] = [
  { key: 'intercityDocFare', label: 'Documents', hint: '₹ flat' },
  { key: 'intercityUpto3Fare', label: 'Up to 3 kg', hint: '₹ flat' },
  { key: 'intercityAbove3Fare', label: 'Above 3 kg', hint: '₹ flat' },
  { key: 'intercityGstPct', label: 'GST', hint: '%' },
];

/** What the rider earns — shown to them in the app's Rate Card screen. */
const RIDER_FIELDS: { key: keyof CityMetrics; label: string; hint: string }[] = [
  { key: 'riderBasePerOrder', label: 'Base per order', hint: '₹' },
  { key: 'riderPerMinute', label: 'Time + waiting', hint: '₹/min' },
  { key: 'riderTier1UptoKm', label: 'Band 1 up to', hint: 'km' },
  { key: 'riderTier1PerKm', label: 'Band 1 rate', hint: '₹/km' },
  { key: 'riderTier2UptoKm', label: 'Band 2 up to', hint: 'km' },
  { key: 'riderTier2PerKm', label: 'Band 2 rate', hint: '₹/km' },
  { key: 'riderTier3PerKm', label: 'Beyond band 2', hint: '₹/km' },
];

const RATE_FIELDS = [...HYPERLOCAL_FIELDS, ...INTERCITY_FIELDS, ...RIDER_FIELDS];

function Progress({ actual, target }: { actual: number; target: number | null }) {
  if (!target) {
    return <span className="text-sm text-slate-400">{actual} · no target</span>;
  }
  const pct = Math.min(100, Math.round((actual / target) * 100));
  const tone = pct >= 100 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-rose-500';
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-semibold text-slate-900">{actual}</span>
        <span className="text-xs text-slate-500">
          of {target} · {pct}%
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function CitiesPage() {
  const [cities, setCities] = useState<CityMetrics[]>([]);
  const [unmanaged, setUnmanaged] = useState<Unmanaged[]>([]);
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<CityMetrics | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{ cities: CityMetrics[]; unmanaged: Unmanaged[] }>(
        `/admin/cities/metrics?days=${days}`
      );
      setCities(res.cities || []);
      setUnmanaged(res.unmanaged || []);
    } catch (e: any) {
      setError(e.message || 'Could not load city metrics');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  const addCity = async (name: string) => {
    try {
      await apiRequest('/admin/cities', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      await load();
    } catch (e: any) {
      alert(e.message || 'Could not add city');
    }
  };

  const savePlaybook = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await apiRequest(`/admin/cities/${editing.id}/playbook`, {
        method: 'PATCH',
        body: JSON.stringify({
          stage: editing.stage,
          launchDate: editing.launchDate,
          targetRiders: editing.targetRiders,
          targetOrdersPerDay: editing.targetOrdersPerDay,
          baseFare: editing.baseFare,
          perKmRate: editing.perKmRate,
          minFare: editing.minFare,
          baseKmIncluded: editing.baseKmIncluded,
          waitingPerMin: editing.waitingPerMin,
          handlingFee: editing.handlingFee,
          intercityDocFare: editing.intercityDocFare,
          intercityUpto3Fare: editing.intercityUpto3Fare,
          intercityAbove3Fare: editing.intercityAbove3Fare,
          intercityGstPct: editing.intercityGstPct,
          riderBasePerOrder: editing.riderBasePerOrder,
          riderTier1UptoKm: editing.riderTier1UptoKm,
          riderTier1PerKm: editing.riderTier1PerKm,
          riderTier2UptoKm: editing.riderTier2UptoKm,
          riderTier2PerKm: editing.riderTier2PerKm,
          riderTier3PerKm: editing.riderTier3PerKm,
          riderPerMinute: editing.riderPerMinute,
          checklist: editing.checklist,
          notes: editing.notes,
        }),
      });
      setEditing(null);
      await load();
    } catch (e: any) {
      alert(e.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const patch = (p: Partial<CityMetrics>) =>
    setEditing((c) => (c ? { ...c, ...p } : c));

  const num = (v: string) => (v === '' ? null : Number(v));
  const inputCls =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Cities</h1>
          <p className="text-sm text-slate-500">
            Launch playbook and performance against target.
          </p>
        </div>
        <div className="flex gap-2">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button
            onClick={load}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {unmanaged.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="text-sm font-semibold text-amber-900">
            {unmanaged.length} place{unmanaged.length === 1 ? '' : 's'} in use without a city
            record
          </h2>
          <p className="mt-0.5 text-xs text-amber-800">
            Riders and orders already reference these. Add one to set targets and pricing for
            it.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {unmanaged.map((u) => (
              <button
                key={u.name}
                onClick={() => addCity(u.name)}
                className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
              >
                + {u.name}
                <span className="ml-1 text-amber-600">
                  ({u.riders}r · {u.orders}o)
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-400">
          Loading…
        </div>
      ) : cities.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-400">
          No cities yet — add one from the list above.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {cities.map((c) => {
            const done = c.checklist.filter((i) => i.done).length;
            return (
              <div key={c.id} className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold text-slate-900">{c.name}</h3>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STAGE_STYLE[c.stage]}`}
                      >
                        {c.stage}
                      </span>
                    </div>
                    {c.state && <p className="text-xs text-slate-500">{c.state}</p>}
                  </div>
                  <button
                    onClick={() => setEditing(c)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Playbook
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-500">
                      Riders (KYC approved)
                    </div>
                    <div className="mt-1">
                      <Progress actual={c.actual.ridersApproved} target={c.targetRiders} />
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      {c.actual.riders} total · {c.actual.ridersOnline} online now
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-500">
                      Orders / day
                    </div>
                    <div className="mt-1">
                      <Progress
                        actual={c.actual.ordersPerDay}
                        target={c.targetOrdersPerDay}
                      />
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      {c.actual.orders} in {days}d · {c.actual.cancelled} cancelled
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-slate-100 pt-3 text-xs text-slate-500">
                  <span>
                    Revenue{' '}
                    <strong className="text-slate-900">
                      ₹{c.actual.revenue.toLocaleString('en-IN')}
                    </strong>
                  </span>
                  <span>
                    Delivered <strong className="text-slate-900">{c.actual.delivered}</strong>
                  </span>
                  <span>
                    Rate card{' '}
                    <strong className="text-slate-900">
                      {RATE_FIELDS.some((f) => c[f.key] != null)
                        ? `₹${c.baseFare ?? '–'} + ₹${c.perKmRate ?? '–'}/km${
                            c.minFare ? ` · min ₹${c.minFare}` : ''
                          }`
                        : 'global'}
                    </strong>
                  </span>
                  <span>
                    Checklist{' '}
                    <strong
                      className={
                        done === c.checklist.length ? 'text-emerald-600' : 'text-amber-600'
                      }
                    >
                      {done}/{c.checklist.length}
                    </strong>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4">
          <div className="mx-auto max-w-2xl rounded-xl bg-white p-6">
            <h2 className="text-xl font-semibold text-slate-900">
              {editing.name} — launch playbook
            </h2>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Stage</label>
                <select
                  value={editing.stage}
                  onChange={(e) => patch({ stage: e.target.value as Stage })}
                  className={inputCls}
                >
                  <option value="planned">Planned</option>
                  <option value="launching">Launching</option>
                  <option value="live">Live</option>
                  <option value="paused">Paused</option>
                </select>
                <p className="mt-1 text-xs text-slate-500">
                  Only <strong>Live</strong> accepts orders — the city is switched on and off
                  by this.
                </p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Launch date
                </label>
                <input
                  type="date"
                  value={editing.launchDate ? String(editing.launchDate).slice(0, 10) : ''}
                  onChange={(e) => patch({ launchDate: e.target.value || null })}
                  className={inputCls}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Target riders
                </label>
                <input
                  type="number"
                  min={0}
                  value={editing.targetRiders ?? ''}
                  onChange={(e) => patch({ targetRiders: num(e.target.value) })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Target orders / day
                </label>
                <input
                  type="number"
                  min={0}
                  value={editing.targetOrdersPerDay ?? ''}
                  onChange={(e) => patch({ targetOrdersPerDay: num(e.target.value) })}
                  className={inputCls}
                />
              </div>
            </div>

            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between">
                <label className="text-sm font-medium text-slate-700">
                  Hyperlocal (C2C) rate card
                </label>
                <div className="flex gap-1">
                  {Object.entries(PRESETS).map(([label, p]) => (
                    <button
                      key={label}
                      onClick={() => patch(p)}
                      className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {HYPERLOCAL_FIELDS.map(({ key, label, hint }) => {
                  const overridden = (editing[key] as number | null) != null;
                  return (
                    <div key={key}>
                      <span className="text-xs text-slate-500">
                        {label} <span className="text-slate-400">({hint})</span>
                      </span>
                      <input
                        type="number"
                        min={0}
                        value={(editing[key] as number | null) ?? ''}
                        onChange={(e) => patch({ [key]: num(e.target.value) } as any)}
                        placeholder="inherit"
                        className={`${inputCls} ${overridden ? 'border-orange-300 bg-orange-50' : ''}`}
                      />
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Blank means this city inherits the global value from Settings. Highlighted
                fields are overridden here. Fares use the <strong>pickup</strong> city&apos;s card.
              </p>

              <div className="mt-5 border-t border-slate-200 pt-4">
                <label className="text-sm font-medium text-slate-700">
                  Rider rate card
                </label>
                <p className="mb-2 text-xs text-slate-500">
                  What riders are shown in the app. Time and waiting are one rate, not two.
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {RIDER_FIELDS.map(({ key, label, hint }) => {
                    const overridden = (editing[key] as number | null) != null;
                    return (
                      <div key={key}>
                        <span className="text-xs text-slate-500">
                          {label} <span className="text-slate-400">({hint})</span>
                        </span>
                        <input
                          type="number"
                          min={0}
                          value={(editing[key] as number | null) ?? ''}
                          onChange={(e) => patch({ [key]: num(e.target.value) } as any)}
                          placeholder="inherit"
                          className={`${inputCls} ${overridden ? 'border-emerald-300 bg-emerald-50' : ''}`}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-5 border-t border-slate-200 pt-4">
                <label className="text-sm font-medium text-slate-700">
                  Intercity rate card
                </label>
                <p className="mb-2 text-xs text-slate-500">
                  A separate card: intercity is a flat rate by weight band, not by distance,
                  so changing it never affects C2C.
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {INTERCITY_FIELDS.map(({ key, label, hint }) => {
                    const overridden = (editing[key] as number | null) != null;
                    return (
                      <div key={key}>
                        <span className="text-xs text-slate-500">
                          {label} <span className="text-slate-400">({hint})</span>
                        </span>
                        <input
                          type="number"
                          min={0}
                          value={(editing[key] as number | null) ?? ''}
                          onChange={(e) => patch({ [key]: num(e.target.value) } as any)}
                          placeholder="inherit"
                          className={`${inputCls} ${overridden ? 'border-sky-300 bg-sky-50' : ''}`}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
              <button
                onClick={() =>
                  patch({
                    baseFare: null,
                    baseKmIncluded: null,
                    perKmRate: null,
                    waitingPerMin: null,
                    handlingFee: null,
                    minFare: null,
                    intercityDocFare: null,
                    intercityUpto3Fare: null,
                    intercityAbove3Fare: null,
                    intercityGstPct: null,
                    riderBasePerOrder: null,
                    riderTier1UptoKm: null,
                    riderTier1PerKm: null,
                    riderTier2UptoKm: null,
                    riderTier2PerKm: null,
                    riderTier3PerKm: null,
                    riderPerMinute: null,
                  })
                }
                className="mt-2 text-xs font-medium text-slate-500 underline hover:text-slate-700"
              >
                Clear all overrides (all three cards) — use global pricing
              </button>
            </div>

            <div className="mt-5">
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Go-live checklist
              </label>
              <div className="space-y-1.5">
                {editing.checklist.map((item, i) => (
                  <label
                    key={item.key}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-2"
                  >
                    <input
                      type="checkbox"
                      checked={item.done}
                      onChange={(e) => {
                        const next = [...editing.checklist];
                        next[i] = { ...item, done: e.target.checked };
                        patch({ checklist: next });
                      }}
                      className="h-4 w-4 accent-orange-500"
                    />
                    <span
                      className={`text-sm ${item.done ? 'text-slate-400 line-through' : 'text-slate-700'}`}
                    >
                      {item.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-5">
              <label className="mb-1 block text-sm font-medium text-slate-700">Notes</label>
              <textarea
                rows={3}
                value={editing.notes}
                onChange={(e) => patch({ notes: e.target.value })}
                placeholder="Local contacts, landmarks, anything the next person needs."
                className={inputCls}
              />
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setEditing(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={savePlaybook}
                disabled={saving}
                className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save playbook'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
