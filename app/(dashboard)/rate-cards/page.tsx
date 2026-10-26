'use client';

/**
 * Rate cards — what partners in each city are charged per delivery.
 *
 * Every number here becomes a price on someone's invoice, so the editor shows
 * the resulting bands as you type ("0–3 km → ₹35") rather than a bare list of
 * upper bounds. A card with no slab for a distance quotes nothing at all and the
 * partner is told the run cannot be priced — which is why the preview spells out
 * where the card stops.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiRequest } from '@/lib/api';

interface Slab {
  upToKm: number | string;
  fee: number | string;
}

interface RateCard {
  id: string;
  city: string;
  slabs: { upToKm: number; fee: number }[];
  foodFlatFee?: number | null;
  foodUpToKm?: number | null;
  updatedAt?: string | null;
}

interface Draft {
  id?: string;
  city: string;
  slabs: Slab[];
  foodFlatFee: string;
  foodUpToKm: string;
}

const inr = (n: number) =>
  `₹${Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const blank = (): Draft => ({
  city: '',
  slabs: [
    { upToKm: 3, fee: 35 },
    { upToKm: 6, fee: 45 },
    { upToKm: 10, fee: 55 },
  ],
  foodFlatFee: '',
  foodUpToKm: '',
});

const field =
  'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-400';

export default function RateCardsPage() {
  const [cards, setCards] = useState<RateCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ cards: RateCard[] }>('/admin/rate-cards');
      setCards(res.cards || []);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!draft || saving) return;
    setSaving(true);
    try {
      await apiRequest(draft.id ? `/admin/rate-cards/${draft.id}` : '/admin/rate-cards', {
        method: draft.id ? 'PATCH' : 'POST',
        body: JSON.stringify({
          city: draft.city,
          slabs: draft.slabs.map((s) => ({ upToKm: Number(s.upToKm), fee: Number(s.fee) })),
          foodFlatFee: draft.foodFlatFee === '' ? null : Number(draft.foodFlatFee),
          foodUpToKm: draft.foodUpToKm === '' ? null : Number(draft.foodUpToKm),
        }),
      });
      setDraft(null);
      load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(c: RateCard) {
    if (
      !confirm(
        `Delete the ${c.city} rate card?\n\nPartners in ${c.city} would not be able to price any order without it.`
      )
    )
      return;
    try {
      await apiRequest(`/admin/rate-cards/${c.id}`, { method: 'DELETE' });
      load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  function edit(c: RateCard) {
    setDraft({
      id: c.id,
      city: c.city,
      slabs: c.slabs.length > 0 ? c.slabs.map((s) => ({ ...s })) : blank().slabs,
      foodFlatFee: c.foodFlatFee == null ? '' : String(c.foodFlatFee),
      foodUpToKm: c.foodUpToKm == null ? '' : String(c.foodUpToKm),
    });
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Partner rate cards</h1>
          <div className="mt-1 text-sm text-slate-500">
            One card per city. A partner in a city with no card cannot place orders.
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            href="/partners"
            className="px-4 py-2 bg-slate-100 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-200 transition"
          >
            All partners
          </Link>
          {draft ? null : (
            <button
              onClick={() => setDraft(blank())}
              className="px-4 py-2 bg-orange-500 text-white text-sm font-semibold rounded-lg hover:bg-orange-600 transition"
            >
              + New city card
            </button>
          )}
        </div>
      </div>

      {draft ? (
        <Editor
          draft={draft}
          setDraft={setDraft}
          onSave={save}
          onCancel={() => setDraft(null)}
          saving={saving}
        />
      ) : null}

      {loading ? (
        <div className="text-sm text-slate-500 py-10 text-center">Loading rate cards…</div>
      ) : cards.length === 0 && !draft ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 py-14 text-center">
          <div className="text-sm font-semibold text-slate-700">No rate cards yet</div>
          <div className="text-sm text-slate-500 mt-1">
            Add one per city you serve partners in.
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {cards.map((c) => (
            <div key={c.id} className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <h3 className="font-bold text-slate-800">{c.city}</h3>
                  <div className="text-xs text-slate-400">
                    {c.slabs.length} slab{c.slabs.length === 1 ? '' : 's'}
                    {c.foodFlatFee != null ? ' · food rate set' : ''}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => edit(c)}
                    className="px-3 py-1.5 bg-slate-100 text-slate-600 text-xs font-semibold rounded-lg hover:bg-slate-200"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => remove(c)}
                    className="px-3 py-1.5 bg-white border border-red-200 text-red-600 text-xs font-semibold rounded-lg hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </div>

              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  {c.slabs.map((s, i) => (
                    <tr key={s.upToKm}>
                      <td className="py-1.5 text-slate-600 tabular-nums">
                        {i === 0 ? 0 : c.slabs[i - 1].upToKm} – {s.upToKm} km
                      </td>
                      <td className="py-1.5 text-right font-semibold text-slate-800 tabular-nums">
                        {inr(s.fee)}
                      </td>
                    </tr>
                  ))}
                  {c.foodFlatFee != null && c.foodUpToKm != null ? (
                    <tr>
                      <td className="py-1.5 text-slate-600">
                        Food, up to {c.foodUpToKm} km
                      </td>
                      <td className="py-1.5 text-right font-semibold text-slate-800 tabular-nums">
                        {inr(c.foodFlatFee)} flat
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>

              <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-400">
                Beyond {c.slabs[c.slabs.length - 1]?.upToKm ?? 0} km this card cannot
                price an order — the partner is told rather than charged a guess.
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Editor({
  draft,
  setDraft,
  onSave,
  onCancel,
  saving,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const sorted = [...draft.slabs]
    .map((s) => ({ upToKm: Number(s.upToKm), fee: Number(s.fee) }))
    .filter((s) => Number.isFinite(s.upToKm) && Number.isFinite(s.fee))
    .sort((a, b) => a.upToKm - b.upToKm);

  const setSlab = (i: number, key: keyof Slab, v: string) => {
    const slabs = [...draft.slabs];
    slabs[i] = { ...slabs[i], [key]: v };
    setDraft({ ...draft, slabs });
  };

  return (
    <div className="bg-white rounded-xl border border-orange-300 p-5">
      <h2 className="font-bold text-slate-800 mb-1">
        {draft.id ? `Edit ${draft.city || 'card'}` : 'New rate card'}
      </h2>
      <p className="text-xs text-slate-500 mb-4">
        Slabs are upper bounds. A 4 km run is priced by the first slab whose limit
        it falls inside.
      </p>

      <div className="grid md:grid-cols-2 gap-5">
        <div className="space-y-3">
          <label className="block">
            <span className="block text-xs font-semibold text-slate-500 mb-1">
              City<span className="text-orange-500"> *</span>
            </span>
            <input
              value={draft.city}
              onChange={(e) => setDraft({ ...draft, city: e.target.value })}
              placeholder="Ratlam"
              className={field}
            />
            <span className="block text-xs text-slate-400 mt-1">
              Must match the city on the partner&apos;s account, spelling and all.
            </span>
          </label>

          <div>
            <div className="text-xs font-semibold text-slate-500 mb-1.5">
              Distance slabs
            </div>
            <div className="space-y-2">
              {draft.slabs.map((s, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <span className="text-xs text-slate-400 w-10">up to</span>
                  <input
                    value={String(s.upToKm)}
                    onChange={(e) => setSlab(i, 'upToKm', e.target.value)}
                    inputMode="decimal"
                    className="w-20 px-2 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-400"
                  />
                  <span className="text-xs text-slate-400">km →</span>
                  <input
                    value={String(s.fee)}
                    onChange={(e) => setSlab(i, 'fee', e.target.value)}
                    inputMode="numeric"
                    className="w-24 px-2 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-400"
                  />
                  <button
                    onClick={() =>
                      setDraft({ ...draft, slabs: draft.slabs.filter((_, j) => j !== i) })
                    }
                    disabled={draft.slabs.length <= 1}
                    className="text-slate-400 hover:text-red-600 text-sm px-1 disabled:opacity-30"
                    title={draft.slabs.length <= 1 ? 'A card needs at least one slab' : 'Remove'}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() =>
                setDraft({ ...draft, slabs: [...draft.slabs, { upToKm: '', fee: '' }] })
              }
              className="mt-2 text-xs font-semibold text-orange-600 hover:underline"
            >
              + Add slab
            </button>
          </div>

          <div className="pt-3 border-t border-slate-100">
            <div className="text-xs font-semibold text-slate-500 mb-1.5">
              Food rate (optional)
            </div>
            <div className="flex gap-2 items-center">
              <span className="text-xs text-slate-400">flat</span>
              <input
                value={draft.foodFlatFee}
                onChange={(e) => setDraft({ ...draft, foodFlatFee: e.target.value })}
                inputMode="numeric"
                placeholder="35"
                className="w-24 px-2 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-400"
              />
              <span className="text-xs text-slate-400">up to</span>
              <input
                value={draft.foodUpToKm}
                onChange={(e) => setDraft({ ...draft, foodUpToKm: e.target.value })}
                inputMode="decimal"
                placeholder="5"
                className="w-20 px-2 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-orange-400"
              />
              <span className="text-xs text-slate-400">km</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Both or neither. Past the limit, food orders fall back to the distance
              slabs.
            </p>
          </div>
        </div>

        {/* what the partner will actually be charged */}
        <div className="bg-slate-50 rounded-xl p-4">
          <div className="text-xs font-semibold text-slate-500 mb-2">
            What partners will see
          </div>
          {sorted.length === 0 ? (
            <div className="text-sm text-slate-400">Add a slab to see the bands.</div>
          ) : (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-200">
                {sorted.map((s, i) => (
                  <tr key={`${s.upToKm}-${i}`}>
                    <td className="py-1.5 text-slate-600 tabular-nums">
                      {i === 0 ? 0 : sorted[i - 1].upToKm} – {s.upToKm} km
                    </td>
                    <td className="py-1.5 text-right font-semibold text-slate-800 tabular-nums">
                      {inr(s.fee)}
                    </td>
                  </tr>
                ))}
                {draft.foodFlatFee !== '' && draft.foodUpToKm !== '' ? (
                  <tr>
                    <td className="py-1.5 text-slate-600">
                      Food, up to {draft.foodUpToKm} km
                    </td>
                    <td className="py-1.5 text-right font-semibold text-slate-800 tabular-nums">
                      {inr(Number(draft.foodFlatFee))} flat
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          )}
          {sorted.length > 0 ? (
            <div className="mt-3 pt-3 border-t border-slate-200 text-xs text-slate-500">
              Anything over <strong>{sorted[sorted.length - 1].upToKm} km</strong>{' '}
              cannot be priced by this card. Partners get a clear refusal, not a
              guessed fee.
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex gap-2 mt-5 pt-4 border-t border-slate-100">
        <button
          onClick={onSave}
          disabled={saving}
          className="px-5 py-2.5 bg-orange-500 text-white text-sm font-semibold rounded-lg hover:bg-orange-600 disabled:opacity-50"
        >
          {saving ? 'Saving…' : draft.id ? 'Save card' : 'Create card'}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2.5 bg-slate-100 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-200"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
