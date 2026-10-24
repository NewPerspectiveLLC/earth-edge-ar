// rooms.js (d49): ROOMS inside Live Geometry (same app, same page). 'Matt's Reality' (default, unchanged) and 'Ready Athletics Master Map'.
// Pick via the room picker on the title card / the 🏠 room pill (top), the Quest panel 'Room' section, or deep link ?room=ra-master-map.
// Persisted in localStorage.eearRoom. Each room keeps its OWN Layers state (eearLayers = Matt's Reality, eearLayers_ra = Master Map); the
// Master Map starts from a focused preset (RA parcel + corner columns + RA vortex + RA trail; busier extras off, all re-enable in Layers).
// Music/DJ, multiplayer presence and your position keep running across a switch (no reload).
export const ROOMS = { 'matts-reality': { name: "Matt's Reality", sub: 'Ready Security Services Map 1 · Base Geometry Reality' },
  'ra-master-map': { name: 'Ready Athletics Master Map', sub: 'Parcel 997800502 · Ready Athletics LLC' } };
// Master Map preset: layer keys not listed keep their default (on)
export const RA_PRESET = { parcelRA: 1, colsRA: 1, vxRA: 1, vortexL: 1, vortexW: 1, raTrail: 1, parcelCappy: 0, colsCappy: 1, vxCappy: 0, vxGarden: 0, saucers: 0, edges: 0, far: 0, icecube: 0, lines: 0, ghost: 0, beams: 0, bots: 0, orbTours: 0, places: 1, continents: 0 };
/* Quest (quest.html QL keys): same focus; the panel 'Room' section swaps eearQLayers <-> eearQLayers_ra live */
export const QRA_PRESET = { vxRA: 1, vxLocal: 1, vxWorld: 1, parcelRA: 1, colsRA: 1, raTrail: 1, parcelCappy: 0, colsCappy: 1, vxCappy: 0, vxGarden: 0, saucers: 0, ghost: 0, edges: 0, beams: 0, icecube: 0, pyramids: 0, poles: 0, continents: 0, places: 1, orbTours: 0 };
export const QMR_DEFAULTS = { raTrail: 0, orbTours: 1 };
export const qlKey = r => r === 'ra-master-map' ? 'eearQLayers_ra' : 'eearQLayers';
export const MR_DEFAULTS = { raTrail: 0, bots: 1, orbTours: 1 };

function alogRoom(room, why) {
  try {
    const k = 'eearAlogRoom:' + room;
    if (sessionStorage[k] === '1' && why !== 'switch') return;
    sessionStorage[k] = '1';
    const BASE = (typeof location !== 'undefined' && location.hostname.endsWith('github.io'))
      ? 'https://humor-communist-air-take.trycloudflare.com' : '';
    fetch(BASE + '/api/activity', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ev: 'room', room, page: 'index', why: why || 'enter' }), keepalive: true }).catch(() => {});
  } catch (e) {}
}
export function current() { const u = new URLSearchParams(location.search).get('room'); let r; if (u && ROOMS[u]) { localStorage.eearRoom = u; r = u } else r = ROOMS[localStorage.eearRoom] ? localStorage.eearRoom : 'matts-reality'; alogRoom(r, 'enter'); return r }
export function select(room) { if (!ROOMS[room]) return current(); localStorage.eearRoom = room; alogRoom(room, 'switch'); return room }
export const layKey = r => r === 'ra-master-map' ? 'eearLayers_ra' : 'eearLayers';
/** layer state for a room (stored, else that room's defaults) */
export function layersFor(r, base) { let st = {}; try { st = JSON.parse(localStorage[layKey(r)] || '{}') } catch (e) { }
  /* d49b: Cappy's corner columns are on by default in BOTH rooms (one-time migration of an early Master Map state) */ if (r === 'ra-master-map' && st._rv !== 2) { delete st.colsCappy; st._rv = 2 }
  /* d49c: RA vortex moved to Matt's 1:11 PM standing spot - one-time: vortex (RA + local + world) back on in BOTH rooms */ if (!st._vx49c) { delete st.vxRA; delete st.vortexL; delete st.vortexW; st._vx49c = 1 } return Object.assign({}, base, r === 'ra-master-map' ? RA_PRESET : MR_DEFAULTS, st) }
const dist = (a, b, c, d) => { const R = 6371000, r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)) };
const brg = (a, b, c, d) => { const r = Math.PI / 180, y = Math.sin((d - b) * r) * Math.cos(c * r), x = Math.cos(a * r) * Math.sin(c * r) - Math.sin(a * r) * Math.cos(c * r) * Math.cos((d - b) * r); return (Math.atan2(y, x) / r + 360) % 360 };
const card8 = b => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(b / 45) % 8];
export const fmtD = m => m < 1000 ? Math.round(m) + ' m' : (m / 1000).toFixed(2) + ' km';
export { dist, brg, card8 };
