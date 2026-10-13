/**
 * Service area editor — pick the city, then draw what it actually covers.
 *
 * The city used to be a free-text box typed after drawing, which meant the map
 * opened on a hardcoded centre no matter where you worked, a typo silently
 * created a zone belonging to no city, and every city's zones were drawn on top
 * of each other. Choosing the city first fixes all three: the map goes there,
 * the name comes from the city list, and the zones you see are that city's.
 *
 * Google Maps rather than OpenStreetMap because the people drawing these know
 * their city from Google Maps — the same landmarks, the same road names, the
 * same satellite view — and because its drawing tools give draggable vertices,
 * so a boundary can be corrected instead of restarted.
 *
 * Loaded from the CDN with a callback rather than through a wrapper package:
 * @react-google-maps/api has no stable React 19 release, and the imperative API
 * behind a ref is small enough not to need one.
 */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

interface City {
  id: string;
  name: string;
  state: string;
  isActive: boolean;
}

type Mode = 'idle' | 'polygon' | 'circle';

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

/** Ratlam — only used before a city is chosen, so the canvas is not blank. */
const FALLBACK_CENTRE = { lat: 23.3315, lng: 75.0367 };

let mapsPromise: Promise<any> | null = null;

function loadGoogleMaps(): Promise<any> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Maps can only load in the browser'));
  }
  const w = window as any;
  if (w.google?.maps?.drawing) return Promise.resolve(w.google);
  if (mapsPromise) return mapsPromise;

  mapsPromise = new Promise((resolve, reject) => {
    if (!MAPS_KEY) {
      reject(
        new Error(
          'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set for this deployment'
        )
      );
      return;
    }
    const callback = '__parcelwalahMapsReady';
    w[callback] = () => resolve(w.google);
    const s = document.createElement('script');
    s.src =
      `https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}` +
      `&libraries=drawing&v=weekly&loading=async&callback=${callback}`;
    s.async = true;
    s.onerror = () => {
      mapsPromise = null;
      reject(new Error('Could not load Google Maps'));
    };
    document.head.appendChild(s);
  });
  return mapsPromise;
}

