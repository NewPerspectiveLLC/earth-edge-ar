// figures-registry.js: single source of truth for WHERE the in-scene figures stand (pure data, no imports, safe to load anywhere).
// Used by ren.js, performers.js, circle.js (the game) and figures.html (the live dashboard). Frame: x = east m, y = up m, z = -north m,
// relative to each anchor's ground point. Server-side bots/ghosts (server/server.js?v=1792265745763) are published live at GET /api/figures.
export const GARDEN = { lat: 48.1316475, lon: -122.7992293, name: "Matt's Meditation Garden" };   // vortex pin (Matt's Google Maps link)
export const CAPPYS = { lat: 48.13165, lon: -122.79921, name: "Cappy's Trails" };                   // Cappy's Trails pillar
export const READY_ATHLETICS = { lat: 48.11035, lon: -122.80591, name: 'Ready Athletics' };
// Ren (3dguru): stands eastM east of Cappy's pillar; dance wander offsets are stored in decimetres, |w| <= 13 -> <= 1.3 m from home
export const REN = { home: CAPPYS, eastM: 4, talkRadius: 15, leaveRadius: 20, wanderMaxM: 1.3, heightM: 1.85, hoverM: .32, beamM: 400 };
// Singer bots: one per singer on a radius-m arc around the Garden pillar, in the gaps between cushions (15 + k*30 deg),
// centred toward the player (fallback 200 deg), kept > avoidSepDeg from avoidBearingDeg (Ren's side). Matt = full rig.
export const PERFORMERS = { anchor: GARDEN, radius: 3, avoidBearingDeg: 90, avoidSepDeg: 45, gap0Deg: 15, gapDeg: 30, fallbackBearingDeg: 200,
  matt: { id: 'mattready', heightM: 2.0, topM: 2.256, footRoomM: { lateral: .6, back: 1, fwd: .3 } }, generic: { heightM: 1.85, topM: 1.85 } };
// Glowing meditation circle, centred on the Garden pillar
export const CIRCLE = { anchor: GARDEN, stoneRadius: 3.6, cushionInset: .58, paveIn: .95, paveOut: 2.55, daisR: .86, orbs: 6, orbY: 1.25, stones: 12, cushions: 12 };
// Client-side GhostBot (index.html / quest.html): spawns relative to the VIEWER, not a lat/lon
export const GHOST_BOT = { spawnFwdM: 8, spawnRightM: 2, loopRadiiM: [2, 3, 4, 6, 8], defaultLoopM: 3, xrLoopM: 2, keepWithinM: 25, questStart: { x: 2, z: -6 } };
// fallback ground ring at the Garden drawn by daynight.js until circle.js is up (inner/outer radius m)
export const GARDEN_FALLBACK_RING = { inner: 1, outer: 9 };
/** ENU offset (east, north metres) -> lat/lon, same flat-earth scale the game uses (111320 m/deg) */
export function offsetLL(a, eastM, northM) { const D = Math.PI / 180; return { lat: a.lat + northM / 111320, lon: a.lon + eastM / (111320 * Math.cos(a.lat * D)) }; }
/** performer spot angles (radians, clockwise from north) for n singers with the arc centred near bearing cDeg - mirrors performers.js showPerformers */
export function performerSpots(n, cDeg = PERFORMERS.fallbackBearingDeg) {
  const PI = Math.PI, D = PI / 180, GAP0 = PERFORMERS.gap0Deg * D, GAP = PERFORMERS.gapDeg * D, avoid = PERFORMERS.avoidBearingDeg * D, sep = PERFORMERS.avoidSepDeg * D;
  const angD = (a, b) => { let d = (a - b) % (2 * PI); if (d > PI) d -= 2 * PI; if (d < -PI) d += 2 * PI; return d; };
  const step = n > 3 ? GAP : 2 * GAP; let c = GAP0 + Math.round((cDeg * D - GAP0) / GAP) * GAP;
  const spots = cc => Array.from({ length: n }, (_, i) => cc + (i - (n - 1) / 2) * step), clear = cc => spots(cc).every(a => Math.abs(angD(a, avoid)) > sep);
  for (let k = 1; k < 12 && !clear(c); k++) { const cand = c + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * GAP; if (clear(cand)) { c = cand; break; } }
  return spots(c + ((n % 2 === 0 && step === GAP) ? GAP / 2 : 0));
}
// d44 Matt Ready pillars: equilateral triangular prisms (same image on all 3 faces) at OSM public spots listed in pillars.json (id, name, kind, area, lat, lon, optional image).
// image = the ONE constant to swap for a photo of Matt (a pillar entry may carry its own "image" override). Audio: Disco Jam from each pillar, nearest `voices` only.
export const PILLARS = { url: 'pillars.json?v=1792265745763', image: 'pillar-matt.jpg', heightM: 1.8, sideM: 0.7, plinthM: .08, capM: .05, visibleM: 2500,
  audio: { trackId: 'disco-jam', fullM: 3, silentM: 55, voices: 2, duck: .8, fadeS: .35, tauS: .25, scanMs: 250, levelTrim: 1 } };
