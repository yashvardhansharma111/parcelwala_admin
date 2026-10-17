/**
 * A hexagonal grid for painting service areas.
 *
 * Drawing a boundary point by point is slow and fiddly — a city edge takes
 * twenty-odd clicks and one misplaced vertex means starting again. Painting
 * cells is forgiving: tap to add, tap to remove, and the shape is whatever is
 * covered.
 *
 * Only the editor knows about hexes. What it saves is one ring per cell, so the
 * server keeps doing the same point-in-polygon test it always has and needs no
 * idea a grid was involved.
 *
 * The grid is anchored to a fixed origin with a fixed reference latitude rather
 * than to the map view, so the same ground always falls in the same cell. Open
 * an area a month later and the cells line up with what was painted. Longitude
 * is scaled by cos(23°) — central Madhya Pradesh, where this operates — which
 * keeps cells near-regular there and consistent everywhere, since the only thing
 * that has to agree is the grid with itself.
 */

export type Pt = { lat: number; lon: number };
export type Hex = { q: number; r: number };

const KM_PER_DEG_LAT = 110.574;
/** Fixed on purpose: a grid that shifts with latitude would not be re-editable. */
const REF_LAT = 23;
const KM_PER_DEG_LON = 111.32 * Math.cos((REF_LAT * Math.PI) / 180);

const toKm = (p: Pt) => ({ x: p.lon * KM_PER_DEG_LON, y: p.lat * KM_PER_DEG_LAT });
const toLatLon = (x: number, y: number): Pt => ({
  lat: y / KM_PER_DEG_LAT,
  lon: x / KM_PER_DEG_LON,
});

/** Cube rounding — the nearest hex to a fractional axial coordinate. */
function roundHex(qf: number, rf: number): Hex {
  const xf = qf;
  const zf = rf;
  const yf = -xf - zf;

  let x = Math.round(xf);
  let y = Math.round(yf);
  let z = Math.round(zf);

  const dx = Math.abs(x - xf);
  const dy = Math.abs(y - yf);
  const dz = Math.abs(z - zf);

  if (dx > dy && dx > dz) x = -y - z;
  else if (dy > dz) y = -x - z;
  else z = -x - y;

  return { q: x, r: z };
}

/** Which cell a point falls in, for a given cell size. */
export function pointToHex(p: Pt, sizeKm: number): Hex {
  const { x, y } = toKm(p);
  const q = ((Math.sqrt(3) / 3) * x - y / 3) / sizeKm;
  const r = ((2 / 3) * y) / sizeKm;
  return roundHex(q, r);
}

export function hexCentre(h: Hex, sizeKm: number): Pt {
  const x = sizeKm * Math.sqrt(3) * (h.q + h.r / 2);
  const y = sizeKm * (3 / 2) * h.r;
  return toLatLon(x, y);
}

/** The six corners, pointy-top, ready to hand to a map as a polygon. */
export function hexRing(h: Hex, sizeKm: number): Pt[] {
  const c = hexCentre(h, sizeKm);
  const { x: cx, y: cy } = toKm(c);
  const ring: Pt[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = ((60 * i - 30) * Math.PI) / 180;
    ring.push(toLatLon(cx + sizeKm * Math.cos(angle), cy + sizeKm * Math.sin(angle)));
  }
  return ring;
}

export const hexKey = (h: Hex) => `${h.q},${h.r}`;
export const keyToHex = (k: string): Hex => {
  const [q, r] = k.split(',').map(Number);
  return { q, r };
};

/**
 * Every cell whose centre falls inside the given bounds, so the editor can draw
 * a grid over exactly what is on screen and no more.
 */
export function hexesInBounds(
  sw: Pt,
  ne: Pt,
  sizeKm: number,
  limit = 2000
): Hex[] {
  const corners = [
    pointToHex(sw, sizeKm),
    pointToHex(ne, sizeKm),
    pointToHex({ lat: sw.lat, lon: ne.lon }, sizeKm),
    pointToHex({ lat: ne.lat, lon: sw.lon }, sizeKm),
  ];
  const qs = corners.map((h) => h.q);
  const rs = corners.map((h) => h.r);
  // One ring of slack so cells straddling the edge still draw.
  const qMin = Math.min(...qs) - 2;
  const qMax = Math.max(...qs) + 2;
  const rMin = Math.min(...rs) - 2;
  const rMax = Math.max(...rs) + 2;

  const out: Hex[] = [];
  for (let r = rMin; r <= rMax; r++) {
    for (let q = qMin; q <= qMax; q++) {
      const c = hexCentre({ q, r }, sizeKm);
      if (c.lat >= sw.lat && c.lat <= ne.lat && c.lon >= sw.lon && c.lon <= ne.lon) {
        out.push({ q, r });
        // A zoomed-out map would otherwise ask for hundreds of thousands of
        // polygons and lock the tab.
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}

/** Roughly how wide a cell is on the ground, for the size picker's label. */
export const hexWidthKm = (sizeKm: number) => sizeKm * Math.sqrt(3);
