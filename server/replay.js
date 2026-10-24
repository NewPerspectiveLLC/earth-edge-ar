/* d62: daily movement replay cache — merge gfixes into server/cache/replay-YYYY-MM-DD.json (PT day).
   Never touches data.json. GM-gated consumers only. */
'use strict';
const fs = require('fs');
const path = require('path');

const PT = 'America/Los_Angeles';
const PT_CENTER = { lat: 48.1173, lon: -122.7605, zoom: 13 };
const MAX_PTS = 1800;       // per player per day after downsample
const MIN_GAP_MS = 8000;    // keep a point at least every 8s when moving
const MIN_MOVE_M = 4;       // or when moved >= 4 m

function ptDayKey(t) {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: PT, year: 'numeric', month: '2-digit', day: '2-digit' });
  return fmt.format(new Date(t)); // YYYY-MM-DD
}
function ptMidnightMs(day) {
  // First UTC instant on this PT calendar day.
  const [y, m, d] = day.split('-').map(Number);
  let t = Date.UTC(y, m - 1, d) - 20 * 3600000; // well before PT midnight
  for (let i = 0; i < 60; i++) {
    const a = ptDayKey(t), b = ptDayKey(t + 3600000);
    if (a !== day && b === day) {
      let lo = t, hi = t + 3600000;
      while (hi - lo > 500) {
        const mid = Math.floor((lo + hi) / 2);
        if (ptDayKey(mid) === day) hi = mid; else lo = mid;
      }
      return hi - (hi % 1000);
    }
    t += 3600000;
  }
  return Date.UTC(y, m - 1, d, 7); // PDT fallback
}

function distM(a, b) {
  const R = 6371000, D = Math.PI / 180;
  const dLat = (b.lat - a.lat) * D, dLon = (b.lon - a.lon) * D;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * D) * Math.cos(b.lat * D) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

function downsample(pts, bot) {
  const gap = bot ? 30000 : MIN_GAP_MS;
  const move = bot ? 12 : MIN_MOVE_M;
  const cap = bot ? 480 : MAX_PTS;
  const out = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || p.t - last.t >= gap || distM(last, p) >= move) out.push(p);
  }
  if (out.length && pts.length && out[out.length - 1].t !== pts[pts.length - 1].t) out.push(pts[pts.length - 1]);
  return out.length > cap ? thinEven(out, cap) : out;
}
function thinEven(pts, n) {
  if (pts.length <= n) return pts;
  const out = [pts[0]];
  for (let i = 1; i < n - 1; i++) out.push(pts[Math.round(i * (pts.length - 1) / (n - 1))]);
  out.push(pts[pts.length - 1]);
  return out;
}

function mergeTracks(a, b) {
  const map = new Map();
  for (const p of a || []) map.set(p.t, p);
  for (const p of b || []) map.set(p.t, p);
  return downsample([...map.values()].sort((x, y) => x.t - y.t), false);
}

