/* d48 Ren AI usage guard + first-contact notifier (server side only).
   - Every Ren request is logged to sqlite table ren_usage (server/eear.sqlite, NOT data.json) and to ~/earth-edge-ar/logs/ren-usage.jsonl (rotates at 5 MB, keeps .1-.3).
     Players are anonymous: pid = sha256(salt | ip | display name) first 10 hex; salt in ~/.eear-secrets/ren-salt (600).
   - Cost = tokens x per-model prices from the limits config (source: https://docs.x.ai/docs/models, fetched 2026-10-18).
   - Limits/caps: ~/.eear-secrets/ren-limits.json (600; created with defaults; GM-editable via POST /api/ren-usage). PT day/month totals.
     Over a cap (or AI switched off) Ren answers with canned non-AI replies, resuming automatically next PT day / month. 80% of daily cap -> warning alert.
   - Alerts (warn / over-cap / kill switch / notifier errors) go to sqlite ren_alerts + the JSONL log, and GET /api/ren-usage.
   - First contact: first Ren message of a visitor (dedupe per pid, 30 min idle) -> ren_first + notify() per ~/.eear-secrets/ren-notify.json
     {"enabled":true,"mode":"imessage","to":"+1..."} or {"enabled":true,"mode":"webhook","url":"https://...","authorization":"Bearer ..."} (+ optional "alerts":true).
     Disabled while that file is absent. Non-blocking; max 1 per visitor session, 30/hour global; errors only logged. */
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto'), { execFile } = require('child_process');
const SEC = path.join(os.homedir(), '.eear-secrets'), LIM_F = path.join(SEC, 'ren-limits.json'), NOT_F = path.join(SEC, 'ren-notify.json'), SALT_F = path.join(SEC, 'ren-salt');
const LOGD = path.join(__dirname, '..', 'logs'), LOG_F = path.join(LOGD, 'ren-usage.jsonl');
const PRICES_SOURCE = 'https://docs.x.ai/docs/models (fetched 2026-10-18): USD per 1M tokens; prompts >= longAt tokens bill all tokens at the long rates';
const DEFAULTS = { ai: true, dailyUSD: 1, monthlyUSD: 10, warnPct: 80, perPlayerHour: 30, perPlayerDay: 200, globalPerMin: 60, maxTokens: 300,
  prices: { 'grok-4.20-0309-non-reasoning': { in: 1.25, cached: 0.20, out: 2.50, longAt: 200000, inLong: 2.50, cachedLong: 0.40, outLong: 5.00 },
    'grok-4.20-0309-reasoning': { in: 1.25, cached: 0.20, out: 2.50, longAt: 200000, inLong: 2.50, cachedLong: 0.40, outLong: 5.00 },
    'grok-4.3': { in: 1.25, cached: 0.20, out: 2.50, longAt: 200000, inLong: 2.50, cachedLong: 0.40, outLong: 5.00 },
    'grok-4.7': { in: 2.00, cached: 0.50, out: 6.00, longAt: 200000, inLong: 4.00, cachedLong: 1.00, outLong: 12.00 } },
  pricesSource: PRICES_SOURCE };
const CANNED = { day: "Ren is resting — AI budget reached for today. Come back tomorrow and we'll talk geometry! 🧘", month: "Ren is resting — the AI budget for this month is used up. Enjoy the trails and the music meanwhile! 🧘",
  off: "Ren is resting in silent meditation right now (AI paused). Enjoy the garden and the music! 🧘", hour: "Ren needs a breather — you've sent lots of messages this hour. Try again a bit later.",
  pday: "Ren needs a long rest — that's plenty of chat for one day. See you tomorrow!", global: "Ren is chatting with lots of visitors right now — try again in a minute." };
