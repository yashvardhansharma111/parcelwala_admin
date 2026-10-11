'use client';

/**
 * Geofence editor — draw the boundary a city actually serves.
 *
 * Until now a service area could only be a circle, which never matches a real
 * town: it either spills onto highways nobody delivers to, or clips the edges
 * of neighbourhoods that are served. Drawn polygons fix that, and the backend
 * checks them with a ray-casting test so concave shapes work.
 *
 * Leaflet is loaded from CDN rather than added as a dependency — react-leaflet
 * has no stable React 19 release, and plain Leaflet behind a ref is both
 * smaller and more predictable than working around that.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '@/lib/api';

type Pt = { lat: number; lon: number };

interface Area {
  id: string;
  name: string;
  city?: string;
  type?: 'circle' | 'polygon';
  lat: number;
  lon: number;
  radiusKm: number;
  polygon?: Pt[];
  isActive: boolean;
}

const LEAFLET_CSS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
const LEAFLET_JS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';

/** Ratlam — where the operation actually is, so the map opens somewhere useful. */
const DEFAULT_CENTRE: [number, number] = [23.3315, 75.0367];

function loadLeaflet(): Promise<any> {
  const w = window as any;
  if (w.L) return Promise.resolve(w.L);

  if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = LEAFLET_CSS;
    document.head.appendChild(link);
  }

  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${LEAFLET_JS}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve((window as any).L));
      existing.addEventListener('error', reject);
      return;
    }
    const s = document.createElement('script');
    s.src = LEAFLET_JS;
    s.onload = () => resolve((window as any).L);
    s.onerror = () => reject(new Error('Could not load the map library'));
    document.head.appendChild(s);
  });
}