function colorOf(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 70% 55%)`;
}

function createReplay({ root, all, one, isGhost, isBot, botName, BS }) {
  const CACHE = path.join(root, 'server', 'cache');
  try { fs.mkdirSync(CACHE, { recursive: true }); } catch (e) {}

  function cachePath(day) { return path.join(CACHE, `replay-${day}.json`); }

  function readCache(day) {
    try { return JSON.parse(fs.readFileSync(cachePath(day), 'utf8')); } catch (e) { return null; }
  }

  function listDays() {
    try {
      return fs.readdirSync(CACHE).filter(f => /^replay-\d{4}-\d{2}-\d{2}\.json$/.test(f))
        .map(f => f.slice(7, 17)).sort();
    } catch (e) { return []; }
  }

  function build(day) {
    const now = Date.now();
    day = day || ptDayKey(now);
    const t0 = ptMidnightMs(day);
    const t1 = Math.min(now, t0 + 86400000 - 1);
    const prev = readCache(day) || { day, players: [] };
    const prevBy = Object.fromEntries((prev.players || []).map(p => [p.id, p]));

    // Pull fixes for the PT day window from sqlite
    const rows = all('select pid,lat,lon,t from gfixes where t>=? and t<=? order by pid,t', t0, t1);
    const byPid = Object.create(null);
    for (const r of rows) {
      (byPid[r.pid] || (byPid[r.pid] = [])).push({ t: r.t, lat: r.lat, lon: r.lon });
    }

    const pids = new Set([...Object.keys(byPid), ...Object.keys(prevBy)]);
    const players = [];
    for (const pid of pids) {
      const gp = one('select id,name,mode,device,live from gplayers where id=?', pid);
      const bot = isBot(pid), dummy = isGhost(pid);
      const botish = !!bot || !!dummy;
      const merged = downsample(
        (() => { const map = new Map(); for (const p of (prevBy[pid] && prevBy[pid].track) || []) map.set(p.t, p); for (const p of byPid[pid] || []) map.set(p.t, p); return [...map.values()].sort((x, y) => x.t - y.t); })(),
        botish
      );
      if (!merged.length) continue;
      players.push({
        id: pid,
        name: (gp && gp.name) || (prevBy[pid] && prevBy[pid].name) || pid.slice(0, 8),
        bot: !!bot,
        dummy: !!dummy,
        tag: bot ? 'BOT' : dummy ? 'TEST' : null,
        stealth: !!(gp && gp.mode === 'stealth'),
        device: (gp && gp.device) || (prevBy[pid] && prevBy[pid].device) || null,
        style: bot ? ((BS[botName(pid)] || {}).style || 'default') : null,
        color: (prevBy[pid] && prevBy[pid].color) || colorOf(pid),
        track: merged,
        points: merged.length,
        t0: merged[0].t,
        t1: merged[merged.length - 1].t
      });
    }
    players.sort((a, b) => a.name.localeCompare(b.name));
    let minT = Infinity, maxT = 0, nPts = 0;
    for (const p of players) { minT = Math.min(minT, p.t0); maxT = Math.max(maxT, p.t1); nPts += p.points; }
    if (!Number.isFinite(minT)) { minT = t0; maxT = t1; }

    const out = {
      v: 1,
      day,
      builtAt: now,
      tz: PT,
      range: { t0: minT, t1: maxT, dayStart: t0, dayEnd: t1 },
      center: PT_CENTER,
      counts: {
        players: players.length,
        humans: players.filter(p => !p.bot && !p.dummy).length,
        bots: players.filter(p => p.bot || p.dummy).length,
        points: nPts
      },
      players
    };
    fs.writeFileSync(cachePath(day), JSON.stringify(out));
    // prune old day caches (>14 days)
    try {
      const keep = new Set();
      for (let i = 0; i < 14; i++) keep.add(ptDayKey(now - i * 86400000));
      for (const f of fs.readdirSync(CACHE)) {
        const m = /^replay-(\d{4}-\d{2}-\d{2})\.json$/.exec(f);
        if (m && !keep.has(m[1])) fs.unlinkSync(path.join(CACHE, f));
      }
    } catch (e) {}
    return { day, builtAt: now, counts: out.counts, range: out.range, path: `server/cache/replay-${day}.json` };
  }

  function meta() {
    const days = listDays();
    const today = ptDayKey(Date.now());
    const cur = readCache(today);
    return {
      today,
      days,
      center: PT_CENTER,
      tz: PT,
      current: cur ? { day: cur.day, builtAt: cur.builtAt, counts: cur.counts, range: cur.range } : null,
      cadenceHours: 3
    };
  }

  function getDay(day) {
    day = day || ptDayKey(Date.now());
    let cur = readCache(day);
    if (!cur) {
      build(day);
      cur = readCache(day);
    }
    return cur;
  }

  // auto rebuild every 3 hours + once shortly after boot
  let timer = null;
  function startAuto() {
    if (timer) return;
    setTimeout(() => { try { build(); console.log('replay cache built', ptDayKey(Date.now())); } catch (e) { console.error('replay boot build', e.message); } }, 45000);
    timer = setInterval(() => { try { build(); } catch (e) { console.error('replay auto build', e.message); } }, 3 * 3600000);
  }

  return { build, meta, getDay, readCache, listDays, startAuto, ptDayKey, CACHE, PT_CENTER };
}

module.exports = createReplay;