export default function ZonesPage() {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const gRef = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const drawingMgrRef = useRef<any>(null);
  const savedShapesRef = useRef<any[]>([]);
  const draftRef = useRef<any>(null);

  const [areas, setAreas] = useState<Area[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const [city, setCity] = useState('');
  const [mode, setMode] = useState<Mode>('idle');
  const [hasDraft, setHasDraft] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOthers, setShowOthers] = useState(false);

  const selectedCity = useMemo(
    () => cities.find((c) => c.name === city) || null,
    [cities, city]
  );

  const cityAreas = useMemo(
    () => areas.filter((a) => (a.city || '') === city),
    [areas, city]
  );

  // ── data ────────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [areaRes, cityRes] = await Promise.all([
        apiRequest<{ areas: Area[] }>('/admin/service-areas'),
        apiRequest<{ cities: City[] }>('/admin/cities/metrics?days=1'),
      ]);
      setAreas(areaRes.areas || []);
      setCities((cityRes.cities || []).filter((c) => c.name));
    } catch (e: any) {
      setError(e.message || 'Could not load service areas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // ── map ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then((google) => {
        if (cancelled || !mapEl.current || mapRef.current) return;
        gRef.current = google;
        mapRef.current = new google.maps.Map(mapEl.current, {
          center: FALLBACK_CENTRE,
          zoom: 11,
          mapTypeControl: true,
          streetViewControl: false,
          fullscreenControl: true,
          // Satellite is genuinely useful here: boundaries get drawn along
          // rivers, rail lines and the edge of built-up land, none of which
          // read clearly on a road map.
          mapTypeId: google.maps.MapTypeId.ROADMAP,
        });
        setMapReady(true);
      })
      .catch((e) => !cancelled && setMapError(e.message));

    return () => {
      cancelled = true;
    };
  }, []);

  /** Move the map to the chosen city. */
  useEffect(() => {
    const google = gRef.current;
    const map = mapRef.current;
    if (!google || !map || !selectedCity) return;

    // Geocode rather than store coordinates on the city: the city record only
    // carries a name, and a name is what an admin actually knows.
    new google.maps.Geocoder().geocode(
      // Built from the parts that exist. Cities are often stored without a
      // state, and interpolating an empty one leaves a stray comma in the query.
      { address: [selectedCity.name, selectedCity.state, 'India'].filter(Boolean).join(', ') },
      (results: any[], status: string) => {
        if (status !== 'OK' || !results?.[0]) return;
        const geo = results[0].geometry;
        // The viewport is the city's own extent, so the zoom lands on the city
        // rather than on an arbitrary radius around its centre point.
        if (geo.viewport) map.fitBounds(geo.viewport);
        else map.setCenter(geo.location);
      }
    );
  }, [selectedCity]);

  /** Draw the zones that already exist. */
  useEffect(() => {
    const google = gRef.current;
    const map = mapRef.current;
    if (!google || !map) return;

    savedShapesRef.current.forEach((s) => s.setMap(null));
    savedShapesRef.current = [];

    const visible = showOthers ? areas : areas.filter((a) => (a.city || '') === city);

    visible.forEach((a) => {
      const mine = (a.city || '') === city;
      // Other cities' zones stay on the map but recede — useful for spotting a
      // gap at a boundary, distracting if they compete for attention.
      const colour = !mine ? '#94a3b8' : a.isActive ? '#f97316' : '#cbd5e1';
      const opts = {
        map,
        strokeColor: colour,
        strokeWeight: mine ? 2 : 1,
        strokeOpacity: mine ? 0.9 : 0.5,
        fillColor: colour,
        fillOpacity: mine ? 0.15 : 0.05,
        clickable: false,
        zIndex: mine ? 2 : 1,
      };

      const shape =
        a.type === 'polygon' && a.polygon?.length
          ? new google.maps.Polygon({
              ...opts,
              paths: a.polygon.map((p) => ({ lat: p.lat, lng: p.lon })),
            })
          : new google.maps.Circle({
              ...opts,
              center: { lat: a.lat, lng: a.lon },
              radius: (a.radiusKm || 0) * 1000,
            });

      savedShapesRef.current.push(shape);
    });
  }, [areas, city, showOthers, mapReady]);

  /** Turn the drawing tool on and off. */
  useEffect(() => {
    const google = gRef.current;
    const map = mapRef.current;
    if (!google || !map) return;

    if (!drawingMgrRef.current) {
      const mgr = new google.maps.drawing.DrawingManager({
        drawingControl: false,
        polygonOptions: {
          strokeColor: '#0ea5e9',
          strokeWeight: 2,
          fillColor: '#0ea5e9',
          fillOpacity: 0.2,
          // Editable and draggable so a boundary can be nudged into place.
          // Getting a city edge right on the first click is not realistic.
          editable: true,
          draggable: true,
        },
        circleOptions: {
          strokeColor: '#0ea5e9',
          strokeWeight: 2,
          fillColor: '#0ea5e9',
          fillOpacity: 0.2,
          editable: true,
          draggable: true,
        },
      });
      mgr.setMap(map);
      google.maps.event.addListener(mgr, 'overlaycomplete', (e: any) => {
        draftRef.current?.setMap(null);
        draftRef.current = e.overlay;
        setHasDraft(true);
        // One shape at a time: drawing mode off the moment a shape lands, so a
        // stray click cannot leave a second invisible overlay behind.
        mgr.setDrawingMode(null);
        setMode('idle');
      });
      drawingMgrRef.current = mgr;
    }

    const mgr = drawingMgrRef.current;
    mgr.setOptions({
      drawingMode:
        mode === 'polygon'
          ? google.maps.drawing.OverlayType.POLYGON
          : mode === 'circle'
          ? google.maps.drawing.OverlayType.CIRCLE
          : null,
    });
  }, [mode, mapReady]);

  const clearDraft = () => {
    draftRef.current?.setMap(null);
    draftRef.current = null;
    setHasDraft(false);
    setMode('idle');
    setName('');
    setError(null);
    drawingMgrRef.current?.setDrawingMode(null);
  };

  const save = async () => {
    const google = gRef.current;
    const shape = draftRef.current;
    if (!google || !shape) return;
    if (!city) {
      setError('Choose a service city first');
      return;
    }
    if (!name.trim()) {
      setError('Give the area a name');
      return;
    }

    // Read the shape now, not when it was drawn — it stays editable until save,
    // and the dragged version is the one the admin means.
    const isCircle = typeof shape.getRadius === 'function';
    let body: Record<string, unknown>;

    if (isCircle) {
      const c = shape.getCenter();
      body = {
        name: name.trim(),
        city,
        type: 'circle',
        lat: c.lat(),
        lon: c.lng(),
        radiusKm: Math.round((shape.getRadius() / 1000) * 100) / 100,
        isActive: true,
      };
    } else {
      const path: Pt[] = shape
        .getPath()
        .getArray()
        .map((ll: any) => ({ lat: ll.lat(), lon: ll.lng() }));
      if (path.length < 3) {
        setError('A drawn area needs at least 3 points');
        return;
      }
      body = { name: name.trim(), city, type: 'polygon', polygon: path, isActive: true };
    }

    setSaving(true);
    setError(null);
    try {
      await apiRequest('/admin/service-areas', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      clearDraft();
      await load();
    } catch (e: any) {
      setError(e.message || 'Could not save the area');
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
    if (!confirm(`Delete "${a.name}"? Addresses inside it stop being serviceable.`)) return;
    try {
      await apiRequest(`/admin/service-areas/${a.id}`, { method: 'DELETE' });
      await load();
    } catch (e: any) {
      alert(e.message || 'Failed');
    }
  };

  const listed = showOthers ? areas : cityAreas;
  const activeEverywhere = areas.filter((a) => a.isActive).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Service areas</h1>
        <p className="text-sm text-slate-500">
          Both pickup and drop must fall inside an active area.
        </p>
      </div>

      {activeEverywhere === 0 && !loading && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>No active areas anywhere.</strong> Area checking is switched off while
          this is empty, so every address is accepted. Mark one to start enforcing it.
        </div>
      )}

      {/* ── Step 1: the city ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[240px]">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Step 1 · Service city
            </label>
            <select
              value={city}
              onChange={(e) => {
                clearDraft();
                setCity(e.target.value);
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            >
              <option value="">Choose a city…</option>
              {cities.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                  {c.state ? `, ${c.state}` : ''}
                  {c.isActive ? '' : ' (inactive)'}
                </option>
              ))}
            </select>
          </div>

          {city && (
            <div className="text-sm text-slate-600">
              <span className="font-medium text-slate-900">{cityAreas.length}</span> area
              {cityAreas.length === 1 ? '' : 's'} in {city}
            </div>
          )}

          <label className="ml-auto flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={showOthers}
              onChange={(e) => setShowOthers(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Show other cities&apos; areas
          </label>
        </div>

        {cities.length === 0 && !loading && (
          <p className="mt-3 text-sm text-amber-700">
            No cities yet. Add one on the Cities page first — an area has to belong
            somewhere.
          </p>
        )}
      </div>

      {/* ── Step 2: the shape ────────────────────────────────────────────── */}
      <div
        className={`rounded-xl border p-4 transition ${
          city ? 'border-sky-200 bg-sky-50' : 'border-slate-200 bg-slate-50 opacity-60'
        }`}
      >
        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Step 2 · Mark the area
        </label>

        {!city ? (
          <p className="text-sm text-slate-500">Choose a city above to start marking.</p>
        ) : !hasDraft ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setMode(mode === 'polygon' ? 'idle' : 'polygon')}
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                mode === 'polygon'
                  ? 'bg-sky-600 text-white'
                  : 'border border-sky-300 bg-white text-sky-700 hover:bg-sky-100'
              }`}
            >
              Draw boundary
            </button>
            <button
              onClick={() => setMode(mode === 'circle' ? 'idle' : 'circle')}
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                mode === 'circle'
                  ? 'bg-sky-600 text-white'
                  : 'border border-sky-300 bg-white text-sky-700 hover:bg-sky-100'
              }`}
            >
              Draw radius
            </button>
            <p className="text-sm text-sky-900">
              {mode === 'polygon'
                ? 'Click around the boundary, then click the first point to close it.'
                : mode === 'circle'
                ? 'Drag from the centre outwards to set the radius.'
                : 'A boundary follows the real edge of the city. A radius is quicker for a city you are just launching.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-sky-900">
              Drag the shape or its points to adjust, then name it and save.
            </p>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={`Area name, e.g. ${city} city`}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <button
                onClick={clearDraft}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700"
              >
                Discard
              </button>
              <button
                onClick={save}
                disabled={saving || !name.trim()}
                className="rounded-lg bg-sky-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving ? 'Saving…' : `Save to ${city}`}
              </button>
            </div>
          </div>
        )}

        {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
      </div>

      {/* ── Map ──────────────────────────────────────────────────────────── */}
      {mapError ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {mapError}. Existing areas can still be managed from the list below.
        </div>
      ) : (
        <div className="relative">
          <div
            ref={mapEl}
            className="h-[520px] w-full rounded-xl border border-slate-200 bg-slate-100"
          />
          {!city && mapReady && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-slate-900/35">
              <span className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow">
                Choose a service city to begin
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── List ─────────────────────────────────────────────────────────── */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Area</th>
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
            ) : listed.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  {city ? `No areas in ${city} yet` : 'Choose a city to see its areas'}
                </td>
              </tr>
            ) : (
              listed.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{a.name}</td>
                  <td className="px-4 py-3 text-slate-600">{a.city || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {a.type === 'polygon'
                      ? `Boundary · ${a.polygon?.length ?? 0} points`
                      : `Radius · ${a.radiusKm} km`}
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