export default function ZonesPage() {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const layersRef = useRef<any[]>([]);
  const draftLayerRef = useRef<any>(null);
  const LRef = useRef<any>(null);

  const [areas, setAreas] = useState<Area[]>([]);
  const [loading, setLoading] = useState(true);
  const [mapError, setMapError] = useState<string | null>(null);

  const [drawing, setDrawing] = useState(false);
  const [draft, setDraft] = useState<Pt[]>([]);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Click handlers are attached once, so they read drawing state through a ref
  // rather than closing over a stale value.
  const drawingRef = useRef(drawing);
  useEffect(() => {
    drawingRef.current = drawing;
  }, [drawing]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ areas: Area[] }>('/admin/service-areas');
      setAreas(res.areas || []);
    } catch (e: any) {
      setError(e.message || 'Could not load zones');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // ── map init ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    loadLeaflet()
      .then((L) => {
        if (cancelled || !mapEl.current || mapRef.current) return;
        LRef.current = L;
        const map = L.map(mapEl.current).setView(DEFAULT_CENTRE, 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap',
          maxZoom: 19,
        }).addTo(map);

        map.on('click', (e: any) => {
          if (!drawingRef.current) return;
          setDraft((d) => [...d, { lat: e.latlng.lat, lon: e.latlng.lng }]);
        });

        mapRef.current = map;
      })
      .catch((e) => !cancelled && setMapError(e.message));

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // ── render saved zones ──────────────────────────────────────────────────────
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;

    layersRef.current.forEach((l) => map.removeLayer(l));
    layersRef.current = [];

    areas.forEach((a) => {
      const colour = a.isActive ? '#f97316' : '#94a3b8';
      const layer =
        a.type === 'polygon' && a.polygon?.length
          ? L.polygon(
              a.polygon.map((p) => [p.lat, p.lon]),
              { color: colour, weight: 2, fillOpacity: 0.12 }
            )
          : L.circle([a.lat, a.lon], {
              radius: (a.radiusKm || 0) * 1000,
              color: colour,
              weight: 2,
              fillOpacity: 0.1,
              dashArray: '5,5',
            });

      layer
        .bindTooltip(
          `${a.name}${a.city ? ` · ${a.city}` : ''} — ${
            a.type === 'polygon' ? 'drawn zone' : `${a.radiusKm} km circle`
          }${a.isActive ? '' : ' (inactive)'}`
        )
        .addTo(map);
      layersRef.current.push(layer);
    });

    if (areas.length && !drawing) {
      try {
        map.fitBounds(L.featureGroup(layersRef.current).getBounds(), { padding: [40, 40] });
      } catch {
        /* a single point has no bounds to fit */
      }
    }
  }, [areas, drawing]);

  // ── render the in-progress boundary ─────────────────────────────────────────
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;

    if (draftLayerRef.current) {
      map.removeLayer(draftLayerRef.current);
      draftLayerRef.current = null;
    }
    if (draft.length === 0) return;

    const group = L.featureGroup();
    draft.forEach((p, i) =>
      L.circleMarker([p.lat, p.lon], {
        radius: 5,
        color: '#0ea5e9',
        fillColor: '#fff',
        fillOpacity: 1,
      })
        .bindTooltip(`${i + 1}`)
        .addTo(group)
    );
    if (draft.length >= 2) {
      const line =
        draft.length >= 3
          ? L.polygon(draft.map((p) => [p.lat, p.lon]), {
              color: '#0ea5e9',
              weight: 2,
              fillOpacity: 0.15,
            })
          : L.polyline(draft.map((p) => [p.lat, p.lon]), { color: '#0ea5e9', weight: 2 });
      line.addTo(group);
    }
    group.addTo(map);
    draftLayerRef.current = group;
  }, [draft]);

  const startDrawing = () => {
    setDrawing(true);
    setDraft([]);
    setError(null);
  };

  const cancelDrawing = () => {
    setDrawing(false);
    setDraft([]);
    setName('');
    setCity('');
  };

  const save = async () => {
    if (!name.trim()) {
      setError('Give the zone a name');
      return;
    }
    if (draft.length < 3) {
      setError('A zone needs at least 3 points');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiRequest('/admin/service-areas', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          city: city.trim() || undefined,
          type: 'polygon',
          polygon: draft,
          isActive: true,
        }),
      });
      cancelDrawing();
      await load();
    } catch (e: any) {
      setError(e.message || 'Could not save the zone');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (a: Area) => {
    try {
      await apiRequest(`/admin/service-areas/${a.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !a.isActive }),
      });
      await load();
    } catch (e: any) {
      alert(e.message || 'Failed');
    }
  };

  const remove = async (a: Area) => {
    if (!confirm(`Delete zone "${a.name}"? Addresses inside it stop being serviceable.`)) return;
    try {
      await apiRequest(`/admin/service-areas/${a.id}`, { method: 'DELETE' });
      await load();
    } catch (e: any) {
      alert(e.message || 'Failed');
    }
  };

  const activeCount = areas.filter((a) => a.isActive).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Service zones</h1>
          <p className="text-sm text-slate-500">
            Both pickup and drop must fall inside an active zone.
          </p>
        </div>
        {!drawing ? (
          <button
            onClick={startDrawing}
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
          >
            Draw a zone
          </button>
        ) : (
          <button
            onClick={cancelDrawing}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
          >
            Cancel
          </button>
        )}
      </div>

      {activeCount === 0 && !loading && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>No active zones.</strong> Area checking is switched off while this is
          empty, so every address anywhere is accepted. Draw a zone to start enforcing it.
        </div>
      )}

      {drawing && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
          <p className="text-sm font-medium text-sky-900">
            Click the map to place points around the boundary.
            {draft.length > 0 && ` ${draft.length} placed.`}
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Zone name, e.g. Ratlam city"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="City (optional)"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              onClick={() => setDraft((d) => d.slice(0, -1))}
              disabled={draft.length === 0}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
            >
              Undo point
            </button>
            <button
              onClick={save}
              disabled={saving || draft.length < 3 || !name.trim()}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? 'Saving…' : `Save zone (${draft.length})`}
            </button>
          </div>
          {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
        </div>
      )}

      {mapError ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {mapError}. Zones can still be managed from the list below.
        </div>
      ) : (
        <div
          ref={mapEl}
          className="h-[460px] w-full rounded-xl border border-slate-200 bg-slate-100"
        />
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Zone</th>
              <th className="px-4 py-3">City</th>
              <th className="px-4 py-3">Shape</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            ) : areas.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  No zones yet
                </td>
              </tr>
            ) : (
              areas.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{a.name}</td>
                  <td className="px-4 py-3 text-slate-600">{a.city || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {a.type === 'polygon'
                      ? `Drawn · ${a.polygon?.length ?? 0} points`
                      : `Circle · ${a.radiusKm} km`}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${
                        a.isActive
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {a.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => toggle(a)}
                      className="mr-2 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      {a.isActive ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      onClick={() => remove(a)}
                      className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