const TZ = 'America/Los_Angeles';
const ptDay = t => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
const ptTime = t => new Date(t).toLocaleString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' }) + ' PT';
function ptMidnight(t) { const d = ptDay(t), off = Date.parse(new Date(t).toLocaleString('en-US', { timeZone: 'UTC' })) - Date.parse(new Date(t).toLocaleString('en-US', { timeZone: TZ })); return Date.parse(d + 'T00:00:00Z') + off }
const r6 = x => Math.round(x * 1e6) / 1e6;
module.exports = function init(sq) {
  sq.exec(`create table if not exists ren_usage(t int,day text,month text,pid text,model text,status text,pt int,ct int,cached int,tt int,usd real,ms int);
create index if not exists ru_day on ren_usage(day);create index if not exists ru_month on ren_usage(month);create index if not exists ru_t on ren_usage(t);
create table if not exists ren_alerts(t int,kind text,msg text);create table if not exists ren_first(t int,pid text,who text,device text,msg text,notified text);`);
  const all = (s, ...a) => sq.prepare(s).all(...a), one = (s, ...a) => sq.prepare(s).get(...a);
  try { fs.mkdirSync(SEC, { recursive: true, mode: 0o700 }) } catch (e) { } try { fs.mkdirSync(LOGD, { recursive: true }) } catch (e) { }
  let SALT = ''; try { SALT = fs.readFileSync(SALT_F, 'utf8').trim() } catch (e) { } if (!SALT) { SALT = crypto.randomBytes(16).toString('hex'); try { fs.writeFileSync(SALT_F, SALT, { mode: 0o600 }) } catch (e) { } }
  const pidOf = (ip, name) => crypto.createHash('sha256').update(SALT + '|' + ip + '|' + String(name || '').toLowerCase()).digest('hex').slice(0, 10);
  let LIM = { ...DEFAULTS }, LIMM = 0;
  function limits() { try { const st = fs.statSync(LIM_F); if (st.mtimeMs !== LIMM) { LIMM = st.mtimeMs; const j = JSON.parse(fs.readFileSync(LIM_F, 'utf8')); LIM = { ...DEFAULTS, ...j, prices: { ...DEFAULTS.prices, ...(j.prices || {}) } } } }
    catch (e) { if (e.code === 'ENOENT') { try { fs.writeFileSync(LIM_F, JSON.stringify(DEFAULTS, null, 1), { mode: 0o600 }); LIMM = fs.statSync(LIM_F).mtimeMs } catch (x) { } LIM = { ...DEFAULTS } } }
    return LIM }
  function jl(o) { try { const st = fs.statSync(LOG_F); if (st.size > 5e6) { for (let i = 2; i >= 1; i--) try { fs.renameSync(LOG_F + '.' + i, LOG_F + '.' + (i + 1)) } catch (e) { } fs.renameSync(LOG_F, LOG_F + '.1') } } catch (e) { }
    try { fs.appendFileSync(LOG_F, JSON.stringify(o) + '\n') } catch (e) { console.error('ren log', e.message) } }
  const ALERTED = {};   // kind:period -> once
  function alert(kind, msg, once) { const t = Date.now(); if (once) { if (ALERTED[once]) return; ALERTED[once] = 1 } sq.prepare('insert into ren_alerts values(?,?,?)').run(t, kind, msg); jl({ t, type: 'alert', kind, msg });
    const N = notifyCfg(); if (N && N.alerts && kind !== 'notify-error') notify({ alert: kind, text: msg }, true) }
  const sums = (w, v) => one(`select count(*) n,coalesce(sum(usd),0) usd,coalesce(sum(tt),0) tok,coalesce(sum(pt),0) pt,coalesce(sum(ct),0) ct,coalesce(sum(status='ok'),0) ai,coalesce(sum(status like 'canned%'),0) canned,coalesce(sum(status like 'error%'),0) err from ren_usage` + (w ? ' where ' + w + '=?' : ''), ...(v != null ? [v] : []));
  const fmt = s => ({ requests: s.n, aiCalls: s.ai, canned: s.canned, errors: s.err, usd: r6(s.usd), tokens: s.tok, promptTokens: s.pt, completionTokens: s.ct });
  function status(now = Date.now()) { const L = limits(), d = sums('day', ptDay(now)), m = sums('month', ptDay(now).slice(0, 7));
    if (!L.ai) return { status: 'off', d, m }; if (m.usd >= L.monthlyUSD) return { status: 'capped-month', d, m }; if (d.usd >= L.dailyUSD) return { status: 'capped-day', d, m };
    if (d.usd >= L.dailyUSD * L.warnPct / 100) return { status: 'warning', d, m }; return { status: 'ok', d, m } }
  const G = []; let RLH = 0;
  /** before an xAI call: returns {pid, canned?:text, why?} */
  function gate(ip, name) { const now = Date.now(), L = limits(), pid = pidOf(ip, name), S = status(now);
    const can = (why, text) => { RLH += why === 'hour' || why === 'pday' || why === 'global' ? 1 : 0; record({ pid, model: '-', status: 'canned-' + why, ms: 0 }); return { pid, canned: text, why } };
    if (S.status === 'off') return can('off', CANNED.off);
    if (S.status === 'capped-month') { alert('over-cap', `Monthly AI cap $${L.monthlyUSD} reached ($${r6(S.m.usd)}) — Ren on canned replies until next month`, 'm:' + ptDay(now).slice(0, 7)); return can('month', CANNED.month) }
    if (S.status === 'capped-day') { alert('over-cap', `Daily AI cap $${L.dailyUSD} reached ($${r6(S.d.usd)}) — Ren on canned replies until tomorrow (PT)`, 'd:' + ptDay(now)); return can('day', CANNED.day) }
    const ph = one("select count(*) n from ren_usage where pid=? and t>? and status not like 'canned%'", pid, now - 3600e3).n, pd = one("select count(*) n from ren_usage where pid=? and day=? and status not like 'canned%'", pid, ptDay(now)).n;
    if (ph >= L.perPlayerHour) return can('hour', CANNED.hour); if (pd >= L.perPlayerDay) return can('pday', CANNED.pday);
    while (G.length && now - G[0] > 60e3) G.shift(); if (G.length >= L.globalPerMin) return can('global', CANNED.global); G.push(now);
    return { pid, maxTokens: Math.max(16, Math.min(2000, Math.round(+L.maxTokens || 300))) } }
  function cost(model, u) { const P = limits().prices[model]; if (!P || !u) return 0; const pt = +u.prompt_tokens || 0, cached = +(u.prompt_tokens_details && u.prompt_tokens_details.cached_tokens) || 0,
    ct = (+u.completion_tokens || 0) + (+(u.completion_tokens_details && u.completion_tokens_details.reasoning_tokens) || 0), long = P.longAt && pt >= P.longAt;
    return ((pt - cached) * (long ? P.inLong : P.in) + cached * (long ? P.cachedLong : P.cached) + ct * (long ? P.outLong : P.out)) / 1e6 }
  function record({ pid, model, status: st, usage, ms }) { const t = Date.now(), u = usage || {}, usd = st === 'ok' ? cost(model, u) : 0;
    const row = { t, day: ptDay(t), month: ptDay(t).slice(0, 7), pid, model, status: st, pt: +u.prompt_tokens || 0, ct: +u.completion_tokens || 0, cached: +(u.prompt_tokens_details && u.prompt_tokens_details.cached_tokens) || 0, tt: +u.total_tokens || 0, usd: r6(usd), ms: ms || 0 };
    if (st === 'ok' && !limits().prices[model]) alert('price-missing', `No price configured for model ${model} — cost counted as $0; add it under prices in ren-limits.json`, 'p:' + model);
    sq.prepare('insert into ren_usage values(?,?,?,?,?,?,?,?,?,?,?,?)').run(row.t, row.day, row.month, row.pid, row.model, row.status, row.pt, row.ct, row.cached, row.tt, row.usd, row.ms); jl({ type: 'call', ...row });
    if (st === 'ok') { const L = limits(), S = status(t); if (S.d.usd >= L.dailyUSD * L.warnPct / 100 && S.d.usd < L.dailyUSD) alert('warning', `Ren AI spend today $${r6(S.d.usd)} is ≥${L.warnPct}% of the $${L.dailyUSD} daily cap`, 'w:' + row.day);
      if (S.d.usd >= L.dailyUSD) alert('over-cap', `Daily AI cap $${L.dailyUSD} reached ($${r6(S.d.usd)}) — Ren on canned replies until tomorrow (PT)`, 'd:' + row.day);
      if (S.m.usd >= L.monthlyUSD) alert('over-cap', `Monthly AI cap $${L.monthlyUSD} reached ($${r6(S.m.usd)})`, 'm:' + row.month) } return row }
  // ---- notifier
  function notifyCfg() { try { const st = fs.statSync(NOT_F); if (st.mode & 0o077) try { fs.chmodSync(NOT_F, 0o600) } catch (e) { } const j = JSON.parse(fs.readFileSync(NOT_F, 'utf8')); return j && j.enabled !== false && (j.mode === 'imessage' && j.to || j.mode === 'webhook' && j.url) ? j : null } catch (e) { return null } }
  const NS = { last: null, lastOk: null, lastErr: null, sent: 0, failed: 0, skipped: 0 }, NG = [];
  const OSA = 'on run argv\ntell application "Messages"\nset s to 1st account whose service type = iMessage\nsend (item 2 of argv) to participant (item 1 of argv) of s\nend tell\nend run';
  function notify(o, isAlert) { const N = notifyCfg(), t = Date.now(); if (!N) { NS.skipped++; return Promise.resolve({ ok: false, why: 'disabled (no ~/.eear-secrets/ren-notify.json)' }) }
    while (NG.length && t - NG[0] > 3600e3) NG.shift(); if (NG.length >= (+N.maxPerHour || 30)) { NS.skipped++; return Promise.resolve({ ok: false, why: 'global notify limit reached (per hour)' }) } NG.push(t);
    const text = o.alert ? `Live Geometry alert: ${o.text}` : `Live Geometry: ${o.who} (${o.device}) is talking to Ren — ${o.time}${o.message ? ': “' + o.message + '”' : ''}`;
    const done = (ok, err) => { NS.last = { t, ok, mode: N.mode, err: err || null, alert: !!isAlert }; if (ok) { NS.sent++; NS.lastOk = t } else { NS.failed++; NS.lastErr = t; console.error('ren notify', N.mode, err); jl({ t, type: 'notify-error', mode: N.mode, err }); if (!isAlert) sq.prepare('insert into ren_alerts values(?,?,?)').run(t, 'notify-error', String(err).slice(0, 200)) } return { ok, err: err || undefined, mode: N.mode } };
    if (N.mode === 'imessage') return new Promise(res => execFile('/usr/bin/osascript', ['-e', OSA, String(N.to), text], { timeout: 20000 }, (e, so, se) => res(done(!e, e ? (String(se || e.message).trim().slice(0, 200)) : null))));
    return fetch(N.url, { method: 'POST', headers: { 'content-type': 'application/json', ...(N.authorization ? { authorization: N.authorization } : {}) }, body: JSON.stringify({ ...o, text, source: 'live-geometry' }), signal: AbortSignal.timeout(8000) })
      .then(r => done(r.ok, r.ok ? null : 'HTTP ' + r.status)).catch(e => done(false, e.message || String(e))) }
  const FC = new Map();   // pid -> last Ren message time (session = 30 min idle)
  function firstContact(pid, name, device, msg) { const t = Date.now(), last = FC.get(pid); FC.set(pid, t); if (FC.size > 5000) FC.delete(FC.keys().next().value); if (last && t - last < 30 * 60e3) return;
    const cl = v => String(v || '').replace(/[\u0000-\u001f]/g, ' ').trim(), who = cl(name).slice(0, 40) || 'new/unknown visitor', dev = /^(phone|quest|desktop|tablet)$/.test(device) ? device : 'unknown device', m = cl(msg).slice(0, 80);
    const info = sq.prepare('insert into ren_first values(?,?,?,?,?,?)').run(t, pid, who, dev, m, 'pending'), id = info.lastInsertRowid;
    jl({ t, type: 'first-contact', pid, device: dev });
    setImmediate(() => notify({ who, device: dev, time: ptTime(t), event: 'talking to Ren', message: m }).then(x => { try { sq.prepare('update ren_first set notified=? where rowid=?').run(x.ok ? 'sent' : (x.why ? 'skipped' : 'failed'), id) } catch (e) { } }).catch(() => { })) }
  function view(now = Date.now()) { const L = limits(), S = status(now), N = notifyCfg();
    return { now, day: ptDay(now), today: fmt(S.d), month: fmt(S.m), allTime: fmt(sums()), status: S.status,
      caps: { ai: L.ai, dailyUSD: L.dailyUSD, monthlyUSD: L.monthlyUSD, warnPct: L.warnPct, perPlayerHour: L.perPlayerHour, perPlayerDay: L.perPlayerDay, globalPerMin: L.globalPerMin, maxTokens: L.maxTokens },
      prices: L.prices, pricesSource: L.pricesSource || PRICES_SOURCE, configFile: '~/.eear-secrets/ren-limits.json', log: '~/earth-edge-ar/logs/ren-usage.jsonl',
      alerts: all('select t,kind,msg from ren_alerts order by t desc limit 25'),
      top: { today: all("select pid,count(*) requests,round(sum(usd),6) usd,sum(tt) tokens from ren_usage where day=? group by pid order by usd desc,requests desc limit 10", ptDay(now)), month: all("select pid,count(*) requests,round(sum(usd),6) usd,sum(tt) tokens from ren_usage where month=? group by pid order by usd desc,requests desc limit 10", ptDay(now).slice(0, 7)) },
      recent: all('select t,pid,model,status,pt,ct,tt,usd,ms from ren_usage order by t desc limit 30'),
      perHour: one("select count(*) n from ren_usage where t>?", now - 3600e3).n, rateLimitHits: { renSinceStart: RLH, cannedToday: S.d.canned },
      firstContacts: all('select t,who,device,msg,notified from ren_first order by t desc limit 20'),
      notifier: { configured: !!N, mode: N ? N.mode : null, file: '~/.eear-secrets/ren-notify.json', alerts: !!(N && N.alerts), ...NS } } }
  function edit(b) { const L = { ...limits() }, num = (k, lo, hi) => { if (b[k] != null) { const v = +b[k]; if (!isFinite(v) || v < lo || v > hi) throw new Error(`${k} must be ${lo}-${hi}`); L[k] = v } };
    num('dailyUSD', 0, 1000); num('monthlyUSD', 0, 10000); num('warnPct', 1, 100); num('perPlayerHour', 0, 10000); num('perPlayerDay', 0, 100000); num('globalPerMin', 0, 10000); num('maxTokens', 16, 2000);
    if (b.ai != null) { L.ai = !!b.ai; alert('kill-switch', 'Ren AI switched ' + (L.ai ? 'ON' : 'OFF') + ' by GM') }
    if (b.prices && typeof b.prices === 'object') for (const [m, p] of Object.entries(b.prices)) { if (!/^[\w.-]{1,64}$/.test(m) || !p || !['in', 'out'].every(k => isFinite(+p[k]) && +p[k] >= 0)) throw new Error('bad price for ' + m); L.prices = { ...L.prices, [m]: p } }
    fs.writeFileSync(LIM_F, JSON.stringify(L, null, 1), { mode: 0o600 }); LIMM = 0; jl({ t: Date.now(), type: 'caps-edit', caps: { ...L, prices: undefined } }); return view() }
  return { gate, record, firstContact, notify, view, edit, status, limits, ptMidnight, ptDay, ptTime, notifyCfg, NS };
};
